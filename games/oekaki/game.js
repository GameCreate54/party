// ===== お絵かきクイズ =====
// 描く人だけにお題が見える。描いた絵はリアルタイムでみんなの画面に出る。
// ほかの人は答えを打って当てる。早く当てるほど高得点、当てられた描き手にも得点。
// 描き手は順番に交代。絵は描き手が自分の欄（live）に直接書くので、ホストを通らず速い。
(() => {
const { h, button, stepper, segmented, inputBox, drafts, shuffle, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

// 表示名|別の書き方|…（ひらがな・カタカナは自動で同じ扱い）
const WORDS = [
  'りんご|林檎', 'バナナ', 'ぶどう|葡萄', 'すいか|西瓜', 'いちご|苺', 'さくらんぼ', 'パイナップル', 'みかん|蜜柑',
  'ねこ|猫', 'いぬ|犬', 'うさぎ|兎', 'ぞう|象', 'きりん|麒麟', 'ペンギン', 'かえる|蛙', 'へび|蛇', 'かたつむり', 'たこ|蛸', 'くじら|鯨', 'さかな|魚',
  'ライオン', 'パンダ', 'ぶた|豚', 'にわとり|鶏', 'かに|蟹', 'ちょうちょ|蝶|ちょう', 'はち|蜂', 'くも|蜘蛛', 'ねずみ|鼠', 'カメ|亀',
  'いえ|家', 'くるま|車', 'でんしゃ|電車', 'ひこうき|飛行機', 'じてんしゃ|自転車', 'ふね|船', 'ロケット', 'しんかんせん|新幹線',
  'たいよう|太陽', 'つき|月', 'ほし|星', 'くも|雲', 'にじ|虹', 'かみなり|雷', 'ゆきだるま|雪だるま', 'やま|山', 'うみ|海', 'き|木',
  'はな|花', 'ひまわり|向日葵', 'チューリップ', 'さくら|桜', 'きのこ|茸', 'サボテン',
  'めがね|眼鏡', 'とけい|時計', 'かさ|傘', 'くつ|靴', 'ぼうし|帽子', 'はさみ', 'えんぴつ|鉛筆', 'かぎ|鍵', 'でんきゅう|電球', 'テレビ',
  'スマホ|スマートフォン|携帯', 'カメラ', 'ギター', 'ピアノ', 'ボール', 'サッカー', 'やきゅう|野球', 'つり|釣り',
  'おにぎり', 'ラーメン', 'すし|寿司', 'カレー', 'ハンバーガー', 'ケーキ', 'アイス|アイスクリーム', 'ドーナツ', 'たまご|卵', 'ピザ',
  'おばけ|お化け|幽霊', 'ロボット', 'うちゅうじん|宇宙人', 'にんじゃ|忍者', 'おうさま|王様', 'かいじゅう|怪獣', 'ゆうれい|幽霊',
  'ふうせん|風船', 'プレゼント', 'クリスマスツリー', 'はなび|花火', 'かがみもち|鏡餅', 'こいのぼり', 'しろ|城', 'トイレ', 'うんち', 'はみがき|歯磨き',
];
const COLORS = ['#1b1b1b', '#e5484d', '#f59e0b', '#22a35a', '#2f6fde', '#8e4ec6', '#8b5a2b', '#ffffff'];
const REVEAL_MS = 5000;

const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s。、!?！？ー〜~・]/g, '');

const view = { turn: null, strokes: [], color: COLORS[0], width: 6, cur: null, flushT: null, setLive: null, seenCorrect: {}, seenPhase: null, now: null, rerender: null };

function newTurn(ctx, g, turnNo) {
  const drawer = g.order[turnNo % g.order.length];
  const used = new Set(g.used || []);
  let pool = WORDS.map((_, i) => i).filter((i) => !used.has(i));
  if (!pool.length) pool = WORDS.map((_, i) => i);
  const wi = shuffle(pool)[0];
  const parts = WORDS[wi].split('|');
  const now = ctx.now();
  return {
    game: { ...g, phase: 'draw', turn: turnNo, drawer, endAt: now + g.secs * 1000 + 1500, startAt: now + 1500, correct: null, chat: null, word: null, used: [...(g.used || []), wi] },
    private: { answers: parts.map(norm), word: parts[0] },
    secrets: { [drawer]: { word: parts[0], turn: turnNo } },
  };
}

function newGame(ctx) {
  const order = shuffle(ctx.players.map((p) => p.id));
  const scores = {};
  order.forEach((id) => { scores[id] = 0; });
  const s = ctx.settings;
  const g = { players: order, order, scores, secs: Number(s.secs) || 90, turns: order.length * (Number(s.laps) || 1), used: [] };
  return newTurn(ctx, g, 0);
}

function endTurn(ctx, g) {
  const word = (ctx.private || {}).word || '？';
  return { game: { ...g, phase: 'reveal', word, nextAt: ctx.now() + REVEAL_MS }, private: null, secrets: null };
}

window.Party.register({
  id: 'oekaki',
  name: 'お絵かきクイズ',
  icon: '🎨',
  description: '描く人だけにお題が見える。リアルタイムで届く絵を見て、だれよりも早く当てよう',

  defaultSettings: () => ({ secs: 90, laps: 1 }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { secs: 90, laps: 1, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '1人の持ち時間'),
        segmented([{ value: 60, label: '60秒' }, { value: 90, label: '90秒' }, { value: 120, label: '120秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, '描く回数（1人あたり）'), stepper(Number(s.laps), 1, 3, (laps) => set({ laps }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '早く当てた人ほど高得点（3→2→1点）。当ててもらえた描き手も1人につき+1点。文字を書くのは禁止！'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    if (a.type === 'again') {
      if (g.phase !== 'over' || a.from !== ctx.hostId || playerCountError(ctx, 2)) return null;
      return newGame(ctx);
    }
    if (a.type === 'skip') {
      if (g.phase !== 'draw' || (a.from !== ctx.hostId && a.from !== g.drawer)) return null;
      return endTurn(ctx, g);
    }
    if (a.type !== 'guess' || g.phase !== 'draw' || a.turn !== g.turn) return null;
    if (a.from === g.drawer || !g.players.includes(a.from) || (g.correct || {})[a.from]) return null;
    const text = String(a.text || '').trim().slice(0, 20);
    if (!text) return null;
    const answers = (ctx.private || {}).answers || [];
    if (answers.includes(norm(text))) {
      const rank = Object.keys(g.correct || {}).length;
      const pts = Math.max(1, 3 - rank);
      const scores = { ...g.scores, [a.from]: (g.scores[a.from] || 0) + pts, [g.drawer]: (g.scores[g.drawer] || 0) + 1 };
      const correct = { ...(g.correct || {}), [a.from]: pts };
      const chat = [...(g.chat || []), { by: a.from, ok: 1 }].slice(-30);
      const ng = { ...g, scores, correct, chat };
      const guessers = activeIds(ctx, g.players).filter((id) => id !== g.drawer);
      if (guessers.every((id) => correct[id])) return endTurn(ctx, ng);
      return { game: ng };
    }
    const chat = [...(g.chat || []), { by: a.from, t: text }].slice(-30);
    return { game: { ...g, chat } };
  },

  tick(ctx) {
    const g = ctx.game;
    if (!g) return null;
    const now = ctx.now();
    if (g.phase === 'draw' && now >= g.endAt) return endTurn(ctx, g);
    if (g.phase === 'reveal' && now >= g.nextAt) {
      if (g.turn + 1 >= g.turns) return { game: { ...g, phase: 'over' } };
      return newTurn(ctx, g, g.turn + 1);
    }
    return null;
  },

  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    view.rerender = ctx.rerender;
    view.setLive = ctx.setLive;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🎨' });
    if (view.turn !== g.turn) {
      view.turn = g.turn; view.strokes = []; view.cur = null; view.seenCorrect = {};
      drafts['oe-guess'] = '';
      if (g.drawer === ctx.me) { beep(880, 0.2, 'triangle', 0.1, 1320); buzz(80); }
    }
    for (const id of Object.keys(g.correct || {})) {
      if (!view.seenCorrect[id]) { view.seenCorrect[id] = true; beep(1000, 0.12, 'triangle', 0.08, 1600); }
    }
    if (g.phase === 'reveal' && view.seenPhase !== 'r' + g.turn) { view.seenPhase = 'r' + g.turn; beep(600, 0.3, 'triangle', 0.08, 900); }
    const isDrawer = g.drawer === ctx.me && g.phase === 'draw';
    view.isDrawer = isDrawer;
    // 絵の元データ：描き手は手元、ほかの人は描き手の live 欄
    const lv = (ctx.live || {})[g.drawer];
    const strokes = isDrawer ? view.strokes : (lv && lv.turn === g.turn ? lv.s || [] : []);
    requestAnimationFrame(() => drawAll(strokes));
    return playView(ctx, g, isDrawer);
  },
});

function playView(ctx, g, isDrawer) {
  const me = ctx.me;
  const mySecret = ctx.secret && ctx.secret.turn === g.turn ? ctx.secret.word : null;
  const got = (g.correct || {})[me];
  const submit = () => {
    const t = (drafts['oe-guess'] || '').trim();
    if (!t) return;
    drafts['oe-guess'] = '';
    const el = document.getElementById('oe-guess'); if (el) el.value = '';
    ctx.send('guess', { text: t, turn: g.turn });
  };
  let head;
  if (g.phase === 'reveal') {
    head = h('div', { class: 'oe-head reveal pop' }, h('span', { class: 'muted small' }, '正解は'), h('strong', null, g.word));
  } else if (isDrawer) {
    head = h('div', { class: 'oe-head mine' }, h('span', { class: 'muted small' }, 'あなたが描く番！お題'), h('strong', null, mySecret || '…'));
  } else {
    head = h('div', { class: 'oe-head' }, h('span', { class: 'muted small' }, `${nameOf(ctx, g.drawer)} が描いています`),
      got ? h('strong', { class: 'ok' }, `正解！ +${got}`) : h('strong', null, '？？？'));
  }
  return h('div', { class: 'stack oe' },
    h('div', { class: 'oe-top' },
      h('span', { class: 'round-pill' }, `${g.turn + 1} / ${g.turns}`),
      g.phase === 'draw' ? h('span', { class: 'oe-timer', 'data-oe-end': g.endAt }, '') : null),
    head,
    h('div', { class: 'oe-board' }, h('canvas', { id: 'oe-canvas', width: 600, height: 600, class: isDrawer ? 'drawing' : '' })),
    isDrawer ? toolbar(ctx, g) : null,
    !isDrawer && g.phase === 'draw' && g.players.includes(me)
      ? (got
        ? h('p', { class: 'center muted small', style: 'margin:0' }, 'ほかの人が当てるのを待っています…')
        : h('div', { class: 'oe-row' },
          inputBox('oe-guess', { placeholder: '答えを入力（何回でもOK）', maxlength: 20, onEnter: submit, keepFocus: true, enterkeyhint: 'send' }),
          button('送信', submit, 'primary')))
      : null,
    h('div', { class: 'oe-chat' }, [...(g.chat || [])].reverse().slice(0, 8).map((c) =>
      h('div', { class: 'oe-msg' + (c.ok ? ' ok' : '') }, h('b', null, nameOf(ctx, c.by)), c.ok ? ' が正解！' : '：' + c.t))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'),
      scoreList(ctx, g.players, g.scores, { mark: { [g.drawer]: 'oe-drawer' } })),
    g.phase === 'draw' && (ctx.isHost || isDrawer)
      ? button(isDrawer ? 'パスして次へ（降参）' : 'この回を終わらせる', () => ctx.send('skip'), 'ghost small') : null);
}

function toolbar(ctx, g) {
  return h('div', { class: 'oe-tools' },
    h('div', { class: 'oe-colors' }, COLORS.map((c) => h('button', {
      type: 'button', class: 'oe-color' + (view.color === c ? ' on' : ''), style: `background:${c}`,
      onclick: () => { view.color = c; ctx.rerender(); },
    }))),
    h('div', { class: 'oe-tools-row' },
      segmented([{ value: 3, label: '細' }, { value: 6, label: '中' }, { value: 14, label: '太' }], view.width, (w) => { view.width = w; ctx.rerender(); }),
      button('↶ 戻す', () => { view.strokes.pop(); flush(true); ctx.rerender(); }, 'small'),
      button('🗑 全消し', () => { view.strokes = []; flush(true); ctx.rerender(); }, 'small')));
}

// ---------- 描画 ----------
function drawStroke(c2, s) {
  const p = s.p || [];
  if (p.length < 2) return;
  c2.strokeStyle = s.c; c2.lineWidth = s.w; c2.lineCap = 'round'; c2.lineJoin = 'round';
  c2.beginPath();
  c2.moveTo(p[0] * 0.6, p[1] * 0.6);
  if (p.length === 2) c2.lineTo(p[0] * 0.6 + 0.1, p[1] * 0.6);
  for (let i = 2; i < p.length; i += 2) c2.lineTo(p[i] * 0.6, p[i + 1] * 0.6);
  c2.stroke();
}
function drawAll(strokes) {
  const cv = document.getElementById('oe-canvas');
  if (!cv) return;
  const c2 = cv.getContext('2d');
  c2.fillStyle = '#fbfaf5';
  c2.fillRect(0, 0, cv.width, cv.height);
  for (const s of strokes || []) drawStroke(c2, s);
}

// 描いた線を live 欄に送る（少しまとめて送る）
function flush(now) {
  if (!view.setLive) return;
  const send = () => { view.flushT = null; view.setLive({ turn: view.turn, s: view.strokes }); };
  if (now) { clearTimeout(view.flushT); send(); return; }
  if (!view.flushT) view.flushT = setTimeout(send, 120);
}

function pos(e, cv) {
  const r = cv.getBoundingClientRect();
  const x = Math.round(((e.clientX - r.left) / r.width) * 1000);
  const y = Math.round(((e.clientY - r.top) / r.height) * 1000);
  return [Math.max(0, Math.min(1000, x)), Math.max(0, Math.min(1000, y))];
}

document.addEventListener('pointerdown', (e) => {
  const cv = e.target;
  if (!cv || cv.id !== 'oe-canvas' || !view.isDrawer) return;
  e.preventDefault();
  try { cv.setPointerCapture(e.pointerId); } catch { /* なし */ }
  view.cur = { c: view.color, w: view.width, p: pos(e, cv) };
  view.strokes.push(view.cur);
  drawStroke(cv.getContext('2d'), view.cur);
});
document.addEventListener('pointermove', (e) => {
  const cv = document.getElementById('oe-canvas');
  if (!view.cur || !cv || !view.isDrawer) return;
  const [x, y] = pos(e, cv);
  const p = view.cur.p;
  if (Math.abs(p[p.length - 2] - x) + Math.abs(p[p.length - 1] - y) < 6) return;
  if (p.length > 600) { // 長すぎる線は分ける
    view.cur = { c: view.cur.c, w: view.cur.w, p: [p[p.length - 2], p[p.length - 1]] };
    view.strokes.push(view.cur);
  }
  view.cur.p.push(x, y);
  const c2 = cv.getContext('2d');
  c2.strokeStyle = view.cur.c; c2.lineWidth = view.cur.w; c2.lineCap = 'round';
  c2.beginPath();
  const q = view.cur.p;
  c2.moveTo(q[q.length - 4] * 0.6, q[q.length - 3] * 0.6);
  c2.lineTo(x * 0.6, y * 0.6);
  c2.stroke();
  flush();
});
const up = () => { if (view.cur) { view.cur = null; flush(true); } };
document.addEventListener('pointerup', up);
document.addEventListener('pointercancel', up);

// 残り時間
setInterval(() => {
  document.querySelectorAll('[data-oe-end]').forEach((el) => {
    if (!view.now) return;
    const left = Math.max(0, Number(el.getAttribute('data-oe-end')) - view.now());
    const t = '⏱ ' + Math.ceil(left / 1000) + '秒';
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('hurry', left < 10000);
  });
}, 200);
})();
