import { Point, Obstacle } from "../simulation/obstacle";
import { VehicleState } from "../simulation/vehicle";
import { CostMap } from "../simulation/costMap";

export interface TrajectorySample {
  path: Point[];
  v: number;
  w: number;
  score: number;
  isFeasible: boolean;
}

export interface DWAConfig {
  maxSpeed: number;
  minSpeed: number;
  maxYawRate: number; // max angular velocity (rad/s)
  maxAccel: number;
  maxYawAccel: number;
  vResolution: number; // velocity sampling steps
  yawRateResolution: number; // yaw rate sampling steps
  dt: number;
  predictTime: number; // prediction horizon in seconds
  weightHeading: number;
  weightDist: number;
  weightSpeed: number;
  weightRoughness: number;
}

export const DEFAULT_DWA_CONFIG: DWAConfig = {
  maxSpeed: 220,
  minSpeed: 0,
  maxYawRate: Math.PI / 1.6, // ~112.5 deg/s
  maxAccel: 160,
  maxYawAccel: Math.PI * 1.8,
  vResolution: 7,
  yawRateResolution: 13,
  dt: 0.1,
  predictTime: 1.4,
  weightHeading: 1.8,
  weightDist: 2.8,
  weightSpeed: 1.2,
  weightRoughness: 1.5,
};

function simulateTrajectory(
  x: number,
  y: number,
  theta: number,
  v: number,
  w: number,
  config: DWAConfig
): Point[] {
  const trajectory: Point[] = [{ x, y }];
  let currX = x;
  let currY = y;
  let currTheta = theta;
  const steps = Math.floor(config.predictTime / config.dt);

  for (let i = 0; i < steps; i++) {
    currTheta += w * config.dt;
    currX += v * Math.cos(currTheta) * config.dt;
    currY += v * Math.sin(currTheta) * config.dt;
    trajectory.push({ x: currX, y: currY });
  }

  return trajectory;
}

function evaluateObstacleDistance(
  trajectory: Point[],
  obstacles: Obstacle[],
  costMap: CostMap
): { minDistance: number; isColliding: boolean; avgRoughness: number } {
  let minDistance = Infinity;
  let totalRoughness = 0;

  for (const pt of trajectory) {
    // Check costMap boundary
    const cellCost = costMap.getCostAtWorld(pt.x, pt.y);
    if (cellCost >= 88) {
      return { minDistance: 0, isColliding: true, avgRoughness: 100 };
    }

    const grid = costMap.worldToGrid(pt);
    totalRoughness += costMap.roughnessGrid[grid.r]?.[grid.c] || 0;

    for (const obs of obstacles) {
      const dist = Math.hypot(pt.x - obs.x, pt.y - obs.y) - obs.radius;
      if (dist < 12) {
        return { minDistance: 0, isColliding: true, avgRoughness: 100 };
      }
      if (dist < minDistance) {
        minDistance = dist;
      }
    }
  }

  return {
    minDistance: Math.min(minDistance, 280),
    isColliding: false,
    avgRoughness: totalRoughness / trajectory.length,
  };
}

export function planDWA(
  vehicle: VehicleState,
  targetPoint: Point,
  obstacles: Obstacle[],
  costMap: CostMap,
  config: DWAConfig = DEFAULT_DWA_CONFIG
): {
  bestV: number;
  bestW: number;
  bestTrajectory: Point[];
  allTrajectories: TrajectorySample[];
} {
  const minV = Math.max(config.minSpeed, vehicle.velocity - config.maxAccel * config.dt);
  const maxV = Math.min(config.maxSpeed, vehicle.velocity + config.maxAccel * config.dt);

  const minW = -config.maxYawRate;
  const maxW = config.maxYawRate;

  const dv = (maxV - minV) / (config.vResolution - 1 || 1);
  const dw = (maxW - minW) / (config.yawRateResolution - 1 || 1);

  const samples: TrajectorySample[] = [];
  let bestScore = -Infinity;
  let bestV = 0;
  let bestW = 0;
  let bestTrajectory: Point[] = [];

  for (let vi = 0; vi < config.vResolution; vi++) {
    const v = minV + vi * dv;
    for (let wi = 0; wi < config.yawRateResolution; wi++) {
      const w = minW + wi * dw;

      const traj = simulateTrajectory(
        vehicle.position.x,
        vehicle.position.y,
        vehicle.heading,
        v,
        w,
        config
      );

      const endPoint = traj[traj.length - 1];

      const { minDistance, isColliding, avgRoughness } = evaluateObstacleDistance(
        traj,
        obstacles,
        costMap
      );

      if (isColliding) {
        samples.push({
          path: traj,
          v,
          w,
          score: -1000,
          isFeasible: false,
        });
        continue;
      }

      // Heading alignment
      const targetAngle = Math.atan2(
        targetPoint.y - endPoint.y,
        targetPoint.x - endPoint.x
      );
      const endHeading = vehicle.heading + w * config.predictTime;
      let angleDiff = Math.abs(targetAngle - endHeading);
      while (angleDiff > Math.PI) angleDiff = Math.abs(angleDiff - 2 * Math.PI);
      const headingScore = (Math.PI - angleDiff) / Math.PI; // 0 to 1

      // Speed score
      const speedScore = v / (config.maxSpeed || 1);

      // Clearance score
      const clearanceScore = minDistance / 280;

      // Combined objective score
      const totalScore =
        config.weightHeading * headingScore * 100 +
        config.weightDist * clearanceScore * 100 +
        config.weightSpeed * speedScore * 50 -
        config.weightRoughness * (avgRoughness / 50) * 40;

      const sample: TrajectorySample = {
        path: traj,
        v,
        w,
        score: totalScore,
        isFeasible: true,
      };

      samples.push(sample);

      if (totalScore > bestScore) {
        bestScore = totalScore;
        bestV = v;
        bestW = w;
        bestTrajectory = traj;
      }
    }
  }

  // Safe fallback if zero trajectories were feasible
  if (bestTrajectory.length === 0) {
    bestV = 0;
    bestW = 0;
    bestTrajectory = simulateTrajectory(
      vehicle.position.x,
      vehicle.position.y,
      vehicle.heading,
      0,
      0,
      config
    );
  }

  return {
    bestV,
    bestW,
    bestTrajectory,
    allTrajectories: samples,
  };
}
