import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type {
  AgentConfig,
  AgentMeta,
  EnvironmentReport,
  Session,
} from "@/lib/types";

export interface ToolConfiguration {
  model: string;
  demo: boolean;
  status: "ready" | "error";
}
interface AppState {
  configurations: Record<string, ToolConfiguration>;
  recordConfiguration: (
    agentId: string,
    model: string,
    demo: boolean,
    status?: ToolConfiguration["status"],
  ) => void;
  environment: EnvironmentReport | null;
  agents: AgentMeta[];
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
  login: (account: string) => void;
  logout: () => void;
  /** 当前正在配置的 Agent（用于跨页面流程） */
  draft: AgentConfig | null;
  setDraft: (config: AgentConfig | null) => void;
}

const AppContext = createContext<AppState | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<EnvironmentReport | null>(
    null,
  );
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<AgentConfig | null>(null);
  const [configurations, setConfigurations] = useState<
    Record<string, ToolConfiguration>
  >({});
  const recordConfiguration = useCallback(
    (
      agentId: string,
      model: string,
      demo: boolean,
      status: ToolConfiguration["status"] = "ready",
    ) => {
      setConfigurations((previous) => ({
        ...previous,
        [agentId]: { model, demo, status },
      }));
    },
    [],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [env, list] = await Promise.all([
        api.detectEnvironment(),
        api.listAgents(),
      ]);
      setEnvironment(env);
      setAgents(list);
      return true;
    } catch (e) {
      setError(errorMessage(e));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback((account: string) => {
    setSession({ account, balance: "未接入" });
  }, []);

  const logout = useCallback(() => {
    setSession(null);
    setDraft(null);
  }, []);

  const value = useMemo<AppState>(
    () => ({
      environment,
      agents,
      session,
      loading,
      error,
      refresh,
      login,
      logout,
      draft,
      setDraft,
      configurations,
      recordConfiguration,
    }),
    [
      environment,
      agents,
      session,
      loading,
      error,
      refresh,
      login,
      logout,
      draft,
      configurations,
      recordConfiguration,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}
