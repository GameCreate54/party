// ===== かぶったらダメ =====
// みんな同時に数字を1つ選ぶ。だれともかぶらなかった数字は、その数がそのまま得点。かぶったら0点。
// 大きい数字ほどおいしいけど、みんなも狙っている…。
// 選んだ数字は全員がそろうまで、ホストの端末だけが持っている。
(() => {
const { h, button, stepper, segmented } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const view = { round: null, chosen: null, seenReveal: null };

function newRound(ctx, g, round) {
  return { game: { ...g, phase: 'pick', round, done: null, picks: null, gain: null }, private: { picks: {} } };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = {};
  players.forEach((id) => { scores[id] = 0; });
  const s = ctx.settings;
  return newRound(ctx, { players, scores, rounds: s.rounds || 5, max: Number(s.max) || 10, history: [] }, 1);
}

function reveal(ctx, g) {
  const picks = { ...((ctx.private || {}).picks || {}) };
  const count = {};
  for (const id of g.players) if (picks[id]) count[picks[id]] = (count[picks[id]] || 0) + 1;
  const gain = {};
  const scores = { ...g.scores };
  for (const id of g.players) {
    const n = picks[id];
    gain[id] = n && count[n] === 1 ? n : 0;
    scores[id] = (scores[id] || 0) + gain[id];
  }
  const history = [...(g.history || []), { round: g.round, picks }];
  return { game: { ...g, phase: 'reveal', picks, gain, scores, history }, private: null };
}

window.Party.register({
  id: 'kaburi',
  name: 'かぶったらダメ',
  icon: '🔢',
  description: '同時に数字を選ぶ。だれともかぶらなければその数が得点、かぶったら0点',

  defaultSettings: () => ({ rounds: 5, max: 10 }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, max: 10, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(s.rounds, 1, 15, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '選べる数字'),
        segmented([{ value: 5, label: '1〜5' }, { value: 7, label: '1〜7' }, { value: 10, label: '1〜10' }], Number(s.max), (max) => set({ max }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '少人数なら 1〜5、大人数なら 1〜10 がおすすめ。通話で探り合いながらどうぞ。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'pick': {
        const n = Number(a.n);
        if (g.phase !== 'pick' || !g.players.includes(a.from) || a.round !== g.round) return null;
        if (!Number.isInteger(n) || n < 1 || n > g.max) return null;
        const picks = { ...((ctx.private || {}).picks || {}), [a.from]: n };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => picks[id])) return reveal({ ...ctx, private: { picks } }, ng);
        return { game: ng, private: { picks } };
      }
      case 'close':
        if (!isHost || g.phase !== 'pick') return null;
        return reveal(ctx, g);
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        if (g.round >= g.rounds) return { game: { ...g, phase: 'over' } };
        return newRound(ctx, g, g.round + 1);
      case 'again':
        if (!isHost || g.phase !== 'over' || playerCountError(ctx, 2)) return null;
        return newGame(ctx);
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') {
      return overView(ctx, g, {
        crown: '🔢',
        after: h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '選んだ数字の記録'), historyTable(ctx, g)),
      });
    }
    if (view.round !== g.round) { view.round = g.round; view.chosen = null; }
    if (g.phase === 'reveal' && view.seenReveal !== g.round) { view.seenReveal = g.round; beep(500, 0.2, 'triangle', 0.1, 1000); }
    return g.phase === 'pick' ? pickView(ctx, g) : revealView(ctx, g);
  },
});

function pickView(ctx, g) {
  const playing = g.players.includes(ctx.me);
  const nums = Array.from({ length: g.max }, (_, i) => i + 1);
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
    playing
      ? h('div', { class: 'card stack' },
        h('div', { class: 'row-label center' }, view.chosen ? `${view.chosen} を選びました（みんながそろうまで変更OK）` : 'だれともかぶらない数字を選んで！'),
        h('div', { class: 'kb-grid' + (g.max % 5 === 0 ? ' wide' : '') },
          nums.map((n) => h('button', {
            type: 'button', class: 'kb-num' + (view.chosen === n ? ' on' : ''),
            onclick: () => { view.chosen = n; beep(500 + n * 60, 0.05); ctx.send('pick', { n, round: g.round }); ctx.rerender(); },
          }, n))))
      : h('p', { class: 'center muted' }, '観戦中'),
    h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '選んだ人'), doneChips(ctx, g.players, g.done)),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
    ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表（未選択は0点）', () => ctx.send('close'), 'ghost small')));
}

function revealView(ctx, g) {
  const picks = g.picks || {};
  const byNum = {};
  for (const id of g.players) if (picks[id]) (byNum[picks[id]] = byNum[picks[id]] || []).push(id);
  const nums = Object.keys(byNum).map(Number).sort((a, b) => b - a);
  const none = g.players.filter((id) => !picks[id]);
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds} の結果`),
    h('div', { class: 'kb-reveal' },
      nums.map((n) => {
        const ids = byNum[n];
        const ok = ids.length === 1;
        return h('div', { class: 'kb-res pop' + (ok ? ' ok' : ' ng') + (ids.includes(ctx.me) ? ' mine' : '') },
          h('div', { class: 'kb-big' }, n),
          h('div', { class: 'kb-names' }, ids.map((id) => nameOf(ctx, id)).join('、')),
          h('div', { class: 'kb-tag' }, ok ? `+${n}点` : 'かぶり！0点'));
      }),
      none.length ? h('div', { class: 'muted small center' }, '未選択：' + none.map((id) => nameOf(ctx, id)).join('、')) : null),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'),
      scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
    ctx.isHost
      ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
}

function historyTable(ctx, g) {
  const hist = g.history || [];
  return h('table', { class: 'kb-hist' },
    h('tr', null, h('th', null, ''), hist.map((r) => h('th', null, r.round))),
    g.players.map((id) => h('tr', null, h('td', { class: 'kb-hn' }, nameOf(ctx, id)),
      hist.map((r) => {
        const n = (r.picks || {})[id];
        const dup = n && g.players.filter((x) => (r.picks || {})[x] === n).length > 1;
        return h('td', { class: dup ? 'dup' : '' }, n || '－');
      }))));
}
})();
