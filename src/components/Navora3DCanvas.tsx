"use client";

import React, { useRef, useEffect, useState, useCallback } from "react";
import * as THREE from "three";
import { Point, Obstacle, DynamicObstacle, isDynamic, updateDynamicObstacle, predictFuturePosition } from "../lib/simulation/obstacle";
import { VehicleState, DEFAULT_VEHICLE_PARAMS, updateVehicle } from "../lib/simulation/vehicle";
import { CostMap, CostMapConfig } from "../lib/simulation/costMap";
import { generateAdaptivePlan, GoalFollower, isPathBlocked, safetyOverride } from "../lib/planning/guidedPlanner";
import { calculateTTC, getSensorDetections, calculateSafetyScore, CollisionWarning, SensorDetection } from "../lib/planning/collision";
import { TrajectorySample } from "../lib/planning/dwa";
import { soundEngine } from "../lib/audio/soundEngine";
import confetti from "canvas-confetti";
import { Camera, Eye, Video, Maximize2, Compass, Zap, Shield, Sparkles, Volume2, VolumeX } from "lucide-react";

export type WeatherMode = "day" | "night" | "rain" | "fog";
export type CameraMode = "chase" | "fpv" | "bev" | "orbit";
export type ThemeMode = "morning" | "night";

export interface SimulationState {
  isRunning: boolean;
  isManualDrive: boolean;
  manualThrottle: number;
  manualSteering: number;
  vehicle: VehicleState;
  goal: Point;
  obstacles: Obstacle[];
  plannedPath: Point[];
  executedPath: Point[];
  dwaTrajectories: TrajectorySample[];
  selectedDwaPath: Point[];
  collisionWarning: CollisionWarning;
  sensorDetections: SensorDetection[];
  safetyScore: number;
  replanTimeMs: number;
  emergencyBrakesCount: number;
  isGoalReached: boolean;
  showHeatmap: boolean;
  showSensors: boolean;
  showDwaTrajectories: boolean;
  showLidarCloud: boolean;
  showGrid: boolean;
  targetSpeed: number; // 0 to 250
  weather: WeatherMode;
  cameraMode: CameraMode;
  theme: ThemeMode;
  waypointIdx?: number;
  replanning?: boolean;
  replanTimer?: number;
  replanCount?: number;
  mode?: string;
  reason?: string;
  stuckTimer?: number;
}

interface Navora3DCanvasProps {
  sim: SimulationState;
  onSimUpdate: (updater: (prev: SimulationState) => SimulationState) => void;
  onAddObstacleAt: (x: number, y: number) => void;
}

// Coordinate mapping: 2D Sim (x: 0..1000, y: 0..600) -> 3D World (X: -50..+50, Z: -15..+15)
const SCALE_X = 0.1;
const SCALE_Z = 0.05;
const SIM_OFFSET_X = 500;
const SIM_OFFSET_Y = 300;

function simTo3D(pt: { x: number; y: number }): THREE.Vector3 {
  return new THREE.Vector3(
    (pt.x - SIM_OFFSET_X) * SCALE_X,
    0,
    (pt.y - SIM_OFFSET_Y) * SCALE_Z
  );
}

function threeToSim(v: THREE.Vector3): Point {
  return {
    x: v.x / SCALE_X + SIM_OFFSET_X,
    y: v.z / SCALE_Z + SIM_OFFSET_Y,
  };
}

export const Navora3DCanvas: React.FC<Navora3DCanvasProps> = ({
  sim,
  onSimUpdate,
  onAddObstacleAt,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const costMapRef = useRef<CostMap | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(performance.now());
  const lidarAngleRef = useRef<number>(0);
  const [isAudioMuted, setIsAudioMuted] = useState(true);

  // Three.js References
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const carGroupRef = useRef<THREE.Group | null>(null);
  const frontLeftWheelRef = useRef<THREE.Group | null>(null);
  const frontRightWheelRef = useRef<THREE.Group | null>(null);
  const rearLeftWheelRef = useRef<THREE.Group | null>(null);
  const rearRightWheelRef = useRef<THREE.Group | null>(null);
  const lidarPuckRef = useRef<THREE.Mesh | null>(null);
  const brakeLightMeshRef = useRef<THREE.Mesh | null>(null);
  const headlightSpotLeftRef = useRef<THREE.SpotLight | null>(null);
  const headlightSpotRightRef = useRef<THREE.SpotLight | null>(null);

  // Dynamic meshes pool
  const obstacleMeshesRef = useRef<Map<string, THREE.Group>>(new Map());
  const plannedPathLineRef = useRef<THREE.Line | null>(null);
  const executedPathLineRef = useRef<THREE.Line | null>(null);
  const dwaTrajectoryLinesRef = useRef<THREE.Line[]>([]);
  const lidarPointCloudRef = useRef<THREE.Points | null>(null);
  const rainParticlesRef = useRef<THREE.Points | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);

  // Theme-responsive material refs
  const roadMeshRef = useRef<THREE.Mesh | null>(null);
  const shoulderTopRef = useRef<THREE.Mesh | null>(null);
  const shoulderBotRef = useRef<THREE.Mesh | null>(null);

  // Always-current simulation state ref (fixes stale closure in rAF tick)
  const simRef = useRef(sim);
  simRef.current = sim;

  // Orbit control state (for orbit camera mode)
  const orbitAngleRef = useRef({ theta: 0, phi: Math.PI / 4, radius: 25 });
  const isDraggingRef = useRef(false);
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  // Initialize CostMap
  const getCostMap = useCallback((width: number, height: number) => {
    if (!costMapRef.current || costMapRef.current.config.width !== width || costMapRef.current.config.height !== height) {
      const config: CostMapConfig = {
        width,
        height,
        cellSize: 15,
        safetyMargin: 24,
        wDistance: 1.0,
        wSafety: 2.5,
        wRoughness: 2.0,
      };
      costMapRef.current = new CostMap(config);
    }
    return costMapRef.current;
  }, []);

  // Audio Toggle
  const toggleAudio = () => {
    soundEngine.init();
    const nextMuted = !isAudioMuted;
    soundEngine.setMuted(nextMuted);
    setIsAudioMuted(nextMuted);
  };

  // Setup Three.js Scene
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const width = container.clientWidth || 900;
    const height = container.clientHeight || 560;

    // 1. Scene & Renderer
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x070b14);
    scene.fog = new THREE.FogExp2(0x070b14, 0.012);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 500);
    camera.position.set(0, 18, 25);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    rendererRef.current = renderer;

    container.innerHTML = "";
    container.appendChild(renderer.domElement);

    // 2. Lighting Setup
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const hemiLight = new THREE.HemisphereLight(0x38bdf8, 0x1e293b, 0.6);
    hemiLight.position.set(0, 50, 0);
    scene.add(hemiLight);
    hemiLightRef.current = hemiLight;

    const dirLight = new THREE.DirectionalLight(0xfff8e7, 1.4);
    dirLight.position.set(20, 40, 20);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    dirLight.shadow.camera.near = 0.5;
    dirLight.shadow.camera.far = 150;
    dirLight.shadow.camera.left = -50;
    dirLight.shadow.camera.right = 50;
    dirLight.shadow.camera.top = 30;
    dirLight.shadow.camera.bottom = -30;
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    // 3. Build Environment (Asphalt Road, Shoulders, Markings, Streetlights)
    buildEnvironment(scene);

    // 4. Build Procedural 3D Autonomous Vehicle
    const carGroup = build3DVehicle();
    scene.add(carGroup);
    carGroupRef.current = carGroup;

    // 5. Build LiDAR Point Cloud Particles
    const lidarPoints = buildLiDARParticles();
    scene.add(lidarPoints);
    lidarPointCloudRef.current = lidarPoints;

    // 6. Build Rain Particle System
    const rain = buildRainParticles();
    scene.add(rain);
    rainParticlesRef.current = rain;

    // 7. Path Line Objects
    const plannedGeo = new THREE.BufferGeometry();
    const plannedMat = new THREE.LineBasicMaterial({ color: 0x10b981, linewidth: 3 });
    const plannedLine = new THREE.Line(plannedGeo, plannedMat);
    scene.add(plannedLine);
    plannedPathLineRef.current = plannedLine;

    const executedGeo = new THREE.BufferGeometry();
    const executedMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2, transparent: true, opacity: 0.6 });
    const executedLine = new THREE.Line(executedGeo, executedMat);
    scene.add(executedLine);
    executedPathLineRef.current = executedLine;

    // Handle Resize
    const handleResize = () => {
      if (!container || !renderer || !camera) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      renderer.dispose();
      container.innerHTML = "";
    };
  }, []);

  // Build Environment in 3D
  const buildEnvironment = (scene: THREE.Scene) => {
    // Road Asphalt
    const roadGeo = new THREE.PlaneGeometry(120, 24);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x1a202c,
      roughness: 0.85,
      metalness: 0.1,
    });
    const roadMesh = new THREE.Mesh(roadGeo, roadMat);
    roadMesh.rotation.x = -Math.PI / 2;
    roadMesh.position.y = 0;
    roadMesh.receiveShadow = true;
    scene.add(roadMesh);
    roadMeshRef.current = roadMesh;

    // Dirt/Gravel Shoulders
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x332517, roughness: 0.95 });
    const topShoulder = new THREE.Mesh(new THREE.PlaneGeometry(120, 10), shoulderMat);
    topShoulder.rotation.x = -Math.PI / 2;
    topShoulder.position.set(0, -0.01, -17);
    scene.add(topShoulder);
    shoulderTopRef.current = topShoulder;

    const botShoulder = new THREE.Mesh(new THREE.PlaneGeometry(120, 10), shoulderMat.clone());
    botShoulder.rotation.x = -Math.PI / 2;
    botShoulder.position.set(0, -0.01, 17);
    scene.add(botShoulder);
    shoulderBotRef.current = botShoulder;

    // Road Markings (Dashed Center line + Solid Edges)
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.35 });
    for (let x = -55; x < 55; x += 4) {
      const dash = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.2), lineMat);
      dash.rotation.x = -Math.PI / 2;
      dash.position.set(x, 0.02, 0);
      scene.add(dash);
    }

    const edgeLineMat = new THREE.MeshBasicMaterial({ color: 0xfbbf24, transparent: true, opacity: 0.45 });
    const topEdge = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.25), edgeLineMat);
    topEdge.rotation.x = -Math.PI / 2;
    topEdge.position.set(0, 0.02, -10.5);
    scene.add(topEdge);

    const botEdge = new THREE.Mesh(new THREE.PlaneGeometry(120, 0.25), edgeLineMat);
    botEdge.rotation.x = -Math.PI / 2;
    botEdge.position.set(0, 0.02, 10.5);
    scene.add(botEdge);

    // Street light poles along the highway
    for (let x = -48; x <= 48; x += 24) {
      const pole = new THREE.Group();
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.16, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.7 })
      );
      mast.position.y = 4;
      pole.add(mast);

      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.08, 3, 8),
        new THREE.MeshStandardMaterial({ color: 0x475569 })
      );
      arm.rotation.z = Math.PI / 3;
      arm.position.set(1.2, 7.5, 0);
      pole.add(arm);

      // Light bulb emitter
      const bulb = new THREE.Mesh(
        new THREE.SphereGeometry(0.3, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      bulb.position.set(2.4, 7.5, 0);
      pole.add(bulb);

      const poleLight = new THREE.PointLight(0x38bdf8, 0.8, 18);
      poleLight.position.set(2.4, 7.2, 0);
      pole.add(poleLight);

      pole.position.set(x, 0, -12);
      scene.add(pole);
    }

    // Overhead Indian Highway Gantry Sign
    const gantry = new THREE.Group();
    const gantryMastL = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    gantryMastL.position.set(0, 4, -11.5);
    const gantryMastR = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 8, 8), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    gantryMastR.position.set(0, 4, 11.5);
    const gantryBeam = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 23.5), new THREE.MeshStandardMaterial({ color: 0x334155 }));
    gantryBeam.position.set(0, 7.6, 0);
    gantry.add(gantryMastL, gantryMastR, gantryBeam);

    // Green Signboard
    const signBoard = new THREE.Mesh(
      new THREE.BoxGeometry(0.1, 1.8, 8),
      new THREE.MeshStandardMaterial({ color: 0x065f46, roughness: 0.4 })
    );
    signBoard.position.set(0, 6.8, 0);
    gantry.add(signBoard);
    gantry.position.set(25, 0, 0);
    scene.add(gantry);
  };

  // Build Procedural 3D Autonomous Car
  const build3DVehicle = (): THREE.Group => {
    const car = new THREE.Group();

    // 1. Lower Chassis
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x0284c7, // Navora Cyan Blue
      metalness: 0.85,
      roughness: 0.25,
    });
    const chassis = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.75, 1.7), bodyMat);
    chassis.position.y = 0.65;
    chassis.castShadow = true;
    car.add(chassis);

    // 2. Cabin / Glass Canopy
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      metalness: 0.95,
      roughness: 0.1,
      transparent: true,
      opacity: 0.85,
    });
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.65, 1.4), glassMat);
    cabin.position.set(-0.2, 1.25, 0);
    cabin.castShadow = true;
    car.add(cabin);

    // 3. Roof LiDAR Sensor Turret
    const lidarBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.25, 0.25, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.9 })
    );
    lidarBase.position.set(-0.2, 1.65, 0);
    car.add(lidarBase);

    const lidarPuck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.18, 0.18, 0.25, 16),
      new THREE.MeshStandardMaterial({ color: 0x06b6d4, emissive: 0x0891b2, emissiveIntensity: 0.8 })
    );
    lidarPuck.position.set(-0.2, 1.82, 0);
    car.add(lidarPuck);
    lidarPuckRef.current = lidarPuck;

    // 4. Wheels (4 alloy wheels)
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b, roughness: 0.8 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 });

    const createWheel = () => {
      const wheelGroup = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.26, 16), wheelMat);
      tire.rotation.x = Math.PI / 2;
      tire.castShadow = true;

      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.27, 8), rimMat);
      rim.rotation.x = Math.PI / 2;

      wheelGroup.add(tire, rim);
      return wheelGroup;
    };

    const fl = new THREE.Group();
    const flW = createWheel();
    fl.add(flW);
    fl.position.set(1.2, 0.38, 0.88);
    car.add(fl);
    frontLeftWheelRef.current = fl;

    const fr = new THREE.Group();
    const frW = createWheel();
    fr.add(frW);
    fr.position.set(1.2, 0.38, -0.88);
    car.add(fr);
    frontRightWheelRef.current = fr;

    const rl = new THREE.Group();
    const rlW = createWheel();
    rl.add(rlW);
    rl.position.set(-1.2, 0.38, 0.88);
    car.add(rl);
    rearLeftWheelRef.current = rl;

    const rr = new THREE.Group();
    const rrW = createWheel();
    rr.add(rrW);
    rr.position.set(-1.2, 0.38, -0.88);
    car.add(rr);
    rearRightWheelRef.current = rr;

    // 5. Headlights with Spotlights
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
    const hlL = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), headlightMat);
    hlL.position.set(1.8, 0.65, 0.55);
    const hlR = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.3), headlightMat);
    hlR.position.set(1.8, 0.65, -0.55);
    car.add(hlL, hlR);

    const spotL = new THREE.SpotLight(0xbae6fd, 2.5, 30, Math.PI / 6, 0.4, 1);
    spotL.position.set(1.8, 0.65, 0.55);
    spotL.target.position.set(15, 0, 0.55);
    car.add(spotL, spotL.target);
    headlightSpotLeftRef.current = spotL;

    const spotR = new THREE.SpotLight(0xbae6fd, 2.5, 30, Math.PI / 6, 0.4, 1);
    spotR.position.set(1.8, 0.65, -0.55);
    spotR.target.position.set(15, 0, -0.55);
    car.add(spotR, spotR.target);
    headlightSpotRightRef.current = spotR;

    // 6. Rear LED Brake Light Bar
    const brakeMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      emissive: 0x991b1b,
      emissiveIntensity: 0.8,
    });
    const brakeLight = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.4), brakeMat);
    brakeLight.position.set(-1.8, 0.7, 0);
    car.add(brakeLight);
    brakeLightMeshRef.current = brakeLight;

    return car;
  };

  // Build LiDAR Particles
  const buildLiDARParticles = (): THREE.Points => {
    const particleCount = 1800;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    const color1 = new THREE.Color(0x06b6d4); // cyan
    const color2 = new THREE.Color(0x10b981); // emerald

    for (let i = 0; i < particleCount; i++) {
      const radius = 2 + Math.random() * 22;
      const angle = Math.random() * Math.PI * 2;
      const y = 0.1 + (Math.random() - 0.5) * 1.5;

      positions[i * 3] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      const mixed = color1.clone().lerp(color2, Math.random());
      colors[i * 3] = mixed.r;
      colors[i * 3 + 1] = mixed.g;
      colors[i * 3 + 2] = mixed.b;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.18,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });

    return new THREE.Points(geometry, material);
  };

  // Build Rain Particle System
  const buildRainParticles = (): THREE.Points => {
    const rainCount = 2500;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(rainCount * 3);

    for (let i = 0; i < rainCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 100;
      positions[i * 3 + 1] = Math.random() * 25;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
    }

    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color: 0x93c5fd,
      size: 0.12,
      transparent: true,
      opacity: 0.6,
    });

    const rain = new THREE.Points(geometry, material);
    rain.visible = false;
    return rain;
  };

  // Helper: Create 3D Mesh for Obstacle based on Indian Road Type
  const create3DObstacleMesh = (obs: Obstacle): THREE.Group => {
    const group = new THREE.Group();

    if (obs.type === "cow") {
      // 🐄 Indian Cow 3D Model (Torso, head, horns, legs, tail)
      const hideMat = new THREE.MeshStandardMaterial({ color: 0xd6c7b2, roughness: 0.9 });
      const spotMat = new THREE.MeshStandardMaterial({ color: 0x543d2b, roughness: 0.9 });
      const hornMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });

      // Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.0, 0.9), hideMat);
      body.position.y = 1.0;
      body.castShadow = true;
      group.add(body);

      // Spot patches
      const patch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.92), spotMat);
      patch.position.set(0.2, 1.1, 0);
      group.add(patch);

      // Neck & Head
      const neck = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.7, 0.6), hideMat);
      neck.position.set(1.0, 1.4, 0);
      neck.rotation.z = -Math.PI / 6;

      const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.6, 0.55), hideMat);
      head.position.set(1.3, 1.55, 0);
      group.add(neck, head);

      // Horns
      const hornL = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), hornMat);
      hornL.position.set(1.2, 1.95, 0.28);
      hornL.rotation.z = -Math.PI / 4;
      const hornR = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.45, 6), hornMat);
      hornR.position.set(1.2, 1.95, -0.28);
      hornR.rotation.z = -Math.PI / 4;
      group.add(hornL, hornR);

      // 4 Legs
      const legGeo = new THREE.CylinderGeometry(0.09, 0.08, 0.75, 8);
      const flLeg = new THREE.Mesh(legGeo, hideMat);
      flLeg.position.set(0.6, 0.38, 0.35);
      flLeg.name = "leg_fl";
      const frLeg = new THREE.Mesh(legGeo, hideMat);
      frLeg.position.set(0.6, 0.38, -0.35);
      frLeg.name = "leg_fr";
      const rlLeg = new THREE.Mesh(legGeo, hideMat);
      rlLeg.position.set(-0.6, 0.38, 0.35);
      rlLeg.name = "leg_rl";
      const rrLeg = new THREE.Mesh(legGeo, hideMat);
      rrLeg.position.set(-0.6, 0.38, -0.35);
      rrLeg.name = "leg_rr";
      group.add(flLeg, frLeg, rlLeg, rrLeg);

      // Danger bounding ring
      const ringGeo = new THREE.RingGeometry(1.2, 1.35, 24);
      const ringMat = new THREE.MeshBasicMaterial({ color: 0xef4444, side: THREE.DoubleSide, transparent: true, opacity: 0.45 });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.05;
      group.add(ring);
    } else if (obs.type === "auto") {
      // 🛺 Auto Rickshaw 3D Model
      const greenMat = new THREE.MeshStandardMaterial({ color: 0x15803d, metalness: 0.5, roughness: 0.4 });
      const yellowMat = new THREE.MeshStandardMaterial({ color: 0xeab308, roughness: 0.6 });
      const wheelMat = new THREE.MeshStandardMaterial({ color: 0x18181b });

      // Lower Body
      const lower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.6, 1.2), greenMat);
      lower.position.y = 0.55;
      lower.castShadow = true;
      group.add(lower);

      // Yellow Canvas Top
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.75, 1.15), yellowMat);
      roof.position.set(-0.2, 1.2, 0);
      roof.castShadow = true;
      group.add(roof);

      // Front wheel + 2 Rear wheels
      const fWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), wheelMat);
      fWheel.rotation.x = Math.PI / 2;
      fWheel.position.set(0.85, 0.28, 0);
      const rlWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), wheelMat);
      rlWheel.rotation.x = Math.PI / 2;
      rlWheel.position.set(-0.7, 0.28, 0.6);
      const rrWheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), wheelMat);
      rrWheel.rotation.x = Math.PI / 2;
      rrWheel.position.set(-0.7, 0.28, -0.6);
      group.add(fWheel, rlWheel, rrWheel);

      // Headlight
      const hl = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 8), new THREE.MeshBasicMaterial({ color: 0xfef08a }));
      hl.position.set(1.12, 0.65, 0);
      group.add(hl);
    } else if (obs.type === "pothole") {
      // 🕳️ 3D Pothole Crater
      const craterMat = new THREE.MeshStandardMaterial({ color: 0x09090b, roughness: 1.0 });
      const crater = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.6, 0.35, 16), craterMat);
      crater.position.y = -0.15;
      group.add(crater);

      const warningRing = new THREE.Mesh(
        new THREE.RingGeometry(0.95, 1.15, 20),
        new THREE.MeshBasicMaterial({ color: 0xf59e0b, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })
      );
      warningRing.rotation.x = -Math.PI / 2;
      warningRing.position.y = 0.04;
      group.add(warningRing);
    } else if (obs.type === "speed_breaker") {
      // ⬛ 3D Striped Speed Breaker
      const bumpMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.6 });
      const bump = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7.5, 16, 1, false, 0, Math.PI), bumpMat);
      bump.rotation.z = Math.PI / 2;
      bump.position.y = 0.12;
      group.add(bump);
    } else if (obs.type === "bike") {
      // 🏍️ Motorbike & Rider
      const bikeBody = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: 0xe11d48 }));
      bikeBody.position.y = 0.55;
      const rider = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.8, 0.4), new THREE.MeshStandardMaterial({ color: 0x3b82f6 }));
      rider.position.set(-0.1, 1.1, 0);
      group.add(bikeBody, rider);

      const fW = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x18181b }));
      fW.rotation.x = Math.PI / 2;
      fW.position.set(0.65, 0.32, 0);
      const rW = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 12), new THREE.MeshStandardMaterial({ color: 0x18181b }));
      rW.rotation.x = Math.PI / 2;
      rW.position.set(-0.65, 0.32, 0);
      group.add(fW, rW);
    } else if (obs.type === "pedestrian") {
      // 🚶 Jaywalking Pedestrian
      const clothesMat = new THREE.MeshStandardMaterial({ color: 0x6366f1 });
      const headMat = new THREE.MeshStandardMaterial({ color: 0xfcd34d });
      const legMat = new THREE.MeshStandardMaterial({ color: 0x1e293b });

      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.6, 0.25), clothesMat);
      torso.position.y = 1.0;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 12), headMat);
      head.position.y = 1.5;
      group.add(torso, head);

      const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), legMat);
      lLeg.position.set(0, 0.35, 0.1);
      lLeg.name = "ped_leg_l";
      const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.7, 0.14), legMat);
      rLeg.position.set(0, 0.35, -0.1);
      rLeg.name = "ped_leg_r";
      group.add(lLeg, rLeg);
    } else if (obs.type === "truck") {
      // 🚛 Heavy Indian Truck
      const cabMat = new THREE.MeshStandardMaterial({ color: 0x0284c7, metalness: 0.6 });
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd97706, roughness: 0.7 });

      const cab = new THREE.Mesh(new THREE.BoxGeometry(2.0, 2.2, 2.2), cabMat);
      cab.position.set(2.0, 1.4, 0);
      const bed = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.0, 2.2), bodyMat);
      bed.position.set(-1.2, 1.4, 0);
      group.add(cab, bed);
    } else {
      // 🚧 Default Barricade / Obstacle Box
      const barMat = new THREE.MeshStandardMaterial({ color: 0xea580c, metalness: 0.4 });
      const box = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 0.4), barMat);
      box.position.y = 0.45;
      group.add(box);
    }

    return group;
  };

  // Theme + Weather update effect (theme sets base look, weather layers on top)
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    const isMorning = sim.theme === "morning";

    // --- Theme base colors ---
    const morningBg = new THREE.Color(0xc9e8f5);    // soft morning sky
    const morningFogDensity = 0.004;
    const nightBg = new THREE.Color(0x020617);       // deep night
    const nightFogDensity = 0.012;

    const bg = isMorning ? morningBg : nightBg;
    const fogD = isMorning ? morningFogDensity : nightFogDensity;
    scene.background = bg;
    scene.fog = new THREE.FogExp2(bg, fogD);

    // Road materials
    if (roadMeshRef.current) {
      const mat = roadMeshRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(isMorning ? 0xb0bec5 : 0x1a202c);
      mat.roughness = isMorning ? 0.7 : 0.85;
    }
    if (shoulderTopRef.current) {
      const mat = shoulderTopRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(isMorning ? 0x8d6e53 : 0x332517);
    }
    if (shoulderBotRef.current) {
      const mat = shoulderBotRef.current.material as THREE.MeshStandardMaterial;
      mat.color.set(isMorning ? 0x8d6e53 : 0x332517);
    }

    // --- Lighting: theme base, then weather adjusts ---
    let dirIntensity = isMorning ? 1.6 : 0.3;
    let hemiIntensity = isMorning ? 0.8 : 0.25;
    let ambientIntensity = isMorning ? 0.7 : 0.35;
    let headlightIntensity = isMorning ? 0.5 : 4.0;
    let showRain = false;
    let extraFogD = 0;

    // Weather adjustments
    if (sim.weather === "rain") {
      dirIntensity *= 0.55;
      hemiIntensity *= 0.6;
      extraFogD = 0.015;
      showRain = true;
      headlightIntensity = isMorning ? 1.5 : 3.5;
    } else if (sim.weather === "fog") {
      dirIntensity *= 0.65;
      hemiIntensity *= 0.75;
      extraFogD = 0.03;
      headlightIntensity = isMorning ? 1.2 : 3.0;
    } else if (sim.weather === "night") {
      dirIntensity *= 0.15;
      hemiIntensity *= 0.3;
      headlightIntensity = isMorning ? 1.0 : 4.5;
    }
    // "day" weather = no extra adjustment on top of theme

    if (dirLightRef.current) dirLightRef.current.intensity = dirIntensity;
    if (hemiLightRef.current) hemiLightRef.current.intensity = hemiIntensity;
    if (ambientLightRef.current) ambientLightRef.current.intensity = ambientIntensity;
    if (headlightSpotLeftRef.current) headlightSpotLeftRef.current.intensity = headlightIntensity;
    if (headlightSpotRightRef.current) headlightSpotRightRef.current.intensity = headlightIntensity;
    if (rainParticlesRef.current) rainParticlesRef.current.visible = showRain;

    // Extra fog from weather
    if (scene.fog && extraFogD > 0) {
      scene.fog.density += extraFogD;
    }

    // Headlight color: warm in morning, cool blue at night
    const hlColor = isMorning ? 0xfff3c4 : 0xbae6fd;
    if (headlightSpotLeftRef.current) headlightSpotLeftRef.current.color.set(hlColor);
    if (headlightSpotRightRef.current) headlightSpotRightRef.current.color.set(hlColor);

    // Hemisphere light colors
    if (hemiLightRef.current) {
      hemiLightRef.current.color.set(isMorning ? 0x87ceeb : 0x38bdf8);
      hemiLightRef.current.groundColor.set(isMorning ? 0x8d6e53 : 0x1e293b);
    }
  }, [sim.theme, sim.weather]);

  // Main 3D Simulation & Animation Tick
  useEffect(() => {
    let active = true;

    const tick = (now: number) => {
      if (!active) return;

      const dt = Math.min((now - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = now;
      lidarAngleRef.current = (lidarAngleRef.current + 8 * dt) % (Math.PI * 2);

      const scene = sceneRef.current;
      const camera = cameraRef.current;
      const renderer = rendererRef.current;
      const costMap = getCostMap(1000, 600);

      if (!scene || !camera || !renderer) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      // Always read the latest sim state (fixes stale closure in rAF loop)
      const latestSim = simRef.current;

      // 1. Simulation Physics Step
      if (latestSim.isRunning && !latestSim.isGoalReached) {
        onSimUpdate((prev) => {
          // --- Update dynamic obstacles (physics) ---
          const updatedObstacles = prev.obstacles.map((obs) => {
            if (isDynamic(obs)) {
              return updateDynamicObstacle(obs, 1000, 600, dt);
            }
            return obs;
          });

          // --- Compute predicted future positions for planning ---
          const predictedObstacles: Array<{ x: number; y: number; radius: number; velocityX?: number; velocityY?: number }> = [];
          const bikeAvoidance: Map<string, { headingDelta: number }> = new Map();

          for (const obs of updatedObstacles) {
            if (isDynamic(obs)) {
              const pred = predictFuturePosition(obs, 1.0); // 1s horizon
              predictedObstacles.push({
                x: pred.x,
                y: pred.y,
                radius: obs.radius,
                velocityX: obs.velocityX,
                velocityY: obs.velocityY,
              });
              // Special avoidance for oncoming bikes and crossing pedestrians
              if (obs.type === "bike" || obs.type === "pedestrian") {
                const carCenterY = prev.vehicle.position.y;
                const obsPredY = pred.y;
                // Steer toward the opposite shoulder from the car
                const headingDelta = obsPredY > carCenterY ? -0.25 : 0.25;
                bikeAvoidance.set(obs.id, { headingDelta });
              }
            } else {
              predictedObstacles.push({
                x: obs.x,
                y: obs.y,
                radius: obs.radius,
              });
            }
          }

          // --- Apply bike avoidance heading changes ---
          const bikeAvoidedObstacles = updatedObstacles.map((obs) => {
            if (isDynamic(obs) && bikeAvoidance.has(obs.id)) {
              const { headingDelta } = bikeAvoidance.get(obs.id)!;
              const obsAsDynamic = obs as DynamicObstacle;
              // Adjust heading toward the avoidance shoulder, bounded by max change
              let newHeading = obsAsDynamic.heading + headingDelta;
              // Clamp heading change to prevent unrealistic jumps
              const maxDelta = Math.abs(obsAsDynamic.velocityX) * dt * 0.5; // rough bound
              newHeading = Math.max(obsAsDynamic.heading - maxDelta, Math.min(obsAsDynamic.heading + maxDelta, newHeading));
              obsAsDynamic.heading = newHeading;
              // Recompute velocity components from heading + speed magnitude
              const speed = Math.hypot(obsAsDynamic.velocityX, obsAsDynamic.velocityY);
              if (speed > 0) {
                obsAsDynamic.velocityX = Math.cos(newHeading) * speed;
                obsAsDynamic.velocityY = Math.sin(newHeading) * speed;
              }
            }
            return obs;
          });
          const currentObstacles = bikeAvoidedObstacles;

          // --- Sensor detections & TTC (use predicted positions for dynamic) ---
          // Build a map from obstacle id to its predicted position
          const predPosMap = new Map<string, { x: number; y: number }>();
          for (const ob of currentObstacles) {
            if (isDynamic(ob)) {
              const p = predictFuturePosition(ob, 1.0);
              predPosMap.set(ob.id, p);
            }
          }
          const detections = getSensorDetections(prev.vehicle, currentObstacles, 320);

          // Override estimatedTTC in detections with velocity-aware version
          for (const det of detections) {
            const obs = det.obstacle;
            if (isDynamic(obs) && predPosMap.has(obs.id)) {
              const p = predPosMap.get(obs.id)!;
              // Recalculate distance and approach speed using predicted future state
              const dx = p.x - prev.vehicle.position.x;
              const dy = p.y - prev.vehicle.position.y;
              const dist = Math.hypot(dx, dy);
              const vxEgo = prev.vehicle.velocity * Math.cos(prev.vehicle.heading);
              const vyEgo = prev.vehicle.velocity * Math.sin(prev.vehicle.heading);
              const obsVX = obs.velocityX * 45;
              const obsVY = obs.velocityY * 45;
              const relVx = vxEgo - obsVX;
              const relVy = vyEgo - obsVY;
              const approachSpeed = (dx * relVx + dy * relVy) / (dist || 1);
              det.estimatedTTC = approachSpeed > 0.5 ? dist / approachSpeed : dist / (prev.vehicle.velocity || 1);
            }
          }

          const warning = calculateTTC(prev.vehicle, currentObstacles);

          // Sound triggers
          soundEngine.updateEngineSound(prev.vehicle.velocity, prev.targetSpeed);
          soundEngine.playWarningBeep(warning.ttc);

          let emergencyCount = prev.emergencyBrakesCount;
          let isEmergency = false;
          if (warning.level === "emergency_braking") {
            isEmergency = true;
            soundEngine.playAEBAlarm();
            if (prev.collisionWarning.level !== "emergency_braking") {
              emergencyCount += 1;
            }
          }

          // When AEB detects an oncoming bike, force the car to a complete stop
          // so the bike can safely pass without collision.
          const isEmergencyBrake =
            warning.level === "emergency_braking" &&
            warning.dangerObstacle?.type === "bike" &&
            isDynamic(warning.dangerObstacle);

          // Adaptive Planner (from SIH prototype)
          const tStart = performance.now();
          const distToGoal = Math.hypot(
            prev.goal.x - prev.vehicle.position.x,
            prev.goal.y - prev.vehicle.position.y
          );

          // Build obstacles list for planner (use predicted positions for dynamic)
          const plannerObstacles = [];
          for (const o of currentObstacles) {
            if (isDynamic(o)) {
              const pred = predictFuturePosition(o, 1.0);
              plannerObstacles.push({
                x: pred.x,
                y: pred.y,
                radius: o.radius,
              });
            } else {
              plannerObstacles.push({
                x: o.x,
                y: o.y,
                radius: o.radius,
              });
            }
          }

          // Initialize replanning state from previous
          let waypointIdx = prev.waypointIdx ?? 0;
          let replanning = prev.replanning ?? false;
          let replanTimer = prev.replanTimer ?? 0;
          let replanCount = prev.replanCount ?? 0;
          let stuckTimer = prev.stuckTimer ?? 0;

          // ─── Replanning state machine with stuck recovery ───
          let newPlannedPath = prev.plannedPath;
          if (replanning) {
            replanTimer -= dt;
            stuckTimer += dt;

            // After wait, generate adaptive path (wider detour if stuck > 5s)
            if (replanTimer <= 0) {
              const wideDetour = stuckTimer > 5;
              newPlannedPath = generateAdaptivePlan(
                prev.vehicle.position,
                prev.goal,
                plannerObstacles,
                wideDetour ? 40 : 80,   // wider roadTop
                wideDetour ? 560 : 520,  // wider roadBottom
              );
              waypointIdx = 0;
              replanning = false;

              // NOTE: stuckTimer is intentionally NOT reset here — a high value
              // keeps the follower's minimum-crawl speed active so the car keeps
              // moving forward on the new detour path even while an obstacle's
              // braking envelope still overlaps. It only decays once the car
              // actually gets moving again.
            }
          } else {
            // Track stuck time: if velocity is near-zero and either replans are
            // happening OR a forward threat is present (AEB hold), count it.
            // Ground hazards don't trigger isPathBlocked (by design), so the
            // threat check is what lets them recover too.
            const isNearZeroSpeed = prev.vehicle.velocity < 5;
            const hasFwdThreat = detections.some(
              d => d.confidence > 0.3 && d.distance < 70 && Math.abs(d.relativeBearing) < 1.2
            );
            if (isNearZeroSpeed && (replanCount > 0 || hasFwdThreat)) {
              stuckTimer += dt;
            } else {
              // Moving (or nothing nearby) = reset stuck timer
              stuckTimer = Math.max(0, stuckTimer - dt * 3);
            }

            // Check if path is blocked
            if (
              newPlannedPath.length <= 1 ||
              isPathBlocked(prev.vehicle.position.x, newPlannedPath, plannerObstacles)
            ) {
              replanning = true;
              // Progressive pause: 2s first time, 1s after that (don't wait long)
              replanTimer = replanCount === 0 ? 2.0 : 1.0;
              replanCount += 1;
            }

            // Force replan if stuck too long without hitting the path-blocked trigger.
            // stuckTimer is left intact so the follower keeps its crawl speed.
            if (stuckTimer > 8 && isNearZeroSpeed) {
              replanning = true;
              replanTimer = 1.5;
              replanCount += 1;
            }
          }

          // Determine driving mode
          let mode = "normal";
          let reason = "";
          const fwdDetections = detections.filter(d => Math.abs(d.relativeBearing) < 1.2);
          const nearPedAnimal = fwdDetections.filter(
            d => (d.obstacle.type === "pedestrian" || d.obstacle.type === "cow") && d.distance < 90
          );
          const closest = fwdDetections.length > 0 ? Math.min(...fwdDetections.map(d => d.distance)) : Infinity;
          if (nearPedAnimal.length >= 2) {
            mode = "cautious";
            reason = "Animals/pedestrians ahead";
          } else if (closest < 45) {
            mode = "cautious";
            reason = `Close obstacle ${closest.toFixed(0)}px`;
          } else if (closest < 120) {
            mode = "normal";
            reason = "Traffic ahead — maintaining margin";
          } else {
            mode = "assertive";
            reason = "Clear path ahead";
          }

          // Goal follower control
          let targetSpeed = prev.targetSpeed;
          let targetSteer = 0;
          if (!replanning) {
            const follower = new GoalFollower();
            const egoProxy = {
              x: prev.vehicle.position.x,
              y: prev.vehicle.position.y,
              angle: prev.vehicle.heading,
              speed: prev.vehicle.velocity,
            };
            const detForFollower = detections.map(d => ({
              dist: d.distance,
              bearing: d.relativeBearing,
              erratic: d.obstacle.type === "cow" ? 0.4 : 0.2,
              confidence: d.confidence,
            }));
            [targetSpeed, targetSteer, waypointIdx] = follower.control(
              egoProxy,
              newPlannedPath,
              waypointIdx,
              detForFollower,
              mode,
              dt,
              stuckTimer,
              isEmergencyBrake  // pass emergency brake flag
            );
          } else {
            // During replanning: keep a slow crawl so the car doesn't fully die
            targetSpeed = stuckTimer > 5 ? 3 : 0;
            targetSteer = 0;
          }

          // Safety override (TTC based)
          const [safeSpeed, safeReason] = safetyOverride(
            prev.vehicle.velocity,
            detections.map(d => ({ dist: d.distance, bearing: d.relativeBearing, confidence: d.confidence }))
          );
          if (safeReason) {
            targetSpeed = Math.min(targetSpeed, safeSpeed);
            reason = safeReason;
          }

          // Compute throttle and steerDelta for vehicle update
          const maxAccel = DEFAULT_VEHICLE_PARAMS.acceleration;
          const maxDecel = DEFAULT_VEHICLE_PARAMS.brakeDeceleration;
          let throttle = 0;
          let steerDelta = 0;

          // In MANUAL mode the AI still steers the adaptive plan (like the
          // Python prototype): the driver controls motion by HOLDING ENTER,
          // release = brake. AEB stays authoritative either way.
          const steerRate = 3.5; // rad/s, matches updateVehicle
          const desiredSteer = targetSteer * DEFAULT_VEHICLE_PARAMS.maxSteeringAngle;
          const steerDiff = desiredSteer - prev.vehicle.steeringAngle;
          const steerToPlan = Math.max(-steerRate * dt, Math.min(steerRate * dt, steerDiff));

          if (prev.isManualDrive) {
            if (isEmergency) {
              throttle = -1;
            } else {
              // Full throttle while ENTER is held (driver-paced execution).
              // Target speed still comes from the follower's braking envelope.
              throttle = prev.manualThrottle > 0 ? Math.min(1, (targetSpeed - prev.vehicle.velocity) / (maxAccel * dt)) : -0.35;
            }
            steerDelta = steerToPlan;
          } else {
            if (isEmergency) {
              throttle = -1;
            } else if (prev.vehicle.velocity < targetSpeed) {
              throttle = Math.min(1, (targetSpeed - prev.vehicle.velocity) / (maxAccel * dt));
            } else if (prev.vehicle.velocity > targetSpeed) {
              throttle = Math.max(-1, -(prev.vehicle.velocity - targetSpeed) / (maxDecel * dt));
            } else {
              throttle = 0;
            }
            steerDelta = steerToPlan;
          }

          let updatedVehicle = updateVehicle(
            prev.vehicle,
            dt,
            throttle,
            steerDelta,
            {
              ...DEFAULT_VEHICLE_PARAMS,
              maxSpeed: Math.max(40, targetSpeed),
            }
          );

          // Goal reached: brake to a standstill at the flag and celebrate.
          // The tick gate (!isGoalReached) then freezes the sim so the car is
          // clearly seen arriving at the finish. Press Reset to run again.
          let goalReached = false;
          if (distToGoal < 30) {
            if (updatedVehicle.velocity > 25) {
              // Brake hard toward a clean stop as it crosses the flag
              updatedVehicle = updateVehicle(
                updatedVehicle,
                dt,
                -1,
                0,
                DEFAULT_VEHICLE_PARAMS
              );
            } else {
              goalReached = true;
              updatedVehicle = { ...updatedVehicle, velocity: 0 };
              newPlannedPath = [];
              waypointIdx = 0;
              soundEngine.playSuccessChime();
              try {
                confetti({ particleCount: 90, spread: 90, origin: { y: 0.6 } });
              } catch {}
            }
          }

          const newExecuted = [...prev.executedPath, updatedVehicle.position];
          if (newExecuted.length > 400) newExecuted.shift();

          const minClearance = detections.length > 0 ? detections[0].distance : 120;
          const currentSafety = calculateSafetyScore(
            warning.ttc,
            minClearance,
            emergencyCount,
            costMap.roughnessGrid[costMap.worldToGrid(updatedVehicle.position).r]?.[costMap.worldToGrid(updatedVehicle.position).c] || 0
          );

          const replanLatency = Math.round(performance.now() - tStart);

          return {
            ...prev,
            vehicle: updatedVehicle,
            obstacles: currentObstacles,
            plannedPath: newPlannedPath,
            executedPath: newExecuted,
            dwaTrajectories: [],
            selectedDwaPath: [],
            collisionWarning: warning,
            sensorDetections: detections,
            safetyScore: currentSafety,
            replanTimeMs: Math.max(7, replanLatency),
            emergencyBrakesCount: emergencyCount,
            isGoalReached: goalReached,
            waypointIdx,
            replanning,
            replanTimer,
            replanCount,
            mode,
            reason,
            stuckTimer,
          };
        });
      }

      // 2. Synchronize 3D Vehicle Mesh
      const carGroup = carGroupRef.current;
      if (carGroup) {
        const vPos3D = simTo3D(latestSim.vehicle.position);
        carGroup.position.x = vPos3D.x;
        carGroup.position.z = vPos3D.z;
        carGroup.rotation.y = -latestSim.vehicle.heading; // align with 2D heading
        carGroup.rotation.x = latestSim.vehicle.suspensionPitch;

        // Front wheels steering
        if (frontLeftWheelRef.current) frontLeftWheelRef.current.rotation.y = -latestSim.vehicle.steeringAngle;
        if (frontRightWheelRef.current) frontRightWheelRef.current.rotation.y = -latestSim.vehicle.steeringAngle;

        // Spin wheels
        const wRot = latestSim.vehicle.wheelRotation;
        if (frontLeftWheelRef.current?.children[0]) frontLeftWheelRef.current.children[0].rotation.x = wRot;
        if (frontRightWheelRef.current?.children[0]) frontRightWheelRef.current.children[0].rotation.x = wRot;
        if (rearLeftWheelRef.current?.children[0]) rearLeftWheelRef.current.children[0].rotation.x = wRot;
        if (rearRightWheelRef.current?.children[0]) rearRightWheelRef.current.children[0].rotation.x = wRot;

        // Spin LiDAR puck
        if (lidarPuckRef.current) {
          lidarPuckRef.current.rotation.y = lidarAngleRef.current;
        }

        // Brake lights
        if (brakeLightMeshRef.current) {
          const mat = brakeLightMeshRef.current.material as THREE.MeshStandardMaterial;
          mat.emissiveIntensity = latestSim.vehicle.isBraking ? 2.5 : 0.4;
        }

        // LiDAR Point Cloud follow vehicle
        if (lidarPointCloudRef.current) {
          lidarPointCloudRef.current.position.set(vPos3D.x, 0.4, vPos3D.z);
          lidarPointCloudRef.current.rotation.y = lidarAngleRef.current;
          lidarPointCloudRef.current.visible = latestSim.showLidarCloud;
        }
      }

      // 3. Synchronize 3D Obstacle Meshes
      const existingMeshIds = new Set(obstacleMeshesRef.current.keys());
      const currentObsIds = new Set(latestSim.obstacles.map((o) => o.id));

      // Remove deleted obstacles
      for (const id of existingMeshIds) {
        if (!currentObsIds.has(id)) {
          const mesh = obstacleMeshesRef.current.get(id);
          if (mesh) {
            scene.remove(mesh);
            obstacleMeshesRef.current.delete(id);
          }
        }
      }

      // Add / Update current obstacles
      for (const obs of latestSim.obstacles) {
        let mesh = obstacleMeshesRef.current.get(obs.id);
        if (!mesh) {
          mesh = create3DObstacleMesh(obs);
          scene.add(mesh);
          obstacleMeshesRef.current.set(obs.id, mesh);
        }

        const obs3D = simTo3D(obs);
        mesh.position.x = obs3D.x;
        mesh.position.z = obs3D.z;

        if (isDynamic(obs)) {
          mesh.rotation.y = -obs.heading;

          // Cow leg animation
          if (obs.type === "cow") {
            const swing = Math.sin(obs.animPhase) * 0.35;
            mesh.getObjectByName("leg_fl")?.rotation.set(swing, 0, 0);
            mesh.getObjectByName("leg_fr")?.rotation.set(-swing, 0, 0);
            mesh.getObjectByName("leg_rl")?.rotation.set(-swing, 0, 0);
            mesh.getObjectByName("leg_rr")?.rotation.set(swing, 0, 0);
          } else if (obs.type === "pedestrian") {
            const swing = Math.sin(obs.animPhase) * 0.45;
            mesh.getObjectByName("ped_leg_l")?.rotation.set(swing, 0, 0);
            mesh.getObjectByName("ped_leg_r")?.rotation.set(-swing, 0, 0);
          }
        }
      }

      // 4. Update 3D Planned & Executed Path Lines
      if (plannedPathLineRef.current && latestSim.plannedPath.length > 1) {
        const points3D = latestSim.plannedPath.map((p) => {
          const v = simTo3D(p);
          v.y = 0.12; // hover above road
          return v;
        });
        plannedPathLineRef.current.geometry.setFromPoints(points3D);
        plannedPathLineRef.current.visible = true;
      }

      if (executedPathLineRef.current && latestSim.executedPath.length > 1) {
        const points3D = latestSim.executedPath.map((p) => {
          const v = simTo3D(p);
          v.y = 0.06;
          return v;
        });
        executedPathLineRef.current.geometry.setFromPoints(points3D);
      }

      // 5. Update Rain Particle Animation
      if (rainParticlesRef.current && latestSim.weather === "rain") {
        const pos = rainParticlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 1; i < pos.length; i += 3) {
          pos[i] -= 0.8;
          if (pos[i] < 0) pos[i] = 24;
        }
        rainParticlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // 6. Camera Updates
      const vPos = simTo3D(latestSim.vehicle.position);
      const heading = -latestSim.vehicle.heading;

      if (latestSim.cameraMode === "chase") {
        // Smooth 3rd-person chase camera behind vehicle
        const camDistance = 8.5;
        const camHeight = 3.8;
        const targetX = vPos.x - Math.cos(heading) * camDistance;
        const targetZ = vPos.z - Math.sin(heading) * camDistance;

        camera.position.x += (targetX - camera.position.x) * 0.1;
        camera.position.y += (camHeight - camera.position.y) * 0.1;
        camera.position.z += (targetZ - camera.position.z) * 0.1;
        camera.lookAt(vPos.x + Math.cos(heading) * 6, 1.0, vPos.z + Math.sin(heading) * 6);
      } else if (latestSim.cameraMode === "fpv") {
        // First Person Cockpit View
        camera.position.set(
          vPos.x + Math.cos(heading) * 0.2,
          1.2,
          vPos.z + Math.sin(heading) * 0.2
        );
        camera.lookAt(
          vPos.x + Math.cos(heading) * 15,
          1.0,
          vPos.z + Math.sin(heading) * 15
        );
      } else if (latestSim.cameraMode === "bev") {
        // Top-Down Bird's Eye View 3D
        camera.position.set(vPos.x + 2, 28, vPos.z + 0.1);
        camera.lookAt(vPos.x, 0, vPos.z);
      } else if (latestSim.cameraMode === "orbit") {
        // Free Roam Orbit around car
        const { theta, phi, radius } = orbitAngleRef.current;
        camera.position.set(
          vPos.x + radius * Math.sin(phi) * Math.sin(theta),
          vPos.y + radius * Math.cos(phi),
          vPos.z + radius * Math.sin(phi) * Math.cos(theta)
        );
        camera.lookAt(vPos.x, 1.0, vPos.z);
      }

      renderer.render(scene, camera);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      active = false;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Handle 3D Canvas Click to Spawn Obstacle with Raycasting
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const container = mountRef.current;
    const camera = cameraRef.current;
    const scene = sceneRef.current;
    if (!container || !camera || !scene) return;

    const rect = container.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(x, y), camera);

    // Plane at y = 0
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const intersectPt = new THREE.Vector3();
    raycaster.ray.intersectPlane(groundPlane, intersectPt);

    if (intersectPt) {
      const simPt = threeToSim(intersectPt);
      // Spawn obstacle within road limits
      onAddObstacleAt(
        Math.max(50, Math.min(950, simPt.x)),
        Math.max(100, Math.min(500, simPt.y))
      );
    }
  };

  // Orbit Mouse Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (sim.cameraMode !== "orbit") return;
    isDraggingRef.current = true;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current || sim.cameraMode !== "orbit") return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };

    orbitAngleRef.current.theta += dx * 0.008;
    orbitAngleRef.current.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.05, orbitAngleRef.current.phi + dy * 0.008));
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    if (sim.cameraMode !== "orbit") return;
    orbitAngleRef.current.radius = Math.max(6, Math.min(45, orbitAngleRef.current.radius + e.deltaY * 0.03));
  };

  const isMorning3D = sim.theme === "morning";

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border shadow-2xl group select-none"
      style={{
        background: isMorning3D ? "#e2e8f0" : "#0f172a",
        borderColor: isMorning3D ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
      }}
    >
      {/* 3D WebGL Canvas Viewport */}
      <div
        ref={mountRef}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-[540px] cursor-crosshair"
        style={{ background: isMorning3D ? "#c9e8f5" : "#0f172a" }}
      />

      {/* Goal Reached Success Banner */}
      {sim.isGoalReached && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div
            className="px-8 py-4 rounded-2xl border-2 shadow-2xl animate-pulse-slow text-center"
            style={{
              background: isMorning3D ? "rgba(255,255,255,0.92)" : "rgba(2,6,23,0.9)",
              borderColor: "#10b981",
            }}
          >
            <div className="text-3xl font-black tracking-tight" style={{ color: "#10b981" }}>
              🏁 GOAL REACHED
            </div>
            <div className="mt-1 text-xs font-mono" style={{ color: isMorning3D ? "#4a5568" : "#94a3b8" }}>
              Autopilot completed the route • Press Reset to run again
            </div>
          </div>
        </div>
      )}

      {/* Floating 3D HUD & Controls */}
      <div className="absolute top-4 left-4 flex flex-wrap items-center gap-2 pointer-events-auto">
        {/* Camera Selector */}
        <div
          className="flex backdrop-blur-md border rounded-xl p-1 shadow-lg"
          style={{
            background: isMorning3D ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.8)",
            borderColor: isMorning3D ? "rgba(0,0,0,0.1)" : "rgba(51,65,85,0.8)",
          }}
        >
          {([
            ["chase", "Chase Cam", Camera],
            ["fpv", "FPV Cockpit", Eye],
            ["bev", "3D BEV", Video],
            ["orbit", "Orbit 360°", Maximize2],
          ] as const).map(([mode, label, Icon]) => {
            const active = sim.cameraMode === mode;
            return (
              <button
                key={mode}
                onClick={() => onSimUpdate((p) => ({ ...p, cameraMode: mode }))}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  active ? "bg-cyan-500 text-black shadow-md" : isMorning3D ? "text-gray-600 hover:text-gray-900" : "text-slate-300 hover:text-white"
                }`}
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </button>
            );
          })}
        </div>

        {/* Weather Selector */}
        <div
          className="flex backdrop-blur-md border rounded-xl p-1 shadow-lg"
          style={{
            background: isMorning3D ? "rgba(255,255,255,0.75)" : "rgba(15,23,42,0.8)",
            borderColor: isMorning3D ? "rgba(0,0,0,0.1)" : "rgba(51,65,85,0.8)",
          }}
        >
          {([
            ["day", "☀️ Day", "bg-amber-500 text-black"],
            ["night", "🌙 Night", "bg-indigo-500 text-white"],
            ["rain", "🌧️ Monsoon", "bg-blue-500 text-white"],
            ["fog", "🌫️ Smog", "bg-slate-400 text-black"],
          ] as const).map(([w, label, activeClass]) => (
            <button
              key={w}
              onClick={() => onSimUpdate((p) => ({ ...p, weather: w as typeof p.weather }))}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                sim.weather === w ? activeClass : isMorning3D ? "text-gray-500 hover:text-gray-900" : "text-slate-400 hover:text-white"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Right HUD (Sound & LiDAR Toggle) */}
      <div className="absolute top-4 right-4 flex items-center gap-2 pointer-events-auto">
        <button
          onClick={() => onSimUpdate((p) => ({ ...p, showLidarCloud: !p.showLidarCloud }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold backdrop-blur-md shadow-lg transition ${
            sim.showLidarCloud
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
              : isMorning3D ? "bg-white/70 border-gray-300 text-gray-500" : "bg-slate-900/80 border-slate-700 text-slate-400 hover:text-white"
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" /> LiDAR Cloud
        </button>

        <button
          onClick={toggleAudio}
          className={`flex items-center justify-center w-9 h-9 rounded-xl border backdrop-blur-md shadow-lg transition ${
            !isAudioMuted
              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
              : isMorning3D ? "bg-white/70 border-gray-300 text-gray-500" : "bg-slate-900/80 border-slate-700 text-slate-400 hover:text-white"
          }`}
          title={isAudioMuted ? "Unmute Audio" : "Mute Audio"}
        >
          {isAudioMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4 text-cyan-400" />}
        </button>
      </div>

      {/* Bottom Floating Telemetry Overlay on 3D View */}
      <div className="absolute bottom-4 left-4 right-4 flex flex-wrap items-center justify-between pointer-events-none gap-3">
        {/* Driving Mode Banner */}
        <div
          className="flex items-center gap-2 backdrop-blur-md border rounded-xl px-4 py-2 shadow-xl pointer-events-auto"
          style={{
            background: isMorning3D ? "rgba(255,255,255,0.82)" : "rgba(2,6,23,0.85)",
            borderColor: isMorning3D ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
          }}
        >
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                sim.isManualDrive ? "bg-amber-400 animate-ping" : "bg-emerald-400 animate-pulse"
              }`}
            />
            <span
              className="text-xs font-mono font-bold uppercase"
              style={{ color: isMorning3D ? "#1e293b" : "#e2e8f0" }}
            >
              {sim.isManualDrive ? "Manual — Hold ENTER to Drive" : "Navora Autonomous AI (Active)"}
            </span>
          </div>
          <span style={{ color: isMorning3D ? "#94a3b8" : "#475569" }}>|</span>
          <span
            className="text-[11px] font-mono"
            style={{ color: isMorning3D ? "#64748b" : "#94a3b8" }}
          >
            Speed: <strong className="text-cyan-500">{Math.round((sim.vehicle.velocity / 250) * 80)} km/h</strong>
          </span>
          <span style={{ color: isMorning3D ? "#94a3b8" : "#475569" }}>|</span>
          <span
            className="text-[11px] font-mono"
            style={{ color: isMorning3D ? "#64748b" : "#94a3b8" }}
          >
            Safety: <strong className="text-emerald-500">{sim.safetyScore}%</strong>
          </span>
        </div>

        {/* 3D Interactive Helper Text */}
        <div
          className="text-[11px] font-mono backdrop-blur-md px-3 py-1.5 rounded-lg border shadow-md"
          style={{
            color: isMorning3D ? "#64748b" : "#94a3b8",
            background: isMorning3D ? "rgba(255,255,255,0.75)" : "rgba(2,6,23,0.8)",
            borderColor: isMorning3D ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
          }}
        >
          💡 Click 3D road to inject obstacle • Drag to orbit
        </div>
      </div>
    </div>
  );
};
