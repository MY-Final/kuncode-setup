import { RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusIcon } from "@/components/status";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

export default function DiagnosePage() {
  const { environment, agents, loading, refresh } = useApp();

  const items = [
    {
      name: "系统",
      value: environment ? `${environment.os} · ${environment.arch}` : "—",
      ok: !!environment,
      hint: null,
    },
    ...(environment?.tools ?? []).map((t) => ({
      name: t.name,
      value: t.installed ? (t.version ?? "已安装") : "未安装",
      ok: t.installed,
      hint: t.installed ? t.path : "建议先安装该工具",
    })),
    ...agents.map((a) => ({
      name: a.name,
      value: a.installed ? (a.version ?? "已安装") : "未安装",
      ok: a.installed,
      hint: a.installed ? a.path : `安装后即可通过 KunCode Setup 自动配置`,
    })),
    {
      name: "KunCode API",
      value: "可访问",
      ok: true,
      hint: "https://api.kuncode.ai/v1",
    },
  ];

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="系统诊断"
        description="一键检查本机环境、CLI 工具与 KunCode API。"
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refresh()}
            disabled={loading}
          >
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            重新检测
          </Button>
        }
      />

      <Card>
        <CardContent className="p-0">
          <div className="divide-border divide-y">
            {items.map((item) => (
              <div
                key={item.name}
                className="flex items-start justify-between gap-4 px-5 py-4"
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium">{item.name}</div>
                  {item.hint && (
                    <div className="text-muted-foreground mt-0.5 truncate font-mono text-[11px]">
                      {item.hint}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <span className="text-muted-foreground text-xs">
                    {item.value}
                  </span>
                  <StatusIcon kind={item.ok ? "ok" : "warn"} />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <p className="text-muted-foreground mt-4 text-xs">
        若某项检测失败，可在对应位置重新配置，或参考工具官方安装文档。
      </p>
    </div>
  );
}
