// ===== ハゲタカ =====
// 毎ラウンド得点カード（-5〜+10）が1枚めくられる。全員が手札1〜15から1枚をこっそり出す。
// 一番大きい数字を出した人が得点カードをもらう（マイナスのカードは一番小さい人が引き取る）。
// ただし同じ数字を出した人どうしは無効！ 手札は1回ずつしか使えない。
(() => {
const { h, button, shuffle } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const POINTS = [-5, -4, -3, -2, -1, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const HAND = Array.from({ length: 15 }, (_, i) => i + 1);
const view = { round: null, chosen: null, seen: null };

function nextCard(ctx, g) {
  const deck = [...(g.deck || [])];
  const card = deck.shift();
  return { game: { ...g, phase: 'bid', round: g.round + 1, card, deck, done: null, bids: null, taker: null }, private: { bids: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return nextCard(ctx, { players, scores, deck: shuffle(POINTS), round: 0, pot: 0, used: null, log: [] });
}
function reveal(g, bidsIn) {
  const bids = { ...(bidsIn || {}) };
  const count = {};
  Object.values(bids).forEach((n) => { count[n] = (count[n] || 0) + 1; });
  const uniq = g.players.filter((id) => bids[id] && count[bids[id]] === 1);
  const value = g.card + (g.pot || 0);
  let taker = null;
  if (uniq.length) {
    uniq.sort((x, y) => bids[y] - bids[x]);
    taker = g.card > 0 ? uniq[0] : uniq[uniq.length - 1];
  }
  const scores = { ...g.scores };
  if (taker) scores[taker] = (scores[taker] || 0) + value;
  const used = { ...(g.used || {}) };
  g.players.forEach((id) => { if (bids[id]) used[id] = [...(used[id] || []), bids[id]]; });
  const log = [...(g.log || []), { card: g.card, value, taker }];
  return { game: { ...g, phase: 'reveal', bids, taker, value, scores, used, log, pot: taker ? 0 : value }, private: null };
}

window.Party.register({
  id: 'hagetaka',
  name: 'ハゲタカ',
  icon: '🦅',
  description: '得点カードを手札1〜15で競り落とす。ただし他の人と同じ数字を出すと無効！',
  defaultSettings: () => ({}),
  validate: (ctx) => playerCountError(ctx, 2),
  renderSettings() {
    return h('div', { class: 'settings' }, h('p', { class: 'muted small', style: 'margin:0' },
      '全15ラウンド。プラスのカードは一番大きい数字、マイナスのカードは一番小さい数字を出した人が取る。同じ数字を出した人は無効。だれも取れなかったカードは次のラウンドに持ち越し。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'bid': {
        const n = Number(a.n);
        if (g.phase !== 'bid' || a.round !== g.round || !g.players.includes(a.from) || !HAND.includes(n)) return null;
        if (((g.used || {})[a.from] || []).includes(n)) return null;
        const bids = { ...((ctx.private || {}).bids || {}), [a.from]: n };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => bids[id])) return reveal(ng, bids);
        return { game: ng, private: { bids } };
      }
      case 'close': return isHost && g.phase === 'bid' ? reveal(g, (ctx.private || {}).bids) : null;
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        return (g.deck || []).length ? nextCard(ctx, g) : { game: { ...g, phase: 'over' } };
      case 'again': return isHost && g.phase === 'over' ? newGame(ctx) : null;
      default: return null;
    }
  },
  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🦅' });
    if (view.round !== g.round) { view.round = g.round; view.chosen = null; }
    if (g.phase === 'reveal' && view.seen !== g.round) { view.seen = g.round; beep(g.taker === ctx.me ? 1200 : 500, 0.25, 'triangle', 0.1); }
    const mine = (g.used || {})[ctx.me] || [];
    const playing = g.players.includes(ctx.me);
    const cardEl = h('div', { class: 'card center' },
      h('div', { class: 'muted small' }, `ラウンド ${g.round} / 15`),
      h('div', { class: 'hg-card' + (g.card < 0 ? ' neg' : '') }, (g.card > 0 ? '+' : '') + g.card),
      g.phase === 'bid' && g.pot ? h('div', { class: 'hg-pot' }, `持ち越し ${g.pot > 0 ? '+' : ''}${g.pot} もついてくる！`) : null,
      h('div', { class: 'muted small' }, g.card > 0 ? '一番大きい数字を出した人が取る' : '一番小さい数字を出した人が引き取る'));
    if (g.phase === 'bid') {
      return h('div', { class: 'stack' }, cardEl,
        playing ? h('div', { class: 'card stack' },
          h('div', { class: 'row-label center' }, view.chosen ? `${view.chosen} を出しました（そろうまで変更OK）` : '手札から1枚えらぶ'),
          h('div', { class: 'hg-hand' }, HAND.map((n) => h('button', {
            type: 'button', class: 'hg-n' + (view.chosen === n ? ' on' : ''), disabled: mine.includes(n),
            onclick: () => { view.chosen = n; ctx.send('bid', { n, round: g.round }); ctx.rerender(); },
          }, n)))) : h('p', { class: 'center muted' }, '観戦中'),
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '出した人'), doneChips(ctx, g.players, g.done)),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)),
        ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
    }
    const bids = g.bids || {};
    const count = {};
    Object.values(bids).forEach((n) => { count[n] = (count[n] || 0) + 1; });
    return h('div', { class: 'stack' }, cardEl,
      h('div', { class: 'card center pop' }, g.taker
        ? h('div', { class: 'hg-taker' }, `${nameOf(ctx, g.taker)} が ${g.value > 0 ? '+' : ''}${g.value} 点を獲得！`)
        : h('div', { class: 'hg-taker none' }, 'だれも取れず…次に持ち越し！')),
      h('div', { class: 'hg-bids' }, g.players.map((id) => h('div', { class: 'hg-bid' + (id === g.taker ? ' win' : '') + (bids[id] && count[bids[id]] > 1 ? ' dup' : '') },
        h('span', null, nameOf(ctx, id)), h('b', null, bids[id] || '－')))),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)),
      ctx.isHost ? button((g.deck || []).length ? '次のカードへ' : '最終結果へ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
  },
});
})();
