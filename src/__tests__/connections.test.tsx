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
    if (command === "connection_models") return ["server-model"];
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
      return { agentId: args.agentId, restored: [], missing: [] };
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
  await user.click(await screen.findByRole("radio", { name: /site-key/ }));
  await user.click(screen.getByRole("button", { name: "使用此密钥" }));
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
        <HomePage />
      </MemoryRouter>
    </AppProvider>,
  );
  expect(await screen.findByText("账户余额")).toBeInTheDocument();
  expect(await screen.findByText("$12.50")).toBeInTheDocument();
  expect(screen.getByText("工具配置")).toBeInTheDocument();
  expect(screen.getByText("1 / 3")).toBeInTheDocument();
  expect(screen.getByText("1 个工具已配置")).toBeInTheDocument();
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
      <AccountPanel
        open
        onOpenChange={() => undefined}
        onLogin={() => undefined}
      />
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
      <AccountPanel
        open
        onOpenChange={() => undefined}
        onLogin={() => undefined}
      />
    </AppProvider>,
  );
  expect(await screen.findByText("Manual Owner")).toBeInTheDocument();
  expect(native.invoke).toHaveBeenCalledWith("connection_profile", {
    connectionId: manual.id,
  });
  expect(screen.queryByText("尚未登录 KunCode")).not.toBeInTheDocument();
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
      <AccountPanel
        open
        onOpenChange={() => undefined}
        onLogin={() => undefined}
      />
    </AppProvider>,
  );
  expect(await screen.findByText("模型服务")).toBeInTheDocument();
  expect(screen.getByText("模型服务连接")).toBeInTheDocument();
  expect(screen.queryByText("尚未登录 KunCode")).not.toBeInTheDocument();
});

it("未登录时账户面板提供登录入口", async () => {
  render(
    <AppProvider>
      <AccountPanel
        open
        onOpenChange={() => undefined}
        onLogin={() => undefined}
      />
    </AppProvider>,
  );
  expect(await screen.findByText("尚未登录 KunCode")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "登录 KunCode" }),
  ).toBeInTheDocument();
});
