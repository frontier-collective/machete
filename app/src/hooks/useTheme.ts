import { useState, useEffect } from "react";

export function useTheme() {
  const [dark, setDark] = useState(() => {
    const stored = localStorage.getItem("machete-theme");
    if (stored) return stored === "dark";
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("machete-theme", dark ? "dark" : "light");
  }, [dark]);

  const theme = dark ? "dark" as const : "light" as const;
  return { theme, dark, toggle: () => setDark((d) => !d) };
}
