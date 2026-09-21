"use client";

import React from "react";
import { HelpCircle, Activity, RotateCcw, Play, Pause, Compass, Cpu, Navigation2, Layers, Sparkles, Sun, Moon } from "lucide-react";

export type ViewMode = "3d" | "2d" | "split";

interface HeaderProps {
  simRunning: boolean;
  isManualDrive: boolean;
  viewMode: ViewMode;
  theme: "morning" | "night";
  onToggleSim: () => void;
  onReset: () => void;
  onToggleDriveMode: () => void;
  onSelectViewMode: (mode: ViewMode) => void;
  onToggleTheme: () => void;
  onShowArch: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  simRunning,
  isManualDrive,
  viewMode,
  theme,
  onToggleSim,
  onReset,
  onToggleDriveMode,
  onSelectViewMode,
  onToggleTheme,
  onShowArch,
}) => {
  const isMorning = theme === "morning";

  return (
    <header
      className="flex flex-wrap items-center justify-between px-6 py-3.5 backdrop-blur-xl border-b sticky top-0 z-50 shadow-2xl transition-colors duration-500"
      style={{
        background: isMorning ? "rgba(255,255,255,0.88)" : "rgba(2,6,23,0.92)",
        borderColor: isMorning ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
      }}
    >
      {/* Brand Logo & Tagline */}
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 text-slate-950 shadow-lg shadow-cyan-500/20">
          <Navigation2 className="w-6 h-6 fill-current" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <h1
              className="text-2xl font-black tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 font-mono uppercase"
            >
              Navora
            </h1>
            <span
              className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full border"
              style={{
                background: isMorning ? "rgba(16,185,129,0.12)" : "rgba(6,182,212,0.1)",
                color: isMorning ? "#059669" : "#22d3ee",
                borderColor: isMorning ? "rgba(16,185,129,0.3)" : "rgba(6,182,212,0.3)",
              }}
            >
              ADAS v3.2 • SIH
            </span>
          </div>
          <p
            className="text-[10px] uppercase tracking-[0.2em] font-semibold"
            style={{ color: isMorning ? "#718096" : "#94a3b8" }}
          >
            Autonomous Navigation &amp; Path Planning for Unstructured Roads
          </p>
        </div>
      </div>

      {/* View Switcher (3D / 2D / Split) */}
      <div
        className="flex items-center p-1 rounded-xl border shadow-inner"
        style={{
          background: isMorning ? "rgba(0,0,0,0.06)" : "rgba(15,23,42,0.9)",
          borderColor: isMorning ? "rgba(0,0,0,0.08)" : "rgba(51,65,85,0.8)",
        }}
      >
        {(["3d", "2d", "split"] as const).map((mode) => {
          const label = mode === "3d" ? "3D Animated" : mode === "2d" ? "2D Tactical" : "Dual Split";
          const Icon = mode === "3d" ? Sparkles : mode === "2d" ? Layers : Cpu;
          const active = viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => onSelectViewMode(mode)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                active
                  ? "bg-gradient-to-r from-emerald-500 to-cyan-500 text-slate-950 shadow-md"
                  : isMorning ? "text-gray-500 hover:text-gray-900" : "text-slate-400 hover:text-white"
              }`}
            >
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          );
        })}
      </div>

      {/* Simulation Controls & Drive Mode Toggle */}
      <div className="flex items-center gap-3">
        {/* Theme Toggle (Morning / Night) */}
        <button
          onClick={onToggleTheme}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold border transition shadow-sm"
          style={{
            background: isMorning ? "rgba(251,191,36,0.12)" : "rgba(99,102,241,0.12)",
            borderColor: isMorning ? "#f59e0b" : "#6366f1",
            color: isMorning ? "#b45309" : "#a5b4fc",
          }}
          title="Switch between Morning (light) and Night (dark) theme"
        >
          {isMorning ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          {isMorning ? "Morning ☀️" : "Night 🌙"}
        </button>

        {/* Drive Mode Toggle */}
        <button
          onClick={onToggleDriveMode}
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold border transition shadow-sm"
          style={{
            background: isManualDrive
              ? "rgba(245,158,11,0.12)"
              : isMorning ? "rgba(99,102,241,0.1)" : "rgba(99,102,241,0.12)",
            borderColor: isManualDrive ? "#f59e0b" : isMorning ? "#6366f1" : "#6366f1",
            color: isManualDrive ? "#d97706" : isMorning ? "#4338ca" : "#a5b4fc",
          }}
          title="Manual: hold ENTER to drive the plan · Autopilot: AI drives automatically"
        >
          <Compass className="w-4 h-4" />
          {isManualDrive ? "Manual — Hold ENTER" : "Autopilot (Navora AI)"}
        </button>

        {/* Reset Simulation */}
        <button
          onClick={onReset}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border text-xs font-semibold transition shadow-sm"
          style={{
            background: isMorning ? "rgba(0,0,0,0.05)" : "rgba(15,23,42,0.9)",
            borderColor: isMorning ? "rgba(0,0,0,0.1)" : "rgb(51,65,85)",
            color: isMorning ? "#374151" : "#cbd5e1",
          }}
        >
          <RotateCcw className="w-3.5 h-3.5" /> Reset
        </button>

        {/* Toggle Play / Pause */}
        <button
          onClick={onToggleSim}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl font-bold text-xs shadow-lg transition-all ${
            simRunning
              ? "bg-amber-500 hover:bg-amber-600 text-slate-950 border border-amber-400"
              : "bg-emerald-500 hover:bg-emerald-600 text-slate-950 border border-emerald-400"
          }`}
        >
          {simRunning ? (
            <>
              <Pause className="w-4 h-4 fill-current" /> Pause
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" /> Run
            </>
          )}
        </button>

        {/* Architecture & Methodology Modal Button */}
        <button
          onClick={onShowArch}
          className="flex items-center justify-center w-9 h-9 rounded-xl transition border hover:border-emerald-500/50"
          style={{
            background: isMorning ? "rgba(0,0,0,0.05)" : "rgba(15,23,42,0.9)",
            borderColor: isMorning ? "rgba(0,0,0,0.1)" : "rgb(51,65,85)",
            color: isMorning ? "#4a5568" : "#94a3b8",
          }}
          title="View System Architecture & Math"
        >
          <HelpCircle className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
};
