// ===== フラッシュ暗算 =====
// 数字がパッパッと次々に表示される。全部足した答えを入力。正解した人のうち早い順に高得点。
// 表示のタイミングはサーバー時刻で全員そろえている。
(() => {
const { h, button, stepper, segmented, inputBox, drafts, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const LEAD = 3000;
const ANSWER_MS = 20000;
const view = { round: null, now: null, sent: null, beeped: {} };

function newRound(ctx, g, round) {
  const nums = [];
  const lo = g.digits === 2 ? 10 : 1;
  const hi = g.digits === 2 ? 99 : 9;
  for (let i = 0; i < g.count; i++) {
    let n;
    do { n = lo + Math.floor(Math.random() * (hi - lo + 1)); } while (nums.length && n === nums[nums.length - 1]);
    nums.push(n);
  }
  const startAt = ctx.now() + LEAD;
  const endAt = startAt + g.count * g.gap;
  return { game: { ...g, phase: 'show', round, nums, startAt, endAt, done: null, res: null, gain: null }, private: { ans: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  const s = ctx.settings;
  const lv = { easy: [5, 1, 900], normal: [7, 1, 650], hard: [6, 2, 800], oni: [10, 2, 550] }[s.level || 'normal'];
  return newRound(ctx, { players, scores, rounds: Number(s.rounds) || 5, count: lv[0], digits: lv[1], gap: lv[2], level: s.level || 'normal' }, 1);
}
function reveal(g, ansIn) {
  const ans = { ...(ansIn || {}) };
  const sum = g.nums.reduce((x, y) => x + y, 0);
  const ok = g.players.filter((id) => ans[id] && ans[id].v === sum).sort((x, y) => ans[x].t - ans[y].t);
  const gain = Object.fromEntries(g.players.map((id) => [id, 0]));
  ok.forEach((id, i) => { gain[id] = i === 0 ? 3 : i === 1 ? 2 : 1; });
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  return { game: { ...g, phase: 'reveal', sum, res: ans, gain, scores }, private: null };
}

window.Party.register({
  id: 'anzan',
  name: 'フラッシュ暗算',
  icon: '🧮',
  description: '次々に表示される数字を全部足して答える。正解した人の中で早い順に高得点',
  defaultSettings: () => ({ rounds: 5, level: 'normal' }),
  validate: (ctx) => playerCountError(ctx, 1),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, level: 'normal', ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, '問題数'), stepper(Number(s.rounds), 1, 10, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, 'むずかしさ'),
        segmented([{ value: 'easy', label: 'かんたん' }, { value: 'normal', label: 'ふつう' }, { value: 'hard', label: '2けた' }, { value: 'oni', label: '鬼' }], s.level, (level) => set({ level }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, 'かんたん：1けた×5　ふつう：1けた×7（速め）　2けた：2けた×6　鬼：2けた×10（速い）。正解の早い順に3・2・1点。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'answer': {
        if (g.phase !== 'show' || a.round !== g.round || !g.players.includes(a.from)) return null;
        const ans0 = (ctx.private || {}).ans || {};
        if (ans0[a.from]) return null;
        const t = typeof a.ts === 'number' ? a.ts : ctx.now();
        if (t < g.endAt) return null;
        const ans = { ...ans0, [a.from]: { v: Number(a.v), t: t - g.endAt } };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => ans[id])) return reveal(ng, ans);
        return { game: ng, private: { ans } };
      }
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      case 'again': return isHost && g.phase === 'over' ? newGame(ctx) : null;
      default: return null;
    }
  },
  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'show' || ctx.now() < g.endAt + ANSWER_MS) return null;
    return reveal(g, (ctx.private || {}).ans);
  },
  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    view.g = g;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🧮', topLabel: '暗算王' });
    if (view.round !== g.round) { view.round = g.round; view.sent = null; view.beeped = {}; drafts['az-ans'] = ''; }
    const playing = g.players.includes(ctx.me);
    if (g.phase === 'show') {
      const submit = () => {
        const v = (drafts['az-ans'] || '').trim();
        if (!v) return;
        if (ctx.now() < g.endAt) { toast('全部出てから答えてね'); return; }
        view.sent = v;
        ctx.send('answer', { v: Number(v), round: g.round });
        ctx.rerender();
      };
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `第${g.round}問 / ${g.rounds}`),
        h('div', { class: 'card center az-screen' }, h('div', { class: 'az-num', 'data-az': '1' }, '')),
        playing ? (view.sent || (g.done || {})[ctx.me]
          ? h('p', { class: 'center muted' }, `「${view.sent || '送信済み'}」で回答しました`)
          : h('div', { class: 'az-row' },
            inputBox('az-ans', { placeholder: '合計は？', digits: true, maxlength: 5, onEnter: submit, keepFocus: true, enterkeyhint: 'send' }),
            button('答える', submit, 'primary'))) : null,
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '答えた人'), doneChips(ctx, g.players, g.done)));
    }
    const res = g.res || {};
    const rows = g.players.map((id) => ({ id, r: res[id] })).sort((x, y) => (g.gain[y.id] || 0) - (g.gain[x.id] || 0));
    return h('div', { class: 'stack' },
      h('div', { class: 'card center pop' }, h('div', { class: 'muted small' }, g.nums.join(' + ')), h('div', { class: 'az-sum' }, '= ' + g.sum)),
      h('div', { class: 'az-res' }, rows.map(({ id, r }) => h('div', { class: 'az-r' + (r && r.v === g.sum ? ' ok' : ' ng') },
        h('span', null, nameOf(ctx, id)), h('b', null, r ? r.v : '－'),
        h('span', { class: 'muted small' }, r && r.v === g.sum ? (r.t / 1000).toFixed(2) + '秒' : ''), h('span', { class: 'az-g' }, '+' + (g.gain[id] || 0))))),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
      ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次の問題へ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
  },
});

// 数字を順番に表示
setInterval(() => {
  const el = document.querySelector('[data-az]');
  const st = view.g;
  if (!el || !view.now || !st) return;
  const t = view.now();
  let text = '';
  let cls = 'az-num';
  if (t < st.startAt) { text = String(Math.ceil((st.startAt - t) / 1000)); cls += ' count'; }
  else if (t < st.endAt) {
    const i = Math.floor((t - st.startAt) / st.gap);
    const inGap = (t - st.startAt) % st.gap > st.gap * 0.78;
    text = inGap ? '' : String(st.nums[i]);
    if (!view.beeped[i]) { view.beeped[i] = true; beep(880, 0.05, 'square', 0.05); }
  } else { text = '？'; cls += ' done'; }
  if (el.textContent !== text) el.textContent = text;
  if (el.className !== cls) el.className = cls;
}, 30);
})();
