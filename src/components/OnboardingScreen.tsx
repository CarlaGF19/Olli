/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User, AppSettings } from "../types";
import { motion } from "motion/react";
import { Key, UserCheck, ShieldAlert, Sparkles, LogOut, Mail, Lock } from "lucide-react";

interface OnboardingScreenProps {
  user: User;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onLogout: () => void;
  showSkip?: boolean;
  onSkip?: () => void;
}

export default function OnboardingScreen({ user, onSaveApiKey, onLogout, showSkip, onSkip }: OnboardingScreenProps) {
  const [apiKey, setApiKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!apiKey.trim()) {
      setError("La API Key de Gemini es obligatoria para activar tu espacio.");
      return;
    }

    if (!apiKey.trim().startsWith("AIzaSy")) {
      setError("Formato de API Key de Gemini inválido. Debe comenzar con 'AIzaSy'. Revisa y vuelve a intentarlo.");
      return;
    }

    setIsSubmitting(true);
    try {
      await onSaveApiKey(apiKey.trim());
    } catch (err: any) {
      setError(err.message || "Fallo al guardar la configuración en la base de datos segura.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Extract first name and last name dynamically
  const names = user.displayName ? user.displayName.split(" ") : ["Usuario", "Brain"];
  const firstName = names[0] || "Usuario";
  const lastName = names.slice(1).join(" ") || "Brain";

  return (
    <div className="min-h-screen w-full bg-[#FAF9F5] flex items-center justify-center p-4 sm:p-10 select-none font-sans relative overflow-hidden">
      {/* Glow Effects */}
      <div className="absolute top-[-80px] left-[-80px] w-96 h-96 bg-[#135bf1]/5 rounded-full filter blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-100px] right-[-80px] w-96 h-96 bg-amber-500/5 rounded-full filter blur-[120px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", duration: 0.6 }}
        className="w-full max-w-xl bg-white border border-[#E9E9EB] rounded-3xl shadow-[0_20px_50px_-12px_rgba(19,91,241,0.06)] overflow-hidden p-8 sm:p-10 relative z-10 text-left"
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-8">
          <div className="flex items-center justify-center gap-0.5">
            <span className="w-2.5 h-6 rounded-full bg-[#135bf1]" />
            <span className="w-2.5 h-4 rounded-full bg-[#135bf1]/60" />
            <span className="w-2.5 h-5 rounded-full bg-[#135bf1]/80" />
          </div>
          <span className="font-bold text-xl tracking-tighter text-[#111111] font-sans">
            olli<span className="text-[#135bf1] ml-[1px]">.</span>
          </span>
          <span className="ml-[10px] px-2 py-0.5 border border-[#135bf1]/15 bg-[#135bf1]/5 text-[#135bf1] text-[9px] font-bold rounded-md uppercase tracking-wider">
            First Setup
          </span>
        </div>

        <div className="mb-6">
          <h1 className="text-xl font-black text-slate-935 tracking-tight">
            ¡Hola, {firstName}! Configura tu Espacio Olli
          </h1>
          <p className="text-xs text-slate-500 mt-1 lines-relaxed">
            Como medida de seguridad absoluta, tu cuenta no contiene API Keys por defecto. Debes ingresar tus credenciales para activar la transcripción inteligente en tiempo real.
          </p>
        </div>

        {/* Section 1: Collected Google Account Info */}
        <div className="mb-6 p-4 bg-[#FAF9F6] border border-[#E9E9EB] rounded-2xl">
          <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <UserCheck className="w-4 h-4 text-[#135bf1]" />
            Datos Recopilados de tu Cuenta Google
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Nombres</span>
              <span className="text-xs font-semibold text-slate-800">{firstName}</span>
            </div>
            <div>
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Apellidos</span>
              <span className="text-xs font-semibold text-slate-800">{lastName}</span>
            </div>
            <div className="col-span-2 pt-2 border-t border-[#F2F2F2]">
              <span className="block text-[10px] text-slate-400 font-bold uppercase tracking-wider">Correo Electrónico</span>
              <span className="text-xs font-semibold text-slate-800 flex items-center gap-1.5 mt-0.5">
                <Mail className="w-3.5 h-3.5 text-slate-400" />
                {user.email}
              </span>
            </div>
          </div>
        </div>

        {/* Section 2: Key Credentials Input Wrapper Form */}
        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="block text-[11px] font-bold text-slate-600 uppercase tracking-wider leading-none">
                Google Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-[#135bf1] hover:underline font-bold flex items-center gap-1 leading-none"
              >
                ¿Obtener clave gratis?
                <Sparkles className="w-3 h-3 text-[#135bf1]" />
              </a>
            </div>

            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                <Key className="w-4 h-4" />
              </span>
              <input
                type="password"
                required
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="AIzaSy..."
                className="w-full pl-11 pr-4 py-3 bg-slate-50 border border-slate-200 focus:bg-white text-xs rounded-xl outline-none focus:border-[#135bf1] transition-all text-slate-800 placeholder-slate-400"
              />
            </div>
          </div>

          {/* Privacy Protection Callout banner */}
          <div className="p-3.5 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start space-x-3 text-[10.5px] text-indigo-900 leading-relaxed">
            <Lock className="w-4 h-4 text-[#135bf1] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-indigo-950">Medida de Seguridad Estricta:</span>
              <p className="mt-0.5 text-indigo-800/90 leading-normal">
                Esta clave se encriptará localmente y se guardará únicamente dentro de tu cuenta personal en el Firestore seguro. Ninguna otra cuenta ni usuario de la plataforma compartirá o tendrá acceso a ella.
              </p>
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3 bg-red-50 border border-red-100 rounded-xl text-left flex items-start space-x-2 text-[11px] text-red-700"
            >
              <ShieldAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="font-medium leading-normal">{error}</p>
            </motion.div>
          )}

          <div className="pt-4 border-t border-[#F2F2F2] flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={onLogout}
              className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-bold transition-all flex items-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Salir</span>
            </button>

            <div className="flex items-center gap-2">
              {showSkip && onSkip && (
                <button
                  type="button"
                  onClick={onSkip}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 hover:border-slate-300 text-slate-600 text-xs font-bold transition-all cursor-pointer"
                >
                  Omitir / Skip
                </button>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-2.5 bg-[#135bf1] hover:bg-[#0746cc] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-md shadow-indigo-100 active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <svg className="animate-spin h-4.5 w-4.5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    <span>Verificando y Guardando...</span>
                  </>
                ) : (
                  <>
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Activar mi Cuenta</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}
