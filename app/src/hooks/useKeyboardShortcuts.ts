import { useEffect } from "react";

export interface ShortcutDef {
  /** Key to match (e.g. "f", "Enter", ",") */
  key: string;
  /** Require meta key (Cmd on macOS) */
  meta?: boolean;
  /** Require shift key */
  shift?: boolean;
  /** Handler — return false to prevent default */
  handler: () => void;
}

/**
 * Registers global keyboard shortcuts. Shortcuts are matched against
 * keydown events; if meta/shift modifiers match and the key matches
 * (case-insensitive), the handler fires and the event is consumed.
 *
 * Shortcuts are automatically ignored when the active element is an
 * input, textarea, or contenteditable — unless the shortcut uses
 * the meta (Cmd) modifier, which is never normal text input.
 */
export function useKeyboardShortcuts(shortcuts: ShortcutDef[]) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs — but allow any Cmd (meta)
      // combo through, since those are never normal text input (e.g. ⌘⇧M
      // for cheatsheet, ⌘Enter for commit).
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        if (!e.metaKey) return;
      }

      for (const s of shortcuts) {
        if (
          e.key.toLowerCase() === s.key.toLowerCase() &&
          !!e.metaKey === !!s.meta &&
          !!e.shiftKey === !!s.shift
        ) {
          e.preventDefault();
          e.stopPropagation();
          s.handler();
          return;
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shortcuts]);
}
