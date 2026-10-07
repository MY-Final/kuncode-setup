import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Star, Check } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";

/**
 * MVP 占位：模型列表最终由 KunCode 服务端 /api/setup/models 提供，
 * 不在客户端硬编码。当前用演示数据渲染交互骨架。
 */
interface ModelItem {
  id: string;
  name: string;
  description: string;
  recommended?: boolean;
  price?: string;
}

const MODELS: ModelItem[] = [
  {
    id: "gpt-5.6-luna",
    name: "GPT-5.6 Luna",
    description: "日常 Coding / 性价比高",
    recommended: true,
    price: "¥0.01 / 1K",
  },
  {
    id: "gpt-6-astra",
    name: "GPT-6 Astra",
    description: "高难度 Coding",
    price: "¥0.03 / 1K",
  },
  {
    id: "claude-sonnet",
    name: "Claude Sonnet",
    description: "复杂任务 / 长上下文",
    price: "¥0.02 / 1K",
  },
];

export default function ModelsPage() {
  const { agents, draft, setDraft } = useApp();
  const [agentId, setAgentId] = useState(
    draft?.agentId ?? agents[0]?.id ?? "codex",
  );
  const [modelId, setModelId] = useState(draft?.model ?? "gpt-5.6-luna");
  const navigate = useNavigate();

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="选择模型"
        description="模型列表将由 KunCode 服务端提供，价格由服务端计算。"
      />

      <div className="mb-5 flex flex-wrap gap-2">
        {agents.map((a) => (
          <Button
            key={a.id}
            size="sm"
            variant={a.id === agentId ? "default" : "outline"}
            onClick={() => setAgentId(a.id)}
          >
            {a.name}
          </Button>
        ))}
      </div>

      <div className="space-y-3">
        {MODELS.map((m) => {
          const selected = m.id === modelId;
          return (
            <Card
              key={m.id}
              onClick={() => setModelId(m.id)}
              className={cn(
                "cursor-pointer transition-all",
                selected
                  ? "border-primary ring-primary/20 ring-2"
                  : "hover:shadow-md",
              )}
            >
              <CardContent className="flex items-center gap-4 p-4">
                <div
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    selected
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary",
                  )}
                >
                  {selected ? (
                    <Check className="size-4" />
                  ) : (
                    <Star className="size-4" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">{m.name}</span>
                    {m.recommended && (
                      <Badge variant="secondary" className="gap-1">
                        <Star className="size-3" /> 推荐
                      </Badge>
                    )}
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-xs">
                    {m.description}
                  </p>
                  <p className="text-muted-foreground/70 mt-1 font-mono text-[11px]">
                    {m.id}
                  </p>
                </div>
                {m.price && (
                  <span className="text-muted-foreground text-xs">
                    {m.price}
                  </span>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="mt-6 flex justify-end">
        <Button
          onClick={() => {
            setDraft({
              agentId,
              model: modelId,
              baseUrl: draft?.baseUrl ?? "https://api.kuncode.ai/v1",
              apiKey: draft?.apiKey ?? "sk-kuncode-demo-key-1234",
            });
            navigate(`/setup/${agentId}`);
          }}
        >
          继续配置
        </Button>
      </div>
    </div>
  );
}
