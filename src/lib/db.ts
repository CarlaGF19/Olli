/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { db, handleFirestoreError, OperationType } from "./firebase";
import {
  doc,
  collection,
  setDoc,
  getDoc,
  getDocs,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp
} from "firebase/firestore";
import { Meeting, AppSettings } from "../types";

// Collection paths
const MEETINGS_COLLECTION = "meetings";
const SETTINGS_COLLECTION = "settings";

export async function fetchUserMeetings(userId: string): Promise<Meeting[]> {
  const path = `${MEETINGS_COLLECTION} (query where ownerId == ${userId})`;
  try {
    const q = query(
      collection(db, MEETINGS_COLLECTION),
      where("ownerId", "==", userId),
      orderBy("date", "desc")
    );
    const querySnapshot = await getDocs(q);
    const fetched: Meeting[] = [];
    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      fetched.push({
        id: docSnap.id,
        title: data.title || "Untitled Meeting",
        date: data.date || new Date().toISOString(),
        duration: data.duration || "00:00",
        transcript: data.transcript || "",
        summary: data.summary || "",
        audioMimeType: data.audioMimeType || undefined,
        isFavorite: data.isFavorite || false,
        audioSizeKb: data.audioSizeKb || undefined,
      });
    });
    return fetched;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function saveMeetingToCloud(userId: string, meeting: Meeting): Promise<void> {
  const docId = meeting.id;
  const path = `${MEETINGS_COLLECTION}/${docId}`;
  try {
    const docRef = doc(db, MEETINGS_COLLECTION, docId);
    // Write full properties matching the isValidMeeting schema constraints in firestore.rules
    await setDoc(docRef, {
      id: meeting.id,
      title: meeting.title,
      date: meeting.date,
      duration: meeting.duration,
      transcript: meeting.transcript,
      summary: meeting.summary,
      ownerId: userId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      audioMimeType: meeting.audioMimeType || null,
      audioSizeKb: meeting.audioSizeKb || null,
      isFavorite: meeting.isFavorite || false,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function updateMeetingInCloud(
  userId: string,
  meetingId: string,
  updates: Partial<Meeting>
): Promise<void> {
  const path = `${MEETINGS_COLLECTION}/${meetingId}`;
  try {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);

    // Read existing doc to satisfy rule requirements
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) {
      throw new Error("Meeting document does not exist");
    }
    const current = docSnap.data();
    if (current.ownerId !== userId) {
      throw new Error("Unauthorized meeting write operation attempted");
    }

    // Build incoming document with full properties as firestore.rules isValidMeeting requires full keys during update
    const incomingData = {
      id: current.id,
      title: updates.title !== undefined ? updates.title : current.title,
      date: current.date,
      duration: current.duration,
      transcript: updates.transcript !== undefined ? updates.transcript : current.transcript,
      summary: updates.summary !== undefined ? updates.summary : current.summary,
      ownerId: userId,
      createdAt: current.createdAt,
      updatedAt: serverTimestamp(),
      audioMimeType: current.audioMimeType || null,
      audioSizeKb: current.audioSizeKb || null,
      isFavorite: updates.isFavorite !== undefined ? updates.isFavorite : (current.isFavorite || false),
    };

    await setDoc(docRef, incomingData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteMeetingFromCloud(userId: string, meetingId: string): Promise<void> {
  const path = `${MEETINGS_COLLECTION}/${meetingId}`;
  try {
    const docRef = doc(db, MEETINGS_COLLECTION, meetingId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists() && docSnap.data().ownerId === userId) {
      await deleteDoc(docRef);
    } else {
      throw new Error("Permission denied or document does not exist");
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function fetchUserSettings(userId: string): Promise<AppSettings | null> {
  const path = `${SETTINGS_COLLECTION}/${userId}`;
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        aiProvider: data.aiProvider || "gemini",
        apiKey: data.apiKey || "",
        audioFolder: data.audioFolder || "/MeetingBrain/Vault/",
        autoDeleteAudio: data.autoDeleteAudio !== undefined ? data.autoDeleteAudio : true,
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function saveUserSettingsToCloud(userId: string, settings: AppSettings): Promise<void> {
  const path = `${SETTINGS_COLLECTION}/${userId}`;
  try {
    const docRef = doc(db, SETTINGS_COLLECTION, userId);
    const docSnap = await getDoc(docRef);
    const exists = docSnap.exists();

    const timestamp = serverTimestamp();
    const payload = {
      aiProvider: settings.aiProvider,
      apiKey: settings.apiKey,
      audioFolder: settings.audioFolder,
      autoDeleteAudio: settings.autoDeleteAudio,
      ownerId: userId,
      createdAt: exists ? docSnap.data().createdAt : timestamp,
      updatedAt: timestamp,
    };

    await setDoc(docRef, payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}
