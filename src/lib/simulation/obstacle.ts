export type Point = {
  x: number;
  y: number;
};

export type Point3D = {
  x: number;
  y: number;
  z: number;
};

export type ObstacleType =
  | "cow"
  | "pedestrian"
  | "pothole"
  | "speed_breaker"
  | "auto"
  | "bike"
  | "truck"
  | "construction"
  | "debris"
  | "vendor_cart";

export interface BaseObstacle {
  id: string;
  type: ObstacleType;
  x: number;
  y: number;
  radius: number;
  costMultiplier: number;
  color: string;
  icon: string;
  name: string;
  animPhase: number; // for 3D animation (walking legs, tail sway, engine vibration)
  width3D: number;
  length3D: number;
  height3D: number;
}

export interface StaticObstacle extends BaseObstacle {
  velocityX: 0;
  velocityY: 0;
}

export interface DynamicObstacle extends BaseObstacle {
  velocityX: number;
  velocityY: number;
  maxSpeed: number;
  heading: number; // heading angle in radians
}

export type Obstacle = StaticObstacle | DynamicObstacle;

// Indian road specific obstacle presets with 3D dimensional parameters
export const OBSTACLE_PRESETS: Record<
  ObstacleType,
  {
    name: string;
    radius: number;
    costMultiplier: number;
    color: string;
    icon: string;
    maxSpeed: number;
    width3D: number;
    length3D: number;
    height3D: number;
  }
> = {
  cow: {
    name: "Stray Cow",
    radius: 16,
    costMultiplier: 6,
    color: "#a78b71",
    icon: "🐄",
    maxSpeed: 0.45,
    width3D: 1.2,
    length3D: 2.2,
    height3D: 1.5,
  },
  pedestrian: {
    name: "Jaywalker",
    radius: 10,
    costMultiplier: 9,
    color: "#818cf8",
    icon: "🚶",
    maxSpeed: 0.9,
    width3D: 0.7,
    length3D: 0.7,
    height3D: 1.75,
  },
  pothole: {
    name: "Deep Pothole",
    radius: 14,
    costMultiplier: 7,
    color: "#18181b",
    icon: "🕳️",
    maxSpeed: 0,
    width3D: 1.8,
    length3D: 1.8,
    height3D: 0.35,
  },
  speed_breaker: {
    name: "Speed Breaker",
    radius: 22,
    costMultiplier: 2.5,
    color: "#fbbf24",
    icon: "⬛",
    maxSpeed: 0,
    width3D: 7.0,
    length3D: 1.2,
    height3D: 0.25,
  },
  auto: {
    name: "Auto Rickshaw",
    radius: 14,
    costMultiplier: 3.5,
    color: "#22c55e",
    icon: "🛺",
    maxSpeed: 2.2,
    width3D: 1.4,
    length3D: 2.6,
    height3D: 1.8,
  },
  bike: {
    name: "Wrong-way Bike",
    radius: 10,
    costMultiplier: 4,
    color: "#f97316",
    icon: "🏍️",
    maxSpeed: 3.2,
    width3D: 0.8,
    length3D: 1.9,
    height3D: 1.4,
  },
  truck: {
    name: "Heavy Highway Truck",
    radius: 22,
    costMultiplier: 5,
    color: "#38bdf8",
    icon: "🚛",
    maxSpeed: 1.8,
    width3D: 2.4,
    length3D: 6.5,
    height3D: 3.2,
  },
  construction: {
    name: "Road Barricade",
    radius: 24,
    costMultiplier: 10,
    color: "#ea580c",
    icon: "🚧",
    maxSpeed: 0,
    width3D: 3.5,
    length3D: 0.8,
    height3D: 1.2,
  },
  debris: {
    name: "Road Debris / Rock",
    radius: 9,
    costMultiplier: 4.5,
    color: "#71717a",
    icon: "🪨",
    maxSpeed: 0,
    width3D: 1.0,
    length3D: 1.0,
    height3D: 0.4,
  },
  vendor_cart: {
    name: "Thela / Vendor Cart",
    radius: 15,
    costMultiplier: 5.5,
    color: "#b91c1c",
    icon: "🛒",
    maxSpeed: 0.3,
    width3D: 1.6,
    length3D: 2.2,
    height3D: 1.6,
  },
};

export function createObstacle(
  type: ObstacleType,
  x: number,
  y: number,
  moving: boolean = false
): Obstacle {
  const preset = OBSTACLE_PRESETS[type];

  // Heading and velocity
  let angle = (Math.random() - 0.5) * Math.PI * 0.8; // generally forward/cross
  if (type === "bike" && moving) {
    angle = Math.PI + (Math.random() - 0.5) * 0.4; // wrong-way oncoming
  } else if (type === "pedestrian" && moving) {
    angle = Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2; // crossing road
  }

  const speed = moving ? preset.maxSpeed * (0.7 + Math.random() * 0.6) : 0;

  const base: BaseObstacle = {
    id: "obs_" + Math.random().toString(36).substring(2, 9),
    type,
    name: preset.name,
    x,
    y,
    radius: preset.radius,
    costMultiplier: preset.costMultiplier,
    color: preset.color,
    icon: preset.icon,
    animPhase: Math.random() * Math.PI * 2,
    width3D: preset.width3D,
    length3D: preset.length3D,
    height3D: preset.height3D,
  };

  if (moving || preset.maxSpeed > 0) {
    return {
      ...base,
      velocityX: Math.cos(angle) * speed,
      velocityY: Math.sin(angle) * speed,
      maxSpeed: preset.maxSpeed,
      heading: angle,
    } as DynamicObstacle;
  } else {
    return {
      ...base,
      velocityX: 0,
      velocityY: 0,
    } as StaticObstacle;
  }
}

export function isDynamic(obstacle: Obstacle): obstacle is DynamicObstacle {
  return "maxSpeed" in obstacle && (obstacle as DynamicObstacle).maxSpeed > 0;
}

/**
 * Predict where a dynamic obstacle will be in `horizonSec` seconds.
 *
 * updateDynamicObstacle integrates velocity as (vx * dt * 45), i.e. the
 * simulation velocity is expressed in pixels-per-second internally, so we
 * multiply by 45 here to stay consistent with the movement step.
 */
export function predictFuturePosition(
  obstacle: DynamicObstacle,
  horizonSec: number
): { x: number; y: number } {
  return {
    x: obstacle.x + obstacle.velocityX * 45 * horizonSec,
    y: obstacle.y + obstacle.velocityY * 45 * horizonSec,
  };
}

export function updateDynamicObstacle(
  obstacle: DynamicObstacle,
  canvasWidth: number,
  canvasHeight: number,
  dt: number
): DynamicObstacle {
  // Update animation phase
  const animSpeed = obstacle.type === "pedestrian" ? 6 : obstacle.type === "cow" ? 3 : 10;
  const newPhase = (obstacle.animPhase + animSpeed * dt) % (Math.PI * 2);

  let vx = obstacle.velocityX;
  let vy = obstacle.velocityY;

  // Specific motion rules per Indian obstacle
  if (obstacle.type === "cow") {
    // Unpredictable wandering with sudden stops
    if (Math.random() < 0.04) {
      const wanderAngle = (Math.random() - 0.5) * Math.PI * 0.6;
      const speed = Math.random() > 0.4 ? obstacle.maxSpeed * 0.8 : 0.05;
      vx = Math.cos(obstacle.heading + wanderAngle) * speed;
      vy = Math.sin(obstacle.heading + wanderAngle) * speed;
    }
  } else if (obstacle.type === "pedestrian") {
    // Crosses back and forth across road
    if (obstacle.y > canvasHeight - 110) {
      vy = -Math.abs(vy);
    } else if (obstacle.y < 110) {
      vy = Math.abs(vy);
    }
  } else if (obstacle.type === "auto") {
    // Auto weaves slightly between lanes
    vy += Math.sin(newPhase) * 0.08;
  }

  // Keep within road bounds
  let newX = obstacle.x + vx * dt * 45;
  let newY = obstacle.y + vy * dt * 45;

  // Wrap around or bounce on X boundaries
  if (newX > canvasWidth + 80) {
    newX = -50;
  } else if (newX < -80) {
    newX = canvasWidth + 50;
  }

  // Clamp Y inside road shoulders
  const minY = 90;
  const maxY = canvasHeight - 90;
  if (newY < minY) {
    newY = minY;
    vy = Math.abs(vy);
  } else if (newY > maxY) {
    newY = maxY;
    vy = -Math.abs(vy);
  }

  const currentHeading = Math.atan2(vy, vx);

  return {
    ...obstacle,
    x: newX,
    y: newY,
    velocityX: vx,
    velocityY: vy,
    heading: isNaN(currentHeading) ? obstacle.heading : currentHeading,
    animPhase: newPhase,
  };
}

export const OBSTACLE_TYPES = Object.keys(OBSTACLE_PRESETS) as ObstacleType[];
