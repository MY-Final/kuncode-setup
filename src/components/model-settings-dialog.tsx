import { useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  ModelAdvancedSettings,
  selectedAdvanced,
  validateAdvanced,
} from "@/components/model-advanced-settings";
import { updateToolModelSettings } from "@/lib/tauri/api";
import type { AdvancedConfig, ToolDetail } from "@/lib/types";
import { errorMessage } from "@/lib/utils";

export function ModelSettingsDialog({
  detail,
  onClose,
  onDone,
}: {
  detail: ToolDetail;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const [advanced, setAdvanced] = useState<AdvancedConfig>(
    detail.advanced ?? { models: {} },
  );
  const [valid, setValid] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    if (busy || !valid) return;
    setBusy(true);
    setError(null);
    try {
      const selected = selectedAdvanced(
        advanced,
        detail.agentId === "claude" ? [detail.model] : detail.models,
      );
      validateAdvanced(selected, detail.agentId);
      await updateToolModelSettings(detail.agentId, selected);
      await onDone();
      onClose();
    } catch (value) {
      setError(errorMessage(value));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="model-settings-dialog" showCloseButton={!busy}>
        <DialogHeader>
          <DialogTitle>{detail.agentName} 模型设置</DialogTitle>
          <DialogDescription>
            调整当前模型的能力和参数。保存前会备份配置，之后可在配置详情恢复。
          </DialogDescription>
        </DialogHeader>
        <div className="model-settings-scroll">
          <ModelAdvancedSettings
            agentId={detail.agentId}
            defaultModel={detail.model}
            models={detail.models}
            value={advanced}
            onChange={setAdvanced}
            onValidityChange={setValid}
            expanded
          />
        </div>
        {error && (
          <p className="inline-error" role="alert">
            {error}
          </p>
        )}
        <div className="setup-form-footer">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            取消
          </Button>
          <Button disabled={busy || !valid} onClick={() => void save()}>
            {busy && <Loader2 className="animate-spin" />}保存模型设置
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
