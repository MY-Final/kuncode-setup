import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import type { AgentMeta, SiteGroup, SiteToken } from "@/lib/types";
import { cn, errorMessage } from "@/lib/utils";

/**
 * 换绑密钥：为某个已配置的工具重新选择密钥、分组与模型，
 * 直接重跑该工具的 apply，不需要重走整条向导。
 */
export function RebindDialog({
  agent,
  onOpenChange,
  onDone,
}: {
  agent: AgentMeta | null;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}) {
  const { connections, configurations, refreshConnections } = useApp();
  const config = agent ? configurations[agent.id] : undefined;
  const [connectionId, setConnectionId] = useState("");
  const [tokens, setTokens] = useState<SiteToken[]>([]);
  const [groups, setGroups] = useState<SiteGroup[]>([]);
  const [tokenId, setTokenId] = useState<number | null>(null);
  const [group, setGroup] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pinging, setPinging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 打开某个工具时初始化默认选择；切换工具才重置，store 刷新不清空。
  useEffect(() => {
    if (!agent) return;
    setConnectionId(config?.connectionId ?? "");
    setTokenId(config?.tokenId ?? null);
    setGroup(config?.group ?? "");
    setModels([]);
    setSelectedModels([]);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  useEffect(() => {
    if (!agent || !connectionId) return;
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      api.listSiteTokens(connectionId),
      api.siteGroups(connectionId).catch(() => [] as SiteGroup[]),
    ])
      .then(([tokenValues, groupValues]) => {
        if (!active) return;
        const usable = tokenValues.filter((item) => item.status === 1);
        setTokens(usable);
        setGroups(groupValues);
        setTokenId((previous) =>
          usable.some((item) => item.id === previous)
            ? previous
            : (usable[0]?.id ?? null),
        );
        const first = usable[0];
        if (first) {
          setGroup((previous) =>
            previous && groupValues.some((item) => item.name === previous)
              ? previous
              : first.group || groupValues[0]?.name || "",
          );
        }
      })
      .catch((value: unknown) => {
        if (active) setError(errorMessage(value));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [agent?.id, connectionId]);

  useEffect(() => {
    if (!agent || !connectionId || !group) return;
    let active = true;
    api
      .groupModels(connectionId, group)
      .then((values) =>
        values.length ? values : api.connectionModels(connectionId),
      )
      .then((values) => {
        if (!active) return;
        setModels(values);
        setSelectedModels((previous) => {
          const kept = previous.filter((item) => values.includes(item));
          if (kept.length) return kept;
          return values.length ? [values[0]] : [];
        });
      })
      .catch(() => {
        if (active) setModels([]);
      });
    return () => {
      active = false;
    };
  }, [agent?.id, connectionId, group]);

  /** 对所有已连接站点测速，自动选择延迟最低的一个。 */
  async function pickFastest() {
    if (pinging) return;
    setPinging(true);
    try {
      const online = connections.filter(
        (item) => item.connected && item.kind !== "api_key",
      );
      const results = await Promise.all(
        online.map(async (item) => ({
          id: item.id,
          ms: await api.pingConnection(item.id).catch(() => null),
        })),
      );
      const reachable = results.filter(
        (item): item is { id: string; ms: number } => item.ms != null,
      );
      if (!reachable.length) {
        setError("没有可访问的连接");
        return;
      }
      reachable.sort((a, b) => a.ms - b.ms);
      setConnectionId(reachable[0].id);
    } finally {
      setPinging(false);
    }
  }

  const defaultModel = selectedModels[0] ?? "";

  function toggle(model: string) {
    setSelectedModels((previous) =>
      previous.includes(model)
        ? previous.filter((item) => item !== model)
        : [...previous, model],
    );
  }

  async function submit() {
    if (!agent || busy || !tokenId || !defaultModel) return;
    setBusy(true);
    setError(null);
    try {
      const outcome = await api.applyConnection(
        connectionId,
        agent.id,
        defaultModel,
        () => undefined,
        tokenId,
        group || undefined,
        selectedModels,
      );
      await refreshConnections();
      if (outcome.binding.status !== "ready") {
        throw new Error(
          outcome.steps.find((step) => step.status === "error")?.detail ??
            "密钥未通过检查，请重新选择密钥或修复配置",
        );
      }
      if (!outcome.binding.verified) {
        setError(
          outcome.steps.find((step) => step.status === "warning")?.detail ??
            "配置已保存，但连接尚未验证，请稍后检查",
        );
        return;
      }
      onDone();
      onOpenChange(false);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!agent} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>换绑 {agent?.name} 的密钥</DialogTitle>
          <DialogDescription>
            选择新的密钥、分组与模型，程序会重新写入配置，无需重走整条向导。
          </DialogDescription>
        </DialogHeader>
        {loading && (
          <p role="status">
            <Loader2 className="animate-spin inline" />
            正在读取站点密钥…
          </p>
        )}
        {connections.filter((item) => item.connected).length > 1 && (
          <div className="form-field">
            <Label htmlFor="rebind-connection">站点连接</Label>
            <Select value={connectionId} onValueChange={setConnectionId}>
              <SelectTrigger id="rebind-connection" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {connections
                  .filter((item) => item.connected)
                  .map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.alias ?? item.account ?? new URL(item.siteUrl).host}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void pickFastest()}
              disabled={pinging}
            >
              {pinging && <Loader2 className="animate-spin" />}
              选择列表响应最快的连接
            </Button>
          </div>
        )}
        <div className="form-field">
          <Label htmlFor="rebind-token">密钥</Label>
          <Select
            value={tokenId != null ? String(tokenId) : ""}
            onValueChange={(value) => setTokenId(Number(value))}
          >
            <SelectTrigger id="rebind-token" className="w-full">
              <SelectValue placeholder="暂无可用密钥" />
            </SelectTrigger>
            <SelectContent>
              {tokens.map((token) => (
                <SelectItem key={token.id} value={String(token.id)}>
                  {token.name} · {token.maskedKey}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {groups.length > 0 && (
          <div className="form-field">
            <Label htmlFor="rebind-group">分组</Label>
            <Select value={group} onValueChange={setGroup}>
              <SelectTrigger id="rebind-group" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map((item) => (
                  <SelectItem key={item.name} value={item.name}>
                    {item.description
                      ? `${item.name} · ${item.description}`
                      : item.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="form-field">
          <Label>模型</Label>
          <p className="page-footnote">
            第一个勾选的模型作为默认模型；可多选。
          </p>
          <div className="setup-models" role="group" aria-label="选择模型">
            {models.length === 0 && (
              <span className="page-footnote">该分组暂无可用模型。</span>
            )}
            {models.map((model) => {
              const checked = selectedModels.includes(model);
              const isDefault = defaultModel === model;
              const checkboxId = `rebind-model-${agent?.id}-${model}`;
              return (
                <label
                  key={model}
                  className={cn("model-row", checked && "selected")}
                  htmlFor={checkboxId}
                >
                  <Checkbox
                    id={checkboxId}
                    checked={checked}
                    onCheckedChange={() => toggle(model)}
                    aria-label={model}
                  />
                  <span className="model-copy">
                    <strong>
                      {model}
                      {isDefault && " · 默认"}
                    </strong>
                  </span>
                </label>
              );
            })}
          </div>
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="setup-form-footer">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            取消
          </Button>
          <Button
            onClick={() => void submit()}
            disabled={busy || !tokenId || !defaultModel}
          >
            {busy && <Loader2 className="animate-spin" />}换绑密钥
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
