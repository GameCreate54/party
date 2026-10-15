// ===== うんち爆弾 =====
// 💩を持っている人は、3回ふいてから だれかに押しつける。
// いつ爆発するかはだれにも分からない（ホストの端末だけが知っている）。爆発したとき持っていた人に「うんちまみれ」+1。
// 全ラウンドが終わって、うんちまみれが一番少ない人の勝ち。
(() => {
const { h, button, segmented, stepper, pick } = window.Party.ui;
const { nameOf, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

const WIPES = 3;            // 押しつける前にふく回数
const COUNT_MS = 3000;      // ラウンド開始前のカウントダウン
const BOOM_SHOW_MS = 5000;  // 爆発のあと次のラウンドまで
const FUSE = { short: [8, 18], normal: [15, 35], long: [25, 50] };

const view = { seq: null, wipes: 0, seenBoom: null, seenSeq: null, rerender: null };

function fuseMs(s) {
  const [a, b] = FUSE[s.fuse] || FUSE.normal;
  return Math.round((a + Math.random() * (b - a)) * 1000);
}

function newRound(ctx, g, round, holder) {
  const now = ctx.now();
  const goAt = now + COUNT_MS;
  const fuse = fuseMs(ctx.settings);
  return {
    game: { ...g, phase: 'play', stage: 'pass', round, holder, prev: null, seq: (g.seq || 0) + 1, passes: 0, heat: 0, goAt, fuse, loser: null, nextAt: null },
    private: { boomAt: goAt + fuse },
  };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const hits = {};
  players.forEach((id) => { hits[id] = 0; });
  const base = { players, hits, rounds: ctx.settings.rounds || 5, seq: 0, history: [] };
  return newRound(ctx, base, 1, pick(players));
}

// 押しつけ先（2人より多いときは、渡してきた人には返せない）
function targets(g, me) {
  const others = g.players.filter((id) => id !== me);
  if (others.length >= 2 && g.prev) return others.filter((id) => id !== g.prev);
  return others;
}

window.Party.register({
  id: 'unchi',
  name: 'うんち爆弾',
  icon: '💩',
  description: 'いつ爆発するか分からない💩を3回ふいて押しつけ合う。爆発したとき持ってた人がうんちまみれ',

  defaultSettings: () => ({ rounds: 5, fuse: 'normal' }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, fuse: 'normal', ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(s.rounds, 1, 10, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '爆発までの時間'),
        segmented([{ value: 'short', label: '短め' }, { value: 'normal', label: 'ふつう' }, { value: 'long', label: '長め' }], s.fuse, (fuse) => set({ fuse }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' },
        `💩が来たら${WIPES}回タップしてふいてから、だれかに押しつける。渡してきた人には返せません（2人のときはOK）。爆発の時間はだれにも分かりません。`));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    if (a.type === 'again') {
      if (g.phase !== 'over' || a.from !== ctx.hostId || playerCountError(ctx, 2)) return null;
      return newGame(ctx);
    }
    if (a.type !== 'pass' || g.phase !== 'play' || g.stage !== 'pass') return null;
    if (a.from !== g.holder || a.seq !== g.seq || ctx.now() < g.goAt - 300) return null;
    if (!targets(g, a.from).includes(a.to)) return null;
    return { game: { ...g, holder: a.to, prev: a.from, seq: g.seq + 1, passes: g.passes + 1 } };
  },

  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'play') return null;
    const now = ctx.now();
    if (g.stage === 'pass') {
      const boomAt = (ctx.private || {}).boomAt;
      if (!boomAt) return null;
      if (now >= boomAt) {
        const hits = { ...g.hits, [g.holder]: ((g.hits || {})[g.holder] || 0) + 1 };
        const history = [...(g.history || []), { round: g.round, loser: g.holder, passes: g.passes, fuse: g.fuse }];
        return { game: { ...g, stage: 'boom', loser: g.holder, hits, history, nextAt: now + BOOM_SHOW_MS } };
      }
      // 残りが少なくなると💩が震えだす（正確な時間は分からない程度に）
      const left = (boomAt - now) / g.fuse;
      const heat = left < 0.2 ? 2 : left < 0.5 ? 1 : 0;
      return heat !== g.heat ? { game: { ...g, heat } } : null;
    }
    if (g.stage === 'boom' && now >= g.nextAt) {
      if (g.round >= g.rounds) return { game: { ...g, phase: 'over' }, private: null };
      // 爆発した人から次のラウンドを始める
      const holder = g.players.includes(g.loser) ? g.loser : pick(g.players);
      return newRound(ctx, g, g.round + 1, holder);
    }
    return null;
  },

  render(ctx) {
    const g = ctx.game;
    view.rerender = ctx.rerender;
    view.now = ctx.now;
    if (g.phase === 'over') {
      return overView(ctx, g, {
        scores: g.hits, lowerBetter: true, crown: '🧻', topLabel: 'いちばんキレイだった人',
        format: (v) => '💩×' + v,
        after: h('div', { class: 'card' }, h('strong', null, 'ラウンドの記録'),
          h('ol', { class: 'un-hist' }, (g.history || []).map((r) =>
            h('li', null, `${nameOf(ctx, r.loser)} が爆発（${r.passes}回パス・${(r.fuse / 1000).toFixed(1)}秒）`)))),
      });
    }
    effects(ctx, g);
    return playView(ctx, g);
  },
});

function effects(ctx, g) {
  if (g.stage === 'boom' && view.seenBoom !== g.round) {
    view.seenBoom = g.round;
    beep(140, 0.6, 'sawtooth', 0.12, 40);
    if (g.loser === ctx.me) buzz([200, 80, 300]);
  }
  if (g.stage === 'pass' && view.seenSeq !== g.seq) {
    if (view.seenSeq != null && g.holder === ctx.me) { beep(600, 0.1, 'triangle', 0.08, 300); buzz(80); }
    view.seenSeq = g.seq;
  }
}

function playView(ctx, g) {
  const me = ctx.me;
  const mine = g.holder === me && g.stage === 'pass';
  if (view.seq !== g.seq) { view.seq = g.seq; view.wipes = 0; }
  const counting = g.stage === 'pass' && ctx.now() < g.goAt;

  let center;
  if (g.stage === 'boom') {
    center = h('div', { class: 'card center un-boom pop' },
      h('div', { class: 'un-splash' }, '💥💩💥'),
      h('div', { class: 'un-loser' }, g.loser === me ? 'あなたが うんちまみれ！' : `${nameOf(ctx, g.loser)} が うんちまみれ！`),
      h('div', { class: 'muted small' }, `${g.passes}回パス ・ ${(g.fuse / 1000).toFixed(1)}秒で爆発`),
      h('div', { class: 'muted small' }, g.round >= g.rounds ? 'まもなく結果発表…' : 'まもなく次のラウンド…'));
  } else if (counting) {
    center = h('div', { class: 'card center un-stage' },
      h('div', { class: 'muted small' }, '最初に持つのは'),
      h('div', { class: 'un-holder' }, g.holder === me ? 'あなた' : nameOf(ctx, g.holder)),
      h('div', { class: 'un-count', 'data-un-go': g.goAt }, ''));
  } else if (mine) {
    const ready = view.wipes >= WIPES;
    center = h('div', { class: 'card center un-stage un-mine' },
      h('div', { class: 'un-alert' }, 'あなたが持ってる！'),
      h('button', {
        type: 'button', id: 'un-poop', class: `un-poop heat${g.heat || 0}` + (ready ? ' clean' : ''),
        onclick: () => { if (view.wipes < WIPES) { view.wipes++; beep(900 + view.wipes * 150, 0.05); ctx.rerender(); } },
      }, ready ? '✨💩✨' : '💩'),
      h('div', { class: 'un-wipe' }, ready ? 'ふけた！押しつける相手をえらんで' : `タップしてふく ${view.wipes}/${WIPES}`),
      h('div', { class: 'un-targets' },
        targets(g, me).map((id) => button(nameOf(ctx, id), () => { if (view.wipes >= WIPES) ctx.send('pass', { to: id, seq: g.seq }); },
          'un-target' + (ready ? ' primary' : ''), { disabled: !ready }))),
      g.prev && g.players.length > 2 ? h('div', { class: 'muted small' }, `${nameOf(ctx, g.prev)} には返せません`) : null);
  } else {
    center = h('div', { class: 'card center un-stage' },
      h('div', { class: 'muted small' }, 'いま持っているのは'),
      h('div', { class: 'un-holder' }, nameOf(ctx, g.holder)),
      h('div', { class: `un-poop small heat${g.heat || 0}` }, '💩'),
      h('div', { class: 'muted small' }, g.prev === me ? 'あなたが押しつけた！' : 'こっちに来ませんように…'));
  }

  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
    center,
    h('div', { class: 'un-meta muted small center' }, `このラウンドのパス：${g.passes}回`),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'うんちまみれ回数'),
      scoreList(ctx, g.players, g.hits, { lowerBetter: true, format: (v) => '💩×' + v, mark: { [g.holder]: 'un-has' } })));
}

// カウントダウン表示
setInterval(() => {
  document.querySelectorAll('[data-un-go]').forEach((el) => {
    if (!view.now) return;
    const left = Number(el.getAttribute('data-un-go')) - view.now();
    if (left <= 0) { el.textContent = 'スタート！'; if (view.rerender) view.rerender(); return; }
    el.textContent = String(Math.ceil(left / 1000));
  });
}, 100);
})();
