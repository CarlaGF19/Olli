/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import { Meeting } from "../types";
import { formatInUTC5 } from "../lib/dateUtils";
import { jsPDF } from "jspdf";
import {
  FileText,
  Search,
  Calendar,
  Clock,
  Pin,
  Trash2,
  Copy,
  Check,
  Download,
  Share2,
  BookOpen,
  ChevronRight,
  Filter,
  Sparkles,
  RefreshCw,
  Mail,
  Send,
  X,
  Play,
  Pause,
  AlertTriangle,
  UserCheck,
  ChevronLeft,
  ArrowRight,
  HelpCircle,
  FolderOpen,
  FileAudio
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface MeetingViewerProps {
  meetings: Meeting[];
  selectedMeeting: Meeting | null;
  onSelectMeeting: (meeting: Meeting) => void;
  onDeleteMeeting: (id: string) => void;
  onToggleFavorite: (id: string) => void;
  onUpdateMeetingTitle: (id: string, newTitle: string) => void;
  onUpdateMeeting: (id: string, updatedFields: Partial<Meeting>) => void;
}

interface ChatMessage {
  role: "user" | "model";
  content: string;
  timestamp: string;
}

export default function MeetingViewer({
  meetings,
  selectedMeeting,
  onSelectMeeting,
  onDeleteMeeting,
  onToggleFavorite,
  onUpdateMeetingTitle,
  onUpdateMeeting,
}: MeetingViewerProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<"summary" | "transcript">("summary");
  const [copied, setCopied] = useState(false);
  const [filterFavorites, setFilterFavorites] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState("");
  
  // Custom states for draft summarization
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summarizationError, setSummarizationError] = useState("");

  // Email PDF Dispatch States
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailNote, setEmailNote] = useState("");
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [emailSuccess, setEmailSuccess] = useState<string | null>(null);
  const [testMessageBoxUrl, setTestMessageBoxUrl] = useState<string | null>(null);

  // Otter.ai Interactive Audio Player Simulation
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackProgress, setPlaybackProgress] = useState(35); // 35% default
  const [currentTimeStr, setCurrentTimeStr] = useState("0:12");

  // Otter.ai Double-Pane AI Chat assistant state
  const [isChatPanelOpen, setIsChatPanelOpen] = useState(true);
  const [chatTab, setChatTab] = useState<"chat" | "outline" | "comments">("chat");
  const [userChatMessage, setUserChatMessage] = useState("");
  const [isGeneratingChat, setIsGeneratingChat] = useState(false);
  const [chatError, setChatError] = useState("");
  
  // Chat Conversations keyed by meeting ID
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  // Initialize and load chat history for selected meeting
  useEffect(() => {
    if (selectedMeeting && !conversations[selectedMeeting.id]) {
      // Set initial welcoming message from Olli
      const welcomeMsg: ChatMessage = {
        role: "model",
        content: `¡Hola! Soy **Olli**, tu asistente inteligente. He analizado la sesión **"${selectedMeeting.title}"** en tiempo real. 

¿De qué te gustaría hablar hoy? Puedo ayudarte a extraer decisiones tomadas, planes de acción, tareas asignadas o resumir algún tema en particular de esta transcripción.`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setConversations(prev => ({
        ...prev,
        [selectedMeeting.id]: [welcomeMsg]
      }));
    }
  }, [selectedMeeting]);

  // Keep chat scrolled down
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversations, selectedMeeting, isGeneratingChat]);

  const handleSummarizeDraftText = async (meeting: Meeting) => {
    if (!meeting.transcript || meeting.transcript.trim().length === 0) {
      setSummarizationError("La transcripción está vacía. Graba o agrega un borrador con palabras reales para resumir.");
      return;
    }

    setIsSummarizing(true);
    setSummarizationError("");

    try {
      const storedSettingsStr = localStorage.getItem("meeting_brain_settings");
      let customApiKey = "";
      if (storedSettingsStr) {
        try {
          const stored = JSON.parse(storedSettingsStr);
          customApiKey = stored.apiKey || "";
        } catch (e) {}
      }

      const response = await fetch("/api/summarize-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: meeting.transcript,
          apiKey: customApiKey,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "No se pudo conectar con el motor de IA para resumir.");
      }

      const data = await response.json();
      onUpdateMeeting(meeting.id, {
        title: data.title,
        summary: data.summary,
        isDraft: false
      });

      setActiveTab("summary");
    } catch (err: any) {
      console.error("Text Summary Error:", err);
      setSummarizationError(err.message || "Fallo inesperado al resumir el borrador de texto.");
    } finally {
      setIsSummarizing(false);
    }
  };

  // Search and filter meetings
  const filteredMeetings = meetings.filter((meeting) => {
    const matchesSearch =
      meeting.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      meeting.transcript.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (filterFavorites) {
      return matchesSearch && meeting.isFavorite;
    }
    return matchesSearch;
  });

  const handleCopyClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const startEditTitle = (meeting: Meeting) => {
    setEditTitleValue(meeting.title);
    setIsEditingTitle(true);
  };

  const saveEditTitle = (id: string) => {
    if (editTitleValue.trim()) {
      onUpdateMeetingTitle(id, editTitleValue.trim());
    }
    setIsEditingTitle(false);
  };

  // Exporters for general structured formats
  const downloadFile = (fileName: string, content: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportMarkdown = (meeting: Meeting) => {
    const mdContent = `# ${meeting.title}
Fecha: ${formatInUTC5(meeting.date, "datetime")} (UTC-5)
Duration: ${meeting.duration}

## AI Summary & Actions
${meeting.summary}

## Verbatim Transcript
${meeting.transcript}
`;
    const cleanName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${cleanName}-notes.md`, mdContent, "text/markdown");
  };

  const handleExportJSON = (meeting: Meeting) => {
    const jsonStr = JSON.stringify(meeting, null, 2);
    const cleanName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    downloadFile(`${cleanName}-vault.json`, jsonStr, "application/json");
  };

  const generatePDFDoc = (meeting: Meeting): jsPDF => {
    const doc = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: "a4",
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 20;
    const maxLineWidth = pageWidth - (margin * 2);

    let yPosition = 25;

    const checkPageOverflow = (neededHeight: number) => {
      if (yPosition + neededHeight > pageHeight - margin) {
        doc.addPage();
        drawPageBackground();
        yPosition = 25;
      }
    };

    const drawPageBackground = () => {
      // Top accent bar
      doc.setFillColor(19, 91, 241); // Olli style Blue
      doc.rect(0, 0, pageWidth, 4, "F");

      // Footer
      doc.setFont("Helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text(`Olli AI Report  |  ${meeting.title}`, margin, pageHeight - 10);
      const pageNum = doc.getNumberOfPages();
      doc.text(`Pag. ${pageNum}`, pageWidth - margin - 15, pageHeight - 10);
    };

    drawPageBackground();

    // Document Header
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(17, 17, 17);
    const titleLines = doc.splitTextToSize(meeting.title, maxLineWidth);
    doc.text(titleLines, margin, yPosition);
    yPosition += (titleLines.length * 8) + 4;

    // Subheader / Metadata
    doc.setFont("Helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(120, 120, 130);
    const dateStr = `Fecha: ${formatInUTC5(meeting.date, "datetime")} (UTC-5)`;
    const durationStr = `Duracion: ${meeting.duration}`;
    doc.text(`${dateStr}   |   ${durationStr}`, margin, yPosition);
    yPosition += 8;

    // Horizontal line separator
    doc.setDrawColor(242, 242, 242);
    doc.setLineWidth(0.5);
    doc.line(margin, yPosition, pageWidth - margin, yPosition);
    yPosition += 12;

    // Sections
    doc.setFont("Helvetica", "bold");
    doc.setFontSize(14);
    doc.setTextColor(19, 91, 241);
    doc.text("AI MINUTES & WORKSPACE REPORT", margin, yPosition);
    yPosition += 10;

    const summaryLines = meeting.summary.split("\n");
    doc.setTextColor(51, 65, 85);

    summaryLines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed === "") {
        yPosition += 4;
        return;
      }

      if (trimmed.startsWith("###")) {
        const text = trimmed.replace(/^###\s*/, "").toUpperCase();
        checkPageOverflow(10);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(19, 91, 241);
        doc.text(text, margin, yPosition);
        yPosition += 7;
      } else if (trimmed.startsWith("##")) {
        const text = trimmed.replace(/^##\s*/, "");
        checkPageOverflow(12);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(17, 17, 17);
        doc.text(text, margin, yPosition);
        yPosition += 8;
      } else if (trimmed.startsWith("#")) {
        const text = trimmed.replace(/^#\s*/, "");
        checkPageOverflow(15);
        doc.setFont("Helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(19, 91, 241);
        doc.text(text, margin, yPosition);
        yPosition += 9;
      } else {
        doc.setFont("Helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(60, 60, 70);

        let textToPrint = trimmed;
        let leftOffset = margin;

        if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
          textToPrint = trimmed.replace(/^[-*]\s+/, "");
          doc.text("o", margin, yPosition);
          leftOffset = margin + 5;
        } else {
          const checklistMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
          if (checklistMatch) {
            const checked = checklistMatch[1].toLowerCase() === "x";
            textToPrint = (checked ? "[X] " : "[ ] ") + checklistMatch[2];
            leftOffset = margin + 2;
          }
        }

        // Clean bold Markdown delimiters
        textToPrint = textToPrint.replace(/\*\*/g, "");

        const splitText = doc.splitTextToSize(textToPrint, pageWidth - leftOffset - margin);
        checkPageOverflow(splitText.length * 5.2);
        doc.text(splitText, leftOffset, yPosition);
        yPosition += (splitText.length * 5.2);
      }
    });

    return doc;
  };

  const handleExportPDF = (meeting: Meeting) => {
    const doc = generatePDFDoc(meeting);
    const cleanName = meeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    doc.save(`${cleanName}-olli.pdf`);
  };

  const handleSendEmail = async () => {
    if (!selectedMeeting) return;
    if (!recipientEmail || !recipientEmail.trim()) {
      setEmailError("Por favor ingresa un correo electrónico de destino válido.");
      return;
    }

    setIsSendingEmail(true);
    setEmailError("");
    setEmailSuccess(null);
    setTestMessageBoxUrl(null);

    try {
      const doc = generatePDFDoc(selectedMeeting);
      const pdfBase64DataUri = doc.output("datauristring");
      const cleanName = selectedMeeting.title.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      const pdfFilename = `${cleanName}-resumen.pdf`;

      const response = await fetch("/api/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipientEmail,
          subject: emailSubject || `Acta de Reunión: ${selectedMeeting.title}`,
          body: emailNote,
          pdfBase64: pdfBase64DataUri,
          pdfFilename,
          title: selectedMeeting.title,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || "No se pudo despachar el correo electrónico.");
      }

      const result = await response.json();
      
      if (result.success) {
        setEmailSuccess(result.message);
        if (result.isTestAccount && result.testMessageBoxUrl) {
          setTestMessageBoxUrl(result.testMessageBoxUrl);
        }
        // Limpiar campos importantes
        setRecipientEmail("");
        setEmailNote("");
      } else {
        throw new Error(result.error || "Ocurrió un error inesperado al despachar.");
      }

    } catch (err: any) {
      console.error("Failed to send email:", err);
      setEmailError(err.message || "Error al enviar el correo con el PDF adjunto.");
    } finally {
      setIsSendingEmail(false);
    }
  };

  // Otter.ai Interactive Ask Q&A handler
  const handleQueryOlliChat = async (questionText: string) => {
    if (!selectedMeeting || !questionText || !questionText.trim()) return;

    setUserChatMessage("");
    setChatError("");
    setIsGeneratingChat(true);

    const userMsg: ChatMessage = {
      role: "user",
      content: questionText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    // Append user message
    const currentHistory = conversations[selectedMeeting.id] || [];
    const updatedHistory = [...currentHistory, userMsg];
    setConversations(prev => ({
      ...prev,
      [selectedMeeting.id]: updatedHistory
    }));

    try {
      const storedSettingsStr = localStorage.getItem("meeting_brain_settings");
      let customApiKey = "";
      if (storedSettingsStr) {
        try {
          const stored = JSON.parse(storedSettingsStr);
          customApiKey = stored.apiKey || "";
        } catch (e) {}
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: selectedMeeting.transcript,
          messages: updatedHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
          userMessage: questionText,
          apiKey: customApiKey,
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Ocurrió un error al contactar al motor de Olli.");
      }

      const data = await response.json();
      const modelMsg: ChatMessage = {
        role: "model",
        content: data.response,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setConversations(prev => ({
        ...prev,
        [selectedMeeting.id]: [...updatedHistory, modelMsg]
      }));

    } catch (err: any) {
      console.error("Olli Chat Error:", err);
      setChatError(err.message || "No se pudo obtener respuesta.");
    } finally {
      setIsGeneratingChat(false);
    }
  };

  // Custom parser rendering Markdown to HTML neatly
  const renderMarkdown = (markdownText: string) => {
    if (!markdownText) return <p className="text-slate-450 italic">No notes data present.</p>;
    
    const lines = markdownText.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith("###")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-[#111111] tracking-wide uppercase mt-4 mb-2">
            {trimmed.replace(/^###\s*/, "")}
          </h4>
        );
      }
      if (trimmed.startsWith("##")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-[#111111] border-b border-slate-100 pb-1.5 mt-6 mb-3">
            {trimmed.replace(/^##\s*/, "")}
          </h3>
        );
      }
      if (trimmed.startsWith("#")) {
        return (
          <h2 key={idx} className="text-lg font-black text-[#135bf1] mt-6 mb-4 font-sans tracking-tight">
            {trimmed.replace(/^#\s*/, "")}
          </h2>
        );
      }

      // Checklists (Task Lists)
      const checklistMatch = trimmed.match(/^[-*]\s+\[([ xX])\]\s+(.*)/);
      if (checklistMatch) {
        const checked = checklistMatch[1].toLowerCase() === "x";
        const text = checklistMatch[2];
        return (
          <div key={idx} className="flex items-start space-x-2.5 my-2 pl-2">
            <input
              type="checkbox"
              checked={checked}
              readOnly
              className="mt-1 h-3.5 w-3.5 rounded border-slate-300 text-[#135bf1] focus:ring-[#135bf1] shrink-0"
            />
            <span className={`text-[12px] leading-relaxed ${checked ? "text-slate-400 line-through" : "text-slate-750"}`}>
              {text}
            </span>
          </div>
        );
      }

      // Standard Unordered Lists
      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <li key={idx} className="text-[12px] text-slate-750 leading-relaxed my-1.5 list-disc pl-1 ml-4">
            {trimmed.replace(/^[-*]\s+/, "")}
          </li>
        );
      }

      // Empty Lines
      if (trimmed === "") {
        return <div key={idx} className="h-2" />;
      }

      // Bold text replacements
      let lineWithBold = trimmed;
      const boldRegex = /\*\*(.*?)\*\*/g;
      const parts = [];
      let lastIndex = 0;
      let match;
      
      while ((match = boldRegex.exec(trimmed)) !== null) {
        if (match.index > lastIndex) {
          parts.push(trimmed.substring(lastIndex, match.index));
        }
        parts.push(
          <strong key={match.index} className="font-bold text-[#111111]">
            {match[1]}
          </strong>
        );
        lastIndex = boldRegex.lastIndex;
      }
      
      if (lastIndex < trimmed.length) {
        parts.push(trimmed.substring(lastIndex));
      }

      return (
        <p key={idx} className="text-[12px] text-slate-655 leading-relaxed my-1.5">
          {parts.length > 0 ? parts : trimmed}
        </p>
      );
    });
  };

  return (
    <div className="flex h-[calc(100vh-140px)] gap-6 select-none font-sans relative">
      
      {/* 1. Left Vault Explorer List */}
      <div id="vault_explorer" className="w-[280px] bg-slate-50/20 border border-[#E9E9EB] rounded-3xl flex flex-col overflow-hidden shrink-0 max-lg:hidden">
        
        {/* Explorer header info */}
        <div className="p-4 border-b border-[#E9E9EB] bg-white/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-[#111111] tracking-tight uppercase">
              Bóveda Local
            </span>
            <button
              onClick={() => setFilterFavorites(!filterFavorites)}
              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                filterFavorites
                  ? "bg-[#135bf1]/5 border-slate-200 text-[#135bf1]"
                  : "bg-transparent border-transparent text-slate-400 hover:text-slate-600"
              }`}
              title="Filter pinned notes"
            >
              <Filter className="w-3.5 h-3.5" />
            </button>
          </div>
          
          {/* Searching vault */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3" />
            <input
              type="text"
              placeholder="Search conversations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-[#F4F4F5] pl-9 pr-3 py-1.5 border border-transparent focus:bg-white text-xs rounded-xl outline-none transition-all focus:border-[#EBEBEB]"
            />
          </div>
        </div>

        {/* Saved notes render container */}
        <div className="flex-grow overflow-y-auto p-2.5 space-y-1.5">
          {filteredMeetings.length === 0 ? (
            <div className="text-center py-16 px-4 flex flex-col items-center">
              <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-3 shadow-inner">
                <FolderOpen className="w-6 h-6 text-slate-400" />
              </div>
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Bóveda Vacía</p>
              <p className="text-[10px] text-slate-400 mt-1 leading-normal max-w-[160px] mx-auto text-center">No se encontraron apuntes o actas guardadas</p>
            </div>
          ) : (
            filteredMeetings.map((meeting) => {
              const representsActive = selectedMeeting?.id === meeting.id;
              return (
                <div
                  key={meeting.id}
                  onClick={() => onSelectMeeting(meeting)}
                  className={`p-2.5 rounded-xl cursor-pointer transition-all flex items-start gap-3 group relative border ${
                    representsActive
                      ? "bg-[#135bf1]/5 border-[#135bf1]/20 shadow-sm"
                      : "bg-transparent hover:bg-slate-50/80 border-transparent"
                  }`}
                >
                  {/* Styled Note Indicator Icon */}
                  <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center transition-colors shrink-0 ${
                    representsActive 
                      ? "bg-[#135bf1] text-white" 
                      : "bg-slate-100 text-slate-500 group-hover:bg-[#135bf1]/10 group-hover:text-[#135bf1]"
                  }`}>
                    <FileAudio className="w-4.5 h-4.5" />
                  </div>

                  <div className="min-w-0 flex-grow pr-1">
                    <span className={`text-[12px] font-bold block truncate transition-colors leading-tight ${
                      representsActive ? "text-[#135bf1]" : "text-slate-800 group-hover:text-[#135bf1]"
                    }`}>
                      {meeting.title}
                    </span>
                    <div className="flex items-center space-x-1.5 text-[9.5px] text-slate-400 mt-1 font-semibold">
                      <span className="flex items-center">
                        <Calendar className="w-3 h-3 mr-0.5 shrink-0 text-slate-400" />
                        {formatInUTC5(meeting.date, "shortDate")}
                      </span>
                      <span>•</span>
                      <span className="flex items-center truncate">
                        <Clock className="w-3 h-3 mr-0.5 shrink-0 text-slate-400" />
                        {meeting.duration}
                      </span>
                    </div>
                  </div>
                  
                  {meeting.isFavorite && (
                    <Pin className="w-3.5 h-3.5 text-[#135bf1] fill-[#135bf1] shrink-0 mt-1" />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 2. Interactive Double Pane (Main Workspace & Ask Olli AI Column) */}
      <div id="notes_workspace" className="flex-grow bg-white border border-[#E9E9EB] rounded-3xl flex flex-row overflow-hidden shadow-sm">
        {selectedMeeting ? (
          <div className="flex w-full h-full">
            
            {/* Left Pane - Document text and media */}
            <div className="flex-grow flex flex-col h-full min-w-0 border-r border-[#E9E9EB] relative">
              
              {/* Doc Workspace header controls */}
              <div className="p-5 border-b border-[#E9E9EB] bg-slate-50/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex-grow min-w-0">
                  {isEditingTitle ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        value={editTitleValue}
                        onChange={(e) => setEditTitleValue(e.target.value)}
                        onBlur={() => saveEditTitle(selectedMeeting.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveEditTitle(selectedMeeting.id);
                          if (e.key === "Escape") setIsEditingTitle(false);
                        }}
                        className="text-base font-bold text-slate-800 border-b border-[#135bf1] px-1 bg-transparent py-0.5 focus:outline-none w-full max-w-sm"
                        autoFocus
                      />
                      <button
                        onClick={() => saveEditTitle(selectedMeeting.id)}
                        className="text-xs bg-[#135bf1] text-white px-2 py-1 rounded-lg cursor-pointer font-bold"
                      >
                        Save
                      </button>
                    </div>
                  ) : (
                    <h1
                      onClick={() => startEditTitle(selectedMeeting)}
                      className="text-base font-black text-[#111111] tracking-tight leading-snug cursor-pointer group hover:text-[#135bf1] flex items-center shrink-0"
                      title="Click to rename"
                    >
                      <span className="truncate">{selectedMeeting.title}</span>
                      <span className="text-[10px] text-slate-300 ml-2 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                        [Click to Edit]
                      </span>
                    </h1>
                  )}
                  
                  <div className="flex items-center space-x-4 text-[10px] text-slate-400 mt-2 font-semibold">
                    <span className="flex items-center">
                      <Calendar className="w-3.5 h-3.5 mr-1" />
                      {formatInUTC5(selectedMeeting.date, "datetime")} (UTC-5)
                    </span>
                    <span className="flex items-center">
                      <Clock className="w-3.5 h-3.5 mr-1" />
                      {selectedMeeting.duration}
                    </span>
                    <span>Size: {selectedMeeting.audioSizeKb || 120} KB</span>
                  </div>
                </div>

                {/* Toolbar widgets */}
                <div className="flex items-center space-x-1.5 shrink-0">
                  <button
                    onClick={() => onToggleFavorite(selectedMeeting.id)}
                    className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                      selectedMeeting.isFavorite
                        ? "bg-[#135bf1]/5 border-slate-100 text-[#135bf1]"
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-400 hover:text-slate-600"
                    }`}
                    title="Pin File to Chest"
                  >
                    <Pin className={`w-3.5 h-3.5 ${selectedMeeting.isFavorite ? "fill-[#135bf1]" : ""}`} />
                  </button>
                  <button
                    onClick={() => handleExportMarkdown(selectedMeeting)}
                    className="p-2 rounded-xl bg-white border border-[#E9E9EB] hover:bg-slate-50 text-slate-500 hover:text-slate-700 transition-colors cursor-pointer"
                    title="Exportar Markdown"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleExportPDF(selectedMeeting)}
                    className="p-2 rounded-xl bg-white border border-[#E9E9EB] hover:bg-emerald-55 text-slate-500 hover:text-emerald-600 transition-colors cursor-pointer"
                    title="Descargar PDF"
                  >
                    <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  </button>
                  
                  {/* Share pill selector button */}
                  <button
                    onClick={() => {
                      setIsEmailModalOpen(true);
                      setEmailSubject(`Acta de Reunión: ${selectedMeeting.title}`);
                      setEmailSuccess(null);
                      setEmailError("");
                      setTestMessageBoxUrl(null);
                    }}
                    className="px-3.5 py-1.5 rounded-full bg-[#135bf1] hover:bg-[#0746cc] text-white flex items-center gap-1.5 text-xs font-bold shadow-xs cursor-pointer transition-all active:scale-95"
                    title="Share meeting note via E-mail"
                  >
                    <Mail className="w-3.5 h-3.5" />
                    <span>Share</span>
                  </button>
                  
                  <button
                    onClick={() => onDeleteMeeting(selectedMeeting.id)}
                    className="p-2 rounded-xl bg-white border border-[#E9E9EB] hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                    title="Delete File"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* 💡 DRAFT AI SUMMARY TRIGGER BANNER */}
              {selectedMeeting.isDraft && (
                <div className="mx-6 mt-4 p-4 bg-amber-50 border border-amber-200/60 rounded-xl text-left flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex-1">
                    <h3 className="text-xs font-bold text-amber-900 flex items-center gap-1.5 uppercase tracking-wide">
                      <Sparkles className="w-4 h-4 text-amber-650 animate-pulse shrink-5" />
                      Borrador Guardado en Tiempo Real (Protección de Sesión)
                    </h3>
                    <p className="text-[11px] text-amber-800 leading-relaxed mt-1">
                      Esta conversación se guardó automáticamente en vivo para proteger tus apuntes de cortes de internet o límites de servidor. ¿Quieres usar nuestro motor de IA ultrarrápido para redactar un resumen ejecutivo y plan de acción estructurado?
                    </p>
                    {summarizationError && (
                      <p className="text-[11px] text-rose-600 font-semibold mt-2 bg-rose-50 p-2 rounded-lg border border-rose-100">
                        ⚠️ Error: {summarizationError}
                      </p>
                    )}
                  </div>
                  <div className="shrink-0 w-full md:w-auto">
                    <button
                      type="button"
                      onClick={() => handleSummarizeDraftText(selectedMeeting)}
                      disabled={isSummarizing || !selectedMeeting.transcript}
                      className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-2 w-full md:w-auto bg-gradient-to-tr from-amber-600 to-amber-500 hover:from-amber-700 hover:to-amber-550 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-amber-600/15 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isSummarizing ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="w-3.5 h-3.5" />
                      )}
                      <span>{isSummarizing ? "Generando..." : "Resumir Borrador con IA"}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Document body navigation selector */}
              <div className="px-6 border-b border-[#F2F2F2] flex items-center justify-between bg-slate-50/10">
                <div className="flex space-x-1.5 py-1.5">
                  <button
                    onClick={() => setActiveTab("summary")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                      activeTab === "summary"
                        ? "bg-[#135bf1]/5 text-[#135bf1]"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Summary</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("transcript")}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                      activeTab === "transcript"
                        ? "bg-[#135bf1]/5 text-[#135bf1]"
                        : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span>Transcript</span>
                  </button>
                </div>

                {/* Copy options */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() =>
                      handleCopyClipboard(
                        activeTab === "summary" ? selectedMeeting.summary : selectedMeeting.transcript
                      )
                    }
                    className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 rounded-lg text-[10px] font-bold text-slate-500 flex items-center space-x-1.5 transition-colors cursor-pointer border border-[#E9E9EB]"
                  >
                    {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
              </div>

              {/* Display notes area */}
              <div className="flex-grow overflow-y-auto p-6 bg-slate-50/5 relative">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeTab}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 4 }}
                    transition={{ duration: 0.12 }}
                    className="bg-white border border-[#E9E9EB]/50 rounded-2xl p-5 shadow-2xs text-left"
                  >
                    {activeTab === "summary" ? (
                      <div id="markdown_body" className="space-y-2 leading-relaxed font-sans">
                        {renderMarkdown(selectedMeeting.summary)}
                      </div>
                    ) : (
                      <div className="font-sans text-slate-700 leading-relaxed text-sm whitespace-pre-wrap font-medium space-y-3">
                        {selectedMeeting.transcript ? (
                          selectedMeeting.transcript.split("\n").map((line, idx) => {
                            const match = line.match(/^\[(\d{2}:\d{2})\]\s*(.*?):\s*(.*)/);
                            if (match) {
                              const timestamp = match[1];
                              const speaker = match[2];
                              const utterance = match[3];
                              return (
                                <div key={idx} className="flex flex-col md:flex-row md:items-start gap-2.5 pb-2 border-b border-[#F4F4F5] last:border-b-0">
                                  <div className="flex items-center gap-2 shrink-0 md:w-32">
                                    <span className="text-[10px] bg-[#EBEBEB] text-[#111111] px-1.5 py-0.5 rounded-sm font-semibold font-mono">
                                      {timestamp}
                                    </span>
                                    <span className="text-xs font-bold text-[#111111] truncate max-w-[80px]" title={speaker}>
                                      {speaker}
                                    </span>
                                  </div>
                                  <p className="text-xs text-slate-655 text-left flex-grow">
                                    {utterance}
                                  </p>
                                </div>
                              );
                            }
                            return (
                              <p key={idx} className="text-xs text-slate-655 text-left">
                                {line}
                              </p>
                            );
                          })
                        ) : (
                          <p className="font-sans italic text-slate-400 text-xs text-center py-8">
                            No transcript content returned.
                          </p>
                        )}
                      </div>
                    )}
                  </motion.div>
                </AnimatePresence>
              </div>

              {/* Otter.ai style bottom Audio Player mimicking the screenshot player */}
              <div className="bg-[#FAF9F6] border-t border-[#E9E9EB] px-6 py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-10 h-10 rounded-full bg-[#135bf1] text-white flex items-center justify-center shrink-0 hover:bg-[#0746cc] active:scale-95 transition-transform"
                  >
                    {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white ml-0.5" />}
                  </button>
                  <div>
                    <p className="text-xs font-bold text-[#111111] block leading-none">Play Recording</p>
                    <p className="text-[10px] text-slate-400 mt-1 leading-none">{currentTimeStr} / {selectedMeeting.duration}</p>
                  </div>
                </div>
                
                {/* Simulated Timeline bar */}
                <div className="flex-grow max-w-md bg-slate-200 h-1.5 rounded-full relative cursor-pointer group overflow-hidden">
                  <div 
                    className="bg-[#135bf1] h-full rounded-full transition-all" 
                    style={{ width: `${playbackProgress}%` }}
                  />
                  <div className="absolute right-0 top-0 h-full w-2 bg-gradient-to-r from-transparent to-[#135bf1] animate-pulse" />
                </div>

                <div>
                  <button 
                    onClick={() => setIsChatPanelOpen(!isChatPanelOpen)}
                    className="px-3.5 py-1 border border-[#E9E9EB] hover:bg-white text-[11px] font-bold text-slate-700 bg-transparent rounded-lg transition-colors cursor-pointer"
                  >
                    {isChatPanelOpen ? "Close Assistant" : "Olli AI Chat"}
                  </button>
                </div>
              </div>

            </div>

            {/* Right Pane - Otter Olli AI Assistant Interactive Chat column */}
            <AnimatePresence>
              {isChatPanelOpen && (
                <motion.div
                  id="olli_assistant_column"
                  initial={{ width: 0, opacity: 0 }}
                  animate={{ width: 360, opacity: 1 }}
                  exit={{ width: 0, opacity: 0 }}
                  transition={{ type: "tween", duration: 0.2 }}
                  className="bg-[#FAF9F6] flex flex-col h-full shrink-0 border-l border-[#EBEBEB] overflow-hidden"
                >
                  {/* Olli Header */}
                  <div className="p-4 border-b border-[#E9E9EB] flex items-center justify-between bg-white">
                    <div className="flex items-center gap-2">
                      <div className="w-6.5 h-6.5 rounded-full bg-[#135bf1]/10 flex items-center justify-center">
                        <Sparkles className="w-3.5 h-3.5 text-[#135bf1]" />
                      </div>
                      <span className="text-xs font-bold text-[#111111] tracking-tight">Olli AI Assistant</span>
                    </div>

                    <button 
                      onClick={() => setIsChatPanelOpen(false)}
                      className="p-1 hover:bg-[#F4F4F5] rounded-full text-slate-400 hover:text-slate-700 transition"
                      title="Hide chatbot"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {/* AI Column tab switchers */}
                  <div className="px-3 bg-white border-b border-[#E9E9EB] flex">
                    <button 
                      onClick={() => setChatTab("chat")}
                      className={`text-[11px] font-bold py-2.5 px-3 border-b-2 transition-all ${
                        chatTab === "chat" ? "border-[#135bf1] text-[#135bf1]" : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Chat
                    </button>
                    <button 
                      onClick={() => setChatTab("outline")}
                      className={`text-[11px] font-bold py-2.5 px-3 border-b-2 transition-all ${
                        chatTab === "outline" ? "border-[#135bf1] text-[#135bf1]" : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Outline
                    </button>
                    <button 
                      onClick={() => setChatTab("comments")}
                      className={`text-[11px] font-bold py-2.5 px-3 border-b-2 transition-all ${
                        chatTab === "comments" ? "border-[#135bf1] text-[#135bf1]" : "border-transparent text-slate-500 hover:text-slate-800"
                      }`}
                    >
                      Comments
                    </button>
                  </div>

                  {/* Olli Tab Screen Viewport */}
                  {chatTab === "chat" ? (
                    <div className="flex-grow flex flex-col overflow-hidden min-h-0">
                      
                      {/* Active messages scroll panel */}
                      <div className="flex-grow overflow-y-auto p-4 space-y-3.5 divide-y divide-slate-100/10">
                        {conversations[selectedMeeting.id]?.map((msg, idx) => {
                          const isAI = msg.role === "model";
                          return (
                            <div key={idx} className={`flex items-start gap-2.5 pt-2 first:pt-0 ${isAI ? "" : "flex-row-reverse"}`}>
                              {/* Avatar symbol */}
                              <div className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-[9px] shrink-0 border select-none ${
                                isAI 
                                  ? "bg-[#135bf1]/8 border-[#135bf1]/15 text-[#135bf1]" 
                                  : "bg-[#F5F2EB] border-[#E2E0D8] text-slate-700"
                              }`}>
                                {isAI ? "🤖" : "ME"}
                              </div>
                              
                              <div className="text-left w-full max-w-[80%]">
                                <div className={`px-3 py-2.5 rounded-2xl text-[11px] leading-relaxed shadow-3xs ${
                                  isAI 
                                    ? "bg-white border border-[#E9E9EB] text-slate-750" 
                                    : "bg-[#135bf1] text-white"
                                }`}>
                                  <div className="whitespace-pre-wrap select-none font-sans">
                                    {isAI ? renderMarkdown(msg.content) : msg.content}
                                  </div>
                                </div>
                                <span className={`text-[8px] text-slate-400 mt-0.5 block ${isAI ? "text-left pl-1" : "text-right pr-1"}`}>
                                  {msg.timestamp}
                                </span>
                              </div>
                            </div>
                          );
                        })}

                        {/* Spinner loading */}
                        {isGeneratingChat && (
                          <div className="flex items-start gap-2.5 pt-2">
                            <div className="w-7 h-7 rounded-full bg-[#135bf1]/8 border border-[#135bf1]/15 flex items-center justify-center text-[9px] shrink-0">
                              🤖
                            </div>
                            <div className="bg-white border border-[#E9E9EB] px-4 py-3 rounded-2xl flex items-center gap-2">
                              <span className="w-1.5 h-1.5 bg-[#135bf1] rounded-full animate-bounce" />
                              <span className="w-1.5 h-1.5 bg-[#135bf1] rounded-full animate-bounce [animation-delay:0.2s]" />
                              <span className="w-1.5 h-1.5 bg-[#135bf1] rounded-full animate-bounce [animation-delay:0.4s]" />
                              <span className="text-[10px] text-slate-455 ml-1">Olli está analizando...</span>
                            </div>
                          </div>
                        )}

                        {chatError && (
                          <div className="p-2.5 bg-rose-50 border border-rose-100 rounded-xl text-[10px] text-rose-700 text-left">
                            ⚠️ Fallo al obtener respuesta: {chatError}
                          </div>
                        )}

                        <div ref={chatEndRef} />
                      </div>

                      {/* Prompt suggestion quick pills as shown in Otter screenshot */}
                      <div className="px-4 py-2 border-t border-[#E9E9EB]/60 bg-[#FAF9F6] space-y-1.5 text-left">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none mb-1">Temas rápidos para Olli:</p>
                        
                        <div className="flex flex-wrap gap-1.5 select-none">
                          <button
                            onClick={() => handleQueryOlliChat("¿Cuáles son las decisiones tomadas en esta reunión?")}
                            disabled={isGeneratingChat}
                            className="text-[9px] font-semibold bg-white hover:bg-slate-50 border border-[#E9E9EB] text-[#135bf1] px-2 py-1 rounded-full transition-colors cursor-pointer text-left"
                          >
                            💡 ¿Qué decisiones se tomaron?
                          </button>
                          <button
                            onClick={() => handleQueryOlliChat("Escribe un plan de acción con tareas y responsables.")}
                            disabled={isGeneratingChat}
                            className="text-[9px] font-semibold bg-white hover:bg-slate-50 border border-[#E9E9EB] text-[#135bf1] px-2 py-1 rounded-full transition-colors cursor-pointer text-left"
                          >
                            📋 Crear Plan de Acción (To-dos)
                          </button>
                          <button
                            onClick={() => handleQueryOlliChat("Hazme un resumen ejecutivo de 3 viñetas breves.")}
                            disabled={isGeneratingChat}
                            className="text-[9px] font-semibold bg-white hover:bg-slate-50 border border-[#E9E9EB] text-[#135bf1] px-2 py-1 rounded-full transition-colors cursor-pointer text-left"
                          >
                            ⚡ Resumen de 3 viñetas
                          </button>
                        </div>
                      </div>

                      {/* Footer text prompt ask area */}
                      <div className="p-3 bg-white border-t border-[#E9E9EB]">
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            if (userChatMessage.trim()) {
                              handleQueryOlliChat(userChatMessage.trim());
                            }
                          }}
                          className="relative flex items-center"
                        >
                          <input
                            type="text"
                            value={userChatMessage}
                            onChange={(e) => setUserChatMessage(e.target.value)}
                            placeholder="Ask anything about your conversations..."
                            disabled={isGeneratingChat}
                            className="w-full bg-[#F4F4F5] pl-3.5 pr-10 py-2 text-xs rounded-xl focus:bg-white outline-none border border-transparent focus:border-[#EBEBEB] text-[#111111] placeholder-slate-450"
                          />
                          <button
                            type="submit"
                            disabled={isGeneratingChat || !userChatMessage.trim()}
                            className="absolute right-1.5 w-7 h-7 bg-[#135bf1] hover:bg-[#0746cc] rounded-lg text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-40"
                          >
                            <Send className="w-3.5 h-3.5 fill-white" />
                          </button>
                        </form>
                      </div>

                    </div>
                  ) : chatTab === "outline" ? (
                    <div className="flex-grow p-4 overflow-y-auto text-left space-y-4">
                      <p className="text-xs font-bold text-[#111111]">Capítulo & Estructura de Minuta:</p>
                      <div className="space-y-2.5">
                        {selectedMeeting.summary.split("\n").filter(l => l.startsWith("##") || l.startsWith("###")).map((sectionHeader, sIdx) => {
                          const cleanSection = sectionHeader.replace(/^#+\s*/, "");
                          return (
                            <div 
                              key={sIdx} 
                              className="p-3 bg-white border border-[#E9E9EB] rounded-xl hover:border-[#135bf1]/40 transition-colors cursor-pointer text-xs font-semibold text-[#135bf1]"
                              onClick={() => {
                                // simulated jump to outline paragraph by highlighting summary tab
                                setActiveTab("summary");
                              }}
                            >
                              📍 {cleanSection}
                            </div>
                          );
                        })}
                        {selectedMeeting.summary.split("\n").filter(l => l.startsWith("##") || l.startsWith("###")).length === 0 && (
                          <p className="text-[11px] text-slate-400 italic">No se encontraron títulos estructurados en el resumen.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex-grow p-4 text-left space-y-4">
                      <p className="text-xs font-bold text-[#111111]">Team Comments or Notes:</p>
                      <p className="text-[11px] text-slate-500">Agrega comentarios o anotaciones para consolidar el acta corporativa con tus compañeros.</p>
                      <div className="space-y-3">
                        <textarea 
                          rows={4}
                          className="w-full p-3 bg-white border border-[#E9E9EB] text-xs rounded-xl focus:outline-none focus:ring-1 focus:ring-[#135bf1]"
                          placeholder="Escribe un comentario o aclaración sobre el acta..."
                        />
                        <button className="px-4 py-2 bg-[#135bf1] text-white text-xs font-bold rounded-lg hover:bg-[#0746cc]">
                          Agregar Nota
                        </button>
                      </div>
                    </div>
                  )}

                </motion.div>
              )}
            </AnimatePresence>

          </div>
        ) : (
          <div className="flex-grow flex flex-col items-center justify-center p-8 text-center bg-slate-50/5 select-none">
            <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 mb-4 shadow-sm">
              <FolderOpen className="w-7 h-7 text-slate-400" />
            </div>
            <h3 className="text-xs font-black text-slate-700 mt-1 uppercase tracking-wider">
              No Conversation Active
            </h3>
            <p className="text-[10px] text-slate-400 max-w-xs mt-1.5 leading-relaxed">
              Selecciona una sesión de audio o acta de la boveda a la izquierda, o inicia una nueva grabación dentro de Olli AI Chat.
            </p>
          </div>
        )}
      </div>

      {/* EMAIL REPORT PDF DISPATCH MODAL */}
      <AnimatePresence>
        {isEmailModalOpen && selectedMeeting && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* Background Backdrop cover */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                if (!isSendingEmail) {
                  setIsEmailModalOpen(false);
                }
              }}
              className="absolute inset-0 bg-[#0F172A]/40 backdrop-blur-xs"
            />

            {/* Modal Glass Container */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", duration: 0.4 }}
              className="bg-white rounded-3xl w-full max-w-lg p-7 relative z-10 shadow-2xl border border-slate-100 overflow-hidden text-left font-sans select-none"
            >
              {/* Header */}
              <div className="flex justify-between items-center pb-4 border-b border-slate-50 mb-5">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                    <Mail className="w-5 h-5 text-[#135bf1]" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-800 leading-none">Enviar Reporte PDF</h3>
                    <p className="text-[10px] text-slate-400 mt-1">Comparte actas y transcripción por correo</p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSendingEmail}
                  onClick={() => setIsEmailModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-slate-50 hover:bg-slate-100 text-slate-400 hover:text-slate-650 flex items-center justify-center text-sm font-semibold transition-colors disabled:opacity-55 cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Form parameters */}
              <div className="space-y-4">
                {/* Information Badge */}
                <div className="p-3.5 bg-indigo-50/40 border border-indigo-100/30 rounded-2xl flex items-start space-x-2.5 text-[11px] text-indigo-800 leading-relaxed">
                  <span className="text-sm shrink-0">📎</span>
                  <div>
                    <span className="font-semibold text-indigo-900">Adjunto automático listo:</span>
                    <p className="mt-0.5 text-indigo-750/90 text-[10px]">
                      El PDF con el resumen ejecutivo estructurado, notas y transcripción se generará en este instante y se adjuntará directamente al correo.
                    </p>
                  </div>
                </div>

                {/* Recipient Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-505 uppercase tracking-widest mb-1.5 text-left">
                    Destinatario <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                    placeholder="ejemplo@correo.com"
                    disabled={isSendingEmail}
                    className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#135bf1] focus:bg-white transition-all text-slate-800 placeholder-slate-450"
                  />
                </div>

                {/* Custom Subject Input */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-505 uppercase tracking-widest mb-1.5 text-left">
                    Asunto del Correo
                  </label>
                  <input
                    type="text"
                    value={emailSubject}
                    onChange={(e) => setEmailSubject(e.target.value)}
                    placeholder={`Acta de Reunión: ${selectedMeeting.title}`}
                    disabled={isSendingEmail}
                    className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#135bf1] focus:bg-white transition-all text-slate-800 placeholder-slate-450"
                  />
                </div>

                {/* Optional Message note */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-505 uppercase tracking-widest mb-1.5 text-left">
                    Mensaje u Observación Adicional <span className="text-slate-400">(Opcional)</span>
                  </label>
                  <textarea
                    rows={3}
                    value={emailNote}
                    onChange={(e) => setEmailNote(e.target.value)}
                    placeholder="Hola, te comparto el acta de la reunión de hoy junto con la transcripción completa..."
                    disabled={isSendingEmail}
                    className="w-full px-4 py-3 text-xs bg-slate-50 border border-slate-200/80 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#135bf1] focus:bg-white transition-all text-slate-800 placeholder-slate-450 resize-none leading-relaxed"
                  />
                </div>

                {/* Success Banner */}
                {emailSuccess && (
                  <div className="p-3 bg-emerald-50 border border-emerald-105 rounded-xl text-[11px] text-emerald-850 leading-relaxed">
                    <span className="font-bold text-emerald-950 flex items-center gap-1">✅ ¡Enviado con Éxito!</span>
                    <p className="mt-0.5 text-emerald-700">{emailSuccess}</p>
                    
                    {testMessageBoxUrl && (
                      <div className="mt-2 pt-2 border-t border-emerald-100 flex items-center justify-between">
                        <span className="text-[10px] text-emerald-650">Bandeja de Pruebas Activa:</span>
                        <a
                          href={testMessageBoxUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 bg-emerald-600 font-bold hover:bg-emerald-700 text-white rounded-md text-[10px] transition-colors inline-block text-center cursor-pointer"
                        >
                          Ver Correo en Ethereal 📥
                        </a>
                      </div>
                    )}
                  </div>
                )}

                {/* Error Banner */}
                {emailError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-2xl text-[11px] text-rose-800 leading-relaxed text-left flex items-start space-x-2">
                    <span className="text-sm shrink-0">⚠️</span>
                    <div>
                      <span className="font-bold">Fallo al despachar</span>
                      <p className="mt-0.5 text-rose-700">{emailError}</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Action Trigger Buttons */}
              <div className="flex items-center justify-end space-x-3 mt-6 pt-4 border-t border-slate-50">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  disabled={isSendingEmail}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-[11px] font-bold transition-all disabled:opacity-55 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleSendEmail}
                  disabled={isSendingEmail || !recipientEmail}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-indigo-500 to-[#135bf1] hover:opacity-95 text-white text-[11px] font-bold flex items-center space-x-2 transition-all cursor-pointer shadow-md shadow-indigo-100 disabled:opacity-55 disabled:cursor-not-allowed"
                >
                  {isSendingEmail ? (
                    <>
                      <svg className="animate-spin h-3.5 w-3.5 text-white shrink-0" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      <span>Despachando Reporte...</span>
                    </>
                  ) : (
                    <>
                      <Mail className="w-3.5 h-3.5 shrink-0" />
                      <span>Enviar Correo</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
