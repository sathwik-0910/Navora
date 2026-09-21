"use client";

import React from "react";
import { SimulationState } from "./Navora3DCanvas";
import { Activity, ShieldAlert, Gauge, Compass, Zap, AlertTriangle, Cpu, TrendingUp, Radio } from "lucide-react";

interface TelemetryPanelProps {
  sim: SimulationState;
}

export const TelemetryPanel: React.FC<TelemetryPanelProps> = ({ sim }) => {
  const speedKmh = Math.round((sim.vehicle.velocity / 250) * 80);
  const steeringDeg = Math.round((sim.vehicle.steeringAngle * 180) / Math.PI);
  const ttcValue = sim.collisionWarning.ttc;

  // TTC Status Badge
  let ttcColor = "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
  let ttcBadge = "NOMINAL • CLEAR";
  if (ttcValue < 1.2) {
    ttcColor = "text-red-400 border-red-500/60 bg-red-500/20 animate-pulse";
    ttcBadge = "ISO AEB BRAKING";
  } else if (ttcValue < 2.4) {
    ttcColor = "text-amber-400 border-amber-500/40 bg-amber-500/15";
    ttcBadge = "EVASIVE SWERVE";
  }

  // Safety Score Color
  let scoreColor = "text-emerald-400";
  if (sim.safetyScore < 60) scoreColor = "text-red-400";
  else if (sim.safetyScore < 80) scoreColor = "text-amber-400";

  return (
    <div className="flex flex-col gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
      {/* Panel Header */}
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Navora Telemetry &amp; Safety Core
          </h2>
        </div>
        <span className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-lg border uppercase tracking-wider ${ttcColor}`}>
          {ttcBadge}
        </span>
      </div>

      {/* Primary 4-Stat Metric Cards */}
      <div className="grid grid-cols-2 gap-3">
        {/* Speedometer CAN Bus */}
        <div className="flex flex-col p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="flex items-center gap-1">
              <Gauge className="w-3.5 h-3.5 text-cyan-400" /> Speed (CAN)
            </span>
            <span className="font-mono text-[10px] text-slate-500">v_ego</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-3xl font-black font-mono text-cyan-400 tracking-tight">
              {speedKmh}
            </span>
            <span className="text-xs font-semibold text-slate-400 font-mono">km/h</span>
          </div>
          {/* Progress bar */}
          <div className="w-full bg-slate-800/80 h-1.5 rounded-full mt-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full transition-all duration-150"
              style={{ width: `${(speedKmh / 80) * 100}%` }}
            />
          </div>
        </div>

        {/* Time-to-Collision (TTC) */}
        <div className="flex flex-col p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="flex items-center gap-1">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> Time to Collision
            </span>
            <span className="font-mono text-[10px] text-slate-500">ISO 26262</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span
              className={`text-3xl font-black font-mono tracking-tight ${
                ttcValue < 1.2 ? "text-red-400 animate-pulse" : ttcValue < 2.4 ? "text-amber-400" : "text-emerald-400"
              }`}
            >
              {ttcValue > 20 ? "Safe" : `${ttcValue.toFixed(1)}s`}
            </span>
          </div>
          <div className="text-[10px] font-mono text-slate-400 mt-2 truncate">
            {sim.collisionWarning.level === "emergency_braking" ? "⚠️ AEB ENGAGED" : "Nominal Clearance"}
          </div>
        </div>

        {/* Steering Angle */}
        <div className="flex flex-col p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="flex items-center gap-1">
              <Compass className="w-3.5 h-3.5 text-indigo-400" /> Steering Angle
            </span>
            <span className="font-mono text-[10px] text-slate-500">Bicycle</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black font-mono text-indigo-300">
              {steeringDeg > 0 ? `+${steeringDeg}°` : `${steeringDeg}°`}
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              ({steeringDeg > 2 ? "Right" : steeringDeg < -2 ? "Left" : "Center"})
            </span>
          </div>
        </div>

        {/* Safety Score */}
        <div className="flex flex-col p-3.5 rounded-xl bg-slate-950/80 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 text-xs mb-1">
            <span className="flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Safety Score
            </span>
            <span className="font-mono text-[10px] text-slate-500">Index</span>
          </div>
          <div className="flex items-baseline gap-1 mt-1">
            <span className={`text-2xl font-black font-mono ${scoreColor}`}>
              {sim.safetyScore}
            </span>
            <span className="text-xs text-slate-500 font-mono">/ 100</span>
          </div>
        </div>
      </div>

      {/* Secondary Performance Metrics */}
      <div className="flex flex-col gap-2 pt-2 border-t border-slate-800 text-xs">
        <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Cpu className="w-3.5 h-3.5 text-emerald-400" /> Trajectory Replan Latency:
          </span>
          <span className="font-mono font-bold text-emerald-400">
            {sim.replanTimeMs} ms <span className="text-[10px] text-slate-500 font-normal">(&lt; 50ms)</span>
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
          <span className="text-slate-400 flex items-center gap-1.5">
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" /> AEB Interventions:
          </span>
          <span className="font-mono font-bold text-amber-400">
            {sim.emergencyBrakesCount} events
          </span>
        </div>

        <div className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-slate-950/60 border border-slate-800/60">
          <span className="text-slate-400 flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-cyan-400" /> DWA Trajectories Evaluated:
          </span>
          <span className="font-mono font-bold text-cyan-400">
            {sim.dwaTrajectories.length} rollouts / cycle
          </span>
        </div>
      </div>

      {/* Collision Warning Banner */}
      {sim.collisionWarning.level !== "safe" && (
        <div
          className={`flex items-start gap-2.5 p-3 rounded-xl border text-xs font-medium shadow-lg transition-all ${
            sim.collisionWarning.level === "emergency_braking"
              ? "bg-red-500/15 border-red-500/50 text-red-300 animate-pulse"
              : "bg-amber-500/15 border-amber-500/40 text-amber-300"
          }`}
        >
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-current" />
          <div className="leading-snug">{sim.collisionWarning.message}</div>
        </div>
      )}
    </div>
  );
};
