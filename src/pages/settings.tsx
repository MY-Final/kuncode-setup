import type { ReactNode } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { useApp } from "@/lib/store";

export default function SettingsPage() {
  const { session, logout } = useApp();

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="设置" description="账户与应用信息" />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">KunCode 账户</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {session ? (
            <>
              <Row label="账号" value={session.account} />
              <Separator />
              <Row label="余额" value={session.balance} />
              <Separator />
              <button
                onClick={logout}
                className="text-destructive text-xs font-medium hover:underline"
              >
                退出登录
              </button>
            </>
          ) : (
            <p className="text-muted-foreground text-xs">
              尚未登录。开始配置某个 Agent 时会引导你登录 KunCode。
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">关于</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <Row label="版本" value="v0.1.0" />
          <Separator />
          <Row label="平台" value="Windows" />
          <Separator />
          <Row
            label="配置备份"
            value={<Badge variant="secondary">自动 · 可回滚</Badge>}
          />
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        安全提示：API Key 仅保存在本机，不会上传到第三方。日志中不会记录
        Key、密码或 Token。
      </p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
