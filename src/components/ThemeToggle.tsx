import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { cn } from "@/lib/utils";

/** Dark/light theme switch — sits in the app headers. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  const light = theme === "light";
  return (
    <button
      type="button"
      onClick={toggle}
      title={light ? "Switch to dark theme" : "Switch to light theme"}
      aria-label={light ? "Switch to dark theme" : "Switch to light theme"}
      className={cn(
        "inline-flex size-8 items-center justify-center border transition-colors",
        "border-border bg-card text-slate-400 hover:border-[#22c55e] hover:text-[#22c55e]",
      )}
    >
      {light ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
    </button>
  );
}
