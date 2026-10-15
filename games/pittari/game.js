// ===== ぴったりストップ =====
// 全員いっせいにスタート。タイマーは最初の数秒しか見えない。
// 心の中で数えて、目標の秒数ぴったりだと思ったら STOP。一番近い人が高得点。
// 時刻は全員共通のサーバー時計で測るので、通信の速さで不公平にならない。
(() => {
const { h, button, stepper, segmented } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep, buzz } = window.Party.kit;

const COUNT_MS = 3000;    // スタート前のカウントダウン
const EXTRA_MS = 8000;    // 目標を過ぎてもこれだけ待つ（だれも押さなければ締め切り）

const view = { round: null, stopped: null, now: null, rerender: null, seenReveal: null, beeped: {} };

function targetMs(s) {
  if (s.target === 'random') return (5 + Math.floor(Math.random() * 11)) * 1000;
  return (Number(s.target) || 10) * 1000;
}

function newRound(ctx, g, round) {
  const startAt = ctx.now() + COUNT_MS;
  return { game: { ...g, phase: 'play', round, startAt, target: targetMs(ctx.settings), done: null, stops: null, gain: null }, private: { stops: {} } };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = {};
  players.forEach((id) => { scores[id] = 0; });
  const s = ctx.settings;
  return newRound(ctx, { players, scores, rounds: s.rounds || 5, show: Number(s.show ?? 3), history: [] }, 1);
}

// 近い順に 人数, 人数-1, ... 点（同じ差なら同点）。押さなかった人は0点
function reveal(g, stopsIn) {
  const stops = { ...(stopsIn || {}) };
  const diff = (id) => Math.abs(stops[id] - g.target);
  const ranked = g.players.filter((id) => stops[id] != null).sort((a, b) => diff(a) - diff(b));
  const gain = {};
  g.players.forEach((id) => { gain[id] = 0; });
  let pts = g.players.length;
  ranked.forEach((id, i) => {
    if (i > 0 && diff(id) !== diff(ranked[i - 1])) pts = g.players.length - i;
    gain[id] = pts;
  });
  // ぴったり（±0.05秒以内）はボーナス+3
  ranked.forEach((id) => { if (diff(id) <= 50) gain[id] += 3; });
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  const history = [...(g.history || []), { round: g.round, target: g.target, stops }];
  return { game: { ...g, phase: 'reveal', stops, gain, scores, history }, private: null };
}

const sec = (ms) => (ms / 1000).toFixed(2);

window.Party.register({
  id: 'pittari',
  name: 'ぴったりストップ',
  icon: '⏱️',
  description: '見えないタイマーを、目標の秒数ぴったりで止める。一番近い人の勝ち',

  defaultSettings: () => ({ rounds: 5, target: 10, show: 3 }),
  validate: (ctx) => playerCountError(ctx, 1),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, target: 10, show: 3, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(s.rounds, 1, 10, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '目標の秒数'),
        segmented([{ value: 5, label: '5秒' }, { value: 10, label: '10秒' }, { value: 15, label: '15秒' }, { value: 'random', label: '毎回ランダム' }],
          s.target, (target) => set({ target }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, 'タイマーが見える時間'),
        segmented([{ value: 0, label: '最初から見えない' }, { value: 3, label: '最初の3秒' }, { value: 5, label: '最初の5秒' }],
          Number(s.show), (show) => set({ show }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '近い順に高得点。±0.05秒以内の「ぴったり」はボーナス+3点。1人でも遊べます。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'stop': {
        if (g.phase !== 'play' || !g.players.includes(a.from) || a.round !== g.round) return null;
        const stops = (ctx.private || {}).stops || {};
        if (stops[a.from] != null) return null;
        const ms = Math.round(Number(a.ms));
        if (!Number.isFinite(ms) || ms < 0 || ms > g.target + EXTRA_MS) return null;
        const next = { ...stops, [a.from]: ms };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => next[id] != null)) return reveal(ng, next);
        return { game: ng, private: { stops: next } };
      }
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        if (g.round >= g.rounds) return { game: { ...g, phase: 'over' } };
        return newRound(ctx, g, g.round + 1);
      case 'again':
        if (!isHost || g.phase !== 'over' || playerCountError(ctx, 1)) return null;
        return newGame(ctx);
      default:
        return null;
    }
  },

  // 締め切り（押さなかった人がいても、目標＋8秒で発表）
  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'play') return null;
    if (ctx.now() < g.startAt + g.target + EXTRA_MS) return null;
    return reveal(g, (ctx.private || {}).stops);
  },

  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    view.rerender = ctx.rerender;
    if (g.phase === 'over') {
      return overView(ctx, g, {
        crown: '⏱️', topLabel: '体内時計チャンピオン',
        after: h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '記録'), historyTable(ctx, g)),
      });
    }
    if (view.round !== g.round) { view.round = g.round; view.stopped = null; view.beeped = {}; }
    if (g.phase === 'reveal' && view.seenReveal !== g.round) { view.seenReveal = g.round; beep(800, 0.25, 'triangle', 0.1, 1600); }
    return g.phase === 'play' ? playView(ctx, g) : revealView(ctx, g);
  },
});

function playView(ctx, g) {
  const playing = g.players.includes(ctx.me);
  const stopped = view.stopped != null || !!(g.done || {})[ctx.me];
  const stop = () => {
    if (view.stopped != null) return;
    const ms = ctx.now() - g.startAt;
    if (ms < 0) return;
    view.stopped = ms;
    beep(1200, 0.08); buzz(40);
    ctx.send('stop', { ms, round: g.round });
    ctx.rerender();
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
    h('div', { class: 'card center pt-stage' },
      h('div', { class: 'muted small' }, '目標'),
      h('div', { class: 'pt-target' }, sec(g.target).replace(/\.00$/, '') + ' 秒'),
      h('div', { class: 'pt-clock', 'data-pt-start': g.startAt, 'data-pt-show': g.show * 1000 }, ''),
      stopped
        ? h('div', { class: 'pt-mine' }, view.stopped != null ? `あなた：${sec(view.stopped)} 秒で STOP` : 'STOP済み')
        : null),
    playing && !stopped
      ? h('button', { type: 'button', id: 'pt-stop', class: 'pt-btn', onpointerdown: (e) => { e.preventDefault(); stop(); }, onclick: stop }, 'STOP')
      : h('p', { class: 'center muted small' }, playing ? 'ほかの人を待っています…' : '観戦中'),
    h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, 'STOPした人'), doneChips(ctx, g.players, g.done)));
}

function revealView(ctx, g) {
  const stops = g.stops || {};
  const rows = g.players.map((id) => ({ id, ms: stops[id], d: stops[id] != null ? stops[id] - g.target : null }))
    .sort((a, b) => (a.d == null) - (b.d == null) || Math.abs(a.d) - Math.abs(b.d));
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}・目標 ${sec(g.target)} 秒`),
    h('div', { class: 'pt-res' },
      rows.map((r, i) => h('div', { class: 'pt-row pop' + (r.id === ctx.me ? ' mine' : '') + (i === 0 && r.d != null ? ' best' : '') },
        h('span', { class: 'pt-name' }, nameOf(ctx, r.id)),
        h('span', { class: 'pt-time' }, r.ms != null ? sec(r.ms) : '－'),
        h('span', { class: 'pt-diff' + (r.d != null && Math.abs(r.d) <= 50 ? ' just' : '') },
          r.d == null ? '押してない' : Math.abs(r.d) <= 50 ? 'ぴったり！' : (r.d > 0 ? '+' : '−') + sec(Math.abs(r.d))),
        h('span', { class: 'pt-gain' }, '+' + ((g.gain || {})[r.id] || 0))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
    ctx.isHost
      ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
}

function historyTable(ctx, g) {
  const hist = g.history || [];
  return h('table', { class: 'kb-hist' },
    h('tr', null, h('th', null, ''), hist.map((r) => h('th', null, sec(r.target).replace(/\.00$/, '') + '秒'))),
    g.players.map((id) => h('tr', null, h('td', { class: 'kb-hn' }, nameOf(ctx, id)),
      hist.map((r) => h('td', null, (r.stops || {})[id] != null ? sec(r.stops[id]) : '－')))));
}

// タイマー表示（見える時間を過ぎたら「？？.？？」）
setInterval(() => {
  document.querySelectorAll('[data-pt-start]').forEach((el) => {
    if (!view.now) return;
    const start = Number(el.getAttribute('data-pt-start'));
    const show = Number(el.getAttribute('data-pt-show'));
    const t = view.now() - start;
    let text;
    if (t < 0) {
      const c = Math.ceil(-t / 1000);
      text = String(c);
      if (!view.beeped[c]) { view.beeped[c] = true; beep(600, 0.08); }
      el.className = 'pt-clock count';
    } else if (t < show) {
      text = sec(t);
      if (!view.beeped.go) { view.beeped.go = true; beep(1000, 0.15); }
      el.className = 'pt-clock';
    } else {
      text = '？？.？？';
      if (!view.beeped.go) { view.beeped.go = true; beep(1000, 0.15); }
      el.className = 'pt-clock hidden';
    }
    if (el.textContent !== text) el.textContent = text;
  });
}, 30);
})();
