import { Terminal, Asterisk, CodeXml } from "lucide-react";
import { cn } from "@/lib/utils";
const icons = { codex: Terminal, claude: Asterisk, opencode: CodeXml };
export function AgentIcon({
  id,
  className,
}: {
  id: string;
  className?: string;
}) {
  const Icon = icons[id as keyof typeof icons] ?? Terminal;
  return (
    <span className={cn("agent-icon", `agent-icon-${id}`, className)}>
      <Icon aria-hidden="true" />
    </span>
  );
}
