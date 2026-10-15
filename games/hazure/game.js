// ===== 仲間はずれ探し =====
// たくさん並んだ絵文字の中に、1つだけちがうものがまざっている。最初に見つけてタップした人が+1点。
// まちがえてタップしたら、そのラウンドはおやすみ。ラウンドが進むほどマスが増える。
(() => {
const { h, button, stepper, pick } = window.Party.ui;
const { nameOf, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

const PAIRS = [
  ['😀', '😃'], ['😄', '😁'], ['😊', '☺️'], ['🙂', '🙃'], ['😐', '😑'], ['😮', '😯'], ['😺', '😸'], ['🐶', '🐕'],
  ['🐻', '🐨'], ['🍎', '🍅'], ['🍊', '🍑'], ['🌕', '🌝'], ['⭐', '🌟'], ['❤️', '🧡'], ['💙', '💜'], ['🟦', '🔷'],
  ['🔴', '🟠'], ['⚽', '🏐'], ['🌲', '🌳'], ['🐟', '🐠'], ['🍙', '🍘'], ['🕐', '🕜'], ['🚗', '🚙'], ['🌷', '🌹'],
  ['👆', '☝️'], ['🐸', '🐢'], ['🍪', '🥠'], ['🔒', '🔓'], ['📕', '📙'], ['☀️', '🌞'],
];
const SHOW_MS = 2500;
const LIMIT_MS = 25000;
const view = { round: null, seen: null };

function newRound(ctx, g, round) {
  const size = Math.min(8, 4 + Math.floor((round - 1) / 2));
  const p = pick(PAIRS);
  const flip = Math.random() < 0.5;
  const now = ctx.now();
  return {
    game: { ...g, phase: 'find', round, size, at: Math.floor(Math.random() * size * size), base: flip ? p[1] : p[0], odd: flip ? p[0] : p[1], startAt: now + 1200, endAt: now + 1200 + LIMIT_MS, out: null, winner: null },
  };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 8 }, 1);
}
const finish = (ctx, g, winner) => ({ game: { ...g, phase: 'found', winner, nextAt: ctx.now() + SHOW_MS, scores: winner ? { ...g.scores, [winner]: (g.scores[winner] || 0) + 1 } : g.scores } });

window.Party.register({
  id: 'hazure',
  name: '仲間はずれ探し',
  icon: '🔍',
  description: 'ずらっと並んだ絵文字から、1つだけちがうものを最初に見つけた人の勝ち',
  defaultSettings: () => ({ rounds: 8 }),
  validate: (ctx) => playerCountError(ctx, 1),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 8, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 15, (rounds) => set({ rounds }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '最初に見つけた人に+1点。まちがえるとそのラウンドは押せなくなります。2ラウンドごとにマスが増えて難しくなる。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    if (a.type === 'again') return a.from === ctx.hostId && g.phase === 'over' ? newGame(ctx) : null;
    if (a.type !== 'tap' || g.phase !== 'find' || a.round !== g.round || !g.players.includes(a.from) || (g.out || {})[a.from]) return null;
    if (a.i === g.at) return finish(ctx, g, a.from);
    const out = { ...(g.out || {}), [a.from]: true };
    const ng = { ...g, out };
    if (g.players.every((id) => out[id])) return finish(ctx, ng, null);
    return { game: ng };
  },
  tick(ctx) {
    const g = ctx.game;
    if (!g) return null;
    const now = ctx.now();
    if (g.phase === 'find' && now >= g.endAt) return finish(ctx, g, null);
    if (g.phase === 'found' && now >= g.nextAt) return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
    return null;
  },
  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🔍', topLabel: '一番目がいい人' });
    if (g.phase === 'found' && view.seen !== g.round) { view.seen = g.round; if (g.winner === ctx.me) { beep(1200, 0.2, 'triangle', 0.1, 1800); buzz(60); } else beep(500, 0.2, 'triangle', 0.08); }
    const out = (g.out || {})[ctx.me];
    const ready = ctx.now() >= g.startAt;
    if (!ready && g.phase === 'find') setTimeout(ctx.rerender, Math.max(50, g.startAt - ctx.now() + 20));
    const n = g.size * g.size;
    const cells = Array.from({ length: n }, (_, i) => {
      const isOdd = g.phase === 'found' && i === g.at;
      return h('button', {
        type: 'button', class: 'hz-cell' + (isOdd ? ' odd' : ''), disabled: g.phase !== 'find' || out || !ready,
        onclick: () => { ctx.send('tap', { i, round: g.round }); },
      }, ready || g.phase === 'found' ? (i === g.at ? g.odd : g.base) : '');
    });
    return h('div', { class: 'stack' },
      h('div', { class: 'hz-top' }, h('span', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        h('span', { class: 'muted small' }, g.phase === 'found' ? (g.winner ? `${nameOf(ctx, g.winner)} が発見！` : 'だれも見つけられず…') : out ? 'おしい！このラウンドはおやすみ' : ready ? 'ちがうのはどれ？' : 'よーい…')),
      h('div', { class: 'hz-grid' + (out ? ' out' : ''), style: `grid-template-columns:repeat(${g.size},1fr);font-size:${Math.round(150 / g.size)}px` }, cells),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores, { mark: Object.fromEntries(Object.keys(g.out || {}).map((id) => [id, 'hz-out'])) })));
  },
});
})();
