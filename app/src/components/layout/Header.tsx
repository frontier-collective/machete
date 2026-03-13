import { Sun, Moon, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/hooks/useRepo";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

interface HeaderProps {
  repoPath: string | null;
}

function repoName(path: string | null): string {
  if (!path) return "No repo";
  const parts = path.replace(/\/+$/, "").split("/");
  return parts[parts.length - 1] || "No repo";
}

export function Header({ repoPath }: HeaderProps) {
  const { status } = useRepo();
  const { theme, toggle } = useTheme();

  return (
    <header className="flex h-12 items-center justify-between border-b px-4">
      <div className="flex items-center gap-4">
        <span className="text-sm font-semibold">{repoName(repoPath)}</span>

        {status && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span
              className={cn(
                "inline-block h-2 w-2 rounded-full",
                status.isClean ? "bg-green-500" : "bg-red-500"
              )}
            />
            <span>{status.branch}</span>

            {status.aheadCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <ArrowUp className="h-3 w-3" />
                {status.aheadCount}
              </span>
            )}
            {status.behindCount > 0 && (
              <span className="flex items-center gap-0.5 text-xs">
                <ArrowDown className="h-3 w-3" />
                {status.behindCount}
              </span>
            )}
          </div>
        )}
      </div>

      <Button variant="ghost" size="icon" onClick={toggle}>
        {theme === "dark" ? (
          <Sun className="h-4 w-4" />
        ) : (
          <Moon className="h-4 w-4" />
        )}
        <span className="sr-only">Toggle theme</span>
      </Button>
    </header>
  );
}
