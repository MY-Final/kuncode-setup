import { PageHeader } from "@/components/layout/page-header";
import { ToolList } from "@/components/tool-list";
export default function ModelsPage() {
  return (
    <div className="tools-page">
      <PageHeader title="工具配置" description="选择工具，配置或启动。" />
      <ToolList management />
    </div>
  );
}
