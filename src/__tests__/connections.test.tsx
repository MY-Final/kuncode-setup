import { useState } from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { AppProvider, useApp } from "@/lib/store";
import { ConnectionDialog } from "@/components/connection-dialog";
import { ToolList } from "@/components/tool-list";
import SetupPage from "@/pages/setup";
import SettingsPage from "@/pages/settings";
import { AccountPanel } from "@/components/account-panel";
import { AppShell } from "@/components/layout/app-shell";
import HomePage from "@/pages/home";
import KeysPage from "@/pages/keys";
import ToolDetailPage from "@/pages/tool-detail";
import DiagnosePage from "@/pages/diagnose";
import ShopPage from "@/pages/shop";
import { RebindDialog } from "@/components/rebind-dialog";
import { PreferencesProvider } from "@/lib/preferences";
import type {
  ConnectionSnapshot,
  ConnectionStep,
  ConnectionSummary,
} from "@/lib/types";

const native = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({
  invoke: native.invoke,
  Channel: class {
    onmessage: (step: ConnectionStep) => void = () => undefined;
  },
}));
let snapshot: ConnectionSnapshot;
const official: ConnectionSummary = {
  id: "official-1",
  kind: "kuncode_authorized",
  siteUrl: "https://kuncode.120403.xyz",
  apiBaseUrl: "https://kuncode.120403.xyz/v1",
  account: "owner",
  userId: 1,
  legacyUserId: null,
  expiresAt: 2000000000,
  connected: true,
  verified: true,
};
const other: ConnectionSummary = {
  ...official,
  id: "other-1",
  kind: "api_key",
  siteUrl: "https://other.example",
  apiBaseUrl: "https://other.example/v1",
  account: null,
  userId: null,
  expiresAt: null,
};
const manual: ConnectionSummary = {
  ...official,
  id: "manual-1",
  kind: "newapi_pat",
  siteUrl: "https://other.example",
  apiBaseUrl: "https://other.example/v1",
  account: "manual-owner",
  userId: 9,
  expiresAt: null,
};

beforeEach(() => {
  Object.defineProperty(window, "__TAURI_INTERNALS__", {
    configurable: true,
    value: {},
  });
  snapshot = {
    authorizationSite: "https://kuncode.120403.xyz",
    currentOfficial: null,
    connections: [],
    bindings: {},
  };
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "detect_environment")
      return { os: "Windows", arch: "x86_64", tools: [] };
    if (command === "list_agents")
      return ["codex", "claude", "opencode"].map((id) => ({
        id,
        name:
          id === "codex"
            ? "Codex"
            : id === "claude"
              ? "Claude Code"
              : "OpenCode",
        description: "Coding Agent",
        installed: true,
        version: "test",
        path: null,
      }));
    if (command === "list_connections") return structuredClone(snapshot);
    if (command === "set_authorization_site") {
      snapshot.authorizationSite = args.site;
      return structuredClone(snapshot);
    }
    if (command === "import_connection") {
      snapshot.connections.push(other);
      return other;
    }
    if (command === "connection_models")
      return ["server-model", "second-model"];
    if (command === "list_site_tokens")
      return [
        {
          id: 7,
          name: "site-key",
          maskedKey: "sk-abcd********wxyz",
          group: "default",
          status: 1,
          unlimitedQuota: true,
          remainQuota: 0,
          usedQuota: 0,
          expiredTime: -1,
          accessedTime: 0,
          modelLimitsEnabled: false,
          modelLimits: [],
          boundAgents: [],
        },
      ];
    if (command === "site_groups")
      return [{ name: "default", description: "默认", ratio: 1 }];
    if (command === "group_models") return ["server-model", "second-model"];
    if (command === "preview_connection_config")
      return {
        agentId: args.agentId,
        agentName: "Codex",
        model: args.model,
        baseUrl: other.apiBaseUrl,
        maskedApiKey: "确认后由程序安全获取",
        configPath: "test/config.toml",
        existingConfig: false,
        backupPath: null,
        provider: "other.example",
        changes: [],
      };
    if (command === "apply_connection_config") {
      const binding = {
        agentId: args.agentId,
        connectionId: args.connectionId,
        model: args.selection.model,
        models: args.selection.models,
        advanced: args.selection.advanced,
        tokenId: 7,
        status: "ready" as const,
        verified: true,
      };
      snapshot.bindings[args.agentId] = binding;
      const steps = [
        "检查环境",
        "准备工具凭据",
        "备份原配置",
        "写入配置",
        "检查服务连接",
      ].map((step) => ({ step, status: "complete", detail: null }));
      steps.forEach((step) => args.progress.onmessage(step));
      return { binding, steps };
    }
    if (command === "logout_connection") {
      snapshot.currentOfficial = null;
      snapshot.connections = snapshot.connections.map((connection) =>
        connection.id === args.connectionId
          ? { ...connection, connected: false }
          : connection,
      );
      return null;
    }
    if (command === "connection_shop_url")
      return "https://pay.ldxp.cn/shop/test";
    if (command === "open_connection_shop") return undefined;
    if (command === "connection_profile")
      return {
        connectionId: args.connectionId,
        shopUrl: "https://pay.ldxp.cn/shop/test",
        provider: "newapi",
        kind: "kuncode_authorized",
        siteUrl: official.siteUrl,
        authenticated: true,
        account: "owner",
        username: "owner",
        displayName: "Owner",
        userId: 1,
        email: "owner@example.com",
        role: null,
        group: "default",
        status: "正常",
        balance: 12.5,
        usedQuota: 3.25,
        requestCount: 42,
        quotaDisplayType: "USD",
        currencySymbol: "$",
        quotaPerUnit: 500000,
        memberSince: 1700000000,
        expiresAt: 2000000000,
        connected: true,
      };
    if (command === "check_tool_connection")
      return {
        agentId: args.agentId,
        ok: true,
        reason: "ok",
        needsRebind: false,
        message: "本机配置与站点密钥一致",
      };
    if (command === "restore_tool_config")
      return { agentId: args.agentId, restored: [], missing: [], removed: [] };
    if (command === "rename_connection") {
      snapshot.connections = snapshot.connections.map((connection) =>
        connection.id === args.connectionId
          ? { ...connection, alias: args.alias, note: args.note }
          : connection,
      );
      return snapshot.connections.find((item) => item.id === args.connectionId);
    }
    if (command === "tool_detail")
      return {
        agentId: args.agentId,
        agentName: args.agentId === "codex" ? "Codex" : args.agentId,
        connectionId: official.id,
        connectionLabel: "Owner",
        siteUrl: official.siteUrl,
        baseUrl: official.apiBaseUrl,
        model: "server-model",
        models: ["server-model", "second-model"],
        group: "default",
        tokenId: 7,
        status: "ready",
        verified: true,
        configPaths: ["test/config.toml"],
        configFiles: [
          {
            path: "test/config.toml",
            exists: true,
            content: 'model = "server-model"\napi_key = "sk-••••••••"',
          },
        ],
      };
    if (command === "reveal_site_token_key") return "sk-revealed-key";
    if (command === "ping_connection") return 42;
    if (command === "probe_tool_connection")
      return { ok: true, message: "已检查模型列表", latencyMs: 1 };
    if (command === "launch_agent") return "已启动";
    if (command === "cancel_login") return undefined;
    throw new Error(`Unexpected native command: ${command}`);
  });
});
afterEach(() => {
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

function ConnectHarness() {
  const [open, setOpen] = useState(true);
  const { connections, session } = useApp();
  return (
    <>
      <ConnectionDialog open={open} onOpenChange={setOpen} />
      <span>账户：{session?.account ?? "未登录"}</span>
      <span>服务连接：{connections.length}</span>
    </>
  );
}
it("API Key 导入只建立服务连接，凭据不会留在输入框或前端存储", async () => {
  const user = userEvent.setup();
  render(
    <AppProvider>
      <ConnectHarness />
    </AppProvider>,
  );
  await user.click(screen.getByRole("button", { name: "连接其他站点" }));
  await user.click(screen.getByLabelText("API Key"));
  await user.clear(screen.getByLabelText("站点地址"));
  await user.type(screen.getByLabelText("站点地址"), "https://other.example");
  await user.type(
    screen.getByLabelText("API Key", { selector: "input[type=password]" }),
    "manual-test-key",
  );
  await user.click(screen.getByRole("button", { name: "连接站点" }));
  expect(await screen.findByText("服务连接：1")).toBeInTheDocument();
  expect(screen.getByText("账户：未登录")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("manual-test-key")).not.toBeInTheDocument();
  expect(JSON.stringify(localStorage)).not.toContain("manual-test-key");
});

it("取消浏览器登录后忽略迟到的授权结果", async () => {
  let complete!: (connection: ConnectionSummary) => void;
  const base = native.invoke.getMockImplementation()!;
  native.invoke.mockImplementation((command, args) =>
    command === "start_login"
      ? new Promise<ConnectionSummary>((resolve) => {
          complete = resolve;
          args.progress.onmessage({
            step: "等待在浏览器中确认",
            status: "running",
            detail: null,
          });
        })
      : base(command, args),
  );
  render(
    <AppProvider>
      <ConnectHarness />
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "登录 KunCode" }));
  await user.click(await screen.findByRole("button", { name: "取消登录" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  complete(official);
  await waitFor(() =>
    expect(screen.getByText("账户：未登录")).toBeInTheDocument(),
  );
  expect(native.invoke).toHaveBeenCalledWith(
    "cancel_login",
    expect.objectContaining({ attemptId: expect.any(String) }),
  );
});

it("真实配置使用服务器模型，预览不创建密钥，确认后才写入", async () => {
  snapshot.connections.push(other);
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/setup/codex"]}>
        <Routes>
          <Route path="/setup/:agent" element={<SetupPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: /other.example/ }));
  await user.click(screen.getByRole("button", { name: "使用此连接" }));
  // 多选：默认勾选第一个模型，再手动勾选第二个。
  await user.click(
    await screen.findByRole("checkbox", { name: "second-model" }),
  );
  await user.click(await screen.findByRole("button", { name: "下一步" }));
  expect(await screen.findByText("确认配置")).toBeInTheDocument();
  expect(
    native.invoke.mock.calls.some(
      ([command]) => command === "apply_connection_config",
    ),
  ).toBe(false);
  expect(screen.queryByText("GPT-5.6 Luna")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "配置 Codex" }));
  expect(
    await screen.findByRole("heading", { name: "Codex 配置完成" }),
  ).toBeInTheDocument();
  expect(snapshot.bindings.codex.connectionId).toBe(other.id);
  expect(snapshot.bindings.codex.model).toBe("server-model");
  expect(snapshot.bindings.codex.models).toEqual([
    "server-model",
    "second-model",
  ]);
  expect(
    native.invoke.mock.calls.some(
      ([command]) => command === "list_site_tokens",
    ),
  ).toBe(false);
});

it("新账户快速配置跳过密钥管理，确认后才创建或复用专用密钥", async () => {
  snapshot.connections.push(official);
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "list_site_tokens") return [];
    return base!(command, args);
  });
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/setup/codex"]}>
        <Routes>
          <Route path="/setup/:agent" element={<SetupPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "快速配置" }));
  await screen.findByRole("checkbox", { name: "server-model" });
  await user.click(await screen.findByRole("button", { name: "下一步" }));
  expect(await screen.findByText("确认配置")).toBeInTheDocument();
  expect(
    native.invoke.mock.calls.some(([command]) =>
      [
        "list_site_tokens",
        "create_site_token",
        "apply_connection_config",
      ].includes(command),
    ),
  ).toBe(false);
  await user.click(screen.getByRole("button", { name: "配置 Codex" }));
  expect(
    await screen.findByRole("heading", { name: "Codex 配置完成" }),
  ).toBeInTheDocument();
  const args = native.invoke.mock.calls.find(
    ([command]) => command === "apply_connection_config",
  )![1];
  expect(args.selection.tokenId).toBeNull();
  expect(args.selection.group).toBeNull();
});

it("换绑返回配置异常时保留弹窗并显示错误，不触发成功回调", async () => {
  snapshot.connections.push(official);
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    group: "default",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  const onDone = vi.fn();
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "apply_connection_config")
      return {
        binding: { status: "error", verified: false },
        steps: [
          { step: "检查服务连接", status: "error", detail: "工具密钥无效" },
        ],
      };
    return base!(command, args);
  });
  function Harness() {
    const { agents, loading } = useApp();
    return loading ? null : (
      <RebindDialog
        agent={agents[0]}
        onOpenChange={() => undefined}
        onDone={onDone}
      />
    );
  }
  render(
    <AppProvider>
      <Harness />
    </AppProvider>,
  );
  const user = userEvent.setup();
  const submit = await screen.findByRole("button", { name: "换绑密钥" });
  await waitFor(() => expect(submit).toBeEnabled());
  await user.click(submit);
  expect(await screen.findByRole("alert")).toHaveTextContent("工具密钥无效");
  expect(screen.getByRole("dialog")).toBeInTheDocument();
  expect(onDone).not.toHaveBeenCalled();
});

it("诊断不会把不支持模型列表的未验证连接显示为通过", async () => {
  snapshot.connections.push(official);
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: false,
  };
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "probe_tool_connection")
      return {
        ok: false,
        latencyMs: null,
        message: "此站点不提供模型列表，实际调用尚未验证",
      };
    return base!(command, args);
  });
  render(
    <AppProvider>
      <DiagnosePage />
    </AppProvider>,
  );
  const user = userEvent.setup();
  const button = await screen.findByRole("button", { name: "检查模型列表" });
  await waitFor(() => expect(button).toBeEnabled());
  await user.click(button);
  expect(await screen.findByText("未通过")).toBeInTheDocument();
  expect(
    native.invoke.mock.calls.some(
      ([command]) => command === "test_tool_inference",
    ),
  ).toBe(false);
});

it("实际调用只在用户确认后执行，并显示 Streaming 测试结果", async () => {
  snapshot.connections.push(official);
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: false,
  };
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "test_tool_inference")
      return {
        ok: true,
        latencyMs: 1,
        message: "默认模型实际调用及 Streaming 已通过",
      };
    return base!(command, args);
  });
  render(
    <AppProvider>
      <DiagnosePage />
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "测试 Codex 实际调用" }),
  );
  expect(
    native.invoke.mock.calls.some(
      ([command]) => command === "test_tool_inference",
    ),
  ).toBe(false);
  await user.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "开始测试",
    }),
  );
  expect(
    await screen.findByText("默认模型实际调用及 Streaming 已通过"),
  ).toBeInTheDocument();
  expect(native.invoke).toHaveBeenCalledWith("test_tool_inference", {
    agentId: "codex",
  });
});

it("损坏配置仅在单独确认重建后才重置", async () => {
  snapshot.connections.push(other);
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "apply_connection_config" && !args.selection.rebuild) {
      throw { kind: "parse", message: "原配置无法解析，文件未修改" };
    }
    return base!(command, args);
  });
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/setup/codex"]}>
        <Routes>
          <Route path="/setup/:agent" element={<SetupPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "使用此连接" }));
  await screen.findByRole("checkbox", { name: "server-model" });
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await user.click(await screen.findByRole("button", { name: "配置 Codex" }));
  await user.click(
    await screen.findByRole("button", { name: "备份并重建配置" }),
  );
  const calls = () =>
    native.invoke.mock.calls.filter(
      ([command]) => command === "apply_connection_config",
    );
  expect(calls()).toHaveLength(1);
  expect(calls()[0][1].selection.rebuild).toBe(false);
  expect(screen.getByRole("dialog")).toHaveTextContent(
    "原有设置和登录信息将被重置",
  );
  await user.click(screen.getByRole("button", { name: "确认备份并重建" }));
  expect(
    await screen.findByRole("heading", { name: "Codex 配置完成" }),
  ).toBeInTheDocument();
  expect(calls()).toHaveLength(2);
  expect(calls()[1][1].selection.rebuild).toBe(true);
});

it("首页 Dashboard 展示账户余额与工具配置进度", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  render(
    <AppProvider>
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/shop/:connectionId" element={<ShopPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("账户余额")).toBeInTheDocument();
  expect(await screen.findByText("$12.50")).toBeInTheDocument();
  expect(screen.getByText("工具配置")).toBeInTheDocument();
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
  expect(screen.getByText("1 个工具已配置")).toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "去小铺充值" }));
  expect(await screen.findByTitle("小铺")).toHaveAttribute(
    "src",
    "https://pay.ldxp.cn/shop/test",
  );
  expect(native.invoke).toHaveBeenCalledWith("connection_shop_url", {
    connectionId: official.id,
  });
  expect(native.invoke).not.toHaveBeenCalledWith(
    "open_connection_shop",
    expect.anything(),
  );
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "在浏览器打开" }));
  expect(native.invoke).toHaveBeenCalledWith("open_connection_shop", {
    connectionId: official.id,
  });
  await userEvent.setup().click(screen.getByRole("button", { name: "返回" }));
  expect(await screen.findByText("$12.50")).toBeInTheDocument();
});

it("小铺刷新读取新地址，后台清空地址后显示错误并支持重试", async () => {
  const base = native.invoke.getMockImplementation();
  let shopUrl: string | null = "https://shop.example/first";
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "connection_shop_url") {
      if (!shopUrl)
        throw { message: "站点未配置有效的小铺地址，请刷新账户信息" };
      return shopUrl;
    }
    return base!(command, args);
  });
  render(
    <MemoryRouter initialEntries={["/shop/other-connection"]}>
      <Routes>
        <Route path="/shop/:connectionId" element={<ShopPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const user = userEvent.setup();
  expect(await screen.findByTitle("小铺")).toHaveAttribute("src", shopUrl);
  shopUrl = "https://shop.example/current";
  await user.click(screen.getByRole("button", { name: "刷新小铺" }));
  await waitFor(() =>
    expect(screen.getByTitle("小铺")).toHaveAttribute("src", shopUrl),
  );
  shopUrl = null;
  await user.click(screen.getByRole("button", { name: "刷新小铺" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "站点未配置有效的小铺地址",
  );
  expect(screen.queryByTitle("小铺")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "在浏览器打开" })).toBeDisabled();
  shopUrl = "https://shop.example/restored";
  await user.click(screen.getByRole("button", { name: "刷新小铺" }));
  expect(await screen.findByTitle("小铺")).toHaveAttribute("src", shopUrl);
  expect(native.invoke).toHaveBeenCalledWith("connection_shop_url", {
    connectionId: "other-connection",
  });
});

it("服务端清空小铺地址后刷新账户隐藏充值入口，余额保持可见", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  const base = native.invoke.getMockImplementation();
  let shopUrl: string | null = "https://pay.ldxp.cn/shop/test";
  native.invoke.mockImplementation(async (command, args) => {
    const result = await base!(command, args);
    return command === "connection_profile" ? { ...result, shopUrl } : result;
  });
  render(
    <AppProvider>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </AppProvider>,
  );
  await screen.findByRole("button", { name: "去小铺充值" });
  shopUrl = null;
  await userEvent.setup().click(screen.getByRole("button", { name: "刷新" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "去小铺充值" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getByText("$12.50")).toBeInTheDocument();
});

it("首页对低额度账户给出预警", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "connection_profile")
      return {
        connectionId: args.connectionId,
        provider: "newapi",
        kind: "kuncode_authorized",
        siteUrl: official.siteUrl,
        authenticated: true,
        account: "owner",
        username: "owner",
        displayName: "Owner",
        userId: 1,
        email: null,
        role: null,
        group: "default",
        status: "正常",
        balance: 0.2,
        usedQuota: 3,
        requestCount: 1,
        quotaDisplayType: "USD",
        currencySymbol: "$",
        quotaPerUnit: 500000,
        memberSince: null,
        expiresAt: null,
        connected: true,
      };
    return base!(command, args);
  });
  render(
    <AppProvider>
      <MemoryRouter>
        <HomePage />
      </MemoryRouter>
    </AppProvider>,
  );
  expect(
    await screen.findByText("额度偏低，建议及时充值以免影响使用。"),
  ).toBeInTheDocument();
});

it("删除被引用的密钥前提示引用数量", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/keys"]}>
        <Routes>
          <Route path="/keys" element={<KeysPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  const remove = await screen.findAllByText("删除");
  await user.click(remove[remove.length - 1]);
  expect(await screen.findByText("删除密钥「site-key」？")).toBeInTheDocument();
});

it("密钥编辑弹窗的分组下拉使用可交互的 shadcn Select", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/keys"]}>
        <Routes>
          <Route path="/keys" element={<KeysPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑" }));
  expect(await screen.findByText("编辑密钥")).toBeInTheDocument();
  // 允许的模型：必须是可切换的 shadcn Checkbox（Radix），而不是原生 input
  const limit = await screen.findByRole("checkbox", { name: "server-model" });
  expect(limit).toHaveAttribute("data-slot", "checkbox");
  await user.click(limit);
  expect(limit).toHaveAttribute("data-state", "checked");
  expect(document.querySelector('input[type="checkbox"]')).toBeNull();
  // 分组：shadcn Select 展开后能看到选项
  const group = await screen.findByRole("combobox", { name: "分组" });
  await user.click(group);
  expect(
    await screen.findByRole("option", { name: "default · 默认" }),
  ).toBeInTheDocument();
});

it("工具详情页展示绑定密钥与脱敏配置", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/tools/codex"]}>
        <Routes>
          <Route path="/tools/:agent" element={<ToolDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  expect(
    await screen.findByRole("heading", { name: "Codex 配置详情" }),
  ).toBeInTheDocument();
  expect(
    await screen.findByText("server-model、second-model"),
  ).toBeInTheDocument();
  expect(screen.getByText("程序写入的配置")).toBeInTheDocument();
  expect(native.invoke).toHaveBeenCalledWith("tool_detail", {
    agentId: "codex",
  });
});

it("密钥中心可一键复制密钥", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/keys"]}>
        <Routes>
          <Route path="/keys" element={<KeysPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup({ writeToClipboard: true });
  const writeText = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockResolvedValue(undefined);
  const copy = await screen.findByRole("button", { name: "复制" });
  await user.click(copy);
  await waitFor(() =>
    expect(writeText).toHaveBeenCalledWith("sk-revealed-key"),
  );
  expect(native.invoke).toHaveBeenCalledWith("reveal_site_token_key", {
    connectionId: official.id,
    tokenId: 7,
  });
});

it("设置页可编辑连接别名与备注", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  snapshot.connections.push(official, other);
  snapshot.currentOfficial = official.id;
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  render(
    <PreferencesProvider>
      <AppProvider>
        <SettingsPage />
      </AppProvider>
    </PreferencesProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "编辑名称" }));
  const alias = await screen.findByLabelText("别名");
  await user.type(alias, "公司账号");
  await user.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() =>
    expect(native.invoke).toHaveBeenCalledWith("rename_connection", {
      connectionId: other.id,
      alias: "公司账号",
      note: null,
    }),
  );
  vi.unstubAllGlobals();
});

function LogoutHarness() {
  const { session, logout } = useApp();
  return (
    <MemoryRouter>
      <button onClick={() => void logout()}>退出账户</button>
      <span>账户：{session?.account ?? "未登录"}</span>
      <ToolList />
    </MemoryRouter>
  );
}
it("退出 Setup 账户保留独立工具绑定并允许继续启动", async () => {
  snapshot.currentOfficial = official.id;
  snapshot.connections.push(official);
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  render(
    <AppProvider>
      <LogoutHarness />
    </AppProvider>,
  );
  expect(await screen.findByText("账户：owner")).toBeInTheDocument();
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "退出账户" }));
  expect(await screen.findByText("账户：未登录")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "启动 Codex" }));
  expect(
    await screen.findByRole("heading", { name: "Codex 已启动" }),
  ).toBeInTheDocument();
  expect(snapshot.bindings.codex.status).toBe("ready");
  expect(native.invoke).toHaveBeenCalledWith("check_tool_connection", {
    agentId: "codex",
  });
});

it("绑定密钥失效时启动前提示换绑，并可直接换绑", async () => {
  snapshot.currentOfficial = official.id;
  snapshot.connections.push(official);
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  const base = native.invoke.getMockImplementation();
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "check_tool_connection")
      return {
        agentId: args.agentId,
        ok: false,
        reason: "key",
        needsRebind: true,
        message: "绑定的密钥已在站点失效或被停用，请换绑其他可用密钥",
      };
    return base!(command, args);
  });
  render(
    <AppProvider>
      <LogoutHarness />
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "启动 Codex" }));
  expect(
    await screen.findByRole("heading", { name: "Codex 的密钥已失效" }),
  ).toBeInTheDocument();
  const dialog = await screen.findByRole("dialog");
  await user.click(within(dialog).getByRole("button", { name: "换绑密钥" }));
  expect(await screen.findByText("换绑 Codex 的密钥")).toBeInTheDocument();
});

it("设置可保存本地授权地址，登录显示新地址且保留已有工具", async () => {
  vi.stubGlobal("matchMedia", () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  }));
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  snapshot.bindings.codex = {
    agentId: "codex",
    connectionId: official.id,
    model: "server-model",
    tokenId: 7,
    status: "ready",
    verified: true,
  };
  render(
    <PreferencesProvider>
      <AppProvider>
        <SettingsPage />
      </AppProvider>
    </PreferencesProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByText("授权服务地址（高级）"));
  const address = await screen.findByLabelText("授权服务根地址");
  await user.clear(address);
  await user.type(address, "http://127.0.0.1:3000");
  await user.click(screen.getByRole("button", { name: "保存地址" }));
  await waitFor(() =>
    expect(snapshot.authorizationSite).toBe("http://127.0.0.1:3000"),
  );
  expect(snapshot.bindings.codex.connectionId).toBe(official.id);
  expect(snapshot.connections[0].siteUrl).toBe(official.siteUrl);
  await user.click(screen.getByRole("button", { name: "连接其他站点" }));
  expect(
    await screen.findByText("授权服务：http://127.0.0.1:3000"),
  ).toBeInTheDocument();
  vi.unstubAllGlobals();
});

it("账户菜单展示站点真实用户信息而不是跳转设置", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  render(
    <AppProvider>
      <MemoryRouter>
        <AccountPanel
          open
          onOpenChange={() => undefined}
          onLogin={() => undefined}
        />
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("Owner")).toBeInTheDocument();
  expect(screen.getByText("@owner · default 分组")).toBeInTheDocument();
  expect(screen.getByText("$12.50")).toBeInTheDocument();
  expect(screen.getByText("$3.25")).toBeInTheDocument();
  expect(screen.getByText("42")).toBeInTheDocument();
  expect(screen.getByText(official.siteUrl)).toBeInTheDocument();
  expect(native.invoke).toHaveBeenCalledWith("connection_profile", {
    connectionId: official.id,
  });
});

it("账户菜单点击后打开账户面板且不跳转设置", async () => {
  snapshot.connections.push(official);
  snapshot.currentOfficial = official.id;
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <PreferencesProvider>
      <AppProvider>
        <MemoryRouter initialEntries={["/"]}>
          <Routes>
            <Route
              path="/"
              element={
                <AppShell>
                  <HomePage />
                </AppShell>
              }
            />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </MemoryRouter>
      </AppProvider>
    </PreferencesProvider>,
  );
  await user.click(
    await screen.findByRole("button", { name: "KunCode 用户菜单" }),
  );
  await user.click(await screen.findByText("KunCode 账户"));
  expect(await screen.findByText("Owner")).toBeInTheDocument();
  expect(
    screen.queryByRole("heading", { name: "设置" }),
  ).not.toBeInTheDocument();
});

it("手动用户 Token 连接也能在账户面板展示资料", async () => {
  snapshot.connections.push(manual);
  snapshot.currentOfficial = null;
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "list_connections") return structuredClone(snapshot);
    if (command === "detect_environment")
      return { os: "Windows", arch: "x86_64", tools: [] };
    if (command === "list_agents") return [];
    if (command === "connection_profile")
      return {
        connectionId: args.connectionId,
        shopUrl: "https://other.example/shop",
        provider: "newapi",
        kind: "newapi_pat",
        siteUrl: manual.siteUrl,
        authenticated: true,
        account: "manual-owner",
        username: "manual-owner",
        displayName: "Manual Owner",
        userId: 9,
        email: null,
        role: null,
        group: "default",
        status: "正常",
        balance: 4,
        usedQuota: 1,
        requestCount: 3,
        quotaDisplayType: "USD",
        currencySymbol: "$",
        quotaPerUnit: 500000,
        memberSince: null,
        expiresAt: null,
        connected: true,
      };
    return null;
  });
  render(
    <AppProvider>
      <MemoryRouter>
        <Routes>
          <Route
            path="/"
            element={
              <AccountPanel
                open
                onOpenChange={() => undefined}
                onLogin={() => undefined}
              />
            }
          />
          <Route path="/shop/:connectionId" element={<div>手动账户小铺</div>} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("Manual Owner")).toBeInTheDocument();
  expect(native.invoke).toHaveBeenCalledWith("connection_profile", {
    connectionId: manual.id,
  });
  expect(screen.queryByText("尚未登录 KunCode")).not.toBeInTheDocument();
  await userEvent
    .setup()
    .click(screen.getByRole("button", { name: "去小铺充值" }));
  expect(await screen.findByText("手动账户小铺")).toBeInTheDocument();
  expect(native.invoke).not.toHaveBeenCalledWith(
    "open_connection_shop",
    expect.anything(),
  );
});

it("API Key 连接不显示为已登录账户", async () => {
  snapshot.connections.push(other);
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "list_connections") return structuredClone(snapshot);
    if (command === "detect_environment")
      return { os: "Windows", arch: "x86_64", tools: [] };
    if (command === "list_agents") return [];
    if (command === "connection_profile")
      return {
        connectionId: args.connectionId,
        provider: "openai_compatible",
        kind: "api_key",
        siteUrl: other.siteUrl,
        authenticated: false,
        account: null,
        username: null,
        displayName: null,
        userId: null,
        email: null,
        role: null,
        group: null,
        status: null,
        balance: null,
        usedQuota: null,
        requestCount: null,
        quotaDisplayType: null,
        currencySymbol: null,
        quotaPerUnit: null,
        memberSince: null,
        expiresAt: null,
        connected: true,
      };
    return null;
  });
  render(
    <AppProvider>
      <MemoryRouter>
        <AccountPanel
          open
          onOpenChange={() => undefined}
          onLogin={() => undefined}
        />
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("模型服务")).toBeInTheDocument();
  expect(screen.getByText("模型服务连接")).toBeInTheDocument();
  expect(screen.queryByText("尚未登录 KunCode")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "去小铺充值" }),
  ).not.toBeInTheDocument();
});

it("未登录时账户面板提供登录入口", async () => {
  render(
    <AppProvider>
      <MemoryRouter>
        <AccountPanel
          open
          onOpenChange={() => undefined}
          onLogin={() => undefined}
        />
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("尚未登录 KunCode")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "登录 KunCode" }),
  ).toBeInTheDocument();
});

it("OpenCode 高级配置经过预览和确认完整传给后端，JSON 错误阻止继续", async () => {
  snapshot.connections.push(other);
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/setup/opencode"]}>
        <Routes>
          <Route path="/setup/:agent" element={<SetupPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("radio", { name: /other.example/ }));
  await user.click(screen.getByRole("button", { name: "使用此连接" }));
  await screen.findByRole("checkbox", { name: "server-model" });
  await user.click(screen.getByText("高级模型配置"));
  await user.click(screen.getByRole("combobox", { name: "图片输入" }));
  await user.click(await screen.findByRole("option", { name: "支持" }));
  await user.click(screen.getByRole("button", { name: "思考程度（可多选）" }));
  await user.click(
    await screen.findByRole("menuitemcheckbox", { name: "high" }),
  );
  await user.keyboard("{Escape}");
  await user.click(screen.getByRole("combobox", { name: "默认思考程度" }));
  await user.click(await screen.findByRole("option", { name: "high" }));
  await user.type(
    screen.getByRole("spinbutton", { name: "上下文窗口（Token）" }),
    "1048576",
  );
  await user.type(
    screen.getByRole("spinbutton", { name: "输出上限（Token）" }),
    "131072",
  );
  await user.click(screen.getByText("SDK 选项与思考变体（JSON）"));
  const options = screen.getByRole("textbox", { name: "模型 SDK 选项" });
  await user.click(options);
  await user.paste('{"thinking":');
  expect(screen.getByRole("button", { name: "下一步" })).toBeDisabled();
  await user.clear(options);
  await user.paste('{"thinking":{"type":"enabled","budgetTokens":8192}}');
  await user.click(screen.getByRole("button", { name: "下一步" }));
  await screen.findByText("确认配置");
  const advanced = {
    models: {
      "server-model": expect.objectContaining({
        imageInput: true,
        reasoningEffort: "high",
        contextWindow: 1048576,
        maxOutputTokens: 131072,
        options: { thinking: { type: "enabled", budgetTokens: 8192 } },
      }),
    },
  };
  expect(native.invoke).toHaveBeenCalledWith(
    "preview_connection_config",
    expect.objectContaining({ advanced }),
  );
  await user.click(screen.getByRole("button", { name: "配置 OpenCode" }));
  await screen.findByRole("heading", { name: "OpenCode 配置完成" });
  expect(native.invoke).toHaveBeenCalledWith(
    "apply_connection_config",
    expect.objectContaining({
      selection: expect.objectContaining({ advanced }),
    }),
  );
});

it("已有工具可直接编辑高级模型配置，无需重新登录或创建密钥", async () => {
  snapshot.connections.push(other);
  snapshot.bindings.opencode = {
    agentId: "opencode",
    connectionId: other.id,
    model: "server-model",
    models: ["server-model", "second-model"],
    tokenId: null,
    status: "ready",
    verified: true,
    advanced: {
      models: {
        "server-model": {
          imageInput: true,
          contextWindow: 200000,
          maxOutputTokens: 16000,
        },
      },
    },
  };
  const base = native.invoke.getMockImplementation()!;
  native.invoke.mockImplementation(async (command, args) => {
    if (command === "tool_detail")
      return {
        ...(await base(command, args)),
        advanced: snapshot.bindings.opencode.advanced,
      };
    if (command === "update_tool_model_settings") {
      snapshot.bindings.opencode.advanced = args.advanced;
      return structuredClone(snapshot.bindings.opencode);
    }
    return base(command, args);
  });
  render(
    <AppProvider>
      <MemoryRouter initialEntries={["/tools/opencode"]}>
        <Routes>
          <Route path="/tools/:agent" element={<ToolDetailPage />} />
        </Routes>
      </MemoryRouter>
    </AppProvider>,
  );
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "模型高级设置" }));
  const dialog = within(screen.getByRole("dialog"));
  const context = dialog.getAllByRole("spinbutton", {
    name: "上下文窗口（Token）",
  })[0];
  expect(context).toHaveValue(200000);
  await user.clear(context);
  await user.type(context, "400000");
  await user.click(dialog.getByRole("button", { name: "保存模型设置" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(native.invoke).toHaveBeenCalledWith("update_tool_model_settings", {
    agentId: "opencode",
    advanced: {
      models: {
        "server-model": {
          imageInput: true,
          contextWindow: 400000,
          maxOutputTokens: 16000,
        },
      },
    },
  });
  expect(
    native.invoke.mock.calls.some(([command]) =>
      ["start_login", "create_site_token", "apply_connection_config"].includes(
        command,
      ),
    ),
  ).toBe(false);
});

it("逐工具实际调用结果独立显示，不覆盖模型列表检查", async () => {
  snapshot.connections.push(other);
  for (const id of ["claude", "opencode"])
    snapshot.bindings[id] = {
      agentId: id,
      connectionId: other.id,
      model: "server-model",
      tokenId: null,
      status: "ready",
      verified: true,
    };
  const base = native.invoke.getMockImplementation()!;
  native.invoke.mockImplementation(async (command, args) =>
    command === "test_tool_inference"
      ? {
          ok: args.agentId === "claude",
          latencyMs: 2,
          message:
            args.agentId === "claude"
              ? "Claude 推理通过"
              : "OpenCode 响应未完成",
        }
      : base(command, args),
  );
  render(
    <AppProvider>
      <DiagnosePage />
    </AppProvider>,
  );
  const user = userEvent.setup();
  const list = await screen.findByRole("button", { name: "检查模型列表" });
  await waitFor(() => expect(list).toBeEnabled());
  await user.click(list);
  await screen.findByText(/Claude Code：已检查模型列表/);
  for (const name of ["Claude Code", "OpenCode"]) {
    await user.click(
      screen.getByRole("button", { name: `测试 ${name} 实际调用` }),
    );
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", {
        name: "开始测试",
      }),
    );
    await screen.findByText(
      name === "Claude Code" ? "Claude 推理通过" : "OpenCode 响应未完成",
    );
  }
  expect(screen.getByText("Claude 推理通过")).toBeInTheDocument();
  expect(screen.getByText(/Claude Code：已检查模型列表/)).toBeInTheDocument();
});
