import { useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
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
        model: args.model,
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
  expect(native.invoke).toHaveBeenCalledWith("probe_tool_connection", {
    agentId: "codex",
  });
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
