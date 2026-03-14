import { Loader2, Download, X, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { UpdateState } from "@/hooks/useUpdater";

interface UpdateBannerProps {
  update: UpdateState;
}

export function UpdateBanner({ update }: UpdateBannerProps) {
  // Don't show if: no update, dismissed, or still checking on startup
  if (!update.available || update.dismissed) return null;

  // Ready to install — app is about to restart
  if (update.readyToInstall) {
    return (
      <div className="flex items-center gap-2 bg-green-500/15 border-b border-green-500/30 px-4 py-2 text-xs shrink-0">
        <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
        <span className="text-green-700 dark:text-green-400 font-medium">
          Update installed — restarting...
        </span>
      </div>
    );
  }

  // Downloading
  if (update.downloading) {
    return (
      <div className="flex items-center gap-2 bg-brand/10 border-b border-brand/20 px-4 py-2 text-xs shrink-0">
        <Loader2 className="h-3.5 w-3.5 text-brand animate-spin shrink-0" />
        <span className="text-foreground font-medium">
          Downloading update v{update.version}...
        </span>
        {update.progress !== null && (
          <div className="flex-1 max-w-[200px] h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full bg-brand rounded-full transition-all duration-300"
              style={{ width: `${update.progress}%` }}
            />
          </div>
        )}
        {update.progress !== null && (
          <span className="text-muted-foreground">{update.progress}%</span>
        )}
      </div>
    );
  }

  // Error during download
  if (update.error) {
    return (
      <div className="flex items-center gap-2 bg-destructive/10 border-b border-destructive/20 px-4 py-2 text-xs shrink-0">
        <span className="text-destructive flex-1 truncate">
          Update failed: {update.error}
        </span>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs shrink-0" onClick={update.downloadAndInstall}>
          <RefreshCw className="mr-1.5 h-3 w-3" />
          Retry
        </Button>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 shrink-0" onClick={update.dismiss}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  // Update available — prompt to download
  return (
    <div className="flex items-center gap-2 bg-brand/10 border-b border-brand/20 px-4 py-2 text-xs shrink-0">
      <span className="text-foreground">
        <span className="font-medium">Machete v{update.version}</span> is available
      </span>
      <Button variant="brand" size="sm" className="h-6 px-2 text-xs" onClick={update.downloadAndInstall}>
        <Download className="mr-1.5 h-3 w-3" />
        Update
      </Button>
      <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto shrink-0" onClick={update.dismiss}>
        <X className="h-3 w-3" />
      </Button>
    </div>
  );
}
