import { useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/layout/page-header";
import * as api from "@/lib/tauri/api";
import { errorMessage } from "@/lib/utils";

export default function ShopPage() {
  const { connectionId = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [frameLoading, setFrameLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const [opening, setOpening] = useState(false);
  const state = location.state as { returnTo?: string } | null;
  const returnTo =
    state?.returnTo?.startsWith("/") && !state.returnTo.startsWith("//")
      ? state.returnTo
      : "/";

  useEffect(() => {
    let active = true;
    setLoading(true);
    setFrameLoading(true);
    setError(null);
    setUrl(null);
    api
      .connectionShopUrl(connectionId)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch((value) => {
        if (active) setError(errorMessage(value));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [connectionId, revision]);

  async function openBrowser() {
    if (opening) return;
    setOpening(true);
    try {
      await api.openConnectionShop(connectionId);
    } catch (value) {
      toast.error(errorMessage(value));
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="shop-page">
      <PageHeader
        title="小铺充值"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate(returnTo)}
            >
              <ArrowLeft aria-hidden="true" />
              返回
            </Button>
            <Button
              variant="ghost"
              size="icon-sm"
              title="刷新小铺"
              aria-label="刷新小铺"
              disabled={loading}
              onClick={() => setRevision((value) => value + 1)}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={opening || !url}
              onClick={() => void openBrowser()}
            >
              <ExternalLink aria-hidden="true" />
              在浏览器打开
            </Button>
          </div>
        }
      />
      {error ? (
        <div className="empty-state" role="alert">
          {error}
        </div>
      ) : loading ? (
        <div className="empty-state" role="status">
          <Loader2 className="animate-spin" aria-hidden="true" />
          正在读取小铺…
        </div>
      ) : (
        url && (
          <div className="shop-content">
            {frameLoading && (
              <div className="shop-loading" role="status">
                <Loader2 className="animate-spin" aria-hidden="true" />
                正在加载小铺…
              </div>
            )}
            <iframe
              key={revision}
              title="小铺"
              src={url}
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              referrerPolicy="no-referrer"
              onLoad={() => setFrameLoading(false)}
              onError={() => {
                setFrameLoading(false);
                setError("小铺加载失败，请重试。");
              }}
            />
          </div>
        )
      )}
    </div>
  );
}
