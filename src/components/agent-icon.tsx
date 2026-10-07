import { Terminal } from "lucide-react";
import { cn } from "@/lib/utils";

export function AgentIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  return (
    <span
      className={cn("agent-icon", `agent-icon-${id}`, className)}
      aria-hidden="true"
    >
      {id === "codex" ? (
        <img src="/openai.svg" alt="" />
      ) : id === "claude" ? (
        <svg viewBox="0 0 40 40" fill="none">
          {Array.from({ length: 12 }, (_, i) => (
            <path
              key={i}
              d="M20 3.5 20 13.5"
              stroke="currentColor"
              strokeWidth={i % 3 === 0 ? 3.6 : 2.8}
              strokeLinecap="round"
              transform={`rotate(${i * 30 + 8} 20 20)`}
            />
          ))}
        </svg>
      ) : id === "opencode" ? (
        <svg viewBox="0 0 40 40" fill="none">
          <path
            d="m20 2 17 17a2 2 0 0 1 0 2L20 38 3 21a2 2 0 0 1 0-2L20 2Z"
            fill="#163875"
          />
          <path d="m20 2 9 9-9 9-9-9 9-9Z" fill="#76A6FC" />
          <path d="m20 20 9 9-9 9-9-9 9-9Z" fill="#082756" />
          <path d="m20 11 9 9-9 9-9-9 9-9Z" fill="#F3F7FF" />
        </svg>
      ) : (
        <Terminal />
      )}
    </span>
  );
}
