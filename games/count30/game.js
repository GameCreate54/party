// ===== 30を言ったら負け =====
// 順番に、続きの数字を1〜3個言っていく。「30」を言わされた人の負け（失点+1）。
// 何回か繰り返して、失点が一番少ない人の勝ち。制限時間を過ぎると自動で1個だけ言う。
(() => {
const { h, button, stepper, segmented } = window.Party.ui;
const { nameOf, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

const SHOW_MS = 3000;
const view = { seen: null, lost: null, now: null };

function newBout(ctx, g, bout, first) {
  return { game: { ...g, phase: 'play', bout, n: 0, turn: first, said: null, loser: null, deadline: ctx.now() + g.secs * 1000 } };
}
function newGame(ctx) {
  const order = ctx.players.map((p) => p.id);
  const s = ctx.settings;
  const miss = Object.fromEntries(order.map((id) => [id, 0]));
  return newBout(ctx, { players: order, order, miss, bouts: Number(s.bouts) || 5, goal: Number(s.goal) || 30, secs: Number(s.secs) || 10 }, 1, order[Math.floor(Math.random() * order.length)]);
}
const nextOf = (g, id) => g.order[(g.order.indexOf(id) + 1) % g.order.length];

function say(ctx, g, who, k) {
  const nums = [];
  for (let i = 1; i <= k && g.n + i <= g.goal; i++) nums.push(g.n + i);
  const n = nums[nums.length - 1];
  const said = [...(g.said || []), { by: who, nums }].slice(-12);
  if (n >= g.goal) {
    const miss = { ...g.miss, [who]: (g.miss[who] || 0) + 1 };
    return { game: { ...g, n, said, miss, phase: 'lost', loser: who, nextAt: ctx.now() + SHOW_MS } };
  }
  return { game: { ...g, n, said, turn: nextOf(g, who), deadline: ctx.now() + g.secs * 1000 } };
}

window.Party.register({
  id: 'count30',
  name: '30を言ったら負け',
  icon: '🙊',
  description: '順番に数字を1〜3個ずつ言っていく。最後の数字を言わされた人の負け。必勝法、見つけられる？',
  defaultSettings: () => ({ bouts: 5, goal: 30, secs: 10 }),
  validate: (ctx) => playerCountError(ctx, 2),
  renderSettings(ctx, { editable, set }) {
    const s = { bouts: 5, goal: 30, secs: 10, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, '回数'), stepper(Number(s.bouts), 1, 10, (bouts) => set({ bouts }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '言ったら負けの数'),
        segmented([{ value: 21, label: '21' }, { value: 30, label: '30' }, { value: 50, label: '50' }], Number(s.goal), (goal) => set({ goal }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '持ち時間'),
        segmented([{ value: 5, label: '5秒' }, { value: 10, label: '10秒' }, { value: 20, label: '20秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '時間切れになると自動で1個だけ言います。負けた人から次の回がスタート。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    if (a.type === 'again') return a.from === ctx.hostId && g.phase === 'over' ? newGame(ctx) : null;
    if (a.type !== 'say' || g.phase !== 'play' || a.from !== g.turn || a.n !== g.n || ![1, 2, 3].includes(a.k)) return null;
    return say(ctx, g, a.from, a.k);
  },
  tick(ctx) {
    const g = ctx.game;
    if (!g) return null;
    const now = ctx.now();
    if (g.phase === 'play' && now >= g.deadline) return say(ctx, g, g.turn, 1);
    if (g.phase === 'lost' && now >= g.nextAt) {
      return g.bout >= g.bouts ? { game: { ...g, phase: 'over' } } : newBout(ctx, g, g.bout + 1, g.loser);
    }
    return null;
  },
  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    if (g.phase === 'over') return overView(ctx, g, { scores: g.miss, lowerBetter: true, crown: '🙊', topLabel: '一番負けなかった人', format: (v) => '失点' + v });
    const said = g.said || [];
    const key = g.bout + ':' + said.length;
    if (view.seen !== key) { view.seen = key; if (said.length) beep(600 + (g.n % 10) * 40, 0.06, 'triangle', 0.07); if (g.phase === 'play' && g.turn === ctx.me) buzz(40); }
    if (g.phase === 'lost' && view.lost !== g.bout) { view.lost = g.bout; beep(150, 0.5, 'sawtooth', 0.1, 70); }
    const mine = g.phase === 'play' && g.turn === ctx.me;
    const left = g.goal - g.n;
    return h('div', { class: 'stack' },
      h('div', { class: 'round-pill' }, `第${g.bout}回 / ${g.bouts}`),
      h('div', { class: 'card center c3-stage' + (g.phase === 'lost' ? ' lost' : '') },
        h('div', { class: 'muted small' }, `${g.goal} を言ったら負け`),
        h('div', { class: 'c3-n' }, g.n || '0'),
        g.phase === 'lost'
          ? h('div', { class: 'c3-lose pop' }, `${nameOf(ctx, g.loser)} が ${g.goal} を言った！`)
          : h('div', null, mine ? 'あなたの番！' : `${nameOf(ctx, g.turn)} の番`, ' ', h('span', { class: 'c3-time', 'data-c3-end': g.deadline }, ''))),
      mine ? h('div', { class: 'c3-btns' }, [1, 2, 3].map((k) => {
        const nums = Array.from({ length: Math.min(k, left) }, (_, i) => g.n + i + 1);
        return k <= left || k === 1 ? button(nums.join('、'), () => ctx.send('say', { k, n: g.n }), 'big' + (nums.includes(g.goal) ? ' ng' : ' primary')) : null;
      })) : null,
      h('div', { class: 'card c3-log' }, said.length ? [...said].reverse().map((s) => h('div', { class: 'c3-l' }, h('b', null, nameOf(ctx, s.by)), '：', s.nums.join('、'))) : h('span', { class: 'muted small' }, 'まだだれも言っていません')),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '失点（少ないほど良い）'),
        scoreList(ctx, g.players, g.miss, { lowerBetter: true, format: (v) => v + '敗' })));
  },
});

setInterval(() => {
  document.querySelectorAll('[data-c3-end]').forEach((el) => {
    if (!view.now) return;
    const t = '⏱' + Math.ceil(Math.max(0, Number(el.getAttribute('data-c3-end')) - view.now()) / 1000);
    if (el.textContent !== t) el.textContent = t;
  });
}, 200);
})();
