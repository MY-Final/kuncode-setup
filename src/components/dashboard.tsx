import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  CircleDollarSign,
  Loader2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type { AccountProfile } from "@/lib/types";

/** 余额预警：为空表示额度充足。 */
type BalanceLevel = "empty" | "low";

function balanceLevel(profile: AccountProfile): BalanceLevel | null {
  const balance = profile.balance;
  if (balance == null) return null;
  if (balance <= 0) return "empty";
  // 站点可能以货币或 token 计价，分别使用不同的低额度阈值。
  const threshold = profile.quotaDisplayType === "TOKENS" ? 100_000 : 1;
  return balance < threshold ? "low" : null;
}

function formatBalance(profile: AccountProfile, value: number | null) {
  if (value === null) return null;
  if (profile.quotaDisplayType === "TOKENS")
    return `${Math.round(value).toLocaleString("zh-CN")} tokens`;
  const symbol = profile.currencySymbol ?? "$";
  const digits = Math.abs(value) >= 1000 ? 0 : 2;
  return `${symbol}${value.toLocaleString("zh-CN", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function Dashboard() {
  const { agents, configurations, connections, session, refreshConnections } =
    useApp();
  const navigate = useNavigate();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connection =
    connections.find(
      (item) => item.id === session?.connectionId && item.connected,
    ) ??
    connections.find((item) => item.connected) ??
    null;
  const connectionId = connection?.id ?? null;

  useEffect(() => {
    if (!connectionId) {
      setProfile(null);
      setError(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    api
      .connectionProfile(connectionId)
      .then((value) => {
        if (active) setProfile(value);
      })
      .catch((value) => {
        if (active) setError(errorMessage(value));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId]);

  const configured = agents.filter(
    (agent) => configurations[agent.id]?.status === "ready",
  ).length;
  const balance = profile ? formatBalance(profile, profile.balance) : null;
  const level = profile ? balanceLevel(profile) : null;

  async function refresh() {
    if (!connectionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      await refreshConnections();
      setProfile(await api.connectionProfile(connectionId));
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="dashboard" aria-label="账户概览">
      <article className="dashboard-card">
        <div className="dashboard-card-head">
          <CircleDollarSign aria-hidden="true" />
          <span>账户余额</span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading || !connectionId}
          >
            {loading && <Loader2 className="animate-spin" />}
            刷新
          </Button>
        </div>
        {!connectionId ? (
          <p className="dashboard-muted">尚未连接站点，登录后显示余额。</p>
        ) : error ? (
          <p className="dashboard-muted">暂时无法读取余额。</p>
        ) : loading && !profile ? (
          <p className="dashboard-muted">正在读取…</p>
        ) : balance ? (
          <>
            <strong className="dashboard-value">{balance}</strong>
            {profile?.usedQuota != null && (
              <span className="dashboard-sub">
                已用 {formatBalance(profile, profile.usedQuota)}
              </span>
            )}
            {level && (
              <p
                className={`dashboard-alert ${level === "empty" ? "error" : "warning"}`}
                role="status"
              >
                <AlertTriangle aria-hidden="true" />
                {level === "empty"
                  ? "额度已用完，请充值或更换密钥后再启动工具。"
                  : "额度偏低，建议及时充值以免影响使用。"}
              </p>
            )}
          </>
        ) : (
          <p className="dashboard-muted">此连接不提供余额信息。</p>
        )}
      </article>
      <article className="dashboard-card">
        <div className="dashboard-card-head">
          <Wrench aria-hidden="true" />
          <span>工具配置</span>
          <Button variant="ghost" size="sm" onClick={() => navigate("/models")}>
            管理
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
        <strong className="dashboard-value">
          {configured} / {agents.length}
        </strong>
        <span className="dashboard-sub">{configured} 个工具已配置</span>
      </article>
    </section>
  );
}
