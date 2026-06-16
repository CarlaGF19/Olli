/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DB_NAME = "OlliStore";
const DB_VERSION = 1;
const STORE_NAME = "meetings";

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not supported in this environment"));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event: any) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };

    request.onsuccess = (event: any) => {
      resolve(event.target.result);
    };

    request.onerror = (event: any) => {
      reject(event.target.error || new Error("IDB open failed"));
    };
  });
}

/**
 * Fetch all meetings for a specific user ID stored in IndexedDB.
 */
export async function getIDBMeetings(userId: string): Promise<any[]> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];
        // Filter by ownerId to keep user collections separated and secure
        const filtered = results.filter((m: any) => m.ownerId === userId);
        
        // Sort by date descending
        filtered.sort((a: any, b: any) => {
          return new Date(b.date).getTime() - new Date(a.date).getTime();
        });
        
        resolve(filtered);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("IndexedDB getMeetings error:", err);
    return [];
  }
}

/**
 * Save or update a meeting record in IndexedDB container.
 */
export async function saveIDBMeeting(userId: string, meeting: any): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      
      const record = {
        ...meeting,
        ownerId: userId,
      };

      const request = store.put(record);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("IndexedDB saveMeeting error:", err);
  }
}

/**
 * Delete a meeting record from IndexedDB.
 */
export async function deleteIDBMeeting(meetingId: string): Promise<void> {
  try {
    const db = await getDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(meetingId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  } catch (err) {
    console.error("IndexedDB deleteMeeting error:", err);
  }
}
