/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Meeting } from "../types";
import {
  Mic,
  Upload,
  Calendar,
  Clock,
  HardDrive,
  FileText,
  Pin,
  TrendingUp,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { motion } from "motion/react";

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
  // Sort meetings by date (recently updated first)
  const recentMeetings = [...meetings]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 3);

  // Storage metric calculation
  const totalStorageAllocatedKb = 512 * 1024; // 512MB in KB
  const usedStorageKb = meetings.reduce((acc, current) => acc + (current.audioSizeKb || 120), 0);
  const usedPercentage = Math.min(((usedStorageKb / totalStorageAllocatedKb) * 100), 100);

  const formatSize = (kb: number) => {
    if (kb > 1024) {
      return (kb / 1024).toFixed(1) + " MB";
    }
    return kb.toFixed(0) + " KB";
  };

  return (
    <div className="space-y-8 font-sans">
      {/* Welcome Banner */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-white border border-slate-100 rounded-3xl p-8 shadow-xl shadow-slate-100/50 relative overflow-hidden">
        {/* Background Gradients from Theme */}
        <div className="absolute -top-16 -right-16 w-52 h-52 bg-[#C4E2F5] blur-[80px] opacity-40"></div>
        <div className="absolute -bottom-16 -left-16 w-52 h-52 bg-[#4BB8FA] blur-[80px] opacity-20"></div>

        <div className="z-10">
          <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2C5EAD]" />
            Workspace Core Sync
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Sync Session Dashboard
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
            MeetingBrain processes and organizes raw spoken sync meetings. Turn acoustic waves into neatly structured formatted Markdown documents automatically.
          </p>
        </div>
        <button
          onClick={() => setActiveTab("recorder")}
          className="mt-4 md:mt-0 px-5 py-2.5 bg-[#2C5EAD] hover:bg-[#1591DC] text-white rounded-xl text-xs font-semibold shadow-lg shadow-[#2C5EAD]/20 transition-all cursor-pointer flex items-center gap-2 z-10 hover:-translate-y-0.5 duration-200"
        >
          <Mic className="w-3.5 h-3.5" />
          <span>New Meeting</span>
        </button>
      </div>

      {/* Bento Grid Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        
        {/* Storage utilization Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Storage Usage
              </span>
              <HardDrive className="w-4 h-4 text-[#1591DC]" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {formatSize(usedStorageKb)}
            </div>
            <p className="text-[10px] text-slate-400 mt-1">
              Used of {formatSize(totalStorageAllocatedKb)} limits
            </p>
          </div>
          
          <div className="mt-6">
            <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
              <div
                className="bg-[#2C5EAD] h-full rounded-full transition-all duration-500"
                style={{ width: `${usedPercentage}%` }}
              />
            </div>
            <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2 font-semibold tracking-wide">
              <span>{usedPercentage.toFixed(1)}% used</span>
              <span>{formatSize(usedStorageKb)} of {formatSize(totalStorageAllocatedKb)}</span>
            </div>
          </div>
        </div>

        {/* Saved notes headcount Card */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                Workspace Vault
              </span>
              <FileText className="w-4 h-4 text-[#2C5EAD]" />
            </div>
            <div className="text-2xl font-bold text-slate-800">
              {meetings.length} <span className="text-xs text-slate-400 uppercase tracking-wide font-semibold ml-1">Notes</span>
            </div>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Active transcripts categorized inside locally saved folders
            </p>
          </div>
          <button
            onClick={() => setActiveTab("meetings")}
            className="mt-6 text-xs text-[#2C5EAD] hover:text-[#1591DC] font-bold flex items-center space-x-1 cursor-pointer hover:underline text-left transition-colors"
          >
            <span>All Meetings Notes</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Quick actions box */}
        <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-sm">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-widest block mb-4">
            Quick Actions
          </span>
          <div className="space-y-3">
            <button
              onClick={() => setActiveTab("recorder")}
              className="w-full p-3 bg-slate-50/50 hover:bg-white text-slate-700 hover:text-slate-900 transition-all rounded-xl border border-slate-100 flex items-center space-x-3 text-xs font-bold shadow-xs hover:shadow-xs cursor-pointer"
            >
              <Mic className="w-4 h-4 text-[#2C5EAD]" />
              <span>Open Voice Recorder</span>
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className="w-full p-3 bg-slate-50/50 hover:bg-white text-slate-700 hover:text-slate-900 transition-all rounded-xl border border-slate-100 flex items-center space-x-3 text-xs font-bold shadow-xs hover:shadow-xs cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-[#1591DC]" />
              <span>Configure AI Engines</span>
            </button>
          </div>
        </div>

      </div>

      {/* Recent Activity List */}
      <div className="bg-white border border-slate-100 rounded-3xl p-6 shadow-xl shadow-slate-100/40">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-50">
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Recent Vault Additions
            </h2>
            <p className="text-[10px] text-slate-400 font-medium mt-0.5">
              Review and select notes to preview transcripts
            </p>
          </div>
        </div>

        {recentMeetings.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-slate-100 rounded-xl">
            <span className="text-3xl">📂</span>
            <h3 className="text-xs font-semibold text-slate-700 mt-4">
              Your vault is currently empty
            </h3>
            <p className="text-[10px] text-slate-400 max-w-xs mx-auto mt-1 leading-relaxed">
              Record audio live or drop a pre-saved mp3 file to run your initial AI transcription.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {recentMeetings.map((meeting) => (
              <div
                key={meeting.id}
                className="py-4 first:pt-0 last:pb-0 flex items-start justify-between group"
              >
                <div
                  onClick={() => onSelectMeeting(meeting)}
                  className="flex-grow min-w-0 cursor-pointer"
                >
                  <h4 className="text-xs font-semibold text-slate-800 hover:text-[#2C5EAD] transition-all truncate leading-snug">
                    {meeting.title}
                  </h4>
                  <div className="flex items-center space-x-3 text-[10px] text-slate-400 mt-1.5 font-medium">
                    <span className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1 text-slate-400" />
                      {new Date(meeting.date).toLocaleDateString()}
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-3 h-3 mr-1 text-slate-400" />
                      {meeting.duration}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400/80 mt-1 line-clamp-1">
                    {meeting.transcript || "No transcription text content"}
                  </p>
                </div>

                <div className="flex items-center space-x-2 shrink-0 ml-4">
                  <button
                    onClick={() => onToggleFavorite(meeting.id)}
                    className={`p-1.5 rounded-lg transition-colors cursor-pointer border ${
                      meeting.isFavorite
                        ? "bg-[#1591DC]/5 border-slate-100 text-[#1591DC]"
                        : "bg-transparent border-transparent text-slate-300 hover:text-slate-500"
                    }`}
                  >
                    <Pin className={`w-3.5 h-3.5 ${meeting.isFavorite ? "fill-[#1591DC]" : ""}`} />
                  </button>
                  <button
                    onClick={() => onSelectMeeting(meeting)}
                    className="p-1 px-2.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 hover:text-[#2C5EAD] bg-slate-50 rounded-lg cursor-pointer hover:bg-[#2C5EAD]/5 transition-all"
                  >
                    Open
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
