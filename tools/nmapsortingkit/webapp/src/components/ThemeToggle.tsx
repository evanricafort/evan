import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const getInitialTheme = (): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.classList.contains("dark");

const ThemeToggle = () => {
  const [isDark, setIsDark] = useState(getInitialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("theme", isDark ? "dark" : "light");
  }, [isDark]);

  return (
    <button
      type="button"
      aria-label="Toggle dark mode"
      onClick={() => setIsDark((prev) => !prev)}
      className="absolute right-0 top-0 rounded-full p-2 text-muted-foreground transition hover:bg-accent hover:text-accent-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {isDark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </button>
  );
};

export default ThemeToggle;
