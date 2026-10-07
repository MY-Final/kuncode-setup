import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

type Theme = "light" | "dark" | "system";
interface Preferences {
  theme: Theme;
  compact: boolean;
  reduceMotion: boolean;
}
const defaults: Preferences = {
  theme: "light",
  compact: false,
  reduceMotion: false,
};
const STORAGE_KEY = "kuncode:preferences:v1";
function readPreferences(): Preferences {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(STORAGE_KEY) ?? "null",
    );
    if (!value || typeof value !== "object") return defaults;
    const p = value as Partial<Preferences>;
    return {
      theme: p.theme === "dark" || p.theme === "system" ? p.theme : "light",
      compact: p.compact === true,
      reduceMotion: p.reduceMotion === true,
    };
  } catch {
    return defaults;
  }
}
interface PreferencesState {
  preferences: Preferences;
  resolvedTheme: "light" | "dark";
  updatePreferences: (patch: Partial<Preferences>) => void;
}
const Context = createContext<PreferencesState | null>(null);
export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(readPreferences);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const resolvedTheme =
    preferences.theme === "system"
      ? systemDark
        ? "dark"
        : "light"
      : preferences.theme;
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const change = () => setSystemDark(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
    document.documentElement.dataset.density = preferences.compact
      ? "compact"
      : "comfortable";
    document.documentElement.dataset.motion = preferences.reduceMotion
      ? "reduced"
      : "normal";
    document.documentElement.style.colorScheme = resolvedTheme;
  }, [preferences, resolvedTheme]);
  function updatePreferences(patch: Partial<Preferences>) {
    const next = { ...preferences, ...patch };
    setPreferences(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      toast.error("偏好已应用，但无法保存到本地", {
        description: "请检查浏览器或系统存储权限。",
      });
    }
  }
  return (
    <Context.Provider value={{ preferences, resolvedTheme, updatePreferences }}>
      {children}
    </Context.Provider>
  );
}
export function usePreferences() {
  const value = useContext(Context);
  if (!value) throw new Error("PreferencesProvider 未初始化");
  return value;
}
