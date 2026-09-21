import { Point } from "../simulation/obstacle";
import { CostMap } from "../simulation/costMap";

interface Node {
  r: number;
  c: number;
  g: number;
  h: number;
  parent: Node | null;
}

function heuristic(a: Point, b: Point, costMap: CostMap): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return (dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy)) / costMap.cellSize;
}

export function findPathAStar(
  start: Point,
  goal: Point,
  costMap: CostMap
): Point[] {
  const startGrid = costMap.worldToGrid(start);
  const goalGrid = costMap.worldToGrid(goal);

  const openSet: Node[] = [];
  const closedSet = new Uint8Array(costMap.rows * costMap.cols);

  const startNode: Node = {
    r: startGrid.r,
    c: startGrid.c,
    g: 0,
    h: heuristic(start, goal, costMap),
    parent: null,
  };

  openSet.push(startNode);

  const directions = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];

  let iterations = 0;
  const maxIterations = 8000;

  while (openSet.length > 0 && iterations < maxIterations) {
    iterations++;

    // Find node with lowest f
    let bestIdx = 0;
    for (let i = 1; i < openSet.length; i++) {
      const f1 = openSet[i].g + openSet[i].h;
      const f2 = openSet[bestIdx].g + openSet[bestIdx].h;
      if (f1 < f2) bestIdx = i;
    }

    const current = openSet.splice(bestIdx, 1)[0];

    // Goal test
    if (current.r === goalGrid.r && current.c === goalGrid.c) {
      const rawPath: Point[] = [];
      let node: Node | null = current;
      while (node !== null) {
        rawPath.unshift(costMap.gridToWorld(node.r, node.c));
        node = node.parent;
      }
      return smoothPath(rawPath, costMap);
    }

    const cellIdx = current.r * costMap.cols + current.c;
    closedSet[cellIdx] = 1;

    for (const [dr, dc] of directions) {
      const nr = current.r + dr;
      const nc = current.c + dc;

      if (nr < 0 || nr >= costMap.rows || nc < 0 || nc >= costMap.cols) continue;
      const nIdx = nr * costMap.cols + nc;
      if (closedSet[nIdx] === 1) continue;
      if (!costMap.isCellPassable(nr, nc, 92)) continue;

      const moveCost = dr !== 0 && dc !== 0 ? 1.414 : 1.0;
      const cellCost =
        costMap.grid[nr][nc] * costMap.config.wSafety +
        costMap.roughnessGrid[nr][nc] * costMap.config.wRoughness;

      const tentativeG = current.g + moveCost * (1 + cellCost * 0.015);

      const existing = openSet.find((n) => n.r === nr && n.c === nc);
      if (existing && existing.g <= tentativeG) continue;

      if (existing) {
        existing.g = tentativeG;
        existing.parent = current;
      } else {
        openSet.push({
          r: nr,
          c: nc,
          g: tentativeG,
          h: heuristic(costMap.gridToWorld(nr, nc), goal, costMap),
          parent: current,
        });
      }
    }
  }

  // Fallback: direct line to goal if path search maxed out
  return [start, goal];
}

/**
 * Smooth raw grid points using Catmull-Rom or cubic spline interpolation
 */
function smoothPath(path: Point[], costMap: CostMap): Point[] {
  if (path.length <= 2) return path;

  // Subsample key waypoints
  const simplified: Point[] = [path[0]];
  for (let i = 1; i < path.length - 1; i += 2) {
    simplified.push(path[i]);
  }
  simplified.push(path[path.length - 1]);

  // Interpolate smooth curve points
  const smoothed: Point[] = [];
  for (let i = 0; i < simplified.length - 1; i++) {
    const p0 = simplified[Math.max(0, i - 1)];
    const p1 = simplified[i];
    const p2 = simplified[i + 1];
    const p3 = simplified[Math.min(simplified.length - 1, i + 2)];

    const steps = 4;
    for (let t = 0; t < steps; t++) {
      const u = t / steps;
      const u2 = u * u;
      const u3 = u2 * u;

      const x =
        0.5 *
        (2 * p1.x +
          (-p0.x + p2.x) * u +
          (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 +
          (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3);

      const y =
        0.5 *
        (2 * p1.y +
          (-p0.y + p2.y) * u +
          (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 +
          (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3);

      smoothed.push({ x, y });
    }
  }
  smoothed.push(path[path.length - 1]);

  return smoothed;
}
