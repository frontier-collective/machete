import type { CommitLogEntry } from "@/types";

export interface GraphSegment {
  /** Lane index this segment starts from (top of row) */
  fromLane: number;
  /** Lane index this segment ends at (bottom of row) */
  toLane: number;
  /** Color index (deterministic per lane) */
  color: number;
}

export interface CommitGraphRow {
  /** Which lane this commit's dot sits in */
  lane: number;
  /** Color index for this commit's dot */
  color: number;
  /** Line segments to draw for this row */
  segments: GraphSegment[];
  /** Total active lanes at this row (for SVG width) */
  maxLane: number;
  /** Whether a line enters this commit's dot from above */
  hasLineAbove: boolean;
  /** Whether a line exits this commit's dot downward */
  hasLineBelow: boolean;
}

/**
 * Compute graph layout for a list of commits (newest first, as git log returns).
 *
 * Standard gitk/Sourcetree lane assignment algorithm:
 * - Maintain an array of "active lanes", each tracking which commit hash it expects next.
 * - For each commit, find its lane, generate line segments, and update lanes for parents.
 */
export function computeGraphLayout(commits: CommitLogEntry[]): CommitGraphRow[] {
  // Each slot: hash this lane is waiting for, or null if free
  const activeLanes: (string | null)[] = [];
  // Track color assignment per lane
  const laneColors: number[] = [];
  let nextColor = 0;

  const rows: CommitGraphRow[] = [];

  for (const commit of commits) {
    const segments: GraphSegment[] = [];

    // 1. Find which lane(s) expect this commit
    const matchingLanes: number[] = [];
    for (let i = 0; i < activeLanes.length; i++) {
      if (activeLanes[i] === commit.hash) {
        matchingLanes.push(i);
      }
    }

    let commitLane: number;
    let commitColor: number;

    if (matchingLanes.length > 0) {
      // Use leftmost matching lane as the commit's lane
      commitLane = matchingLanes[0];
      commitColor = laneColors[commitLane];

      // Extra matching lanes = merge lines converging to commitLane
      for (let i = 1; i < matchingLanes.length; i++) {
        const mergeLane = matchingLanes[i];
        segments.push({
          fromLane: mergeLane,
          toLane: commitLane,
          color: laneColors[mergeLane],
        });
        // Free this lane
        activeLanes[mergeLane] = null;
        laneColors[mergeLane] = 0;
      }
    } else {
      // New branch tip — find a free lane or append
      let freeLane = activeLanes.indexOf(null);
      if (freeLane === -1) {
        freeLane = activeLanes.length;
        activeLanes.push(null);
        laneColors.push(0);
      }
      commitLane = freeLane;
      commitColor = nextColor++;
      laneColors[commitLane] = commitColor;
    }

    // 2. Pass-through lines for lanes that continue past this commit
    for (let i = 0; i < activeLanes.length; i++) {
      if (i === commitLane) continue;
      if (activeLanes[i] !== null) {
        segments.push({
          fromLane: i,
          toLane: i,
          color: laneColors[i],
        });
      }
    }

    // 3. Update lanes for parents
    const parents = commit.parents || [];
    if (parents.length === 0) {
      // Root commit — free this lane
      activeLanes[commitLane] = null;
    } else {
      // First parent inherits this commit's lane
      activeLanes[commitLane] = parents[0];

      // Additional parents get assigned to free or new lanes
      for (let p = 1; p < parents.length; p++) {
        const parentHash = parents[p];

        // Check if another lane already expects this parent (possible with octopus merges)
        const existingLane = activeLanes.indexOf(parentHash);
        if (existingLane !== -1) {
          // Draw a fork line from commitLane to existingLane
          segments.push({
            fromLane: commitLane,
            toLane: existingLane,
            color: laneColors[existingLane],
          });
        } else {
          // Find a free lane or append
          let freeLane = -1;
          for (let i = 0; i < activeLanes.length; i++) {
            if (activeLanes[i] === null && i !== commitLane) {
              freeLane = i;
              break;
            }
          }
          if (freeLane === -1) {
            freeLane = activeLanes.length;
            activeLanes.push(null);
            laneColors.push(0);
          }
          activeLanes[freeLane] = parentHash;
          laneColors[freeLane] = nextColor++;

          // Fork line from commitLane to the new parent's lane
          segments.push({
            fromLane: commitLane,
            toLane: freeLane,
            color: laneColors[freeLane],
          });
        }
      }
    }

    // 4. Compact: remove trailing null lanes
    while (activeLanes.length > 0 && activeLanes[activeLanes.length - 1] === null) {
      activeLanes.pop();
      laneColors.pop();
    }

    // Compute max lane for this row (for SVG width)
    const maxLane = Math.max(commitLane, activeLanes.length - 1, 0);

    rows.push({
      lane: commitLane,
      color: commitColor,
      segments,
      maxLane,
      hasLineAbove: matchingLanes.length > 0,
      hasLineBelow: parents.length > 0,
    });
  }

  return rows;
}
