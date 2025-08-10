import React, { useState, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:4000';

export default function App(){
  const [view,setView] = useState('register');
  const [username,setUsername] = useState('');
  const [password,setPassword] = useState('');
  const [phrase,setPhrase] = useState('');
  const [status,setStatus] = useState('');
  const [tempToken,setTempToken] = useState(null);
  const [nonce,setNonce] = useState(null);
  const [sessionToken,setSessionToken] = useState(null);
  const [spokenText,setSpokenText] = useState('');
  const recognitionRef = useRef(null);

  async function register(){
    setStatus('Registering...');
    try{
      const res = await fetch(API_BASE + '/api/register', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password, voicePhrase: phrase })});
      const j = await res.json();
      if(!j.ok) throw new Error(j.error || 'Register failed');
      setStatus('Registered. Proceed to login.');
      setView('login');
    }catch(err){ setStatus('Error: '+err.message); }
  }

  async function login(){
    setStatus('Logging in...');
    try{
      const res = await fetch(API_BASE + '/api/login', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, password })});
      const j = await res.json();
      if(!j.ok) throw new Error(j.error || 'Login failed');
      setTempToken(j.tempToken); setNonce(j.nonce);
      setStatus('Password accepted. Speak the displayed nonce appended to your phrase.');
      setView('voice');
    }catch(err){ setStatus('Error: '+err.message); }
  }

  function startRecording(){
    setSpokenText('');
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SpeechRecognition) return setStatus('SpeechRecognition not supported');
    const rec = new SpeechRecognition();
    rec.lang='en-US'; rec.interimResults=false; rec.maxAlternatives=1;
    rec.onresult = (e)=> { const txt = e.results[0][0].transcript; setSpokenText(txt); setStatus('Heard: '+txt); };
    rec.onerror = (e)=> setStatus('Recognition error: '+e.error);
    rec.start(); recognitionRef.current = rec; setStatus('Listening...'); 
  }

  async function verify(){
    if(!tempToken) return setStatus('Missing temp token');
    setStatus('Verifying voice...');
    try{
      const res = await fetch(API_BASE + '/api/verify-voice', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ username, voiceText: spokenText, tempToken, nonce })});
      const j = await res.json();
      if(!j.ok) throw new Error(j.error || 'Verify failed');
      setSessionToken(j.sessionToken); setStatus('Authenticated!'); setView('dashboard');
    }catch(err){ setStatus('Error: '+err.message); }
  }

  async function ping(){
    if(!sessionToken) return setStatus('Not authenticated');
    try{
      const res = await fetch(API_BASE + '/api/dashboard', { headers:{ 'Authorization':'Bearer '+sessionToken }});
      const j = await res.json();
      alert(j.message || 'OK');
    }catch(err){ setStatus('Server error: '+err.message); }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50 p-8 flex items-center justify-center">
      <div className="max-w-3xl w-full bg-white/80 backdrop-blur rounded-2xl shadow-xl p-8">
        <h1 className="text-3xl font-bold mb-4">Two‑Way Auth — Password + Voice</h1>
        {view==='register' && (
          <div>
            <input placeholder="Username" className="w-full p-3 border rounded mb-2" value={username} onChange={e=>setUsername(e.target.value)} />
            <input type="password" placeholder="Password" className="w-full p-3 border rounded mb-2" value={password} onChange={e=>setPassword(e.target.value)} />
            <input placeholder="Choose a voice phrase (eg: my secret mango)" className="w-full p-3 border rounded mb-2" value={phrase} onChange={e=>setPhrase(e.target.value)} />
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={register}>Register</button>
              <button className="px-4 py-2 bg-gray-800 text-white rounded" onClick={()=>setView('login')}>Go to Login</button>
            </div>
            <p className="mt-3 text-sm text-gray-600">{status}</p>
          </div>
        )}
        {view==='login' && (
          <div>
            <input placeholder="Username" className="w-full p-3 border rounded mb-2" value={username} onChange={e=>setUsername(e.target.value)} />
            <input type="password" placeholder="Password" className="w-full p-3 border rounded mb-2" value={password} onChange={e=>setPassword(e.target.value)} />
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={login}>Login</button>
              <button className="px-4 py-2 bg-gray-800 text-white rounded" onClick={()=>setView('register')}>Register</button>
            </div>
            <p className="mt-3 text-sm text-gray-600">{status}</p>
          </div>
        )}
        {view==='voice' && (
          <div>
            <p className="mb-2">You must say your phrase **and** the nonce: <span className="font-semibold">{nonce}</span></p>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-green-600 text-white rounded" onClick={startRecording}>Start Recording</button>
              <button className="px-4 py-2 bg-blue-600 text-white rounded" onClick={verify}>Send for Verification</button>
            </div>
            <p className="mt-2">Heard: <strong>{spokenText || '-'}</strong></p>
            <p className="mt-3 text-sm text-gray-600">{status}</p>
          </div>
        )}
        {view==='dashboard' && (
          <div>
            <h2 className="text-xl font-semibold mb-3">Dashboard</h2>
            <div className="grid grid-cols-3 gap-4">
              <a href="https://www.google.com" target="_blank" rel="noreferrer" className="p-4 border rounded text-center">Google</a>
              <a href="https://www.youtube.com" target="_blank" rel="noreferrer" className="p-4 border rounded text-center">YouTube</a>
              <a href="https://www.wikipedia.org" target="_blank" rel="noreferrer" className="p-4 border rounded text-center">Wikipedia</a>
            </div>
            <div className="mt-4">
              <button className="px-4 py-2 bg-indigo-600 text-white rounded" onClick={ping}>Ping Server</button>
            </div>
            <p className="mt-3 text-sm text-gray-600">{status}</p>
          </div>
        )}
      </div>
    </div>
  );
}
