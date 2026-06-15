/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { User, Meeting, AppSettings, MeetingFolder } from "./types";
import LoginRegister from "./components/LoginRegister";
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import AudioRecorder from "./components/AudioRecorder";
import MeetingViewer from "./components/MeetingViewer";
import SettingsPanel from "./components/SettingsPanel";
import OnboardingScreen from "./components/OnboardingScreen";
import { Brain, Menu, X, LayoutDashboard, Mic, FolderOpen, Settings, LogOut, Cpu } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import {
  fetchUserMeetings,
  fetchCurrentUser,
  saveMeetingToCloud,
  updateMeetingInCloud,
  deleteMeetingFromCloud,
  fetchMeetingFolders,
  createMeetingFolder,
  deleteMeetingFolder,
  fetchUserSettings,
  saveUserSettingsToCloud,
  deleteUserAccountFromCloud,
  logoutLocalAccount
} from "./lib/db";

// 1. Pristine demo meetings seeding standard structured outputs
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
    transcript: `Marcus: Welcome to the design critique. Today we are mapping the workspace navigation layouts. We want simple sidebar panels paired with custom bento grids.
Alexis: I agree. Let's use ultra-rounded borders and soft slate color margins to communicate calm and focus, avoiding purple gradients.
Marcus: Yes, the focus must be the document space itself. The sidebar shouldn't distract the writer. When a meeting notes note is opened, users should easily slide between verbatim transcripts and clean Markdown chapters.
Alexis: That is gold. Let's make sure checklist tasks in summaries display as clickable checkmark inputs for user edits.
Marcus: Perfect. Let's implement these spacing principles in our main React frames.`,
    summary: `## Design Sync: Arc Browser Patterns
**Date**: June 10, 2026 | **Duration**: 08:42 | **Lead**: Marcus Vance

### Aesthetic Philosophy
Creating a focused document workspace inspired by Arc Browser and minimalist document editors. No flashy noise, high-contrast layouts, with generous white spaces.

### UX Alignment
- **Dual-Pane Folder Explorer**: Sidebar lists on left panels, editing canvases on right panels.
- **Tab Panel Transitions**: Slide smoothly between Raw Voice Transcripts and Markdown notes.
- **Clickable Checkboxes**: Summary action checkboxes link with active states to toggle completeness.

### Action Items
- [x] Define Poppins font styles across body headings - **Marcus**
- [ ] Mount clean scrollbars matching workspace frames - **Team**
- [ ] Connect interactive checkbox toggles in Markdown panels - **Marcus**`,
  }
];

export default function App() {
  // Authentication State
  const [user, setUser] = useState<User | null>(null);

  // Active workspace page
  const [activeTab, setActiveTab] = useState<"dashboard" | "recorder" | "meetings" | "settings" | "integrations">("dashboard");
  const [preselectedRecorderMode, setPreselectedRecorderMode] = useState<"record" | "upload">("record");

  // Meetings and Settings state
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [meetingFolders, setMeetingFolders] = useState<MeetingFolder[]>([]);
  const [selectedMeeting, setSelectedMeeting] = useState<Meeting | null>(null);
  const [settings, setSettings] = useState<AppSettings>({
    aiProvider: "gemini",
    apiKey: "",
    audioFolder: "/MeetingBrain/Vault/",
    autoDeleteAudio: true,
    bypassSizeLimit: false,
  });

  // Track onboarding skip status and logins/visit count
  const [onboardingSkipped, setOnboardingSkipped] = useState<boolean>(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState<boolean>(false);
  const [visitCount, setVisitCount] = useState<number>(1);

  // Mobile menu control toggler
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sidebar collapse state (closed/collapsed by default)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);

  // 1. Restore local user session from the SQLite-backed backend cookie
  useEffect(() => {
    fetchCurrentUser()
      .then((restoredUser) => {
        if (!restoredUser) return;
        setUser(restoredUser);

        const visitedKey = `onboarding_visits_v1_${restoredUser.uid}`;
        const savedVisits = parseInt(localStorage.getItem(visitedKey) || "0", 10);
        const isSkipped = localStorage.getItem(`onboarding_skipped_v1_${restoredUser.uid}`) === "true";
        setOnboardingSkipped(isSkipped);
        setVisitCount(savedVisits);

        const isNewUserRegistered = localStorage.getItem(`onboarding_new_user_v1_${restoredUser.uid}`) === "true";
        setIsFirstTimeUser(isNewUserRegistered);
      })
      .catch((err) => {
        console.warn("No active local session found:", err);
      });
  }, []);

  // Update visits when user logs/re-logs in
  useEffect(() => {
    if (user) {
      const visitKey = `onboarding_visits_v1_${user.uid}`;
      const savedVisits = parseInt(localStorage.getItem(visitKey) || "0", 10);
      
      const skippedStatus = localStorage.getItem(`onboarding_skipped_v1_${user.uid}`) === "true";
      setOnboardingSkipped(skippedStatus);

      if (savedVisits === 0) {
        // First entry
        localStorage.setItem(visitKey, "1");
        setVisitCount(1);
      } else {
        // Second entry or more
        const nextVisits = savedVisits + 1;
        localStorage.setItem(visitKey, nextVisits.toString());
        setVisitCount(nextVisits);
      }
    } else {
      setOnboardingSkipped(false);
      setVisitCount(1);
    }
  }, [user]);

  // 2. Load settings and meeting records from the local SQLite backend whenever the user changes
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
            apiKey: cloudSettings.apiKey || "",
          };
          setSettings(loaded);
          if (!cloudSettings.apiKey) {
            await saveUserSettingsToCloud(user.uid, loaded);
          }
        } else {
          const savedSettings = localStorage.getItem(`mb_settings_${user.uid}`);
          if (savedSettings) {
            const parsed = JSON.parse(savedSettings);
            const loaded = {
              ...parsed,
              apiKey: parsed.apiKey || "",
            };
            setSettings(loaded);
            await saveUserSettingsToCloud(user.uid, loaded);
          } else {
            const cleanSettings = {
              ...settings,
              apiKey: "",
            };
            setSettings(cleanSettings);
            await saveUserSettingsToCloud(user.uid, cleanSettings);
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
          // New workspace database - start completely clean with no files or mock items
          setMeetings([]);
          setSelectedMeeting(null);
        }
      } catch (err) {
        console.error("Error loading cloud meetings:", err);
      }

      try {
        const folders = await fetchMeetingFolders(user.uid);
        setMeetingFolders(folders);
      } catch (err) {
        console.error("Error loading folders:", err);
      }
    };

    loadData();
  }, [user]);

  const handleLoginSuccess = (authenticatedUser: User, isNewUser?: boolean) => {
    setUser(authenticatedUser);
    
    if (isNewUser) {
      setIsFirstTimeUser(true);
      localStorage.setItem(`onboarding_new_user_v1_${authenticatedUser.uid}`, "true");
    } else {
      setIsFirstTimeUser(false);
      localStorage.removeItem(`onboarding_new_user_v1_${authenticatedUser.uid}`);
    }

    setActiveTab("dashboard");
  };

  const handleLogout = () => {
    logoutLocalAccount().catch((err) => console.warn("Local logout failed:", err));
    setUser(null);
    setMobileMenuOpen(false);
  };

  const handleDeleteAccount = async () => {
    if (!user) return;
    try {
      await deleteUserAccountFromCloud(user.uid);
      setUser(null);
      setMeetings([]);
      setMeetingFolders([]);
      setSelectedMeeting(null);
    } catch (err) {
      console.error("Failed to delete account:", err);
      throw err;
    }
  };

  const handleSaveSettings = async (newSettings: AppSettings) => {
    setSettings(newSettings);
    if (user) {
      localStorage.setItem(`mb_settings_${user.uid}`, JSON.stringify(newSettings));
      try {
        await saveUserSettingsToCloud(user.uid, newSettings);
      } catch (err) {
        console.error("Failed to sync settings with Cloud:", err);
      }
    } else {
      localStorage.setItem("mb_settings", JSON.stringify(newSettings));
    }
  };

  // Add a newly recorded/uploaded meeting transcript
  const handleAddNewMeeting = async (
    transcriptionData: { id?: string; title: string; transcript: string; summary: string; isDraft?: boolean },
    durationSec: number
  ) => {
    const formattedDuration = () => {
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    };

    const targetId = transcriptionData.id || "meeting_" + Date.now();

    const newMeeting: Meeting = {
      id: targetId,
      title: transcriptionData.title || "Acoustic Voice Note",
      date: new Date().toISOString(),
      duration: formattedDuration(),
      transcript: transcriptionData.transcript,
      summary: transcriptionData.summary,
      isFavorite: false,
      audioSizeKb: Math.round(durationSec * 32) || 120, // simulate storage footprint
      isDraft: transcriptionData.isDraft ?? false,
    };

    // Fast layout render UI feedback: replace draft if it matches or prepends
    setMeetings((prev) => {
      const idx = prev.findIndex((m) => m.id === targetId);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = newMeeting;
        return copy;
      } else {
        return [newMeeting, ...prev];
      }
    });
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

  // Save or update real-time draft in parent state and Cloud
  const handleUpdateMeetingDraft = async (draftData: {
    id: string;
    title: string;
    transcript: string;
    summary: string;
    duration: string;
    isDraft?: boolean;
    date?: string;
  }) => {
    const draftMeeting: Meeting = {
      id: draftData.id,
      title: draftData.title,
      date: draftData.date || new Date().toISOString(),
      duration: draftData.duration,
      transcript: draftData.transcript,
      summary: draftData.summary,
      isFavorite: false,
      audioSizeKb: 140,
      isDraft: true,
    };

    setMeetings((prev) => {
      const idx = prev.findIndex((m) => m.id === draftData.id);
      if (idx !== -1) {
        const copy = [...prev];
        copy[idx] = { ...copy[idx], ...draftMeeting };
        return copy;
      } else {
        return [draftMeeting, ...prev];
      }
    });

    if (user) {
      try {
        await saveMeetingToCloud(user.uid, draftMeeting);
      } catch (err) {
        console.error("Failed to sync background draft to cloud:", err);
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

  const handleUpdateMeeting = async (id: string, updatedFields: Partial<Meeting>) => {
    const updated = meetings.map((m) => {
      if (m.id === id) {
        return { ...m, ...updatedFields };
      }
      return m;
    });
    setMeetings(updated);

    // Sync active selection
    if (selectedMeeting?.id === id) {
      setSelectedMeeting((prev) => (prev ? { ...prev, ...updatedFields } : null));
    }

    if (user) {
      try {
        await updateMeetingInCloud(user.uid, id, updatedFields);
      } catch (err) {
        console.error("Failed to update fields to Cloud:", err);
      }
    }
  };

  const handleCreateMeetingFolder = async (name: string) => {
    if (!user) throw new Error("Debes iniciar sesion.");
    const folder = await createMeetingFolder(user.uid, name);
    setMeetingFolders((prev) => [...prev, folder].sort((a, b) => a.name.localeCompare(b.name)));
    return folder;
  };

  const handleDeleteMeetingFolder = async (folderId: string) => {
    if (!user) return;
    await deleteMeetingFolder(user.uid, folderId);
    setMeetingFolders((prev) => prev.filter((folder) => folder.id !== folderId));
    setMeetings((prev) => prev.map((meeting) => (
      meeting.folderId === folderId ? { ...meeting, folderId: null } : meeting
    )));
    setSelectedMeeting((prev) => (
      prev?.folderId === folderId ? { ...prev, folderId: null } : prev
    ));
  };

  // Counting favorites count
  const favoritesCount = meetings.filter((m) => m.isFavorite).length;

  // Unauthenticated viewport route
  if (!user) {
    return <LoginRegister onLoginSuccess={handleLoginSuccess} />;
  }

  const shouldShowApiSetupModal =
    (!settings.apiKey || settings.apiKey.trim() === "") && !onboardingSkipped && isFirstTimeUser;

  return (
    <div className="min-h-screen bg-white flex text-slate-900 font-sans antialiased overflow-x-hidden">
      
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
        isCollapsed={sidebarCollapsed}
        setIsCollapsed={setSidebarCollapsed}
      />

      {/* Main Viewport Container */}
      <div className={`flex-grow flex flex-col min-h-screen transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? "md:pl-[72px]" : "md:pl-[260px]"
      }`}>
        
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
                  { id: "dashboard" as const, label: "Home", icon: LayoutDashboard },
                  { id: "recorder" as const, label: "Olli AI Chat", icon: Mic },
                  { id: "meetings" as const, label: "Explore", icon: FolderOpen },
                  { id: "integrations" as const, label: "Integrations", icon: Cpu },
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
        <main className="flex-grow min-w-0 overflow-x-hidden p-6 max-md:p-4 max-w-[1700px] xl:max-w-full xl:px-8 mx-auto w-full">
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
                  setRecorderMode={setPreselectedRecorderMode}
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
                    onUpdateDraft={handleUpdateMeetingDraft}
                    initialMode={preselectedRecorderMode}
                  />
                </div>
              )}

              {activeTab === "meetings" && (
                <MeetingViewer
                  meetings={meetings}
                  folders={meetingFolders}
                  selectedMeeting={selectedMeeting}
                  onSelectMeeting={setSelectedMeeting}
                  onDeleteMeeting={handleDeleteMeeting}
                  onToggleFavorite={handleToggleFavorite}
                  onUpdateMeetingTitle={handleUpdateMeetingTitle}
                  onUpdateMeeting={handleUpdateMeeting}
                  onCreateFolder={handleCreateMeetingFolder}
                  onDeleteFolder={handleDeleteMeetingFolder}
                />
              )}

              {activeTab === "settings" && (
                <SettingsPanel
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  defaultTab="general"
                  onDeleteAccount={handleDeleteAccount}
                />
              )}

              {activeTab === "integrations" && (
                <SettingsPanel
                  settings={settings}
                  onSaveSettings={handleSaveSettings}
                  defaultTab="integrations"
                  onDeleteAccount={handleDeleteAccount}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      <AnimatePresence>
        {shouldShowApiSetupModal && (
          <OnboardingScreen
            user={user}
            showSkip={true}
            onSkip={() => {
              setOnboardingSkipped(true);
              setIsFirstTimeUser(false);
              localStorage.removeItem(`onboarding_new_user_v1_${user.uid}`);
              localStorage.setItem(`onboarding_skipped_v1_${user.uid}`, "true");
            }}
            onSaveApiKey={async (key) => {
              const updatedSettings = { ...settings, apiKey: key };
              setSettings(updatedSettings);
              await saveUserSettingsToCloud(user.uid, updatedSettings);
              setIsFirstTimeUser(false);
              localStorage.removeItem(`onboarding_new_user_v1_${user.uid}`);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
