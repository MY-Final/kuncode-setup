import { Moon, Sun, Monitor, Pencil, Loader2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePreferences } from "@/lib/preferences";
import { useApp } from "@/lib/store";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConnectionDialog } from "@/components/connection-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/utils";
import { DEFAULT_AUTHORIZATION_SITE, isTauri } from "@/lib/tauri/api";
import * as api from "@/lib/tauri/api";
import type { ConnectionSummary } from "@/lib/types";
export default function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const {
    session,
    connections,
    logout,
    authorizationSite,
    updateAuthorizationSite,
    refreshConnections,
  } = useApp();
  const [connect, setConnect] = useState(false);
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const [site, setSite] = useState(authorizationSite);
  const [savingSite, setSavingSite] = useState(false);
  const [editing, setEditing] = useState<ConnectionSummary | null>(null);
  const [alias, setAlias] = useState("");
  const [note, setNote] = useState("");
  const [savingMeta, setSavingMeta] = useState(false);
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [pinging, setPinging] = useState<string | null>(null);
  useEffect(() => setSite(authorizationSite), [authorizationSite]);
  async function saveSite(value: string) {
    if (savingSite) return;
    setSavingSite(true);
    try {
      await updateAuthorizationSite(value.trim());
      toast.success("授权服务地址已保存，已有账户和工具绑定已保留");
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setSavingSite(false);
    }
  }
  function openRename(connection: ConnectionSummary) {
    setEditing(connection);
    setAlias(connection.alias ?? "");
    setNote(connection.note ?? "");
  }
  async function saveMeta() {
    if (!editing || savingMeta) return;
    setSavingMeta(true);
    try {
      await api.renameConnection(
        editing.id,
        alias.trim() || null,
        note.trim() || null,
      );
      await refreshConnections();
      toast.success("连接信息已保存");
      setEditing(null);
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setSavingMeta(false);
    }
  }
  async function ping(id: string) {
    if (pinging) return;
    setPinging(id);
    try {
      const value = await api.pingConnection(id);
      setPings((previous) => ({ ...previous, [id]: value }));
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setPinging(null);
    }
  }
  async function disconnect(id: string) {
    if (signingOut) return;
    setSigningOut(id);
    try {
      const warning = await logout(id);
      if (warning) toast.warning(warning);
      else toast.success("本机已退出，工具配置和工具密钥已保留");
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setSigningOut(null);
    }
  }
  return (
    <div className="settings-page">
      <PageHeader title="设置" description="简单调整，按习惯使用。" />
      <section
        className="settings-section"
        aria-labelledby="appearance-heading"
      >
        <h2 id="appearance-heading">外观</h2>
        <div className="setting-row">
          <div>
            <h3>主题</h3>
            <p>浅色、深色，或跟随 Windows。</p>
          </div>
          <Select
            value={preferences.theme}
            onValueChange={(value) => {
              if (value === "light" || value === "dark" || value === "system")
                updatePreferences({ theme: value });
            }}
          >
            <SelectTrigger aria-label="主题" className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">
                <Sun />
                浅色
              </SelectItem>
              <SelectItem value="dark">
                <Moon />
                深色
              </SelectItem>
              <SelectItem value="system">
                <Monitor />
                跟随系统
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="setting-row">
          <div>
            <h3 id="compact-label">紧凑布局</h3>
            <p>减少工具列表的行间距。</p>
          </div>
          <Switch
            checked={preferences.compact}
            onCheckedChange={(compact) => updatePreferences({ compact })}
            aria-labelledby="compact-label"
          />
        </div>
      </section>
      <section className="settings-section" aria-labelledby="account-heading">
        <h2 id="account-heading">KunCode 账户</h2>
        <div className="setting-row">
          <div>
            <h3>{session ? session.account : "尚未登录"}</h3>
            <p>
              {session
                ? "退出后保留工具配置，已配置的工具仍可启动。"
                : "在系统浏览器中登录，自动完成工具连接。"}
            </p>
          </div>
          {session ? (
            <Button
              variant="outline"
              size="sm"
              disabled={!!signingOut}
              onClick={() => void disconnect(session.connectionId)}
            >
              退出登录
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConnect(true)}
            >
              登录 KunCode
            </Button>
          )}
        </div>
        {connections
          .filter(
            (connection) =>
              connection.connected && connection.id !== session?.connectionId,
          )
          .map((connection) => (
            <div className="setting-row" key={connection.id}>
              <div>
                <h3>
                  {connection.alias ??
                    connection.account ??
                    new URL(connection.siteUrl).host}
                </h3>
                <p>
                  {connection.kind === "api_key"
                    ? "API Key 服务连接"
                    : connection.kind === "kuncode_authorized"
                      ? "KunCode 浏览器授权"
                      : "用户 Token 连接"}{" "}
                  · {connection.siteUrl}
                  {connection.note ? ` · ${connection.note}` : ""}
                </p>
              </div>
              <div className="setting-actions">
                {pings[connection.id] != null && (
                  <span className="latency-badge">
                    {pings[connection.id]} ms
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void ping(connection.id)}
                  disabled={pinging === connection.id}
                >
                  {pinging === connection.id && (
                    <Loader2 className="animate-spin" />
                  )}
                  测速
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openRename(connection)}
                >
                  <Pencil aria-hidden="true" />
                  编辑名称
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={!!signingOut}
                  onClick={() => void disconnect(connection.id)}
                >
                  断开连接
                </Button>
              </div>
            </div>
          ))}
        <Button variant="ghost" size="sm" onClick={() => setConnect(true)}>
          连接其他站点
        </Button>
        <details className="technical-details authorization-settings">
          <summary>授权服务地址（高级）</summary>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void saveSite(site);
            }}
          >
            <div className="form-field">
              <Label htmlFor="authorization-site">授权服务根地址</Label>
              <Input
                id="authorization-site"
                type="url"
                value={site}
                onChange={(event) => setSite(event.target.value)}
                placeholder={DEFAULT_AUTHORIZATION_SITE}
                disabled={savingSite || !isTauri()}
                required
              />
              <p className="page-footnote">
                本地测试可填 http://127.0.0.1:3000。请将 new-api 的
                ServerAddress 设置为相同地址。 填站点根地址即可，无需附加 /api
                或 /v1；修改只影响下一次登录。
              </p>
            </div>
            <div className="setup-form-footer">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={savingSite || !isTauri()}
                onClick={() => void saveSite(DEFAULT_AUTHORIZATION_SITE)}
              >
                恢复官方地址
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={
                  savingSite || !isTauri() || site.trim() === authorizationSite
                }
              >
                {savingSite ? "保存中…" : "保存地址"}
              </Button>
            </div>
          </form>
        </details>
      </section>
      <ConnectionDialog open={connect} onOpenChange={setConnect} />
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => {
          if (!open) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑连接信息</DialogTitle>
            <DialogDescription>
              别名与备注只影响本机展示，不会改变站点或密钥。
            </DialogDescription>
          </DialogHeader>
          <div className="form-field">
            <Label htmlFor="connection-alias">别名</Label>
            <Input
              id="connection-alias"
              value={alias}
              onChange={(event) => setAlias(event.target.value)}
              maxLength={50}
              placeholder="例如：公司专用账号"
            />
          </div>
          <div className="form-field">
            <Label htmlFor="connection-note">备注</Label>
            <Input
              id="connection-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="可选"
            />
          </div>
          <div className="setup-form-footer">
            <Button
              variant="outline"
              onClick={() => setEditing(null)}
              disabled={savingMeta}
            >
              取消
            </Button>
            <Button onClick={() => void saveMeta()} disabled={savingMeta}>
              {savingMeta && <Loader2 className="animate-spin" />}保存
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <section className="settings-section" aria-labelledby="app-heading">
        <h2 id="app-heading">应用信息</h2>
        <div className="setting-row">
          <div>
            <h3>KunCode Setup</h3>
            <p>Windows Coding Agent 配置工具</p>
          </div>
          <span className="version-text">v0.1.1</span>
        </div>
      </section>
    </div>
  );
}
