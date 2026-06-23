/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
  username?: string;
  email: string;
  displayName: string;
  photoURL?: string;
}

export interface Meeting {
  id: string;
  title: string;
  date: string;
  duration: string; // formatted: 'MM:SS' or 'HH:MM:SS'
  transcript: string;
  summary: string;
  folderId?: string | null;
  audioMimeType?: string;
  isFavorite?: boolean;
  audioSizeKb?: number;
  isDraft?: boolean;
}

export interface MeetingFolder {
  id: string;
  name: string;
  createdAt: string;
}

export interface AppSettings {
  aiProvider: "gemini" | "custom_openai";
  apiKey?: string;
  hasApiKey?: boolean;
  audioFolder: string;
  autoDeleteAudio: boolean;
  bypassSizeLimit?: boolean;
}

export interface AppNotification {
  id: string;
  title: string;
  description: string;
  time: string;
  unread?: boolean;
  tone?: "info" | "success" | "warning" | "danger";
}
