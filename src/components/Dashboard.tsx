/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from "react";
import { Meeting } from "../types";
import { formatInUTC5 } from "../lib/dateUtils";
import {
  Search,
  Video,
  Upload,
  Mic,
  ChevronDown,
  Clock,
  Calendar,
  MoreHorizontal,
  ChevronRight,
  ArrowRight,
  Sparkles,
  FileText,
  Pin
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface DashboardProps {
  meetings: Meeting[];
  onSelectMeeting: (meeting: Meeting) => void;
  setActiveTab: (tab: "dashboard" | "recorder" | "meetings" | "settings") => void;
  onToggleFavorite: (id: string) => void;
}

export default function Dashboard({
  meetings,
  onSelectMeeting,
  setActiveTab,
  onToggleFavorite,
}: DashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForYou, setSelectedForYou] = useState("For you");

  const filterMeetings = meetings.filter(m => 
    m.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.transcript.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sorting meetings to list latest first
  const sortedMeetings = [...filterMeetings].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  return (
    <div className="space-y-6 font-sans text-left max-w-5xl mx-auto pb-12 select-none">
      
      {/* 1. TOP BAR SEARCH & DISPATCH */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        {/* Search input to match Otter exact search visual */}
        <div className="relative w-full sm:max-w-md">
          <Search className="w-[15px] h-[15px] text-[#666666] absolute left-3.5 top-3" />
          <input
            type="text"
            placeholder="Ask or search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#F4F4F5] hover:bg-[#EBEBEB]/80 pl-10 pr-16 py-2 text-sm rounded-xl focus:bg-white outline-none border border-transparent focus:border-[#EBEBEB] hover:border-[#EBEBEB]/50 focus:ring-1 focus:ring-slate-100 transition-all text-[#111111]"
          />
          <span className="absolute right-3.5 top-2.5 px-1.5 py-0.5 bg-white text-[10px] text-slate-400 font-bold border border-slate-200/80 rounded shadow-2xs select-none">
            CtrlK
          </span>
        </div>

        {/* Action controls in right-hand side */}
        <div className="flex items-center gap-3">
          {/* Virtual Quick Video Meet Link */}
          <button
            onClick={() => setActiveTab("recorder")}
            className="p-2 bg-transparent hover:bg-[#F4F4F5] border border-[#E9E9EB] rounded-full text-slate-700 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
            title="Start video/screen capture"
          >
            <Video className="w-5 h-5 text-slate-750" />
          </button>

          {/* Import / Upload Audio */}
          <button
            onClick={() => setActiveTab("recorder")}
            className="p-2 bg-transparent hover:bg-[#F4F4F5] border border-[#E9E9EB] rounded-full text-slate-700 transition-all cursor-pointer shadow-2xs flex items-center justify-center"
            title="Import raw transcript / file"
          >
            <Upload className="w-5 h-5 text-slate-755" />
          </button>

          {/* Glowing Red/Blue Mic record trigger */}
          <button
            onClick={() => setActiveTab("recorder")}
            className="px-4 py-2 bg-[#135bf1] hover:bg-[#0746cc] font-bold text-white rounded-full transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#135bf1]/20 group active:scale-95"
            title="Start recording audio with speech engine"
          >
            <Mic className="w-4 h-4 shrink-0 transition-transform group-hover:scale-105" />
            <span className="text-xs">Record Live</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN GRID LAYOUT */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Side Content (Meeting list and live notes) */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Header section with Today indicators */}
          <div className="flex items-center justify-between pb-1">
            <div className="flex items-center gap-1 cursor-pointer hover:text-slate-900 text-slate-750 transition-colors">
              <h2 className="text-base font-bold text-[#111111] pr-0.5">Today, Jun 12</h2>
              <ChevronDown className="w-4 h-4 text-slate-650" />
            </div>

            {/* "For you" Dropdown Selector */}
            <div className="relative">
              <button className="flex items-center gap-1.5 text-xs font-bold text-[#333333] hover:bg-[#F4F4F5] px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer">
                <span>{selectedForYou}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>
            </div>
          </div>

          {/* Card list of meetings / audio reports */}
          <div className="space-y-5">
            
            {/* If there are current meetings from state, render them first */}
            {sortedMeetings.map((meeting) => {
              const isLive = meeting.isDraft;
              return (
                <div
                  key={meeting.id}
                  className={`bg-white rounded-2xl p-5 border text-left transition-all relative cursor-pointer hover:shadow-md hover:border-[#135bf1]/35 flex flex-col justify-between ${
                    isLive
                      ? "border-[#FF4D4F] ring-1 ring-[#FF4D4F]/10 shadow-[0_4px_16px_rgba(255,77,79,0.04)]"
                      : "border-[#EBEBEB]"
                  }`}
                  onClick={() => onSelectMeeting(meeting)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      {/* Active LIVE badge */}
                      {isLive ? (
                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-[#FF4D4F] uppercase tracking-wider mb-2">
                          <span className="w-2 h-2 rounded-full bg-[#FF4D4F] animate-ping" />
                          <span>LIVE</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-[11px] font-medium text-slate-400 mb-2">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{formatInUTC5(meeting.date, "date")}</span>
                        </div>
                      )}

                      <h3 className="text-base font-bold text-[#111111] group-hover:text-[#135bf1] transition-colors tracking-tight leading-tight mb-2">
                        {meeting.title}
                      </h3>

                      <p className="text-[11px] text-[#666666] leading-none mb-3 font-semibold">
                        {formatInUTC5(meeting.date, "time")} • {meeting.duration} • {meeting.isDraft ? "Borrador" : "Procesada"}
                      </p>
                    </div>

                    {/* Right side check icon or pin */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(meeting.id);
                        }}
                        className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                          meeting.isFavorite
                            ? "bg-[#135bf1]/5 border-slate-100 text-[#135bf1]"
                            : "bg-transparent border-transparent text-slate-350 hover:text-slate-500"
                        }`}
                        title="Pin this notes card"
                      >
                        <Pin className={`w-3.5 h-3.5 ${meeting.isFavorite ? "fill-[#135bf1]" : ""}`} />
                      </button>
                    </div>
                  </div>

                  {/* Speaker Placeholder */}
                  <div className="flex items-center gap-2 mb-3 bg-[#F4F4F5]/60 hover:bg-[#F4F4F5] p-1.5 rounded-lg border border-[#E9E9EB]/50 w-fit max-w-[200px] select-none transition-colors">
                    <span className="w-4 h-4 rounded-full bg-slate-200 border border-white flex items-center justify-center font-bold text-[8px] text-slate-500">U</span>
                    <span className="text-[10px] font-bold text-[#333333] truncate">Unknown Speaker</span>
                  </div>

                  {/* Transcript extract shown neatly with custom borders for active elements */}
                  <div className={`p-3.5 border-l-2 bg-[#F8F9FA]/80 rounded-r-xl ${isLive ? "border-[#FF4D4F]" : "border-slate-300"}`}>
                    <p className="text-xs text-[#444444] leading-relaxed line-clamp-3 select-none italic font-sans">
                      {meeting.transcript || "No transcript content yet. Ready to analyze..."}
                    </p>
                  </div>

                  {/* Bullet Summary Preview if present */}
                  {meeting.summary && !isLive && (
                    <div className="mt-3.5 border-t border-[#EBEBEB]/60 pt-3 text-[11px] text-slate-655 space-y-1.5 select-none text-left">
                      <p className="font-bold text-[#111111] uppercase tracking-wider text-[9px] text-slate-400">Generando Minuta AI:</p>
                      <ul className="space-y-1">
                        <li className="flex items-start gap-1">
                          <span className="text-[#135bf1] shrink-0">•</span>
                          <span className="line-clamp-1">{meeting.summary ? meeting.summary.split("\n").filter(l => l.includes("-")).slice(0, 1).map(l => l.replace(/^-\s+/, ""))[0] || "Acta generada con éxito" : ""}</span>
                        </li>
                      </ul>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Clean empty state if there are truly no meetings */}
            {meetings.length === 0 && (
              <div className="bg-slate-50/50 rounded-2xl p-8 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center min-h-[220px] select-none">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3.5">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-bold text-[#111111] mb-1">
                  Tu bandeja de notas está vacía
                </h3>
                <p className="text-xs text-slate-500 max-w-sm mb-4 leading-normal">
                  No tienes ninguna reunión guardada en este espacio de trabajo. Comienza a grabar o importa un archivo para transcribir.
                </p>
                <button
                  onClick={() => setActiveTab("recorder")}
                  className="px-4 py-2 bg-[#135bf1] hover:bg-[#0746cc] text-white font-bold text-xs rounded-xl transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  Record first meeting
                </button>
              </div>
            )}

          </div>
        </div>

        {/* Right Side Column (Interactive Getting Started checklist, similar to screenshots) */}
        <div className="space-y-6">
          
          {/* Calendar Widget / Welcome Panel */}
          <div className="bg-white border border-[#EBEBEB] rounded-2xl p-5 text-left">
            <h3 className="text-sm font-bold text-[#111111] mb-3 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#135bf1]" />
              <span>Olli Welcome Guide</span>
            </h3>
            
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Explore your meeting insights effortlessly. Record real-time speech, compile structured markdown summaries, and ask Olli any specific question!
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setActiveTab("recorder")}
                className="w-full flex items-center justify-between p-3 border border-[#EBEBEB] hover:border-[#135bf1]/40 rounded-xl hover:bg-[#135bf1]/5 text-[#135bf1] font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Record first meeting</span>
                <ChevronRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => setActiveTab("settings")}
                className="w-full flex items-center justify-between p-3 border border-[#EBEBEB] hover:border-slate-350 bg-slate-50 hover:bg-white text-slate-700 font-bold text-xs transition-colors cursor-pointer"
              >
                <span>Setup api integrations</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Interactive Checklist Widget to match Otter's "0/3 Get started" floating drawer widget */}
          <div className="bg-gradient-to-r from-[#EFF6FF] to-[#E0F2FE] border border-[#BFDBFE]/60 rounded-2xl p-5 text-left relative overflow-hidden shadow-xs">
            <div className="absolute top-0 right-0 p-3 select-none">
              <span className="text-xs font-black text-[#135bf1]/20">olli</span>
            </div>

            <div className="flex items-center gap-2.5 mb-3.5">
              <div className="px-2.5 py-1 bg-white border border-[#BFDBFE] rounded-full text-[10px] font-bold text-[#1e40af]">
                0/3 Get started
              </div>
            </div>

            <h4 className="text-xs font-bold text-[#1e3a8a] mb-3 uppercase tracking-wider">
              Onboarding Checklist
            </h4>

            <div className="space-y-3">
              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={meetings.length > 0}
                  readOnly
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#BFDBFE] text-[#135bf1] focus:ring-[#135bf1]"
                />
                <div>
                  <p className={`text-[11px] font-semibold leading-none ${meetings.length > 0 ? "text-slate-400 line-through" : "text-[#1e3a8a]"}`}>
                    Record live transcript
                  </p>
                  <p className="text-[9px] text-[#2563eb] mt-1">Try speech recording with standard mic capture</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={meetings.some(m => !m.isDraft)}
                  readOnly
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#BFDBFE] text-[#135bf1] focus:ring-[#135bf1]"
                />
                <div>
                  <p className={`text-[11px] font-semibold leading-none ${meetings.some(m => !m.isDraft) ? "text-slate-400 line-through" : "text-[#1e3a8a]"}`}>
                    Generate AI summary notes
                  </p>
                  <p className="text-[9px] text-[#2563eb] mt-1">Verify structured details and formats</p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={false}
                  readOnly
                  className="mt-0.5 h-3.5 w-3.5 rounded border-[#BFDBFE] text-[#135bf1] focus:ring-[#135bf1]"
                />
                <div>
                  <p className="text-[11px] font-semibold leading-none text-[#1e3a8a]">
                    Discuss with Olli Chat
                  </p>
                  <p className="text-[9px] text-[#2563eb] mt-1">Open a transcript and ask questions directly</p>
                </div>
              </div>
            </div>
          </div>

        </div>

      </div>

    </div>
  );
}
