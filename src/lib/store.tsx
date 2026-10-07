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
import type {
  AgentConfig,
  AgentMeta,
  EnvironmentReport,
  Session,
} from "@/lib/types";

interface AppState {
  environment: EnvironmentReport | null;
  agents: AgentMeta[];
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
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
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback((account: string) => {
    setSession({ account, balance: "¥18.32" });
  }, []);

  const logout = useCallback(() => setSession(null), []);

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
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppState {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp 必须在 AppProvider 内使用");
  return ctx;
}
