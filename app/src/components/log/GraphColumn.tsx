import type { CommitGraphRow } from "./graphLayout";

export const LANE_WIDTH = 16;
export const ROW_HEIGHT = 24;
const DOT_RADIUS = 4;

/**
 * 8-color palette for graph lanes.
 * HSL-based, works in both light and dark themes.
 */
const LANE_COLORS = [
  "hsl(210, 80%, 55%)", // blue
  "hsl(340, 75%, 55%)", // rose
  "hsl(150, 65%, 45%)", // green
  "hsl(30, 85%, 55%)",  // orange
  "hsl(270, 65%, 60%)", // purple
  "hsl(180, 60%, 45%)", // teal
  "hsl(50, 80%, 50%)",  // yellow
  "hsl(0, 70%, 55%)",   // red
];

/** Grey color for the uncommitted changes line */
export const UNCOMMITTED_COLOR = "hsl(0, 0%, 55%)";

function laneColor(colorIndex: number): string {
  return LANE_COLORS[colorIndex % LANE_COLORS.length];
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

interface GraphColumnProps {
  row: CommitGraphRow;
  globalMaxLane: number;
  /** Draw a grey vertical pass-through line at lane 0 (uncommitted→HEAD connection) */
  uncommittedPassThrough?: boolean;
  /** Draw a grey curve from lane 0 to this commit's dot (HEAD commit row) */
  uncommittedCurveToHead?: boolean;
}

export function GraphColumn({ row, globalMaxLane, uncommittedPassThrough, uncommittedCurveToHead }: GraphColumnProps) {
  const width = (globalMaxLane + 1) * LANE_WIDTH + 4;
  const midY = ROW_HEIGHT / 2;
  const commitX = laneX(row.lane);
  const lane0X = laneX(0);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="block shrink-0"
      style={{ minWidth: width }}
    >
      {/* Grey uncommitted pass-through line at lane 0 */}
      {uncommittedPassThrough && (
        <line
          x1={lane0X}
          y1={0}
          x2={lane0X}
          y2={ROW_HEIGHT}
          stroke={UNCOMMITTED_COLOR}
          strokeWidth={2}
        />
      )}

      {/* Grey curve from lane 0 to the HEAD commit's lane */}
      {uncommittedCurveToHead && row.lane !== 0 && (
        <path
          d={`M ${lane0X} 0 Q ${lane0X} ${midY}, ${commitX} ${midY}`}
          fill="none"
          stroke={UNCOMMITTED_COLOR}
          strokeWidth={2}
        />
      )}
      {/* If HEAD is at lane 0, just draw a straight grey line above the dot */}
      {uncommittedCurveToHead && row.lane === 0 && (
        <line
          x1={commitX}
          y1={0}
          x2={commitX}
          y2={midY - DOT_RADIUS}
          stroke={UNCOMMITTED_COLOR}
          strokeWidth={2}
        />
      )}

      {/* Pass-through and merge/fork segments */}
      {row.segments.map((seg, i) => {
        const x1 = laneX(seg.fromLane);
        const x2 = laneX(seg.toLane);
        const color = laneColor(seg.color);

        if (seg.fromLane === seg.toLane) {
          // Straight pass-through — full height, this lane is NOT the commit lane
          return (
            <line
              key={i}
              x1={x1}
              y1={0}
              x2={x2}
              y2={ROW_HEIGHT}
              stroke={color}
              strokeWidth={2}
            />
          );
        }

        // Merge line: another lane converges INTO this commit's dot
        if (seg.toLane === row.lane) {
          return (
            <path
              key={i}
              d={`M ${x1} 0 Q ${x1} ${midY}, ${commitX} ${midY}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        }

        // Fork line: this commit's dot diverges OUT to another lane
        if (seg.fromLane === row.lane) {
          return (
            <path
              key={i}
              d={`M ${commitX} ${midY} Q ${x2} ${midY}, ${x2} ${ROW_HEIGHT}`}
              fill="none"
              stroke={color}
              strokeWidth={2}
            />
          );
        }

        // Fallback: curve between two non-commit lanes (rare)
        return (
          <path
            key={i}
            d={`M ${x1} 0 Q ${x1} ${midY}, ${x2} ${ROW_HEIGHT}`}
            fill="none"
            stroke={color}
            strokeWidth={2}
          />
        );
      })}

      {/* Commit's own vertical line — stops at the dot edges, only if connected */}
      {row.hasLineAbove && (
        <line
          x1={commitX}
          y1={0}
          x2={commitX}
          y2={midY - DOT_RADIUS}
          stroke={laneColor(row.color)}
          strokeWidth={2}
        />
      )}
      {row.hasLineBelow && (
        <line
          x1={commitX}
          y1={midY + DOT_RADIUS}
          x2={commitX}
          y2={ROW_HEIGHT}
          stroke={laneColor(row.color)}
          strokeWidth={2}
        />
      )}

      {/* Commit dot */}
      <circle
        cx={commitX}
        cy={midY}
        r={DOT_RADIUS}
        fill={laneColor(row.color)}
        stroke="var(--background, #fff)"
        strokeWidth={2}
      />
    </svg>
  );
}

export { laneColor, LANE_COLORS };
