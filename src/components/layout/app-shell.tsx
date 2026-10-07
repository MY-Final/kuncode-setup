import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ChevronRight,
  CircleHelp,
  BookOpen,
  Activity,
  Monitor,
  FlaskConical,
} from "lucide-react";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useApp } from "@/lib/store";
import { isTauri } from "@/lib/tauri/api";
import { cn } from "@/lib/utils";
const titles: Record<string, string> = {
  "/": "工作台",
  "/models": "工具配置",
  "/diagnose": "系统诊断",
  "/settings": "设置",
};
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { environment, loading, error } = useApp();
  const [help, setHelp] = useState(false);
  const main = useRef<HTMLElement>(null);
  const helpTrigger = useRef<HTMLButtonElement>(null);
  const helpRequested = useRef(false);
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">
        跳转到主内容
      </a>
      <Sidebar />
      <div className="app-frame">
        <header className="app-topbar">
          <div className="breadcrumbs">
            <Link to="/">工作空间</Link>
            <ChevronRight />
            <span>{titles[pathname] ?? "配置工具"}</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="runtime-label">
              {isTauri() ? <Monitor /> : <FlaskConical />}
              {isTauri() ? "本机工作空间" : "浏览器演示"}
            </span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  ref={helpTrigger}
                  variant="ghost"
                  size="icon"
                  aria-label="帮助与指南"
                >
                  <CircleHelp />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="end"
                onCloseAutoFocus={(event) => {
                  if (helpRequested.current) {
                    event.preventDefault();
                    helpRequested.current = false;
                    const active = document.activeElement;
                    if (active instanceof HTMLElement) active.blur();
                    setHelp(true);
                  }
                }}
              >
                <DropdownMenuItem
                  onSelect={() => {
                    helpRequested.current = true;
                  }}
                >
                  <BookOpen />
                  使用指南
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => navigate("/diagnose")}>
                  <Activity />
                  检查环境
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <main id="main-content" ref={main} className="app-main" tabIndex={-1}>
          <div className="page-content" key={pathname}>
            {children}
          </div>
        </main>
        <footer className="app-statusbar">
          <span>
            <i
              className={cn(
                "status-indicator",
                error ? "error" : loading ? "pending" : "",
              )}
            />
            {error
              ? "环境检测失败"
              : loading
                ? "正在检测环境…"
                : "本机环境已检测"}
          </span>
          <span>
            {!isTauri() && "演示数据 · 不会修改本机文件"}
            {isTauri() &&
              `${environment?.os ?? "桌面端"} · ${environment?.arch ?? "—"}`}
          </span>
        </footer>
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            helpTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>从这里开始</DialogTitle>
            <DialogDescription>三步准备好你的 AI 编程工具。</DialogDescription>
          </DialogHeader>
          <ol className="guide-list">
            <li>
              <span>01</span>
              <div>
                <strong>选择工具与模型</strong>
                <p>
                  在工具配置中选择 Coding Agent 和模型。当前模型目录为演示数据。
                </p>
              </div>
            </li>
            <li>
              <span>02</span>
              <div>
                <strong>确认配置预览</strong>
                <p>
                  先体验演示流程。桌面端也可使用自己的 API Key
                  配置本机，不需要演示登录。
                </p>
              </div>
            </li>
            <li>
              <span>03</span>
              <div>
                <strong>写入并检查连接</strong>
                <p>
                  本机配置会经过 Rust
                  备份、写入和测试。服务鉴权、模型同步及备份恢复界面尚未接入。
                </p>
              </div>
            </li>
          </ol>
          <Button
            onClick={() => {
              setHelp(false);
              navigate("/models");
            }}
          >
            开始配置 <ChevronRight />
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
