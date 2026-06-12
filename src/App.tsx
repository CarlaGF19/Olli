/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User, Meeting, AppSettings } from "./types";
import LoginRegister from "./components/LoginRegister";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import AudioRecorder from "./components/AudioRecorder";
import MeetingViewer from "./components/MeetingViewer";
import SettingsPanel from "./components/SettingsPanel";
import { Brain, Menu, X, LayoutDashboard, Mic, FolderOpen, Settings, LogOut } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  fetchUserMeetings,
  saveMeetingToCloud,
  updateMeetingInCloud,
  deleteMeetingFromCloud,
  fetchUserSettings,
  saveUserSettingsToCloud
} from "./lib/db";

// 1. Pristine demo meetings seeding standard Obsidian outputs
const INITIAL_DEMO_MEETINGS: Meeting[] = [
  {
    id: "demo-meeting-1",
    title: "Weekly Standup & Milestones",
    date: "2026-06-11T10:00:00.000Z",
    duration: "05:14",
    isFavorite: true,
    audioSizeKb: 1450,
    transcript: `Alexis: Good morning everyone, let's go ahead and start our weekly alignment standup. We have some major milestones upcoming for the MeetingBrain sprint.
Marcus: Sounds good. On my end, I've finished the draft designs for the visual recording widget. Inspired by Otter.ai, it has a flowing waves visualizer on a canvas and responsive timing tags.
Sarah: Excellent. I'm finalizing the Gemini AI proxy server routes in Express. It securely transcribes raw audio streams using the gemini-3.5-flash model, packaging outlines immediately in JSON schemas.
Alexis: Majestic work Sarah. Make sure to implement automatic deletion parameters to purge heavy base64 data once transcription vaults are active, to optimize local cache sizes.
Marcus: I can review that and establish testing criteria. Let's aim to package the beta build by tomorrow afternoon.
Alexis: Perfect. Thanks everyone, keep up the amazing velocity!`,
    summary: `## Weekly Standup & Milestones
**Date**: June 11, 2026 | **Duration**: 05:14 | **Host**: Alexis Jordan

### Meeting Overview
Alignment sync validating current visual interfaces and the AI engine deployment for the MeetingBrain MVP prototype.

### Core Discussions
- **Visual Recording Waveform**: Marcus previewed the canvas layout inspired by Otter.ai featuring active glowing oscillations.
- **Express Backend Proxy**: Sarah deployed transcription endpoints utilizing the Google GenAI SDK and the stable \`gemini-3.5-flash\` model.
- **Cache Optimization**: Alexis requested a toggle setting to clear recorded base64 caches once summaries write to the vault disk.

### Action Items & Milestones
- [x] Design beautiful waveform canvas visualizers - **Marcus**
- [x] Configure lazy Google GenAI Express routes - **Sarah**
- [ ] Implement auto-delete base64 memory caches - **Sarah / Marcus**
- [ ] Compile production-ready beta binaries of MeetingBrain - **Team**`,
  },
  {
    id: "demo-meeting-2",
    title: "Design Sync: Arc Browser Patterns",
    date: "2026-06-10T14:30:00.000Z",
    duration: "08:42",
    isFavorite: false,
    audioSizeKb: 2840,
    transcript: `Marcus: Welcome to the design critique. Today we are mapping the workspace navigation layouts. We want simple Obsidian sidebar panels paired with custom Notion bento grids.
Alexis: I agree. Let's use ultra-rounded borders and soft slate color margins to communicate calm and focus, avoiding purple gradients.
Marcus: Yes, the focus must be the document space itself. The sidebar shouldn't distract the writer. When a meeting notes note is opened, users should easily slide between verbatim transcripts and clean Markdown chapters.
Alexis: That is gold. Let's make sure checklist tasks in summaries display as clickable checkmark inputs for user edits.
Marcus: Perfect. Let's implement these spacing principles in our main React frames.`,
    summary: `## Design Sync: Arc Browser Patterns
**Date**: June 10, 2026 | **Duration**: 08:42 | **Lead**: Marcus Vance

### Aesthetic Philosophy
Creating a focused document workspace inspired by Arc Browser, Notion, and Obsidian. No flashy noise, high-contrast layouts, with generous white spaces.

### UX Alignment
- **Dual-Pane Folder Explorer**: Sidebar lists on left panels, editing canvases on right panels.
- **Tab Panel Transitions**: Slide smoothly between Raw Voice Transcripts and Markdown notes.
- **Clickable Checkboxes**: Summary action checkboxes link with active states to toggle completeness.

### Action Items
- [x] Define Poppins font styles across body headings - **Marcus**
- [ ] Mount clean scrollbars matching Notion frames - **Team**
- [ ] Connect interactive checkbox toggles in Markdown panels - **Marcus**`,
  }
];

export default function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);

  // Active workspace page
  const [activeTab, setActiveTab] = useState<"dashboard" | "recorder" | "meetings" | "settings">("dashboard");

  // Meetings and Settings state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    aiProvider: "gemini",
    apiKey: "AQ.Ab8RN6L409A8VsqFzDtEg2eDDP_PnLFxXNGC_ox6-yAgOHO-vQ",
    audioFolder: "/MeetingBrain/Vault/",
    autoDeleteAudio: true,
  });

  // Mobile menu control toggler
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // 1. Restore local user session from cache on mount
  useEffect(() => {
    const savedUser = localStorage.getItem("mb_user");
    if (savedUser) {
      setUser(JSON.parse(savedUser));
    }
  }, []);

  // 2. Load settings and meeting records from cloud Firestore whenever the user alters
  useEffect(() => {
    if (!user) {
      setMeetings([]);
      setSelectedMeeting(null);
      return;
    }

    const loadData = async () => {
      // Load user settings
      try {
        const cloudSettings = await fetchUserSettings(user.uid);
        if (cloudSettings) {
          const loaded = {
            ...cloudSettings,
            apiKey: cloudSettings.apiKey || "AQ.Ab8RN6L409A8VsqFzDtEg2eDDP_PnLFxXNGC_ox6-yAgOHO-vQ",
          };
          setSettings(loaded);
          if (!cloudSettings.apiKey) {
            await saveUserSettingsToCloud(user.uid, loaded);
          }
        } else {
          const savedSettings = localStorage.getItem("mb_settings");
          if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            const loaded = {
              ...parsed,
              apiKey: parsed.apiKey || "AQ.Ab8RN6L409A8VsqFzDtEg2eDDP_PnLFxXNGC_ox6-yAgOHO-vQ",
            };
            setSettings(loaded);
            await saveUserSettingsToCloud(user.uid, loaded);
          } else {
            await saveUserSettingsToCloud(user.uid, settings);
          }
        }
      } catch (err) {
        console.error("Error loading cloud settings:", err);
      }

      // Load user meetings
      try {
        const cloudMeetings = await fetchUserMeetings(user.uid);
        if (cloudMeetings && cloudMeetings.length > 0) {
          setMeetings(cloudMeetings);
          setSelectedMeeting(cloudMeetings[0]);
        } else {
          // New workspace database - sync initialized seeding templates
          for (const m of INITIAL_DEMO_MEETINGS) {
            await saveMeetingToCloud(user.uid, m);
          }
          const updatedCloud = await fetchUserMeetings(user.uid);
          setMeetings(updatedCloud);
          if (updatedCloud.length > 0) {
            setSelectedMeeting(updatedCloud[0]);
          }
        }
      } catch (err) {
        console.error("Error loading cloud meetings:", err);
      }
    };

    loadData();
  }, [user]);

  const handleLoginSuccess = (authenticatedUser: User) => {
    setUser(authenticatedUser);
    localStorage.setItem("mb_user", JSON.stringify(authenticatedUser));
    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("mb_user");
    setMobileMenuOpen(false);
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    localStorage.setItem("mb_settings", JSON.stringify(newSettings));
    if (user) {
      try {
        await saveUserSettingsToCloud(user.uid, newSettings);
      } catch (err) {
        console.error("Failed to sync settings with Cloud:", err);
      }
    }
  };

  // Add a newly recorded/uploaded meeting transcript
  const handleAddNewMeeting = async (
    transcriptionData: { title: string; transcript: string; summary: string },
    durationSec: number
  ) => {
    const formattedDuration = () => {
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    const newMeeting: Meeting = {
      id: "meeting_" + Date.now(),
      title: transcriptionData.title || "Acoustic Voice Note",
      date: new Date().toISOString(),
      duration: formattedDuration(),
      transcript: transcriptionData.transcript,
      summary: transcriptionData.summary,
      isFavorite: false,
      audioSizeKb: Math.round(durationSec * 32) || 120, // simulate storage footprint
    };

    // Fast layout render UI feedback
    setMeetings((prev) => [newMeeting, ...prev]);
    setSelectedMeeting(newMeeting);
    setActiveTab("meetings");

    if (user) {
      try {
        await saveMeetingToCloud(user.uid, newMeeting);
      } catch (err) {
        console.error("Failed to save meeting with Cloud:", err);
      }
    }
  };

  const handleDeleteMeeting = async (id: string) => {
    const updated = meetings.filter((m) => m.id !== id);
    setMeetings(updated);
    
    // Update selected ref
    if (selectedMeeting?.id === id) {
      setSelectedMeeting(updated.length > 0 ? updated[0] : null);
    }

    if (user) {
      try {
        await deleteMeetingFromCloud(user.uid, id);
      } catch (err) {
        console.error("Failed to delete meeting from Cloud:", err);
      }
    }
  };

  const handleToggleFavorite = async (id: string) => {
    const targetMeeting = meetings.find((m) => m.id === id);
    if (!targetMeeting) return;

    const newFavoriteValue = !targetMeeting.isFavorite;

    const updated = meetings.map((m) => {
      if (m.id === id) {
        return { ...m, isFavorite: newFavoriteValue };
      }
      return m;
    });
    setMeetings(updated);
    
    // Sync active selection
    if (selectedMeeting?.id === id) {
      setSelectedMeeting((prev) => (prev ? { ...prev, isFavorite: newFavoriteValue } : null));
    }

    if (user) {
      try {
        await updateMeetingInCloud(user.uid, id, { isFavorite: newFavoriteValue });
      } catch (err) {
        console.error("Failed to toggle favorite to Cloud:", err);
      }
    }
  };

  const handleUpdateMeetingTitle = async (id: string, newTitle: string) => {
    const updated = meetings.map((m) => {
      if (m.id === id) {
        return { ...m, title: newTitle };
      }
      return m;
    });
    setMeetings(updated);

    // Sync active selection
    if (selectedMeeting?.id === id) {
      setSelectedMeeting((prev) => (prev ? { ...prev, title: newTitle } : null));
    }

    if (user) {
      try {
        await updateMeetingInCloud(user.uid, id, { title: newTitle });
      } catch (err) {
        console.error("Failed to update title to Cloud:", err);
      }
    }
  };

  // Counting favorites count
  const favoritesCount = meetings.filter((m) => m.isFavorite).length;

  // Unauthenticated viewport route
  if (!user) {
    return <LoginRegister onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div className="min-h-screen bg-white flex text-slate-900 font-sans antialiased overflow-x-hidden">
      
      {/* Desktop sidebar navigation */}
      <Sidebar
        user={user}
        activeTab={activeTab}
        setActiveTab={(tab) => {
          setActiveTab(tab);
          setMobileMenuOpen(false);
        }}
        onLogout={handleLogout}
        favoritesCount={favoritesCount}
        meetings={meetings}
      />

      {/* Main Viewport Container */}
      <div className="flex-grow flex flex-col md:pl-64 min-h-screen">
        
        {/* Responsive Mobile Headbar Banner */}
        <header className="md:hidden bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-xs">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-[#2C5EAD] flex items-center justify-center text-white shadow-sm">
              <Brain className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-800 text-sm tracking-tight">
              MeetingBrain
            </span>
          </div>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-1.5 hover:bg-slate-50 border border-slate-100 rounded-lg text-slate-500 transition-colors cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-4.5 h-4.5" /> : <Menu className="w-4.5 h-4.5" />}
          </button>
        </header>

        {/* Mobile slide-down navigation menu list */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="md:hidden bg-white border-b border-slate-100 overflow-hidden sticky top-[65px] z-20 shadow-lg"
            >
              <div className="p-4 space-y-1.5">
                {[
                  { id: "dashboard" as const, label: "Dashboard", icon: LayoutDashboard },
                  { id: "recorder" as const, label: "New Recording", icon: Mic },
                  { id: "meetings" as const, label: "My Vault", icon: FolderOpen },
                  { id: "settings" as const, label: "Settings", icon: Settings },
                ].map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => {
                        setActiveTab(item.id);
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full flex items-center space-x-3 p-3 rounded-xl text-left text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer ${
                        isActive ? "bg-[#2C5EAD]/5 text-[#2C5EAD]" : "text-slate-500 hover:bg-slate-50"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
                <div className="pt-2 border-t border-slate-50">
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center space-x-3 p-3 rounded-xl text-left text-xs font-semibold uppercase tracking-wider text-rose-500 hover:bg-rose-50 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Get Out</span>
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Content Body */}
        <main className="flex-grow p-8 max-md:p-6 max-w-7xl mx-auto w-full">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              {activeTab === "dashboard" && (
                <Dashboard
                  meetings={meetings}
                  onSelectMeeting={(m) => {
                    setSelectedMeeting(m);
                    setActiveTab("meetings");
                  }}
                  setActiveTab={setActiveTab}
                  onToggleFavorite={handleToggleFavorite}
                />
              )}

              {activeTab === "recorder" && (
                <div className="space-y-6">
                  <div>
                    <h1 className="text-xl font-bold text-slate-800 tracking-tight">Audio Workspace</h1>
                    <p className="text-xs text-slate-400 mt-1">
                      Stream voice recordings or upload files directly. AI models segment highlights immediately.
                    </p>
                  </div>
                  <AudioRecorder
                    onTranscriptionSuccess={handleAddNewMeeting}
                    settings={settings}
                  />
                </div>
              )}

              {activeTab === "meetings" && (
                <MeetingViewer
                  meetings={meetings}
                  selectedMeeting={selectedMeeting}
                  onSelectMeeting={setSelectedMeeting}
                  onDeleteMeeting={handleDeleteMeeting}
                  onToggleFavorite={handleToggleFavorite}
                  onUpdateMeetingTitle={handleUpdateMeetingTitle}
                />
              )}

              {activeTab === "settings" && (
                <SettingsPanel
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

    </div>
  );
}
