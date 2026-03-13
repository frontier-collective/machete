import { useCallback, useRef, useEffect } from "react";

/**
 * Hook for drag-to-resize panels.
 * Returns an onMouseDown handler to attach to a divider element.
 *
 * @param onDrag Called with the mouse delta (px) on each move. Return the clamped value actually applied.
 * @param direction "horizontal" tracks clientX delta, "vertical" tracks clientY delta.
 */
export function useDrag(
  onDrag: (delta: number) => void,
  direction: "horizontal" | "vertical" = "vertical"
) {
  const startPos = useRef(0);
  const dragging = useRef(false);

  const onMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging.current) return;
      const pos = direction === "horizontal" ? e.clientX : e.clientY;
      const delta = pos - startPos.current;
      startPos.current = pos;
      onDrag(delta);
    },
    [onDrag, direction]
  );

  const onMouseUp = useCallback(() => {
    dragging.current = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, []);

  useEffect(() => {
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [onMouseMove, onMouseUp]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      dragging.current = true;
      startPos.current = direction === "horizontal" ? e.clientX : e.clientY;
      document.body.style.cursor = direction === "horizontal" ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";
    },
    [direction]
  );

  return onMouseDown;
}
