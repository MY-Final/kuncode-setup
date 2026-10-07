import {
  Monitor,
  Moon,
  Sun,
  SlidersHorizontal,
  ShieldCheck,
  Info,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";
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
import { isTauri } from "@/lib/tauri/api";

export default function SettingsPage() {
  const { preferences, updatePreferences } = usePreferences();
  const { session, logout, environment } = useApp();
  return (
    <>
      <PageHeader title="设置" description="让工作空间，更贴合你的习惯。" />
      <div className="settings-content">
        <div className="section-heading">
          <h2>
            <SlidersHorizontal />
            外观与体验
          </h2>
          <span className="count-label">自动保存到本机</span>
        </div>
        <section className="settings-surface">
          <div className="setting-row">
            <div>
              <h3>主题</h3>
              <p>选择舒适的界面明暗，或跟随系统。</p>
            </div>
            <Select
              value={preferences.theme}
              onValueChange={(value) => {
                if (value === "light" || value === "dark" || value === "system")
                  updatePreferences({ theme: value });
              }}
            >
              <SelectTrigger aria-label="主题" className="w-40">
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
              <p>减少列表行间距，在小窗口中查看更多内容。</p>
            </div>
            <Switch
              checked={preferences.compact}
              onCheckedChange={(compact) => updatePreferences({ compact })}
              aria-labelledby="compact-label"
            />
          </div>
          <div className="setting-row">
            <div>
              <h3 id="motion-label">减少动态效果</h3>
              <p>简化页面过渡，保留必要的状态反馈。</p>
            </div>
            <Switch
              checked={preferences.reduceMotion}
              onCheckedChange={(reduceMotion) =>
                updatePreferences({ reduceMotion })
              }
              aria-labelledby="motion-label"
            />
          </div>
        </section>
        <div className="section-heading">
          <h2>
            <UserRound />
            KunCode 账户
          </h2>
          <span className="demo-label">鉴权待接入</span>
        </div>
        <section className="settings-surface">
          <div className="setting-row">
            <div>
              <h3>{session ? session.account : "尚未连接账户"}</h3>
              <p>
                {session
                  ? "演示会话 · 仅在当前应用内存中保留"
                  : "首版支持演示体验及桌面端手动 API Key 配置。"}
              </p>
            </div>
            {session ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  logout();
                  toast.success("已退出演示会话");
                }}
              >
                退出演示
              </Button>
            ) : (
              <span className="count-label">未连接</span>
            )}
          </div>
        </section>
        <div className="section-heading">
          <h2>
            <Info />
            关于应用
          </h2>
        </div>
        <section className="settings-surface">
          <div className="setting-row">
            <div>
              <h3>KunCode Setup</h3>
              <p>AI Coding Agent 配置助手</p>
            </div>
            <span className="version-pill">v0.1.0</span>
          </div>
          <div className="setting-row">
            <div>
              <h3>运行环境</h3>
              <p>
                {isTauri()
                  ? `${environment?.os ?? "桌面端"} · Tauri 2`
                  : "浏览器预览 · 使用独立演示数据层"}
              </p>
            </div>
            <Monitor className="text-muted-foreground size-5" />
          </div>
        </section>
        <p className="page-footnote">
          <ShieldCheck />
          仅外观偏好保存到应用存储。账户、API Key 与配置草稿不会写入
          localStorage。
        </p>
      </div>
    </>
  );
}
