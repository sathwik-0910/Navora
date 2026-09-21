"use client";

import React from "react";
import { ObstacleType, OBSTACLE_TYPES, OBSTACLE_PRESETS } from "../lib/simulation/obstacle";
import { SimulationState } from "./Navora3DCanvas";
import { Sliders, PlusCircle, Sparkles, Trash2, Zap, Gamepad2, AlertOctagon } from "lucide-react";

interface ControlPanelProps {
  sim: SimulationState;
  onSimUpdate: (updater: (prev: SimulationState) => SimulationState) => void;
  onSpawnObstacle: (type: ObstacleType, moving?: boolean) => void;
  onLoadScenario: (scenarioId: number) => void;
  onClearObstacles: () => void;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  sim,
  onSimUpdate,
  onSpawnObstacle,
  onLoadScenario,
  onClearObstacles,
}) => {
  return (
    <div className="flex flex-col gap-5 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
      {/* 1. Indian Hazard Injector */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-amber-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Indian Hazard Injector (3D &amp; 2D)
            </h3>
          </div>
          <button
            onClick={onClearObstacles}
            className="flex items-center gap-1.5 text-xs text-rose-400 hover:text-rose-300 transition px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 font-medium"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear All ({sim.obstacles.length})
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
          {OBSTACLE_TYPES.map((type) => {
            const item = OBSTACLE_PRESETS[type];
            const isMoving = item.maxSpeed > 0;

            return (
              <button
                key={type}
                onClick={() => onSpawnObstacle(type, isMoving)}
                className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-amber-500/60 hover:bg-slate-800 transition text-left group shadow-sm"
              >
                <span className="text-xl group-hover:scale-125 transition-transform">
                  {item.icon}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-bold text-slate-200 truncate group-hover:text-amber-400 transition-colors">
                    {item.name}
                  </span>
                  <span className="text-[10px] font-mono text-slate-500">
                    {isMoving ? "Dynamic Agent" : "Static Hazard"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 2. SIH Preset Realistic Scenarios */}
      <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-cyan-400" />
          <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Preset SIH Benchmark Scenarios
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <button
            onClick={() => onLoadScenario(1)}
            className="flex flex-col p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/70 hover:bg-slate-800/90 transition text-left group"
          >
            <span className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
              Scenario 1: Stray Cattle on Highway
            </span>
            <span className="text-[11px] text-slate-400 mt-1 leading-snug">
              Unpredictable stray cow crossing, tests dynamic velocity obstacle replanning.
            </span>
          </button>

          <button
            onClick={() => onLoadScenario(2)}
            className="flex flex-col p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/70 hover:bg-slate-800/90 transition text-left group"
          >
            <span className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
              Scenario 2: Pothole Crater Matrix
            </span>
            <span className="text-[11px] text-slate-400 mt-1 leading-snug">
              Cluster of broken asphalt craters; tests costmap roughness penalty and comfort.
            </span>
          </button>

          <button
            onClick={() => onLoadScenario(3)}
            className="flex flex-col p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/70 hover:bg-slate-800/90 transition text-left group"
          >
            <span className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
              Scenario 3: Wrong-way Auto &amp; Bike
            </span>
            <span className="text-[11px] text-slate-400 mt-1 leading-snug">
              Oncoming high-speed motorcycle; tests ISO-26262 AEB &amp; emergency swerve.
            </span>
          </button>

          <button
            onClick={() => onLoadScenario(4)}
            className="flex flex-col p-3 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-cyan-500/70 hover:bg-slate-800/90 transition text-left group"
          >
            <span className="text-xs font-bold text-cyan-300 group-hover:text-cyan-200">
              Scenario 4: Full Traffic Gauntlet
            </span>
            <span className="text-[11px] text-slate-400 mt-1 leading-snug">
              Mixed chaos: Autos, carts, jaywalkers, craters &amp; highway barricades.
            </span>
          </button>
        </div>
      </div>

      {/* 3. Cruise Parameters & Manual Drive Keyboard Help */}
      <div className="flex flex-col gap-3 pt-2 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
              Vehicle Cruise Control &amp; Parameters
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-400">
            Cruise Limit: <strong className="text-emerald-400">{Math.round((sim.targetSpeed / 250) * 80)} km/h</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="flex flex-col gap-2 bg-slate-950/80 p-3 rounded-xl border border-slate-800">
            <div className="flex justify-between text-xs text-slate-300 font-medium">
              <span>Target Cruise Velocity</span>
              <span className="font-mono text-emerald-400 font-bold">
                {Math.round((sim.targetSpeed / 250) * 80)} km/h
              </span>
            </div>
            <input
              type="range"
              min="40"
              max="240"
              step="10"
              value={sim.targetSpeed}
              onChange={(e) =>
                onSimUpdate((prev) => ({
                  ...prev,
                  targetSpeed: Number(e.target.value),
                }))
              }
              className="w-full accent-cyan-500 cursor-pointer h-1.5 bg-slate-800 rounded-lg appearance-none"
            />
          </div>

          <div className="flex items-center justify-between bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs">
            <div className="flex items-center gap-2">
              <Gamepad2 className="w-4 h-4 text-cyan-400" />
              <div>
                <div className="font-bold text-slate-200">Manual — Hold ENTER to Drive</div>
                <div className="text-[11px] text-slate-400">AI steers the plan; you pace it by holding ENTER (release = brake)</div>
              </div>
            </div>
            <span className="text-[10px] font-mono font-bold bg-cyan-500/10 text-cyan-400 px-2 py-1 rounded border border-cyan-500/30">
              SAFETY INTERLOCK ACTIVE
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
