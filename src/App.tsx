import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Globe, 
  MousePointer2, 
  Database, 
  Plus, 
  Trash2, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft,
  Loader2,
  FileSpreadsheet,
  AlertCircle,
  Play,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Zap,
  Activity,
  History,
  XCircle,
  ExternalLink
} from 'lucide-react';

interface ScrapeField {
  id: string;
  name: string;
  selector: string;
  listSelector: string;
  isList: boolean;
  preview: string;
}

interface BackgroundTask {
  id: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  progress: {
    current: number;
    total: number;
    lastPage: number;
    logs: string[];
    startTime: number;
  };
  config: {
    url: string;
    selectors: { name: string, selector: string }[];
    spreadsheetId: string;
  };
}

type Step = 'URL_INPUT' | 'FIELD_PICKER' | 'SHEETS_SETUP' | 'MONITOR';

export default function App() {
  const [currentStep, setCurrentStep] = useState<Step>('URL_INPUT');
  const [url, setUrl] = useState('');
  const [fields, setFields] = useState<ScrapeField[]>([]);
  const [spreadsheetId, setSpreadsheetId] = useState('');
  const [credentials, setCredentials] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Tasks State
  const [tasks, setTasks] = useState<BackgroundTask[]>([]);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  // Pagination State
  const [page, setPage] = useState(1);
  const [autoPageCount, setAutoPageCount] = useState(10);

  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Poll for tasks
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await fetch('/api/tasks');
        const data = await response.json();
        setTasks(data);
      } catch (e) {
        console.error('Polling error:', e);
      }
    };

    fetchTasks();
    const interval = setInterval(fetchTasks, 3000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ELEMENT_SELECTED') {
        const { selector, listSelector, text } = event.data;
        const newField: ScrapeField = {
          id: Math.random().toString(36).substr(2, 9),
          name: `Field ${fields.length + 1}`,
          selector: selector,
          listSelector: listSelector,
          isList: true, // Default to list mode as requested
          preview: text
        };
        setFields(prev => [...prev, newField]);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [fields]);

  const handleStartPicking = () => {
    if (!url) {
      setError('Please enter a valid URL');
      return;
    }
    setError(null);
    setCurrentStep('FIELD_PICKER');
    const parts = url.split('/');
    const last = Number(parts[parts.length - 1]);
    if (!isNaN(last)) setPage(last);
  };

  const handleStartBackgroundTask = async () => {
    if (!spreadsheetId || !credentials || fields.length === 0) {
      setError('Required: Spreadsheet ID, Credentials, and Fields.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          selectors: fields.map(f => ({ 
            name: f.name, 
            selector: f.isList ? f.listSelector : f.selector 
          })),
          spreadsheetId,
          credentials,
          totalPages: autoPageCount
        })
      });
      const data = await response.json();
      setActiveTaskId(data.id);
      setCurrentStep('MONITOR');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const cancelTask = async (id: string) => {
    await fetch(`/api/tasks/${id}/cancel`, { method: 'POST' });
  };

  const deleteRecord = async (id: string) => {
    await fetch(`/api/tasks/${id}`, { method: 'DELETE' });
    if (activeTaskId === id) setActiveTaskId(null);
  };

  const activeTask = tasks.find(t => t.id === activeTaskId) || tasks[0];

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans">
      <header className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-2xl text-white shadow-xl shadow-indigo-100">
            <Zap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight leading-none text-slate-900">ScraperFlow</h1>
            <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Background Engine v2.0</span>
          </div>
        </div>
        
        <nav className="flex items-center gap-8 text-sm font-bold">
          {['URL_INPUT', 'FIELD_PICKER', 'SHEETS_SETUP', 'MONITOR'].map((step, idx) => (
            <div key={step} className="flex items-center gap-3">
              <span className={`w-8 h-8 rounded-xl border-2 flex items-center justify-center transition-all ${currentStep === step ? 'border-indigo-600 bg-indigo-50 text-indigo-600 shadow-sm' : 'border-slate-100 bg-slate-50 text-slate-300'}`}>
                {idx + 1}
              </span>
              <span className={currentStep === step ? 'text-indigo-600' : 'text-slate-400'}>{step.replace('_', ' ')}</span>
              {idx < 3 && <ChevronRight className="w-4 h-4 text-slate-200" />}
            </div>
          ))}
        </nav>
      </header>

      <main className="max-w-7xl mx-auto p-8">
        <AnimatePresence mode="wait">
          {currentStep === 'URL_INPUT' && (
            <motion.div 
              key="step0"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.02 }}
              className="max-w-2xl mx-auto mt-20"
            >
               <div className="bg-white rounded-[2.5rem] shadow-2xl shadow-slate-200/50 p-12 border border-slate-100 text-center">
                <div className="w-24 h-24 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-inner">
                  <Globe className="w-12 h-12 text-indigo-600" />
                </div>
                <h2 className="text-4xl font-black mb-4 tracking-tight text-slate-900">Target Web Source</h2>
                <p className="text-slate-500 text-lg mb-10 leading-relaxed font-medium">Input the starting URL. Our background engine handles deep sequential pages.</p>
                
                <div className="space-y-6">
                  <div className="relative group">
                    <input 
                      type="text" 
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://keys.lol/bitcoin/1"
                      className="w-full px-8 py-6 bg-slate-50/50 border-2 border-slate-100 rounded-3xl focus:outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-500 transition-all text-xl font-bold placeholder:text-slate-300 shadow-inner"
                    />
                  </div>

                  {error && (
                    <div className="flex items-center gap-3 text-red-600 text-sm bg-red-50 p-5 rounded-3xl border border-red-100 font-bold">
                      <AlertCircle className="w-5 h-5" /> {error}
                    </div>
                  )}

                  <button 
                    onClick={handleStartPicking}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-black py-6 rounded-3xl transition-all shadow-2xl shadow-indigo-500/30 flex items-center justify-center gap-3 text-xl active:scale-[0.98]"
                  >
                    Start Extraction Protocol
                    <ArrowRight className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'FIELD_PICKER' && (
            <motion.div 
              key="step1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-12 gap-8"
            >
              <div className="col-span-8 bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-2xl h-[75vh] flex flex-col">
                <div className="bg-white border-b border-slate-100 px-8 py-4 flex items-center justify-between shrink-0">
                  <div className="flex bg-slate-50 border border-slate-200 rounded-2xl p-1 gap-1">
                    <button onClick={() => setPage(p => Math.max(1, p - 1))} className="p-2 hover:bg-white hover:text-indigo-600 rounded-xl transition-all"><ChevronLeft className="w-5 h-5"/></button>
                    <div className="px-4 flex items-center font-black text-xs text-slate-600 uppercase tracking-widest">Page {page}</div>
                    <button onClick={() => setPage(p => p + 1)} className="p-2 hover:bg-white hover:text-indigo-600 rounded-xl transition-all"><ChevronRight className="w-5 h-5"/></button>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] font-black uppercase bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full border border-indigo-100 shadow-sm animate-pulse">
                    <MousePointer2 className="w-3 h-3" /> Selector Active
                  </div>
                </div>
                <div className="flex-1 bg-slate-50">
                  <iframe 
                    key={`${url}-${page}`}
                    src={`/api/proxy?url=${encodeURIComponent(page > 1 ? url.replace(/\/\d+$/, `/${page}`) : url)}`}
                    className="w-full h-full border-none"
                    title="Scraper Canvas"
                  />
                </div>
              </div>

              <div className="col-span-4 space-y-6 flex flex-col h-[75vh]">
                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-8 shadow-2xl flex-1 flex flex-col overflow-hidden">
                  <h3 className="text-xl font-black mb-8 flex items-center gap-3 text-slate-900 leading-none">
                    <Database className="w-6 h-6 text-indigo-600" /> Extracted Schema
                  </h3>
                  
                  <div className="flex-1 overflow-y-auto space-y-4 pr-2 custom-scrollbar">
                    {fields.length === 0 ? (
                      <div className="text-center py-24 border-3 border-dashed border-slate-50 rounded-[2rem]">
                        <MousePointer2 className="w-12 h-12 text-slate-100 mx-auto mb-4" />
                        <p className="text-slate-300 font-bold px-8 leading-relaxed">Click any element in the preview to extract its data</p>
                      </div>
                    ) : (
                      fields.map((field) => (
                        <div key={field.id} className="p-5 bg-slate-50/50 rounded-3xl border border-slate-100 group hover:border-indigo-200 transition-all">
                          <div className="flex items-center gap-3 mb-3">
                            <input 
                              type="text" 
                              value={field.name}
                              onChange={(e) => setFields(fs => fs.map(f => f.id === field.id ? { ...f, name: e.target.value } : f))}
                              className="bg-white border-0 rounded-xl px-4 py-2 text-sm font-black flex-1 focus:ring-4 focus:ring-indigo-500/10 shadow-sm outline-none"
                            />
                            <button onClick={() => setFields(fs => fs.filter(f => f.id !== field.id))} className="text-slate-300 hover:text-red-500 transition-colors p-1"><Trash2 className="w-4 h-4" /></button>
                          </div>
                          
                          <div className="flex items-center justify-between mb-4 px-1">
                             <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Loop All Similar Items?</span>
                             <button 
                               onClick={() => setFields(fs => fs.map(f => f.id === field.id ? { ...f, isList: !f.isList } : f))}
                               className={`px-3 py-1 rounded-lg text-[9px] font-black transition-all ${field.isList ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-500'}`}
                             >
                               {field.isList ? 'YES' : 'NO'}
                             </button>
                          </div>

                          <div className="bg-white rounded-2xl p-4 border border-slate-100 text-[11px] text-slate-500 font-medium italic shadow-inner mb-2">
                             <div className="truncate mb-2">"{field.preview}"</div>
                             <div className="pt-2 border-t border-slate-50 flex flex-col gap-1">
                               <span className="text-[8px] font-black text-slate-300 uppercase">CSS Selector</span>
                               <input 
                                 type="text"
                                 value={field.isList ? field.listSelector : field.selector}
                                 onChange={(e) => {
                                   const val = e.target.value;
                                   setFields(fs => fs.map(f => f.id === field.id ? (field.isList ? { ...f, listSelector: val } : { ...f, selector: val }) : f));
                                 }}
                                 className="w-full bg-slate-50 border-0 rounded-lg px-2 py-1 text-[9px] font-mono text-indigo-600 focus:ring-2 focus:ring-indigo-500/20 outline-none"
                               />
                             </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="mt-8 pt-8 border-t border-slate-100">
                    <button 
                      onClick={() => setCurrentStep('SHEETS_SETUP')}
                      disabled={fields.length === 0}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-100 disabled:text-slate-300 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-indigo-500/20 text-lg flex items-center justify-center gap-2"
                    >
                      Process Dataset <ArrowRight className="w-5 h-5"/>
                    </button>
                    <p className="text-center text-[10px] text-slate-400 font-bold uppercase mt-4 tracking-widest">Verify schema before sync</p>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'SHEETS_SETUP' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto grid grid-cols-2 gap-8 mt-12">
               <div className="bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-4 mb-10">
                    <div className="bg-green-50 w-16 h-16 rounded-2xl flex items-center justify-center">
                      <FileSpreadsheet className="w-8 h-8 text-green-600" />
                    </div>
                    <h2 className="text-2xl font-black text-slate-900">Sheets Sync</h2>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Spreadsheet ID</label>
                      <input value={spreadsheetId} onChange={(e) => setSpreadsheetId(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none font-bold" placeholder="..." />
                    </div>
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Service Key JSON</label>
                      <textarea value={credentials} onChange={(e) => setCredentials(e.target.value)} rows={5} className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:ring-4 focus:ring-green-500/10 focus:border-green-500 outline-none font-mono text-[10px] font-bold" placeholder="{ ... }" />
                    </div>
                  </div>
                </div>
                <button onClick={() => setCurrentStep('FIELD_PICKER')} className="text-slate-400 font-bold hover:text-slate-900 transition-colors py-4">← Return to Dataset</button>
              </div>

              <div className="bg-slate-900 rounded-[2.5rem] shadow-2xl p-12 border border-slate-800 text-white">
                <div className="flex items-center gap-4 mb-12">
                  <div className="bg-white/10 w-16 h-16 rounded-2xl flex items-center justify-center"><Zap className="w-8 h-8 text-indigo-400" /></div>
                  <div>
                    <h2 className="text-2xl font-black">Industrial Scraper</h2>
                    <p className="text-slate-400 text-sm">Background execution enabled</p>
                  </div>
                </div>
                
                <div className="space-y-8">
                  <div className="bg-white/5 border border-white/10 rounded-3xl p-6">
                    <div className="flex justify-between items-center mb-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Page Target</span>
                      <span className="text-2xl font-black text-indigo-400">{autoPageCount} PAGES</span>
                    </div>
                    <input type="number" min="1" value={autoPageCount} onChange={(e) => setAutoPageCount(Math.max(1, Number(e.target.value)))} className="w-full bg-slate-800 border-2 border-slate-700 rounded-2xl px-6 py-4 text-center font-black text-xl outline-none focus:border-indigo-500 transition-all" />
                  </div>

                  <button 
                    onClick={handleStartBackgroundTask}
                    disabled={isLoading || !spreadsheetId || !credentials}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-800 disabled:text-slate-600 text-white font-black py-6 rounded-3xl text-xl shadow-2xl shadow-indigo-600/30 flex items-center justify-center gap-3 active:scale-[0.98] transition-all"
                  >
                    {isLoading ? <Loader2 className="w-6 h-6 animate-spin" /> : <Play className="w-6 h-6" />}
                    Ignite Engine
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {currentStep === 'MONITOR' && activeTask && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="grid grid-cols-12 gap-10 mt-6 h-[80vh]">
              <div className="col-span-4 space-y-6 flex flex-col">
                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-10 shadow-xl border-t-8 border-t-indigo-500">
                  <h3 className="text-2xl font-black mb-8 flex items-center gap-3">
                    <Activity className="w-7 h-7 text-indigo-500 animate-pulse" /> Live Status
                  </h3>
                  
                  <div className="space-y-8">
                    <div className="relative pt-4">
                      <div className="flex justify-between mb-4">
                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Extraction Progress</span>
                        <span className="text-xs font-black text-indigo-600">{Math.round((activeTask.progress.current / activeTask.progress.total) * 100)}%</span>
                      </div>
                      <div className="h-4 bg-slate-100 rounded-full overflow-hidden shadow-inner">
                        <motion.div 
                          initial={{ width: 0 }}
                          animate={{ width: `${(activeTask.progress.current / activeTask.progress.total) * 100}%` }}
                          className="h-full bg-gradient-to-r from-indigo-500 to-blue-400"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Current Page</div>
                        <div className="text-3xl font-black text-slate-900">{activeTask.progress.lastPage}</div>
                      </div>
                      <div className="bg-slate-50 p-5 rounded-3xl border border-slate-100">
                        <div className="text-[10px] font-black text-slate-400 uppercase mb-1">Items Scraped</div>
                        <div className="text-3xl font-black text-slate-900">{activeTask.progress.current}</div>
                      </div>
                    </div>

                    <div className="flex gap-4">
                      {activeTask.status === 'active' ? (
                        <button onClick={() => cancelTask(activeTask.id)} className="flex-1 bg-red-50 text-red-600 font-black py-4 rounded-2xl border border-red-100 flex items-center justify-center gap-2 hover:bg-red-100 transition-all">
                          <XCircle className="w-5 h-5" /> Cancel Engine
                        </button>
                      ) : (
                        <button onClick={() => setCurrentStep('URL_INPUT')} className="flex-1 bg-indigo-600 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-200">
                          <Plus className="w-5 h-5" /> New Session
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-[2.5rem] border border-slate-200 p-10 shadow-lg flex-1 overflow-hidden pointer-events-auto">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-[0.2em] mb-6 flex items-center gap-2">
                       <History className="w-4 h-4" /> Active Sessions
                    </h4>
                    <div className="space-y-4 overflow-y-auto max-h-full pr-2 custom-scrollbar">
                       {tasks.map(t => (
                         <div key={t.id} onClick={() => setActiveTaskId(t.id)} className={`p-5 rounded-3xl border cursor-pointer transition-all ${t.id === activeTaskId ? 'bg-indigo-50 border-indigo-200 shadow-md ring-2 ring-indigo-100' : 'bg-white border-slate-100 hover:bg-slate-50'}`}>
                           <div className="flex items-center justify-between mb-2">
                             <div className="flex items-center gap-2">
                               <div className={`w-2 h-2 rounded-full ${t.status === 'active' ? 'bg-indigo-500 animate-ping' : t.status === 'completed' ? 'bg-green-500' : 'bg-slate-300'}`} />
                               <span className="text-[10px] font-black text-slate-400 uppercase">ID: {t.id}</span>
                             </div>
                             <button onClick={(e) => { e.stopPropagation(); deleteRecord(t.id); }} className="text-slate-300 hover:text-red-500"><Trash2 className="w-3 h-3" /></button>
                           </div>
                           <div className="text-xs font-bold text-slate-700 truncate">{t.config.url}</div>
                           <div className="text-[9px] font-black mt-2 text-indigo-500 uppercase">{t.status} • {t.progress.current}/{t.progress.total} PGS</div>
                         </div>
                       ))}
                    </div>
                </div>
              </div>

              <div className="col-span-8 bg-slate-900 rounded-[2.5rem] p-10 shadow-2xl overflow-hidden flex flex-col border border-slate-800">
                 <div className="flex items-center justify-between mb-8 border-b border-white/10 pb-6 shrink-0">
                    <h3 className="text-xl font-black text-white flex items-center gap-3 tracking-tight">
                       <div className="p-2 bg-indigo-500/20 rounded-xl"><Database className="w-5 h-5 text-indigo-400" /></div>
                       Engine Live Logs
                    </h3>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Execution Mode</div>
                        <div className="text-[11px] font-black text-indigo-400 flex items-center gap-1">
                          <ExternalLink className="w-3 h-3" /> PERSISTENT SERVER
                        </div>
                      </div>
                    </div>
                 </div>
                 
                 <div className="flex-1 bg-black/40 rounded-3xl p-8 font-mono text-[11px] overflow-y-auto custom-scrollbar border border-white/5">
                   <div className="space-y-3">
                     {activeTask.progress.logs.map((log, i) => (
                       <div key={i} className={`flex gap-4 border-l-2 pl-4 py-1 animate-in fade-in slide-in-from-left-2 duration-500 ${log.includes('ERROR') ? 'border-red-500 text-red-400 bg-red-500/5' : log.includes('COMPLETED') ? 'border-green-500 text-green-400' : 'border-indigo-500/30 text-slate-400'}`}>
                         <span className="opacity-40 shrink-0 font-bold whitespace-nowrap">{(activeTask.progress.logs.length - i).toString().padStart(3, '0')}</span>
                         <span className="leading-relaxed">{log}</span>
                       </div>
                     ))}
                   </div>
                 </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="fixed bottom-0 w-full p-8 text-center text-[10px] text-slate-400 font-bold uppercase tracking-[0.5em] pointer-events-none">
        Background Extraction Grid Active • {tasks.filter(t => t.status === 'active').length} Threads Running
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(0,0,0,0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(0,0,0,0.1); }
      `}</style>
    </div>
  );
}
