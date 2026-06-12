/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Meeting } from "../types";
import {
  FileText,
  Search,
  Calendar,
  Clock,
  Pin,
  Trash2,
  Copy,
  Check,
  Download,
  Share2,
  BookOpen,
  ChevronRight,
  Filter,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MeetingViewerProps {
  meetings: Meeting[];
  selectedMeeting: Meeting | null;
  onSelectMeeting: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateMeetingTitle: (id: string, newTitle: string) => void;
}

export default function MeetingViewer({
  meetings,
  selectedMeeting,
  onSelectMeeting,
  onDeleteMeeting,
  onToggleFavorite,
  onUpdateMeetingTitle,
}: MeetingViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "transcript">("summary");
  const [copied, setCopied] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");

  // Search and filter meetings
  const filteredMeetings = meetings.filter((meeting) => {
    const matchesSearch =
      meeting.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meeting.transcript.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterFavorites) {
      return matchesSearch && meeting.isFavorite;
    }
    return matchesSearch;
  });

  const handleCopyClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditTitle = (meeting: Meeting) => {
    setEditTitleValue(meeting.title);
    setIsEditingTitle(true);
  };

  const saveEditTitle = (id: string) => {
    if (editTitleValue.trim()) {
      onUpdateMeetingTitle(id, editTitleValue.trim());
    }
    setIsEditingTitle(false);
  };

  // Exporters for Notion/Obsidian integration
  const downloadFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = (meeting: Meeting) => {
    const mdContent = `# ${meeting.title}
Date: ${new Date(meeting.date).toLocaleDateString()}
Duration: ${meeting.duration}

## AI Summary & Actions
${meeting.summary}

## Verbatim Transcript
${meeting.transcript}
`;
    const cleanName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${cleanName}-notes.md`, mdContent, "text/markdown");
  };

  const handleExportJSON = (meeting: Meeting) => {
    const jsonStr = JSON.stringify(meeting, null, 2);
    const cleanName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${cleanName}-vault.json`, jsonStr, "application/json");
  };

  // Custom parser rendering Markdown to HTML neatly
  const renderMarkdown = (markdownText: string) => {
    if (!markdownText) return <p className="text-slate-400 italic">No notes data present.</p>;
    
    const lines = markdownText.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-slate-800 tracking-wide uppercase mt-4 mb-2">
            {trimmed.replace(/^###\s*/, "")}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-slate-900 border-b border-slate-50 pb-1.5 mt-6 mb-3">
            {trimmed.replace(/^##\s*/, "")}
          </h3>
        );
      }
      if (trimmed.startsWith("#")) {
        return (
          <h2 key={idx} className="text-lg font-bold text-[#2C5EAD] mt-6 mb-4">
            {trimmed.replace(/^#\s*/, "")}
          </h2>
        );
      }

      // Checklists (Task Lists)
      const checklistMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
      if (checklistMatch) {
        const checked = checklistMatch[1].toLowerCase() === "x";
        const text = checklistMatch[2];
        return (
          <div key={idx} className="flex items-start space-x-2.5 my-2 pl-2">
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mt-1 h-3.5 w-3.5 rounded-sm border-slate-300 text-[#2C5EAD] focus:ring-[#2C5EAD] shrink-0"
            />
            <span className={`text-[12px] leading-relaxed ${checked ? "text-slate-400 line-through" : "text-slate-600"}`}>
              {text}
            </span>
          </div>
        );
      }

      // Standard Unordered Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={idx} className="text-[12px] text-slate-600 leading-relaxed my-1.5 list-disc pl-1 ml-4">
            {trimmed.replace(/^[-*]\s+/, "")}
          </li>
        );
      }

      // Empty Lines
      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }

      // Bold text replacements
      let lineWithBold = trimmed;
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(trimmed)) !== null) {
        // text before bold
        if (match.index > lastIndex) {
          parts.push(trimmed.substring(lastIndex, match.index));
        }
        // bold text
        parts.push(
          <strong key={match.index} className="font-semibold text-slate-800">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      
      if (lastIndex < trimmed.length) {
        parts.push(trimmed.substring(lastIndex));
      }

      return (
        <p key={idx} className="text-[12px] text-slate-600 leading-relaxed my-1.5">
          {parts.length > 0 ? parts : trimmed}
        </p>
      );
    });
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6 select-none font-sans relative">
      
      {/* 1. Left Vault Explorer List */}
      <div id="vault_explorer" className="w-80 bg-slate-50/50 border border-slate-100 rounded-3xl flex flex-col overflow-hidden shrink-0 max-lg:hidden">
        
        {/* Explorer header info */}
        <div className="p-5 border-b border-slate-100 bg-white/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-800 tracking-tight uppercase">
              Obsidian Chest Folder
            </span>
            <button
              onClick={() => setFilterFavorites(!filterFavorites)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                filterFavorites
                  ? "bg-[#1591DC]/5 border-slate-200 text-[#1591DC]"
                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-600"
              }`}
              title="Filter pinned notes"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {/* Searching vault */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search vault files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white pl-9 pr-3 py-2 border border-slate-100 focus:bg-white text-xs rounded-xl outline-none transition-colors focus:border-[#2C5EAD] focus:ring-1 focus:ring-[#2C5EAD]/10"
            />
          </div>
        </div>

        {/* Saved notes render container */}
        <div className="flex-grow overflow-y-auto divide-y divide-slate-100/50 p-2 space-y-1">
          {filteredMeetings.length === 0 ? (
            <div className="text-center py-12 px-2">
              <span className="text-xl">📂</span>
              <p className="text-[10px] text-slate-400 mt-2">No files match parameters</p>
            </div>
          ) : (
            filteredMeetings.map((meeting) => {
              const representsActive = selectedMeeting?.id === meeting.id;
              return (
                <div
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting)}
                  className={`p-3 rounded-xl cursor-pointer transition-all flex justify-between items-start group ${
                    representsActive
                      ? "bg-white border border-slate-100 shadow-xs"
                      : "bg-transparent hover:bg-white/50 border border-transparent"
                  }`}
                >
                  <div className="min-w-0 pr-2">
                    <span className="text-xs font-semibold text-slate-800 block truncate group-hover:text-[#2C5EAD] transition-colors leading-snug">
                      {meeting.title}
                    </span>
                    <div className="flex items-center space-x-2 text-[10px] text-slate-400 mt-1">
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-0.5 shrink-0" />
                        {new Date(meeting.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                      </span>
                      <span>•</span>
                      <span className="flex items-center">
                        <Clock className="w-3 h-3 mr-0.5 shrink-0" />
                        {meeting.duration}
                      </span>
                    </div>
                  </div>
                  
                  {meeting.isFavorite && (
                    <Pin className="w-3 h-3 text-[#1591DC] fill-[#1591DC] shrink-0 mt-0.5" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Right Workspace Doc Panel */}
      <div id="notes_workspace" className="flex-grow bg-white border border-slate-100 rounded-3xl flex flex-col overflow-hidden shadow-xl shadow-slate-200/50">
        {selectedMeeting ? (
          <div className="flex flex-col h-full">
            
            {/* Doc Workspace header controls */}
            <div className="p-6 border-b border-slate-100 bg-slate-50/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="flex-grow min-w-0">
                {isEditingTitle ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      value={editTitleValue}
                      onChange={(e) => setEditTitleValue(e.target.value)}
                      onBlur={() => saveEditTitle(selectedMeeting.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEditTitle(selectedMeeting.id);
                        if (e.key === "Escape") setIsEditingTitle(false);
                      }}
                      className="text-base font-bold text-slate-800 border-b border-[#2C5EAD] px-1 bg-transparent py-0.5 focus:outline-none w-full max-w-sm"
                      autoFocus
                    />
                    <button
                      onClick={() => saveEditTitle(selectedMeeting.id)}
                      className="text-xs bg-[#2c5ead] text-white px-2 py-0.5 rounded cursor-pointer font-medium"
                    >
                      Save
                    </button>
                  </div>
                ) : (
                  <h1
                    onClick={() => startEditTitle(selectedMeeting)}
                    className="text-base font-bold text-slate-800 tracking-tight leading-snug cursor-pointer group hover:text-[#2C5EAD] flex items-center shrink-0"
                    title="Click to click-to-edit"
                  >
                    <span className="truncate">{selectedMeeting.title}</span>
                    <span className="text-[10px] text-slate-300 ml-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                      Edit
                    </span>
                  </h1>
                )}
                
                <div className="flex items-center space-x-4 text-[10px] text-slate-400 mt-2 font-medium">
                  <span className="flex items-center">
                    <Calendar className="w-3.5 h-3.5 mr-1" />
                    {new Date(selectedMeeting.date).toLocaleString()}
                  </span>
                  <span className="flex items-center">
                    <Clock className="w-3.5 h-3.5 mr-1" />
                    {selectedMeeting.duration}
                  </span>
                  <span>Size: {selectedMeeting.audioSizeKb || 120} KB</span>
                </div>
              </div>

              {/* Toolbar widgets */}
              <div className="flex items-center space-x-1.5 shrink-0">
                <button
                  onClick={() => onToggleFavorite(selectedMeeting.id)}
                  className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                    selectedMeeting.isFavorite
                      ? "bg-[#1591DC]/5 border-slate-100 text-[#1591DC]"
                      : "bg-white border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600"
                  }`}
                  title="Pin File"
                >
                  <Pin className={`w-3.5 h-3.5 ${selectedMeeting.isFavorite ? "fill-[#1591DC]" : ""}`} />
                </button>
                <button
                  onClick={() => handleExportMarkdown(selectedMeeting)}
                  className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                  title="Export Obsidian Markdown (.md)"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleExportJSON(selectedMeeting)}
                  className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                  title="Export Raw JSON Vault (.json)"
                >
                  <Share2 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => onDeleteMeeting(selectedMeeting.id)}
                  className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                  title="Delete File"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Document body navigation selector */}
            <div className="px-6 border-b border-slate-50 flex items-center justify-between bg-slate-50/10">
              <div className="flex space-x-1.5 py-2">
                <button
                  onClick={() => setActiveTab("summary")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    activeTab === "summary"
                      ? "bg-[#2C5EAD]/5 text-[#2C5EAD]"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>AI Summary Note</span>
                </button>
                <button
                  onClick={() => setActiveTab("transcript")}
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                    activeTab === "transcript"
                      ? "bg-[#2C5EAD]/5 text-[#2C5EAD]"
                      : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Verbatim Transcription</span>
                </button>
              </div>

              {/* Copy action */}
              <button
                onClick={() =>
                  handleCopyClipboard(
                    activeTab === "summary" ? selectedMeeting.summary : selectedMeeting.transcript
                  )
                }
                className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 flex items-center space-x-1.5 transition-colors cursor-pointer border border-slate-100"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                <span>{copied ? "Copied" : "Copy Content"}</span>
              </button>
            </div>

            {/* Display notes area */}
            <div className="flex-grow overflow-y-auto p-8 max-md:p-6 bg-slate-50/30">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 5 }}
                  transition={{ duration: 0.15 }}
                  className="bg-white border border-slate-100/50 rounded-2xl p-6 shadow-xs h-full"
                >
                  {activeTab === "summary" ? (
                    <div id="markdown_body" className="space-y-2 uppercase-headings leading-relaxed font-sans">
                      {renderMarkdown(selectedMeeting.summary)}
                    </div>
                  ) : (
                    <div className="font-mono text-slate-600 leading-relaxed text-[11px] whitespace-pre-wrap font-medium">
                      {selectedMeeting.transcript || (
                        <p className="font-sans italic text-slate-400 text-xs text-center py-8">
                          No transcript content returned.
                        </p>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center bg-slate-50/30">
            <span className="text-4xl animate-bounce">📁</span>
            <h3 className="text-xs font-semibold text-slate-700 mt-4 uppercase">
              No File Active
            </h3>
            <p className="text-[10px] text-slate-400 max-w-xs mt-1.5 mt-1 leading-relaxed">
              Select an audio file from the Obsidian chest folder sidebar on the left, or open the visual microphone recorder tab to log notes.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
