/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { AppSettings } from "../types";
import {
  Sparkles,
  Key,
  FolderMinus,
  Trash2,
  Save,
  Check,
  Brain,
  MessageSquare,
  AlertCircle,
  HelpCircle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SettingsPanelProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
}

export default function SettingsPanel({ settings, onSaveSettings }: SettingsPanelProps) {
  const [aiProvider, setAiProvider] = useState<"gemini" | "custom_openai">(settings.aiProvider);
  const [apiKey, setApiKey] = useState(settings.apiKey);
  const [audioFolder, setAudioFolder] = useState(settings.audioFolder);
  const [autoDeleteAudio, setAutoDeleteAudio] = useState(settings.autoDeleteAudio);
  
  const [showStatus, setShowStatus] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSaveSettings({
      aiProvider,
      apiKey,
      audioFolder,
      autoDeleteAudio,
    });
    
    setShowStatus(true);
    setTimeout(() => {
      setShowStatus(false);
    }, 2500);
  };

  return (
    <div className="max-w-2xl bg-white border border-slate-100/80 rounded-3xl shadow-xl shadow-slate-200/40 p-8 max-md:p-6 select-none font-sans">
      <div className="flex items-center space-x-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-[#2C5EAD]/5 text-[#2C5EAD] flex items-center justify-center">
          <Brain className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-sm font-bold text-slate-800">Workspace Settings</h2>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Configure Obsidian parameters and AI backend engines
          </p>
        </div>
      </div>

      <AnimatePresence>
        {showStatus && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-semibold text-emerald-700 flex items-center space-x-2"
          >
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Success: Configurations updated and saved to local memory schema!</span>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="space-y-6">
        
        {/* AI Provider selector */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            AI Provider Engine
          </label>
          <div className="grid grid-cols-2 gap-4">
            <div
              onClick={() => setAiProvider("gemini")}
              className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col justify-between ${
                aiProvider === "gemini"
                  ? "border-[#2C5EAD] bg-[#2C5EAD]/5"
                  : "border-slate-100 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 block">Google Gemini (Default)</span>
                <input
                  type="radio"
                  checked={aiProvider === "gemini"}
                  onChange={() => setAiProvider("gemini")}
                  className="accent-[#2C5EAD]"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                State of the art audio transcription & summaries powered by the gemini-3.5-flash model.
              </span>
            </div>

            <div
              onClick={() => setAiProvider("custom_openai")}
              className={`p-4 border rounded-xl cursor-pointer transition-all flex flex-col justify-between ${
                aiProvider === "custom_openai"
                  ? "border-[#1591DC] bg-[#1591DC]/5"
                  : "border-slate-100 hover:bg-slate-50/50"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 block">External OpenAI API_KEY</span>
                <input
                  type="radio"
                  checked={aiProvider === "custom_openai"}
                  onChange={() => setAiProvider("custom_openai")}
                  className="accent-[#1591DC]"
                />
              </div>
              <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                Supply your own custom endpoint or key headers to proxy other transcript processors.
              </span>
            </div>
          </div>
        </div>

        {/* API Key overrides */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
              Secret API Credentials Override
            </label>
            <div className="flex items-center space-x-1 text-[10px] text-slate-400 font-medium cursor-help" title="By default, AI Studio builds automatically fetch the injected system Gemini Key. Override only if necessary.">
              <HelpCircle className="w-3 h-3 text-slate-300" />
              <span>How are keys loaded?</span>
            </div>
          </div>
          
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Key className="w-4 h-4" />
            </span>
            <input
              type="password"
              placeholder="••••••••••••••••••••••••••••••••"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white text-xs rounded-xl outline-none transition-colors focus:border-[#2C5EAD]"
            />
          </div>
          
          <div className="p-3.5 bg-slate-50/70 border border-slate-100 rounded-xl text-[10px] text-slate-400 flex items-start space-x-2.5 leading-relaxed">
            <AlertCircle className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-slate-500">Security Guidance: </span>
              In Google AI Studio Built Apps, your <code className="bg-slate-200/60 px-1 rounded font-mono">GEMINI_API_KEY</code> token is securely mounted behind Express proxy services automatically from your Secrets panel. No manual overrides are required.
            </div>
          </div>
        </div>

        {/* Audio folder settings */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">
            Obsidian Save Directory Path
          </label>
          <div className="relative">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <FolderMinus className="w-4 h-4" />
            </span>
            <input
              type="text"
              placeholder="/MeetingBrain/AcousticVault/"
              value={audioFolder}
              onChange={(e) => setAudioFolder(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white text-xs rounded-xl outline-none transition-colors focus:border-[#2C5EAD]"
              required
            />
          </div>
          <span className="text-[10px] text-slate-400 block ml-0.5 font-medium leading-relaxed">
            Set virtual directory locations where document markdown notes will save within the browser.
          </span>
        </div>

        {/* Cache toggler */}
        <div className="p-4 bg-slate-50/30 border border-slate-100 rounded-2xl flex items-center justify-between">
          <div className="max-w-md pr-4">
            <span className="text-xs font-bold text-slate-700 block">
              Auto-delete recordings
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
              When checked, MeetingBrain automatically purges the heavy base64 audio memory cache from local browser database files once verbatim transcriptions and summary files are written.
            </span>
          </div>

          {/* Styled ios-like checkbox toggle */}
          <button
            type="button"
            onClick={() => setAutoDeleteAudio(!autoDeleteAudio)}
            className={`w-10 h-6 shrink-0 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
              autoDeleteAudio ? "bg-[#2C5EAD]" : "bg-slate-200"
            }`}
          >
            <div
              className={`bg-white w-5 h-5 rounded-full transition-transform shadow-xs ${
                autoDeleteAudio ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="px-6 py-2.5 bg-[#2C5EAD] hover:bg-[#1591DC] text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer flex items-center space-x-2"
        >
          <Save className="w-3.5 h-3.5" />
          <span>Save Preset Rules</span>
        </button>

      </form>
    </div>
  );
}
