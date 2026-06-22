/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from "react";
import { AppNotification, User } from "../types";
import {
  Home,
  MessageSquare,
  Compass,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Bell,
  X,
  LogOut,
  FolderHeart,
  Settings,
  BookOpen,
} from "lucide-react";

interface SidebarProps {
  user: User;
  activeTab: "dashboard" | "recorder" | "meetings" | "library" | "settings";
  setActiveTab: (tab: "dashboard" | "recorder" | "meetings" | "library" | "settings") => void;
  onLogout: () => void;
  favoritesCount: number;
  notifications: AppNotification[];
  isCollapsed: boolean;
  setIsCollapsed: (collapsed: boolean) => void;
}

export default function Sidebar({
  user,
  activeTab,
  setActiveTab,
  onLogout,
  favoritesCount,
  notifications,
  isCollapsed,
  setIsCollapsed,
}: SidebarProps) {
  const displayName = user.displayName || "Usuario Olli";
  const userEmail = user.email || "cuenta local";

  const [showNotifications, setShowNotifications] = useState(false);
  const [seenNotificationSignature, setSeenNotificationSignature] = useState("");
  const dismissedStorageKey = `olli_dismissed_notifications_${user.uid}`;
  const [dismissedNotificationIds, setDismissedNotificationIds] = useState<string[]>(() => readDismissedNotifications(dismissedStorageKey));
  const visibleNotifications = useMemo(
    () => notifications.filter((notification) => !dismissedNotificationIds.includes(notification.id)),
    [dismissedNotificationIds, notifications],
  );
  const unreadCount = visibleNotifications.filter((notification) => notification.unread).length;
  const notificationSignature = visibleNotifications
    .map((notification) => `${notification.id}:${notification.title}:${notification.description}`)
    .join("|");
  const hasUnread = Boolean(notificationSignature) && notificationSignature !== seenNotificationSignature && unreadCount > 0;

  const toggleNotifications = () => {
    const nextState = !showNotifications;
    setShowNotifications(nextState);
    if (nextState) {
      setSeenNotificationSignature(notificationSignature);
    }
  };

  const dismissNotification = (notificationId: string) => {
    const nextDismissed = Array.from(new Set([...dismissedNotificationIds, notificationId]));
    setDismissedNotificationIds(nextDismissed);
    writeDismissedNotifications(dismissedStorageKey, nextDismissed);
  };

  const clearVisibleNotifications = () => {
    const nextDismissed = Array.from(new Set([...dismissedNotificationIds, ...visibleNotifications.map((notification) => notification.id)]));
    setDismissedNotificationIds(nextDismissed);
    writeDismissedNotifications(dismissedStorageKey, nextDismissed);
  };

  const navItems = [
    {
      id: "dashboard" as const,
      label: "Dashboard",
      icon: Home,
    },
    {
      id: "recorder" as const,
      label: "Grabar",
      icon: MessageSquare,
    },
    {
      id: "meetings" as const,
      label: "Explore",
      icon: Compass,
    },
    {
      id: "settings" as const,
      label: "Configuracion",
      icon: Settings,
    },
  ];

  return (
    <aside
      id="workspace_sidebar"
      className={`bg-[#FCFCFD] border-r border-[#E9E9EB] flex flex-col justify-between h-screen fixed top-0 left-0 z-20 max-md:hidden select-none font-sans transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-[72px]" : "w-[260px]"
      }`}
    >
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="absolute top-7 -right-3 w-6 h-6 bg-white border border-[#E9E9EB] rounded-full shadow-sm flex items-center justify-center text-slate-400 hover:text-[#135bf1] hover:border-[#135bf1]/20 hover:bg-[#135bf1]/5 transition-all cursor-pointer z-30 focus:outline-none"
        title={isCollapsed ? "Expandir navegacion" : "Contraer navegacion"}
      >
        {isCollapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
      </button>

      {showNotifications && (
        <>
          <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setShowNotifications(false)} />
          <div
            className={`absolute bg-white/95 backdrop-blur-md border border-[#E9E9EB] rounded-2xl shadow-xl z-50 flex flex-col overflow-hidden ${
              isCollapsed
                ? "left-[78px] top-14 w-[340px]"
                : "right-4 top-14 w-[360px]"
            }`}
          >
            <div className="flex items-start justify-between gap-3 p-3.5 border-b border-[#E9E9EB] bg-slate-50/60">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-[#111111] uppercase tracking-wider">Notificaciones</span>
                  {unreadCount > 0 && (
                    <span className="rounded-full bg-[#135bf1]/10 px-2 py-0.5 text-[10px] font-bold text-[#135bf1]">
                      {unreadCount} nueva{unreadCount === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">Estado real de tu espacio local.</p>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {visibleNotifications.length > 0 && (
                  <button
                    type="button"
                    onClick={clearVisibleNotifications}
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold text-slate-500 hover:border-[#135bf1]/25 hover:text-[#135bf1] transition-colors cursor-pointer"
                  >
                    Limpiar
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowNotifications(false)}
                  className="h-7 w-7 rounded-full border border-slate-200 bg-white inline-flex items-center justify-center text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                  title="Cerrar notificaciones"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            <div className="max-h-[360px] overflow-y-auto divide-y divide-slate-100">
              {visibleNotifications.length === 0 ? (
                <div className="p-5 text-left">
                  <p className="text-xs font-semibold text-[#111111]">Sin novedades por ahora</p>
                  <p className="text-[10px] text-slate-500 mt-1 leading-normal">Olli te avisara cuando haya borradores, resumenes pendientes o configuracion importante.</p>
                </div>
              ) : (
                visibleNotifications.map((notification) => (
                  <div key={notification.id} className="group p-3.5 text-left hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`h-2 w-2 rounded-full shrink-0 ${getNotificationDot(notification)}`} />
                          <p className="text-xs font-bold text-[#111111] leading-snug truncate">{notification.title}</p>
                        </div>
                        <p className="text-[10px] text-[#666666] mt-1 leading-normal">{notification.description}</p>
                      </div>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          dismissNotification(notification.id);
                        }}
                        className="h-7 w-7 rounded-full border border-transparent inline-flex items-center justify-center text-slate-300 opacity-0 group-hover:opacity-100 hover:border-slate-200 hover:bg-white hover:text-rose-500 focus:opacity-100 transition-all cursor-pointer shrink-0"
                        title="Eliminar notificacion"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="mt-2 flex items-center gap-2 pl-4">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-semibold text-slate-500">
                        {notification.time}
                      </span>
                      {notification.unread && (
                        <span className="rounded-full bg-[#135bf1]/8 px-2 py-0.5 text-[9px] font-bold text-[#135bf1]">
                          Pendiente
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <div className="flex flex-col flex-grow overflow-y-auto">
        <div className={`pt-5 pb-3 flex flex-col items-center gap-3 ${isCollapsed ? "px-2" : "px-5"}`}>
          <div className="w-full flex items-center justify-between">
            <button
              type="button"
              onClick={() => setActiveTab("dashboard")}
              className={`flex items-center gap-2 cursor-pointer rounded-2xl transition-colors ${
                isCollapsed ? "h-10 w-10 justify-center hover:bg-white hover:shadow-sm" : "px-2 py-1.5 hover:bg-white"
              }`}
              title="Olli"
            >
              {isCollapsed ? (
                <div className="flex items-center justify-center gap-0.5">
                  <span className="w-2 h-5 rounded-full bg-[#135bf1]" />
                  <span className="w-2 h-3.5 rounded-full bg-[#135bf1]/60" />
                  <span className="w-2 h-4.5 rounded-full bg-[#135bf1]/80" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-center gap-0.5">
                    <span className="w-2.5 h-6 rounded-full bg-[#135bf1]" />
                    <span className="w-2.5 h-4 rounded-full bg-[#135bf1]/60" />
                    <span className="w-2.5 h-5 rounded-full bg-[#135bf1]/80" />
                  </div>
                  <span className="font-bold text-[22px] tracking-tight text-[#111111] font-sans flex items-center ml-0.5 select-none">
                    olli<span className="text-[#135bf1] ml-[1px]">.</span>
                  </span>
                </>
              )}
            </button>

            {!isCollapsed && (
              <button
                onClick={toggleNotifications}
                className="h-9 w-9 inline-flex items-center justify-center hover:bg-white hover:shadow-sm rounded-xl text-slate-500 transition-colors relative cursor-pointer"
                title="Notificaciones"
              >
                <Bell className="w-4.5 h-4.5" />
                {hasUnread && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" />}
              </button>
            )}
          </div>

          {isCollapsed && (
            <button
              onClick={toggleNotifications}
              className="h-10 w-10 inline-flex items-center justify-center hover:bg-white hover:shadow-sm rounded-2xl text-slate-500 transition-colors relative cursor-pointer"
              title="Notificaciones"
            >
              <Bell className="w-4.5 h-4.5" />
              {hasUnread && <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-rose-500 ring-2 ring-white" />}
            </button>
          )}
        </div>

        <div className={`${isCollapsed ? "px-2 flex justify-center pb-3" : "px-3 pb-3"}`}>
          {isCollapsed ? (
            <div className="w-10 h-10 rounded-2xl bg-white border border-[#E9E9EB] overflow-hidden flex items-center justify-center text-slate-700 font-semibold text-xs shrink-0 select-none cursor-pointer hover:border-[#135bf1]/25 hover:shadow-sm transition-all" title={displayName}>
              {displayName.slice(0, 2).toUpperCase()}
            </div>
          ) : (
            <div className="p-2.5 rounded-2xl border border-[#E9E9EB] bg-white hover:border-[#135bf1]/20 hover:shadow-sm transition-all flex items-center justify-between cursor-pointer">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-[#135bf1]/6 border border-[#135bf1]/10 overflow-hidden flex items-center justify-center text-slate-700 font-semibold text-xs shrink-0 select-none">
                  {displayName.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-grow min-w-0 text-left">
                  <p className="text-sm font-semibold text-[#111111] truncate leading-tight select-none">{displayName}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 select-none">{userEmail}</p>
                </div>
              </div>
              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-1" />
            </div>
          )}
        </div>

        <nav className={`space-y-1 border-t border-[#EFEFF1] pt-3 ${isCollapsed ? "px-2" : "px-3"}`}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center transition-all cursor-pointer group relative ${
                  isCollapsed ? "justify-center h-10 rounded-2xl" : "gap-3 px-3 py-2.5 rounded-2xl text-left"
                } ${
                  isActive
                    ? "text-[#135bf1] bg-[#135bf1]/8 font-semibold shadow-[inset_0_0_0_1px_rgba(19,91,241,0.08)]"
                    : "text-slate-500 hover:bg-white hover:text-[#111111] hover:shadow-sm"
                }`}
              >
                {isCollapsed && isActive && (
                  <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-[#135bf1]" />
                )}
                <Icon
                  className={`w-[18px] h-[18px] transition-transform group-hover:scale-105 ${
                    isActive ? "text-[#135bf1]" : "text-slate-500"
                  }`}
                />
                {!isCollapsed && <span className="flex-grow text-sm font-medium">{item.label}</span>}
                {!isCollapsed && item.id === "meetings" && favoritesCount > 0 && (
                  <span className="bg-[#135bf1]/10 text-[#135bf1] text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center">
                    <FolderHeart className="w-3 h-3 mr-0.5" />
                    {favoritesCount}
                  </span>
                )}
                {isCollapsed && item.id === "meetings" && favoritesCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 rounded-full bg-[#135bf1] border border-white" />
                )}
              </button>
            );
          })}
        </nav>
      </div>

      <div className={`space-y-2 border-t border-[#EFEFF1] bg-white/45 ${isCollapsed ? "p-2" : "p-3"}`}>
        {!isCollapsed && (
          <div className="bg-white rounded-2xl p-3 border border-[#E9E9EB] relative overflow-hidden text-left">
            <p className="text-xs font-semibold text-[#111111] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              Olli Workspace
            </p>
            <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
              Local, privado y sincronizado en SQLite.
            </p>
          </div>
        )}

        <button
          onClick={onLogout}
          title={isCollapsed ? "Cerrar sesion" : undefined}
          className={`w-full flex items-center text-rose-500 hover:bg-rose-50/80 font-semibold transition-colors cursor-pointer group mt-1 ${
            isCollapsed ? "justify-center h-10 rounded-2xl" : "gap-2.5 px-3 py-2 rounded-xl text-xs text-left"
          }`}
        >
          <LogOut className="w-4 h-4 text-rose-450 group-hover:translate-x-0.5 transition-transform shrink-0" />
          {!isCollapsed && <span>Cerrar sesion</span>}
        </button>
      </div>
    </aside>
  );
}

function getNotificationDot(notification: AppNotification) {
  if (!notification.unread) return "bg-slate-200";

  switch (notification.tone) {
    case "success":
      return "bg-emerald-500";
    case "warning":
      return "bg-amber-500";
    case "danger":
      return "bg-rose-500";
    default:
      return "bg-[#135bf1]";
  }
}

function readDismissedNotifications(storageKey: string) {
  try {
    const rawValue = localStorage.getItem(storageKey);
    if (!rawValue) return [];
    const parsedValue = JSON.parse(rawValue);
    return Array.isArray(parsedValue) ? parsedValue.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function writeDismissedNotifications(storageKey: string, notificationIds: string[]) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(notificationIds));
  } catch {
    // localStorage can fail in private or restricted browser contexts.
  }
}
