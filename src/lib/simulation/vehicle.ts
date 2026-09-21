import { Point } from "./obstacle";

export interface VehicleState {
  position: Point; // center of vehicle in 2D coordinate system
  heading: number; // heading angle in radians (0 = right)
  velocity: number; // forward velocity (pixels/s)
  steeringAngle: number; // front wheel steering angle (radians)
  wheelRotation: number; // visual wheel spinning angle (radians)
  suspensionPitch: number; // pitch tilt during acceleration/braking
  isBraking: boolean; // whether brake lights are illuminated
}

export interface VehicleParams {
  wheelBase: number; // axle separation in pixels
  maxSteeringAngle: number; // max wheel turn angle (radians)
  acceleration: number; // forward accel (pixels/s²)
  brakeDeceleration: number; // braking decel (pixels/s²)
  maxSpeed: number; // top speed limit (pixels/s)
}

export function updateVehicle(
  state: VehicleState,
  dt: number,
  throttle: number,
  targetSteerDelta: number,
  params: VehicleParams
): VehicleState {
  // Clamp throttle between -1 (full emergency brake) and 1 (full throttle)
  const t = Math.max(-1, Math.min(1, throttle));
  const isBraking = t < -0.1;

  // Compute updated forward velocity
  let newVel = state.velocity;
  if (t > 0) {
    newVel = Math.min(state.velocity + t * params.acceleration * dt, params.maxSpeed);
  } else if (t < 0) {
    const brakeForce = Math.abs(t) * params.brakeDeceleration;
    newVel = Math.max(state.velocity - brakeForce * dt, 0);
  } else {
    // Natural friction drag
    newVel = Math.max(state.velocity - 30 * dt, 0);
  }

  // Smooth steering filter towards desired steering delta
  const steerRate = 3.5; // rad/s max steering angular speed
  let newSteering = state.steeringAngle + Math.max(-steerRate * dt, Math.min(steerRate * dt, targetSteerDelta));
  newSteering = Math.max(-params.maxSteeringAngle, Math.min(params.maxSteeringAngle, newSteering));

  // Kinematic bicycle model integration
  const beta = Math.atan(Math.tan(newSteering) / 2); // vehicle slip angle
  const dx = newVel * Math.cos(state.heading + beta) * dt;
  const dy = newVel * Math.sin(state.heading + beta) * dt;
  const dheading = (newVel / params.wheelBase) * Math.tan(newSteering) * dt;

  // Wheel rotation angle for 3D spinning mesh
  const wheelRadius = 14;
  const dWheelRotation = (newVel * dt) / wheelRadius;
  const newWheelRotation = (state.wheelRotation + dWheelRotation) % (Math.PI * 2);

  // Suspension pitch tilt (dives under braking, squats under acceleration)
  const targetPitch = t < 0 ? -0.06 * Math.abs(t) : 0.03 * t;
  const newPitch = state.suspensionPitch + (targetPitch - state.suspensionPitch) * Math.min(1, dt * 10);

  return {
    position: {
      x: state.position.x + dx,
      y: state.position.y + dy,
    },
    heading: state.heading + dheading,
    velocity: newVel,
    steeringAngle: newSteering,
    wheelRotation: newWheelRotation,
    suspensionPitch: newPitch,
    isBraking,
  };
}

export const DEFAULT_VEHICLE_PARAMS: VehicleParams = {
  wheelBase: 34,
  maxSteeringAngle: Math.PI / 4.2, // ~42.8 degrees
  acceleration: 140, // pixels per second squared
  brakeDeceleration: 260, // strong emergency braking
  maxSpeed: 240,
};
