import { Moon, Sun, Monitor } from "lucide-react";
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
import { errorMessage } from "@/lib/utils";
import { DEFAULT_AUTHORIZATION_SITE, isTauri } from "@/lib/tauri/api";
export default function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const {
    session,
    connections,
    logout,
    authorizationSite,
    updateAuthorizationSite,
  } = useApp();
  const [connect, setConnect] = useState(false);
  const [signingOut, setSigningOut] = useState<string | null>(null);
  const [site, setSite] = useState(authorizationSite);
  const [savingSite, setSavingSite] = useState(false);
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
                  {connection.account ?? new URL(connection.siteUrl).host}
                </h3>
                <p>
                  {connection.kind === "api_key"
                    ? "API Key 服务连接"
                    : connection.kind === "kuncode_authorized"
                      ? "KunCode 浏览器授权"
                      : "用户 Token 连接"}{" "}
                  · {connection.siteUrl}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={!!signingOut}
                onClick={() => void disconnect(connection.id)}
              >
                断开连接
              </Button>
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
      <section className="settings-section" aria-labelledby="app-heading">
        <h2 id="app-heading">应用信息</h2>
        <div className="setting-row">
          <div>
            <h3>KunCode Setup</h3>
            <p>Windows Coding Agent 配置工具</p>
          </div>
          <span className="version-text">v0.1.0</span>
        </div>
      </section>
    </div>
  );
}
