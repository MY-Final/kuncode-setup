import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutGrid,
  SlidersHorizontal,
  Activity,
  Settings2,
  CodeXml,
  ShieldCheck,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
const nav = [
  { to: "/", label: "工作台", icon: LayoutGrid },
  { to: "/models", label: "工具配置", icon: SlidersHorizontal },
  { to: "/diagnose", label: "系统诊断", icon: Activity },
];
export function Sidebar() {
  const { pathname } = useLocation();
  return (
    <aside className="app-sidebar">
      <NavLink to="/" className="brand" aria-label="KunCode Setup 工作台">
        <span className="brand-mark">
          <CodeXml aria-hidden="true" />
        </span>
        <span className="sidebar-label">
          <strong>
            KunCode<span className="brand-dot">.</span>
          </strong>
          <small>SETUP</small>
        </span>
      </NavLink>
      <div className="sidebar-section-label sidebar-label">工作空间</div>
      <nav className="sidebar-nav" aria-label="主导航">
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
      <div className="sidebar-bottom">
        <div className="sidebar-note sidebar-label">
          <ShieldCheck />
          <strong>安心配置，专注创作</strong>
          <p>
            先预览，再写入。
            <br />
            已有配置会自动备份。
          </p>
          <NavLink to="/diagnose">
            检查本机环境 <ArrowUpRight />
          </NavLink>
        </div>
        <NavLink
          to="/settings"
          title="设置"
          className={({ isActive }) => cn("nav-item", isActive && "active")}
        >
          <Settings2 aria-hidden="true" />
          <span className="sidebar-label">设置</span>
        </NavLink>
        <div className="sidebar-version sidebar-label">
          <span>KunCode Setup</span>
          <span>v0.1.0</span>
        </div>
      </div>
    </aside>
  );
}
