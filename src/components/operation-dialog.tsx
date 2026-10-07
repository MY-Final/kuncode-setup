import { useRef } from "react";
import { Check, Circle, Loader2, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export interface OperationStep {
  label: string;
  status: "waiting" | "running" | "complete" | "error" | "warning";
}
export interface OperationState {
  agentId?: string;
  title: string;
  description: string;
  phase: "running" | "success" | "error";
  steps: OperationStep[];
  progress?: number;
  error?: string;
  needsRepair?: boolean;
}

export function OperationDialog({
  operation,
  onClose,
  action,
}: {
  operation: OperationState | null;
  onClose: () => void;
  action?: { label: string; onClick: () => void };
}) {
  const running = operation?.phase === "running";
  const previousFocus = useRef<HTMLElement | null>(null);
  return (
    <Dialog
      open={!!operation}
      onOpenChange={(open) => {
        if (!open && !running) onClose();
      }}
    >
      <DialogContent
        className="operation-dialog"
        showCloseButton={!running}
        onOpenAutoFocus={() => {
          if (document.activeElement instanceof HTMLElement) {
            previousFocus.current = document.activeElement;
          }
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          if (previousFocus.current?.isConnected) previousFocus.current.focus();
          else document.getElementById("main-content")?.focus();
        }}
        onEscapeKeyDown={(event) => {
          if (running) event.preventDefault();
        }}
        onPointerDownOutside={(event) => {
          if (running) event.preventDefault();
        }}
      >
        <DialogHeader>
          <DialogTitle>{operation?.title}</DialogTitle>
          <DialogDescription>{operation?.description}</DialogDescription>
        </DialogHeader>
        <ol
          className="operation-steps"
          aria-label="执行进度"
          aria-busy={running}
        >
          {operation?.steps.map((step) => (
            <li key={step.label} className={step.status}>
              {step.status === "complete" ? (
                <Check />
              ) : step.status === "running" ? (
                <Loader2 className="animate-spin" />
              ) : step.status === "error" || step.status === "warning" ? (
                <AlertCircle />
              ) : (
                <Circle />
              )}
              <span>{step.label}</span>
              <small>
                {step.status === "complete"
                  ? "已完成"
                  : step.status === "running"
                    ? "进行中"
                    : step.status === "error"
                      ? "未完成"
                      : step.status === "warning"
                        ? "待确认"
                        : "等待中"}
              </small>
            </li>
          ))}
        </ol>
        {operation?.error && (
          <p className="operation-error" role="alert">
            {operation.error}
          </p>
        )}
        <Progress
          value={operation?.progress}
          className={
            running && operation?.progress === undefined
              ? "operation-progress indeterminate-progress"
              : "operation-progress"
          }
          aria-label="执行进度"
        />
        <div className="operation-footer" aria-live="polite">
          {running ? (
            <span>请稍候，完成后会自动显示结果。</span>
          ) : (
            <>
              <Button
                variant={action ? "outline" : "default"}
                onClick={onClose}
              >
                {operation?.phase === "error" ? "返回" : "完成"}
              </Button>
              {action && (
                <Button onClick={action.onClick}>{action.label}</Button>
              )}
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
