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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import type { SiteGroup, SiteToken } from "@/lib/types";
import { errorMessage } from "@/lib/utils";
import {
  cacheSiteTokens,
  formatCacheAge,
  readCachedGroupModels,
  readCachedSiteTokens,
  cacheGroupModels,
} from "@/lib/cache";

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
  const [groupModels, setGroupModels] = useState<string[]>([]);
  const [limits, setLimits] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<SiteToken | null>(null);
  const [offlineAt, setOfflineAt] = useState<number | null>(null);

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
      setOfflineAt(null);
      cacheSiteTokens(id, tokenValues);
    } catch (value) {
      // 网络不可用时降级展示上次缓存的密钥列表。
      const cached = readCachedSiteTokens(id);
      if (cached) {
        setTokens(cached.tokens);
        setOfflineAt(cached.at);
        setError(null);
      } else {
        setError(errorMessage(value));
        setTokens([]);
      }
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

  useEffect(() => {
    if (!creating && editing === null) return;
    if (!connectionId || !group) {
      setGroupModels([]);
      return;
    }
    let active = true;
    api
      .groupModels(connectionId, group)
      .then((values) => {
        if (!active) return;
        setGroupModels(values);
        if (values.length) cacheGroupModels(connectionId, group, values);
      })
      .catch(() => {
        if (!active) return;
        // 离线时回退到缓存的分组模型。
        setGroupModels(readCachedGroupModels(connectionId, group) ?? []);
      });
    return () => {
      active = false;
    };
  }, [creating, editing, connectionId, group]);
  function openCreate() {
    setCreating(true);
    setEditing(null);
    setName("");
    setGroup(groups[0]?.name ?? "");
    setLimits([]);
  }
  function openEdit(token: SiteToken) {
    setEditing(token);
    setCreating(false);
    setName(token.name);
    setGroup(token.group || groups[0]?.name || "");
    setLimits(token.modelLimits);
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
          limits,
        );
      } else {
        await api.createSiteToken(connectionId, name.trim(), group, limits);
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
  async function confirmDelete() {
    const token = pendingDelete;
    if (!connectionId || !token) return;
    setPendingDelete(null);
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
      {offlineAt !== null && (
        <p className="inline-notice" role="status">
          网络不可用，正在显示 {formatCacheAge(offlineAt)} 的缓存密钥列表。
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
                  onClick={() => setPendingDelete(token)}
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
          <div className="form-field">
            <Label>允许的模型</Label>
            <p className="page-footnote">
              不勾选表示该密钥可使用分组内全部模型。
            </p>
            <div className="key-model-list">
              {groupModels.length === 0 && (
                <span className="page-footnote">该分组暂无模型数据。</span>
              )}
              {groupModels.map((item) => (
                <label key={item} className="key-model-item">
                  <input
                    type="checkbox"
                    checked={limits.includes(item)}
                    onChange={() =>
                      setLimits((previous) =>
                        previous.includes(item)
                          ? previous.filter((id) => id !== item)
                          : [...previous, item],
                      )
                    }
                  />
                  {item}
                </label>
              ))}
            </div>
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
      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              删除密钥「{pendingDelete?.name}」？
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete && pendingDelete.boundAgents.length > 0
                ? `该密钥正被 ${pendingDelete.boundAgents.length} 个工具引用，需要先解绑再删除。`
                : "删除后无法恢复，使用该密钥的工具将无法连接。"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void confirmDelete()}
              disabled={(pendingDelete?.boundAgents.length ?? 0) > 0}
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
