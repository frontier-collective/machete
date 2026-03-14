import {
  GitBranch,
  FileText,
  ArrowUpDown,
  GitCommitHorizontal,
  GitPullRequest,
  Scissors,
} from "lucide-react";
import { useRepoPath, useStatus } from "@/hooks/useRepo";
import type { View } from "@/types";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface DashboardViewProps {
  onNavigate: (view: View) => void;
}

export function DashboardView({ onNavigate }: DashboardViewProps) {
  const { repoPath } = useRepoPath();
  const { status, statusLoading } = useStatus();

  if (!repoPath) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Open a repository to get started.
      </div>
    );
  }

  if (statusLoading || !status) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        Loading...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Branch Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Branch</CardTitle>
            <GitBranch className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold truncate">
                {status.detachedAt
                  ? <><span className="text-amber-500">HEAD</span> <span className="font-mono text-lg text-muted-foreground">({status.detachedAt})</span></>
                  : status.branch}
              </span>
              <span
                className={`inline-block h-2.5 w-2.5 rounded-full ${
                  status.isClean ? "bg-green-500" : "bg-amber-500"
                }`}
                title={status.isClean ? "Clean" : "Dirty"}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.isClean ? "Working tree clean" : "Uncommitted changes"}
            </p>
          </CardContent>
        </Card>

        {/* Files Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Files</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-2xl font-bold">{status.stagedCount}</span>
                <Badge variant="safe" className="ml-2">staged</Badge>
              </div>
              <div>
                <span className="text-2xl font-bold">{status.unstagedCount}</span>
                <Badge variant="outline" className="ml-2">unstaged</Badge>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {status.stagedCount + status.unstagedCount === 0
                ? "No changed files"
                : `${status.stagedCount + status.unstagedCount} total changed`}
            </p>
          </CardContent>
        </Card>

        {/* Remote Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Remote</CardTitle>
            <ArrowUpDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-3">
              <div>
                <span className="text-2xl font-bold">{status.aheadCount}</span>
                <span className="ml-1 text-xs text-muted-foreground">ahead</span>
              </div>
              <div>
                <span className="text-2xl font-bold">{status.behindCount}</span>
                <span className="ml-1 text-xs text-muted-foreground">behind</span>
              </div>
            </div>
            <p className="mt-1 text-xs text-muted-foreground truncate">
              {status.remote || "No remote configured"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button variant="outline" onClick={() => onNavigate("commit")}>
            <GitCommitHorizontal className="mr-2 h-4 w-4" />
            New Commit
          </Button>
          <Button variant="outline" onClick={() => onNavigate("pr")}>
            <GitPullRequest className="mr-2 h-4 w-4" />
            Create PR
          </Button>
          <Button variant="outline" onClick={() => onNavigate("branches")}>
            <Scissors className="mr-2 h-4 w-4" />
            Prune Branches
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
