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

interface AppState {
  configurations: Record<string, { model: string; demo: boolean }>;
  recordConfiguration: (agentId: string, model: string, demo: boolean) => void;
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
    Record<string, { model: string; demo: boolean }>
  >({});
  const recordConfiguration = useCallback(
    (agentId: string, model: string, demo: boolean) => {
      setConfigurations((previous) => ({
        ...previous,
        [agentId]: { model, demo },
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
