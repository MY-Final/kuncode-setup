import { ShoppingBag } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import type { AccountProfile } from "@/lib/types";

export function ShopButton({
  profile,
  onNavigate,
}: {
  profile: AccountProfile;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const location = useLocation();

  if (!profile.shopUrl || !profile.authenticated) return null;
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => {
        onNavigate?.();
        navigate(`/shop/${encodeURIComponent(profile.connectionId)}`, {
          state: { returnTo: location.pathname },
        });
      }}
    >
      <ShoppingBag aria-hidden="true" />
      去小铺充值
    </Button>
  );
}
