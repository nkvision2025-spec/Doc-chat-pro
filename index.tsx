import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI } from "@google/genai";

// --- TYPES ---
type UserRole = 'admin' | 'user';
interface User { id: string; username: string; password?: string; role: UserRole; accessibleDocs: string[]; }
interface Document { id: string; name: string; content: string; instruction: string; uploadDate: string; type: 'pdf' | 'text'; }
interface Message { id: string; role: 'user' | 'model'; text: string; timestamp: string; source: 'doc' | 'web' | 'both'; }

// --- CONSTANTS ---
const Icons = {
  Send: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>,
  File: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>,
  Trash: () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>,
  Logout: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/></svg>,
  Plus: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14m-7-7h14"/></svg>
};

// --- STORAGE SERVICE ---
const Storage = {
  getUsers: () => JSON.parse(localStorage.getItem('dc_users') || '[]'),
  saveUsers: (u: User[]) => localStorage.setItem('dc_users', JSON.stringify(u)),
  getDocs: () => JSON.parse(localStorage.getItem('dc_docs') || '[]'),
  saveDocs: (d: Document[]) => localStorage.setItem('dc_docs', JSON.stringify(d)),
  init: () => {
    if (Storage.getUsers().length === 0) {
      Storage.saveUsers([{ id: '1', username: 'admin', password: 'admin', role: 'admin', accessibleDocs: [] }]);
    }
  }
};

// --- GEMINI SERVICE ---
const chatWithAI = async (prompt: string, doc: Document, history: Message[], mode: 'doc' | 'web' | 'both') => {
  const apiKey = process.env.API_KEY;
  if (!apiKey) throw new Error("API_KEY missing in Environment!");
  
  const genAI = new GoogleGenAI({ apiKey });
  const model = genAI.models.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const systemInstruction = `You are a document assistant. 
    Context: ${doc.content.substring(0, 30000)}
    Instruction: ${doc.instruction}
    Note: Detect user language and reply in the same language.`;

  const contents = [
    ...history.map(m => ({ role: m.role, parts: [{ text: m.text }] })),
    { role: 'user', parts: [{ text: prompt }] }
  ];

  const tools = (mode === 'web' || mode === 'both') ? [{ googleSearch: {} }] : undefined;

  const result = await model.generateContent({
    contents: contents as any,
    config: { systemInstruction, tools } as any
  });
  
  return result.text;
};

// --- COMPONENTS ---

const ChatInterface = ({ docs }: { docs: Document[] }) => {
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(docs[0] || null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'doc' | 'web' | 'both'>('doc');
  const [selectedMsgs, setSelectedMsgs] = useState<Set<string>>(new Set());
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages]);

  const onSend = async () => {
    if (!input.trim() || !selectedDoc || loading) return;
    const userMsg: Message = { id: Date.now().toString(), role: 'user', text: input, timestamp: new Date().toLocaleTimeString(), source: mode };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    try {
      const response = await chatWithAI(input, selectedDoc, messages, mode);
      setMessages(prev => [...prev, { id: (Date.now()+1).toString(), role: 'model', text: response, timestamp: new Date().toLocaleTimeString(), source: mode }]);
    } catch (e: any) { alert(e.message); } finally { setLoading(false); }
  };

  const exportChat = (format: 'pdf' | 'docx') => {
    const list = messages.filter(m => selectedMsgs.has(m.id));
    if (list.length === 0) return alert("Please select messages first!");
    if (format === 'pdf') {
      const pdf = new (window as any).jspdf.jsPDF();
      let y = 20;
      list.forEach(m => {
        const txt = `[${m.role}] ${m.text}`;
        const lines = pdf.splitTextToSize(txt, 170);
        pdf.text(lines, 20, y);
        y += (lines.length * 7) + 5;
      });
      pdf.save("chat.pdf");
    } else {
      const text = list.map(m => `${m.role.toUpperCase()}: ${m.text}`).join('\n\n');
      const blob = new Blob([text], { type: 'application/msword' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = "chat.docx";
      a.click();
    }
  };

  return (
    <div className="flex flex-col h-full bg-white relative">
      {selectedMsgs.size > 0 && (
        <div className="absolute top-0 w-full bg-indigo-600 text-white p-3 flex justify-between items-center z-50 animate-slide">
          <span className="font-bold ml-4">{selectedMsgs.size} selected</span>
          <div className="flex gap-2">
            <button onClick={() => exportChat('pdf')} className="px-3 py-1 bg-white/20 rounded text-xs">Export PDF</button>
            <button onClick={() => exportChat('docx')} className="px-3 py-1 bg-white/20 rounded text-xs">Export DOCX</button>
            <button onClick={() => { setMessages(prev => prev.filter(m => !selectedMsgs.has(m.id))); setSelectedMsgs(new Set()); }} className="px-3 py-1 bg-red-500 rounded text-xs">Delete</button>
            <button onClick={() => setSelectedMsgs(new Set())} className="px-3 py-1 bg-black/20 rounded text-xs mr-4">Cancel</button>
          </div>
        </div>
      )}
      <header className="p-4 border-b flex justify-between items-center bg-slate-50">
        <select className="p-2 border rounded-lg text-sm font-bold outline-none" value={selectedDoc?.id} onChange={e => setSelectedDoc(docs.find(d => d.id === e.target.value) || null)}>
          {docs.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <div className="flex gap-1 bg-white p-1 rounded-lg border">
          {(['doc', 'web', 'both'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1 rounded text-[10px] font-bold uppercase transition-all ${mode === m ? 'bg-indigo-600 text-white' : 'text-slate-400'}`}>{m}</button>
          ))}
        </div>
      </header>
      <div className="flex-1 overflow-auto p-6 space-y-4 custom-scrollbar">
        {messages.map(m => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`flex items-start gap-2 max-w-[80%]`}>
              <input type="checkbox" checked={selectedMsgs.has(m.id)} onChange={() => {
                const n = new Set(selectedMsgs);
                n.has(m.id) ? n.delete(m.id) : n.add(m.id);
                setSelectedMsgs(n);
              }} className="mt-2" />
              <div className={`p-4 rounded-2xl shadow-sm text-sm ${m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.text}
                <div className="text-[9px] mt-2 opacity-50 uppercase font-bold tracking-widest">{m.source} | {m.timestamp}</div>
              </div>
            </div>
          </div>
        ))}
        {loading && <div className="text-slate-400 text-xs italic ml-8 animate-pulse">Gemini is thinking...</div>}
        <div ref={scrollRef} />
      </div>
      <div className="p-4 border-t bg-slate-50">
        <div className="max-w-4xl mx-auto flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && onSend()} placeholder="Type your message..." className="flex-1 p-3 border rounded-xl outline-none focus:ring-2 focus:ring-indigo-500" />
          <button onClick={onSend} className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 transition-all"><Icons.Send /></button>
        </div>
      </div>
    </div>
  );
};

const AdminPanel = ({ onLogout }: any) => {
  const [tab, setTab] = useState<'docs' | 'users'>('docs');
  const [docs, setDocs] = useState<Document[]>(Storage.getDocs());
  const [users, setUsers] = useState<User[]>(Storage.getUsers().filter(u => u.role !== 'admin'));
  
  const handleUpload = async (e: any) => {
    const file = e.target.files[0];
    if (!file) return;
    let content = "";
    if (file.type === 'application/pdf') {
      const pdf = await (window as any).pdfjsLib.getDocument(await file.arrayBuffer()).promise;
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        content += (await page.getTextContent()).items.map((it: any) => it.str).join(' ') + ' ';
      }
    } else content = await file.text();

    const newDoc: Document = { id: Math.random().toString(36).substr(2, 9), name: file.name, content, instruction: "Answer clearly.", uploadDate: new Date().toLocaleDateString(), type: file.type.includes('pdf') ? 'pdf' : 'text' };
    const nd = [...Storage.getDocs(), newDoc];
    Storage.saveDocs(nd); setDocs(nd);
  };

  const addUser = () => {
    const name = prompt("Username?");
    const pass = prompt("Password?");
    if (name && pass) {
      const nu = [...Storage.getUsers(), { id: Math.random().toString(36).substr(2, 9), username: name, password: pass, role: 'user', accessibleDocs: [] }];
      Storage.saveUsers(nu as any); setUsers(nu.filter(u => u.role !== 'admin') as any);
    }
  };

  return (
    <div className="flex h-full bg-slate-50">
      <div className="w-64 bg-white border-r flex flex-col p-6">
        <h1 className="text-xl font-extrabold text-indigo-600 mb-8">ADMIN PRO</h1>
        <nav className="flex-1 space-y-2">
          <button onClick={() => setTab('docs')} className={`w-full text-left p-3 rounded-lg font-bold text-sm ${tab === 'docs' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>Documents</button>
          <button onClick={() => setTab('users')} className={`w-full text-left p-3 rounded-lg font-bold text-sm ${tab === 'users' ? 'bg-indigo-50 text-indigo-600' : 'text-slate-400'}`}>Users Control</button>
        </nav>
        <button onClick={onLogout} className="text-red-500 font-bold flex items-center gap-2"><Icons.Logout /> Logout</button>
      </div>
      <div className="flex-1 p-8 overflow-auto">
        {tab === 'docs' ? (
          <div>
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-bold">Manage Documents</h2>
              <label className="bg-indigo-600 text-white px-4 py-2 rounded-lg cursor-pointer"><Icons.Plus /> Upload <input type="file" className="hidden" onChange={handleUpload} /></label>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {docs.map(d => (
                <div key={d.id} className="bg-white p-4 rounded-xl border">
                  <div className="flex justify-between font-bold mb-2"><span>{d.name}</span><button onClick={() => { const nd = docs.filter(x => x.id !== d.id); Storage.saveDocs(nd); setDocs(nd); }} className="text-red-400"><Icons.Trash /></button></div>
                  <textarea defaultValue={d.instruction} onBlur={e => { const nd = docs.map(x => x.id === d.id ? { ...x, instruction: e.target.value } : x); Storage.saveDocs(nd); setDocs(nd); }} className="w-full text-xs p-2 border rounded bg-slate-50 h-20" placeholder="System instructions..." />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <div className="flex justify-between mb-6">
              <h2 className="text-2xl font-bold">User Management</h2>
              <button onClick={addUser} className="bg-indigo-600 text-white px-4 py-2 rounded-lg"><Icons.Plus /> Add User</button>
            </div>
            <div className="bg-white rounded-xl border overflow-hidden">
              <table className="w-full text-left">
                <thead className="bg-slate-50 border-b"><tr className="text-xs font-bold uppercase text-slate-400"><th className="p-4">User</th><th className="p-4">Docs Access</th><th className="p-4 text-right">Action</th></tr></thead>
                <tbody>{users.map((u: any) => (
                  <tr key={u.id} className="border-b text-sm">
                    <td className="p-4 font-bold">{u.username}</td>
                    <td className="p-4 flex gap-2 flex-wrap">
                      {docs.map(d => (
                        <button key={d.id} onClick={() => {
                          const nu = Storage.getUsers().map(ux => ux.id === u.id ? { ...ux, accessibleDocs: ux.accessibleDocs.includes(d.id) ? ux.accessibleDocs.filter(id => id !== d.id) : [...ux.accessibleDocs, d.id] } : ux);
                          Storage.saveUsers(nu); setUsers(nu.filter(ux => ux.role !== 'admin'));
                        }} className={`px-2 py-1 rounded text-[10px] font-bold border ${u.accessibleDocs.includes(d.id) ? 'bg-indigo-100 border-indigo-200 text-indigo-700' : 'bg-slate-50 text-slate-300'}`}>{d.name}</button>
                      ))}
                    </td>
                    <td className="p-4 text-right"><button onClick={() => { const nu = Storage.getUsers().filter(ux => ux.id !== u.id); Storage.saveUsers(nu); setUsers(nu.filter(ux => ux.role !== 'admin')); }} className="text-red-400"><Icons.Trash /></button></td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const App = () => {
  const [user, setUser] = useState<User | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    Storage.init();
    const saved = localStorage.getItem('dc_session');
    if (saved) setUser(JSON.parse(saved));
  }, []);

  const login = (e: any) => {
    e.preventDefault();
    const found = Storage.getUsers().find(u => u.username === username && u.password === password);
    if (found) { setUser(found); localStorage.setItem('dc_session', JSON.stringify(found)); }
    else alert("Invalid Credentials (Hint: admin/admin)");
  };

  if (!user) return (
    <div className="h-screen flex items-center justify-center bg-slate-100 p-4">
      <div className="w-full max-w-md bg-white p-10 rounded-3xl shadow-2xl border">
        <h1 className="text-3xl font-black text-center mb-2">DocChat Pro</h1>
        <p className="text-center text-slate-400 mb-8 font-bold text-xs uppercase tracking-widest">AI Document Assistant</p>
        <form onSubmit={login} className="space-y-4">
          <input value={username} onChange={e => setUsername(e.target.value)} className="w-full p-4 border rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Username" required />
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="w-full p-4 border rounded-2xl outline-none focus:ring-4 focus:ring-indigo-50" placeholder="Password" required />
          <button className="w-full bg-indigo-600 text-white p-4 rounded-2xl font-bold shadow-lg">Login</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="h-screen overflow-hidden">
      {user.role === 'admin' ? (
        <AdminPanel onLogout={() => { setUser(null); localStorage.removeItem('dc_session'); }} />
      ) : (
        <div className="flex h-full">
           <aside className="w-64 bg-slate-50 border-r p-6 flex flex-col">
              <h2 className="font-black text-indigo-600 mb-8 uppercase tracking-tighter">DOCCHAT</h2>
              <div className="flex-1">
                 <div className="p-3 bg-white rounded-xl border mb-2 font-bold text-sm text-slate-700 truncate">{user.username}</div>
              </div>
              <button onClick={() => { setUser(null); localStorage.removeItem('dc_session'); }} className="text-red-500 font-bold flex items-center gap-2 mt-auto"><Icons.Logout /> Logout</button>
           </aside>
           <main className="flex-1">
              <ChatInterface docs={Storage.getDocs().filter(d => user.accessibleDocs.includes(d.id))} />
           </main>
        </div>
      )}
    </div>
  );
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);