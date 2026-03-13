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

function laneColor(colorIndex: number): string {
  return LANE_COLORS[colorIndex % LANE_COLORS.length];
}

function laneX(lane: number): number {
  return lane * LANE_WIDTH + LANE_WIDTH / 2;
}

interface GraphColumnProps {
  row: CommitGraphRow;
  globalMaxLane: number;
}

export function GraphColumn({ row, globalMaxLane }: GraphColumnProps) {
  const width = (globalMaxLane + 1) * LANE_WIDTH + 4;
  const midY = ROW_HEIGHT / 2;
  const commitX = laneX(row.lane);

  return (
    <svg
      width={width}
      height={ROW_HEIGHT}
      className="block shrink-0"
      style={{ minWidth: width }}
    >
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

        // Curved merge/fork line
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
