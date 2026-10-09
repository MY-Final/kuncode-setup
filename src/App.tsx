import { lazy, Suspense } from "react";
import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppShell } from "@/components/layout/app-shell";
import { Toaster } from "@/components/ui/sonner";
import { PreferencesProvider, usePreferences } from "@/lib/preferences";
import { AppProvider } from "@/lib/store";
import HomePage from "@/pages/home";
const SetupPage = lazy(() => import("@/pages/setup"));
const ModelsPage = lazy(() => import("@/pages/models"));
const DiagnosePage = lazy(() => import("@/pages/diagnose"));
const SettingsPage = lazy(() => import("@/pages/settings"));
const KeysPage = lazy(() => import("@/pages/keys"));
const ToolDetailPage = lazy(() => import("@/pages/tool-detail"));
const ShopPage = lazy(() => import("@/pages/shop"));

function Application() {
  const { resolvedTheme } = usePreferences();
  const location = useLocation();
  return (
    <AppProvider>
      <TooltipProvider>
        <AppShell>
          <Suspense
            fallback={
              <div className="empty-state" role="status">
                正在加载工作区…
              </div>
            }
          >
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route
                path="/setup/:agent"
                element={<SetupPage key={location.pathname} />}
              />
              <Route path="/models" element={<ModelsPage />} />
              <Route path="/tools/:agent" element={<ToolDetailPage />} />
              <Route path="/keys" element={<KeysPage />} />
              <Route
                path="/shop/:connectionId"
                element={<ShopPage key={location.pathname} />}
              />
              <Route path="/diagnose" element={<DiagnosePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </AppShell>
        <Toaster theme={resolvedTheme} position="bottom-right" closeButton />
      </TooltipProvider>
    </AppProvider>
  );
}

export default function App() {
  return (
    <PreferencesProvider>
      <Application />
    </PreferencesProvider>
  );
}
