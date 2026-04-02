import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Loader2, BookOpen, Mic, MicOff, Plus, MessageSquare, Trash2, Menu, X, LogOut, UserPlus, ShieldCheck, AlertCircle, ToggleLeft, ToggleRight, FileText, Upload } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { askQuestion, summarizeDocument } from '../services/geminiService';
import { cn } from '../lib/utils';
import * as pdfjsLib from 'pdfjs-dist';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  category: string;
}

const CATEGORIES = [
  { id: 'nursing', name: 'أساسيات التمريض', icon: BookOpen },
  { id: 'biology', name: 'الأحياء', icon: Bot },
  { id: 'social', name: 'الدراسات الاجتماعية', icon: MessageSquare },
];

// Add types for Web Speech API
declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

interface ChatInterfaceProps {
  user: { username: string; isDeveloper: boolean };
  onLogout: () => void;
}

export default function ChatInterface({ user, onLogout }: ChatInterfaceProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isDevModalOpen, setIsDevModalOpen] = useState(false);
  const [newAccountData, setNewAccountData] = useState({ username: '', password: '' });
  const [devActionLoading, setDevActionLoading] = useState(false);
  const [devMessage, setDevMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [isAccountsLoading, setIsAccountsLoading] = useState(false);
  const [selectedUsernames, setSelectedUsernames] = useState<string[]>([]);
  const [isBulkActionLoading, setIsBulkActionLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAccounts = async () => {
    setIsAccountsLoading(true);
    try {
      const response = await fetch(`/api/accounts?developerUsername=${user.username}`);
      const data = await response.json();
      if (response.ok) {
        setAccounts(data);
      }
    } catch (err) {
      console.error("Failed to fetch accounts:", err);
    } finally {
      setIsAccountsLoading(false);
    }
  };

  useEffect(() => {
    if (isDevModalOpen) {
      fetchAccounts();
    }
  }, [isDevModalOpen]);

  const toggleAccountStatus = async (targetUsername: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    try {
      const response = await fetch('/api/update-account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerUsername: user.username,
          targetUsername,
          newStatus
        }),
      });
      if (response.ok) {
        setAccounts(prev => prev.map(acc => acc.username === targetUsername ? { ...acc, status: newStatus } : acc));
      }
    } catch (err) {
      console.error("Failed to update status:", err);
    }
  };

  const handleBulkUpdate = async (newStatus: 'active' | 'inactive') => {
    if (selectedUsernames.length === 0) return;
    setIsBulkActionLoading(true);
    try {
      const response = await fetch('/api/bulk-update-account-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerUsername: user.username,
          targetUsernames: selectedUsernames,
          newStatus
        }),
      });
      if (response.ok) {
        setAccounts(prev => prev.map(acc => 
          selectedUsernames.includes(acc.username) ? { ...acc, status: newStatus } : acc
        ));
        setSelectedUsernames([]);
      }
    } catch (err) {
      console.error("Bulk update failed:", err);
    } finally {
      setIsBulkActionLoading(false);
    }
  };

  const toggleSelectAll = () => {
    const selectableUsers = accounts.filter(acc => !acc.isDeveloper).map(acc => acc.username);
    if (selectedUsernames.length === selectableUsers.length) {
      setSelectedUsernames([]);
    } else {
      setSelectedUsernames(selectableUsers);
    }
  };

  const toggleSelectUser = (username: string) => {
    setSelectedUsernames(prev => 
      prev.includes(username) 
        ? prev.filter(u => u !== username) 
        : [...prev, username]
    );
  };

  const extractTextFromPdf = async (file: File): Promise<string> => {
    // Set worker for pdfjs inside the function to avoid top-level issues
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;
    }
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentSessionId) return;

    setIsUploading(true);
    try {
      let content = '';
      if (file.type === 'application/pdf') {
        content = await extractTextFromPdf(file);
      } else {
        content = await file.text();
      }

      if (!content.trim()) {
        throw new Error('الملف فارغ أو لا يمكن قراءته.');
      }

      // Add user message about the upload
      const userMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'user',
        content: `لقد قمت برفع ملف: ${file.name}. يرجى تلخيصه.`,
      };

      setSessions((prev) => 
        prev.map((s) => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, userMessage] };
          }
          return s;
        })
      );

      setIsLoading(true);
      const summary = await summarizeDocument(content);
      
      const assistantMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `### ملخص المستند: ${file.name}\n\n${summary}`,
      };

      setSessions((prev) => 
        prev.map((s) => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, assistantMessage] };
          }
          return s;
        })
      );
    } catch (error) {
      console.error('File upload error:', error);
      const errorMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: `حدث خطأ أثناء معالجة الملف: ${error instanceof Error ? error.message : 'خطأ غير معروف'}.`,
      };
      setSessions((prev) => 
        prev.map((s) => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, errorMessage] };
          }
          return s;
        })
      );
    } finally {
      setIsUploading(false);
      setIsLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // Load sessions from localStorage on mount
  useEffect(() => {
    const savedSessions = localStorage.getItem(`nursing_chat_sessions_${user.username}`);
    if (savedSessions) {
      const parsed = JSON.parse(savedSessions);
      setSessions(parsed);
      if (parsed.length > 0) {
        setCurrentSessionId(parsed[0].id);
      }
    } else {
      createNewSession('nursing');
    }
  }, [user.username]);

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    if (sessions.length > 0) {
      localStorage.setItem(`nursing_chat_sessions_${user.username}`, JSON.stringify(sessions));
    }
  }, [sessions, user.username]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentSessionId, sessions, isLoading]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new window.webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'ar-EG';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput((prev) => prev + (prev ? ' ' : '') + transcript);
        setIsListening(false);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const createNewSession = (category: string) => {
    const newSession: ChatSession = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: 'محادثة جديدة',
      messages: [],
      createdAt: Date.now(),
      category,
    };
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setIsSidebarOpen(false);
  };

  const deleteSession = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updatedSessions = sessions.filter((s) => s.id !== id);
    setSessions(updatedSessions);
    if (currentSessionId === id) {
      if (updatedSessions.length > 0) {
        setCurrentSessionId(updatedSessions[0].id);
      } else {
        createNewSession('nursing');
      }
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDevActionLoading(true);
    setDevMessage(null);

    try {
      const response = await fetch('/api/create-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          developerUsername: user.username,
          newUsername: newAccountData.username,
          newPassword: newAccountData.password
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setDevMessage({ type: 'success', text: 'تم إنشاء الحساب بنجاح' });
        setNewAccountData({ username: '', password: '' });
      } else {
        setDevMessage({ type: 'error', text: data.message || 'فشل إنشاء الحساب' });
      }
    } catch (err) {
      setDevMessage({ type: 'error', text: 'حدث خطأ في الاتصال' });
    } finally {
      setDevActionLoading(false);
    }
  };

  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const messages = currentSession?.messages || [];

  const toggleListening = () => {
    if (isListening) {
      recognitionRef.current?.stop();
    } else {
      recognitionRef.current?.start();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !currentSessionId) return;

    const userMessage: Message = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role: 'user',
      content: input.trim(),
    };

    // Update session with user message and potentially update title
    setSessions((prev) => 
      prev.map((s) => {
        if (s.id === currentSessionId) {
          const newMessages = [...s.messages, userMessage];
          const newTitle = s.messages.length === 0 ? userMessage.content.substring(0, 30) + (userMessage.content.length > 30 ? '...' : '') : s.title;
          return { ...s, messages: newMessages, title: newTitle };
        }
        return s;
      })
    );

    setInput('');
    setIsLoading(true);

    try {
      const response = await askQuestion(userMessage.content);
      const assistantMessage: Message = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: 'assistant',
        content: response,
      };

      setSessions((prev) => 
        prev.map((s) => {
          if (s.id === currentSessionId) {
            return { ...s, messages: [...s.messages, assistantMessage] };
          }
          return s;
        })
      );
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans overflow-hidden" dir="rtl">
      {/* Sidebar Overlay */}
      <AnimatePresence>
        {isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-slate-900/50 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 right-0 w-80 bg-white border-l border-slate-200 z-50 transition-transform duration-300 transform lg:relative lg:translate-x-0 flex flex-col shadow-xl lg:shadow-none",
        isSidebarOpen ? "translate-x-0" : "translate-x-full"
      )}>
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">سجل المحادثات</h2>
          <button 
            onClick={() => setIsSidebarOpen(false)}
            className="p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 space-y-8">
          {CATEGORIES.map((cat) => (
            <div key={cat.id} className="space-y-3">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-slate-500">
                  <cat.icon className="w-4 h-4" />
                  <h3 className="text-xs font-bold uppercase tracking-wider">{cat.name}</h3>
                </div>
                <button
                  onClick={() => createNewSession(cat.id)}
                  className="p-1 hover:bg-indigo-50 text-indigo-600 rounded-md transition-colors"
                  title="محادثة جديدة"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              
              <div className="space-y-1">
                {sessions.filter(s => s.category === cat.id).length === 0 ? (
                  <p className="text-[10px] text-slate-400 text-center py-2 italic">لا توجد محادثات</p>
                ) : (
                  sessions.filter(s => s.category === cat.id).map((session) => (
                    <div
                      key={session.id}
                      onClick={() => {
                        setCurrentSessionId(session.id);
                        setIsSidebarOpen(false);
                      }}
                      className={cn(
                        "w-full p-2.5 rounded-xl flex items-center gap-3 transition-all group text-right cursor-pointer",
                        currentSessionId === session.id 
                          ? "bg-indigo-600 text-white shadow-md" 
                          : "hover:bg-slate-100 text-slate-700"
                      )}
                    >
                      <MessageSquare className={cn(
                        "w-4 h-4 shrink-0",
                        currentSessionId === session.id ? "text-indigo-100" : "text-slate-400"
                      )} />
                      <span className="flex-1 truncate text-xs font-medium">{session.title}</span>
                      <button
                        type="button"
                        onClick={(e) => deleteSession(session.id, e)}
                        className={cn(
                          "p-1 rounded-md opacity-0 group-hover:opacity-100 transition-opacity",
                          currentSessionId === session.id ? "hover:bg-indigo-500 text-indigo-100" : "hover:bg-slate-200 text-slate-400"
                        )}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="p-4 border-t border-slate-100 space-y-2">
          {user.isDeveloper && (
            <button
              onClick={() => setIsDevModalOpen(true)}
              className="w-full py-2 px-4 bg-amber-50 text-amber-700 rounded-xl flex items-center gap-2 hover:bg-amber-100 transition-colors text-sm font-medium"
            >
              <UserPlus className="w-4 h-4" />
              إنشاء حساب جديد
            </button>
          )}
          <button
            onClick={onLogout}
            className="w-full py-2 px-4 bg-slate-50 text-slate-600 rounded-xl flex items-center gap-2 hover:bg-red-50 hover:text-red-600 transition-colors text-sm font-medium"
          >
            <LogOut className="w-4 h-4" />
            تسجيل الخروج
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 relative">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 md:px-6 py-4 flex items-center justify-between shadow-sm z-30">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <BookOpen className="text-white w-5 h-5 md:w-6 md:h-6" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-slate-900">مساعد التمريض الذكي</h1>
              <div className="flex items-center gap-2">
                <p className="text-[10px] md:text-xs text-slate-500">مرحباً، {user.username}</p>
                {user.isDeveloper && <ShieldCheck className="w-3 h-3 text-amber-500" />}
              </div>
            </div>
          </div>
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 hover:bg-slate-100 rounded-lg lg:hidden"
          >
            <Menu className="w-6 h-6 text-slate-600" />
          </button>
        </header>

        {/* Chat Area */}
        <div 
          ref={scrollRef}
          className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6"
        >
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center space-y-4 opacity-60">
              <Bot className="w-16 h-16 text-indigo-600" />
              <div className="max-w-md px-4">
                <h2 className="text-xl font-semibold text-slate-800">كيف يمكنني مساعدتك اليوم؟</h2>
                <p className="text-slate-600 mt-2">
                  أنا مدرب على الإجابة من كتب أساسيات التمريض، الأحياء، والدراسات الاجتماعية الخاصة بمدارس التمريض.
                </p>
              </div>
            </div>
          )}

          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-3 max-w-[90%] md:max-w-[75%]",
                  msg.role === 'user' ? "mr-auto flex-row-reverse" : "ml-auto flex-row"
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow-sm",
                  msg.role === 'user' ? "bg-indigo-600" : "bg-white border border-slate-200"
                )}>
                  {msg.role === 'user' ? (
                    <User className="w-5 h-5 text-white" />
                  ) : (
                    <Bot className="w-5 h-5 text-indigo-600" />
                  )}
                </div>
                <div className={cn(
                  "p-3 md:p-4 rounded-2xl shadow-sm overflow-hidden",
                  msg.role === 'user' 
                    ? "bg-indigo-600 text-white rounded-tl-none" 
                    : "bg-white border border-slate-200 text-slate-800 rounded-tr-none"
                )}>
                  <div className="prose prose-slate max-w-none prose-sm md:prose-base dark:prose-invert break-words">
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isLoading && (
            <div className="flex gap-3 ml-auto max-w-[75%]">
              <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
                <Bot className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="p-4 rounded-2xl bg-white border border-slate-200 shadow-sm rounded-tr-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-slate-500 text-sm">جاري التفكير...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="bg-white border-t border-slate-200 p-4 md:p-6">
          <form onSubmit={handleSubmit} className="max-w-4xl mx-auto relative flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
              accept=".txt,.md,.pdf,.json"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading || isLoading}
              className="p-4 bg-slate-100 text-slate-600 rounded-xl hover:bg-slate-200 transition-all disabled:opacity-50"
              title="رفع مستند لتلخيصه"
            >
              {isUploading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Upload className="w-6 h-6" />}
            </button>

            <div className="relative flex-1">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="اسأل عن أي شيء في المنهج..."
                className="w-full pr-4 pl-12 py-4 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all text-right"
                dir="rtl"
              />
              <button
                type="submit"
                disabled={!input.trim() || isLoading || isUploading}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
            
            {recognitionRef.current && (
              <button
                type="button"
                onClick={toggleListening}
                className={cn(
                  "p-4 rounded-xl transition-all shadow-sm flex items-center justify-center",
                  isListening 
                    ? "bg-red-500 text-white animate-pulse" 
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                )}
              >
                {isListening ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
              </button>
            )}
          </form>
          <p className="text-[10px] text-center text-slate-400 mt-3">
            هذا المساعد مخصص لأغراض تعليمية فقط. يرجى مراجعة الكتب الرسمية دائماً.
          </p>
        </div>
      </div>

      {/* Developer Modal */}
      <AnimatePresence>
        {isDevModalOpen && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDevModalOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="flex items-center justify-between mb-6 shrink-0">
                <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="text-indigo-600" />
                  لوحة المطور
                </h2>
                <button onClick={() => setIsDevModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg">
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto space-y-8 pr-1">
                {/* Create Account Section */}
                <section>
                  <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <UserPlus className="w-4 h-4" />
                    إنشاء حساب جديد
                  </h3>
                  {devMessage && (
                    <div className={cn(
                      "p-3 rounded-xl mb-4 text-sm flex items-center gap-2",
                      devMessage.type === 'success' ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"
                    )}>
                      <AlertCircle className="w-4 h-4" />
                      {devMessage.text}
                    </div>
                  )}

                  <form onSubmit={handleCreateAccount} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">اسم المستخدم</label>
                        <input
                          type="text"
                          value={newAccountData.username}
                          onChange={(e) => setNewAccountData({ ...newAccountData, username: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          required
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-700 mb-1">كلمة المرور</label>
                        <input
                          type="password"
                          value={newAccountData.password}
                          onChange={(e) => setNewAccountData({ ...newAccountData, password: e.target.value })}
                          className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none text-sm"
                          required
                        />
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={devActionLoading}
                      className="w-full py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
                    >
                      {devActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إنشاء الحساب'}
                    </button>
                  </form>
                </section>

                {/* Manage Accounts Section */}
                <section>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider flex items-center gap-2">
                      <User className="w-4 h-4" />
                      إدارة الحسابات
                    </h3>
                    
                    {accounts.filter(acc => !acc.isDeveloper).length > 0 && (
                      <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer hover:text-indigo-600 transition-colors">
                          <input
                            type="checkbox"
                            checked={selectedUsernames.length === accounts.filter(acc => !acc.isDeveloper).length && selectedUsernames.length > 0}
                            onChange={toggleSelectAll}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          اختيار الكل
                        </label>
                      </div>
                    )}
                  </div>

                  {selectedUsernames.length > 0 && (
                    <motion.div 
                      initial={{ opacity: 0, y: -10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="bg-indigo-50 p-3 rounded-xl mb-4 flex items-center justify-between border border-indigo-100 shadow-sm"
                    >
                      <span className="text-xs font-bold text-indigo-700">
                        تم اختيار {selectedUsernames.length} حساب
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleBulkUpdate('active')}
                          disabled={isBulkActionLoading}
                          className="px-3 py-1.5 bg-green-600 text-white text-[10px] font-bold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
                        >
                          تفعيل المختار
                        </button>
                        <button
                          onClick={() => handleBulkUpdate('inactive')}
                          disabled={isBulkActionLoading}
                          className="px-3 py-1.5 bg-red-600 text-white text-[10px] font-bold rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
                        >
                          تعطيل المختار
                        </button>
                      </div>
                    </motion.div>
                  )}
                  
                  <div className="space-y-2">
                    {isAccountsLoading ? (
                      <div className="flex justify-center py-4">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
                      </div>
                    ) : accounts.length === 0 ? (
                      <p className="text-center text-slate-400 text-sm py-4">لا توجد حسابات مسجلة</p>
                    ) : (
                      accounts.map((acc) => (
                        <div key={acc.username} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:border-indigo-100 transition-colors">
                          <div className="flex items-center gap-3">
                            {!acc.isDeveloper && (
                              <input
                                type="checkbox"
                                checked={selectedUsernames.includes(acc.username)}
                                onChange={() => toggleSelectUser(acc.username)}
                                className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                              />
                            )}
                            <div className={cn(
                              "w-8 h-8 rounded-full flex items-center justify-center",
                              acc.isDeveloper ? "bg-amber-100 text-amber-600" : "bg-indigo-100 text-indigo-600"
                            )}>
                              {acc.isDeveloper ? <ShieldCheck className="w-4 h-4" /> : <User className="w-4 h-4" />}
                            </div>
                            <div>
                              <p className="text-sm font-bold text-slate-800">{acc.username}</p>
                              <p className={cn(
                                "text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block",
                                acc.status === 'active' ? "bg-green-100 text-green-600" : "bg-red-100 text-red-600"
                              )}>
                                {acc.status === 'active' ? 'مفعل' : 'معطل'}
                              </p>
                            </div>
                          </div>
                          
                          {!acc.isDeveloper && (
                            <button
                              onClick={() => toggleAccountStatus(acc.username, acc.status)}
                              className={cn(
                                "p-2 rounded-lg transition-colors",
                                acc.status === 'active' ? "text-green-600 hover:bg-green-50" : "text-slate-400 hover:bg-slate-100"
                              )}
                              title={acc.status === 'active' ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                            >
                              {acc.status === 'active' ? <ToggleRight className="w-6 h-6" /> : <ToggleLeft className="w-6 h-6" />}
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </section>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
