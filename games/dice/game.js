// ===== 欲ばりダイス =====
// 自分の番はサイコロを何回でも振れる。出た目がたまっていくが、「1」が出たらその番の分は全部パー。
// 好きなところで「ストップ」すれば貯金できる。先に目標点に届いた人の勝ち。
(() => {
const { h, button, segmented } = window.Party.ui;
const { nameOf, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

const FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const view = { seenRoll: null };

function newGame(ctx) {
  const order = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(order.map((id) => [id, 0]));
  return { game: { phase: 'play', players: order, order, scores, goal: Number(ctx.settings.goal) || 50, turn: order[Math.floor(Math.random() * order.length)], pot: 0, rolls: null, last: null, seq: 0, bust: null, winner: null } };
}
const nextOf = (g) => g.order[(g.order.indexOf(g.turn) + 1) % g.order.length];

window.Party.register({
  id: 'dice',
  name: '欲ばりダイス',
  icon: '🎲',
  description: 'サイコロを振るほど点がたまる。でも「1」が出たら全部パー！どこで止めるかの度胸試し',
  defaultSettings: () => ({ goal: 50 }),
  validate: (ctx) => playerCountError(ctx, 2),
  renderSettings(ctx, { editable, set }) {
    const s = { goal: 50, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '目標点'),
        segmented([{ value: 30, label: '30点' }, { value: 50, label: '50点' }, { value: 100, label: '100点' }], Number(s.goal), (goal) => set({ goal }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '自分の番は何回振ってもOK。2〜6は加算、1が出たらその番の点は0で交代。「ストップ」で点を確定。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    if (a.type === 'again') return isHost && g.phase === 'over' ? newGame(ctx) : null;
    if (g.phase !== 'play') return null;
    if (a.type === 'skip') { // 番の人がいなくなったとき用
      if (!isHost) return null;
      return { game: { ...g, turn: nextOf(g), pot: 0, rolls: null, seq: g.seq + 1, bust: null } };
    }
    if (a.from !== g.turn || a.seq !== g.seq) return null;
    if (a.type === 'roll') {
      const d = 1 + Math.floor(Math.random() * 6);
      const rolls = [...(g.rolls || []), d];
      if (d === 1) return { game: { ...g, last: { by: a.from, d, n: g.seq }, rolls: null, pot: 0, bust: { by: a.from, lost: g.pot }, turn: nextOf(g), seq: g.seq + 1 } };
      return { game: { ...g, last: { by: a.from, d, n: g.seq }, rolls, pot: g.pot + d, bust: null, seq: g.seq + 1 } };
    }
    if (a.type === 'stop') {
      if (!g.pot) return null;
      const scores = { ...g.scores, [a.from]: (g.scores[a.from] || 0) + g.pot };
      if (scores[a.from] >= g.goal) return { game: { ...g, scores, phase: 'over', winner: a.from } };
      return { game: { ...g, scores, pot: 0, rolls: null, bust: null, last: null, turn: nextOf(g), seq: g.seq + 1 } };
    }
    return null;
  },
  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🎲', sub: `${g.goal}点に到達！` });
    const mine = g.turn === ctx.me;
    if (g.last && view.seenRoll !== g.seq) {
      view.seenRoll = g.seq;
      if (g.last.d === 1) { beep(150, 0.5, 'sawtooth', 0.1, 70); if (g.last.by === ctx.me) buzz([150, 60, 150]); } else beep(500 + g.last.d * 80, 0.08, 'triangle', 0.08);
    }
    const lastD = g.last ? g.last.d : null;
    return h('div', { class: 'stack' },
      h('div', { class: 'card center dc-stage' + (mine ? ' mine' : '') },
        h('div', { class: 'muted small' }, mine ? 'あなたの番！' : `${nameOf(ctx, g.turn)} の番`),
        h('div', { class: 'dc-die' + (lastD === 1 ? ' bust' : ''), key: g.seq }, lastD ? FACES[lastD] : '🎲'),
        g.bust ? h('div', { class: 'dc-bust pop' }, `${nameOf(ctx, g.bust.by)} が 1 を出した！ ${g.bust.lost}点 がパー`) : null,
        h('div', { class: 'dc-pot' }, 'この番の点：', h('b', null, g.pot)),
        h('div', { class: 'dc-rolls' }, (g.rolls || []).map((d) => FACES[d]).join(' '))),
      mine ? h('div', { class: 'dc-btns' },
        button('🎲 振る', () => ctx.send('roll', { seq: g.seq }), 'primary big'),
        button(`✋ ストップ（+${g.pot}）`, () => ctx.send('stop', { seq: g.seq }), 'big' + (g.pot ? '' : ' ghost'), { disabled: !g.pot })) : null,
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, `得点（目標 ${g.goal}点）`),
        scoreList(ctx, g.players, g.scores, { mark: { [g.turn]: 'dc-turn' }, extra: (id) => h('span', { class: 'dc-bar' }, h('span', { style: `width:${Math.min(100, ((g.scores[id] || 0) / g.goal) * 100)}%` })) })),
      ctx.isHost && !mine ? h('div', { class: 'host-tools' }, button(`${nameOf(ctx, g.turn)} の番を飛ばす`, () => ctx.send('skip'), 'ghost small')) : null);
  },
});
})();
