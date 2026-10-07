import { Moon, Sun, Monitor } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
export default function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const { session, logout } = useApp();
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
            <p>{session ? "当前为演示账户。" : "账户登录服务暂未接入。"}</p>
          </div>
          {session ? (
            <Button variant="outline" size="sm" onClick={logout}>
              退出演示
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled>
              登录 KunCode
            </Button>
          )}
        </div>
      </section>
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
