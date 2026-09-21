/**
 * Adaptive Planner Ported from Python SIH Prototype (guided.py)
 * Provides clearance-maximizing global path and local pure-pursuit controller.
 */

import { Point, Obstacle, isDynamic } from "../simulation/obstacle";
import { VehicleState } from "../simulation/vehicle";

// ---------------------------
// Constants (tuned for Navora 1000x600 canvas)
// ---------------------------
const DEFAULT_ROAD_TOP = 80;
const DEFAULT_ROAD_BOTTOM = 520;
const STEP_X = 18; // step along x (primary direction)
const MIN_CLEARANCE = 16; // minimum clearance from obstacle bubble
const EGO_HALF_WIDTH = 12; // half of vehicle width (pixels)

// Driving mode configuration matching Python DRIVING_MODES
const DRIVING_MODES: Record<string, { speed_factor: number; safety_margin: number; color: string }> = {
  cautious: { speed_factor: 0.4, safety_margin: 2.5, color: "#f59e0b" },
  normal: { speed_factor: 0.7, safety_margin: 1.5, color: "#06b6d4" },
  assertive: { speed_factor: 1.0, safety_margin: 1.0, color: "#10b981" },
};

// ---------------------------
// Helper: wrap angle to [-pi, pi]
// ---------------------------
function wrapAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

// ---------------------------
// Generate adaptive global plan (horizontal road)
// When an obstacle is in the immediate lane, the planner measures the gap on
// BOTH shoulders, commits to the side with more room, and swings the car over
// decisively (fast lateral step) before continuing toward the goal.
// ---------------------------
export function generateAdaptivePlan(
  start: Point,
  goal: Point,
  obstacles: Array<{ x: number; y: number; radius: number }>,
  roadTop: number = DEFAULT_ROAD_TOP,
  roadBottom: number = DEFAULT_ROAD_BOTTOM,
  step: number = STEP_X,
  swing?: number,
): Point[] {
  const path: Point[] = [{ x: start.x, y: start.y }];
  let x = start.x;
  let y = start.y;
  const yMin = roadTop + EGO_HALF_WIDTH + 6;
  const yMax = roadBottom - EGO_HALF_WIDTH - 6;
  const centerY = (yMin + yMax) / 2;

  // Direction of travel (should be positive x)
  const dx = goal.x - start.x;
  if (dx <= 0) {
    // Fallback: direct line
    path.push({ x: goal.x, y: goal.y });
    return path;
  }

  // ── Side selection: find the first obstacle sitting in our immediate lane ──
  // Decide whether to pass ABOVE (smaller y, top shoulder) or BELOW (larger y)
  // by comparing the free gap on each shoulder. This is the "check left & right"
  // behaviour, computed once so the plan commits instead of dithering.
  let urgentY: number | null = null;
  const lookSpan = 260;
  for (const o of obstacles) {
    const inFront = o.x > start.x && o.x < start.x + lookSpan;
    if (!inFront) continue;
    // In our lane? (lateral overlap with ego bubble + clearance)
    const laneDist = Math.abs(o.y - start.y);
    if (laneDist > o.radius + EGO_HALF_WIDTH + MIN_CLEARANCE + 12) continue;

    const gapAbove = Math.max(0, o.y - (yMin + MIN_CLEARANCE) - EGO_HALF_WIDTH);
    const gapBelow = Math.max(0, (yMax - MIN_CLEARANCE - EGO_HALF_WIDTH) - o.y);
    const roomyA = gapAbove >= 36;
    const roomyB = gapBelow >= 36;

    let side: "above" | "below" | null = null;
    if (roomyA && roomyB) {
      // Both sides fit → take the side we're already leaning toward (less weave)
      side = start.y <= o.y ? "above" : "below";
    } else if (roomyA) {
      side = "above";
    } else if (roomyB) {
      side = "below";
    }
    // If neither shoulder has room, leave urgentY null → plain centre-sweep
    if (side !== null) {
      urgentY =
        side === "above"
          ? o.y - (o.radius + EGO_HALF_WIDTH + MIN_CLEARANCE + 14)
          : o.y + (o.radius + EGO_HALF_WIDTH + MIN_CLEARANCE + 14);
      urgentY = Math.min(yMax, Math.max(yMin, urgentY));
    }
    break; // only the FIRST blocking obstacle drives the detour
  }
  // Manual override (used by the tick loop after a long stall)
  if (typeof swing === "number" && isFinite(swing) && swing !== 0) {
    urgentY = Math.min(yMax, Math.max(yMin, swing));
  }

  const urgentUntilX = urgentY !== null ? start.x + 150 : -Infinity;

  while (x < goal.x - 1) {
    x += step;
    // Find obstacles near this x slice
    const near = obstacles.filter(o => Math.abs(o.x - x) < step * 3);
    let bestY = y;
    let bestScore = -Infinity;
    const inUrgent = x < urgentUntilX && urgentY !== null;

    // Sample y positions across road width
    for (let cy = yMin; cy <= yMax; cy += 6) {
      // Compute clearance to nearest obstacle
      let minClear = Infinity;
      for (const o of near) {
        const clear = Math.abs(cy - o.y) - (o.radius + EGO_HALF_WIDTH);
        if (clear < minClear) minClear = clear;
      }
      // No obstacles near this slice: treat clearance as full lane width
      if (!isFinite(minClear)) minClear = (yMax - yMin) / 2;
      if (minClear < MIN_CLEARANCE) continue; // too close

      // Score: clearance minus deviation from previous y and road center
      let score = minClear - Math.abs(cy - y) * 0.3 - Math.abs(cy - centerY) * 0.05;
      // Strong magnet toward the chosen detour lane while swinging over
      if (inUrgent && urgentY !== null) {
        score += Math.max(0, 500 - Math.abs(cy - urgentY));
      }
      if (score > bestScore) {
        bestScore = score;
        bestY = cy;
      }
    }

    // Lateral sway rate: swing hard during the urgent detour (~60px/step so the
    // car reaches the clear shoulder in a few slices), gentle normally.
    const maxSway = inUrgent ? 60 : 14;
    y += Math.max(-maxSway, Math.min(maxSway, bestY - y));
    path.push({ x, y });
  }

  // Ensure final point is exactly goal
  path.push({ x: goal.x, y: goal.y });
  return path;
}

// ---------------------------
// GoalFollower: local controller (pure pursuit + repulsion + braking)
// now accepts stuckSeconds to force recovery after long stops
// ---------------------------
export class GoalFollower {
  mode: string = "normal";
  reason: string = "";
  targetSpeed: number = 0;
  targetSteer: number = 0;
  waypointIdx: number = 0;

  control(
    ego: { x: number; y: number; angle: number; speed: number },
    waypoints: Point[],
    waypointIdx: number,
    detections: Array<{
      dist: number;
      bearing: number;
      erratic: number;
      confidence: number;
    }>,
    mode: string,
    dt: number,
    stuckSeconds: number = 0,
    isEmergencyBrake: boolean = false,
  ): [number, number, number] {
    this.mode = mode;
    const cfg = DRIVING_MODES[mode] || DRIVING_MODES.normal;

    // Advance past waypoints already passed (x increases toward goal)
    let idx = waypointIdx;
    while (idx < waypoints.length - 1 && waypoints[idx].x < ego.x - 15) {
      idx++;
    }

    // Pick lookahead point
    const lookahead = 42 + ego.speed * 1.4;
    let target = waypoints[waypoints.length - 1];
    for (let i = idx; i < waypoints.length; i++) {
      const wp = waypoints[i];
      const dx = wp.x - ego.x;
      const dy = wp.y - ego.y;
      if (Math.hypot(dx, dy) >= lookahead || i === waypoints.length - 1) {
        target = wp;
        idx = i;
        break;
      }
    }

    // Pure-pursuit steering
    const angErr = wrapAngle(Math.atan2(target.y - ego.y, target.x - ego.x) - ego.angle);
    let steer = Math.max(-1, Math.min(1, angErr * 1.4));

    // Repulsion from obstacles ahead — weaker when stuck (we WANT to steer into a gap)
    const repulsionScale = stuckSeconds > 3 ? 0.2 : 1.0;
    for (const d of detections) {
      if (d.confidence < 0.3 || d.dist > 90 || Math.abs(d.bearing) > 1.5) continue;
      const w = (1 - d.dist / 90) * (0.4 + d.erratic * 0.7) * repulsionScale;
      steer -= w * Math.sign(d.bearing) * 1.0;
    }
    steer = Math.max(-1, Math.min(1, steer));

    // Speed control
    const speedLimit = 70 * cfg.speed_factor;
    let speed = speedLimit * (1 - Math.abs(steer) * 0.55);

    // Kinematic braking envelope
    const decel = 8;
    const safeGap = 18;
    let imminent = false;
    for (const d of detections) {
      if (d.confidence < 0.3 || Math.abs(d.bearing) > 1.5) continue;
      const stoppingDist = (ego.speed ** 2) / (2 * decel);
      if (d.dist < stoppingDist + safeGap) {
        speed = Math.min(speed, Math.sqrt(Math.max(0, 2 * decel * (d.dist - safeGap))));
        imminent = true;
      }
      // When stuck, don't slam to 1 px/s — keep a crawl speed so the car
      // can creep past on the new path
      const minCrawl = stuckSeconds > 5 ? 4 : 1;
      if (d.dist < safeGap + 6) {
        speed = Math.min(speed, minCrawl);
        imminent = true;
      }
    }

    // MINIMUM SPEED ENFORCER: never fully stall unless we're at the goal
    // If stuck > 2s, enforce a crawl so the car always makes forward progress
    const minSpeed = stuckSeconds > 2 ? 5 : 6;
    if (!imminent || stuckSeconds > 5) {
      speed = Math.max(minSpeed, speed);
    }

    // Emergency brake override: when a crossing bike is imminent,
    // force the car to a full stop regardless of crawl logic.
    if (isEmergencyBrake) {
      speed = 0;
    }

    this.targetSpeed = Math.max(0, speed);
    this.targetSteer = steer;
    this.waypointIdx = idx;
    return [this.targetSpeed, this.targetSteer, idx];
  }
}

// ---------------------------
// Path blocked check (for replanning)
// Adapted for horizontal road: travel is +X, so "corridor ahead"
// is the window 34 < wp.x - egoX < 60.
// ---------------------------
export function isPathBlocked(
  egoX: number,
  waypoints: Point[],
  obstacles: Array<{ x: number; y: number; radius: number }>,
  egoHalfWidth: number = EGO_HALF_WIDTH,
): boolean {
  // Check waypoints within immediate corridor ahead (34 < wp.x - egoX < 60)
  const corridor = waypoints.filter(wp => {
    const dx = wp.x - egoX;
    return dx > 34 && dx < 60;
  });
  if (corridor.length === 0) return false;

  for (const o of obstacles) {
    // Find minimum distance from obstacle to any corridor waypoint
    let dmin = Infinity;
    for (const wp of corridor) {
      const d = Math.hypot(o.x - wp.x, o.y - wp.y);
      if (d < dmin) dmin = d;
    }
    if (dmin < o.radius + egoHalfWidth - 2) return true;
  }
  return false;
}

// ---------------------------
// Safety override (TTC based)
// Uses predicted relative motion for dynamic obstacles instead of
// the old stationary assumption.
// ---------------------------
export function safetyOverride(
  egoSpeed: number,
  detections: Array<{ dist: number; bearing: number; confidence: number; obstacle?: Obstacle }>,
): [number, string] {
  let maxSpeed = egoSpeed;
  let reason = "";
  for (const d of detections) {
    // Only forward-field obstacles matter for TTC
    if (d.confidence < 0.3 || Math.abs(d.bearing) > 1.3) continue;
    const obs = d.obstacle;
    let closing = egoSpeed; // default: stationary assumption
    if (obs && isDynamic(obs)) {
      // Project obstacle velocity onto the ego heading axis
      const obsForward = obs.velocityX * Math.cos(obs.heading) + obs.velocityY * Math.sin(obs.heading);
      closing = egoSpeed - obsForward;
    }
    if (closing > 0) {
      const ttc = d.dist / closing;
      if (ttc < 1.5) {
        maxSpeed = Math.min(maxSpeed, 6);
        reason = `EMERGENCY: obstacle in ${ttc.toFixed(1)}s`;
      }
    }
  }
  return [maxSpeed, reason];
}
