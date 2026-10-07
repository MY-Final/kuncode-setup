import { useEffect, useState } from "react";
import {
  BadgeCheck,
  CircleAlert,
  ExternalLink,
  LogOut,
  RefreshCw,
  UserRound,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type { AccountProfile } from "@/lib/types";
import { toast } from "sonner";

function providerLabel(provider: string) {
  if (provider === "newapi") return "KunCode 账户";
  if (provider === "sub2api") return "Sub2API 账户";
  if (provider === "openai_compatible") return "模型服务";
  return "站点账户";
}

function formatQuota(profile: AccountProfile, value: number | null) {
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

function formatDate(value: number | null) {
  if (!value) return null;
  return new Date(value * 1000).toLocaleDateString("zh-CN", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function AccountPanel({
  open,
  onOpenChange,
  onLogin,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onLogin: () => void;
}) {
  const { session, connections, logout } = useApp();
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const connectionId = session?.connectionId ?? null;

  useEffect(() => {
    if (!open) return;
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
  }, [open, connectionId]);

  async function refresh() {
    if (!connectionId || loading) return;
    setLoading(true);
    setError(null);
    try {
      setProfile(await api.connectionProfile(connectionId));
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    if (!connectionId || signingOut) return;
    setSigningOut(true);
    try {
      const warning = await logout(connectionId);
      if (warning) toast.warning(warning);
      else toast.success("已退出，工具配置已保留");
      onOpenChange(false);
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setSigningOut(false);
    }
  }

  const otherConnections = connections.filter(
    (connection) =>
      connection.connected && connection.id !== session?.connectionId,
  );
  const displayName =
    profile?.displayName ||
    profile?.account ||
    session?.account ||
    profile?.username;
  const initial = (displayName ?? "K").trim().charAt(0).toUpperCase();
  const balance = profile ? formatQuota(profile, profile.balance) : null;
  const used = profile ? formatQuota(profile, profile.usedQuota) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="account-panel">
        <DialogHeader>
          <DialogTitle>
            {connectionId
              ? providerLabel(profile?.provider ?? "")
              : "KunCode 账户"}
          </DialogTitle>
          <DialogDescription>
            {connectionId
              ? "当前登录的账户信息，来自站点实际数据。"
              : "登录 KunCode 后即可查看账户信息并配置工具。"}
          </DialogDescription>
        </DialogHeader>

        {connectionId ? (
          <>
            <div className="account-identity">
              <span className="account-avatar" aria-hidden="true">
                {initial}
              </span>
              <div>
                <strong>{displayName ?? "KunCode 用户"}</strong>
                <p>
                  {profile?.username ? `@${profile.username}` : "已登录"}
                  {profile?.group ? ` · ${profile.group} 分组` : ""}
                </p>
              </div>
              {profile?.status === "正常" && (
                <span className="account-badge">
                  <BadgeCheck aria-hidden="true" />
                  正常
                </span>
              )}
              {profile?.status && profile.status !== "正常" && (
                <span className="account-badge warning">
                  <CircleAlert aria-hidden="true" />
                  {profile.status}
                </span>
              )}
            </div>

            {error ? (
              <p className="account-error">{error}</p>
            ) : loading && !profile ? (
              <p className="account-loading">正在读取账户信息…</p>
            ) : (
              <dl className="account-facts">
                {balance && (
                  <div>
                    <dt>可用余额</dt>
                    <dd>{balance}</dd>
                  </div>
                )}
                {used && (
                  <div>
                    <dt>已用额度</dt>
                    <dd>{used}</dd>
                  </div>
                )}
                {profile?.requestCount != null && (
                  <div>
                    <dt>请求次数</dt>
                    <dd>{profile.requestCount.toLocaleString("zh-CN")}</dd>
                  </div>
                )}
                {profile?.email && (
                  <div>
                    <dt>邮箱</dt>
                    <dd>{profile.email}</dd>
                  </div>
                )}
                {profile?.memberSince && (
                  <div>
                    <dt>加入时间</dt>
                    <dd>{formatDate(profile.memberSince)}</dd>
                  </div>
                )}
                {profile?.expiresAt && (
                  <div>
                    <dt>授权有效期</dt>
                    <dd>至 {formatDate(profile.expiresAt)}</dd>
                  </div>
                )}
                <div>
                  <dt>站点</dt>
                  <dd className="account-site">{profile?.siteUrl ?? "—"}</dd>
                </div>
              </dl>
            )}

            <div className="account-actions">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void refresh()}
                disabled={loading}
              >
                <RefreshCw aria-hidden="true" />
                刷新信息
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onLogin();
                }}
              >
                <ExternalLink aria-hidden="true" />
                连接其他站点
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void signOut()}
                disabled={signingOut}
              >
                <LogOut aria-hidden="true" />
                {signingOut ? "退出中…" : "退出登录"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="account-empty">
              <UserRound aria-hidden="true" />
              <strong>尚未登录 KunCode</strong>
              <p>在系统浏览器中完成登录，即可查看账户余额与工具配置。</p>
            </div>
            <div className="account-actions">
              <Button
                size="sm"
                onClick={() => {
                  onOpenChange(false);
                  onLogin();
                }}
              >
                登录 KunCode
              </Button>
            </div>
          </>
        )}

        {otherConnections.length > 0 && (
          <div className="account-other">
            <span>其他站点连接</span>
            {otherConnections.map((connection) => (
              <div key={connection.id}>
                <strong>
                  {connection.account ?? new URL(connection.siteUrl).host}
                </strong>
                <p>{connection.siteUrl}</p>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
