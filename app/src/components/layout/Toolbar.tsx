import {
  Sun,
  Moon,
  GitPullRequest,
  Scissors,
  Settings,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRepo } from "@/hooks/useRepo";
import { useTheme } from "@/hooks/useTheme";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

export type ToolbarAction = "pr" | "prune" | "settings" | null;

interface ToolbarProps {
  activeAction: ToolbarAction;
  onAction: (action: ToolbarAction) => void;
}

export function Toolbar({ activeAction, onAction }: ToolbarProps) {
  const { status } = useRepo();
  const { theme, toggle } = useTheme();

  const toggleAction = (action: ToolbarAction) => {
    onAction(activeAction === action ? null : action);
  };

  return (
    <TooltipProvider delayDuration={300}>
      <header className="flex h-10 items-center justify-between border-b px-3 shrink-0">
        {/* Left: branch status */}
        <div className="flex items-center gap-3 text-sm">
          {status && (
            <>
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  status.isClean ? "bg-green-500" : "bg-amber-500"
                }`}
              />
              <span className="font-medium">{status.branch}</span>

              {(status.aheadCount > 0 || status.behindCount > 0) && (
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {status.aheadCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowUp className="h-3 w-3" />
                      {status.aheadCount}
                    </span>
                  )}
                  {status.behindCount > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ArrowDown className="h-3 w-3" />
                      {status.behindCount}
                    </span>
                  )}
                </span>
              )}
            </>
          )}
        </div>

        {/* Right: action buttons */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "pr" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("pr")}
              >
                <GitPullRequest className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Create PR</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "prune" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("prune")}
              >
                <Scissors className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Prune Branches</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={activeAction === "settings" ? "secondary" : "ghost"}
                size="sm"
                className="h-7 w-7 p-0"
                onClick={() => toggleAction("settings")}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Settings</TooltipContent>
          </Tooltip>

          <div className="mx-1 h-4 w-px bg-border" />

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={toggle}>
                {theme === "dark" ? (
                  <Sun className="h-3.5 w-3.5" />
                ) : (
                  <Moon className="h-3.5 w-3.5" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{theme === "dark" ? "Light mode" : "Dark mode"}</TooltipContent>
          </Tooltip>
        </div>
      </header>
    </TooltipProvider>
  );
}
