/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { User } from "../types";
import { Brain, Lock, Mail, User as UserIcon, LogIn, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { auth } from "../lib/firebase";
import { signInWithPopup, GoogleAuthProvider } from "firebase/auth";

interface LoginRegisterProps {
  onLoginSuccess: (user: User) => void;
}

export default function LoginRegister({ onLoginSuccess }: LoginRegisterProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleAuthSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError("Please fill in all layout credentials.");
      return;
    }
    if (isRegister && !name) {
      setError("Please provide your full display name.");
      return;
    }

    setIsLoading(true);
    // Simulate real local database account processing with delightful feedback
    setTimeout(() => {
      setIsLoading(false);
      onLoginSuccess({
        uid: "local_" + email.replace(/[^a-zA-Z0-9]/g, "_"),
        email,
        displayName: isRegister ? name : email.split("@")[0].toUpperCase(),
      });
    }, 1200);
  };

  const handleGoogleOAuth = async () => {
    setIsLoading(true);
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: "select_account" });
      const result = await signInWithPopup(auth, provider);
      const firebaseUser = result.user;
      
      onLoginSuccess({
        uid: firebaseUser.uid,
        email: firebaseUser.email || "username45usario@gmail.com",
        displayName: firebaseUser.displayName || "Usuario Brain",
        photoURL: firebaseUser.photoURL || undefined,
      });
    } catch (err: any) {
      console.error("Firebase Google Auth failed:", err);
      setError(err.message || "Failed to authenticate Google credentials.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="login_container" className="min-h-screen flex items-center justify-center bg-slate-50/70 p-4 relative overflow-hidden font-sans">
      {/* Decorative calm blobs */}
      <div className="absolute top-0 left-0 w-80 h-80 bg-[#C4E2F5] rounded-full filter blur-[100px] opacity-25 -translate-x-1/2 -translate-y-1/2" />
      <div className="absolute bottom-0 right-0 w-96 h-96 bg-[#4BB8FA] rounded-full filter blur-[120px] opacity-20 translate-x-1/3 translate-y-1/3" />

      <motion.div 
        id="login_card"
        initial={{ opacity: 0, y: 15 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-full max-w-md bg-white border border-slate-100 rounded-2xl shadow-[0_10px_40px_-15px_rgba(44,94,173,0.1)] p-8 max-md:p-6 z-10"
      >
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-[#2C5EAD] flex items-center justify-center mb-4 text-white shadow-lg shadow-[#2C5EAD]/20">
            <Brain className="w-6 h-6 animate-pulse" />
          </div>
          <h1 id="app_name" className="text-2xl font-bold bg-gradient-to-r from-[#2C5EAD] to-[#1591DC] bg-clip-text text-transparent">
            MeetingBrain
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Where meetings are structured, visual, and stored safely.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-lg text-xs font-medium text-red-600 flex items-center">
            <span className="mr-2">⚠️</span> {error}
          </div>
        )}

        <form onSubmit={handleAuthSubmit} className="space-y-4">
          {isRegister && (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </span>
                <input
                  type="text"
                  placeholder="e.g. Alexis Jordan"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-50/50 focus:bg-white text-sm border border-slate-200 focus:border-[#2C5EAD] focus:ring-1 focus:ring-[#2C5EAD] outline-none rounded-xl transition-all"
                  required
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
              Work Email
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Mail className="w-4 h-4" />
              </span>
              <input
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-50/50 focus:bg-white text-sm border border-slate-200 focus:border-[#2C5EAD] focus:ring-1 focus:ring-[#2C5EAD] outline-none rounded-xl transition-all"
                required
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                Password
              </label>
              {!isRegister && (
                <a href="#" className="text-xs text-[#2C5EAD] font-medium hover:underline">
                  Forgot?
                </a>
              )}
            </div>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
                <Lock className="w-4 h-4" />
              </span>
              <input
                type="password"
                placeholder="• • • • • • • •"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-50 hover:bg-slate-50/50 focus:bg-white text-sm border border-slate-200 focus:border-[#2C5EAD] focus:ring-1 focus:ring-[#2C5EAD] outline-none rounded-xl transition-all"
                required
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-[#2C5EAD] hover:bg-[#1591DC] text-white py-2.5 px-4 rounded-xl text-sm font-semibold shadow-md shadow-[#2C5EAD]/10 hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-75"
          >
            {isLoading ? (
              <span className="border-2 border-white/30 border-t-white rounded-full w-4 h-4 animate-spin" />
            ) : (
              <>
                <LogIn className="w-4 h-4" />
                <span>{isRegister ? "Create Account" : "Sign In with Credentials"}</span>
              </>
            )}
          </button>
        </form>

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-100" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-3 text-slate-400 font-medium">Or continue with</span>
          </div>
        </div>

        <button
          onClick={handleGoogleOAuth}
          disabled={isLoading}
          className="w-full border border-slate-200 hover:bg-slate-50 text-slate-700 py-2.5 px-4 rounded-xl text-sm font-medium transition-all flex items-center justify-center space-x-2.5 cursor-pointer disabled:opacity-75"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#EA4335"
              d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.14-5.136 4.14-3.41 0-6.173-2.784-6.173-6.225s2.763-6.226 6.173-6.226c1.55 0 2.96.568 4.05 1.503l3.056-3.055C19.123 2.115 15.935 1 12.24 1 6.13 1 1.135 6 1.135 12.16s4.996 11.16 11.105 11.16c6.07 0 10.99-4.8 10.99-11.16 0-.6-.051-1.2-.162-1.875H12.24zm0 0"
            />
          </svg>
          <span className="font-medium text-slate-700">Authorize Google Single Sign-On</span>
        </button>

        <div className="text-center mt-6 text-xs text-slate-400">
          {isRegister ? "Already have a brain account?" : "New to meeting spaces?"}{" "}
          <button
            onClick={() => setIsRegister(!isRegister)}
            className="text-[#2C5EAD] font-semibold hover:underline bg-transparent border-none p-0 cursor-pointer"
          >
            {isRegister ? "Sign In" : "Register Workspace"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
