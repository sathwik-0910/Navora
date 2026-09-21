import { Obstacle, isDynamic, DynamicObstacle, predictFuturePosition } from "../simulation/obstacle";
import { VehicleState } from "../simulation/vehicle";

const PREDICTION_HORIZON_SEC = 1.0;

export interface CollisionWarning {
  level: "safe" | "caution" | "warning" | "emergency_braking";
  ttc: number; // seconds to collision (99.9 if clear)
  dangerObstacle: Obstacle | null;
  message: string;
}

export interface SensorDetection {
  obstacle: Obstacle;
  distance: number;
  relativeBearing: number; // radians
  estimatedTTC: number;
  sensorType: "LiDAR" | "Camera" | "Radar" | "Fused" | "Ultrasonic";
  confidence: number;
}

export function calculateTTC(
  vehicle: VehicleState,
  obstacles: Obstacle[]
): CollisionWarning {
  let minTTC = Infinity;
  let mostCriticalObstacle: Obstacle | null = null;

  const vxEgo = vehicle.velocity * Math.cos(vehicle.heading);
  const vyEgo = vehicle.velocity * Math.sin(vehicle.heading);

  for (const obs of obstacles) {
    const dx = obs.x - vehicle.position.x;
    const dy = obs.y - vehicle.position.y;
    const dist = Math.hypot(dx, dy);

    const vxObs = isDynamic(obs) ? obs.velocityX * 45 : 0;
    const vyObs = isDynamic(obs) ? obs.velocityY * 45 : 0;

    const relVx = vxEgo - vxObs;
    const relVy = vyEgo - vyObs;

    const approachSpeed = (dx * relVx + dy * relVy) / (dist || 1);

    if (approachSpeed > 0.1 || dist < 45) {
      const effectiveDist = Math.max(0, dist - (obs.radius + 18));
      const ttc = approachSpeed > 0.1 ? effectiveDist / approachSpeed : 0.2;

      const angleToObs = Math.atan2(dy, dx);
      let headingDiff = Math.abs(angleToObs - vehicle.heading);
      while (headingDiff > Math.PI) headingDiff = Math.abs(headingDiff - 2 * Math.PI);

      if (headingDiff < (Math.PI / 180) * 60 || dist < 45) {
        if (ttc < minTTC) {
          minTTC = ttc;
          mostCriticalObstacle = obs;
        }
      }
    }
  }

  if (minTTC < 1.2) {
    return {
      level: "emergency_braking",
      ttc: minTTC,
      dangerObstacle: mostCriticalObstacle,
      message: `CRITICAL: AEB Activated! Imminent impact in ${minTTC.toFixed(1)}s with ${mostCriticalObstacle?.name || "obstacle"}!`,
    };
  } else if (minTTC < 2.4) {
    return {
      level: "warning",
      ttc: minTTC,
      dangerObstacle: mostCriticalObstacle,
      message: `WARNING: Collision Risk (${minTTC.toFixed(1)}s) - Evasive Re-planning Active`,
    };
  } else if (minTTC < 3.8) {
    return {
      level: "caution",
      ttc: minTTC,
      dangerObstacle: mostCriticalObstacle,
      message: `CAUTION: Hazard ahead (${minTTC.toFixed(1)}s) - Adjusting steering & speed`,
    };
  }

  return {
    level: "safe",
    ttc: minTTC === Infinity ? 99.9 : minTTC,
    dangerObstacle: null,
    message: "Path Clear • Adaptive Cruise Nominal",
  };
}

export function getSensorDetections(
  vehicle: VehicleState,
  obstacles: Obstacle[],
  sensorRange = 300
): SensorDetection[] {
  const detections: SensorDetection[] = [];

  for (const obs of obstacles) {
    const dx = obs.x - vehicle.position.x;
    const dy = obs.y - vehicle.position.y;
    const distance = Math.hypot(dx, dy);

    if (distance <= sensorRange) {
      const angle = Math.atan2(dy, dx);
      let relativeBearing = angle - vehicle.heading;
      while (relativeBearing > Math.PI) relativeBearing -= 2 * Math.PI;
      while (relativeBearing < -Math.PI) relativeBearing += 2 * Math.PI;

      let sensorType: SensorDetection["sensorType"] = "Fused";
      let confidence = 0.96;

      if (distance < 50) {
        sensorType = "Ultrasonic";
        confidence = 0.99;
      } else if (obs.type === "pothole") {
        sensorType = "Camera";
        confidence = 0.89;
      } else if (obs.type === "cow" || obs.type === "auto" || obs.type === "truck") {
        sensorType = "Fused";
        confidence = 0.98;
      } else if (obs.type === "speed_breaker") {
        sensorType = "Camera";
        confidence = 0.85;
      } else {
        sensorType = "LiDAR";
        confidence = 0.92;
      }

      // Estimate TTC using obstacle velocity when available
      let obsVX = 0;
      let obsVY = 0;
      if (isDynamic(obs)) {
        obsVX = obs.velocityX * 45;
        obsVY = obs.velocityY * 45;
      }
      const vxEgo = vehicle.velocity * Math.cos(vehicle.heading);
      const vyEgo = vehicle.velocity * Math.sin(vehicle.heading);
      const relVx = vxEgo - obsVX;
      const relVy = vyEgo - obsVY;
      const approachSpeed = (dx * relVx + dy * relVy) / (distance || 1);
      const estimatedTTC = approachSpeed > 0.5 ? distance / approachSpeed : distance / (vehicle.velocity || 1);

      detections.push({
        obstacle: obs,
        distance,
        relativeBearing,
        estimatedTTC,
        sensorType,
        confidence,
      });
    }
  }

  return detections.sort((a, b) => a.distance - b.distance);
}

export function calculateSafetyScore(
  ttc: number,
  minClearance: number,
  emergencyBrakesCount: number,
  roughnessPenalty: number
): number {
  let score = 100;

  if (ttc < 1.2) score -= 45;
  else if (ttc < 2.4) score -= 25;
  else if (ttc < 3.8) score -= 12;

  if (minClearance < 25) score -= 25;
  else if (minClearance < 50) score -= 10;

  score -= emergencyBrakesCount * 6;
  score -= Math.min(25, roughnessPenalty * 0.3);

  return Math.max(10, Math.min(100, Math.round(score)));
}
