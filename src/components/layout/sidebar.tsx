import { NavLink, useLocation } from "react-router-dom";
import {
  House,
  KeyRound,
  Wrench,
  Activity,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePreferences } from "@/lib/preferences";
const nav = [
  { to: "/", label: "首页", icon: House },
  { to: "/models", label: "工具配置", icon: Wrench },
  { to: "/keys", label: "密钥与分组", icon: KeyRound },
  { to: "/diagnose", label: "系统诊断", icon: Activity, subtle: true },
  { to: "/settings", label: "设置", icon: Settings },
];
export function Brand() {
  return (
    <NavLink to="/" className="brand" aria-label="KunCode Setup 首页">
      <img src="/icon.svg" alt="" className="brand-mark" />
      <span className="brand-label">KunCode Setup</span>
    </NavLink>
  );
}
export function Sidebar() {
  const { pathname } = useLocation();
  const { preferences, updatePreferences } = usePreferences();
  const collapsed = preferences.sidebarCollapsed;
  return (
    <aside className={cn("app-sidebar", collapsed && "collapsed")}>
      <Brand />
      <nav className="sidebar-nav" aria-label="主导航" id="primary-navigation">
        {nav.map(({ icon: Icon, ...item }) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === "/"}
            title={item.label}
            aria-label={item.label}
            aria-current={
              item.to === "/models" && pathname.startsWith("/setup/")
                ? "page"
                : undefined
            }
            className={({ isActive }) =>
              cn(
                "nav-item",
                "subtle" in item && item.subtle && "nav-item-subtle",
                (isActive ||
                  (item.to === "/models" && pathname.startsWith("/setup/"))) &&
                  "active",
              )
            }
          >
            <Icon aria-hidden="true" />
            <span className="sidebar-label">{item.label}</span>
          </NavLink>
        ))}
      </nav>
      <div className="sidebar-footer">
        <Button
          variant="ghost"
          className="sidebar-toggle"
          onClick={() => updatePreferences({ sidebarCollapsed: !collapsed })}
          aria-label={collapsed ? "展开侧栏" : "折叠侧栏"}
          title={collapsed ? "展开侧栏" : "折叠侧栏"}
          aria-expanded={!collapsed}
          aria-controls="primary-navigation"
        >
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          <span className="sidebar-label">折叠侧栏</span>
        </Button>
        <span className="sidebar-version">v0.1.0</span>
      </div>
    </aside>
  );
}
