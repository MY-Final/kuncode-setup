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
  AgentMeta,
  EnvironmentReport,
  Session,
  ConnectionDraft,
  ConnectionSnapshot,
  ConnectionSummary,
} from "@/lib/types";

export interface ToolConfiguration {
  model: string;
  demo: boolean;
  status: "ready" | "error";
  connectionId?: string;
  group?: string | null;
  tokenId?: number | null;
  verified?: boolean;
}
interface AppState {
  configurations: Record<string, ToolConfiguration>;
  recordConfiguration: (
    agentId: string,
    model: string,
    demo: boolean,
    status?: ToolConfiguration["status"],
  ) => void;
  connections: ConnectionSummary[];
  authorizationSite: string;
  updateAuthorizationSite: (site: string) => Promise<void>;
  refreshConnections: () => Promise<void>;
  environment: EnvironmentReport | null;
  agents: AgentMeta[];
  session: Session | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<boolean>;
  logout: (connectionId?: string) => Promise<string | null>;
  draft: ConnectionDraft | null;
  setDraft: (config: ConnectionDraft | null) => void;
}
const AppContext = createContext<AppState | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const [environment, setEnvironment] = useState<EnvironmentReport | null>(
    null,
  );
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [snapshot, setSnapshot] = useState<ConnectionSnapshot>({
    authorizationSite: api.DEFAULT_AUTHORIZATION_SITE,
    currentOfficial: null,
    connections: [],
    bindings: {},
  });
  const [demoConfigurations, setDemoConfigurations] = useState<
    Record<string, ToolConfiguration>
  >({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<ConnectionDraft | null>(null);
  const refreshConnections = useCallback(async () => {
    setSnapshot(await api.listConnections());
  }, []);
  const updateAuthorizationSite = useCallback(async (site: string) => {
    setSnapshot(await api.setAuthorizationSite(site));
  }, []);
  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [env, list, current] = await Promise.all([
        api.detectEnvironment(),
        api.listAgents(),
        api.listConnections(),
      ]);
      setEnvironment(env);
      setAgents(list);
      setSnapshot(current);
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
  const recordConfiguration = useCallback(
    (
      agentId: string,
      model: string,
      demo: boolean,
      status: ToolConfiguration["status"] = "ready",
    ) => {
      if (demo)
        setDemoConfigurations((previous) => ({
          ...previous,
          [agentId]: { model, demo, status },
        }));
    },
    [],
  );
  const official = snapshot.connections.find(
    (connection) =>
      connection.id === snapshot.currentOfficial &&
      connection.connected &&
      connection.kind === "kuncode_authorized",
  );
  const session = official
    ? { account: official.account ?? "KunCode 用户", connectionId: official.id }
    : null;
  const logout = useCallback(
    async (connectionId?: string) => {
      const id = connectionId ?? snapshot.currentOfficial;
      if (!id) return null;
      const warning = await api.logoutConnection(id);
      await refreshConnections();
      return warning;
    },
    [snapshot.currentOfficial, refreshConnections],
  );
  const configurations = useMemo(() => {
    const current: Record<string, ToolConfiguration> = {
      ...demoConfigurations,
    };
    Object.values(snapshot.bindings).forEach((binding) => {
      current[binding.agentId] = {
        model: binding.model,
        demo: false,
        status: binding.status,
        connectionId: binding.connectionId,
        group: binding.group,
        tokenId: binding.tokenId,
        verified: binding.verified,
      };
    });
    return current;
  }, [snapshot.bindings, demoConfigurations]);
  const value: AppState = {
    environment,
    agents,
    session,
    connections: snapshot.connections,
    authorizationSite: snapshot.authorizationSite,
    updateAuthorizationSite,
    loading,
    error,
    refresh,
    refreshConnections,
    logout,
    draft,
    setDraft,
    configurations,
    recordConfiguration,
  };
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp(): AppState {
  const context = useContext(AppContext);
  if (!context) throw new Error("useApp 必须在 AppProvider 内使用");
  return context;
}
