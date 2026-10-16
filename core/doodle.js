// ===== みんなの落書き帳（トップ画面） =====
// 部屋に入る前の待ち時間に、全員が同じキャンバスに落書きできる。
// 線は描いている途中も少しずつ送るので、ほかの人の線がほぼリアルタイムで見える。
(() => {
const { ROOT } = window.PARTY_CONFIG;
const { h, ask, toast } = window.Party.ui;

// 部屋と同じ場所（rooms の下）に置くと、データベースのルールを変えずに使える
const BASE = `${ROOT}/rooms/doodle`;
const W = 1000;
const H = 700;
const KEEP = 600; // 表示する線の数（古いものから消える）
const COLORS = ['#1b1b1b', '#e5484d', '#f59e0b', '#f5c400', '#22a35a', '#2f6fde', '#8e4ec6', '#ec4899', '#8b5a2b', '#ffffff'];
const SIZES = [4, 10, 24];

let db = null;
let el = null;
let canvas = null;
let cx = null;
let color = COLORS[1];
let size = SIZES[0];
const keys = [];
let offs = [];
let cur = null;
let flushTimer = null;
let lastClear = undefined;

function drawStroke(s) {
  const p = s && s.p;
  if (!p || p.length < 2) return;
  cx.strokeStyle = s.c || '#1b1b1b';
  cx.fillStyle = s.c || '#1b1b1b';
  cx.lineWidth = s.w || 4;
  cx.lineCap = 'round';
  cx.lineJoin = 'round';
  if (p.length === 2) {
    cx.beginPath();
    cx.arc(p[0], p[1], (s.w || 4) / 2, 0, Math.PI * 2);
    cx.fill();
    return;
  }
  cx.beginPath();
  cx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) cx.lineTo(p[i], p[i + 1]);
  cx.stroke();
}
function wipe() {
  cx.fillStyle = '#fbfaf5';
  cx.fillRect(0, 0, W, H);
}

function pos(e) {
  const r = canvas.getBoundingClientRect();
  return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
}
// 描いている線を少しずつ送る（つなぎ目が切れないよう、最後の点から続けて送る）
function flush(final) {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!cur || cur.p.length <= cur.sent) { if (final) cur = null; return; }
  const from = Math.max(0, cur.sent - 2);
  const p = cur.p.slice(from);
  if (p.length >= 2) db.push(BASE + '/strokes', { c: cur.c, w: cur.w, p });
  cur.sent = cur.p.length;
  if (final) cur = null;
}
function down(e) {
  if (!db) return;
  e.preventDefault();
  canvas.setPointerCapture && canvas.setPointerCapture(e.pointerId);
  const [x, y] = pos(e);
  cur = { c: color, w: size, p: [x, y], sent: 0 };
  drawStroke({ c: color, w: size, p: [x, y] });
}
function move(e) {
  if (!cur) return;
  e.preventDefault();
  const [x, y] = pos(e);
  const n = cur.p.length;
  if (Math.abs(cur.p[n - 2] - x) + Math.abs(cur.p[n - 1] - y) < 4) return;
  drawStroke({ c: cur.c, w: cur.w, p: [cur.p[n - 2], cur.p[n - 1], x, y] });
  cur.p.push(x, y);
  if (!flushTimer) flushTimer = setTimeout(() => flush(false), 200);
}
function up(e) {
  if (!cur) return;
  e.preventDefault();
  flush(true);
}

function onStroke(k, s) {
  if (keys.includes(k)) return;
  keys.push(k);
  drawStroke(s);
  // データがふくらみすぎないよう、古い線をときどき消す
  if (keys.length > KEEP + 150 && Math.random() < 0.2) {
    const old = keys.splice(0, keys.length - KEEP);
    const u = {};
    old.forEach((x) => { u[x] = null; });
    db.update(BASE + '/strokes', u);
  }
}

function connect() {
  offs.forEach((f) => f && f());
  offs = [];
  keys.length = 0;
  wipe();
  offs.push(db.subscribe(BASE + '/clear', (v) => {
    if (lastClear !== undefined && v !== lastClear) { keys.length = 0; wipe(); }
    lastClear = v;
  }));
  offs.push(db.feed(BASE + '/strokes', KEEP, onStroke));
}

function palette() {
  return h('div', { class: 'dd-tools' },
    h('div', { class: 'dd-colors' }, COLORS.map((c) => h('button', {
      type: 'button', class: 'dd-c' + (c === color ? ' on' : ''), style: `background:${c}`, 'aria-label': '色',
      onclick: () => { color = c; refreshTools(); },
    }))),
    h('div', { class: 'dd-sizes' }, SIZES.map((s) => h('button', {
      type: 'button', class: 'dd-s' + (s === size ? ' on' : ''), 'aria-label': '太さ',
      onclick: () => { size = s; refreshTools(); },
    }, h('i', { style: `width:${Math.max(6, s * 0.8)}px;height:${Math.max(6, s * 0.8)}px` })))),
    h('button', { type: 'button', class: 'btn ghost small dd-clear', onclick: clearAll }, '全消し'));
}
function clearAll() {
  ask('みんなの落書きを全部消しますか？\n（ほかの人の画面からも消えます）', () => {
    db.update(BASE, { clear: window.Party.SERVER_TIME, strokes: null });
    toast('まっさらになりました');
  }, { yes: '全部消す' });
}
function refreshTools() {
  const t = el.querySelector('.dd-tools');
  if (t) t.replaceWith(palette());
}

// トップ画面に置く要素（同じ要素を使い回すので、画面を描き直しても絵は消えない）
function element(backend) {
  if (!el) {
    canvas = h('canvas', { class: 'dd-canvas', width: W, height: H });
    cx = canvas.getContext('2d');
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('pointerleave', up);
    el = h('section', { class: 'card dd-card', id: 'doodle' },
      h('div', { class: 'dd-head' }, h('h2', null, '🖍️ みんなの落書き帳'), h('span', { class: 'muted small' }, '開いている人みんなで同じ紙に描けます')),
      canvas,
      palette());
  }
  if (backend && backend !== db) { db = backend; connect(); }
  return el;
}

window.Party.doodle = { element };
})();
