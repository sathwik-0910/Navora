"use client";

import React, { useRef, useEffect, useCallback } from "react";
import { CostMap, CostMapConfig } from "../lib/simulation/costMap";
import { SimulationState } from "./Navora3DCanvas";
import { Layers, Eye, Grid, Shield } from "lucide-react";

interface BEVCanvasProps {
  sim: SimulationState;
  onSimUpdate: (updater: (prev: SimulationState) => SimulationState) => void;
  onAddObstacleAt: (x: number, y: number) => void;
}

export const BEVCanvas: React.FC<BEVCanvasProps> = ({
  sim,
  onSimUpdate,
  onAddObstacleAt,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const costMapRef = useRef<CostMap | null>(null);

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

  // Canvas Drawing Routine
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const costMap = getCostMap(width, height);
    costMap.update(sim.obstacles, { top: 80, bottom: height - 80 });

    const isMorning = sim.theme === "morning";

    // 1. Asphalt Road Base
    ctx.fillStyle = isMorning ? "#b0bec5" : "#111827";
    ctx.fillRect(0, 0, width, height);

    // Dirt Shoulders
    ctx.fillStyle = isMorning ? "#8d6e53" : "#271c13";
    ctx.fillRect(0, 0, width, 80);
    ctx.fillRect(0, height - 80, width, 80);

    // Shoulder Borders
    ctx.strokeStyle = isMorning ? "#6d4c2e" : "#78350f";
    ctx.lineWidth = 3;
    ctx.setLineDash([12, 8]);
    ctx.beginPath();
    ctx.moveTo(0, 80);
    ctx.lineTo(width, 80);
    ctx.moveTo(0, height - 80);
    ctx.lineTo(width, height - 80);
    ctx.stroke();
    ctx.setLineDash([]);

    // Lane Center Markings
    ctx.strokeStyle = isMorning ? "rgba(0, 0, 0, 0.18)" : "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 2.5;
    ctx.setLineDash([30, 35]);
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // 2. CostMap Heatmap Overlay
    if (sim.showHeatmap && costMap) {
      for (let r = 0; r < costMap.rows; r++) {
        for (let c = 0; c < costMap.cols; c++) {
          const cost = costMap.grid[r][c];
          const roughness = costMap.roughnessGrid[r][c];
          if (cost > 5 || roughness > 0) {
            const alpha = Math.min(0.5, (cost + roughness) / 120);
            const x = c * costMap.cellSize;
            const y = r * costMap.cellSize;

            if (cost >= 85) {
              ctx.fillStyle = `rgba(239, 68, 68, ${alpha})`; // Red lethal
            } else if (roughness > 20) {
              ctx.fillStyle = `rgba(245, 158, 11, ${alpha})`; // Amber pothole
            } else {
              ctx.fillStyle = `rgba(6, 182, 212, ${alpha * 0.6})`; // Cyan buffer
            }
            ctx.fillRect(x, y, costMap.cellSize, costMap.cellSize);
          }
        }
      }
    }

    // 3. Grid Lines
    if (sim.showGrid) {
      ctx.strokeStyle = isMorning ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.03)";
      ctx.lineWidth = 1;
      for (let x = 0; x < width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
        ctx.stroke();
      }
      for (let y = 0; y < height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }
    }

    // 4. Executed Trail
    if (sim.executedPath.length > 1) {
      ctx.strokeStyle = isMorning ? "rgba(2, 132, 199, 0.55)" : "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(sim.executedPath[0].x, sim.executedPath[0].y);
      for (let i = 1; i < sim.executedPath.length; i++) {
        ctx.lineTo(sim.executedPath[i].x, sim.executedPath[i].y);
      }
      ctx.stroke();
    }

    // 5. Global Planned Path (A* Spline)
    if (sim.plannedPath.length > 1) {
      ctx.strokeStyle = isMorning ? "#047857" : "#10b981";
      ctx.lineWidth = 3.5;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(sim.plannedPath[0].x, sim.plannedPath[0].y);
      for (let i = 1; i < sim.plannedPath.length; i++) {
        ctx.lineTo(sim.plannedPath[i].x, sim.plannedPath[i].y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 6. DWA Trajectory Candidates
    if (sim.showDwaTrajectories && sim.dwaTrajectories.length > 0) {
      for (const sample of sim.dwaTrajectories) {
        if (!sample.isFeasible) continue;
        ctx.strokeStyle = isMorning ? "rgba(0, 150, 136, 0.2)" : "rgba(6, 182, 212, 0.15)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sample.path[0].x, sample.path[0].y);
        for (let i = 1; i < sample.path.length; i++) {
          ctx.lineTo(sample.path[i].x, sample.path[i].y);
        }
        ctx.stroke();
      }

      // Best DWA Trajectory
      if (sim.selectedDwaPath.length > 1) {
        ctx.strokeStyle = "#06b6d4";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(sim.selectedDwaPath[0].x, sim.selectedDwaPath[0].y);
        for (let i = 1; i < sim.selectedDwaPath.length; i++) {
          ctx.lineTo(sim.selectedDwaPath[i].x, sim.selectedDwaPath[i].y);
        }
        ctx.stroke();
      }
    }

    // 7. Render Obstacles
    for (const obs of sim.obstacles) {
      ctx.save();
      ctx.translate(obs.x, obs.y);

      // Warning ring
      ctx.strokeStyle = obs.color;
      ctx.fillStyle = `${obs.color}22`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, obs.radius + 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Emoji icon
      ctx.font = "18px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(obs.icon, 0, 0);

      // Velocity arrow
      if ("velocityX" in obs && (obs.velocityX !== 0 || obs.velocityY !== 0)) {
        ctx.strokeStyle = "#f97316";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(obs.velocityX * 18, obs.velocityY * 18);
        ctx.stroke();
      }

      ctx.restore();
    }

    // 8. Render Goal Waypoint
    ctx.save();
    ctx.translate(sim.goal.x, sim.goal.y);
    ctx.strokeStyle = isMorning ? "#047857" : "#10b981";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 18, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = isMorning ? "rgba(4, 120, 87, 0.25)" : "rgba(16, 185, 129, 0.3)";
    ctx.fill();
    ctx.font = "16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("🏁", 0, 0);
    ctx.restore();

    // 9. Render Ego Vehicle
    ctx.save();
    ctx.translate(sim.vehicle.position.x, sim.vehicle.position.y);
    ctx.rotate(sim.vehicle.heading);

    // Sensor Field of View Sweep Cone
    if (sim.showSensors) {
      ctx.fillStyle = isMorning ? "rgba(0, 150, 136, 0.08)" : "rgba(6, 182, 212, 0.1)";
      ctx.strokeStyle = isMorning ? "rgba(0, 150, 136, 0.3)" : "rgba(6, 182, 212, 0.35)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, 160, -Math.PI / 3, Math.PI / 3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Vehicle Body
    ctx.fillStyle = isMorning ? "#0277bd" : "#0284c7";
    ctx.strokeStyle = isMorning ? "#4fc3f7" : "#38bdf8";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-22, -12, 44, 24, 6);
    ctx.fill();
    ctx.stroke();

    // Cabin
    ctx.fillStyle = isMorning ? "#37474f" : "#0f172a";
    ctx.beginPath();
    ctx.roundRect(-12, -8, 22, 16, 3);
    ctx.fill();

    // LiDAR Sensor Puck
    ctx.fillStyle = isMorning ? "#00897b" : "#06b6d4";
    ctx.beginPath();
    ctx.arc(0, 0, 4, 0, Math.PI * 2);
    ctx.fill();

    // Headlights
    ctx.fillStyle = isMorning ? "#fff9c4" : "#bae6fd";
    ctx.fillRect(20, -10, 3, 5);
    ctx.fillRect(20, 5, 3, 5);

    // Brake Lights
    ctx.fillStyle = sim.vehicle.isBraking ? "#ef4444" : (isMorning ? "#c62828" : "#991b1b");
    ctx.fillRect(-23, -10, 3, 5);
    ctx.fillRect(-23, 5, 3, 5);

    ctx.restore();
  }, [sim, getCostMap]);

  // Handle Canvas Click to Spawn Obstacle
  const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;
    onAddObstacleAt(x, y);
  };

  const isMorning = sim.theme === "morning";

  return (
    <div
      className="relative w-full rounded-2xl overflow-hidden border shadow-2xl group select-none"
      style={{
        background: isMorning ? "#e2e8f0" : "#0f172a",
        borderColor: isMorning ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
      }}
    >
      <canvas
        ref={canvasRef}
        width={1000}
        height={600}
        onClick={handleCanvasClick}
        className="w-full h-[540px] cursor-crosshair block"
      />

      {/* Overlays & Toggles */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <button
          onClick={() => onSimUpdate((p) => ({ ...p, showHeatmap: !p.showHeatmap }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold backdrop-blur-md transition ${
            sim.showHeatmap
              ? "bg-cyan-500/20 border-cyan-500 text-cyan-300"
              : isMorning ? "bg-white/70 border-gray-300 text-gray-500" : "bg-slate-900/80 border-slate-700 text-slate-400"
          }`}
        >
          <Layers className="w-3.5 h-3.5" /> CostMap Heatmap
        </button>

        <button
          onClick={() => onSimUpdate((p) => ({ ...p, showSensors: !p.showSensors }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold backdrop-blur-md transition ${
            sim.showSensors
              ? "bg-emerald-500/20 border-emerald-500 text-emerald-300"
              : isMorning ? "bg-white/70 border-gray-300 text-gray-500" : "bg-slate-900/80 border-slate-700 text-slate-400"
          }`}
        >
          <Eye className="w-3.5 h-3.5" /> Sensor Cone
        </button>

        <button
          onClick={() => onSimUpdate((p) => ({ ...p, showDwaTrajectories: !p.showDwaTrajectories }))}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold backdrop-blur-md transition ${
            sim.showDwaTrajectories
              ? "bg-indigo-500/20 border-indigo-500 text-indigo-300"
              : isMorning ? "bg-white/70 border-gray-300 text-gray-500" : "bg-slate-900/80 border-slate-700 text-slate-400"
          }`}
        >
          <Grid className="w-3.5 h-3.5" /> DWA Fan
        </button>
      </div>
    </div>
  );
};
