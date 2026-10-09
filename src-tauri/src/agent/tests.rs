use super::model::AgentConfig;

#[test]
fn advanced_models_write_native_capabilities_limits_and_reasoning_and_reset_cleanly() {
    use super::model::{AdvancedConfig, ModelSettings};
    let dir = std::env::temp_dir().join(format!("kuncode-advanced-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let mut config = AgentConfig {
        agent_id: "opencode".into(), model: "vision-model".into(), models: vec!["vision-model".into(), "text-model".into()],
        advanced: AdvancedConfig { models: [
            ("vision-model".into(), ModelSettings { name: Some("视觉模型".into()), image_input: Some(true), reasoning: Some(true), context_window: Some(1048576), max_output_tokens: Some(131072), reasoning_effort: Some("high".into()), options: Some(serde_json::from_value(serde_json::json!({"thinking":{"type":"enabled","budgetTokens":8192}})).unwrap()), variants: Some(serde_json::from_value(serde_json::json!({"fast":{"reasoningEffort":"low"}})).unwrap()), ..Default::default() }),
            ("text-model".into(), ModelSettings { image_input: Some(false), ..Default::default() }),
        ].into() }, base_url: "https://test.example/v1".into(), api_key: "test-secret".into(),
    };
    let path = dir.join("opencode.json");
    super::opencode::write_configuration(&path, &config).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    let vision = &value["provider"]["kuncode"]["models"]["vision-model"];
    assert_eq!(vision["name"], "视觉模型");
    assert_eq!(
        vision["modalities"]["input"],
        serde_json::json!(["text", "image"])
    );
    assert_eq!(vision["reasoning"], true);
    assert_eq!(
        vision["limit"],
        serde_json::json!({"context":1048576,"output":131072})
    );
    assert_eq!(vision["options"]["reasoningEffort"], "high");
    assert_eq!(vision["options"]["thinking"]["budgetTokens"], 8192);
    assert_eq!(vision["variants"]["fast"]["reasoningEffort"], "low");
    assert_eq!(
        value["provider"]["kuncode"]["models"]["text-model"]["modalities"]["input"],
        serde_json::json!(["text"])
    );

    config.advanced = Default::default();
    super::opencode::write_configuration(&path, &config).unwrap();
    let preserved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(
        preserved["provider"]["kuncode"]["models"]["vision-model"],
        *vision
    );
    config.agent_id = "codex".into();
    config.advanced.models = [
        (
            "vision-model".into(),
            ModelSettings {
                reasoning_effort: Some("high".into()),
                context_window: Some(200000),
                ..Default::default()
            },
        ),
        (
            "text-model".into(),
            ModelSettings {
                reasoning_effort: Some("low".into()),
                ..Default::default()
            },
        ),
    ]
    .into();
    super::codex::write_configuration(&dir, &config).unwrap();
    let value: toml::Value =
        toml::from_str(&std::fs::read_to_string(dir.join("config.toml")).unwrap()).unwrap();
    assert_eq!(value["model_reasoning_effort"].as_str(), Some("high"));
    assert_eq!(value["model_context_window"].as_integer(), Some(200000));
    assert_eq!(
        value["profiles"]["kuncode-2"]["model_reasoning_effort"].as_str(),
        Some("low")
    );
    config.advanced = Default::default();
    super::codex::write_configuration(&dir, &config).unwrap();
    let preserved: toml::Value =
        toml::from_str(&std::fs::read_to_string(dir.join("config.toml")).unwrap()).unwrap();
    assert_eq!(preserved["model_reasoning_effort"].as_str(), Some("high"));
    assert_eq!(
        preserved["profiles"]["kuncode-2"]["model_reasoning_effort"].as_str(),
        Some("low")
    );
    config
        .advanced
        .models
        .insert(config.model.clone(), ModelSettings::default());
    super::codex::write_configuration(&dir, &config).unwrap();
    let value: toml::Value =
        toml::from_str(&std::fs::read_to_string(dir.join("config.toml")).unwrap()).unwrap();
    assert!(value.get("model_reasoning_effort").is_none());
    assert!(value.get("model_context_window").is_none());

    config.agent_id = "claude".into();
    config.advanced.models.insert(
        config.model.clone(),
        ModelSettings {
            reasoning_effort: Some("high".into()),
            max_output_tokens: Some(16384),
            thinking_budget: Some(8192),
            ..Default::default()
        },
    );
    let path = dir.join("settings.json");
    super::claude::write_configuration(&path, &config).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(value["effortLevel"], "high");
    assert_eq!(value["env"]["CLAUDE_CODE_EFFORT_LEVEL"], "high");
    assert_eq!(value["env"]["CLAUDE_CODE_MAX_OUTPUT_TOKENS"], "16384");
    assert_eq!(value["env"]["MAX_THINKING_TOKENS"], "8192");
    config.advanced = Default::default();
    super::claude::write_configuration(&path, &config).unwrap();
    let preserved: serde_json::Value =
        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert_eq!(preserved["effortLevel"], "high");
    config
        .advanced
        .models
        .insert(config.model.clone(), ModelSettings::default());
    super::claude::write_configuration(&path, &config).unwrap();
    let value: serde_json::Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
    assert!(value.get("effortLevel").is_none());
    assert!(value["env"].get("MAX_THINKING_TOKENS").is_none());
    std::fs::remove_dir_all(dir).unwrap();
}

#[test]
fn rejects_invalid_advanced_limits_cross_tool_fields_and_secret_metadata() {
    use super::model::{AdvancedConfig, ModelSettings};
    let selected = vec!["model".into()];
    let validate = |agent, settings| {
        AdvancedConfig {
            models: [("model".into(), settings)].into(),
        }
        .validate(agent, &selected)
    };
    assert!(validate(
        "opencode",
        ModelSettings {
            context_window: Some(100),
            ..Default::default()
        }
    )
    .is_err());
    assert!(validate(
        "opencode",
        ModelSettings {
            context_window: Some(100),
            max_output_tokens: Some(101),
            ..Default::default()
        }
    )
    .is_err());
    assert!(validate(
        "codex",
        ModelSettings {
            image_input: Some(true),
            ..Default::default()
        }
    )
    .is_err());
    assert!(validate(
        "claude",
        ModelSettings {
            thinking_budget: Some(512),
            ..Default::default()
        }
    )
    .is_err());
    assert!(validate(
        "claude",
        ModelSettings {
            thinking_budget: Some(0),
            ..Default::default()
        }
    )
    .is_ok());
    assert!(validate(
        "opencode",
        ModelSettings {
            options: Some(
                serde_json::from_value(serde_json::json!({"nested":{"apiKey":"secret"}})).unwrap()
            ),
            ..Default::default()
        }
    )
    .is_err());
    assert!(validate(
        "codex",
        ModelSettings {
            reasoning_effort: Some("invalid".into()),
            ..Default::default()
        }
    )
    .is_err());
    assert!(serde_json::from_value::<AdvancedConfig>(
        serde_json::json!({"models":{"model":{"contextWindow":1.5}}})
    )
    .is_err());
}

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
        advanced: Default::default(),
        agent_id: id.into(),
        model: "model-with-\"quote".into(),
        models: vec!["model-with-\"quote".into(), "second-model".into()],
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
    // Multiple models: Codex gets profiles, OpenCode gets a model map.
    assert_eq!(
        code["profiles"]["kuncode-1"]["model"].as_str(),
        Some("model-with-\"quote")
    );
    assert_eq!(
        code["profiles"]["kuncode-2"]["model"].as_str(),
        Some("second-model")
    );
    assert!(opencode["provider"]["kuncode"]["models"]
        .get("second-model")
        .is_some());
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

#[test]
fn malformed_existing_configs_are_not_overwritten_including_codex_auth() {
    let dir = std::env::temp_dir().join(format!("kuncode-parse-test-{}", uuid::Uuid::new_v4()));
    std::fs::create_dir_all(&dir).unwrap();
    let config = AgentConfig {
        advanced: Default::default(),
        agent_id: "codex".into(),
        model: "model".into(),
        models: vec![],
        base_url: "https://test.example/v1".into(),
        api_key: "secret".into(),
    };
    let toml = dir.join("config.toml");
    let auth = dir.join("auth.json");
    std::fs::write(&toml, "model = \"original\"\n").unwrap();
    std::fs::write(&auth, "{ broken auth").unwrap();
    assert!(super::codex::write_configuration(&dir, &config).is_err());
    assert_eq!(
        std::fs::read_to_string(&toml).unwrap(),
        "model = \"original\"\n"
    );
    assert_eq!(std::fs::read_to_string(&auth).unwrap(), "{ broken auth");
    std::fs::write(&toml, "model = [broken").unwrap();
    assert!(super::codex::write_configuration(&dir, &config).is_err());
    assert_eq!(std::fs::read_to_string(&toml).unwrap(), "model = [broken");
    let path = dir.join("settings.json");
    for text in ["{ broken", "", "[]", "{\"env\":null}"] {
        std::fs::write(&path, text).unwrap();
        assert!(super::claude::write_configuration(&path, &config).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);
    }
    for text in ["{ broken", "", "[]", "{\"provider\":null}"] {
        std::fs::write(&path, text).unwrap();
        assert!(super::opencode::write_configuration(&path, &config).is_err());
        assert_eq!(std::fs::read_to_string(&path).unwrap(), text);
    }
    std::fs::remove_dir_all(dir).unwrap();
}
