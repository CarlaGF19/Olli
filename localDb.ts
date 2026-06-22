import fs from "fs";
import path from "path";
import crypto from "crypto";
import initSqlJs, { Database, SqlJsStatic } from "sql.js";

type LocalUserRow = {
  id: string;
  username: string;
  email: string;
  password_hash: string;
  password_salt: string;
  display_name: string;
};

export type PublicLocalUser = {
  uid: string;
  username: string;
  email: string;
  displayName: string;
};

export type LocalSettings = {
  aiProvider: "gemini" | "custom_openai";
  apiKey?: string;
  hasApiKey?: boolean;
  audioFolder: string;
  autoDeleteAudio: boolean;
  bypassSizeLimit?: boolean;
};

export type LocalMeeting = {
  id: string;
  title: string;
  date: string;
  duration: string;
  transcript: string;
  summary: string;
  folderId?: string | null;
  audioMimeType?: string;
  isFavorite?: boolean;
  audioSizeKb?: number;
  isDraft?: boolean;
};

export type LocalMeetingFolder = {
  id: string;
  name: string;
  createdAt: string;
};

export type LocalCourseDocument = {
  id: string;
  folderId: string | null;
  name: string;
  originalFilename: string;
  sizeBytes: number;
  pageCount: number;
  createdAt: string;
};

export type LocalLibrarySearchResult = {
  source: "pdf" | "meeting";
  id: string;
  title: string;
  excerpt: string;
  score: number;
  pageNumber?: number;
  documentId?: string;
};
export type AccountDeletionPreview = {
  meetings: number;
  folders: number;
  documents: number;
  drafts: number;
  sessions: number;
  recoveryCodes: number;
  hasApiKey: boolean;
  estimatedBytes: number;
  estimatedHumanSize: string;
};

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "meetbrain.sqlite");
const DOCUMENTS_DIR = path.join(DATA_DIR, "documents");
const SESSION_DAYS = 14;
const RECOVERY_DAYS = 3650;

let sqlPromise: Promise<SqlJsStatic> | null = null;
let dbPromise: Promise<Database> | null = null;

function nowIso() {
  return new Date().toISOString();
}

function futureIso(days: number) {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
}

function randomId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(16).toString("hex")}`;
}

function publicUser(row: LocalUserRow): PublicLocalUser {
  return {
    uid: row.id,
    username: row.username,
    email: row.email,
    displayName: row.display_name || row.username,
  };
}

function normalizeIdentifier(value: string) {
  return value.trim().toLowerCase();
}

function getSql() {
  if (!sqlPromise) {
    sqlPromise = initSqlJs({
      locateFile: (file) => path.join(process.cwd(), "node_modules", "sql.js", "dist", file),
    });
  }
  return sqlPromise;
}

async function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const SQL = await getSql();
      const db = fs.existsSync(DB_PATH)
        ? new SQL.Database(fs.readFileSync(DB_PATH))
        : new SQL.Database();
      migrate(db);
      persist(db);
      return db;
    })();
  }
  return dbPromise;
}

function persist(db: Database) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
}

function migrate(db: Database) {
  db.run(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      display_name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_recovery_codes (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      code_hash TEXT NOT NULL,
      code_salt TEXT NOT NULL,
      used_at TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meetings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      date TEXT NOT NULL,
      duration TEXT NOT NULL,
      transcript TEXT NOT NULL,
      summary TEXT NOT NULL,
      folder_id TEXT,
      audio_mime_type TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      audio_size_kb INTEGER,
      is_draft INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meeting_folders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS settings (
      user_id TEXT PRIMARY KEY,
      ai_provider TEXT NOT NULL,
      api_key TEXT NOT NULL,
      audio_folder TEXT NOT NULL,
      auto_delete_audio INTEGER NOT NULL,
      bypass_size_limit INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_documents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      folder_id TEXT,
      name TEXT NOT NULL,
      original_filename TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      page_count INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS course_document_pages (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      page_number INTEGER NOT NULL,
      text_content TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES course_documents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS folder_ai_permissions (
      user_id TEXT NOT NULL,
      folder_id TEXT NOT NULL,
      enabled_at TEXT NOT NULL,
      PRIMARY KEY (user_id, folder_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  try {
    db.run("ALTER TABLE meetings ADD COLUMN folder_id TEXT");
  } catch (error) {}
}

function getSingle<T extends Record<string, any>>(db: Database, sql: string, params: any[] = []): T | null {
  const stmt = db.prepare(sql, params);
  try {
    if (!stmt.step()) return null;
    return stmt.getAsObject() as T;
  } finally {
    stmt.free();
  }
}

function getAll<T extends Record<string, any>>(db: Database, sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql, params);
  const rows: T[] = [];
  try {
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

function hashSha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function scryptHash(value: string, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(value, salt, 64).toString("hex");
  return { hash, salt };
}

function verifyScrypt(value: string, hash: string, salt: string) {
  const incoming = crypto.scryptSync(value, salt, 64);
  const stored = Buffer.from(hash, "hex");
  return stored.length === incoming.length && crypto.timingSafeEqual(stored, incoming);
}

function byteLength(value: unknown) {
  return Buffer.byteLength(String(value ?? ""), "utf8");
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function createRecoveryCode() {
  const left = crypto.randomBytes(3).toString("hex").toUpperCase();
  const right = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `MB-${left}-${right}`;
}

function defaultSettings(): LocalSettings {
  return {
    aiProvider: "gemini",
    apiKey: "",
    audioFolder: "/Olli/Vault/",
    autoDeleteAudio: true,
    bypassSizeLimit: false,
  };
}

function insertRecoveryCode(db: Database, userId: string) {
  const recoveryCode = createRecoveryCode();
  const { hash, salt } = scryptHash(recoveryCode);
  db.run(
    `INSERT INTO password_recovery_codes
      (id, user_id, code_hash, code_salt, used_at, created_at, expires_at)
      VALUES (?, ?, ?, ?, NULL, ?, ?)`,
    [randomId("recovery"), userId, hash, salt, nowIso(), futureIso(RECOVERY_DAYS)]
  );
  return recoveryCode;
}

async function createSession(db: Database, userId: string) {
  const token = crypto.randomBytes(32).toString("hex");
  db.run(
    `INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)`,
    [hashSha256(token), userId, nowIso(), futureIso(SESSION_DAYS)]
  );
  return token;
}

export async function registerLocalUser(username: string, email: string, password: string) {
  const db = await getDb();
  const cleanUsername = username.trim();
  const cleanEmail = normalizeIdentifier(email);
  if (cleanUsername.length < 3) throw new Error("El usuario debe tener al menos 3 caracteres.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw new Error("Correo electronico invalido.");
  if (password.length < 8) throw new Error("La contrasena debe tener al menos 8 caracteres.");

  const existing = getSingle(db, "SELECT id FROM users WHERE lower(username) = ? OR lower(email) = ?", [
    cleanUsername.toLowerCase(),
    cleanEmail,
  ]);
  if (existing) throw new Error("Ya existe una cuenta con ese usuario o correo.");

  const userId = randomId("user");
  const { hash, salt } = scryptHash(password);
  const createdAt = nowIso();
  db.run(
    `INSERT INTO users (id, username, email, password_hash, password_salt, display_name, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [userId, cleanUsername, cleanEmail, hash, salt, cleanUsername, createdAt, createdAt]
  );

  const settings = defaultSettings();
  db.run(
    `INSERT INTO settings
      (user_id, ai_provider, api_key, audio_folder, auto_delete_audio, bypass_size_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      settings.aiProvider,
      settings.apiKey,
      settings.audioFolder,
      settings.autoDeleteAudio ? 1 : 0,
      settings.bypassSizeLimit ? 1 : 0,
      createdAt,
      createdAt,
    ]
  );

  const recoveryCode = insertRecoveryCode(db, userId);
  const sessionToken = await createSession(db, userId);
  persist(db);

  return {
    user: publicUser({
      id: userId,
      username: cleanUsername,
      email: cleanEmail,
      password_hash: hash,
      password_salt: salt,
      display_name: cleanUsername,
    }),
    sessionToken,
    recoveryCode,
  };
}

export async function loginLocalUser(identifier: string, password: string) {
  const db = await getDb();
  const cleanIdentifier = normalizeIdentifier(identifier);
  const row = getSingle<LocalUserRow>(
    db,
    "SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?",
    [cleanIdentifier, cleanIdentifier]
  );
  if (!row || !verifyScrypt(password, row.password_hash, row.password_salt)) {
    throw new Error("Usuario/correo o contrasena incorrectos.");
  }
  const sessionToken = await createSession(db, row.id);
  persist(db);
  return { user: publicUser(row), sessionToken };
}

export async function getUserFromSession(token?: string | null) {
  if (!token) return null;
  const db = await getDb();
  const row = getSingle<LocalUserRow>(
    db,
    `SELECT users.* FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`,
    [hashSha256(token), nowIso()]
  );
  return row ? publicUser(row) : null;
}

export async function logoutLocalSession(token?: string | null) {
  if (!token) return;
  const db = await getDb();
  db.run("DELETE FROM sessions WHERE token_hash = ?", [hashSha256(token)]);
  persist(db);
}

export async function resetLocalPassword(identifier: string, recoveryCode: string, newPassword: string) {
  const db = await getDb();
  const cleanIdentifier = normalizeIdentifier(identifier);
  if (newPassword.length < 8) throw new Error("La nueva contrasena debe tener al menos 8 caracteres.");

  const user = getSingle<LocalUserRow>(
    db,
    "SELECT * FROM users WHERE lower(username) = ? OR lower(email) = ?",
    [cleanIdentifier, cleanIdentifier]
  );
  if (!user) throw new Error("No existe una cuenta con esos datos.");

  const codes = getAll<any>(
    db,
    `SELECT * FROM password_recovery_codes
      WHERE user_id = ? AND used_at IS NULL AND expires_at > ?
      ORDER BY created_at DESC`,
    [user.id, nowIso()]
  );
  const matching = codes.find((code) => verifyScrypt(recoveryCode.trim(), code.code_hash, code.code_salt));
  if (!matching) throw new Error("Codigo de recuperacion invalido o usado.");

  const { hash, salt } = scryptHash(newPassword);
  const updatedAt = nowIso();
  db.run("UPDATE users SET password_hash = ?, password_salt = ?, updated_at = ? WHERE id = ?", [
    hash,
    salt,
    updatedAt,
    user.id,
  ]);
  db.run("UPDATE password_recovery_codes SET used_at = ? WHERE id = ?", [updatedAt, matching.id]);
  db.run("DELETE FROM sessions WHERE user_id = ?", [user.id]);
  const newRecoveryCode = insertRecoveryCode(db, user.id);
  persist(db);
  return { newRecoveryCode };
}

export async function listMeetings(userId: string) {
  const db = await getDb();
  return getAll<any>(
    db,
    `SELECT * FROM meetings WHERE user_id = ? ORDER BY date DESC`,
    [userId]
  ).map((row) => ({
    id: row.id,
    title: row.title,
    date: row.date,
    duration: row.duration,
    transcript: row.transcript,
    summary: row.summary,
    folderId: row.folder_id || null,
    audioMimeType: row.audio_mime_type || undefined,
    isFavorite: !!row.is_favorite,
    audioSizeKb: row.audio_size_kb ?? undefined,
    isDraft: !!row.is_draft,
  }));
}

export async function saveMeeting(userId: string, meeting: LocalMeeting) {
  const db = await getDb();
  const timestamp = nowIso();
  const existing = getSingle(db, "SELECT id, created_at FROM meetings WHERE id = ? AND user_id = ?", [meeting.id, userId]);
  db.run(
    `INSERT OR REPLACE INTO meetings
      (id, user_id, title, date, duration, transcript, summary, folder_id, audio_mime_type, is_favorite, audio_size_kb, is_draft, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meeting.id,
      userId,
      meeting.title,
      meeting.date,
      meeting.duration,
      meeting.transcript,
      meeting.summary,
      meeting.folderId || null,
      meeting.audioMimeType || null,
      meeting.isFavorite ? 1 : 0,
      meeting.audioSizeKb ?? null,
      meeting.isDraft ? 1 : 0,
      existing?.created_at || timestamp,
      timestamp,
    ]
  );
  persist(db);
}

export async function updateMeeting(userId: string, meetingId: string, updates: Partial<LocalMeeting>) {
  const db = await getDb();
  const current = getSingle<any>(db, "SELECT * FROM meetings WHERE id = ? AND user_id = ?", [meetingId, userId]);
  if (!current) throw new Error("La reunion no existe.");
  await saveMeeting(userId, {
    id: current.id,
    title: updates.title ?? current.title,
    date: updates.date ?? current.date,
    duration: updates.duration ?? current.duration,
    transcript: updates.transcript ?? current.transcript,
    summary: updates.summary ?? current.summary,
    folderId: updates.folderId !== undefined ? updates.folderId : current.folder_id ?? null,
    audioMimeType: updates.audioMimeType ?? current.audio_mime_type ?? undefined,
    isFavorite: updates.isFavorite ?? !!current.is_favorite,
    audioSizeKb: updates.audioSizeKb ?? current.audio_size_kb ?? undefined,
    isDraft: updates.isDraft ?? !!current.is_draft,
  });
}

export async function deleteMeeting(userId: string, meetingId: string) {
  const db = await getDb();
  db.run("DELETE FROM meetings WHERE id = ? AND user_id = ?", [meetingId, userId]);
  persist(db);
}

export async function listMeetingFolders(userId: string): Promise<LocalMeetingFolder[]> {
  const db = await getDb();
  return getAll<any>(
    db,
    "SELECT id, name, created_at FROM meeting_folders WHERE user_id = ? ORDER BY lower(name) ASC",
    [userId]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
  }));
}

export async function createMeetingFolder(userId: string, name: string): Promise<LocalMeetingFolder> {
  const db = await getDb();
  const cleanName = name.trim();
  if (cleanName.length < 2) throw new Error("La carpeta necesita un nombre.");

  const existing = getSingle(db, "SELECT id FROM meeting_folders WHERE user_id = ? AND lower(name) = ?", [
    userId,
    cleanName.toLowerCase(),
  ]);
  if (existing) throw new Error("Ya existe una carpeta con ese nombre.");

  const createdAt = nowIso();
  const folder = {
    id: randomId("folder"),
    name: cleanName,
    createdAt,
  };
  db.run(
    "INSERT INTO meeting_folders (id, user_id, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    [folder.id, userId, folder.name, createdAt, createdAt]
  );
  persist(db);
  return folder;
}

export async function deleteMeetingFolder(userId: string, folderId: string) {
  const db = await getDb();
  db.run("UPDATE meetings SET folder_id = NULL, updated_at = ? WHERE user_id = ? AND folder_id = ?", [
    nowIso(),
    userId,
    folderId,
  ]);
  db.run("UPDATE course_documents SET folder_id = NULL, updated_at = ? WHERE user_id = ? AND folder_id = ?", [nowIso(), userId, folderId]);
  db.run("DELETE FROM folder_ai_permissions WHERE user_id = ? AND folder_id = ?", [userId, folderId]);
  db.run("DELETE FROM meeting_folders WHERE id = ? AND user_id = ?", [folderId, userId]);
  persist(db);
}

export async function getSettings(userId: string, includeSecret = false): Promise<LocalSettings> {
  const db = await getDb();
  const row = getSingle<any>(db, "SELECT * FROM settings WHERE user_id = ?", [userId]);
  if (!row) return defaultSettings();
  return {
    aiProvider: row.ai_provider || "gemini",
    apiKey: includeSecret ? row.api_key || "" : "",
    hasApiKey: !!row.api_key,
    audioFolder: row.audio_folder || "/Olli/Vault/",
    autoDeleteAudio: !!row.auto_delete_audio,
    bypassSizeLimit: !!row.bypass_size_limit,
  };
}

export async function saveSettings(userId: string, settings: LocalSettings) {
  const db = await getDb();
  const timestamp = nowIso();
  const existing = getSingle<any>(db, "SELECT user_id, created_at, api_key FROM settings WHERE user_id = ?", [userId]);
  db.run(
    `INSERT OR REPLACE INTO settings
      (user_id, ai_provider, api_key, audio_folder, auto_delete_audio, bypass_size_limit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      settings.aiProvider || "gemini",
      settings.apiKey !== undefined ? settings.apiKey || "" : existing?.api_key || "",
      settings.audioFolder || "/Olli/Vault/",
      settings.autoDeleteAudio ? 1 : 0,
      settings.bypassSizeLimit ? 1 : 0,
      existing?.created_at || timestamp,
      timestamp,
    ]
  );
  persist(db);
}

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function scoreSearchText(value: string, terms: string[]) {
  const normalized = normalizeSearchText(value);
  return terms.reduce((score, term) => {
    let start = 0;
    let matches = 0;
    while (matches < 8) {
      const found = normalized.indexOf(term, start);
      if (found < 0) break;
      matches += 1;
      start = found + term.length;
    }
    return score + matches;
  }, 0);
}

function excerptAroundTerms(value: string, terms: string[]) {
  const normalized = normalizeSearchText(value);
  const firstIndex = terms
    .map((term) => normalized.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, firstIndex - 170);
  const end = Math.min(value.length, start + 460);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";
  return `${prefix}${value.slice(start, end).replace(/\s+/g, " ").trim()}${suffix}`;
}

export async function listCourseDocuments(userId: string, folderId?: string | null): Promise<LocalCourseDocument[]> {
  const db = await getDb();
  const rows = folderId
    ? getAll<any>(db, "SELECT * FROM course_documents WHERE user_id = ? AND folder_id = ? ORDER BY created_at DESC", [userId, folderId])
    : getAll<any>(db, "SELECT * FROM course_documents WHERE user_id = ? ORDER BY created_at DESC", [userId]);
  return rows.map((row) => ({
    id: row.id,
    folderId: row.folder_id || null,
    name: row.name,
    originalFilename: row.original_filename,
    sizeBytes: Number(row.size_bytes || 0),
    pageCount: Number(row.page_count || 0),
    createdAt: row.created_at,
  }));
}

export async function getCourseDocumentStoragePath(userId: string, documentId: string) {
  const db = await getDb();
  const row = getSingle<any>(db, "SELECT storage_path FROM course_documents WHERE id = ? AND user_id = ?", [documentId, userId]);
  return row?.storage_path || null;
}

export async function saveCourseDocument(
  userId: string,
  document: { id: string; folderId?: string | null; name: string; originalFilename: string; storagePath: string; sizeBytes: number; pageCount: number },
  pages: Array<{ pageNumber: number; text: string }>
) {
  const db = await getDb();
  if (document.folderId) {
    const folder = getSingle<any>(db, "SELECT id FROM meeting_folders WHERE id = ? AND user_id = ?", [document.folderId, userId]);
    if (!folder) throw new Error("La carpeta del curso no existe.");
  }
  const timestamp = nowIso();
  db.run(
    `INSERT OR REPLACE INTO course_documents
      (id, user_id, folder_id, name, original_filename, storage_path, size_bytes, page_count, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM course_documents WHERE id = ?), ?), ?)`,
    [document.id, userId, document.folderId || null, document.name, document.originalFilename, document.storagePath, document.sizeBytes, document.pageCount, document.id, timestamp, timestamp]
  );
  db.run("DELETE FROM course_document_pages WHERE document_id = ?", [document.id]);
  for (const page of pages) {
    const cleanText = String(page.text || "").trim().slice(0, 50_000);
    if (!cleanText) continue;
    db.run(
      "INSERT INTO course_document_pages (id, document_id, page_number, text_content) VALUES (?, ?, ?, ?)",
      [randomId("doc_page"), document.id, Math.max(1, Number(page.pageNumber) || 1), cleanText]
    );
  }
  persist(db);
}

export async function deleteCourseDocument(userId: string, documentId: string) {
  const db = await getDb();
  const row = getSingle<any>(db, "SELECT storage_path FROM course_documents WHERE id = ? AND user_id = ?", [documentId, userId]);
  if (!row) return null;
  db.run("DELETE FROM course_documents WHERE id = ? AND user_id = ?", [documentId, userId]);
  persist(db);
  return row.storage_path as string;
}

export async function searchCourseMaterial(userId: string, folderId: string, query: string): Promise<LocalLibrarySearchResult[]> {
  const terms = normalizeSearchText(query).split(/[^a-z0-9]+/).filter((term) => term.length >= 3).slice(0, 8);
  if (!terms.length) return [];
  const db = await getDb();
  const pageRows = getAll<any>(
    db,
    `SELECT pages.document_id, pages.page_number, pages.text_content, documents.name
     FROM course_document_pages pages
     JOIN course_documents documents ON documents.id = pages.document_id
     WHERE documents.user_id = ? AND documents.folder_id = ?`,
    [userId, folderId]
  );
  const meetingRows = getAll<any>(
    db,
    "SELECT id, title, transcript, summary FROM meetings WHERE user_id = ? AND folder_id = ?",
    [userId, folderId]
  );
  const pdfResults = pageRows
    .map((row) => ({
      source: "pdf" as const,
      id: `${row.document_id}:${row.page_number}`,
      documentId: row.document_id,
      title: row.name,
      pageNumber: Number(row.page_number),
      excerpt: excerptAroundTerms(row.text_content, terms),
      score: scoreSearchText(`${row.name} ${row.text_content}`, terms),
    }))
    .filter((result) => result.score > 0);
  const meetingResults = meetingRows
    .map((row) => {
      const content = `${row.transcript || ""}\n${row.summary || ""}`;
      return {
        source: "meeting" as const,
        id: row.id,
        title: row.title,
        excerpt: excerptAroundTerms(content, terms),
        score: scoreSearchText(`${row.title} ${content}`, terms),
      };
    })
    .filter((result) => result.score > 0);
  return [...pdfResults, ...meetingResults].sort((a, b) => b.score - a.score).slice(0, 8);
}

export async function getFolderAiPermission(userId: string, folderId: string) {
  const db = await getDb();
  return !!getSingle<any>(db, "SELECT folder_id FROM folder_ai_permissions WHERE user_id = ? AND folder_id = ?", [userId, folderId]);
}

export async function setFolderAiPermission(userId: string, folderId: string, enabled: boolean) {
  const db = await getDb();
  const folder = getSingle<any>(db, "SELECT id FROM meeting_folders WHERE id = ? AND user_id = ?", [folderId, userId]);
  if (!folder) throw new Error("La carpeta del curso no existe.");
  if (enabled) {
    db.run(
      "INSERT OR REPLACE INTO folder_ai_permissions (user_id, folder_id, enabled_at) VALUES (?, ?, ?)",
      [userId, folderId, nowIso()]
    );
  } else {
    db.run("DELETE FROM folder_ai_permissions WHERE user_id = ? AND folder_id = ?", [userId, folderId]);
  }
  persist(db);
}
export async function getAccountDeletionPreview(userId: string): Promise<AccountDeletionPreview> {
  const db = await getDb();
  const meetings = getAll<any>(db, "SELECT * FROM meetings WHERE user_id = ?", [userId]);
  const folders = getAll<any>(db, "SELECT * FROM meeting_folders WHERE user_id = ?", [userId]);
  const documents = getAll<any>(db, "SELECT id, name, original_filename, size_bytes FROM course_documents WHERE user_id = ?", [userId]);
  const sessions = getAll<any>(db, "SELECT token_hash, created_at, expires_at FROM sessions WHERE user_id = ?", [userId]);
  const recoveryCodes = getAll<any>(
    db,
    "SELECT code_hash, code_salt, created_at, expires_at, used_at FROM password_recovery_codes WHERE user_id = ?",
    [userId]
  );
  const settings = getSingle<any>(db, "SELECT * FROM settings WHERE user_id = ?", [userId]);

  let estimatedBytes = 0;
  for (const meeting of meetings) {
    estimatedBytes += byteLength(meeting.id);
    estimatedBytes += byteLength(meeting.title);
    estimatedBytes += byteLength(meeting.date);
    estimatedBytes += byteLength(meeting.duration);
    estimatedBytes += byteLength(meeting.transcript);
    estimatedBytes += byteLength(meeting.summary);
    estimatedBytes += byteLength(meeting.audio_mime_type);
    estimatedBytes += Number(meeting.audio_size_kb || 0) * 1024;
  }

  for (const folder of folders) {
    estimatedBytes += byteLength(folder.id) + byteLength(folder.name);
  }

  for (const document of documents) {
    estimatedBytes += Number(document.size_bytes || 0);
    estimatedBytes += byteLength(document.id) + byteLength(document.name) + byteLength(document.original_filename);
  }

  if (settings) {
    estimatedBytes += byteLength(settings.ai_provider);
    estimatedBytes += byteLength(settings.api_key);
    estimatedBytes += byteLength(settings.audio_folder);
  }

  estimatedBytes += sessions.length * 160;
  estimatedBytes += recoveryCodes.length * 260;

  return {
    meetings: meetings.length,
    folders: folders.length,
    documents: documents.length,
    drafts: meetings.filter((meeting) => !!meeting.is_draft).length,
    sessions: sessions.length,
    recoveryCodes: recoveryCodes.length,
    hasApiKey: !!settings?.api_key,
    estimatedBytes,
    estimatedHumanSize: formatBytes(estimatedBytes),
  };
}

export async function deleteAccountPermanently(userId: string) {
  const db = await getDb();
  const preview = await getAccountDeletionPreview(userId);
  db.run("DELETE FROM sessions WHERE user_id = ?", [userId]);
  db.run("DELETE FROM password_recovery_codes WHERE user_id = ?", [userId]);
  db.run("DELETE FROM settings WHERE user_id = ?", [userId]);
  db.run("DELETE FROM meetings WHERE user_id = ?", [userId]);
  db.run("DELETE FROM meeting_folders WHERE user_id = ?", [userId]);
  fs.rmSync(path.join(DOCUMENTS_DIR, userId), { recursive: true, force: true });
  db.run("DELETE FROM users WHERE id = ?", [userId]);
  persist(db);
  return preview;
}

export async function deleteAccount(userId: string) {
  await deleteAccountPermanently(userId);
}
