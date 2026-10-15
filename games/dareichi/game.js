// ===== この中でいちばん… =====
// 「この中で一番遅刻しそうなのは？」のようなお題に、全員がこっそり1人を選んで投票。
// 一番票を集めた人に投票していたら+1点（みんなの考えを読めたら勝ち）。
// 選ばれた人にはその称号が付く。最後に称号コレクションを発表。
(() => {
const { h, button, stepper, shuffle } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const QUESTIONS = [
  '一番遅刻しそうなのは？', '一番お金持ちになりそうなのは？', '一番モテそうなのは？', '無人島で最後まで生き残りそうなのは？', '一番怒ると怖そうなのは？',
  '宝くじが当たったら一番散財しそうなのは？', '一番ゲームがうまそうなのは？', 'ゾンビ映画で最初にやられそうなのは？', '一番泣き虫なのは？', '一番料理が上手そうなのは？',
  '一番寝坊しそうなのは？', '一番有名人になりそうなのは？', '一番ウソが上手そうなのは？', '一番方向音痴そうなのは？', '一番朝が弱そうなのは？',
  '一番ドッキリに引っかかりそうなのは？', '一番先に結婚しそうなのは？', '一番スマホを見ている時間が長そうなのは？', '一番辛いものが得意そうなのは？', '一番カラオケで盛り上げそうなのは？',
  '一番忘れ物が多そうなのは？', '一番きれい好きそうなのは？', '一番サバイバル能力が高そうなのは？', '一番マイペースなのは？', '一番秘密を守れなさそうなのは？',
  '一番ホラー映画が苦手そうなのは？', '一番社長になりそうなのは？', '一番動物に好かれそうなのは？', '一番運がよさそうなのは？', '一番人見知りしなさそうなのは？',
  '一番やさしいのは？', '一番負けず嫌いなのは？', '一番グルメそうなのは？', '一番夜ふかししていそうなのは？', '一番おしゃれなのは？',
  '一番宇宙に行きたがりそうなのは？', '一番YouTuberに向いていそうなのは？', '一番ギャンブルにハマりそうなのは？', '一番長生きしそうなのは？', '一番すぐ迷子になりそうなのは？',
];

const view = { round: null, chosen: null, seenReveal: null };
const titleOf = (q) => q.replace(/^一番|なのは？$|のは？$|は？$/g, '');

function newRound(ctx, g, round) {
  const used = new Set(g.used || []);
  let pool = QUESTIONS.map((_, i) => i).filter((i) => !used.has(i));
  if (!pool.length) pool = QUESTIONS.map((_, i) => i);
  const qi = shuffle(pool)[0];
  return { game: { ...g, phase: 'vote', round, q: QUESTIONS[qi], used: [...(g.used || []), qi], done: null, votes: null, top: null, gain: null }, private: { votes: {} } };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = {};
  players.forEach((id) => { scores[id] = 0; });
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 6, titles: null, used: [] }, 1);
}

function reveal(g, votesIn) {
  const votes = { ...(votesIn || {}) };
  const count = {};
  for (const v of Object.values(votes)) count[v] = (count[v] || 0) + 1;
  const most = Math.max(0, ...Object.values(count));
  const top = most ? Object.keys(count).filter((id) => count[id] === most) : [];
  const gain = {};
  const scores = { ...g.scores };
  g.players.forEach((id) => {
    gain[id] = votes[id] && top.includes(votes[id]) ? 1 : 0;
    scores[id] = (scores[id] || 0) + gain[id];
  });
  const titles = { ...(g.titles || {}) };
  for (const id of top) titles[id] = [...(titles[id] || []), titleOf(g.q)];
  return { game: { ...g, phase: 'reveal', votes, count, top, gain, scores, titles }, private: null };
}

window.Party.register({
  id: 'dareichi',
  name: 'この中でいちばん…',
  icon: '👑',
  description: '「一番遅刻しそうなのは？」に全員でこっそり投票。一番票を集めた人を当てたら得点。称号も付く',

  defaultSettings: () => ({ rounds: 6 }),
  validate: (ctx) => playerCountError(ctx, 3),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 6, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'お題の数'), stepper(Number(s.rounds), 1, 15, (rounds) => set({ rounds }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '自分以外のだれかに投票。だれが一番票を集めるか読めた人に+1点。選ばれた人には称号が付きます（3人から）。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'vote': {
        if (g.phase !== 'vote' || a.round !== g.round || !g.players.includes(a.from)) return null;
        if (a.to === a.from || !g.players.includes(a.to)) return null;
        const votes = { ...((ctx.private || {}).votes || {}), [a.from]: a.to };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => votes[id])) return reveal(ng, votes);
        return { game: ng, private: { votes } };
      }
      case 'close':
        if (!isHost || g.phase !== 'vote') return null;
        return reveal(g, (ctx.private || {}).votes);
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        if (g.round >= g.rounds) return { game: { ...g, phase: 'over' } };
        return newRound(ctx, g, g.round + 1);
      case 'again':
        if (!isHost || g.phase !== 'over' || playerCountError(ctx, 3)) return null;
        return newGame(ctx);
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') {
      return overView(ctx, g, {
        crown: '👑', topLabel: 'みんなの心を一番読めた人',
        after: h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '称号コレクション'),
          h('div', { class: 'di-titles' }, g.players.map((id) => h('div', { class: 'di-trow' },
            h('b', null, nameOf(ctx, id)),
            h('div', { class: 'di-tags' }, ((g.titles || {})[id] || []).length
              ? (g.titles[id] || []).map((t) => h('span', { class: 'di-tag' }, t))
              : h('span', { class: 'muted small' }, '称号なし')))))),
      });
    }
    if (view.round !== g.round) { view.round = g.round; view.chosen = null; }
    if (g.phase === 'reveal' && view.seenReveal !== g.round) { view.seenReveal = g.round; beep(600, 0.25, 'triangle', 0.1, 1200); }
    return g.phase === 'vote' ? voteView(ctx, g) : revealView(ctx, g);
  },
});

function qCard(g) {
  return h('div', { class: 'card center di-q' },
    h('div', { class: 'muted small' }, `お題 ${g.round} / ${g.rounds}・この中で…`),
    h('div', { class: 'di-qt' }, g.q));
}

function voteView(ctx, g) {
  const me = ctx.me;
  const playing = g.players.includes(me);
  return h('div', { class: 'stack' },
    qCard(g),
    playing
      ? h('div', { class: 'card stack' },
        h('div', { class: 'row-label center' }, view.chosen ? `${nameOf(ctx, view.chosen)} に投票しました（変更OK）` : 'だれだと思う？（自分以外）'),
        h('div', { class: 'di-grid' }, g.players.filter((id) => id !== me).map((id) => h('button', {
          type: 'button', class: 'di-pick' + (view.chosen === id ? ' on' : ''),
          onclick: () => { view.chosen = id; ctx.send('vote', { to: id, round: g.round }); ctx.rerender(); },
        }, nameOf(ctx, id)))))
      : h('p', { class: 'center muted' }, '観戦中'),
    h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '投票した人'), doneChips(ctx, g.players, g.done)),
    ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
}

function revealView(ctx, g) {
  const count = g.count || {};
  const votes = g.votes || {};
  const rows = g.players.map((id) => ({ id, n: count[id] || 0 })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  const top = g.top || [];
  return h('div', { class: 'stack' },
    qCard(g),
    h('div', { class: 'card center di-winner pop' },
      top.length ? h('div', null, h('div', { class: 'di-crown' }, '👑'), h('div', { class: 'di-name' }, top.map((id) => nameOf(ctx, id)).join('・')),
        h('div', { class: 'muted small' }, `${max}票で「${titleOf(g.q)}」で賞`))
        : h('div', { class: 'muted' }, 'だれも投票しませんでした')),
    h('div', { class: 'card di-bars' }, rows.map((r) => h('div', { class: 'di-bar' + (top.includes(r.id) ? ' top' : '') },
      h('span', { class: 'di-bn' }, nameOf(ctx, r.id)),
      h('span', { class: 'di-track' }, h('span', { class: 'di-fill', style: `width:${(r.n / max) * 100}%` })),
      h('span', { class: 'di-bv' }, r.n + '票'),
      h('div', { class: 'di-who' }, g.players.filter((v) => votes[v] === r.id).map((v) => nameOf(ctx, v)).join('、'))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計（一番を当てたら+1）'),
      scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
    ctx.isHost
      ? button(g.round >= g.rounds ? '最終結果へ' : '次のお題へ', () => ctx.send('next'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
}
})();
