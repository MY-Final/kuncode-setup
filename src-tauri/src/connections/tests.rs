use super::*;

#[test]
fn rejects_remote_http_and_credentials_in_urls() {
    for url in [
        "http://example.com",
        "https://user:secret@example.com",
        "https://example.com?key=secret",
        "https://example.com/#token",
        "file:///tmp/key",
    ] {
        assert!(normalize_url(url).is_err());
    }
    assert_eq!(
        normalize_url("https://example.com/v1/").unwrap(),
        "https://example.com/v1"
    );
    assert!(normalize_url("http://127.0.0.1:1234").is_ok());
}

#[test]
fn callback_requires_exact_state_path_and_single_code() {
    let state = "s".repeat(43);
    let code = "c".repeat(43);
    assert!(login::callback_result(
        &format!("/callback?state={state}&code={code}"),
        1234,
        &state
    )
    .unwrap()
    .is_some());
    for target in [
        format!("/callback?state=wrong&code={code}"),
        format!("/wrong?state={state}&code={code}"),
        format!("/callback?state={state}&state={state}&code={code}"),
        format!("/callback?state={state}&code={code}&code={code}"),
    ] {
        assert!(login::callback_result(&target, 1234, &state)
            .unwrap()
            .is_none());
    }
    assert!(matches!(
        login::callback_result(
            &format!("/callback?state={state}&error=access_denied"),
            1234,
            &state
        ),
        Err(AppError::Cancelled)
    ));
}

#[test]
fn vault_references_do_not_cross_destinations_or_accounts() {
    assert_ne!(
        vault::reference("connection", "account1", "https://one.test"),
        vault::reference("connection", "account1", "https://two.test")
    );
    assert_ne!(
        vault::reference("connection", "account1", "https://one.test"),
        vault::reference("connection", "account2", "https://one.test")
    );
}

#[test]
fn claude_receives_root_and_other_tools_receive_v1() {
    let connection = ConnectionSummary {
        id: "test".into(),
        kind: ConnectionKind::ApiKey,
        site_url: "https://test.example".into(),
        api_base_url: "https://test.example/v1".into(),
        account: None,
        user_id: None,
        legacy_user_id: None,
        expires_at: None,
        connected: true,
        verified: true,
    };
    assert_eq!(
        agent_config(&connection, "claude", "model", "secret")
            .unwrap()
            .base_url,
        "https://test.example"
    );
    assert_eq!(
        agent_config(&connection, "codex", "model", "secret")
            .unwrap()
            .base_url,
        "https://test.example/v1"
    );
}

fn serve(
    responses: Vec<(u16, serde_json::Value)>,
) -> (String, std::thread::JoinHandle<Vec<String>>) {
    use std::io::{Read, Write};
    let listener = std::net::TcpListener::bind(("127.0.0.1", 0)).unwrap();
    let site = format!("http://{}", listener.local_addr().unwrap());
    let worker = std::thread::spawn(move || {
        let mut paths = Vec::new();
        for (status, value) in responses {
            let (mut stream, _) = listener.accept().unwrap();
            stream
                .set_read_timeout(Some(std::time::Duration::from_secs(3)))
                .unwrap();
            let mut received = Vec::new();
            let mut buffer = [0u8; 4096];
            loop {
                let count = stream.read(&mut buffer).unwrap();
                if count == 0 {
                    break;
                }
                received.extend_from_slice(&buffer[..count]);
                if let Some(end) = received.windows(4).position(|bytes| bytes == b"\r\n\r\n") {
                    let headers = String::from_utf8_lossy(&received[..end]);
                    let length = headers
                        .lines()
                        .find_map(|line| {
                            line.to_ascii_lowercase()
                                .strip_prefix("content-length: ")
                                .and_then(|length| length.parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    if received.len() >= end + 4 + length {
                        break;
                    }
                }
            }
            let request = String::from_utf8_lossy(&received);
            paths.push(request.lines().next().unwrap().to_owned());
            let body = value.to_string();
            stream.write_all(format!("HTTP/1.1 {status} Response\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}", body.len()).as_bytes()).unwrap();
        }
        paths
    });
    (site, worker)
}

#[test]
fn modern_creation_returns_key_without_reading_any_other_records() {
    let (site, server) = serve(vec![(
        200,
        json!({"success":true,"data":{"id":7,"key":"sk-test-created-key"}}),
    )]);
    let (id, key) = SiteClient::new()
        .unwrap()
        .create_tool_key(
            &site,
            "test-management-token",
            None,
            "unique-created-record",
            false,
        )
        .unwrap();
    assert_eq!(id, 7);
    assert_eq!(key, "sk-test-created-key");
    assert_eq!(server.join().unwrap(), ["POST /api/token/ HTTP/1.1"]);
}

#[test]
fn legacy_creation_reads_only_the_exact_created_record() {
    let (site, server) = serve(vec![
        (200, json!({"success":true})),
        (
            200,
            json!({"success":true,"data":{"items":[{"id":7,"name":"unique-created-record","key":"sk-***"}]}}),
        ),
        (200, json!({"success":true,"data":{"key":"sk-created-key"}})),
    ]);
    let result = SiteClient::new()
        .unwrap()
        .create_tool_key(
            &site,
            "test-management-token",
            Some(42),
            "unique-created-record",
            false,
        )
        .unwrap();
    assert_eq!(result.0, 7);
    let paths = server.join().unwrap();
    assert_eq!(paths.len(), 3);
    assert!(paths[1].starts_with("GET /api/token/search?keyword=unique-created-record "));
    assert_eq!(paths[2], "POST /api/token/7/key HTTP/1.1");
}

#[test]
fn ambiguous_creation_resume_never_replays_the_create_request() {
    let (site, server) = serve(vec![(200, json!({"success":true,"data":{"items":[]}}))]);
    assert!(matches!(
        SiteClient::new().unwrap().create_tool_key(
            &site,
            "test-management-token",
            None,
            "pending-created-record",
            true
        ),
        Err(AppError::Unsupported(_))
    ));
    assert_eq!(
        server.join().unwrap(),
        ["GET /api/token/search?keyword=pending-created-record HTTP/1.1"]
    );
}

#[test]
fn model_lists_support_management_and_openai_response_formats() {
    let (site, server) = serve(vec![
        (200, json!({"success":true,"data":["model-a","model-b"]})),
        (200, json!({"data":[{"id":"model-c"}]})),
    ]);
    let client = SiteClient::new().unwrap();
    assert_eq!(
        client
            .models(
                &site,
                "test-management-token",
                Some(42),
                true,
                Some("default")
            )
            .unwrap(),
        ["model-a", "model-b"]
    );
    assert_eq!(
        client
            .models(&format!("{site}/v1"), "test-model-key", None, false, None)
            .unwrap(),
        ["model-c"]
    );
    assert_eq!(
        server.join().unwrap(),
        [
            "GET /api/user/models?group=default HTTP/1.1",
            "GET /v1/models HTTP/1.1"
        ]
    );
}

#[test]
fn unavailable_models_are_distinct_from_an_invalid_key() {
    let (site, server) = serve(vec![
        (404, json!({})),
        (401, json!({"message":"must not echo test-model-key"})),
        (403, json!({})),
    ]);
    let client = SiteClient::new().unwrap();
    assert!(matches!(
        client.models(&site, "test-model-key", None, false, None),
        Err(AppError::Unsupported(_))
    ));
    let error = client
        .models(&site, "test-model-key", None, false, None)
        .unwrap_err();
    assert!(matches!(error, AppError::Auth(_)));
    assert!(!error.to_string().contains("test-model-key"));
    assert!(matches!(
        client.models(&site, "test-model-key", None, false, None),
        Err(AppError::Permission(_))
    ));
    server.join().unwrap();
}

#[test]
fn persisted_connections_restore_bindings_and_expiry_does_not_damage_tools() {
    let directory = std::env::temp_dir().join(format!("kuncode-state-test-{}", Uuid::new_v4()));
    let service = ConnectionService::new(directory.clone()).unwrap();
    let installation_id = service.installation_id().unwrap();
    let connection = ConnectionSummary {
        id: "connection-test".into(),
        kind: ConnectionKind::KuncodeAuthorized,
        site_url: KUNCODE_SITE.into(),
        api_base_url: format!("{KUNCODE_SITE}/v1"),
        account: Some("owner".into()),
        user_id: Some(42),
        legacy_user_id: None,
        expires_at: Some(1),
        connected: true,
        verified: true,
    };
    {
        let mut state = service.state.lock().unwrap();
        state.current_official = Some(connection.id.clone());
        state.connections.push(connection);
        state.bindings.insert(
            "codex".into(),
            ToolBinding {
                agent_id: "codex".into(),
                connection_id: "connection-test".into(),
                model: "coding-model".into(),
                token_id: Some(7),
                status: "ready".into(),
                verified: true,
            },
        );
        service.save(&state).unwrap();
    }
    drop(service);
    let restored = ConnectionService::new(directory.clone()).unwrap();
    let snapshot = restored.snapshot().unwrap();
    assert_eq!(restored.installation_id().unwrap(), installation_id);
    assert!(!snapshot.connections[0].connected);
    assert_eq!(snapshot.bindings["codex"].status, "ready");
    let metadata = std::fs::read_to_string(directory.join("connections.json")).unwrap();
    assert!(!metadata.contains("apiKey"));
    assert!(!metadata.contains("credential"));
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn authorization_destination_survives_restart_without_rebinding_tools() {
    let directory = std::env::temp_dir().join(format!("kuncode-address-test-{}", Uuid::new_v4()));
    let service = ConnectionService::new(directory.clone()).unwrap();
    assert_eq!(service.authorization_site().unwrap(), KUNCODE_SITE);
    {
        let mut state = service.state.lock().unwrap();
        state.bindings.insert(
            "codex".into(),
            ToolBinding {
                agent_id: "codex".into(),
                connection_id: "original-connection".into(),
                model: "coding-model".into(),
                token_id: Some(7),
                status: "ready".into(),
                verified: true,
            },
        );
    }
    assert!(service
        .set_authorization_site("http://remote.example")
        .is_err());
    let snapshot = service
        .set_authorization_site(" http://127.0.0.1:3000/ ")
        .unwrap();
    assert_eq!(snapshot.authorization_site, "http://127.0.0.1:3000");
    assert_eq!(
        snapshot.bindings["codex"].connection_id,
        "original-connection"
    );
    *service.attempt.lock().unwrap() =
        Some((Uuid::new_v4().to_string(), Arc::new(AtomicBool::new(false))));
    assert!(service.set_authorization_site(KUNCODE_SITE).is_err());
    drop(service);
    let restored = ConnectionService::new(directory.clone()).unwrap();
    assert_eq!(
        restored.authorization_site().unwrap(),
        "http://127.0.0.1:3000"
    );
    assert_eq!(
        restored.snapshot().unwrap().bindings["codex"].status,
        "ready"
    );
    drop(restored);
    // Metadata written before this setting existed must retain the official default.
    let path = directory.join("connections.json");
    let mut legacy: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    legacy.as_object_mut().unwrap().remove("authorizationSite");
    std::fs::write(path, serde_json::to_vec(&legacy).unwrap()).unwrap();
    let legacy = ConnectionService::new(directory.clone()).unwrap();
    assert_eq!(legacy.authorization_site().unwrap(), KUNCODE_SITE);
    assert_eq!(
        legacy.snapshot().unwrap().bindings["codex"].connection_id,
        "original-connection"
    );
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn browser_authorization_page_must_match_configured_origin_and_path() {
    let site = "http://127.0.0.1:3000";
    assert!(
        login::authorization_url("http://127.0.0.1:3000/desktop/authorize?flow=request", site)
            .is_ok()
    );
    assert!(login::authorization_url(
        "https://example.com/prefix/desktop/authorize?flow=request",
        "https://example.com/prefix"
    )
    .is_ok());
    for address in [
        "http://127.0.0.1:3001/desktop/authorize?flow=request",
        "https://other.example/desktop/authorize?flow=request",
        "http://user@127.0.0.1:3000/desktop/authorize?flow=request",
        "http://127.0.0.1:3000/wrong?flow=request",
        "http://127.0.0.1:3000/desktop/authorize?flow=request#fragment",
    ] {
        assert!(login::authorization_url(address, site).is_err());
    }
}

#[test]
fn cancellation_before_native_worker_starts_prevents_login() {
    let directory = std::env::temp_dir().join(format!("kuncode-cancel-test-{}", Uuid::new_v4()));
    let service = ConnectionService::new(directory.clone()).unwrap();
    let id = Uuid::new_v4().to_string();
    service.cancel_login(&id).unwrap();
    assert!(matches!(service.begin_login(&id), Err(AppError::Cancelled)));
    assert!(service.attempt.lock().unwrap().is_none());
    let next = Uuid::new_v4().to_string();
    let cancelled = service.begin_login(&next).unwrap();
    assert!(service.begin_login(&Uuid::new_v4().to_string()).is_err());
    service.cancel_login(&next).unwrap();
    assert!(cancelled.load(std::sync::atomic::Ordering::SeqCst));
    std::fs::remove_dir_all(directory).unwrap();
}

#[cfg(windows)]
#[test]
fn authorized_logout_targets_original_site_after_setting_changes() {
    let (site, server) = serve(vec![(200, json!({"success":true}))]);
    let directory = std::env::temp_dir().join(format!("kuncode-origin-test-{}", Uuid::new_v4()));
    let service = ConnectionService::new(directory.clone()).unwrap();
    let connection = ConnectionSummary {
        id: Uuid::new_v4().to_string(),
        kind: ConnectionKind::KuncodeAuthorized,
        site_url: site.clone(),
        api_base_url: format!("{site}/v1"),
        account: Some("local owner".into()),
        user_id: Some(42),
        legacy_user_id: None,
        expires_at: None,
        connected: true,
        verified: true,
    };
    let original_reference = connection.credential_reference();
    let connection = service
        .store_connection(connection, "test-original-site-token")
        .unwrap();
    service
        .set_authorization_site("https://other.example")
        .unwrap();
    assert_eq!(
        service.snapshot().unwrap().connections[0].credential_reference(),
        original_reference
    );
    assert!(service.logout(&connection.id).unwrap().is_none());
    assert_eq!(
        server.join().unwrap(),
        ["POST /api/desktop/auth/logout HTTP/1.1"]
    );
    assert!(vault::get(&original_reference).is_err());
    std::fs::remove_dir_all(directory).unwrap();
}

#[cfg(windows)]
#[test]
fn manual_logout_removes_only_local_login_and_preserves_tool_credentials() {
    let directory = std::env::temp_dir().join(format!("kuncode-vault-test-{}", Uuid::new_v4()));
    let service = ConnectionService::new(directory.clone()).unwrap();
    let connection = ConnectionSummary {
        id: Uuid::new_v4().to_string(),
        kind: ConnectionKind::NewapiPat,
        site_url: "https://vault-test.example".into(),
        api_base_url: "https://vault-test.example/v1".into(),
        account: Some("test owner".into()),
        user_id: Some(42),
        legacy_user_id: None,
        expires_at: None,
        connected: true,
        verified: true,
    };
    let connection = service
        .store_connection(connection, "test-management-secret")
        .unwrap();
    let tool_reference = connection.tool_reference("codex");
    vault::put(&tool_reference, "test-tool-secret").unwrap();
    service
        .record_binding(ToolBinding {
            agent_id: "codex".into(),
            connection_id: connection.id.clone(),
            model: "coding-model".into(),
            token_id: Some(7),
            status: "ready".into(),
            verified: true,
        })
        .unwrap();
    assert!(service.logout(&connection.id).unwrap().is_none());
    assert!(vault::get(&connection.credential_reference()).is_err());
    assert_eq!(vault::get(&tool_reference).unwrap(), "test-tool-secret");
    assert_eq!(
        service.snapshot().unwrap().bindings["codex"].status,
        "ready"
    );
    vault::delete(&tool_reference).unwrap();
    std::fs::remove_dir_all(directory).unwrap();
}
