/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from "react";
import { CourseDocument, LibrarySearchResult, Meeting, MeetingFolder } from "../types";
import {
  askCourseLibraryAi,
  deleteCourseDocument,
  fetchCourseAiPermission,
  fetchCourseDocuments,
  saveCourseAiPermission,
  searchCourseMaterials,
  uploadCourseDocument,
} from "../lib/db";
import { BookOpen, CheckCircle2, FileText, FolderPlus, LoaderCircle, MessageSquare, Search, ShieldCheck, Sparkles, Trash2, Upload, X } from "lucide-react";

interface LibraryPanelProps {
  userId: string;
  folders: MeetingFolder[];
  meetings: Meeting[];
  hasApiKey?: boolean;
  onCreateFolder: (name: string) => Promise<MeetingFolder>;
}

type PdfPage = { pageNumber: number; text: string };
const MAX_PDF_BYTES = 20 * 1024 * 1024;

export default function LibraryPanel({ userId, folders, meetings, hasApiKey, onCreateFolder }: LibraryPanelProps) {
  const [selectedFolderId, setSelectedFolderId] = useState("");
  const [documents, setDocuments] = useState<CourseDocument[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<LibrarySearchResult[]>([]);
  const [answer, setAnswer] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState("");
  const [newCourseName, setNewCourseName] = useState("");
  const [isCreatingCourse, setIsCreatingCourse] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [showAiConsent, setShowAiConsent] = useState(false);
  const [isAnswering, setIsAnswering] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const selectedFolder = folders.find((folder) => folder.id === selectedFolderId) || null;
  const courseMeetings = meetings.filter((meeting) => meeting.folderId === selectedFolderId).slice(0, 8);

  useEffect(() => {
    if (!selectedFolderId && folders.length) setSelectedFolderId(folders[0].id);
    if (selectedFolderId && !folders.some((folder) => folder.id === selectedFolderId)) setSelectedFolderId(folders[0]?.id || "");
  }, [folders, selectedFolderId]);

  useEffect(() => {
    if (!selectedFolderId) {
      setDocuments([]);
      setResults([]);
      setAnswer("");
      setAiEnabled(false);
      return;
    }
    void loadCourse(selectedFolderId);
  }, [selectedFolderId]);

  async function loadCourse(folderId: string) {
    setIsLoading(true);
    setError("");
    try {
      const [nextDocuments, permission] = await Promise.all([
        fetchCourseDocuments(userId, folderId),
        fetchCourseAiPermission(userId, folderId),
      ]);
      setDocuments(nextDocuments);
      setAiEnabled(permission);
      setResults([]);
      setAnswer("");
    } catch (err: any) {
      setError(err?.message || "No se pudo cargar este curso.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleCreateCourse() {
    const name = newCourseName.trim();
    if (!name) return;
    setIsCreatingCourse(true);
    setError("");
    try {
      const folder = await onCreateFolder(name);
      setNewCourseName("");
      setSelectedFolderId(folder.id);
    } catch (err: any) {
      setError(err?.message || "No se pudo crear el curso.");
    } finally {
      setIsCreatingCourse(false);
    }
  }

  async function handlePdfSelected(file: File) {
    if (!selectedFolderId) return setError("Crea o selecciona un curso antes de subir un PDF.");
    if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) return setError("Solo puedes subir archivos PDF.");
    if (file.size > MAX_PDF_BYTES) return setError("El PDF supera el limite local de 20 MB.");
    setIsUploading(true);
    setError("");
    try {
      const [pages, fileData] = await Promise.all([extractPdfPages(file), fileToBase64(file)]);
      const saved = await uploadCourseDocument(userId, {
        folderId: selectedFolderId,
        name: file.name.replace(/\.pdf$/i, ""),
        originalFilename: file.name,
        mimeType: file.type,
        fileData,
        pages,
      });
      setDocuments((current) => [saved, ...current]);
    } catch (err: any) {
      setError(err?.message || "No se pudo indexar el PDF.");
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function handleSearch() {
    if (!selectedFolderId || !query.trim()) return;
    setIsLoading(true);
    setAnswer("");
    setError("");
    try {
      setResults(await searchCourseMaterials(userId, selectedFolderId, query.trim()));
    } catch (err: any) {
      setError(err?.message || "No se pudo buscar en las fuentes locales.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAskAi() {
    if (!selectedFolderId || !query.trim()) return;
    if (!aiEnabled) return setShowAiConsent(true);
    await requestAiAnswer();
  }

  async function requestAiAnswer() {
    setIsAnswering(true);
    setError("");
    try {
      const response = await askCourseLibraryAi(userId, selectedFolderId, query.trim());
      setAnswer(response.answer);
      setResults(response.sources);
    } catch (err: any) {
      setError(err?.message || "No se pudo analizar las fuentes locales.");
    } finally {
      setIsAnswering(false);
    }
  }

  async function acceptAiConsent() {
    if (!selectedFolderId) return;
    setIsAnswering(true);
    setError("");
    try {
      await saveCourseAiPermission(userId, selectedFolderId, true);
      setAiEnabled(true);
      setShowAiConsent(false);
      const response = await askCourseLibraryAi(userId, selectedFolderId, query.trim());
      setAnswer(response.answer);
      setResults(response.sources);
    } catch (err: any) {
      setError(err?.message || "No se pudo activar Gemini para este curso.");
    } finally {
      setIsAnswering(false);
    }
  }

  async function handleDeleteDocument(document: CourseDocument) {
    if (!window.confirm(`Eliminar ${document.name} de este curso?`)) return;
    try {
      await deleteCourseDocument(userId, document.id);
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (err: any) {
      setError(err?.message || "No se pudo eliminar el PDF.");
    }
  }

  return (
    <div className="flex min-h-[calc(100vh-130px)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <header className="flex flex-col gap-3 border-b border-slate-200 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#135bf1]/10 text-[#135bf1]"><BookOpen className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-[#135bf1]">Cuaderno de curso</p>
            <h1 className="truncate text-xl font-bold tracking-tight text-slate-950">{selectedFolder?.name || "Biblioteca local"}</h1>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select value={selectedFolderId} onChange={(event) => setSelectedFolderId(event.target.value)} className="h-9 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:border-[#135bf1]">
            <option value="">Curso</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <input value={newCourseName} onChange={(event) => setNewCourseName(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void handleCreateCourse()} placeholder="Nuevo curso" className="h-9 w-32 rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-[#135bf1]" />
          <button onClick={() => void handleCreateCourse()} disabled={isCreatingCourse || !newCourseName.trim()} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#135bf1] px-3 text-xs font-bold text-white disabled:opacity-40"><FolderPlus className="h-3.5 w-3.5" />{isCreatingCourse ? "Creando" : "Crear curso"}</button>
        </div>
      </header>

      {!selectedFolder ? (
        <div className="flex flex-1 items-center justify-center p-8 text-center"><div><BookOpen className="mx-auto h-9 w-9 text-[#135bf1]" /><h2 className="mt-4 text-lg font-bold text-slate-900">Crea tu primer cuaderno</h2><p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">Por ejemplo, crea <strong>Ã‰tica</strong> y luego agrega sus PDFs y reuniones.</p></div></div>
      ) : (
        <div className="grid flex-1 min-h-0 grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)_300px]">
          <aside className="min-h-0 border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><h2 className="text-base font-semibold text-slate-900">Fuentes</h2><span className="text-xs font-semibold text-slate-400">{documents.length}</span></div>
            <div className="p-4">
              <button onClick={() => inputRef.current?.click()} disabled={isUploading} className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white text-xs font-bold text-slate-800 hover:border-[#135bf1] hover:text-[#135bf1] disabled:opacity-50"><Upload className="h-4 w-4" />{isUploading ? "Indexando PDF" : "AÃ±adir fuentes"}</button>
              <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void handlePdfSelected(file); }} />
              <p className="mt-3 text-[11px] leading-5 text-slate-500">Los PDFs se indexan localmente por pÃ¡gina. Subirlos no consume Gemini.</p>
            </div>
            <div className="max-h-[430px] overflow-y-auto border-t border-slate-100">
              {documents.length === 0 ? <p className="p-4 text-xs leading-5 text-slate-500">AÃºn no tienes PDFs en este cuaderno.</p> : documents.map((document) => <div key={document.id} className="group flex items-start gap-2 border-b border-slate-100 px-4 py-3"><FileText className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" /><button onClick={() => window.open(`/api/documents/${encodeURIComponent(document.id)}/file`, "_blank", "noopener,noreferrer")} className="min-w-0 flex-1 text-left"><p className="truncate text-xs font-semibold text-slate-800">{document.name}</p><p className="mt-1 text-[10px] text-slate-500">{document.pageCount} pÃ¡ginas Â· {formatBytes(document.sizeBytes)}</p></button><button onClick={() => void handleDeleteDocument(document)} className="opacity-0 transition-opacity group-hover:opacity-100 text-slate-400 hover:text-rose-600" title="Eliminar PDF"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
            </div>
          </aside>

          <main className="flex min-h-[520px] min-w-0 flex-col border-b border-slate-200 xl:border-b-0 xl:border-r">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3"><div><h2 className="text-base font-semibold text-slate-900">Consulta</h2><p className="text-[11px] text-slate-500">PDFs y reuniones de {selectedFolder.name}</p></div><span className="text-[10px] font-bold text-emerald-700">BÃºsqueda local</span></div>
            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              {error && <p className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700">{error}</p>}
              {isLoading && <div className="flex items-center gap-2 text-sm text-slate-500"><LoaderCircle className="h-4 w-4 animate-spin" />Buscando en tus fuentes...</div>}
              {!isLoading && !answer && results.length === 0 && <div className="mx-auto flex max-w-md flex-col items-center justify-center py-20 text-center"><Search className="h-10 w-10 text-[#135bf1]/40" /><h3 className="mt-4 text-base font-semibold text-slate-800">Pregunta sobre tu material</h3><p className="mt-2 text-sm leading-6 text-slate-500">Olli busca primero en los PDFs y transcripciones guardadas en {selectedFolder.name}.</p></div>}
              {answer && <div className="mb-5 rounded-xl border border-blue-100 bg-blue-50/60 p-4"><p className="text-[10px] font-black uppercase tracking-widest text-[#135bf1]">Respuesta basada en fuentes locales</p><p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">{answer}</p></div>}
              {!isLoading && results.length > 0 && <div className="space-y-3"><p className="text-xs font-bold text-slate-500">Evidencia encontrada</p>{results.map((result) => <div key={`${result.source}-${result.id}`}><SearchResultCard result={result} /></div>)}</div>}
            </div>
            <div className="border-t border-slate-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row"><label className="flex h-11 min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-300 px-3 focus-within:border-[#135bf1]"><Search className="h-4 w-4 shrink-0 text-slate-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void handleSearch()} placeholder="Escribe una pregunta sobre Ã‰tica..." className="min-w-0 flex-1 bg-transparent text-sm outline-none" /></label><button onClick={() => void handleSearch()} disabled={!query.trim() || isLoading} className="h-11 rounded-lg border border-slate-300 px-3 text-xs font-bold text-slate-700 disabled:opacity-40">Buscar</button><button onClick={() => void handleAskAi()} disabled={!query.trim() || !hasApiKey || isAnswering} className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-[#135bf1] px-3 text-xs font-bold text-white disabled:opacity-40"><Sparkles className="h-4 w-4" />{isAnswering ? "Analizando" : "IA"}</button></div>
            </div>
          </main>

          <aside className="min-h-0 bg-slate-50/40">
            <div className="border-b border-slate-200 px-4 py-3"><h2 className="text-base font-semibold text-slate-900">Curso</h2><p className="text-[11px] text-slate-500">Material relacionado</p></div>
            <div className="p-4"><div className="rounded-xl border border-slate-200 bg-white p-3"><div className="flex items-center gap-2"><ShieldCheck className={`h-4 w-4 ${aiEnabled ? "text-emerald-600" : "text-slate-400"}`} /><p className="text-xs font-bold text-slate-800">Gemini {aiEnabled ? "autorizado" : "desactivado"}</p></div><p className="mt-2 text-[11px] leading-5 text-slate-500">{aiEnabled ? "Solo se usa cuando pulsas IA en una consulta." : "La bÃºsqueda local es gratuita. La IA requiere tu autorizaciÃ³n para este curso."}</p>{!aiEnabled && hasApiKey && <button onClick={() => setShowAiConsent(true)} className="mt-3 text-xs font-bold text-[#135bf1]">Revisar permiso de IA</button>}</div></div>
            <div className="border-t border-slate-200 px-4 py-3"><div className="flex items-center justify-between"><p className="text-xs font-bold text-slate-700">Reuniones de {selectedFolder.name}</p><span className="text-[10px] font-semibold text-slate-400">{courseMeetings.length}</span></div></div>
            <div className="max-h-[360px] overflow-y-auto">{courseMeetings.length === 0 ? <p className="px-4 py-5 text-xs leading-5 text-slate-500">AÃºn no hay reuniones vinculadas a este curso.</p> : courseMeetings.map((meeting) => <div key={meeting.id} className="flex gap-2 border-b border-slate-100 px-4 py-3"><MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-[#135bf1]" /><div className="min-w-0"><p className="truncate text-xs font-semibold text-slate-800">{meeting.title}</p><p className="mt-1 text-[10px] text-slate-500">{meeting.duration} Â· TranscripciÃ³n disponible</p></div></div>)}</div>
          </aside>
        </div>
      )}

      {showAiConsent && <div className="fixed inset-0 z-50 flex items-center justify-center p-4"><button className="absolute inset-0 bg-slate-950/40" aria-label="Cerrar" onClick={() => setShowAiConsent(false)} /><div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"><button onClick={() => setShowAiConsent(false)} className="absolute right-3 top-3 text-slate-400"><X className="h-4 w-4" /></button><Sparkles className="h-6 w-6 text-[#135bf1]" /><h2 className="mt-3 text-lg font-bold text-slate-950">Activar anÃ¡lisis con Gemini</h2><p className="mt-2 text-sm leading-6 text-slate-600">Olli enviarÃ¡ solo fragmentos locales relevantes de <strong>{selectedFolder?.name}</strong> para responder tu consulta. Esto puede consumir cuota de tu API.</p><p className="mt-2 text-xs leading-5 text-slate-500">Subir PDFs y buscar localmente no consume Gemini.</p><div className="mt-6 flex justify-end gap-2"><button onClick={() => setShowAiConsent(false)} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600">Cancelar</button><button onClick={() => void acceptAiConsent()} disabled={isAnswering} className="h-10 rounded-lg bg-[#135bf1] px-4 text-xs font-bold text-white disabled:opacity-50">Autorizar y analizar</button></div></div></div>}
    </div>
  );
}

function SearchResultCard({ result }: { result: LibrarySearchResult }) {
  const source = result.source === "pdf" ? `PDF Â· pÃ¡g. ${result.pageNumber}` : "ReuniÃ³n guardada";
  return <article className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center justify-between gap-3"><span className="text-[10px] font-black uppercase tracking-widest text-[#135bf1]">{source}</span><span className="truncate text-xs font-bold text-slate-700">{result.title}</span></div><p className="mt-2 text-sm leading-6 text-slate-600">{result.excerpt}</p></article>;
}

async function extractPdfPages(file: File): Promise<PdfPage[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/legacy/build/pdf.worker.mjs", import.meta.url).toString();
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
  const pages: PdfPage[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const text = content.items.map((item: any) => item.str || "").join(" ").replace(/\s+/g, " ").trim();
    if (text) pages.push({ pageNumber, text });
  }
  return pages;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop() || "");
    reader.onerror = () => reject(new Error("No se pudo leer el PDF."));
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}