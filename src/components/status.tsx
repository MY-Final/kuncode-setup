import { CheckCircle2, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

type StatusKind = "ok" | "missing" | "warn" | "neutral";

export function StatusIcon({
  kind,
  className,
}: {
  kind: StatusKind;
  className?: string;
}) {
  if (kind === "ok")
    return <CheckCircle2 className={cn("size-4 text-success", className)} />;
  if (kind === "missing")
    return (
      <Circle className={cn("size-4 text-muted-foreground/50", className)} />
    );
  if (kind === "warn")
    return <AlertTriangle className={cn("size-4 text-warning", className)} />;
  return (
    <Circle className={cn("size-4 text-muted-foreground/40", className)} />
  );
}

export function StatusDot({ kind }: { kind: StatusKind }) {
  const color =
    kind === "ok"
      ? "bg-success"
      : kind === "warn"
        ? "bg-warning"
        : kind === "missing"
          ? "bg-muted-foreground/40"
          : "bg-muted-foreground/30";
  return <span className={cn("inline-block size-2 rounded-full", color)} />;
}
