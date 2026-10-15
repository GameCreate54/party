// ===== ゲームのひな形（クイズ型・同時回答型） =====
// window.Party.kit2.quiz({...}) / window.Party.kit2.simul({...}) で、少ない記述でゲームを登録できる。
(() => {
const { h, button, stepper, shuffle } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep, buzz } = window.Party.kit;

// ---------- 4択クイズ ----------
// spec: { id, name, icon, description, make(used) => { q, a, w:[3], key, big }, secs, rounds, note }
function quiz(spec) {
  const SECS = spec.secs || 12;
  const SHOW_MS = 3500;
  const view = { qn: null, picked: null, seen: null, now: null };

  function newQ(ctx, g, qn) {
    const item = spec.make(g.used || []);
    const choices = shuffle([item.a, ...item.w]);
    const now = ctx.now();
    return {
      game: { ...g, phase: 'q', qn, q: item.q, sub: item.sub || null, big: item.big ? 1 : 0, choices, used: [...(g.used || []), item.key], startAt: now + 1200, endAt: now + 1200 + SECS * 1000, done: null, ans: null, ok: null, gain: null },
      private: { a: choices.indexOf(item.a), ans: {} },
    };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    const scores = Object.fromEntries(players.map((id) => [id, 0]));
    return newQ(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || spec.rounds || 10, used: [] }, 1);
  }
  function reveal(ctx, g, ansIn) {
    const ans = { ...(ansIn || {}) };
    const ok = (ctx.private || {}).a;
    const right = g.players.filter((id) => ans[id] && ans[id].i === ok).sort((x, y) => ans[x].t - ans[y].t);
    const gain = Object.fromEntries(g.players.map((id) => [id, 0]));
    right.forEach((id, i) => { gain[id] = i === 0 ? 3 : i === 1 ? 2 : 1; });
    const scores = { ...g.scores };
    g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
    return { game: { ...g, phase: 'reveal', ok, ans, gain, scores, nextAt: ctx.now() + SHOW_MS }, private: null };
  }

  window.Party.register({
    id: spec.id, name: spec.name, icon: spec.icon, description: spec.description,
    defaultSettings: () => ({ rounds: spec.rounds || 10 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: spec.rounds || 10, ...ctx.settings };
      return h('div', { class: 'settings' },
        h('div', { class: 'row' }, h('span', { class: 'row-label' }, '問題数'), stepper(Number(s.rounds), 3, 30, (rounds) => set({ rounds }), editable)),
        h('p', { class: 'muted small', style: 'margin:0' }, (spec.note ? spec.note + ' ' : '') + `4択・1問${SECS}秒。正解した人のうち早い順に3・2・1点。`));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (!g) return null;
      if (a.type === 'again') return a.from === ctx.hostId && g.phase === 'over' ? newGame(ctx) : null;
      if (a.type !== 'ans' || g.phase !== 'q' || a.qn !== g.qn || !g.players.includes(a.from) || ![0, 1, 2, 3].includes(a.i)) return null;
      const pv = ctx.private || {};
      if ((pv.ans || {})[a.from]) return null;
      const t = (typeof a.ts === 'number' ? a.ts : ctx.now()) - g.startAt;
      const ans = { ...(pv.ans || {}), [a.from]: { i: a.i, t } };
      const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
      if (activeIds(ctx, g.players).every((id) => ans[id])) return reveal({ ...ctx, private: { ...pv, ans } }, ng, ans);
      return { game: ng, private: { ...pv, ans } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g) return null;
      const now = ctx.now();
      if (g.phase === 'q' && now >= g.endAt) return reveal(ctx, g, (ctx.private || {}).ans);
      if (g.phase === 'reveal' && now >= g.nextAt) return g.qn >= g.rounds ? { game: { ...g, phase: 'over' } } : newQ(ctx, g, g.qn + 1);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      view.now = ctx.now;
      if (g.phase === 'over') return overView(ctx, g, { crown: spec.icon, topLabel: spec.champion || '優勝' });
      if (view.qn !== g.qn) { view.qn = g.qn; view.picked = null; }
      const ready = ctx.now() >= g.startAt;
      if (g.phase === 'q' && !ready) setTimeout(ctx.rerender, Math.max(50, g.startAt - ctx.now() + 20));
      if (g.phase === 'reveal' && view.seen !== g.qn) {
        view.seen = g.qn;
        const mine = (g.ans || {})[ctx.me];
        if (mine && mine.i === g.ok) { beep(1100, 0.15, 'triangle', 0.1, 1600); buzz(40); } else beep(300, 0.25, 'sawtooth', 0.06, 200);
      }
      const playing = g.players.includes(ctx.me);
      const myAns = g.phase === 'reveal' ? ((g.ans || {})[ctx.me] || {}).i : view.picked;
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `第${g.qn}問 / ${g.rounds}`), g.phase === 'q' ? h('span', { class: 'qz-time', 'data-qz-end': g.endAt }, '') : null),
        h('div', { class: 'card center qz-q' + (g.big ? ' big' : '') }, ready || g.phase === 'reveal' ? [g.q, g.sub ? h('div', { class: 'muted small' }, g.sub) : null] : h('span', { class: 'muted' }, 'よーい…')),
        h('div', { class: 'qz-grid' }, (g.choices || []).map((c, i) => h('button', {
          type: 'button',
          class: 'qz-c' + (myAns === i ? ' on' : '') + (g.phase === 'reveal' ? (i === g.ok ? ' ok' : myAns === i ? ' ng' : ' dim') : ''),
          disabled: !playing || g.phase !== 'q' || !ready || view.picked != null,
          onclick: () => { view.picked = i; ctx.send('ans', { i, qn: g.qn }); beep(700, 0.05); ctx.rerender(); },
        }, ready || g.phase === 'reveal' ? c : '？'))),
        g.phase === 'reveal'
          ? h('div', { class: 'qz-who' }, g.players.map((id) => {
            const r = (g.ans || {})[id];
            return h('span', { class: 'chip' + (r && r.i === g.ok ? ' on' : '') }, `${nameOf(ctx, id)} ${r ? (r.i === g.ok ? '⭕' : '❌') : '－'}${g.gain[id] ? ' +' + g.gain[id] : ''}`);
          }))
          : h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '答えた人'), doneChips(ctx, g.players, g.done)),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)));
    },
  });

  setInterval(() => {
    document.querySelectorAll('[data-qz-end]').forEach((el) => {
      if (!view.now) return;
      const left = Math.max(0, Number(el.getAttribute('data-qz-end')) - view.now());
      const t = '⏱ ' + Math.ceil(left / 1000);
      if (el.textContent !== t) el.textContent = t;
    });
  }, 200);
}

// 問題バンクから重複なしで1問えらぶ
function fromBank(bank, used, toItem) {
  const u = new Set(used);
  let pool = bank.map((_, i) => i).filter((i) => !u.has(i));
  if (!pool.length) pool = bank.map((_, i) => i);
  const i = pool[Math.floor(Math.random() * pool.length)];
  return { ...toItem(bank[i]), key: i };
}

// ---------- 同時に答えて発表する型 ----------
// spec: { id, name, icon, description, min, rounds, settings(s, set, editable) -> 要素, defaults,
//         round(ctx, g) -> ラウンドの公開データ, secretRound?(ctx,g) -> {private追加},
//         input(ctx, g, view, send) -> 要素, accept(g, value) -> 正しい値 or undefined,
//         score(g, picks, ctx) -> { gain:{id:n}, extra:{} }, reveal(ctx, g) -> 要素 }
function simul(spec) {
  const view = { round: null, sent: null, seen: null };
  function newRound(ctx, g, round) {
    const { __private, ...r } = spec.round ? spec.round(ctx, { ...g, round }) : {};
    return { game: { ...g, ...r, phase: 'pick', round, done: null, picks: null, gain: null }, private: { picks: {}, ...(__private || {}) } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    const scores = Object.fromEntries(players.map((id) => [id, 0]));
    const s = { ...(spec.defaults || {}), ...ctx.settings };
    return newRound(ctx, { players, scores, rounds: Number(s.rounds) || spec.rounds || 5, opt: s, used: [] }, 1);
  }
  function reveal(ctx, g, picksIn) {
    const picks = { ...(picksIn || {}) };
    const pv = ctx.private || {};
    const res = spec.score({ ...g, __private: pv }, picks, ctx);
    const scores = { ...g.scores };
    g.players.forEach((id) => { scores[id] = (scores[id] || 0) + ((res.gain || {})[id] || 0); });
    return { game: { ...g, ...(res.extra || {}), phase: 'reveal', picks, gain: res.gain, scores }, private: null };
  }
  window.Party.register({
    id: spec.id, name: spec.name, icon: spec.icon, description: spec.description,
    defaultSettings: () => ({ rounds: spec.rounds || 5, ...(spec.defaults || {}) }),
    validate: (ctx) => playerCountError(ctx, spec.min || 2),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: spec.rounds || 5, ...(spec.defaults || {}), ...ctx.settings };
      return h('div', { class: 'settings' },
        h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 20, (rounds) => set({ rounds }), editable)),
        spec.settings ? spec.settings(s, set, editable) : null,
        spec.note ? h('p', { class: 'muted small', style: 'margin:0' }, spec.note) : null);
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (!g) return null;
      const isHost = a.from === ctx.hostId;
      switch (a.type) {
        case 'pick': {
          if (g.phase !== 'pick' || a.round !== g.round || !g.players.includes(a.from)) return null;
          const v = spec.accept(g, a.v, a.from);
          if (v === undefined) return null;
          const pv = ctx.private || {};
          const picks = { ...(pv.picks || {}), [a.from]: v };
          const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
          if (activeIds(ctx, g.players).every((id) => picks[id] !== undefined)) return reveal({ ...ctx, private: { ...pv, picks } }, ng, picks);
          return { game: ng, private: { ...pv, picks } };
        }
        case 'close': return isHost && g.phase === 'pick' ? reveal(ctx, g, (ctx.private || {}).picks) : null;
        case 'next':
          if (!isHost || g.phase !== 'reveal') return null;
          return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
        case 'again': return isHost && g.phase === 'over' ? newGame(ctx) : null;
        default: return null;
      }
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: spec.icon, topLabel: spec.champion || '優勝', after: spec.overExtra ? spec.overExtra(ctx, g) : null });
      if (view.round !== g.round) { view.round = g.round; view.sent = null; }
      if (g.phase === 'reveal' && view.seen !== g.round) { view.seen = g.round; beep(700, 0.25, 'triangle', 0.1, 1400); }
      const send = (v) => { view.sent = v; ctx.send('pick', { v, round: g.round }); ctx.rerender(); };
      const playing = g.players.includes(ctx.me);
      const head = h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`);
      if (g.phase === 'pick') {
        return h('div', { class: 'stack' }, head,
          spec.prompt ? spec.prompt(ctx, g) : null,
          playing ? spec.input(ctx, g, view, send) : h('p', { class: 'center muted' }, '観戦中'),
          h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '答えた人'), doneChips(ctx, g.players, g.done)),
          ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
      }
      return h('div', { class: 'stack' }, head,
        spec.prompt ? spec.prompt(ctx, g) : null,
        spec.reveal(ctx, g),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'),
          scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
        ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次へ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
    },
  });
}

window.Party.kit2 = { quiz, simul, fromBank };
})();
