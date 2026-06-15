/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React from "react";
import { AppSettings, Meeting } from "../types";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  FileAudio,
  FolderOpen,
  KeyRound,
  ListChecks,
  Mic,
  Upload,
} from "lucide-react";

interface DashboardProps {
  meetings: Meeting[];
  settings: AppSettings;
  setActiveTab: (tab: "dashboard" | "recorder" | "meetings" | "settings" | "integrations") => void;
  setRecorderMode?: (mode: "record" | "upload") => void;
}

export default function Dashboard({
  meetings,
  settings,
  setActiveTab,
  setRecorderMode,
}: DashboardProps) {
  const totalMeetings = meetings.length;
  const drafts = meetings.filter((meeting) => meeting.isDraft).length;
  const processed = totalMeetings - drafts;
  const withoutFolder = meetings.filter((meeting) => !meeting.folderId).length;
  const withoutSummary = meetings.filter((meeting) => {
    const summary = meeting.summary.trim().toLowerCase();
    return !summary || summary.includes("borrador guardado en tiempo real") || summary.includes("audio digital capturado localmente");
  }).length;
  const hasApiKey = Boolean(settings.apiKey?.trim());

  const cards = [
    {
      title: "Reuniones transcritas",
      value: String(totalMeetings),
      detail: `${processed} procesadas · ${drafts} borradores`,
      icon: FileAudio,
      tone: "blue",
    },
    {
      title: "Uso de Gemini",
      value: "0",
      detail: "0 solicitudes hoy · 0 tokens estimados",
      icon: Bot,
      tone: "cyan",
    },
    {
      title: "Estado de API",
      value: hasApiKey ? "Activa" : "Sin clave",
      detail: hasApiKey ? "Gemini listo para resumenes y copiloto" : "Configura Gemini para usar IA",
      icon: hasApiKey ? CheckCircle2 : AlertTriangle,
      tone: hasApiKey ? "emerald" : "amber",
    },
    {
      title: "Pendientes",
      value: String(withoutFolder + withoutSummary + drafts),
      detail: `${withoutFolder} sin carpeta · ${withoutSummary} sin resumen · ${drafts} borradores`,
      icon: ListChecks,
      tone: "slate",
    },
  ];

  const goRecorder = (mode: "record" | "upload") => {
    if (setRecorderMode) setRecorderMode(mode);
    setActiveTab("recorder");
  };

  return (
    <div className="space-y-6 font-sans text-left max-w-6xl mx-auto pb-12 select-none">
      <div className="flex flex-row items-center justify-between gap-4 pb-4 border-b border-[#EBEBEB]">
        <div>
          <h1 className="text-xl font-bold text-[#111111] tracking-tight">Dashboard</h1>
          <p className="text-[11px] text-slate-500 mt-0.5">Estado local de reuniones, pendientes y uso de IA.</p>
        </div>

        <button
          onClick={() => goRecorder("record")}
          className="px-4 py-2 bg-[#135bf1] hover:bg-[#0746cc] font-bold text-white rounded-full transition-all cursor-pointer flex items-center justify-center gap-2 shadow-md shadow-[#135bf1]/20 active:scale-95"
          title="Grabar clase"
        >
          <Mic className="w-4 h-4 shrink-0" />
          <span className="text-xs">Grabar clase</span>
        </button>
      </div>

      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <article key={card.title} className="bg-white border border-[#E9E9EB] rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-black text-slate-400 uppercase tracking-wider">{card.title}</p>
                  <p className="text-3xl font-black text-[#111111] mt-3 tracking-tight">{card.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${getTone(card.tone)}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-xs font-semibold text-slate-500 leading-relaxed mt-4">{card.detail}</p>
            </article>
          );
        })}
      </section>

      <section className="bg-white border border-[#E9E9EB] rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-sm font-black text-[#111111]">Acciones rapidas</h2>
            <p className="text-xs text-slate-500 mt-1">Abre lo importante sin convertir el dashboard en otra lista.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction icon={Mic} label="Grabar clase" onClick={() => goRecorder("record")} />
          <QuickAction icon={Upload} label="Subir audio" onClick={() => goRecorder("upload")} />
          <QuickAction icon={FolderOpen} label="Abrir Explore" onClick={() => setActiveTab("meetings")} />
          <QuickAction icon={KeyRound} label="Configurar Gemini" onClick={() => setActiveTab("settings")} />
        </div>
      </section>
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 rounded-xl border border-[#E9E9EB] bg-white hover:bg-slate-50 hover:border-[#135bf1]/30 text-slate-700 hover:text-[#135bf1] px-4 flex items-center justify-between gap-3 transition-colors cursor-pointer"
    >
      <span className="flex items-center gap-2 text-xs font-bold">
        <Icon className="w-4 h-4" />
        {label}
      </span>
      <ArrowRight className="w-4 h-4" />
    </button>
  );
}

function getTone(tone: string) {
  switch (tone) {
    case "blue":
      return "bg-[#135bf1]/8 border-[#135bf1]/15 text-[#135bf1]";
    case "cyan":
      return "bg-cyan-50 border-cyan-100 text-cyan-600";
    case "emerald":
      return "bg-emerald-50 border-emerald-100 text-emerald-600";
    case "amber":
      return "bg-amber-50 border-amber-100 text-amber-600";
    default:
      return "bg-slate-50 border-slate-100 text-slate-600";
  }
}
