import { useEffect, useRef, useState, type FormEvent } from "react";
import { Loader2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useApp } from "@/lib/store";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";
import type { ConnectionStep, ConnectionSummary } from "@/lib/types";

export function ConnectionDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected?: (connection: ConnectionSummary) => void;
}) {
  const { refreshConnections, authorizationSite } = useApp();
  const [mode, setMode] = useState<"official" | "newapi_pat" | "api_key">(
    "official",
  );
  const [site, setSite] = useState("https://kuncode.120403.xyz");
  const [credential, setCredential] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [userId, setUserId] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<ConnectionStep[]>([]);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<string | null>(null);
  const importing = useRef(false);
  useEffect(() => {
    if (open) {
      setMode("official");
      setError(null);
      setSteps([]);
    } else {
      setCredential("");
    }
  }, [open]);
  useEffect(
    () => () => {
      const id = attempt.current;
      if (id) void api.cancelLogin(id).catch(() => undefined);
    },
    [],
  );
  async function cancel() {
    if (importing.current) return;
    const id = attempt.current;
    if (id) {
      try {
        await api.cancelLogin(id);
      } catch (value) {
        setError(errorMessage(value));
        return;
      }
      attempt.current = null;
    }
    setBusy(false);
    setCredential("");
    onOpenChange(false);
  }
  async function finish(connection: ConnectionSummary) {
    await refreshConnections();
    onConnected?.(connection);
    onOpenChange(false);
  }
  async function login() {
    if (busy) return;
    const id = crypto.randomUUID();
    attempt.current = id;
    setBusy(true);
    setError(null);
    setSteps([]);
    try {
      const connection = await api.startLogin(id, (step) => {
        if (attempt.current !== id) return;
        setSteps((previous) => [
          ...previous.filter((item) => item.step !== step.step),
          step,
        ]);
      });
      if (attempt.current === id) await finish(connection);
    } catch (value) {
      if (attempt.current === id) setError(errorMessage(value));
    } finally {
      if (attempt.current === id) {
        attempt.current = null;
        setBusy(false);
      }
    }
  }
  async function connect(event: FormEvent) {
    event.preventDefault();
    if (busy || mode === "official") return;
    setBusy(true);
    setError(null);
    importing.current = true;
    try {
      const request = api.importConnection({
        kind: mode,
        siteUrl: site.trim(),
        credential: credential.trim(),
        ...(apiBase.trim() ? { apiBaseUrl: apiBase.trim() } : {}),
        ...(userId.trim() && mode === "newapi_pat"
          ? { userId: Number(userId) }
          : {}),
      });
      setCredential("");
      await finish(await request);
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      importing.current = false;
      setBusy(false);
    }
  }
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) void cancel();
      }}
    >
      <DialogContent
        showCloseButton={!busy}
        onEscapeKeyDown={(event) => {
          if (busy) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (busy) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>
            {busy && mode === "official"
              ? "等待浏览器授权"
              : "连接 Coding Tools"}
          </DialogTitle>
          <DialogDescription>
            {mode === "official"
              ? "在 KunCode 网站登录并确认，程序会自动完成工具配置。"
              : mode === "newapi_pat"
                ? "使用站点的用户 Token，程序为每个工具创建独立密钥。"
                : "使用已有 API Key 连接模型服务，无需账户管理接口。"}
          </DialogDescription>
        </DialogHeader>
        {!api.isTauri() && (
          <p className="page-footnote" role="status">
            浏览器仅提供演示，真实登录请在 Windows 桌面应用中完成。
          </p>
        )}
        {mode === "official" ? (
          <>
            <p className="page-footnote">授权服务：{authorizationSite}</p>
            {busy ? (
              <div
                className="connection-wait"
                aria-live="polite"
                aria-busy="true"
              >
                <ol className="operation-steps">
                  {steps.map((step) => (
                    <li key={step.step} className={step.status}>
                      <span>{step.step}</span>
                      <small>
                        {step.status === "complete" ? "已完成" : "进行中"}
                      </small>
                    </li>
                  ))}
                </ol>
                <Progress
                  className="indeterminate-progress"
                  aria-label="授权进度"
                />
                <Button variant="outline" onClick={() => void cancel()}>
                  取消登录
                </Button>
              </div>
            ) : (
              <div className="connection-entry">
                <Button onClick={() => void login()} disabled={!api.isTauri()}>
                  登录 KunCode <ExternalLink />
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setMode("newapi_pat");
                    setError(null);
                  }}
                >
                  连接其他站点
                </Button>
              </div>
            )}
          </>
        ) : (
          <form onSubmit={connect} className="connection-form">
            <fieldset disabled={busy} className="connection-modes">
              <legend className="sr-only">连接方式</legend>
              <label>
                <input
                  type="radio"
                  name="connection-mode"
                  checked={mode === "newapi_pat"}
                  onChange={() => {
                    setMode("newapi_pat");
                    setError(null);
                  }}
                />
                用户 Token
              </label>
              <label>
                <input
                  type="radio"
                  name="connection-mode"
                  checked={mode === "api_key"}
                  onChange={() => {
                    setMode("api_key");
                    setError(null);
                  }}
                />
                API Key
              </label>
            </fieldset>
            <div className="form-field">
              <Label htmlFor="connection-site">站点地址</Label>
              <Input
                id="connection-site"
                value={site}
                onChange={(event) => setSite(event.target.value)}
                placeholder="https://example.com"
                disabled={busy}
                required
              />
            </div>
            <div className="form-field">
              <Label htmlFor="connection-secret">
                {mode === "newapi_pat" ? "用户 Token" : "API Key"}
              </Label>
              <Input
                id="connection-secret"
                type="password"
                autoComplete="off"
                spellCheck={false}
                value={credential}
                onChange={(event) => setCredential(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <details className="technical-details">
              <summary>高级选项（可选）</summary>
              <div className="form-field">
                <Label htmlFor="connection-api-base">模型服务地址</Label>
                <Input
                  id="connection-api-base"
                  value={apiBase}
                  onChange={(event) => setApiBase(event.target.value)}
                  placeholder="默认：站点地址/v1"
                  disabled={busy}
                />
              </div>
              {mode === "newapi_pat" && (
                <div className="form-field">
                  <Label htmlFor="connection-user-id">旧版站点用户 ID</Label>
                  <Input
                    id="connection-user-id"
                    type="number"
                    min="1"
                    step="1"
                    value={userId}
                    onChange={(event) => setUserId(event.target.value)}
                    disabled={busy}
                  />
                </div>
              )}
            </details>
            <div className="setup-form-footer">
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => setMode("official")}
              >
                返回
              </Button>
              <Button type="submit" disabled={busy || !api.isTauri()}>
                {busy && <Loader2 className="animate-spin" />}连接站点
              </Button>
            </div>
          </form>
        )}
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
