/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { User, Meeting } from "../types";
import {
  Home,
  MessageSquare,
  Compass,
  Cpu,
  UserPlus,
  ChevronDown,
  Bell,
  Download,
  Flame,
  LogOut,
  FolderHeart
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
  const displayName = user.displayName || "Carla Acha";
  const userEmail = user.email || "carlita.ai19.20@gmail.com";

  const navItems = [
    {
      id: "dashboard" as const,
      label: "Home",
      icon: Home,
    },
    {
      id: "recorder" as const,
      label: "Olli AI Chat",
      icon: MessageSquare,
    },
    {
      id: "meetings" as const,
      label: "Explore",
      icon: Compass,
    },
    {
      id: "settings" as const,
      label: "Integrations",
      icon: Cpu,
    },
  ];

  return (
    <aside
      id="workspace_sidebar"
      className="w-[260px] bg-white border-r border-[#EBEBEB] flex flex-col justify-between h-screen fixed top-0 left-0 z-20 max-md:hidden select-none font-sans"
    >
      <div className="flex flex-col flex-grow overflow-y-auto">
        
        {/* Brand Header */}
        <div className="px-5 py-4 pb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5 cursor-pointer">
            <div className="flex items-center justify-center gap-0.5">
              <span className="w-2.5 h-6 rounded-full bg-[#135bf1]" />
              <span className="w-2.5 h-4 rounded-full bg-[#135bf1]/60" />
              <span className="w-2.5 h-5 rounded-full bg-[#135bf1]/80" />
            </div>
            <span className="font-bold text-[22px] tracking-tight text-[#111111] font-sans flex items-center ml-0.5 select-none">
              olli<span className="text-[#135bf1] ml-[1px]">.</span>
            </span>
          </div>
          
          <button className="p-1.5 hover:bg-slate-55 rounded-full text-[#333333] hover:bg-[#F4F4F5] transition-colors relative">
            <Bell className="w-5 h-5 text-slate-700" />
            <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#FF4D4F]" />
          </button>
        </div>

        {/* Profile Card Switcher */}
        <div className="px-3 mb-2">
          <div className="p-2.5 rounded-xl border border-[#E9E9EB] hover:bg-[#F4F4F5]/60 transition-colors flex items-center justify-between cursor-pointer">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-9 h-9 rounded-full bg-[#F5F2EB] border border-[#E2E0D8] overflow-hidden flex items-center justify-center text-slate-700 font-bold text-xs shrink-0 select-none">
                {displayName.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-grow min-w-0 text-left">
                <p className="text-sm font-bold text-[#111111] truncate leading-tight select-none">{displayName}</p>
                <p className="text-[11px] text-[#666666] truncate mt-0.5 select-none">{userEmail}</p>
              </div>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
          </div>
        </div>

        {/* Invite Teammates button */}
        <div className="px-3 mb-4">
          <button className="w-full flex items-center gap-2.5 px-3 py-2 border border-dashed border-[#CACACF] hover:border-[#135bf1] rounded-xl hover:bg-[#135bf1]/5 text-slate-700 hover:text-[#135bf1] transition-all text-sm font-medium cursor-pointer text-left">
            <UserPlus className="w-4 h-4 shrink-0" />
            <span className="text-xs font-semibold">Invite Teammates</span>
          </button>
        </div>

        {/* Navigation List */}
        <nav className="px-3 space-y-[2px] mb-6">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-all cursor-pointer text-left group relative ${
                  isActive
                    ? "text-[#135bf1] bg-[#135bf1]/8 font-bold"
                    : "text-slate-650 hover:bg-[#F4F4F5] hover:text-[#111111]"
                }`}
              >
                <Icon
                  className={`w-[18px] h-[18px] transition-transform group-hover:scale-105 ${
                    isActive ? "text-[#135bf1]" : "text-slate-500"
                  }`}
                />
                <span className="flex-grow">{item.label}</span>
                {item.id === "meetings" && favoritesCount > 0 && (
                  <span className="bg-[#135bf1]/12 text-[#135bf1] text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center">
                    <FolderHeart className="w-3 h-3 mr-0.5" />
                    {favoritesCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Channels Section */}
        <div className="px-3 mb-6">
          <div className="flex items-center justify-between px-3 mb-1 text-[11px] font-bold text-slate-400 uppercase tracking-wider select-none">
            <span>Channels</span>
            <span className="cursor-pointer hover:text-slate-600">+</span>
          </div>
          <button className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-500 hover:bg-[#F4F4F5] rounded-lg transition-colors cursor-pointer block">
            # General
          </button>
        </div>
      </div>

      {/* Sidebar Footer Cards */}
      <div className="p-3 space-y-2 border-t border-[#F2F2F2]">
        
        {/* Promotional Card 1: App */}
        <div className="bg-[#F8F9FA] rounded-2xl p-3.5 border border-[#E9ECEF] relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-1">
            <span className="text-[10px] bg-[#E9ECEF] text-slate-600 rounded px-1 cursor-pointer">✕</span>
          </div>
          <p className="text-xs font-bold text-[#111111]">Get the desktop app</p>
          <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
            Local, reliable, bot-free recording
          </p>
          <a
            href="#"
            onClick={(e) => e.preventDefault()}
            className="text-xs font-bold text-[#135bf1] hover:underline mt-2 flex items-center gap-1.5 group-hover:translate-x-0.5 transition-transform"
          >
            <span>Download</span>
            <span className="text-[10px]">→</span>
          </a>
        </div>

        {/* Promotional Card 2: Business Trial */}
        <div className="bg-[#FFF9F6] rounded-2xl p-3.5 border border-[#FFE8DC] flex items-start gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#FFF2EB] border border-[#FFD3C0] flex items-center justify-center text-[#FF6A13] shrink-0">
            <Flame className="w-4 h-4 text-[#FF6A13]" />
          </div>
          <div className="text-left">
            <p className="text-xs font-bold text-[#111111] leading-none">Business Trial</p>
            <p className="text-[10px] text-slate-500 mt-1">14 days left</p>
          </div>
        </div>

        {/* Exit Account Button */}
        <button
          onClick={onLogout}
          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-rose-500 hover:bg-rose-50/60 font-medium text-xs transition-colors cursor-pointer group text-left mt-1"
        >
          <LogOut className="w-4 h-4 text-rose-450 group-hover:translate-x-0.5 transition-transform shrink-0" />
          <span>Exit Account</span>
        </button>
      </div>
    </aside>
  );
}
