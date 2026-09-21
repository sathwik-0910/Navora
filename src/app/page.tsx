"use client";

import React, { useState, useCallback, useEffect } from "react";
import { Header, ViewMode } from "../components/Header";
import { Footer } from "../components/Footer";
import { BEVCanvas } from "../components/BEVCanvas";
import { Navora3DCanvas, SimulationState, ThemeMode } from "../components/Navora3DCanvas";
import { TelemetryPanel } from "../components/TelemetryPanel";
import { SensorPanel } from "../components/SensorPanel";
import { ControlPanel } from "../components/ControlPanel";
import { Legend } from "../components/Legend";
import { ArchitectureModal } from "../components/ArchitectureModal";
import { Obstacle, ObstacleType, createObstacle } from "../lib/simulation/obstacle";
import { Point } from "../lib/simulation/obstacle";

// Default Initial State
const INITIAL_VEHICLE_POS: Point = { x: 80, y: 300 };
const INITIAL_GOAL_POS: Point = { x: 880, y: 300 };

export default function Home() {
  const [showArchModal, setShowArchModal] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [theme, setTheme] = useState<ThemeMode>("night");

  // Restore persisted theme on mount
  useEffect(() => {
    const saved = localStorage.getItem("navora-theme");
    if (saved === "morning" || saved === "night") {
      setTheme(saved);
    }
  }, []);

  // Apply theme to document root for CSS variables + persist choice
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("navora-theme", theme);
    // Keep SimulationState.theme in sync so canvases receive it via sim.theme
    setSim((prev) => ({ ...prev, theme }));
  }, [theme]);

  const handleToggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "morning" ? "night" : "morning"));
  }, []);

  // Manual drive toggle
  const handleToggleDriveMode = useCallback(() => {
    setSim((prev) => ({ ...prev, isManualDrive: !prev.isManualDrive }));
  }, []);

  // Initial Scenario (Scenario 1: Cattle & Highway Hazards — light traffic)
  const [sim, setSim] = useState<SimulationState>(() => {
    // Light default: two mild ground hazards off the lane centre so the
    // adaptive planner shows a gentle detour and the car easily reaches the goal.
    const initialObstacles: Obstacle[] = [
      createObstacle("pothole", 420, 190, false),   // off to the top shoulder
      createObstacle("debris", 680, 400, false),    // off to the bottom shoulder
    ];

    return {
      isRunning: true,
      isManualDrive: false,
      manualThrottle: 0,
      manualSteering: 0,
      vehicle: {
        position: { ...INITIAL_VEHICLE_POS },
        heading: 0,
        velocity: 0,
        steeringAngle: 0,
        wheelRotation: 0,
        suspensionPitch: 0,
        isBraking: false,
      },
      goal: { ...INITIAL_GOAL_POS },
      obstacles: initialObstacles,
      plannedPath: [],
      executedPath: [INITIAL_VEHICLE_POS],
      dwaTrajectories: [],
      selectedDwaPath: [],
      collisionWarning: {
        level: "safe",
        ttc: 99.9,
        dangerObstacle: null,
        message: "Path Clear • Adaptive Speed Nominal",
      },
      sensorDetections: [],
      safetyScore: 98,
      replanTimeMs: 14,
      emergencyBrakesCount: 0,
      isGoalReached: false,
      showHeatmap: true,
      showSensors: true,
      showDwaTrajectories: true,
      showLidarCloud: false,
      showGrid: true,
      targetSpeed: 140, // ~45 km/h
      weather: "day" as const,
      cameraMode: "bev" as const,
      theme: "night" as const,
    };
  });

  // Toggle Simulation Play / Pause
  const handleToggleSim = useCallback(() => {
    setSim((prev) => ({ ...prev, isRunning: !prev.isRunning }));
  }, []);

  // Reset Simulation
  const handleReset = useCallback(() => {
    setSim((prev) => ({
      ...prev,
      vehicle: {
        position: { ...INITIAL_VEHICLE_POS },
        heading: 0,
        velocity: 0,
        steeringAngle: 0,
        wheelRotation: 0,
        suspensionPitch: 0,
        isBraking: false,
      },
      goal: { ...INITIAL_GOAL_POS },
      executedPath: [{ ...INITIAL_VEHICLE_POS }],
      plannedPath: [],
      dwaTrajectories: [],
      selectedDwaPath: [],
      isGoalReached: false,
      emergencyBrakesCount: 0,
      safetyScore: 100,
      collisionWarning: {
        level: "safe",
        ttc: 99.9,
        dangerObstacle: null,
        message: "Path Clear • System Reset Complete",
      },
    }));
  }, []);

  // Spawn Obstacle at arbitrary location (e.g. on Canvas click)
  const handleAddObstacleAt = useCallback((x: number, y: number) => {
    // Pick random hazard type
    const types: ObstacleType[] = ["cow", "pothole", "auto", "pedestrian", "bike", "debris"];
    const randomType = types[Math.floor(Math.random() * types.length)];
    const isMoving = randomType === "cow" || randomType === "auto" || randomType === "bike" || randomType === "pedestrian";

    const newObs = createObstacle(randomType, x, y, isMoving);
    setSim((prev) => ({
      ...prev,
      obstacles: [...prev.obstacles, newObs],
      plannedPath: [], // trigger global replan
    }));
  }, []);

  // Spawn specific Obstacle from buttons
  const handleSpawnObstacle = useCallback((type: ObstacleType, moving = false) => {
    // Spawn in forward field between vehicle and goal
    const x = Math.min(800, Math.max(160, Math.random() * 600 + 200));
    const y = Math.min(500, Math.max(100, Math.random() * 400 + 100));

    const newObs = createObstacle(type, x, y, moving);
    setSim((prev) => ({
      ...prev,
      obstacles: [...prev.obstacles, newObs],
      plannedPath: [], // trigger global replan
    }));
  }, []);

  // Clear all obstacles
  const handleClearObstacles = useCallback(() => {
    setSim((prev) => ({
      ...prev,
      obstacles: [],
      plannedPath: [],
    }));
  }, []);

  // Load Preset Scenarios
  const handleLoadScenario = useCallback((scenarioId: number) => {
    let newObstacles: Obstacle[] = [];

    if (scenarioId === 1) {
      // Scenario 1: Smooth City Drive (light) — minimal hazards, easy goal reach
      newObstacles = [
        createObstacle("pothole", 380, 200, false),
        createObstacle("debris", 720, 380, false),
      ];
    } else if (scenarioId === 2) {
      // Scenario 2: Pothole Gauntlet (moderate)
      newObstacles = [
        createObstacle("pothole", 280, 280, false),
        createObstacle("pothole", 450, 320, false),
        createObstacle("pothole", 630, 270, false),
        createObstacle("speed_breaker", 740, 300, false),
      ];
    } else if (scenarioId === 3) {
      // Scenario 3: Wrong-way Bike & Overtake
      const oncomingBike = createObstacle("bike", 680, 280, true);
      oncomingBike.velocityX = -2.5;
      oncomingBike.velocityY = 0.2;

      newObstacles = [
        oncomingBike,
        createObstacle("auto", 400, 340, true),
      ];
    } else if (scenarioId === 4) {
      // Scenario 4: Moderate Traffic (mixed)
      newObstacles = [
        createObstacle("cow", 320, 310, true),
        createObstacle("auto", 520, 340, true),
        createObstacle("pedestrian", 700, 280, true),
        createObstacle("pothole", 420, 260, false),
        createObstacle("speed_breaker", 780, 300, false),
      ];
    }

    setSim((prev) => ({
      ...prev,
      vehicle: {
        position: { ...INITIAL_VEHICLE_POS },
        heading: 0,
        velocity: 0,
        steeringAngle: 0,
        wheelRotation: 0,
        suspensionPitch: 0,
        isBraking: false,
      },
      goal: { ...INITIAL_GOAL_POS },
      obstacles: newObstacles,
      executedPath: [{ ...INITIAL_VEHICLE_POS }],
      plannedPath: [],
      dwaTrajectories: [],
      selectedDwaPath: [],
      isGoalReached: false,
      emergencyBrakesCount: 0,
      safetyScore: 98,
      collisionWarning: {
        level: "safe",
        ttc: 99.9,
        dangerObstacle: null,
        message: `Scenario ${scenarioId} Loaded Successfully`,
      },
    }));
  }, []);

  // Hold-ENTER manual drive (like the Python prototype: AI steers the plan,
  // the driver paces it by holding ENTER; release = brake)
  useEffect(() => {
    let enterDown = false;
    const setEnter = (down: boolean) => {
      enterDown = down;
      setSim((prev) =>
        prev.isManualDrive ? { ...prev, manualThrottle: down ? 1 : 0 } : prev
      );
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        setEnter(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        setEnter(false);
      }
    };
    const handleBlur = () => setEnter(false);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
    };
  }, []);

  return (
    <main
      className="min-h-screen flex flex-col selection:bg-emerald-500 selection:text-black transition-colors duration-500"
      style={{
        background: theme === "morning" ? "#f0f4f8" : "#020617",
        color: theme === "morning" ? "#1a202c" : "#f1f5f9",
      }}
    >
      {/* Top Navigation Header */}
      <Header
        simRunning={sim.isRunning}
        isManualDrive={sim.isManualDrive}
        viewMode={viewMode}
        theme={theme}
        onToggleSim={handleToggleSim}
        onReset={handleReset}
        onToggleDriveMode={handleToggleDriveMode}
        onSelectViewMode={setViewMode}
        onToggleTheme={handleToggleTheme}
        onShowArch={() => setShowArchModal(true)}
      />

      {/* Main Dashboard Content Layout */}
      <div className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto flex flex-col gap-6">
        {/* Top Section: Simulation Canvas (Center/Left) + Telemetry & Sensors (Right) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Simulation Canvas: 3D / 2D / Split (8 Columns on desktop) */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* Navora3DCanvas always mounted (drives physics/planner tick) — hidden in pure 2D */}
            <div className={viewMode === "2d" ? "hidden" : ""}>
              <Navora3DCanvas
                sim={sim}
                onSimUpdate={setSim}
                onAddObstacleAt={handleAddObstacleAt}
              />
            </div>

            {viewMode !== "3d" && (
              <BEVCanvas
                sim={sim}
                onSimUpdate={setSim}
                onAddObstacleAt={handleAddObstacleAt}
              />
            )}

            {/* Indian Road Obstacle Injector & Scenarios */}
            <ControlPanel
              sim={sim}
              onSimUpdate={setSim}
              onSpawnObstacle={handleSpawnObstacle}
              onLoadScenario={handleLoadScenario}
              onClearObstacles={handleClearObstacles}
            />
          </div>

          {/* Right Sidebar: Telemetry & Sensors (4 Columns on desktop) */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <TelemetryPanel sim={sim} />
            <SensorPanel sim={sim} />
            <Legend />
          </div>
        </div>
      </div>

      {/* Architecture & Methodology Modal */}
      <ArchitectureModal
        isOpen={showArchModal}
        onClose={() => setShowArchModal(false)}
      />

      <Footer />
    </main>
  );
}
