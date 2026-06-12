/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { User, Meeting } from "../types";
import {
  Brain,
  LayoutDashboard,
  Mic,
  FolderOpen,
  Settings,
  LogOut,
  FolderHeart,
  ExternalLink,
} from "lucide-react";

interface SidebarProps {
  user: User;
  activeTab: "dashboard" | "recorder" | "meetings" | "settings";
  setActiveTab: (tab: "dashboard" | "recorder" | "meetings" | "settings") => void;
  onLogout: () => void;
  favoritesCount: number;
  meetings: Meeting[];
}

export default function Sidebar({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  favoritesCount,
  meetings,
}: SidebarProps) {
  // Storage metric calculation matching Dashboard text-flow
  const totalStorageAllocatedKb = 512 * 1024; // 512MB in KB
  const usedStorageKb = meetings.reduce((acc, current) => acc + (current.audioSizeKb || 120), 0);
  const usedPercentage = Math.min(((usedStorageKb / totalStorageAllocatedKb) * 100), 100);

  const formatSize = (kb: number) => {
    if (kb > 1024) {
      return (kb / 1024).toFixed(1) + " MB";
    }
    return kb.toFixed(0) + " KB";
  };
  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: LayoutDashboard,
      desc: "Vault analytics overview",
    },
    {
      id: "recorder" as const,
      label: "New Recording",
      icon: Mic,
      desc: "Capture live transcription",
    },
    {
      id: "meetings" as const,
      label: "My Vault",
      icon: FolderOpen,
      desc: "Obsidian database note explorer",
    },
    {
      id: "settings" as const,
      label: "Settings",
      icon: Settings,
      desc: "AI engines & file folders",
    },
  ];

  return (
    <aside
      id="workspace_sidebar"
      className="w-64 bg-slate-50/50 border-r border-slate-100 flex flex-col justify-between h-screen fixed top-0 left-0 z-20 max-md:hidden select-none font-sans"
    >
      <div className="flex flex-col flex-grow">
        {/* Logo Branded Area */}
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#2C5EAD] flex items-center justify-center shadow-lg shadow-[#2C5EAD]/20">
            <div className="w-4 h-4 rounded-sm bg-white"></div>
          </div>
          <span className="font-bold text-xl tracking-tight text-[#2C5EAD]">MeetingBrain</span>
        </div>

        {/* Navigation Section */}
        <nav className="flex-grow px-4 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-xs font-semibold rounded-lg transition-all cursor-pointer text-left group ${
                  isActive
                    ? "text-slate-900 bg-white rounded-lg shadow-sm font-semibold border border-slate-100/70"
                    : "text-slate-500 hover:bg-white/50 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`w-4 h-4 transition-transform group-hover:scale-105 ${
                    isActive ? "text-[#2C5EAD] opacity-100" : "text-slate-400 opacity-70"
                  }`}
                />
                <span className="flex-grow">{item.label}</span>
                {item.id === "meetings" && favoritesCount > 0 && (
                  <span className="bg-[#1591DC]/10 text-[#1591DC] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                    <FolderHeart className="w-3 h-3 mr-0.5" />
                    {favoritesCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Area with User Profile and Sign Out */}
      <div className="p-6 space-y-4 border-t border-slate-100 bg-slate-50/20">
        <div className="bg-[#C4E2F5]/60 rounded-xl p-4 border border-[#C4E2F5]/30">
          <p className="text-[10px] font-semibold text-[#2C5EAD] uppercase tracking-wider mb-1.5">Storage Used</p>
          <div className="w-full bg-white/50 h-1.5 rounded-full mb-1.5 overflow-hidden">
            <div className="bg-[#2C5EAD] h-full rounded-full transition-all duration-300" style={{ width: `${usedPercentage}%` }}></div>
          </div>
          <p className="text-[9px] text-slate-600 font-semibold">{formatSize(usedStorageKb)} of {formatSize(totalStorageAllocatedKb)}</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-slate-200 border border-white shadow-xs flex items-center justify-center text-slate-700 font-semibold text-xs shrink-0">
            {user.displayName.slice(0, 2).toUpperCase()}
          </div>
          <div className="flex-grow min-w-0">
            <p className="text-xs font-bold text-slate-800 truncate leading-tight">{user.displayName}</p>
            <p className="text-[10px] text-slate-500 truncate mt-0.5">{user.email}</p>
          </div>
        </div>

        <button
          onClick={onLogout}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-rose-500 hover:bg-rose-50/60 font-semibold text-xs transition-all cursor-pointer group"
        >
          <LogOut className="w-4 h-4 text-rose-400 group-hover:translate-x-0.5 transition-transform" />
          <span>Exit Account</span>
        </button>
      </div>
    </aside>
  );
}
