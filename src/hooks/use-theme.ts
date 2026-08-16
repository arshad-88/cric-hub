import { useCallback, useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

const KEY = "cricpulse-theme";

type Listener = () => void;

/**
 * Dark/light theme — dark is the default (broadcast look); the choice is
 * remembered in localStorage and applied as `dark` / `light` on <html>.
 *
 * The state lives in a module-level store (not per-component useState) so
 * every <ThemeToggle> in the app shares one source of truth: toggling in the
 * header updates every other toggle's icon instantly, and no stale instance
 * can ever write the old theme back to the DOM.
 */
let currentTheme: Theme = "dark";
const listeners = new Set<Listener>();

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(KEY) === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

function applyTheme(theme: Theme) {
  currentTheme = theme;
  try {
    window.localStorage.setItem(KEY, theme);
  } catch {
    /* storage unavailable — the in-memory theme still works */
  }
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.classList.toggle("light", theme === "light");
  listeners.forEach((l) => l());
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Keep the store in sync with the inline <head> script that applied the class
// before first paint (both read the same localStorage key).
currentTheme = readStoredTheme();

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => currentTheme);
  const toggle = useCallback(
    () => applyTheme(currentTheme === "dark" ? "light" : "dark"),
    [],
  );
  return { theme, toggle };
}
