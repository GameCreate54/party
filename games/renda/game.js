// ===== 連打バトル =====
// 合図と同時に、制限時間内でボタンをひたすら連打。回数が多い人が勝ち。
// みんなの回数はリアルタイムでバーになって見える。ラウンドごとにルールが変わる。
(() => {
const { h, button, stepper, segmented } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep, buzz } = window.Party.kit;

const COUNT_MS = 3000;
const MAX_RATE = 25; // 1秒あたりの上限（ありえない回数ははじく）
// ラウンドごとの変わったルール
const MODES = [
  { id: 'normal', name: 'ふつう', desc: 'とにかく連打！' },
  { id: 'two', name: '交互連打', desc: '左右のボタンを交互に押したときだけカウント' },
  { id: 'move', name: '逃げるボタン', desc: 'ボタンが押すたびに動く' },
  { id: 'stop', name: 'ピタッと止める', desc: '目標回数ちょうどで止めた人が勝ち（超えたら0）' },
];

const view = { round: null, n: 0, last: null, sent: false, now: null, rerender: null, liveT: null, setLive: null, send: null, g: null, pos: 50, beeped: {} };

function newRound(ctx, g, round) {
  const mode = g.modes[(round - 1) % g.modes.length];
  const startAt = ctx.now() + COUNT_MS;
  const target = mode === 'stop' ? 20 + Math.floor(Math.random() * 31) : null;
  return { game: { ...g, phase: 'play', round, mode, target, startAt, endAt: startAt + g.secs * 1000, done: null, res: null, gain: null }, private: { res: {} } };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = {};
  players.forEach((id) => { scores[id] = 0; });
  const s = ctx.settings;
  const modes = s.mix === 'normal' ? ['normal'] : ['normal', 'two', 'move', 'stop'];
  return newRound(ctx, { players, scores, rounds: Number(s.rounds) || 4, secs: Number(s.secs) || 10, modes, history: [] }, 1);
}

// 結果発表：多い順（ピタッとモードは目標に近い順）に 人数, 人数-1, ... 点
function reveal(g, resIn) {
  const res = { ...(resIn || {}) };
  const val = (id) => {
    const n = res[id];
    if (n == null) return -1;
    if (g.mode === 'stop') return n > g.target ? -1 : 1000 - (g.target - n);
    return n;
  };
  const ranked = g.players.filter((id) => val(id) >= 0).sort((a, b) => val(b) - val(a));
  const gain = {};
  g.players.forEach((id) => { gain[id] = 0; });
  let pts = g.players.length;
  ranked.forEach((id, i) => {
    if (i > 0 && val(id) !== val(ranked[i - 1])) pts = g.players.length - i;
    gain[id] = pts;
  });
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  const history = [...(g.history || []), { round: g.round, mode: g.mode, res }];
  return { game: { ...g, phase: 'reveal', res, gain, scores, history }, private: null };
}

window.Party.register({
  id: 'renda',
  name: '連打バトル',
  icon: '👆',
  description: '制限時間内にひたすら連打！みんなの回数がリアルタイムで見える。交互連打・逃げるボタンなど変則ルールも',

  defaultSettings: () => ({ rounds: 4, secs: 10, mix: 'mix' }),
  validate: (ctx) => playerCountError(ctx, 1),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 4, secs: 10, mix: 'mix', ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 8, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '1ラウンドの時間'),
        segmented([{ value: 5, label: '5秒' }, { value: 10, label: '10秒' }, { value: 15, label: '15秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, 'ルール'),
        segmented([{ value: 'mix', label: '毎ラウンド変わる' }, { value: 'normal', label: 'ふつうだけ' }], s.mix, (mix) => set({ mix }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '変則ルール：交互連打（左右交互）→ 逃げるボタン → ピタッと止める（目標回数ちょうど）の順に回ります。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'result': {
        if (g.phase !== 'play' || a.round !== g.round || !g.players.includes(a.from)) return null;
        const res = (ctx.private || {}).res || {};
        if (res[a.from] != null) return null;
        const n = Math.max(0, Math.min(Math.round(Number(a.n) || 0), g.secs * MAX_RATE));
        const next = { ...res, [a.from]: n };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => next[id] != null)) return reveal(ng, next);
        return { game: ng, private: { res: next } };
      }
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        if (g.round >= g.rounds) return { game: { ...g, phase: 'over' } };
        return newRound(ctx, g, g.round + 1);
      case 'again':
        if (!isHost || g.phase !== 'over') return null;
        return newGame(ctx);
      default:
        return null;
    }
  },

  // 送ってこない人がいても、終了3秒後に締め切る
  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'play' || ctx.now() < g.endAt + 3000) return null;
    return reveal(g, (ctx.private || {}).res);
  },

  render(ctx) {
    const g = ctx.game;
    Object.assign(view, { now: ctx.now, rerender: ctx.rerender, setLive: ctx.setLive, send: ctx.send, g, me: ctx.me });
    if (g.phase === 'over') return overView(ctx, g, { crown: '👆', topLabel: '連打王' });
    if (view.round !== g.round) { Object.assign(view, { round: g.round, n: 0, last: null, sent: false, pos: 50, beeped: {} }); }
    return g.phase === 'play' ? playView(ctx, g) : revealView(ctx, g);
  },
});

const modeOf = (id) => MODES.find((m) => m.id === id) || MODES[0];

function tap(side) {
  const g = view.g;
  if (!g || g.phase !== 'play' || view.sent) return;
  const t = view.now();
  if (t < g.startAt || t >= g.endAt) return;
  if (g.mode === 'two') {
    if (view.last === side) return;
    view.last = side;
  }
  view.n++;
  if (g.mode === 'move') view.pos = 10 + Math.floor(Math.random() * 80);
  const el = document.getElementById('rd-count');
  if (el) el.textContent = g.mode === 'stop' ? '？' : String(view.n);
  if (g.mode === 'move') { const b = document.getElementById('rd-btn'); if (b) b.style.left = view.pos + '%'; }
  if (!view.liveT) view.liveT = setTimeout(() => { view.liveT = null; view.setLive({ r: g.round, n: view.n }); }, 200);
}

function playView(ctx, g) {
  const playing = g.players.includes(ctx.me);
  const m = modeOf(g.mode);
  let pad;
  if (!playing) pad = h('p', { class: 'center muted' }, '観戦中');
  else if (g.mode === 'two') {
    pad = h('div', { class: 'rd-two' },
      h('button', { type: 'button', class: 'rd-btn', id: 'rd-l', onpointerdown: (e) => { e.preventDefault(); tap('l'); } }, '左'),
      h('button', { type: 'button', class: 'rd-btn', id: 'rd-r', onpointerdown: (e) => { e.preventDefault(); tap('r'); } }, '右'));
  } else if (g.mode === 'move') {
    pad = h('div', { class: 'rd-field' },
      h('button', { type: 'button', class: 'rd-btn small', id: 'rd-btn', style: `left:${view.pos}%`, onpointerdown: (e) => { e.preventDefault(); tap('x'); } }, '押'));
  } else {
    pad = h('button', { type: 'button', class: 'rd-btn', id: 'rd-btn', onpointerdown: (e) => { e.preventDefault(); tap('x'); } }, g.mode === 'stop' ? 'タップ' : '連打！');
  }
  const max = Math.max(10, ...g.players.map((id) => (((ctx.live || {})[id] || {}).r === g.round ? ctx.live[id].n : 0)));
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
    h('div', { class: 'card center rd-head' },
      h('div', { class: 'rd-mode' }, m.name),
      h('div', { class: 'muted small' }, g.mode === 'stop' ? `目標 ${g.target} 回ちょうどで止める（数は表示されない）` : m.desc),
      h('div', { class: 'rd-clock', 'data-rd': '1' }, ''),
      h('div', { class: 'rd-count', id: 'rd-count' }, g.mode === 'stop' ? '？' : String(view.n))),
    pad,
    g.mode === 'stop' ? null : h('div', { class: 'card rd-bars' }, g.players.map((id) => {
      const lv = (ctx.live || {})[id];
      const n = id === ctx.me ? view.n : lv && lv.r === g.round ? lv.n : 0;
      return h('div', { class: 'rd-bar' + (id === ctx.me ? ' me' : '') },
        h('span', { class: 'rd-bn' }, nameOf(ctx, id)),
        h('span', { class: 'rd-track' }, h('span', { class: 'rd-fill', style: `width:${Math.min(100, (n / max) * 100)}%` })),
        h('span', { class: 'rd-bv' }, n));
    })),
    h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '結果を送った人'), doneChips(ctx, g.players, g.done)));
}

function revealView(ctx, g) {
  const res = g.res || {};
  const rows = g.players.map((id) => ({ id, n: res[id] })).sort((a, b) => ((g.gain || {})[b.id] || 0) - ((g.gain || {})[a.id] || 0));
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round}「${modeOf(g.mode).name}」の結果` + (g.mode === 'stop' ? `（目標 ${g.target}）` : '')),
    h('div', { class: 'rd-res' }, rows.map((r, i) => h('div', { class: 'rd-row pop' + (i === 0 ? ' best' : '') + (r.id === ctx.me ? ' me' : '') },
      h('span', { class: 'rd-bn' }, nameOf(ctx, r.id)),
      h('span', { class: 'rd-n' }, r.n == null ? '－' : r.n + '回'),
      h('span', { class: 'rd-note' }, g.mode === 'stop' && r.n != null ? (r.n > g.target ? '超えた！' : r.n === g.target ? 'ぴったり！' : `あと${g.target - r.n}`) : ''),
      h('span', { class: 'rd-gain' }, '+' + ((g.gain || {})[r.id] || 0))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
    ctx.isHost
      ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
}

// 時計と、時間切れで結果を送る
setInterval(() => {
  const g = view.g;
  if (!g || g.phase !== 'play' || !view.now) return;
  const t = view.now();
  const el = document.querySelector('[data-rd]');
  let text;
  if (t < g.startAt) {
    const c = Math.ceil((g.startAt - t) / 1000);
    text = String(c);
    if (!view.beeped[c]) { view.beeped[c] = true; beep(600, 0.08); }
  } else if (t < g.endAt) {
    text = ((g.endAt - t) / 1000).toFixed(1);
    if (!view.beeped.go) { view.beeped.go = true; beep(1100, 0.15); buzz(60); }
  } else {
    text = 'おわり！';
    if (!view.sent && g.players.includes(view.me)) {
      view.sent = true;
      beep(400, 0.3, 'triangle', 0.1, 200);
      clearTimeout(view.liveT); view.liveT = null;
      view.setLive({ r: g.round, n: view.n });
      view.send('result', { n: view.n, round: g.round });
    }
  }
  if (el && el.textContent !== text) el.textContent = text;
}, 50);
})();
