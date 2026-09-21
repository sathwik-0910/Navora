"use client";

import React from "react";
import { SimulationState } from "./Navora3DCanvas";
import { Radar, Camera, Crosshair, Map, Radio, Wifi, Shield } from "lucide-react";

interface SensorPanelProps {
  sim: SimulationState;
}

export const SensorPanel: React.FC<SensorPanelProps> = ({ sim }) => {
  return (
    <div className="flex flex-col gap-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-2xl backdrop-blur-xl">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <Radar className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold text-slate-100 uppercase tracking-wider font-mono">
            Sensor Fusion &amp; Perception
          </h2>
        </div>
        <span className="text-[10px] font-mono font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/30 px-2 py-0.5 rounded">
          FUSION ACTIVE
        </span>
      </div>

      {/* Multi-Modal Sensor Health Array */}
      <div className="grid grid-cols-4 gap-2">
        <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 border border-slate-800 rounded-xl">
          <Radar className="w-4 h-4 text-emerald-400 mb-1" />
          <span className="text-[9px] uppercase font-bold text-slate-300">LiDAR 64ch</span>
          <span className="text-[8px] text-emerald-400 font-mono">20 Hz</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 border border-slate-800 rounded-xl">
          <Camera className="w-4 h-4 text-emerald-400 mb-1" />
          <span className="text-[9px] uppercase font-bold text-slate-300">YOLOv8 Cam</span>
          <span className="text-[8px] text-emerald-400 font-mono">60 FPS</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 border border-slate-800 rounded-xl">
          <Radio className="w-4 h-4 text-emerald-400 mb-1" />
          <span className="text-[9px] uppercase font-bold text-slate-300">77GHz Rad</span>
          <span className="text-[8px] text-emerald-400 font-mono">300m</span>
        </div>
        <div className="flex flex-col items-center justify-center p-2 bg-slate-950/80 border border-slate-800 rounded-xl">
          <Map className="w-4 h-4 text-amber-400 mb-1 animate-pulse" />
          <span className="text-[9px] uppercase font-bold text-slate-300">RTK-GNSS</span>
          <span className="text-[8px] text-amber-400 font-mono">±2cm</span>
        </div>
      </div>

      {/* Real-time Detected Obstacle Targets List */}
      <div className="flex flex-col bg-slate-950/90 border border-slate-800 rounded-xl overflow-hidden">
        <div className="bg-slate-900/90 px-3.5 py-2 text-xs font-semibold text-slate-300 border-b border-slate-800 flex justify-between items-center">
          <span className="font-mono text-[11px] uppercase tracking-wider text-slate-400">Classified Targets</span>
          <span className="font-mono text-xs bg-slate-800 px-2 py-0.5 rounded-full text-cyan-400 font-bold">
            {sim.sensorDetections.length} Locked
          </span>
        </div>

        <div className="flex flex-col overflow-y-auto max-h-[220px] p-2.5 gap-2 custom-scrollbar">
          {sim.sensorDetections.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-6 italic font-mono">
              Sensors scanning... No hazards in 30m corridor.
            </div>
          ) : (
            sim.sensorDetections.map((det, idx) => {
              let cardBg = "border-slate-800/80 bg-slate-900/60";
              let textColor = "text-slate-200";
              let badgeColor = "text-emerald-400 border-emerald-500/30";

              if (det.estimatedTTC < 1.5 || det.distance < 35) {
                cardBg = "border-red-500/60 bg-red-500/10";
                textColor = "text-red-300";
                badgeColor = "text-red-400 border-red-500/40";
              } else if (det.estimatedTTC < 3.0 || det.distance < 75) {
                cardBg = "border-amber-500/50 bg-amber-500/10";
                textColor = "text-amber-300";
                badgeColor = "text-amber-400 border-amber-500/40";
              }

              return (
                <div
                  key={`${det.obstacle.id}-${idx}`}
                  className={`flex flex-col p-2.5 rounded-xl border ${cardBg} transition-all`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-base flex items-center justify-center w-7 h-7 rounded-lg bg-black/50 mr-2 shadow-inner">
                      {det.obstacle.icon}
                    </span>
                    <span className={`text-xs font-bold uppercase tracking-tight flex-1 ${textColor}`}>
                      {det.obstacle.name || det.obstacle.type.replace("_", " ")}
                    </span>
                    <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${badgeColor} flex items-center gap-1`}>
                      <Crosshair className="w-2.5 h-2.5" />
                      {det.sensorType}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Distance:</span>
                      <span className="text-slate-200 font-bold">{(det.distance / 10).toFixed(1)}m</span>
                    </div>
                    <div className="flex justify-between text-slate-400">
                      <span>AI Conf:</span>
                      <span className="text-emerald-400 font-bold">
                        {(det.confidence * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex justify-between text-slate-400 col-span-2 pt-0.5 border-t border-slate-800/60">
                      <span>TTC Threat:</span>
                      <span className={`font-bold ${textColor}`}>
                        {det.estimatedTTC < 20 ? `${det.estimatedTTC.toFixed(1)}s` : "Nominal"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
