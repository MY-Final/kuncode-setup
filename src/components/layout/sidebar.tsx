import { NavLink } from "react-router-dom";
import { Home, Wrench, Stethoscope, Settings } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "首页", icon: Home, end: true },
  { to: "/models", label: "工具配置", icon: Wrench, end: false },
  { to: "/diagnose", label: "系统诊断", icon: Stethoscope, end: false },
  { to: "/settings", label: "设置", icon: Settings, end: false },
];

export function Sidebar() {
  return (
    <aside className="bg-sidebar text-sidebar-foreground border-sidebar-border flex w-56 shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
          K
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">KunCode</div>
          <div className="text-muted-foreground text-xs">Setup</div>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 px-3">
        {nav.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              )
            }
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="text-muted-foreground px-5 py-4 text-xs">
        v0.1.0 · Windows
      </div>
    </aside>
  );
}
