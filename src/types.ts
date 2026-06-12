/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface User {
  uid: string;
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
  audioMimeType?: string;
  isFavorite?: boolean;
  audioSizeKb?: number;
}

export interface AppSettings {
  aiProvider: "gemini" | "custom_openai";
  apiKey: string;
  audioFolder: string;
  autoDeleteAudio: boolean;
}
