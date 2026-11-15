/* Paste your Firebase web config here to go live. Leave null for local demo mode. */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDd7orTjcvzv-EhaxPSaFCELdVG3KWSkkY",
  authDomain: "ffaccstore-3cae6.firebaseapp.com",
  projectId: "ffaccstore-3cae6",
  storageBucket: "ffaccstore-3cae6.firebasestorage.app",
  messagingSenderId: "694269080165",
  appId: "1:694269080165:web:cce5acb873c9b33dee4c8c"
};
/* e.g. {apiKey:"...", authDomain:"...", projectId:"...", appId:"..."} */

const DEFAULTS = {
  settings: {name:'GHOST EDITS', title:'Anime edits, frame by frame', sub:'The best anime edits and AMVs, sorted by mood.', accent:'#a855f7', footer:'© 2026 Ghost Edits'},
  cats: ['Action', 'Sad', 'Romance', 'Phonk'],
  clips: []
};

let db = null, auth = null, storage = null;
if (FIREBASE_CONFIG && window.firebase) {
  firebase.initializeApp(FIREBASE_CONFIG);
  db = firebase.firestore();
  auth = firebase.auth ? firebase.auth() : null;
  storage = firebase.storage ? firebase.storage() : null;
}

async function loadData() {
  let d;
  if (db) { const s = await db.doc('site/main').get(); d = s.exists ? s.data() : null; }
  else d = JSON.parse(localStorage.getItem('ghost-edits') || 'null');
  return Object.assign({}, DEFAULTS, d || {}, {settings: Object.assign({}, DEFAULTS.settings, (d || {}).settings)});
}
async function saveData(d) {
  if (db) await db.doc('site/main').set(d);
  else localStorage.setItem('ghost-edits', JSON.stringify(d));
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

/* Works with YouTube (incl. Shorts), Google Drive and direct .mp4/.webm links */
function parseVideo(url) {
  let m = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  if (m) return {type:'yt', id:m[1], thumb:`https://img.youtube.com/vi/${m[1]}/hqdefault.jpg`};
  m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (m) return {type:'drive', id:m[1]};
  return {type:'file', url};
}

/* AniList: find which anime a character (or title) belongs to */
async function ani(query, variables) {
  const r = await fetch('https://graphql.anilist.co', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({query, variables})});
  return (await r.json()).data;
}
const STOP = new Set(['edit','amv','status','video','the','and','mp4','mov','new','best','anime','capcut','slowed','reverb','phonk','sad','attitude','whatsapp','vid','img','part','final']);
function words(t) {
  return t.replace(/\.[a-z0-9]{2,4}$/i, '').replace(/[_\-.|()\[\]]+/g, ' ').split(/\s+/).filter(w => w.length > 2 && !STOP.has(w.toLowerCase()) && !/^\d+$/.test(w));
}
async function findAnime(title) {
  const w = words(title);
  if (!w.length) return null;
  for (const s of [w.join(' '), ...w].slice(0, 5)) {
    const d = await ani('query($s:String){Page(perPage:1){characters(search:$s,sort:SEARCH_MATCH){name{full} media(sort:POPULARITY_DESC,perPage:1){nodes{title{english romaji}}}}}}', {s}).catch(() => null);
    const c = d && d.Page.characters[0], n = c && c.media.nodes[0];
    if (n) return {anime: n.title.english || n.title.romaji, char: c.name.full};
  }
  return null;
}

/* Local videos (IndexedDB): kept in this browser only, never uploaded */
const IDB = new Promise((ok, no) => {
  const r = indexedDB.open('ghost-edits', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('clips', {keyPath: 'id'});
  r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error);
});
const tx = async (mode, fn) => {
  const h = await IDB;
  return new Promise((ok, no) => { const t = h.transaction('clips', mode), rq = fn(t.objectStore('clips')); t.oncomplete = () => ok(rq && rq.result); t.onerror = () => no(t.error); });
};
const localPut = c => tx('readwrite', s => s.put(c));
const localDel = id => tx('readwrite', s => s.delete(id));
async function localAll() {
  const rows = await tx('readonly', s => s.getAll()).catch(() => []);
  return (rows || []).map(r => ({id: r.id, title: r.title, cat: r.cat, local: true, url: URL.createObjectURL(r.blob), thumb: r.thumb ? URL.createObjectURL(r.thumb) : ''}));
}
