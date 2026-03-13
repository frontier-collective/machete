import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface SlideOverProps {
  title: string;
  open: boolean;
  onClose: () => void;
  /** When true, children manage their own scrolling — no wrapper ScrollArea or padding */
  raw?: boolean;
  children: React.ReactNode;
}

export function SlideOver({ title, open, onClose, raw, children }: SlideOverProps) {
  if (!open) return null;

  return (
    <div className="absolute inset-y-0 right-0 z-30 flex w-[480px] max-w-[50%] flex-col border-l bg-background shadow-xl">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-4 py-2 shrink-0">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      {/* Content */}
      {raw ? (
        <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4">{children}</div>
        </ScrollArea>
      )}
    </div>
  );
}
