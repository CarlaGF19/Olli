/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
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
  Sliders,
  Cpu,
  ShieldAlert,
  Eye,
  EyeOff,
  Database,
  Lock
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface SettingsPanelProps {
  settings: AppSettings;
  onSaveSettings: (settings: AppSettings) => void;
  defaultTab?: "general" | "api" | "integrations" | "security";
  onDeleteAccount: () => Promise<void>;
}

export default function SettingsPanel({
  settings,
  onSaveSettings,
  defaultTab = "general",
  onDeleteAccount
}: SettingsPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<"general" | "api" | "integrations" | "security">(defaultTab);
  
  const [aiProvider, setAiProvider] = useState<"gemini" | "custom_openai">(settings.aiProvider);
  const [apiKey, setApiKey] = useState("");
  const [audioFolder, setAudioFolder] = useState(settings.audioFolder);
  const [autoDeleteAudio, setAutoDeleteAudio] = useState(settings.autoDeleteAudio);
  const [bypassSizeLimit, setBypassSizeLimit] = useState(settings.bypassSizeLimit ?? false);
  
  const [showStatus, setShowStatus] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  // Sync state if defaultTab prop changes (e.g. clicking sidebar menu updates it)
  useEffect(() => {
    setActiveSubTab(defaultTab);
  }, [defaultTab]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const nextSettings: AppSettings = {
      aiProvider,
      hasApiKey: apiKey.trim() ? true : settings.hasApiKey,
      audioFolder,
      autoDeleteAudio,
      bypassSizeLimit,
    };

    if (apiKey.trim()) {
      nextSettings.apiKey = apiKey.trim();
    }

    onSaveSettings(nextSettings);
    
    setShowStatus(true);
    setTimeout(() => {
      setShowStatus(false);
    }, 2500);
  };

  const handleDeleteTrigger = async () => {
    if (deleteConfirmText !== "ELIMINAR") {
      alert("Por favor escribe 'ELIMINAR' para confirmar la desactivación.");
      return;
    }
    setIsDeleting(true);
    try {
      await onDeleteAccount();
    } catch (err) {
      alert("Fallo al eliminar cuenta. Vuelva a intentarlo.");
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  const tabs = [
    { id: "general" as const, label: "General", icon: Sliders },
    { id: "api" as const, label: "API Configuration", icon: Key },
    { id: "integrations" as const, label: "Integrations", icon: Cpu },
    { id: "security" as const, label: "Security & Account", icon: ShieldAlert },
  ];

  return (
    <div className="max-w-4xl bg-white border border-slate-100 rounded-3xl shadow-xl shadow-slate-200/40 p-1 sm:p-2 select-none font-sans flex flex-col md:flex-row min-h-[480px]">
      
      {/* Settings Navigation sidebar */}
      <div className="w-full md:w-56 p-4 border-r border-[#EBEBEB] flex flex-row md:flex-col gap-1 overflow-x-auto shrink-0 select-none">
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-2.5 px-4 py-3 text-xs font-bold rounded-xl transition-all cursor-pointer text-left shrink-0 md:w-full ${
                isActive
                  ? "bg-[#135bf1]/8 text-[#135bf1]"
                  : "text-slate-500 hover:text-slate-800 hover:bg-[#F4F4F5]"
              }`}
            >
              <TabIcon className={`w-4 h-4 shrink-0 ${isActive ? "text-[#135bf1]" : "text-slate-400"}`} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Settings Content Frame */}
      <div className="flex-grow p-6 sm:p-8">
        
        <AnimatePresence>
          {showStatus && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-xs font-semibold text-emerald-700 flex items-center space-x-2"
            >
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>¡Configuraciones guardadas y sincronizadas con éxito!</span>
            </motion.div>
          )}
        </AnimatePresence>

        <form onSubmit={handleSubmit} className="space-y-6 text-left">
          
          {/* TAB 1: GENERAL */}
          {activeSubTab === "general" && (
            <motion.div
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-800">Parámetros Generales</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Configure la persistencia local de Olli y rutas de guardado.</p>
              </div>

              {/* Save folder settings */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Ruta del Directorio de Minutas
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <FolderMinus className="w-4 h-4" />
                  </span>
                  <input
                    type="text"
                    value={audioFolder}
                    onChange={(e) => setAudioFolder(e.target.value)}
                    placeholder="/MeetingBrain/Notes/"
                    className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white text-xs rounded-xl outline-none focus:border-[#135bf1] transition-all text-slate-800"
                    required
                  />
                </div>
                <span className="text-[10px] text-slate-400 block leading-relaxed pl-1">
                  Establece el nombre del directorio virtual con el que se guardarán las notas Markdown exportables en el navegador.
                </span>
              </div>

              {/* Cache purge toggle */}
              <div className="p-4 bg-slate-50 border border-[#F2F2F2] rounded-2xl flex items-center justify-between">
                <div className="max-w-md pr-4">
                  <span className="text-xs font-bold text-slate-700 block">
                    Auto-eliminar grabaciones de audio pesadas
                  </span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 leading-relaxed">
                    Al activarse, la boveda de Olli limpiará automáticamente los datos base64 del audio para liberar espacio en disco una vez que las transcripciones y actas estén listas.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setAutoDeleteAudio(!autoDeleteAudio)}
                  className={`w-10 h-6 shrink-0 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                    autoDeleteAudio ? "bg-[#135bf1]" : "bg-slate-200"
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full transition-transform shadow-xs ${
                      autoDeleteAudio ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>

              {/* Bypass size limits */}
              <div className="p-4 bg-amber-50/20 border border-amber-100 rounded-2xl flex items-center justify-between">
                <div className="max-w-md pr-4">
                  <span className="text-xs font-bold text-amber-900 block">
                    Desactivar límites de tamaño ( VPS / Local )
                  </span>
                  <span className="text-[10px] text-slate-500 block mt-0.5 leading-relaxed">
                    Si te encuentras libre del entorno Serverless tradicional, activa este bypass para omitir filtros de carga restrictivos y poder transcribir audios de hasta 100 MB de tamaño.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBypassSizeLimit(!bypassSizeLimit)}
                  className={`w-10 h-6 shrink-0 rounded-full transition-colors flex items-center p-0.5 cursor-pointer ${
                    bypassSizeLimit ? "bg-amber-600" : "bg-slate-200"
                  }`}
                >
                  <div
                    className={`bg-white w-5 h-5 rounded-full transition-transform shadow-xs ${
                      bypassSizeLimit ? "translate-x-4" : "translate-x-0"
                    }`}
                  />
                </button>
              </div>
            </motion.div>
          )}

          {/* TAB 2: API CONFIGURATION */}
          {activeSubTab === "api" && (
            <motion.div
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-800">Inyección de Credenciales</h3>
                <p className="text-[11px] text-slate-400 mt-0.5 font-medium">Configure sus tokens privados para la ejecución de transcripción y resúmenes de IA.</p>
              </div>

              {/* AI Engine Choice */}
              <div className="space-y-2">
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Motor de IA Seleccionado
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setAiProvider("gemini")}
                    className={`p-4 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between text-left ${
                      aiProvider === "gemini"
                        ? "border-[#135bf1] bg-[#135bf1]/5"
                        : "border-slate-200 hover:bg-slate-55 bg-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 block">Google Gemini (Oficial)</span>
                      <input
                        type="radio"
                        checked={aiProvider === "gemini"}
                        onChange={() => setAiProvider("gemini")}
                        className="accent-[#135bf1]"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                      Llamadas directas de baja latencia con el modelo estable <strong className="text-slate-600">gemini-3.5-flash</strong>.
                    </span>
                  </div>

                  <div
                    onClick={() => setAiProvider("custom_openai")}
                    className={`p-4 border rounded-2xl cursor-pointer transition-all flex flex-col justify-between text-left ${
                      aiProvider === "custom_openai"
                        ? "border-[#135bf1] bg-[#135bf1]/5"
                        : "border-slate-200 hover:bg-slate-55 bg-transparent"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 block">Proxy OpenAI / Personalizado</span>
                      <input
                        type="radio"
                        checked={aiProvider === "custom_openai"}
                        onChange={() => setAiProvider("custom_openai")}
                        className="accent-[#135bf1]"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-2 block leading-relaxed">
                      Suministre respuestas alternativas usando endpoints u otros procesadores webhooks de OpenAI.
                    </span>
                  </div>
                </div>
              </div>

              {/* Stored API Key override */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider leading-none">
                    Secret API Key Credentials
                  </label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[#135bf1] hover:underline font-bold flex items-center gap-1 leading-none"
                  >
                    ¿Obtener Gemini API Key?
                    <Sparkles className="w-3 h-3" />
                  </a>
                </div>
                
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                    <Key className="w-4 h-4" />
                  </span>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={settings.hasApiKey ? "Clave guardada en SQLite. Escribe una nueva solo si deseas reemplazarla." : "Por favor, ingresa tu API Key"}
                    className="w-full pl-11 pr-11 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white text-xs font-mono rounded-xl outline-none focus:border-[#135bf1] transition-all text-slate-800"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>

                {/* Secure warning callout banner */}
                <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start space-x-2.5 text-[10px] text-indigo-900 leading-relaxed font-semibold">
                  <Lock className="w-4 h-4 text-[#135bf1] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-indigo-950">Privacidad Incorporada: </span>
                    Tu <code className="bg-slate-200/50 px-1 rounded font-mono text-[#135bf1] text-[9.5px]">API_KEY</code> se guarda localmente en SQLite dentro de este equipo y queda vinculada a tu usuario local. No se sincroniza con Firebase, Google ni Vercel.
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 3: INTEGRATIONS */}
          {activeSubTab === "integrations" && (
            <motion.div
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-800">Conexiones e Integraciones</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Sincronice el motor inteligente de actas con sus herramientas del día a día.</p>
              </div>

              <div className="space-y-3.5">
                {/* General markdown card */}
                <div className="p-4 bg-white border border-[#E9E9EB] rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center text-slate-700 shadow-2xs shrink-0">
                      <Database className="w-5 h-5 text-[#135bf1]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Exportación Autónoma de Notas</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Permite descargar actas y transcripciones en archivos Markdown (.md) estándar</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-100 text-emerald-600 text-[10px] font-bold rounded-lg uppercase">
                    Disponible
                  </span>
                </div>

                {/* Email PDFs auto delivery */}
                <div className="p-4 bg-white border border-[#E9E9EB] rounded-2xl flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-500 shadow-2xs shrink-0">
                      <MessageSquare className="w-5 h-5 text-[#135bf1]" />
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-755 block">Despacho Automático de Reportes (E-Mail)</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Permite enviar actas ejecutivas estructuradas firmadas en PDF y texto</p>
                    </div>
                  </div>
                  <span className="px-2.5 py-1 bg-[#135bf1]/5 border border-[#135bf1]/15 text-[#135bf1] text-[10px] font-bold rounded-lg uppercase">
                    Configurado
                  </span>
                </div>
              </div>
            </motion.div>
          )}

          {/* TAB 4: SECURITY & ACCOUNT (DANGER ZONE) */}
          {activeSubTab === "security" && (
            <motion.div
              initial={{ opacity: 0, x: 5 }}
              animate={{ opacity: 1, x: 0 }}
              className="space-y-6"
            >
              <div>
                <h3 className="text-sm font-bold text-slate-800">Zona de Peligro / Protección de Datos</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">Administra la permanencia de tu cuenta y elimina la información en cualquier momento de forma definitiva.</p>
              </div>

              {/* Danger Box */}
              <div className="p-5 border border-red-200/60 bg-red-50/20 rounded-2xl">
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-100 text-red-650 flex items-center justify-center shrink-0">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-800 uppercase">Eliminación Definitiva de Cuenta y API</h4>
                    <p className="text-[10.5px] text-slate-500 leading-relaxed mt-1">
                      Al proceder con esta acción, nuestro sistema ejecutará una limpieza de nivel corporativo para proteger tu privacidad:
                    </p>
                    <ul className="list-disc pl-4 mt-2 space-y-1 text-[10px] text-slate-450 text-left font-medium">
                      <li>Se purgarán todas tus transcripciones e historiales guardados en SQLite local.</li>
                      <li>Se eliminará tu clave <code className="bg-slate-205 py-0.5 px-1 rounded font-mono">API_KEY</code> de la base local.</li>
                      <li>Se limpiará la sesión local, reuniones, configuración y códigos de recuperación.</li>
                      <li>La acción es instantánea, definitiva y no tiene marcha atrás.</li>
                    </ul>

                    <div className="mt-4">
                      <button
                        type="button"
                        onClick={() => setShowDeleteConfirm(true)}
                        className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold shadow-md shadow-red-100 transition-all cursor-pointer inline-flex items-center gap-1.5 active:scale-95"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Eliminar Mi Cuenta de Olli</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Settings Actions submit bar */}
          {activeSubTab !== "security" && activeSubTab !== "integrations" && (
            <div className="pt-4 border-t border-[#F2F2F2] flex justify-end">
              <button
                type="submit"
                className="px-6 py-2.5 bg-[#135bf1] hover:bg-[#0746cc] text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-100 transition-colors cursor-pointer flex items-center space-x-1.5"
              >
                <Save className="w-3.5 h-3.5" />
                <span>Save Configurations</span>
              </button>
            </div>
          )}

        </form>

      </div>

      {/* DELETE ACCOUNT CONFIRMATION MODAL */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isDeleting) setShowDeleteConfirm(false);
              }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white rounded-3xl w-full max-w-md p-6 relative z-10 shadow-2xl border border-red-100 text-left"
            >
              <div className="flex items-center gap-3 pb-3 border-b border-slate-100 mb-4">
                <div className="w-10 h-10 rounded-2xl bg-red-50 text-red-650 flex items-center justify-center shrink-0">
                  <ShieldAlert className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wide leading-none">Confirmar Desactivación de Cuenta</h3>
                  <p className="text-[10px] text-slate-400 mt-1">Medida para prevenir accidentes del servidor</p>
                </div>
              </div>

              <div className="space-y-3.5">
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Para confirmar que deseas borrar de manera permanente tus API Keys guardadas, transcripciones, audios e historial de usuario, escribe <strong className="text-red-700">ELIMINAR</strong> a continuación:
                </p>

                <input
                  type="text"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  placeholder="Escribe ELIMINAR"
                  disabled={isDeleting}
                  className="w-full px-4 text-xs py-2.5 bg-red-50/40 border border-red-200 rounded-xl focus:outline-none focus:bg-white text-slate-800 font-bold uppercase tracking-widest placeholder-red-300"
                />
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-50">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => {
                    setDeleteConfirmText("");
                    setShowDeleteConfirm(false);
                  }}
                  className="px-4 py-2 border border-slate-200 text-slate-500 hover:bg-slate-55 rounded-xl text-xs font-bold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting || deleteConfirmText !== "ELIMINAR"}
                  onClick={handleDeleteTrigger}
                  className="px-5 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-md shadow-red-100"
                >
                  {isDeleting ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Limpiando Bóveda...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                      <span>Desactivar y Borrar todo</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}

