(() => {
// 通信層：Firebase Realtime Database と、テスト用のローカル実装を同じ形で扱う

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

async function createBackend() {
  const { firebaseConfig } = window.PARTY_CONFIG;
  if (firebaseConfig && firebaseConfig.databaseURL) return createFirebase(firebaseConfig);
  return createLocal();
}

// サーバーの時刻を書き込む印。早押しの順番など、端末の時計のずれを避けたいときに使う
const SERVER_TIME = { '.sv': 'timestamp' };

// Firebase は undefined を受け付けないので落としておく
const plain = (v) => (v === undefined ? null : JSON.parse(JSON.stringify(v)));

async function createFirebase(cfg) {
  const appMod = await import(FB + 'firebase-app.js');
  const db = await import(FB + 'firebase-database.js');
  const app = appMod.initializeApp(cfg, 'party-room');
  const d = db.getDatabase(app);
  const r = (p) => db.ref(d, p);
  return {
    kind: 'firebase',
    get: async (p) => (await db.get(r(p))).val(),
    set: (p, v) => db.set(r(p), plain(v)),
    update: (p, v) => db.update(r(p), plain(v)),
    remove: (p) => db.remove(r(p)),
    push: async (p, v) => (await db.push(r(p), plain(v))).key,
    subscribe: (p, cb) => db.onValue(r(p), (s) => cb(s.val())),
    presence(p) {
      const target = r(p);
      const off = db.onValue(r('.info/connected'), (s) => {
        if (s.val() === true) {
          db.onDisconnect(target).set(false);
          db.set(target, true);
        }
      });
      return () => { off(); db.onDisconnect(target).cancel(); };
    },
  };
}

// ---------- テスト用：localStorage（同じブラウザのタブ同士で共有） ----------
// 同じブラウザのタブ同士でデータを共有する。Firebase と同じく null や空のオブジェクトは消える。
function clean(v) {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) {
    const a = v.map(clean).filter((x) => x !== undefined);
    return a.length ? a : undefined;
  }
  if (typeof v === 'object') {
    const o = {};
    for (const [k, x] of Object.entries(v)) {
      const c = clean(x);
      if (c !== undefined) o[k] = c;
    }
    return Object.keys(o).length ? o : undefined;
  }
  return v;
}
const parts = (p) => p.split('/').filter(Boolean);
// テストモードでは SERVER_TIME をその場の時刻に置き換える
function resolveTime(v) {
  if (v && typeof v === 'object') {
    if (v['.sv'] === 'timestamp') return Date.now();
    const o = Array.isArray(v) ? [] : {};
    for (const k in v) o[k] = resolveTime(v[k]);
    return o;
  }
  return v;
}

function createLocal() {
  const KEY = 'party-localdb';
  const subs = new Set();
  // 各タブは手元に最新のデータを持ち、版番号 __v が大きい方を正とする
  let tree = read();

  function read() {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; }
  }
  const ver = (t) => (t && t.__v) || 0;
  function latest() {
    const stored = read();
    return ver(stored) >= ver(tree) ? stored : JSON.parse(JSON.stringify(tree));
  }
  function getAt(ps) {
    let n = tree;
    for (const k of ps) { if (n == null || typeof n !== 'object') return null; n = n[k]; }
    return n === undefined ? null : n;
  }
  function setAt(ps, v) {
    if (!ps.length) { tree = resolveTime(v) ?? {}; return; }
    let n = tree;
    for (const k of ps.slice(0, -1)) {
      if (n[k] == null || typeof n[k] !== 'object') n[k] = {};
      n = n[k];
    }
    n[ps.at(-1)] = v === undefined ? null : resolveTime(JSON.parse(JSON.stringify(v)));
  }
  function notify() {
    for (const s of subs) {
      const json = JSON.stringify(getAt(s.ps) ?? null);
      if (json !== s.last) { s.last = json; s.cb(JSON.parse(json)); }
    }
  }
  // タブ同士で同時に書き込むと片方が消えるので、ブラウザのロックで1つずつ順番に書き込む
  function write(fn) {
    const run = () => {
      tree = latest();
      const v = ver(tree);
      fn();
      tree = clean(tree) || {};
      tree.__v = v + 1;
      localStorage.setItem(KEY, JSON.stringify(tree));
      notify();
    };
    if (navigator.locks) return navigator.locks.request(KEY, run);
    run();
    return Promise.resolve();
  }
  // 他のタブの書き込みは storage イベントで、新しいデータごと届く
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    let t;
    try { t = JSON.parse(e.newValue || '{}') || {}; } catch { return; }
    if (ver(t) >= ver(tree)) { tree = t; notify(); }
  });

  let seq = 0;
  return {
    kind: 'local',
    get: async (p) => { tree = latest(); return JSON.parse(JSON.stringify(getAt(parts(p)) ?? null)); },
    set: (p, v) => write(() => setAt(parts(p), v)),
    update: (p, obj) => write(() => {
      for (const [k, v] of Object.entries(obj)) setAt([...parts(p), ...parts(k)], v);
    }),
    remove: (p) => write(() => setAt(parts(p), null)),
    push: async (p, v) => {
      const key = Date.now().toString(36).padStart(10, '0') + (seq++).toString(36).padStart(4, '0') + Math.random().toString(36).slice(2, 6);
      await write(() => setAt([...parts(p), key], v));
      return key;
    },
    subscribe(p, cb) {
      const s = { ps: parts(p), cb, last: undefined };
      subs.add(s);
      queueMicrotask(() => { if (subs.has(s)) { s.last = JSON.stringify(getAt(s.ps) ?? null); cb(JSON.parse(s.last)); } });
      return () => subs.delete(s);
    },
    presence(p) {
      write(() => setAt(parts(p), true));
      return () => {};
    },
  };
}

window.Party.createBackend = createBackend;
window.Party.SERVER_TIME = SERVER_TIME;
})();
