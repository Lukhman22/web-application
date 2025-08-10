// server.js - Express backend with nonce challenge for voice verification
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { customAlphabet } = require('nanoid');
const nanoid = customAlphabet('abcdefghijklmnopqrstuvwxyz0123456789', 12);

const app = express();
app.use(cors());
app.use(bodyParser.json());

const JWT_SECRET = process.env.JWT_SECRET || 'change_me_in_prod';
const TEMP_TOKEN_EXP = '5m';
const SESSION_TOKEN_EXP = '4h';
const MAX_VOICE_ATTEMPTS = 3;

const db = new sqlite3.Database('data.sqlite');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, voice_hash TEXT, attempts INTEGER DEFAULT 0)`);
  db.run(`CREATE TABLE IF NOT EXISTS nonces (id INTEGER PRIMARY KEY, user_id INTEGER, nonce TEXT, created_at INTEGER)`);
});

function normalize(txt){ return (txt||'').toLowerCase().replace(/[^a-z0-9 ]+/g,'').trim(); }

function findUser(username){
  return new Promise((res,rej)=> db.get('SELECT * FROM users WHERE username = ?', [username], (e,r)=> e?rej(e):res(r)));
}

function createUser(username,passwordHash,voiceHash){
  return new Promise((res,rej)=> db.run('INSERT INTO users (username,password_hash,voice_hash) VALUES (?,?,?)', [username,passwordHash,voiceHash], function(err){
    if(err) return rej(err); res({id:this.lastID});
  }));
}

app.post('/api/register', async (req,res)=>{
  const { username, password, voicePhrase } = req.body;
  if(!username||!password||!voicePhrase) return res.status(400).json({error:'Missing fields'});
  try{
    const ph = await bcrypt.hash(password,10);
    const vh = await bcrypt.hash(normalize(voicePhrase),10);
    await createUser(username,ph,vh);
    return res.json({ok:true});
  }catch(err){
    if(err && err.message && err.message.includes('UNIQUE')) return res.status(409).json({error:'Username taken'});
    console.error(err); res.status(500).json({error:'Server error'});
  }
});

app.post('/api/login', async (req,res)=>{
  const { username, password } = req.body;
  if(!username||!password) return res.status(400).json({error:'Missing fields'});
  try{
    const user = await findUser(username);
    if(!user) return res.status(401).json({error:'Invalid credentials'});
    const ok = await bcrypt.compare(password, user.password_hash);
    if(!ok) return res.status(401).json({error:'Invalid credentials'});
    // create temp token and nonce
    const nonce = nanoid();
    db.run('INSERT INTO nonces (user_id,nonce,created_at) VALUES (?,?,?)', [user.id, nonce, Date.now()]);
    const tempToken = jwt.sign({ sub: user.id, stage: 'PASSWORD_OK' }, JWT_SECRET, { expiresIn: TEMP_TOKEN_EXP });
    return res.json({ok:true, tempToken, nonce});
  }catch(err){ console.error(err); res.status(500).json({error:'Server error'}); }
});

app.post('/api/verify-voice', async (req,res)=>{
  const { username, voiceText, tempToken, nonce } = req.body;
  if(!username||!voiceText||!tempToken||!nonce) return res.status(400).json({error:'Missing fields'});
  try{
    const decoded = jwt.verify(tempToken, JWT_SECRET);
    if(decoded.stage !== 'PASSWORD_OK') return res.status(401).json({error:'Invalid token stage'});
    const user = await findUser(username);
    if(!user) return res.status(401).json({error:'User not found'});
    // check attempts
    if(user.attempts >= MAX_VOICE_ATTEMPTS) return res.status(429).json({error:'Too many attempts'});
    // normalize and append nonce - simple challenge-response (client should have appended nonce in spoken phrase)
    const normalized = normalize(voiceText);
    // verify that the nonce was valid (recent)
    db.get('SELECT * FROM nonces WHERE user_id = ? AND nonce = ? ORDER BY created_at DESC LIMIT 1', [user.id, nonce], async (err,row)=>{
      if(err) { console.error(err); return res.status(500).json({error:'Server error'}); }
      if(!row) return res.status(401).json({error:'Invalid nonce'});
      // compare stored voice hash with normalized (which must include nonce words)
      const match = await bcrypt.compare(normalized, user.voice_hash);
      if(!match){
        db.run('UPDATE users SET attempts = attempts + 1 WHERE id = ?', [user.id]);
        return res.status(401).json({error:'Voice phrase mismatch'});
      }
      // success: reset attempts and delete nonces for user
      db.run('UPDATE users SET attempts = 0 WHERE id = ?', [user.id]);
      db.run('DELETE FROM nonces WHERE user_id = ?', [user.id]);
      const sessionToken = jwt.sign({ sub: user.id, stage: 'AUTHENTICATED' }, JWT_SECRET, { expiresIn: SESSION_TOKEN_EXP });
      return res.json({ok:true, sessionToken});
    });
  }catch(err){
    console.error(err);
    if(err.name === 'TokenExpiredError') return res.status(401).json({error:'Token expired'});
    res.status(500).json({error:'Server error'});
  }
});

app.get('/api/dashboard', (req,res)=>{
  const auth = req.headers['authorization'];
  if(!auth) return res.status(401).json({error:'Missing auth'});
  const parts = auth.split(' ');
  if(parts.length!==2 || parts[0]!=='Bearer') return res.status(401).json({error:'Malformed auth'});
  try{
    const decoded = jwt.verify(parts[1], JWT_SECRET);
    if(decoded.stage !== 'AUTHENTICATED') return res.status(401).json({error:'Not fully authenticated'});
    res.json({ok:true, message:'Welcome to your dashboard!'});
  }catch(err){ console.error(err); res.status(401).json({error:'Invalid token'}); }
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, ()=> console.log('Server running on', PORT));
