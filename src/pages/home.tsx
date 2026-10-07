import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  ArrowUpRight,
  RefreshCw,
  ShieldCheck,
  KeyRound,
  Monitor,
  Copy,
  FolderCode,
  Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PageHeader } from "@/components/layout/page-header";
import { AgentIcon } from "@/components/agent-icon";
import { SearchField } from "@/components/search-field";
import { StatusDot } from "@/components/status";
import { useApp } from "@/lib/store";
import { isTauri } from "@/lib/tauri/api";
import { cn } from "@/lib/utils";

export default function HomePage() {
  const { agents, environment, loading, error, refresh, configurations } =
    useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [detailId, setDetailId] = useState<string | null>(null);
  const detail = agents.find((a) => a.id === detailId);
  const visible = agents.filter(
    (a) =>
      (filter === "all" || a.installed) &&
      `${a.name} ${a.description}`.toLowerCase().includes(search.toLowerCase()),
  );
  async function detect() {
    if (await refresh())
      toast.success("环境检测已更新", {
        description: isTauri()
          ? "已读取本机工具安装状态。"
          : "已刷新演示检测数据。",
      });
  }
  return (
    <>
      <PageHeader
        title="工作台"
        description="把工具准备好，让每一次创作更从容。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={detect}
            disabled={loading}
          >
            <RefreshCw className={cn(loading && "animate-spin")} />
            重新检测
          </Button>
        }
      />
      <section className="welcome-surface">
        <div className="welcome-copy">
          <div className="eyebrow">
            <span className="tiny-line" />
            YOUR CODING, SIMPLIFIED
          </div>
          <h2>少一点配置，多一点创造。</h2>
          <p>
            连接 KunCode 与你的 AI 编程工具。
            <br />
            选择模型、确认配置，剩下的交给我们。
          </p>
          <Button onClick={() => navigate("/models")}>
            开始配置 <ArrowRight />
          </Button>
        </div>
        <ol className="welcome-steps">
          <li>
            <span>01</span>
            <div>
              <strong>选择你的工具</strong>
              <small>Codex、Claude Code 或 OpenCode</small>
            </div>
          </li>
          <li>
            <span>02</span>
            <div>
              <strong>找到合适的模型</strong>
              <small>按任务选择，随时调整</small>
            </div>
          </li>
          <li>
            <span>03</span>
            <div>
              <strong>确认后，安心写入</strong>
              <small>自动备份已有配置</small>
            </div>
          </li>
        </ol>
      </section>
      <section className="tools-section">
        <div className="section-heading">
          <div className="flex items-center gap-3">
            <h2>你的编程工具</h2>
            <span className="count-label">{agents.length} 个工具</span>
            {!isTauri() && <span className="demo-label">演示数据</span>}
          </div>
        </div>
        <div className="list-toolbar">
          <div className="segmented-control" aria-label="工具筛选">
            <button
              aria-pressed={filter === "all"}
              className={cn(filter === "all" && "selected")}
              onClick={() => setFilter("all")}
            >
              全部工具
            </button>
            <button
              aria-pressed={filter === "installed"}
              className={cn(filter === "installed" && "selected")}
              onClick={() => setFilter("installed")}
            >
              已安装
            </button>
          </div>
          <SearchField
            value={search}
            onChange={setSearch}
            placeholder="搜索工具…"
          />
        </div>
        <div className="tool-list" aria-live="polite">
          {error && (
            <div className="inline-error" role="alert">
              {error}
              <Button variant="ghost" onClick={detect}>
                重试
              </Button>
            </div>
          )}
          {loading && agents.length === 0 ? (
            <div className="empty-state">
              <RefreshCw className="animate-spin" />
              <h3>正在检测本机工具</h3>
              <p>请稍候，准备你的工作空间。</p>
            </div>
          ) : (
            visible.map((agent) => (
              <div className="tool-row" key={agent.id}>
                <button
                  className="tool-identity"
                  onClick={() => setDetailId(agent.id)}
                  aria-label={`查看 ${agent.name} 详情`}
                >
                  <AgentIcon id={agent.id} />
                  <div>
                    <h3>
                      {agent.name}
                      <ArrowUpRight />
                    </h3>
                    <p>{agent.description}</p>
                  </div>
                </button>
                <div className="tool-version">
                  {agent.version ?? "等待安装"}
                  {configurations[agent.id] && (
                    <small>
                      {configurations[agent.id].model} ·{" "}
                      {configurations[agent.id].demo
                        ? "演示已配置"
                        : "本次已配置"}
                    </small>
                  )}
                </div>
                <span
                  className={cn(
                    "installation-status",
                    agent.installed && "installed",
                  )}
                >
                  <StatusDot kind={agent.installed ? "ok" : "missing"} />
                  {agent.installed ? "已安装" : "未安装"}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate(`/setup/${agent.id}`)}
                >
                  配置工具 <ArrowRight />
                </Button>
              </div>
            ))
          )}
          {!loading && visible.length === 0 && !error && (
            <div className="empty-state">
              <FolderCode />
              <h3>{search ? "没有找到匹配的工具" : "暂时没有已安装的工具"}</h3>
              <p>
                {search
                  ? "试试工具名称，或清除搜索条件。"
                  : "安装 CLI 后重新检测，或先体验演示配置。"}
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                查看全部工具
              </Button>
            </div>
          )}
        </div>
      </section>
      <section className="environment-strip">
        <span className="environment-icon">
          <Monitor />
        </span>
        <div>
          <h3>
            {loading
              ? "正在检查开发环境"
              : environment?.tools.every((t) => t.installed)
                ? "开发环境已就绪"
                : "检查你的开发环境"}
          </h3>
          <p>
            {environment
              ? `${environment.os} · ${environment.tools.map((t) => `${t.name} ${t.installed ? "已安装" : "未安装"}`).join("  /  ")}`
              : "检测操作系统、Node.js、npm 和 Git"}
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate("/diagnose")}>
          查看诊断 <ArrowUpRight />
        </Button>
      </section>
      <div className="workspace-notes">
        <div>
          <ShieldCheck />
          <p>
            <strong>每次改动，都有准备</strong>
            <span>写入前预览，已有配置自动备份。</span>
          </p>
        </div>
        <div>
          <KeyRound />
          <p>
            <strong>凭据不进入应用存储</strong>
            <span>API Key 仅在内存与工具配置中使用。</span>
          </p>
        </div>
      </div>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetailId(null);
        }}
      >
        <DialogContent>
          {detail && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-3 mb-2">
                  <AgentIcon id={detail.id} />
                  <DialogTitle>{detail.name}</DialogTitle>
                </div>
                <DialogDescription>
                  {detail.description}
                  {!isTauri() && " · 以下为演示检测结果"}
                </DialogDescription>
              </DialogHeader>
              <dl className="detail-list">
                <div>
                  <dt>安装状态</dt>
                  <dd>
                    <StatusDot kind={detail.installed ? "ok" : "missing"} />
                    {detail.installed ? "已安装" : "未安装"}
                  </dd>
                </div>
                <div>
                  <dt>版本</dt>
                  <dd>{detail.version ?? "尚未检测到"}</dd>
                </div>
                <div>
                  <dt>可执行文件</dt>
                  <dd className="mono">
                    {detail.path ?? "安装后重新检测即可识别"}
                  </dd>
                </div>
              </dl>
              {!detail.installed && (
                <p className="notice-text">
                  KunCode Setup 当前负责配置，不会自动安装 CLI 工具。
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        detail.id === "claude" ? "claude" : detail.id,
                      );
                      toast.success("启动命令已复制");
                    } catch {
                      toast.error("复制失败，请检查剪贴板权限");
                    }
                  }}
                >
                  <Copy />
                  复制命令
                </Button>
                <Button
                  onClick={() => {
                    setDetailId(null);
                    navigate(`/setup/${detail.id}`);
                  }}
                >
                  <Terminal />
                  配置工具
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
