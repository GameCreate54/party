// ===== じゃんけんサバイバル =====
// 生き残っている全員で一斉にじゃんけん（制限時間あり）。手が2種類なら負けた手の人が脱落。
// あいこ（1種類か3種類）ならやり直し。出さなかった人も脱落。最後の1人が優勝。
(() => {
const { h, button, segmented } = window.Party.ui;
const { nameOf, playerCountError, beep, buzz } = window.Party.kit;

const HANDS = { g: '✊', c: '✌️', p: '✋' };
const BEATS = { g: 'c', c: 'p', p: 'g' };
const SHOW_MS = 3500;
const view = { seen: null, chosen: null, n: null, now: null };

function newBout(ctx, g) {
  const now = ctx.now();
  return { game: { ...g, phase: 'pick', n: (g.n || 0) + 1, startAt: now + 1500, endAt: now + 1500 + g.secs * 1000, done: null, hands: null, result: null }, private: { hands: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  return newBout(ctx, { players, alive: players, outs: null, secs: Number(ctx.settings.secs) || 5, n: 0, wins: (ctx.game && ctx.game.wins) || null });
}
function judge(ctx, g, handsIn) {
  const hands = { ...(handsIn || {}) };
  const alive = g.alive || [];
  const shown = alive.filter((id) => hands[id]);
  const kinds = [...new Set(shown.map((id) => hands[id]))];
  let losers = alive.filter((id) => !hands[id]);
  let result = 'aiko';
  if (kinds.length === 2) {
    const win = BEATS[kinds[0]] === kinds[1] ? kinds[0] : kinds[1];
    losers = losers.concat(shown.filter((id) => hands[id] !== win));
    result = win;
  }
  if (losers.length >= alive.length) { losers = []; result = 'aiko'; } // 全滅はなし
  const outs = [...(g.outs || []), ...(losers.length ? [losers] : [])];
  const nalive = alive.filter((id) => !losers.includes(id));
  return { game: { ...g, phase: 'show', hands, result, losers, alive: nalive, outs, nextAt: ctx.now() + SHOW_MS }, private: null };
}

window.Party.register({
  id: 'janken',
  name: 'じゃんけんサバイバル',
  icon: '✊',
  description: '全員で一斉にじゃんけん。負けたら脱落、最後の1人が優勝！',
  defaultSettings: () => ({ secs: 5 }),
  validate: (ctx) => playerCountError(ctx, 2),
  renderSettings(ctx, { editable, set }) {
    const s = { secs: 5, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '出すまでの時間'),
        segmented([{ value: 3, label: '3秒' }, { value: 5, label: '5秒' }, { value: 8, label: '8秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '時間内に出さないと負け。手が3種類そろったらあいこ。最後の1人になるまで続きます。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    if (a.type === 'again') return a.from === ctx.hostId && g.phase === 'over' ? newGame(ctx) : null;
    if (a.type !== 'hand' || g.phase !== 'pick' || a.n !== g.n || !(g.alive || []).includes(a.from) || !HANDS[a.v]) return null;
    const hands = { ...((ctx.private || {}).hands || {}), [a.from]: a.v };
    const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
    if ((g.alive || []).every((id) => hands[id])) return judge(ctx, ng, hands);
    return { game: ng, private: { hands } };
  },
  tick(ctx) {
    const g = ctx.game;
    if (!g) return null;
    const now = ctx.now();
    if (g.phase === 'pick' && now >= g.endAt) return judge(ctx, g, (ctx.private || {}).hands);
    if (g.phase === 'show' && now >= g.nextAt) {
      if ((g.alive || []).length <= 1) {
        const w = (g.alive || [])[0];
        const wins = { ...(g.wins || {}) };
        if (w) wins[w] = (wins[w] || 0) + 1;
        return { game: { ...g, phase: 'over', winner: w || null, wins } };
      }
      return newBout(ctx, g);
    }
    return null;
  },
  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    if (view.n !== g.n) { view.n = g.n; view.chosen = null; }
    if (g.phase === 'show' && view.seen !== g.n) {
      view.seen = g.n;
      if ((g.losers || []).includes(ctx.me)) { beep(160, 0.5, 'sawtooth', 0.1, 70); buzz([150, 60, 150]); } else beep(800, 0.15, 'triangle', 0.08, 1200);
    }
    if (g.phase === 'over') return overView(ctx, g);
    const alive = g.alive || [];
    const me = ctx.me;
    const imAlive = alive.includes(me);
    const ready = ctx.now() >= g.startAt;
    if (g.phase === 'pick' && !ready) setTimeout(ctx.rerender, Math.max(50, g.startAt - ctx.now() + 20));
    let main;
    if (g.phase === 'pick') {
      main = h('div', { class: 'stack' },
        h('div', { class: 'card center jk-call' }, h('div', { class: 'jk-big' }, ready ? 'じゃん けん…！' : 'さいしょは ✊'), h('div', { class: 'jk-time', 'data-jk-end': g.endAt }, '')),
        imAlive ? h('div', { class: 'jk-hands' }, Object.entries(HANDS).map(([k, e]) => h('button', {
          type: 'button', class: 'jk-h' + (view.chosen === k ? ' on' : ''), disabled: !ready,
          onclick: () => { view.chosen = k; ctx.send('hand', { v: k, n: g.n }); beep(700, 0.06); ctx.rerender(); },
        }, e))) : h('p', { class: 'center muted' }, '脱落… 観戦中'),
        imAlive && view.chosen ? h('p', { class: 'center muted small', style: 'margin:0' }, '変更OK（全員そろうか時間切れで勝負）') : null);
    } else {
      const hands = g.hands || {};
      const label = g.result === 'aiko' ? 'あいこ！' : `${HANDS[g.result]} の勝ち！`;
      main = h('div', { class: 'stack' },
        h('div', { class: 'card center pop' }, h('div', { class: 'jk-big' }, label),
          (g.losers || []).length ? h('div', { class: 'jk-lose' }, '脱落：' + g.losers.map((id) => nameOf(ctx, id)).join('、')) : null),
        h('div', { class: 'jk-grid' }, [...alive, ...(g.losers || [])].map((id) => h('div', { class: 'jk-p' + ((g.losers || []).includes(id) ? ' lose' : '') },
          h('div', { class: 'jk-e' }, hands[id] ? HANDS[hands[id]] : '💤'), h('div', { class: 'jk-n' }, nameOf(ctx, id))))));
    }
    return h('div', { class: 'stack' },
      h('div', { class: 'round-pill' }, `${g.n}回戦・のこり ${alive.length}人`),
      main,
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'のこっている人'),
        h('div', { class: 'chips kit-done' }, g.players.map((id) => h('span', { class: 'chip' + (alive.includes(id) ? ' on' : '') }, (alive.includes(id) ? '' : '× ') + nameOf(ctx, id))))));
  },
});

function overView(ctx, g) {
  const order = [g.winner, ...[...(g.outs || [])].reverse().flat()].filter(Boolean);
  return h('div', { class: 'stack' },
    h('div', { class: 'card center kit-final pop' }, h('div', { class: 'kit-crown' }, '✊'), h('div', { class: 'muted small' }, 'じゃんけん王'),
      h('div', { class: 'kit-winner' }, g.winner ? nameOf(ctx, g.winner) : '―')),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '順位'), h('ol', { class: 'st-rank' }, order.map((id) => h('li', null, nameOf(ctx, id))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '優勝回数'),
      h('div', { class: 'kit-scores' }, g.players.map((id) => h('div', { class: 'kit-score' }, h('span', { class: 'kit-name' }, nameOf(ctx, id)), h('span', { class: 'kit-pt' }, ((g.wins || {})[id] || 0) + '回'))))),
    ctx.isHost ? button('もう一回', () => ctx.send('again'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストの操作を待っています…'));
}

setInterval(() => {
  document.querySelectorAll('[data-jk-end]').forEach((el) => {
    if (!view.now) return;
    const left = Math.max(0, Number(el.getAttribute('data-jk-end')) - view.now());
    const t = (left / 1000).toFixed(1);
    if (el.textContent !== t) el.textContent = t;
  });
}, 100);
})();
