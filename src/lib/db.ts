/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppSettings, Meeting, MeetingFolder, User } from "../types";

type ApiOptions = RequestInit & { allow401?: boolean };

export interface AccountDeletionPreview {
  meetings: number;
  folders: number;
  drafts: number;
  sessions: number;
  recoveryCodes: number;
  hasApiKey: boolean;
  estimatedBytes: number;
  estimatedHumanSize: string;
  confirmationCode: string;
  expiresAt: string;
  expiresInSeconds: number;
}

async function api<T>(url: string, options: ApiOptions = {}): Promise<T> {
  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    if (options.allow401 && response.status === 401) {
      return null as T;
    }
    let message = `Error local (${response.status})`;
    try {
      const data = await response.json();
      message = data.error || message;
    } catch (e) {}
    throw new Error(message);
  }

  return response.json();
}

export async function registerLocalAccount(username: string, email: string, password: string): Promise<{
  user: User;
  recoveryCode: string;
}> {
  return api("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
}

export async function loginLocalAccount(identifier: string, password: string): Promise<{ user: User }> {
  return api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ identifier, password }),
  });
}

export async function fetchCurrentUser(): Promise<User | null> {
  const data = await api<{ user: User | null }>("/api/auth/me", { allow401: true });
  return data?.user || null;
}

export async function logoutLocalAccount(): Promise<void> {
  await api("/api/auth/logout", { method: "POST" });
}

export async function resetLocalPassword(
  identifier: string,
  recoveryCode: string,
  newPassword: string
): Promise<{ newRecoveryCode: string }> {
  return api("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ identifier, recoveryCode, newPassword }),
  });
}

export async function fetchUserMeetings(_userId: string): Promise<Meeting[]> {
  const data = await api<{ meetings: Meeting[] }>("/api/meetings");
  return data.meetings || [];
}

export async function saveMeetingToCloud(_userId: string, meeting: Meeting): Promise<void> {
  await api("/api/meetings", {
    method: "POST",
    body: JSON.stringify(meeting),
  });
}

export async function updateMeetingInCloud(
  _userId: string,
  meetingId: string,
  updates: Partial<Meeting>
): Promise<void> {
  await api(`/api/meetings/${encodeURIComponent(meetingId)}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

export async function deleteMeetingFromCloud(_userId: string, meetingId: string): Promise<void> {
  await api(`/api/meetings/${encodeURIComponent(meetingId)}`, {
    method: "DELETE",
  });
}

export async function fetchMeetingFolders(_userId: string): Promise<MeetingFolder[]> {
  const data = await api<{ folders: MeetingFolder[] }>("/api/folders");
  return data.folders || [];
}

export async function createMeetingFolder(_userId: string, name: string): Promise<MeetingFolder> {
  const data = await api<{ folder: MeetingFolder }>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
  return data.folder;
}

export async function deleteMeetingFolder(_userId: string, folderId: string): Promise<void> {
  await api(`/api/folders/${encodeURIComponent(folderId)}`, {
    method: "DELETE",
  });
}

export async function fetchUserSettings(_userId: string): Promise<AppSettings | null> {
  const data = await api<{ settings: AppSettings }>("/api/settings");
  return data.settings || null;
}

export async function saveUserSettingsToCloud(_userId: string, settings: AppSettings): Promise<void> {
  await api("/api/settings", {
    method: "PUT",
    body: JSON.stringify(settings),
  });
}

export async function fetchAccountDeletionPreview(): Promise<AccountDeletionPreview> {
  return api("/api/account/deletion-preview");
}

export async function deleteUserAccountFromCloud(
  _userId: string,
  confirmationCode: string
): Promise<{ deletedBytes: number; deletedHumanSize: string }> {
  return api("/api/account", {
    method: "DELETE",
    body: JSON.stringify({ confirmationCode }),
  });
}
