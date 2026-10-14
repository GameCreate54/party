// ===== おちんぽげーむ =====
// 画面に「おちんぽ」が出たら おちんぽボタン（+1）、「超おちんぽ」なら 超おちんぽボタン（+3）。
// ニセモノで押したら減点。途中で文字が変わる問題もある。
// 覚醒ボタンで10秒間、正解の得点が10倍。1問につき押せるのは1回、一番早く正解した人だけが得点。
//
// 出題・判定はホストの端末で行う（tick）。押した時刻はサーバー時刻で比べるので公平。
(() => {
const { h, button, segmented, stepper, pick } = window.Party.ui;

const MAX_PLAYERS = 8;
const AWAKE_MS = 10000;
const AWAKE_MULT = 10;
const GRACE_MS = 400; // 最初の正解のあと、ほぼ同時に押した人を待つ時間

// ---------- 出題データ ----------
const REAL_N = 'おちんぽ';
const REAL_S = '超おちんぽ';
const FAKE_N = ['おちんぼ', 'おちんほ', 'おちんば', 'おちんぴ', 'おちんぷ', 'おぢんぽ', 'ぉちんぽ', 'おちソぽ', 'おちンぽ', 'おちんポ', 'オちんぽ', 'おチんぽ',
  'あちんぽ', 'おらんぽ', 'おさんぽ', 'おちんこ', 'ちんぽお', 'おんちぽ', 'おちぽん', 'おおちんぽ', 'おちんぽぽ', 'おちんち', 'おちんぽう', 'めちんぽ', 'おろんぽ'];
const FAKE_S = ['赳おちんぽ', '起おちんぽ', '趙おちんぽ', '越おちんぽ', '招おちんぽ', '走召おちんぽ', '超おちんぼ', '超おさんぽ', '超ぉちんぽ', '超おちソぽ',
  '超おちンぽ', '超ちんぽ', '超おちんぽお', '超おちんほ', '超おぢんぽ', '超々おちんぽ', '趨おちんぽ'];
const STYLES = ['plain', 'plain', 'plain', 'mirror', 'flip', 'tiny', 'huge', 'spin', 'blink', 'tate', 'spread', 'shake', 'rainbow', 'tilt', 'ghost'];
const BOT_NAMES = ['CPUたろう', 'CPUはなこ', 'CPUごんざえもん'];
const KLABEL = { normal: '本物', super: '本物（超）', fake: 'ニセモノ' };

const rand = (a, b) => a + Math.random() * (b - a);
const newId = () => Math.random().toString(36).slice(2, 8);

// 端末ごとの見た目だけの状態
const view = { round: -1, pressedQ: null, seenQ: null, seenPress: {}, seenResult: null, seenAwake: {}, rerender: null };

// 配信用の伏せ字（ん→〇）
const cz = (g, t) => (g && g.censor ? String(t).replace(/ん/g, '〇').replace(/ン/g, '○') : String(t));

// ---------- 判定 ----------
const kindAt = (q, elapsed) => (q.morph && elapsed >= q.morph.at ? q.morph.kind : q.kind);
const isCorrect = (q, p) => {
  const k = kindAt(q, p.ts - q.shownAt);
  return (k === 'normal' && p.btn === 'n') || (k === 'super' && p.btn === 's');
};
function isAwake(g, id, ts) {
  const a = (g.awake || {})[id];
  return !!(a && a.at && ts >= a.at && ts < a.at + AWAKE_MS);
}
function describe(q) {
  if (q.grid) return q.kind === 'fake' ? '本物は無かった' : `「${q.kind === 'super' ? REAL_S : REAL_N}」が混ざっていた`;
  if (q.morph) return `「${q.text}」（${KLABEL[q.kind]}）→「${q.morph.text}」（${KLABEL[q.morph.kind]}）`;
  return `「${q.text}」は${KLABEL[q.kind]}`;
}

// 問題を作る（表示位置や文字の見た目もここで決めて、全員の画面をそろえる）
function genQuestion() {
  const r = Math.random();
  const style = pick(STYLES);
  const wide = ['tiny', 'tate'].includes(style) ? 22 : 8;
  const pos = { x: Math.round(rand(50 - wide, 50 + wide)), y: Math.round(rand(30, 70)) };
  if (r < 0.12) { // グリッド：たくさんの中から探す
    const n = 7 + Math.floor(Math.random() * 5);
    const words = [];
    for (let i = 0; i < n; i++) words.push(Math.random() < 0.6 ? pick(FAKE_N) : pick(FAKE_S));
    let kind = 'fake';
    const rr = Math.random();
    if (rr < 0.4) { words[Math.floor(Math.random() * n)] = REAL_N; kind = 'normal'; }
    else if (rr < 0.6) { words[Math.floor(Math.random() * n)] = REAL_S; kind = 'super'; }
    const styles = words.map(() => pick(['plain', 'plain', 'mirror', 'flip', 'tilt']));
    return { kind, grid: words, gridStyles: styles, text: '', style: 'plain', pos, dur: kind === 'fake' ? 2600 : 4200 };
  }
  if (r < 0.32) { // 途中で変わる
    const m = Math.random();
    const at = Math.round(rand(500, 1500));
    let q;
    if (m < 0.3) q = { kind: 'fake', text: pick(FAKE_N), morph: { at, kind: 'normal', text: REAL_N } };
    else if (m < 0.5) q = { kind: 'normal', text: REAL_N, morph: { at, kind: 'fake', text: pick(FAKE_N) } };
    else if (m < 0.7) q = { kind: 'fake', text: pick(FAKE_S), morph: { at, kind: 'super', text: REAL_S } };
    else if (m < 0.85) q = { kind: 'super', text: REAL_S, morph: { at, kind: 'fake', text: pick(FAKE_S) } };
    else q = { kind: 'normal', text: REAL_N, morph: { at, kind: 'super', text: REAL_S } };
    q.style = style; q.pos = pos;
    q.dur = at + (q.morph.kind === 'fake' ? 1600 : 3000);
    return q;
  }
  if (r < 0.52) return { kind: 'normal', text: REAL_N, style, pos, dur: 3200 };
  if (r < 0.64) return { kind: 'super', text: REAL_S, style, pos, dur: 3200 };
  return { kind: 'fake', text: Math.random() < 0.6 ? pick(FAKE_N) : pick(FAKE_S), style, pos, dur: Math.round(rand(1500, 2500)) };
}

// CPU（練習用）がこの問題でどう押すかを決める
function planBots(g, q) {
  const plan = [];
  for (const id of Object.keys(g.bots || {})) {
    const at = rand(600, 1600);
    const k = kindAt(q, at);
    let btn = null;
    if (k === 'fake') { if (Math.random() < 0.12) btn = Math.random() < 0.6 ? 'n' : 's'; }
    else if (Math.random() < 0.65) { const right = k === 'normal' ? 'n' : 's'; btn = Math.random() < 0.88 ? right : (right === 'n' ? 's' : 'n'); }
    if (btn) plan.push({ id, btn, at: Math.round(at) });
  }
  return plan;
}

// ---------- ルール ----------
const humans = (ctx) => ctx.players.map((p) => p.id);
function validate(ctx) {
  const n = ctx.players.length;
  const bots = ctx.settings.bots || 0;
  if (n + bots < 2) return 'CPUを足すか、2人以上で遊べます';
  if (n + bots > MAX_PLAYERS) return `CPUを含めて${MAX_PLAYERS}人までです`;
  return null;
}

function newGame(ctx, prevRound) {
  const s = { target: 10, awakeCount: 1, censor: false, bots: 0, ...ctx.settings };
  const bots = {};
  for (let i = 0; i < (s.bots || 0); i++) bots['bot' + (i + 1)] = BOT_NAMES[i];
  const players = [...humans(ctx), ...Object.keys(bots)];
  return {
    game: {
      phase: 'play',
      round: (prevRound || 0) + 1,
      players,
      bots,
      target: s.target,
      censor: !!s.censor,
      scores: Object.fromEntries(players.map((id) => [id, 0])),
      awake: Object.fromEntries(players.map((id) => [id, { left: s.awakeCount, at: 0 }])),
      stage: 'gap',
      nextAt: ctx.now() + 2200,
      q: null, presses: null, graceAt: null, result: null, winner: null, qn: 0,
    },
    private: null,
  };
}

// 1問の集計
function finish(ctx, g) {
  const q = g.q;
  const list = Object.entries(g.presses || {}).map(([uid, p]) => ({ uid, ...p })).filter((p) => typeof p.ts === 'number').sort((a, b) => a.ts - b.ts);
  let winner = null;
  const deltas = {};
  const notes = {};
  for (const p of list) {
    if (isCorrect(q, p)) {
      if (!winner) {
        winner = p.uid;
        const aw = isAwake(g, p.uid, p.ts);
        deltas[p.uid] = (p.btn === 's' ? 3 : 1) * (aw ? AWAKE_MULT : 1);
        notes[p.uid] = aw ? 'awake' : 'win';
      } else { deltas[p.uid] = 0; notes[p.uid] = 'late'; }
    } else { deltas[p.uid] = p.btn === 's' ? -3 : -1; notes[p.uid] = 'miss'; }
  }
  const scores = { ...g.scores };
  for (const id in deltas) scores[id] = (scores[id] || 0) + deltas[id];
  const now = ctx.now();
  const next = {
    ...g, scores, graceAt: null,
    q: { ...q, done: true },
    result: { qid: q.id, winner, deltas, notes, truth: describe(q) },
  };
  const top = Object.entries(scores).filter(([, s]) => s >= g.target).sort((a, b) => b[1] - a[1])[0];
  if (top) { next.stage = 'ending'; next.winner = top[0]; next.nextAt = now + 2000; }
  else { next.stage = 'result'; next.nextAt = now + 1900; }
  return next;
}

window.Party.register({
  id: 'ochinpo',
  name: 'おちんぽげーむ',
  title: (ctx) => cz(ctx.game || { censor: (ctx.settings || {}).censor }, 'おちんぽげーむ'),
  icon: '🍆',
  description: 'ニセモノにだまされず早押し。覚醒で得点10倍',

  defaultSettings: () => ({ target: 10, awakeCount: 1, censor: false, bots: 0 }),
  validate,

  renderSettings(ctx, { editable, set }) {
    const s = { target: 10, awakeCount: 1, censor: false, bots: 0, ...ctx.settings };
    const czs = (t) => cz({ censor: s.censor }, t);
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, '勝利ポイント'),
        segmented([10, 20, 30, 50].map((v) => ({ value: v, label: String(v) })), s.target, (target) => set({ target }), editable)),
      h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, '覚醒できる回数（1人あたり）'),
        segmented([1, 2, 3].map((v) => ({ value: v, label: `${v}回` })), s.awakeCount, (awakeCount) => set({ awakeCount }), editable)),
      h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, '配信用 伏せ字モード（ん→〇）'),
        segmented([{ value: false, label: 'OFF' }, { value: true, label: 'ON' }], !!s.censor, (censor) => set({ censor }), editable)),
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, 'CPU（練習用）'),
        stepper(s.bots, 0, 3, (bots) => set({ bots }), editable)),
      h('div', { class: 'och-rules' },
        `・ひらがなの「${czs('おちんぽ')}」→ ${czs('おちんぽ')}ボタン（正解+1／まちがい−1）`, h('br'),
        `・「${czs('超おちんぽ')}」→ 超${czs('おちんぽ')}ボタン（正解+3／まちがい−3）`, h('br'),
        `・ニセモノ（${czs('おちんぼ')}、${czs('赳おちんぽ')}…）で押したら減点。途中で文字が変わる問題もあり`, h('br'),
        '・覚醒：10秒間、正解の得点が10倍。減点はそのまま', h('br'),
        '・1問につき押せるのは1回。一番早く正解した人だけが得点'));
  },

  start: (ctx) => newGame(ctx, 0),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const ts = typeof a.ts === 'number' ? a.ts : ctx.now();

    if (a.type === 'again') {
      if (g.phase !== 'over' || from !== ctx.hostId || validate(ctx)) return null;
      return newGame(ctx, g.round);
    }
    if (g.phase !== 'play' || !g.players.includes(from)) return null;

    switch (a.type) {
      case 'press': {
        const q = g.q;
        if (g.stage !== 'q' || !q || q.done || a.qid !== q.id || (g.presses || {})[from]) return null;
        if (a.btn !== 'n' && a.btn !== 's') return null;
        const p = { btn: a.btn, ts };
        const next = { ...g, presses: { ...(g.presses || {}), [from]: p } };
        if (!g.graceAt && isCorrect(q, p)) next.graceAt = ctx.now() + GRACE_MS;
        return { game: next };
      }
      case 'awake': {
        const aw = (g.awake || {})[from];
        if (!aw || aw.left <= 0 || isAwake(g, from, ts)) return null;
        return { game: { ...g, awake: { ...g.awake, [from]: { left: aw.left - 1, at: ts } } } };
      }
      default:
        return null;
    }
  },

  // ホストの端末で0.25秒ごとに呼ばれる：出題・CPU・締め切り
  tick(ctx) {
    let g = ctx.game;
    if (!g || g.phase !== 'play') return null;
    const now = ctx.now();

    if (g.stage === 'gap' && now >= g.nextAt) {
      const q = genQuestion();
      q.id = 'q' + (g.qn + 1) + '_' + newId();
      q.shownAt = now;
      let awake = g.awake;
      for (const id of Object.keys(g.bots || {})) {
        const aw = awake[id];
        if (aw && aw.left > 0 && !isAwake(g, id, now) && Math.random() < 0.05) awake = { ...awake, [id]: { left: aw.left - 1, at: now } };
      }
      return {
        game: { ...g, awake, stage: 'q', q, qn: g.qn + 1, presses: null, graceAt: null, result: null },
        private: { botPlan: { qid: q.id, list: planBots(g, q) } },
      };
    }

    if (g.stage === 'q' && g.q) {
      let changed = false;
      const plan = ctx.private && ctx.private.botPlan;
      if (plan && plan.qid === g.q.id) {
        for (const b of plan.list || []) {
          if (now < g.q.shownAt + b.at || (g.presses || {})[b.id]) continue;
          const p = { btn: b.btn, ts: g.q.shownAt + b.at };
          g = { ...g, presses: { ...(g.presses || {}), [b.id]: p } };
          if (!g.graceAt && isCorrect(g.q, p)) g = { ...g, graceAt: now + GRACE_MS };
          changed = true;
        }
      }
      if (now >= g.q.shownAt + g.q.dur || (g.graceAt && now >= g.graceAt)) return { game: finish(ctx, g) };
      return changed ? { game: g } : null;
    }

    if (g.stage === 'result' && now >= g.nextAt) {
      return { game: { ...g, stage: 'gap', q: null, presses: null, nextAt: now + Math.round(rand(1200, 3200)) } };
    }
    if (g.stage === 'ending' && now >= g.nextAt) {
      return { game: { ...g, phase: 'over' } };
    }
    return null;
  },

  render(ctx) {
    const g = ctx.game;
    view.rerender = ctx.rerender;
    if (g.round !== view.round) {
      view.round = g.round;
      Object.assign(view, { pressedQ: null, seenQ: null, seenPress: {}, seenResult: null, seenAwake: {} });
    }
    sounds(ctx, g);
    return g.phase === 'over' ? overView(ctx, g) : playView(ctx, g);
  },
});

// ---------- 効果音と振動 ----------
let ac = null;
function sfx(type) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.connect(gn); gn.connect(ac.destination);
    const t = ac.currentTime;
    const P = { q: ['square', 520, 520, 0.05, 0.06], press: ['square', 900, 900, 0.06, 0.05], ok: ['triangle', 700, 1400, 0.25, 0.12],
      ng: ['sawtooth', 180, 90, 0.35, 0.1], awake: ['sawtooth', 200, 1200, 0.7, 0.08] }[type];
    if (!P) return;
    o.type = P[0]; o.frequency.setValueAtTime(P[1], t); o.frequency.exponentialRampToValueAtTime(P[2], t + P[3]);
    gn.gain.setValueAtTime(P[4], t); gn.gain.exponentialRampToValueAtTime(0.001, t + P[3]);
    o.start(t); o.stop(t + P[3] + 0.02);
  } catch { /* 音が出せない端末 */ }
}
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* なし */ } };

function sounds(ctx, g) {
  if (g.q && g.q.id !== view.seenQ) { view.seenQ = g.q.id; view.seenPress = {}; sfx('q'); }
  for (const uid of Object.keys(g.presses || {})) {
    if (!view.seenPress[uid]) { view.seenPress[uid] = true; if (uid !== ctx.me) sfx('press'); }
  }
  for (const [id, a] of Object.entries(g.awake || {})) {
    if (a.at && view.seenAwake[id] !== undefined && view.seenAwake[id] !== a.at && id !== ctx.me) sfx('awake');
    view.seenAwake[id] = a.at;
  }
  const r = g.result;
  if (r && r.qid !== view.seenResult) {
    view.seenResult = r.qid;
    const mine = (r.notes || {})[ctx.me];
    if (mine === 'win' || mine === 'awake') { sfx('ok'); buzz(60); } else if (mine === 'miss') { sfx('ng'); buzz([80, 40, 80]); }
  }
}

// ---------- 画面 ----------
function nameOf(ctx, g, id) {
  if ((g.bots || {})[id]) return g.bots[id];
  return (ctx.players.find((p) => p.id === id) || {}).name || '？？？';
}

function playView(ctx, g) {
  const now = ctx.now();
  const ids = g.players.slice().sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));
  const q = g.q;
  const elapsed = q ? now - q.shownAt : 0;
  const amPlayer = g.players.includes(ctx.me);

  const board = h('div', { class: 'och-board' }, ids.map((id, i) => {
    const aw = isAwake(g, id, now);
    return h('div', { class: 'och-sc' + (id === ctx.me ? ' me' : '') + (aw ? ' awk' : '') },
      h('span', { class: 'och-nm' }, i === 0 && (g.scores[id] || 0) > 0 ? '👑' : '', aw ? '🔥' : '', nameOf(ctx, g, id)),
      h('span', { class: 'och-pt' }, g.scores[id] || 0));
  }));

  // 出題エリア
  let qview;
  if (q && g.stage !== 'gap') {
    if (q.grid) {
      qview = h('div', { class: 'och-grid', id: 'och-q-' + q.id }, q.grid.map((w, i) => h('span', { class: 'och-w och-st-' + ((q.gridStyles || [])[i] || 'plain') }, cz(g, w))));
    } else {
      const morphed = q.morph && elapsed >= q.morph.at;
      const text = morphed ? q.morph.text : q.text;
      qview = h('div', { class: 'och-pos och-flash', id: 'och-q-' + q.id + (morphed ? 'm' : ''), style: `left:${q.pos.x}%;top:${q.pos.y}%` },
        h('span', { class: 'och-w och-st-' + q.style }, cz(g, text)));
    }
  } else {
    qview = h('div', { class: 'och-wait' }, '…');
  }

  // 押した人と覚醒の実況
  const feed = [];
  if (q && g.stage === 'q') {
    Object.entries(g.presses || {}).sort((a, b) => a[1].ts - b[1].ts).forEach(([uid, p]) => {
      feed.push(h('div', { class: 'och-fd' + (p.btn === 's' ? ' s' : '') }, `${nameOf(ctx, g, uid)}が${p.btn === 's' ? '超' : ''}押した！`));
    });
  }
  Object.entries(g.awake || {}).forEach(([id, a]) => {
    if (a.at && now - a.at < 3000) feed.push(h('div', { class: 'och-fd a' }, `🔥 ${nameOf(ctx, g, id)}が覚醒した！`));
  });

  // 結果
  let result = null;
  const r = g.result;
  if (r && (g.stage === 'result' || g.stage === 'ending') && q && r.qid === q.id) {
    const lines = [h('div', { class: 'och-truth' }, cz(g, r.truth))];
    if (r.winner) {
      const d = r.deltas[r.winner];
      const aw = r.notes[r.winner] === 'awake';
      lines.push(h('div', { class: 'och-ln ok' + (aw ? ' big' : '') }, `⭕ ${nameOf(ctx, g, r.winner)} +${d}${aw ? '（覚醒×10！）' : ''}`));
    }
    for (const uid in r.notes) {
      if (r.notes[uid] === 'miss') lines.push(h('div', { class: 'och-ln ng' }, `❌ ${nameOf(ctx, g, uid)} ${r.deltas[uid]}`));
      if (r.notes[uid] === 'late') lines.push(h('div', { class: 'och-ln late' }, `△ ${nameOf(ctx, g, uid)} おしい（遅かった）`));
    }
    if (!Object.keys(r.notes || {}).length) lines.push(h('div', { class: 'och-ln late' }, 'だれも押さなかった'));
    if (g.stage === 'ending') lines.push(h('div', { class: 'och-ln big' }, `🏆 ${nameOf(ctx, g, g.winner)} の勝ち！`));
    result = h('div', { class: 'och-result' }, lines);
  }

  // ボタン
  const canPress = amPlayer && g.stage === 'q' && q && !q.done && !(g.presses || {})[ctx.me] && view.pressedQ !== q.id;
  const press = (btn) => (e) => {
    e.preventDefault();
    if (!canPress) return;
    view.pressedQ = q.id;
    sfx('press'); buzz(25);
    ctx.send('press', { btn, qid: q.id });
    ctx.rerender();
  };
  const myAw = (g.awake || {})[ctx.me];
  const awakeNow = isAwake(g, ctx.me, now);
  const awBtn = awakeNow
    ? h('button', { type: 'button', class: 'och-btn och-a on' }, `🔥 覚醒中！ 正解×10　残り ${((myAw.at + AWAKE_MS - now) / 1000).toFixed(1)}秒`)
    : h('button', {
      type: 'button', class: 'och-btn och-a',
      disabled: !(amPlayer && myAw && myAw.left > 0),
      onclick: () => { sfx('awake'); buzz(150); ctx.send('awake'); },
    }, `覚醒（10秒間 正解×10）残り${myAw ? myAw.left : 0}回`);

  return h('div', { class: 'och' + (awakeNow ? ' awake' : ''), id: 'och-root' },
    board,
    h('div', { class: 'och-target' }, cz(g, `${g.target}おちんぽ先取で優勝`)),
    h('div', { class: 'och-stage' }, h('div', { class: 'och-feed' }, feed), qview, result),
    amPlayer
      ? h('div', { class: 'och-ctrl' },
        awBtn,
        h('div', { class: 'och-row' },
          h('button', { type: 'button', class: 'och-btn och-n', disabled: !canPress, onpointerdown: press('n') }, cz(g, 'おちんぽ')),
          h('button', { type: 'button', class: 'och-btn och-s', disabled: !canPress, onpointerdown: press('s') }, '超', h('br'), cz(g, 'おちんぽ'))))
      : h('p', { class: 'muted center' }, '観戦中'));
}

function overView(ctx, g) {
  const ids = g.players.slice().sort((a, b) => (g.scores[b] || 0) - (g.scores[a] || 0));
  return h('div', { class: 'stack och' },
    h('div', { class: 'och-king' }, '👑'),
    h('div', { class: 'och-kingname' }, nameOf(ctx, g, g.winner)),
    h('div', { class: 'och-kingtitle' }, cz(g, 'おちんぽ王')),
    h('div', { class: 'card' }, ids.map((id, i) => h('div', { class: 'och-rank' },
      h('span', null, `${i + 1}位　${nameOf(ctx, g, id)}`), h('b', null, cz(g, `${g.scores[id] || 0} おちんぽ`))))),
    ctx.isHost
      ? h('div', { class: 'actions' },
        button('もう一回', () => ctx.send('again'), 'primary', { disabled: !!validate(ctx) }),
        h('p', { class: 'center muted small', style: 'margin:0' }, '設定を変えるときは右上の「ロビーへ」から'))
      : h('p', { class: 'center muted' }, 'ホストの操作を待っています…'));
}

// 文字の切り替わりや覚醒の残り時間を、なめらかに更新する
setInterval(() => {
  if (view.rerender && document.getElementById('och-root')) view.rerender();
}, 150);
})();
