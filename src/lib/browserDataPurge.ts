const KNOWN_INDEXED_DB_NAMES = ["OlliStore"];

function shouldRemoveStorageKey(key: string, userId?: string) {
  const normalized = key.toLowerCase();
  return (
    normalized.startsWith("olli_") ||
    normalized.startsWith("mb_") ||
    normalized.startsWith("meetbrain_") ||
    normalized.startsWith("onboarding_") ||
    (userId ? key.includes(userId) : false)
  );
}

function deleteIndexedDb(name: string) {
  return new Promise<void>((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve();
      return;
    }
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}

export async function purgeOlliBrowserData(userId?: string) {
  if (typeof window === "undefined") return;

  for (const key of Object.keys(localStorage)) {
    if (shouldRemoveStorageKey(key, userId)) {
      localStorage.removeItem(key);
    }
  }

  sessionStorage.clear();

  if (typeof indexedDB === "undefined") return;

  const databaseNames = new Set(KNOWN_INDEXED_DB_NAMES);
  const databases = await indexedDB.databases?.().catch(() => []);
  for (const database of databases || []) {
    const name = database.name || "";
    const normalized = name.toLowerCase();
    if (normalized.includes("olli") || normalized.includes("meetbrain") || normalized.includes("mb")) {
      databaseNames.add(name);
    }
  }

  await Promise.all([...databaseNames].map((name) => deleteIndexedDb(name)));
}
