import { Routes, Route, Navigate } from "react-router-dom";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/components/layout/sidebar";
import { AppProvider } from "@/lib/store";
import HomePage from "@/pages/home";
import SetupPage from "@/pages/setup";
import ModelsPage from "@/pages/models";
import DiagnosePage from "@/pages/diagnose";
import SettingsPage from "@/pages/settings";

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="bg-background flex-1 overflow-y-auto">
            <div className="mx-auto max-w-5xl px-8 py-8">
              <Routes>
                <Route path="/" element={<HomePage />} />
                <Route path="/setup/:agent" element={<SetupPage />} />
                <Route path="/models" element={<ModelsPage />} />
                <Route path="/diagnose" element={<DiagnosePage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          </main>
        </div>
      </TooltipProvider>
    </AppProvider>
  );
}
