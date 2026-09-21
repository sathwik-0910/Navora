"use client";

import React from "react";

export const Legend: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
      <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
        Navora Visualization Legend
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-emerald-400 rounded shrink-0 shadow-sm" />
          <span className="text-slate-300">Global Planned Path (A*)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-cyan-400 rounded shrink-0 shadow-sm" />
          <span className="text-slate-300">Selected DWA Trajectory</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-sky-300/50 rounded shrink-0" />
          <span className="text-slate-300">Executed Odometry Trail</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-orange-500 rounded shrink-0" />
          <span className="text-slate-300">Agent Velocity Vector</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded bg-red-500/25 border border-red-500/60 shrink-0" />
          <span className="text-slate-300">Lethal Collision Buffer</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded bg-amber-500/25 border border-amber-500/60 shrink-0" />
          <span className="text-slate-300">Pothole Roughness Zone</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded bg-cyan-500/20 border border-cyan-500/40 shrink-0" />
          <span className="text-slate-300">LiDAR Point Cloud Particle</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3.5 h-3.5 rounded border border-indigo-400 bg-indigo-500/10 shrink-0" />
          <span className="text-slate-300">Sensor Perception Lock</span>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 pt-2.5 border-t border-slate-800 text-[11px] text-slate-400 font-mono">
        <div>
          <strong className="text-emerald-400">Global A* Formulation:</strong> Cost = w₁·Dist + w₂·Safety + w₃·Roughness
        </div>
        <div>
          <strong className="text-cyan-400">Local DWA Planner:</strong> Evaluates (v, ω) dynamic velocity space at &lt; 50ms intervals.
        </div>
      </div>
    </div>
  );
};
