import { useCallback, useEffect, useState } from "react";
import { KeyRound, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import type { SiteGroup, SiteToken } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

const AGENT_LABELS: Record<string, string> = {
  codex: "Codex",
  claude: "Claude Code",
  opencode: "OpenCode",
};

export default function KeysPage() {
  const { connections } = useApp();
  const [connectionId, setConnectionId] = useState("");
  const [tokens, setTokens] = useState<SiteToken[]>([]);
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<SiteToken | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [group, setGroup] = useState("");
  const [saving, setSaving] = useState(false);

  const usableConnections = connections.filter((item) => item.connected);
  const usableIds = usableConnections.map((item) => item.id).join(",");

  const load = useCallback(async (id: string) => {
    if (!id) {
      setTokens([]);
      setGroups([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [tokenValues, groupValues] = await Promise.all([
        api.listSiteTokens(id),
        api.siteGroups(id).catch(() => [] as SiteGroup[]),
      ]);
      setTokens(tokenValues);
      setGroups(groupValues);
    } catch (value) {
      setError(errorMessage(value));
      setTokens([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const first = usableIds ? usableIds.split(",")[0] : "";
    if (!connectionId || !usableIds.includes(connectionId)) {
      if (first) setConnectionId(first);
      else setConnectionId("");
      return;
    }
    void load(connectionId);
  }, [connectionId, load, usableIds]);

  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setGroup(groups[0]?.name ?? "");
  }
  function openEdit(token: SiteToken) {
    setEditing(token);
    setCreating(false);
    setName(token.name);
    setGroup(token.group || groups[0]?.name || "");
  }
  async function save() {
    if (saving || !name.trim() || !connectionId) return;
    setSaving(true);
    setError(null);
    try {
      if (editing) {
        await api.updateSiteToken(
          connectionId,
          editing.id,
          name.trim(),
          group,
          editing.modelLimits,
        );
      } else {
        await api.createSiteToken(connectionId, name.trim(), group, []);
      }
      setCreating(false);
      setEditing(null);
      await load(connectionId);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setSaving(false);
    }
  }
  async function remove(token: SiteToken) {
    if (!connectionId) return;
    setError(null);
    try {
      await api.deleteSiteToken(connectionId, token.id);
      await load(connectionId);
    } catch (value) {
      setError(errorMessage(value));
    }
  }

  return (
    <div className="tools-page">
      <PageHeader
        title="密钥与分组"
        description="管理站点密钥，并把它绑定到 Coding 工具。"
        actions={
          <div className="connection-entry">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load(connectionId)}
              disabled={loading || !connectionId}
            >
              <RefreshCw className={loading ? "animate-spin" : undefined} />
              刷新
            </Button>
            <Button size="sm" onClick={openCreate} disabled={!connectionId}>
              <Plus />
              新建密钥
            </Button>
          </div>
        }
      />
      {usableConnections.length > 1 && (
        <div className="form-field">
          <Label htmlFor="keys-connection">站点连接</Label>
          <select
            id="keys-connection"
            className="model-select"
            value={connectionId}
            onChange={(event) => setConnectionId(event.target.value)}
          >
            {usableConnections.map((item) => (
              <option key={item.id} value={item.id}>
                {item.account ?? new URL(item.siteUrl).host}
              </option>
            ))}
          </select>
        </div>
      )}
      {!api.isTauri() && (
        <p className="diagnostic-summary">
          当前为演示结果，Windows 应用会读取真实站点密钥。
        </p>
      )}
      {error && (
        <p className="inline-error" role="alert">
          {error}
        </p>
      )}
      {!connectionId && !loading && (
        <p className="page-footnote">请先登录 KunCode，再管理密钥。</p>
      )}
      {loading && (
        <p role="status">
          <Loader2 className="animate-spin inline" />
          正在读取密钥…
        </p>
      )}
      {!loading && connectionId && (
        <section className="coding-tools" aria-label="站点密钥">
          {tokens.length === 0 && (
            <div className="empty-state" role="status">
              <KeyRound />
              这个账户还没有密钥，点击「新建密钥」创建一个。
            </div>
          )}
          {tokens.map((token) => (
            <article className="coding-tool" key={token.id}>
              <KeyRound aria-hidden="true" />
              <div className="coding-tool-copy">
                <h3>{token.name}</h3>
                <p>{token.maskedKey}</p>
                <span className="tool-state">
                  {token.group ? `分组 ${token.group}` : "默认分组"}
                  {" · "}
                  {token.unlimitedQuota
                    ? "无限额度"
                    : `剩余 ${token.remainQuota}`}
                  {token.boundAgents.length > 0 &&
                    ` · 已用于 ${token.boundAgents
                      .map((id) => AGENT_LABELS[id] ?? id)
                      .join("、")}`}
                </span>
              </div>
              <div className="tool-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(token)}
                >
                  编辑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void remove(token)}
                  disabled={token.boundAgents.length > 0}
                  title={
                    token.boundAgents.length > 0
                      ? "仍被工具使用，先解绑再删除"
                      : undefined
                  }
                >
                  <Trash2 />
                  删除
                </Button>
              </div>
            </article>
          ))}
        </section>
      )}
      <Dialog
        open={creating || editing !== null}
        onOpenChange={(value) => {
          if (!value) {
            setCreating(false);
            setEditing(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "编辑密钥" : "新建密钥"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "修改密钥名称或分组，不会改变密钥本身。"
                : "创建后会生成一把新密钥，明文只在创建时显示一次。"}
            </DialogDescription>
          </DialogHeader>
          <div className="form-field">
            <Label htmlFor="key-name">名称</Label>
            <Input
              id="key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={50}
              required
            />
          </div>
          <div className="form-field">
            <Label htmlFor="key-group">分组</Label>
            <select
              id="key-group"
              className="model-select"
              value={group}
              onChange={(event) => setGroup(event.target.value)}
            >
              {groups.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.description
                    ? `${item.name} · ${item.description}`
                    : item.name}
                </option>
              ))}
            </select>
            <p className="page-footnote">分组决定费率、可用模型与限速。</p>
          </div>
          <div className="setup-form-footer">
            <Button
              variant="outline"
              onClick={() => {
                setCreating(false);
                setEditing(null);
              }}
            >
              取消
            </Button>
            <Button
              onClick={() => void save()}
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="animate-spin" />}
              {editing ? "保存" : "创建"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
