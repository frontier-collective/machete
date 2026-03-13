import {
  LayoutDashboard,
  GitCommitHorizontal,
  GitBranch,
  GitPullRequest,
  Rocket,
  Settings,
} from "lucide-react";
import type { View } from "@/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";

interface SidebarProps {
  currentView: View;
  onNavigate: (view: View) => void;
}

const navItems: { view: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "commit", label: "Commit", icon: GitCommitHorizontal },
  { view: "branches", label: "Branches", icon: GitBranch },
  { view: "pr", label: "PR", icon: GitPullRequest },
  { view: "release", label: "Release", icon: Rocket },
  { view: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({ currentView, onNavigate }: SidebarProps) {
  return (
    <TooltipProvider delayDuration={300}>
      <aside className="flex h-full w-[60px] flex-col items-center gap-1 border-r bg-muted py-4">
        {navItems.map(({ view, label, icon: Icon }) => (
          <Tooltip key={view}>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-10 w-10 text-muted-foreground",
                  currentView === view &&
                    "bg-accent text-accent-foreground"
                )}
                onClick={() => onNavigate(view)}
              >
                <Icon className="h-5 w-5" />
                <span className="sr-only">{label}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">{label}</TooltipContent>
          </Tooltip>
        ))}
      </aside>
    </TooltipProvider>
  );
}
