use super::*;
use crate::agent::provider::AgentProvider;
use crate::config::{self, BackupFile};

/// Metadata only. Historical secrets stay in the OS credential manager.
#[derive(Clone, Serialize, Deserialize)]
pub struct ToolBackup {
    files: Vec<BackupFile>,
    previous_binding: Option<ToolBinding>,
    credential_reference: String,
    previous_credential: Option<String>,
    previous_tool_key: Option<Option<i64>>,
}

pub(super) struct RemoteToolSnapshot {
    tokens: Vec<http::SiteToken>,
    bound_token: Option<i64>,
}

impl ConnectionService {
    pub(super) fn capture_remote_tool(
        &self,
        connection: &ConnectionSummary,
        agent: &str,
        selected: Option<i64>,
    ) -> AppResult<Option<RemoteToolSnapshot>> {
        if connection.kind != ConnectionKind::KuncodeAuthorized {
            return Ok(None);
        }
        let tokens = self.site_tokens(&connection.id)?;
        let bound_token = tokens
            .iter()
            .find(|token| token.bound_agents.iter().any(|bound| bound == agent))
            .map(|token| token.id);
        let tokens = tokens
            .into_iter()
            .filter(|token| Some(token.id) == bound_token || Some(token.id) == selected)
            .collect();
        Ok(Some(RemoteToolSnapshot {
            tokens,
            bound_token,
        }))
    }

    pub(super) fn compensate_remote_tool(
        &self,
        connection: &ConnectionSummary,
        agent: &str,
        snapshot: &RemoteToolSnapshot,
    ) -> AppResult<()> {
        let (secret, context) = self.site_connection(connection)?;
        let client = SiteClient::new()?;
        let mut failed = false;
        if let Some(token) = snapshot
            .tokens
            .iter()
            .find(|token| Some(token.id) == snapshot.bound_token)
        {
            failed |= client.request(reqwest::Method::PUT, &format!("{}/api/desktop/tools/{agent}", connection.site_url), Some(&secret), None,
                Some(json!({"token_id": token.id, "group": token.group, "models": token.model_limits}))).is_err();
        }
        // Rebinding can itself change limits. Restore each affected key's exact old limits last.
        for token in &snapshot.tokens {
            failed |= client
                .update_site_token(
                    &SiteConnection {
                        site: &connection.site_url,
                        secret: &secret,
                        user_id: context.user_id,
                        desktop: context.desktop,
                    },
                    token.id,
                    &token.name,
                    &token.group,
                    if token.model_limits_enabled {
                        &token.model_limits
                    } else {
                        &[]
                    },
                )
                .is_err();
        }
        if failed {
            Err(AppError::Other(
                "远端密钥权限或工具绑定恢复未完成，请在站点核对后重试；本机已尝试回滚".into(),
            ))
        } else {
            Ok(())
        }
    }

    /// Caller holds `operation`; files, vault and metadata commit together.
    pub(super) fn commit_configuration(
        &self,
        provider: &dyn AgentProvider,
        config: &AgentConfig,
        connection: &ConnectionSummary,
        binding: ToolBinding,
        rebuild: bool,
        progress: &mut dyn FnMut(&str),
    ) -> AppResult<()> {
        if !rebuild {
            provider.validate_existing()?;
        }
        let originals = config::capture_files(&provider.configuration_paths())?;
        let reference = connection.tool_reference(provider.id());
        let old_secret = vault::get_optional(&reference)?;
        let files = config::backup_snapshots(&originals)?;
        let snapshot_reference = old_secret.as_ref().map(|_| {
            vault::reference(
                "backup",
                &Uuid::new_v4().to_string(),
                &connection.api_base_url,
            )
        });
        if let (Some(snapshot), Some(secret)) = (&snapshot_reference, &old_secret) {
            if let Err(error) = vault::put(snapshot, secret) {
                config::discard_backups(&files);
                return Err(error);
            }
        }
        let operation = (|| {
            progress("备份原配置");
            if rebuild {
                let empty: Vec<_> = originals
                    .iter()
                    .map(|file| config::FileSnapshot {
                        path: file.path.clone(),
                        bytes: None,
                    })
                    .collect();
                config::restore_snapshots(&empty)?;
            }
            provider.configure(config)?;
            progress("写入配置");
            vault::put(&reference, &config.api_key)?;
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            let previous = state.clone();
            let backup = ToolBackup {
                files: files.clone(),
                previous_binding: state.bindings.get(provider.id()).cloned(),
                credential_reference: reference.clone(),
                previous_credential: snapshot_reference.clone(),
                previous_tool_key: state.tool_keys.get(&reference).copied(),
            };
            state
                .backups
                .entry(provider.id().into())
                .or_default()
                .push(backup);
            state.tool_keys.insert(reference.clone(), binding.token_id);
            state.bindings.insert(provider.id().into(), binding);
            if let Err(error) = self.save(&state) {
                *state = previous;
                return Err(error);
            }
            Ok(())
        })();
        if let Err(error) = operation {
            let files_restored = config::restore_snapshots(&originals);
            let secret_restored = vault::restore(&reference, old_secret.as_deref());
            if files_restored.is_err() || secret_restored.is_err() {
                // Keep all recovery material when rollback could not complete.
                return Err(AppError::Other(format!(
                    "{error}；回滚未完成，请保留配置备份并重试恢复；凭据恢复{}，文件恢复{}",
                    if secret_restored.is_ok() {
                        "成功"
                    } else {
                        "失败"
                    },
                    if files_restored.is_ok() {
                        "成功"
                    } else {
                        "失败"
                    }
                )));
            }
            config::discard_backups(&files);
            if let Some(snapshot) = snapshot_reference {
                let _ = vault::delete(&snapshot);
            }
            return Err(error);
        }
        Ok(())
    }

    pub(super) fn restore_configuration(
        &self,
        provider: &dyn AgentProvider,
    ) -> AppResult<RestoreOutcome> {
        let stored = self
            .state
            .lock()
            .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
            .backups
            .get(provider.id())
            .and_then(|items| items.last())
            .cloned();
        let paths = provider.configuration_paths();
        let backup = match stored {
            Some(backup) => backup,
            None if paths.len() == 1 => {
                let path = &paths[0];
                let backup = config::latest_backup(path)?
                    .ok_or_else(|| AppError::NotFound("可恢复的完整备份".into()))?;
                let binding = self
                    .state
                    .lock()
                    .map_err(|_| AppError::Other("连接状态暂不可用".into()))?
                    .bindings
                    .get(provider.id())
                    .cloned()
                    .ok_or_else(|| AppError::NotFound("工具绑定".into()))?;
                ToolBackup {
                    files: vec![BackupFile {
                        original: path.clone(),
                        backup: Some(backup),
                    }],
                    previous_binding: None,
                    credential_reference: self
                        .connection(&binding.connection_id)?
                        .tool_reference(provider.id()),
                    previous_credential: None,
                    previous_tool_key: None,
                }
            }
            None => {
                return Err(AppError::NotFound(
                    "完整备份清单；旧版多文件备份需手动核对，未修改任何文件".into(),
                ))
            }
        };
        // Validate and read the entire batch and secret before touching current files.
        let target = config::load_backup_set(&backup.files, &paths)?;
        let old = config::capture_files(&paths)?;
        let target_secret = backup
            .previous_credential
            .as_ref()
            .map(|reference| vault::get(reference))
            .transpose()?;
        let current_secret = vault::get_optional(&backup.credential_reference)?;
        let operation = (|| {
            config::restore_snapshots(&target)?;
            vault::restore(&backup.credential_reference, target_secret.as_deref())?;
            let mut state = self
                .state
                .lock()
                .map_err(|_| AppError::Other("连接状态暂不可用".into()))?;
            let previous = state.clone();
            match &backup.previous_binding {
                Some(binding) => {
                    state.bindings.insert(provider.id().into(), binding.clone());
                }
                None => {
                    state.bindings.remove(provider.id());
                }
            }
            match backup.previous_tool_key {
                Some(id) => {
                    state
                        .tool_keys
                        .insert(backup.credential_reference.clone(), id);
                }
                None => {
                    state.tool_keys.remove(&backup.credential_reference);
                }
            }
            if let Some(items) = state.backups.get_mut(provider.id()) {
                items.pop();
            }
            if let Err(error) = self.save(&state) {
                *state = previous;
                return Err(error);
            }
            Ok(())
        })();
        if let Err(error) = operation {
            let files_restored = config::restore_snapshots(&old);
            let secret_restored =
                vault::restore(&backup.credential_reference, current_secret.as_deref());
            if files_restored.is_err() || secret_restored.is_err() {
                return Err(AppError::Other(format!(
                    "{error}；恢复未完成且回滚失败，完整备份仍保留，请检查文件权限和凭据管理器"
                )));
            }
            return Err(error);
        }
        // Keep disk backups for manual recovery, delete the consumed vault snapshot.
        if let Some(reference) = &backup.previous_credential {
            let _ = vault::delete(reference);
        }
        Ok(RestoreOutcome {
            agent_id: provider.id().into(),
            restored: target
                .iter()
                .filter(|file| file.bytes.is_some())
                .map(|file| file.path.display().to_string())
                .collect(),
            removed: target
                .iter()
                .filter(|file| file.bytes.is_none())
                .map(|file| file.path.display().to_string())
                .collect(),
            missing: Vec::new(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::env::ToolStatus;

    struct TemporaryProvider {
        paths: Vec<PathBuf>,
        fail_after_write: bool,
    }
    impl AgentProvider for TemporaryProvider {
        fn id(&self) -> &'static str {
            "codex"
        }
        fn name(&self) -> &'static str {
            "Test CLI"
        }
        fn description(&self) -> &'static str {
            "Test"
        }
        fn detect(&self) -> ToolStatus {
            ToolStatus {
                id: self.id().into(),
                name: self.name().into(),
                installed: true,
                version: None,
                path: None,
            }
        }
        fn config_path(&self) -> Option<PathBuf> {
            self.paths.first().cloned()
        }
        fn configuration_paths(&self) -> Vec<PathBuf> {
            self.paths.clone()
        }
        fn get_config(&self) -> AppResult<Option<String>> {
            Ok(None)
        }
        fn preview(&self, _: &AgentConfig) -> AppResult<ConfigPreview> {
            Err(AppError::Other("unused".into()))
        }
        fn configure(&self, config: &AgentConfig) -> AppResult<()> {
            config::atomic_write(&self.paths[0], &json!({"model": config.model}).to_string())?;
            if self.fail_after_write {
                return Err(AppError::Io("injected second-file failure".into()));
            }
            config::atomic_write(
                &self.paths[1],
                &json!({"api_key": config.api_key}).to_string(),
            )
        }
        fn configuration_matches(&self, _: &AgentConfig) -> AppResult<bool> {
            Ok(true)
        }
        fn launch(&self) -> AppResult<String> {
            Err(AppError::Other("unused".into()))
        }
    }

    fn scene() -> (ConnectionService, TemporaryProvider, ConnectionSummary) {
        let dir = std::env::temp_dir().join(format!("kuncode-transaction-{}", Uuid::new_v4()));
        let service = ConnectionService::new(dir.clone()).unwrap();
        let provider = TemporaryProvider {
            paths: vec![dir.join("config.json"), dir.join("auth.json")],
            fail_after_write: false,
        };
        std::fs::write(&provider.paths[0], "{\"original\":true}").unwrap();
        let connection = ConnectionSummary {
            id: Uuid::new_v4().to_string(),
            kind: ConnectionKind::ApiKey,
            site_url: "https://test.example".into(),
            api_base_url: "https://test.example/v1".into(),
            account: None,
            alias: None,
            note: None,
            user_id: None,
            legacy_user_id: None,
            expires_at: None,
            connected: true,
            verified: true,
        };
        service
            .state
            .lock()
            .unwrap()
            .connections
            .push(connection.clone());
        (service, provider, connection)
    }

    fn commit(
        service: &ConnectionService,
        provider: &TemporaryProvider,
        connection: &ConnectionSummary,
        model: &str,
        key: &str,
    ) -> AppResult<()> {
        commit_mode(service, provider, connection, model, key, false)
    }

    fn commit_mode(
        service: &ConnectionService,
        provider: &TemporaryProvider,
        connection: &ConnectionSummary,
        model: &str,
        key: &str,
        rebuild: bool,
    ) -> AppResult<()> {
        let config = agent_config(connection, provider.id(), model, &[], key)?;
        let binding = ToolBinding {
            agent_id: provider.id().into(),
            connection_id: connection.id.clone(),
            model: model.into(),
            models: vec![model.into()],
            group: None,
            token_id: Some(7),
            status: "ready".into(),
            verified: true,
            inference_verified: false,
        };
        service.commit_configuration(provider, &config, connection, binding, rebuild, &mut |_| {})
    }

    #[test]
    fn failed_rebind_restores_files_vault_and_binding_and_removes_new_files() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, mut provider, connection) = scene();
        let reference = connection.tool_reference(provider.id());
        // Failure on first-ever configure must also remove a newly created file.
        std::fs::remove_file(&provider.paths[0]).unwrap();
        provider.fail_after_write = true;
        assert!(commit(&service, &provider, &connection, "first", "first-secret").is_err());
        assert!(!provider.paths[0].exists());
        assert!(vault::get_optional(&reference).unwrap().is_none());
        provider.fail_after_write = false;
        commit(&service, &provider, &connection, "old", "old-secret").unwrap();
        let before = serde_json::to_value(service.snapshot().unwrap()).unwrap();
        let files = config::capture_files(&provider.paths).unwrap();
        provider.fail_after_write = true;
        assert!(commit(&service, &provider, &connection, "new", "new-secret").is_err());
        assert_eq!(vault::get(&reference).unwrap(), "old-secret");
        assert_eq!(
            serde_json::to_value(service.snapshot().unwrap()).unwrap(),
            before
        );
        for file in files {
            assert_eq!(std::fs::read(file.path).unwrap(), file.bytes.unwrap());
        }
        provider.fail_after_write = false;
        service.restore_configuration(&provider).unwrap();
        std::fs::remove_dir_all(service.directory).unwrap();
    }

    #[test]
    fn metadata_save_failure_rolls_back_new_credential_and_files() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, provider, connection) = scene();
        commit(&service, &provider, &connection, "old", "old-secret").unwrap();
        let before = std::fs::read(service.directory.join("connections.json")).unwrap();
        std::fs::create_dir(service.directory.join("connections.tmp")).unwrap();
        assert!(commit(&service, &provider, &connection, "new", "new-secret").is_err());
        assert_eq!(
            std::fs::read(service.directory.join("connections.json")).unwrap(),
            before
        );
        assert_eq!(service.snapshot().unwrap().bindings["codex"].model, "old");
        assert_eq!(
            vault::get(&connection.tool_reference("codex")).unwrap(),
            "old-secret"
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&std::fs::read(&provider.paths[0]).unwrap()).unwrap()
                ["model"],
            "old"
        );
        std::fs::remove_dir(service.directory.join("connections.tmp")).unwrap();
        service.restore_configuration(&provider).unwrap();
        std::fs::remove_dir_all(service.directory).unwrap();
    }

    #[test]
    fn complete_batches_survive_restart_restore_prior_binding_and_remove_new_files() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, provider, connection) = scene();
        commit(&service, &provider, &connection, "old", "old-secret").unwrap();
        commit(&service, &provider, &connection, "new", "new-secret").unwrap();
        let metadata = std::fs::read_to_string(service.directory.join("connections.json")).unwrap();
        assert!(!metadata.contains("old-secret") && !metadata.contains("new-secret"));
        let service = ConnectionService::new(service.directory.clone()).unwrap();
        service.restore_configuration(&provider).unwrap();
        assert_eq!(service.snapshot().unwrap().bindings["codex"].model, "old");
        assert_eq!(
            vault::get(&connection.tool_reference("codex")).unwrap(),
            "old-secret"
        );
        let outcome = service.restore_configuration(&provider).unwrap();
        assert_eq!(
            outcome.removed,
            vec![provider.paths[1].display().to_string()]
        );
        assert!(!provider.paths[1].exists());
        assert_eq!(
            std::fs::read_to_string(&provider.paths[0]).unwrap(),
            "{\"original\":true}"
        );
        assert!(service.snapshot().unwrap().bindings.is_empty());
        assert!(vault::get_optional(&connection.tool_reference("codex"))
            .unwrap()
            .is_none());
        std::fs::remove_dir_all(service.directory).unwrap();
    }

    #[test]
    fn missing_backup_member_does_not_restore_any_file_or_remove_binding() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, provider, connection) = scene();
        commit(&service, &provider, &connection, "old", "old-secret").unwrap();
        commit(&service, &provider, &connection, "new", "new-secret").unwrap();
        let backup = service.state.lock().unwrap().backups["codex"]
            .last()
            .unwrap()
            .files[1]
            .backup
            .clone()
            .unwrap();
        let bytes = std::fs::read(&backup).unwrap();
        std::fs::remove_file(&backup).unwrap();
        assert!(service.restore_configuration(&provider).is_err());
        assert_eq!(service.snapshot().unwrap().bindings["codex"].model, "new");
        assert_eq!(
            vault::get(&connection.tool_reference("codex")).unwrap(),
            "new-secret"
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&std::fs::read(&provider.paths[0]).unwrap()).unwrap()
                ["model"],
            "new"
        );
        std::fs::write(backup, bytes).unwrap();
        service.restore_configuration(&provider).unwrap();
        service.restore_configuration(&provider).unwrap();
        std::fs::remove_dir_all(service.directory).unwrap();
    }

    #[test]
    fn restore_save_failure_keeps_current_files_vault_binding_and_backup_batch() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, provider, connection) = scene();
        commit(&service, &provider, &connection, "old", "old-secret").unwrap();
        commit(&service, &provider, &connection, "new", "new-secret").unwrap();
        std::fs::create_dir(service.directory.join("connections.tmp")).unwrap();
        assert!(service.restore_configuration(&provider).is_err());
        assert_eq!(service.snapshot().unwrap().bindings["codex"].model, "new");
        assert_eq!(
            vault::get(&connection.tool_reference("codex")).unwrap(),
            "new-secret"
        );
        assert_eq!(
            serde_json::from_slice::<Value>(&std::fs::read(&provider.paths[0]).unwrap()).unwrap()
                ["model"],
            "new"
        );
        assert_eq!(service.state.lock().unwrap().backups["codex"].len(), 2);
        std::fs::remove_dir(service.directory.join("connections.tmp")).unwrap();
        service.restore_configuration(&provider).unwrap();
        service.restore_configuration(&provider).unwrap();
        std::fs::remove_dir_all(service.directory).unwrap();
    }

    #[test]
    fn remote_compensation_restores_original_binding_and_attempts_all_affected_keys() {
        let _lock = crate::connections::tests::keyring_lock();
        for status in [200, 503] {
            let (site, server) = crate::connections::tests::serve(vec![
                (
                    200,
                    json!({"data":{"items":[
                        {"id":1,"name":"original","group":"old-group","model_limits_enabled":true,"model_limits":["old-model"],"bound_agents":["codex"]},
                        {"id":2,"name":"selected","group":"other-group","model_limits_enabled":false,"model_limits":[],"bound_agents":[]}
                    ]}}),
                ),
                (status, json!({"success":status == 200})),
                (200, json!({"success":true})),
                (200, json!({"success":true})),
            ]);
            let (service, _, mut connection) = scene();
            connection.kind = ConnectionKind::KuncodeAuthorized;
            connection.site_url = site.clone();
            connection.api_base_url = format!("{site}/v1");
            service
                .store_connection(connection.clone(), "management-test-secret")
                .unwrap();
            let snapshot = service
                .capture_remote_tool(&connection, "codex", Some(2))
                .unwrap()
                .unwrap();
            assert_eq!(snapshot.bound_token, Some(1));
            assert_eq!(snapshot.tokens[0].group, "old-group");
            assert_eq!(snapshot.tokens[0].model_limits, ["old-model"]);
            assert_eq!(
                service
                    .compensate_remote_tool(&connection, "codex", &snapshot)
                    .is_ok(),
                status == 200
            );
            assert_eq!(
                server.join().unwrap(),
                [
                    "GET /api/desktop/keys HTTP/1.1",
                    "PUT /api/desktop/tools/codex HTTP/1.1",
                    "PUT /api/desktop/keys/1 HTTP/1.1",
                    "PUT /api/desktop/keys/2 HTTP/1.1"
                ]
            );
            vault::delete(&connection.credential_reference()).unwrap();
            std::fs::remove_dir_all(service.directory).unwrap();
        }
    }

    #[test]
    fn explicit_rebuild_backs_up_malformed_files_and_can_restore_them() {
        let _lock = crate::connections::tests::keyring_lock();
        let (service, provider, connection) = scene();
        std::fs::write(&provider.paths[0], "{ malformed original").unwrap();
        assert!(commit(&service, &provider, &connection, "new", "new-secret").is_err());
        assert_eq!(
            std::fs::read_to_string(&provider.paths[0]).unwrap(),
            "{ malformed original"
        );
        commit_mode(&service, &provider, &connection, "new", "new-secret", true).unwrap();
        assert_eq!(service.snapshot().unwrap().bindings["codex"].model, "new");
        service.restore_configuration(&provider).unwrap();
        assert_eq!(
            std::fs::read_to_string(&provider.paths[0]).unwrap(),
            "{ malformed original"
        );
        assert!(!provider.paths[1].exists());
        std::fs::remove_dir_all(service.directory).unwrap();
    }
}
