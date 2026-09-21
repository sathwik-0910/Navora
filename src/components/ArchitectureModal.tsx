"use client";

import React from "react";
import { X, Layers, Cpu, Compass, ShieldCheck, Award } from "lucide-react";

interface ArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ArchitectureModal: React.FC<ArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-4xl bg-slate-900 border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl text-slate-100 flex flex-col gap-6 max-h-[90vh] overflow-y-auto custom-scrollbar">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <Layers className="w-7 h-7 text-emerald-400" />
            <div>
              <h2 className="text-xl font-bold font-mono text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">
                Navora Architecture &amp; Methodology
              </h2>
              <p className="text-xs text-slate-400">
                SIH Technical Specifications • Unstructured Indian Road AV Navigation
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 text-slate-400 hover:text-white hover:bg-slate-700 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. System Pipeline Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div className="flex flex-col p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs mb-2">
              <Cpu className="w-4 h-4" /> 1. Perception Layer
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Multi-modal sensor fusion (LiDAR point-cloud + Computer Vision YOLOv8). Detects cattle, autos, wrong-way bikes, potholes, and road shoulder margins without relying on lane markers.
            </p>
          </div>

          <div className="flex flex-col p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs mb-2">
              <Layers className="w-4 h-4" /> 2. CostMap Engine
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Dynamic 2D spatial grid with multi-layer inflation. Computes road roughness costs (potholes, debris) + lethal obstacle clearance zones with Gaussian safety decay.
            </p>
          </div>

          <div className="flex flex-col p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs mb-2">
              <Compass className="w-4 h-4" /> 3. Dual-Level Planner
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              <strong>Global:</strong> Adaptive A* on costmap grid.<br />
              <strong>Local:</strong> Dynamic Window Approach (DWA) rolling out forward trajectories every 100ms for continuous smooth collision avoidance.
            </p>
          </div>

          <div className="flex flex-col p-3 rounded-xl bg-slate-950 border border-slate-800">
            <div className="flex items-center gap-2 text-amber-400 font-bold text-xs mb-2">
              <ShieldCheck className="w-4 h-4" /> 4. Safety &amp; AEB
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Continuous Time-to-Collision (TTC) estimation. When TTC &lt; 1.2s, triggers ISO-26262 compliant Autonomous Emergency Braking (AEB) with evasive swerving fallback.
            </p>
          </div>
        </div>

        {/* 2. Mathematical Formulation */}
        <div className="flex flex-col gap-3 p-4 rounded-xl bg-slate-950 border border-slate-800">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono flex items-center gap-2">
            <Award className="w-4 h-4 text-emerald-400" /> Mathematical Cost Functions &amp; Objective Formulations
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="font-bold text-emerald-400 mb-1">
                Adaptive Cost Function for Unstructured Terrain:
              </div>
              <div className="font-mono bg-slate-950 p-2 rounded text-slate-300 text-[11px] mb-2 border border-slate-800">
                Cost(x, y) = w₁·Dist(x,y) + w₂·Safety(x,y) + w₃·Roughness(x,y) + w₄·Boundary(x,y)
              </div>
              <p className="text-slate-400 text-[11px]">
                Where <code className="text-emerald-300">Roughness</code> explicitly penalizes potholes and broken road shoulders, ensuring passenger comfort and vehicle suspension protection.
              </p>
            </div>

            <div className="p-3 rounded-lg bg-slate-900 border border-slate-800">
              <div className="font-bold text-cyan-400 mb-1">
                DWA Trajectory Evaluation Function:
              </div>
              <div className="font-mono bg-slate-950 p-2 rounded text-slate-300 text-[11px] mb-2 border border-slate-800">
                G(v, ω) = α·Heading(v,ω) + β·Clearance(v,ω) + γ·Velocity(v,ω) - δ·Roughness(v,ω)
              </div>
              <p className="text-slate-400 text-[11px]">
                Samples candidate forward $(v, \omega)$ velocity windows in the Kinematic Bicycle space, optimizing path efficiency while dodging dynamic agents like stray cattle and auto-rickshaws.
              </p>
            </div>
          </div>
        </div>

        {/* 3. Key SIH USPs / Innovations */}
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider font-mono">
            Key Innovations for Indian Road Conditions
          </h3>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-300">
            <li className="flex items-start gap-2 p-2 rounded bg-slate-950/70 border border-slate-800">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Zero Lane Reliance:</strong> Navigation operates solely on drivable free-space rather than painted road markers.</span>
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-slate-950/70 border border-slate-800">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Heterogeneous Agent Handling:</strong> Accounts for unpredictable motion models of stray animals, autos, and pedestrians.</span>
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-slate-950/70 border border-slate-800">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Pothole Depth Costing:</strong> Integrates crater depth into traversal penalty to avoid suspension damage.</span>
            </li>
            <li className="flex items-start gap-2 p-2 rounded bg-slate-950/70 border border-slate-800">
              <span className="text-emerald-400 font-bold">✓</span>
              <span><strong>Sub-50ms Real-Time Replanning:</strong> Ultra-low latency trajectory re-evaluation to handle sudden oncoming traffic.</span>
            </li>
          </ul>
        </div>

        {/* Modal Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs transition"
          >
            Back to Interactive Simulation
          </button>
        </div>
      </div>
    </div>
  );
};
