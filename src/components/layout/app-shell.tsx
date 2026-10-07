import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChevronDown, BookOpen, IdCard, LogOut, UserRound } from "lucide-react";
import { Sidebar, Brand } from "@/components/layout/sidebar";
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
import { cn, errorMessage } from "@/lib/utils";
import { ConnectionDialog } from "@/components/connection-dialog";
import { AccountPanel } from "@/components/account-panel";
import { toast } from "sonner";
export function AppShell({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { session, logout } = useApp();
  const [help, setHelp] = useState(false);
  const [connect, setConnect] = useState(false);
  const [account, setAccount] = useState(false);
  const connectRequested = useRef(false);
  const accountRequested = useRef(false);
  const main = useRef<HTMLElement>(null);
  const accountTrigger = useRef<HTMLButtonElement>(null);
  const helpRequested = useRef(false);
  const flow = pathname.startsWith("/setup/");
  useEffect(() => {
    main.current?.scrollTo(0, 0);
  }, [pathname]);
  return (
    <div className={cn("app-shell", flow && "setup-shell")}>
      <a href="#main-content" className="skip-link">
        跳转到主内容
      </a>
      {flow ? (
        <header className="flow-topbar">
          <Brand />
        </header>
      ) : (
        <Sidebar />
      )}
      <div className="app-frame">
        <header className="account-area">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                ref={accountTrigger}
                variant="ghost"
                className="account-trigger"
                aria-label="KunCode 用户菜单"
              >
                <UserRound />
                <span className="account-name">
                  {session ? session.account : "KunCode · 未登录"}
                </span>
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              onCloseAutoFocus={(event) => {
                if (helpRequested.current) {
                  event.preventDefault();
                  helpRequested.current = false;
                  setHelp(true);
                }
                if (connectRequested.current) {
                  event.preventDefault();
                  connectRequested.current = false;
                  setConnect(true);
                }
                if (accountRequested.current) {
                  event.preventDefault();
                  accountRequested.current = false;
                  setAccount(true);
                }
              }}
            >
              {!session && (
                <DropdownMenuItem
                  onSelect={() => {
                    connectRequested.current = true;
                  }}
                >
                  <UserRound />
                  登录 KunCode
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => {
                  accountRequested.current = true;
                }}
              >
                <IdCard />
                KunCode 账户
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => {
                  helpRequested.current = true;
                }}
              >
                <BookOpen />
                使用指南
              </DropdownMenuItem>
              {session && (
                <DropdownMenuItem
                  onSelect={() => {
                    void logout()
                      .then((warning) =>
                        warning
                          ? toast.warning(warning)
                          : toast.success("已退出，工具配置已保留"),
                      )
                      .catch((value) => toast.error(errorMessage(value)));
                  }}
                >
                  <LogOut />
                  退出登录
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        <main id="main-content" ref={main} className="app-main" tabIndex={-1}>
          <div
            className={cn("page-content", flow && "flow-content")}
            key={pathname}
          >
            {children}
          </div>
        </main>
      </div>
      <ConnectionDialog open={connect} onOpenChange={setConnect} />
      <AccountPanel
        open={account}
        onOpenChange={setAccount}
        onLogin={() => setConnect(true)}
      />
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            accountTrigger.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>开始使用 KunCode Setup</DialogTitle>
            <DialogDescription>
              选择工具，配置完成后即可启动。
            </DialogDescription>
          </DialogHeader>
          <ol className="guide-list">
            <li>
              <span>1</span>
              <div>
                <strong>选择工具</strong>
                <p>在首页选择 Codex、Claude Code 或 OpenCode。</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <strong>完成配置</strong>
                <p>选择模型，确认后程序会自动保存配置。</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <strong>启动工具</strong>
                <p>点击启动即可使用。有问题时，到系统诊断检查。</p>
              </div>
            </li>
          </ol>
          <Button
            onClick={() => {
              setHelp(false);
              navigate("/");
            }}
          >
            返回首页
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
