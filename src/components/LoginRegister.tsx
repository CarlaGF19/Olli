/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User } from "../types";
import { loginLocalAccount, registerLocalAccount, resetLocalPassword } from "../lib/db";
import { motion, AnimatePresence } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle,
  FileText,
  KeyRound,
  Lock,
  Mail,
  Mic,
  ShieldCheck,
  Sparkles,
  UserRound,
} from "lucide-react";

type Mode = "login" | "register" | "reset";

interface LoginRegisterProps {
  onLoginSuccess: (user: User, isNewUser?: boolean) => void;
}

export default function LoginRegister({ onLoginSuccess }: LoginRegisterProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pendingUser, setPendingUser] = useState<User | null>(null);
  const [newRecoveryCode, setNewRecoveryCode] = useState("");

  const resetMessages = () => {
    setError("");
    setNewRecoveryCode("");
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    try {
      const result = await loginLocalAccount(identifier.trim(), loginPassword);
      onLoginSuccess(result.user, false);
    } catch (err: any) {
      setError(err.message || "No se pudo iniciar sesion.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (password !== confirmPassword) {
      setError("Las contrasenas no coinciden.");
      return;
    }
    setIsLoading(true);
    try {
      const result = await registerLocalAccount(username.trim(), email.trim(), password);
      setPendingUser(result.user);
      setNewRecoveryCode(result.recoveryCode);
    } catch (err: any) {
      setError(err.message || "No se pudo crear la cuenta.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setIsLoading(true);
    try {
      const result = await resetLocalPassword(identifier.trim(), recoveryCode.trim(), newPassword);
      setNewRecoveryCode(result.newRecoveryCode);
      setLoginPassword("");
      setPassword("");
      setConfirmPassword("");
      setNewPassword("");
    } catch (err: any) {
      setError(err.message || "No se pudo restablecer la contrasena.");
    } finally {
      setIsLoading(false);
    }
  };

  const finishRegistration = () => {
    if (pendingUser) onLoginSuccess(pendingUser, true);
  };

  const tabs = [
    { id: "login" as const, label: "Iniciar sesion" },
    { id: "register" as const, label: "Crear cuenta" },
  ];

  return (
    <div className="min-h-screen w-screen bg-[#07111f] flex items-center justify-center select-none font-sans relative overflow-y-auto p-3 sm:p-5">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_18%_15%,rgba(19,91,241,0.22),transparent_30%),radial-gradient(circle_at_88%_78%,rgba(20,184,166,0.14),transparent_30%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.45 }}
        className="w-full max-w-6xl mx-auto bg-white/[0.035] backdrop-blur-xl border border-white/10 rounded-3xl overflow-hidden grid grid-cols-1 lg:grid-cols-12 relative z-10 shadow-[0_24px_80px_rgba(0,0,0,0.34)]"
      >
        <div className="lg:col-span-7 p-6 sm:p-8 lg:p-10 flex flex-col justify-center min-h-[520px]">
          <div className="flex items-center gap-2.5 text-left mb-7">
            <div className="flex items-center justify-center gap-1 shrink-0 bg-white/5 px-3 py-2 rounded-xl border border-white/10">
              <span className="w-1 h-5 rounded-full bg-[#135bf1]" />
              <span className="w-1 h-3.5 rounded-full bg-cyan-400" />
              <span className="w-1 h-4.5 rounded-full bg-teal-400" />
            </div>
            <span className="font-display font-black text-2xl tracking-tighter text-white">
              Olli<span className="text-cyan-300 ml-[1px]">.</span>
            </span>
          </div>

          <div className="max-w-xl w-full text-left">
            <h1 className="font-display text-[34px] sm:text-[46px] lg:text-[50px] font-black text-white tracking-tight leading-[1.03]">
              Transcribe y organiza <br />
              tus clases en local <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-blue-300 to-teal-300">
                con tu propia cuenta.
              </span>
            </h1>
            <p className="font-sans text-sm sm:text-base text-slate-300 mt-4 leading-relaxed max-w-lg">
              Usuarios, reuniones, carpetas y configuracion viven en SQLite dentro de tu equipo. Gemini solo se usa cuando decides generar resumenes o respuestas inteligentes.
            </p>

            <div className="grid grid-cols-2 gap-3 mt-7 max-w-lg">
              {[
                { icon: Mic, title: "Captura local", text: "Microfono o audio digital." },
                { icon: FileText, title: "Actas privadas", text: "Todo queda en SQLite." },
                { icon: Bot, title: "IA opcional", text: "Solo cuando la activas." },
                { icon: ShieldCheck, title: "Sin nube obligatoria", text: "Sin Firebase ni Vercel." },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.title} className="p-3.5 bg-white/[0.045] rounded-2xl border border-white/8">
                    <div className="w-8 h-8 rounded-xl bg-cyan-400/10 border border-cyan-300/15 flex items-center justify-center text-cyan-300 mb-2">
                      <Icon className="w-4 h-4" />
                    </div>
                    <h3 className="font-display text-[13px] font-semibold text-white">{item.title}</h3>
                    <p className="font-sans text-[11px] text-slate-400 mt-0.5 leading-normal">{item.text}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="lg:col-span-5 p-4 sm:p-7 lg:p-10 flex flex-col justify-center items-stretch bg-white/[0.025] relative">
          <div className="my-auto max-w-sm mx-auto w-full">
            <div className="bg-white rounded-3xl border border-white/40 p-6 sm:p-7 shadow-[0_20px_50px_rgba(0,0,0,0.22)] text-left relative overflow-hidden">
              <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#135bf1] via-cyan-400 to-teal-300" />

              {pendingUser && newRecoveryCode ? (
                <div className="space-y-5">
                  <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <CheckCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-black text-slate-900 tracking-tight">Cuenta creada</h2>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Guarda este codigo. Lo necesitaras si olvidas tu contrasena. Por seguridad solo se muestra una vez.
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-slate-950 text-white font-mono text-center text-lg tracking-widest border border-slate-800">
                    {newRecoveryCode}
                  </div>
                  <button
                    type="button"
                    onClick={finishRegistration}
                    className="w-full h-11 rounded-xl bg-[#135bf1] hover:bg-[#0746cc] text-white text-sm font-bold flex items-center justify-center gap-2"
                  >
                    Continuar
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-2xl font-black text-slate-900 tracking-tight">
                    Acceso local
                  </h2>
                  <p className="font-sans text-xs text-slate-500 mt-2 leading-relaxed">
                    Entra con usuario o correo. Tu boveda se abre desde esta maquina.
                  </p>

                  <div className="grid grid-cols-2 gap-1 bg-slate-100 rounded-xl p-1 mt-6">
                    {tabs.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setMode(tab.id);
                          resetMessages();
                        }}
                        className={`py-2 rounded-lg text-xs font-bold transition-all ${
                          mode === tab.id ? "bg-white text-[#135bf1] shadow-sm" : "text-slate-500"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  <AnimatePresence mode="wait">
                    {mode === "login" && (
                      <motion.form
                        key="login"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        onSubmit={handleLogin}
                        className="mt-6 space-y-3"
                      >
                        <Field icon={UserRound} value={identifier} onChange={setIdentifier} placeholder="Usuario o correo" />
                        <Field icon={Lock} value={loginPassword} onChange={setLoginPassword} placeholder="Contrasena" type="password" />
                        <button
                          type="button"
                          onClick={() => {
                            setMode("reset");
                            resetMessages();
                          }}
                          className="text-[11px] font-bold text-[#135bf1] hover:underline"
                        >
                          Olvide mi contrasena
                        </button>
                        <SubmitButton isLoading={isLoading} label="Iniciar sesion" />
                      </motion.form>
                    )}

                    {mode === "register" && (
                      <motion.form
                        key="register"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        onSubmit={handleRegister}
                        className="mt-6 space-y-3"
                      >
                        <Field icon={UserRound} value={username} onChange={setUsername} placeholder="Usuario" />
                        <Field icon={Mail} value={email} onChange={setEmail} placeholder="Correo" type="email" />
                        <Field icon={Lock} value={password} onChange={setPassword} placeholder="Contrasena minima 8 caracteres" type="password" />
                        <Field icon={Lock} value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirmar contrasena" type="password" />
                        <SubmitButton isLoading={isLoading} label="Crear cuenta local" />
                      </motion.form>
                    )}

                    {mode === "reset" && (
                      <motion.form
                        key="reset"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        onSubmit={handleResetPassword}
                        className="mt-6 space-y-3"
                      >
                        <Field icon={UserRound} value={identifier} onChange={setIdentifier} placeholder="Usuario o correo" />
                        <Field icon={KeyRound} value={recoveryCode} onChange={setRecoveryCode} placeholder="Codigo de recuperacion MB-..." />
                        <Field icon={Lock} value={newPassword} onChange={setNewPassword} placeholder="Nueva contrasena" type="password" />
                        <SubmitButton isLoading={isLoading} label="Restablecer contrasena" />
                        <button
                          type="button"
                          onClick={() => {
                            setMode("login");
                            resetMessages();
                          }}
                          className="text-[11px] font-bold text-slate-500 hover:text-slate-800"
                        >
                          Volver al login
                        </button>
                      </motion.form>
                    )}
                  </AnimatePresence>

                  <div className="min-h-[44px] mt-4">
                    {error && (
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3 text-[11px] font-semibold text-rose-700 flex gap-2">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        <span>{error}</span>
                      </div>
                    )}
                    {!error && mode === "reset" && newRecoveryCode && (
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3 text-[11px] font-semibold text-emerald-800">
                        Contrasena actualizada. Tu nuevo codigo de recuperacion es:
                        <div className="font-mono text-center text-sm mt-2">{newRecoveryCode}</div>
                      </div>
                    )}
                    {!error && !(mode === "reset" && newRecoveryCode) && (
                      <div className="text-[10px] text-slate-400 leading-relaxed flex gap-2">
                        <Sparkles className="w-3.5 h-3.5 shrink-0 text-[#135bf1]" />
                        <span>La base vive localmente en SQLite. No se suben cuentas ni reuniones a GitHub.</span>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function Field({
  icon: Icon,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  icon: React.ElementType;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  type?: string;
}) {
  return (
    <label className="relative block">
      <Icon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        required
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-11 rounded-xl bg-slate-50 border border-slate-200 pl-10 pr-3 text-sm font-medium text-slate-800 outline-none focus:border-[#135bf1] focus:bg-white transition-all"
      />
    </label>
  );
}

function SubmitButton({ isLoading, label }: { isLoading: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="w-full h-11 rounded-xl bg-[#135bf1] hover:bg-[#0746cc] text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-70"
    >
      {isLoading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : label}
      {!isLoading && <ArrowRight className="w-4 h-4" />}
    </button>
  );
}
