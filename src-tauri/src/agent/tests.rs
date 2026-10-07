use super::model::AgentConfig;

#[test]
fn writes_three_tools_with_independent_sites_and_preserves_existing_settings() {
    let directory =
        std::env::temp_dir().join(format!("kuncode-adapters-test-{}", uuid::Uuid::new_v4()));
    let codex = directory.join("codex");
    let claude = directory.join("claude.json");
    let opencode = directory.join("opencode.json");
    std::fs::create_dir_all(&codex).unwrap();
    std::fs::write(
        codex.join("config.toml"),
        "approval_policy = \"on-request\"\n",
    )
    .unwrap();
    std::fs::write(&claude, "{\"permissions\":{\"allow\":[\"Read\"]}}").unwrap();
    std::fs::write(&opencode, "{\"theme\":\"system\"}").unwrap();
    let config = |id: &str, site: &str| AgentConfig {
        agent_id: id.into(),
        model: "model-with-\"quote".into(),
        base_url: site.into(),
        api_key: format!("sk-test-{id}"),
    };
    super::codex::write_configuration(&codex, &config("codex", "https://one.example/v1")).unwrap();
    super::claude::write_configuration(&claude, &config("claude", "https://two.example")).unwrap();
    super::opencode::write_configuration(
        &opencode,
        &config("opencode", "https://three.example/v1"),
    )
    .unwrap();
    let code: toml::Value =
        toml::from_str(&std::fs::read_to_string(codex.join("config.toml")).unwrap()).unwrap();
    let auth: serde_json::Value =
        serde_json::from_slice(&std::fs::read(codex.join("auth.json")).unwrap()).unwrap();
    assert_eq!(code["approval_policy"].as_str(), Some("on-request"));
    assert_eq!(code["model"].as_str(), Some("model-with-\"quote"));
    assert_eq!(
        code["model_providers"]["kuncode"]["base_url"].as_str(),
        Some("https://one.example/v1")
    );
    assert_eq!(
        code["model_providers"]["kuncode"]["wire_api"].as_str(),
        Some("responses")
    );
    assert_eq!(auth["OPENAI_API_KEY"], "sk-test-codex");
    let claude: serde_json::Value =
        serde_json::from_slice(&std::fs::read(claude).unwrap()).unwrap();
    assert_eq!(claude["permissions"]["allow"][0], "Read");
    assert_eq!(claude["env"]["ANTHROPIC_BASE_URL"], "https://two.example");
    assert_eq!(claude["env"]["ANTHROPIC_AUTH_TOKEN"], "sk-test-claude");
    let opencode: serde_json::Value =
        serde_json::from_slice(&std::fs::read(opencode).unwrap()).unwrap();
    assert_eq!(opencode["theme"], "system");
    assert_eq!(opencode["model"], "kuncode/model-with-\"quote");
    assert_eq!(
        opencode["provider"]["kuncode"]["options"]["baseURL"],
        "https://three.example/v1"
    );
    assert_eq!(
        opencode["provider"]["kuncode"]["options"]["apiKey"],
        "sk-test-opencode"
    );
    std::fs::remove_dir_all(directory).unwrap();
}

#[test]
fn command_resolution_finds_windows_shims_and_falls_back_for_unknown_names() {
    #[cfg(windows)]
    {
        let resolved = super::launch::resolve("cmd");
        assert!(
            resolved.is_absolute(),
            "cmd should resolve to an absolute path"
        );
        assert!(
            resolved
                .extension()
                .is_some_and(|ext| ext.eq_ignore_ascii_case("exe")),
            "cmd should resolve to cmd.exe, got {}",
            resolved.display()
        );
    }
    let missing = super::launch::resolve("kuncode-command-that-does-not-exist");
    assert_eq!(
        missing,
        std::path::PathBuf::from("kuncode-command-that-does-not-exist")
    );
}
