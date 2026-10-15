// ===== 数字ならべ（協力） =====
// 全員に 1〜100 のカードが配られる（自分の数字だけ見える）。
// しゃべらずに（またはテーマに沿ったヒントだけで）、全員のカードを小さい順に出していく。
// 自分より小さいカードを持った人がいたら失敗でライフ−1。全レベルクリアでみんなの勝ち。
(() => {
const { h, button, stepper, inputBox, drafts, shuffle, pick, toast } = window.Party.ui;
const { nameOf, playerCountError, beep, buzz } = window.Party.kit;

const THEMES = [
  'こわいもの', '人気の食べ物', '大きい動物', 'もらってうれしいもの', '強そうなもの', '高いもの（値段）', '速いもの', '重いもの',
  '有名人の知名度', '行ってみたい場所', 'ほしいもの', 'からいもの', '甘いもの', '痛いこと', 'モテそうな職業', '朝ごはんの満足度',
  'テンションが上がること', 'くさいもの', '寒いもの', '長いもの', 'うるさいもの', '危ないもの', 'かわいいもの', '眠くなるもの',
];

const view = { level: null, hint: null, seenPile: 0, seenMiss: 0 };

function deal(ctx, g, level) {
  const nums = shuffle(Array.from({ length: 100 }, (_, i) => i + 1));
  const hands = {};
  const secrets = {};
  let k = 0;
  for (const id of g.players) {
    hands[id] = nums.slice(k, k + level).sort((a, b) => a - b);
    k += level;
    secrets[id] = { hand: hands[id], level };
  }
  return {
    game: { ...g, phase: 'play', level, theme: pick(THEMES), pile: null, misses: null, left: Object.fromEntries(g.players.map((id) => [id, level])), hints: null },
    private: { hands },
    secrets,
  };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const s = ctx.settings;
  const lives = Number(s.lives) || 3;
  return deal(ctx, { players, lives, maxLives: lives, goal: Number(s.goal) || 4, cleared: 0 }, 1);
}

window.Party.register({
  id: 'narabe',
  name: '数字ならべ',
  icon: '🃏',
  description: '自分だけに見える1〜100の数字を、みんなで小さい順に出していく協力ゲーム。テーマに沿ったヒントで伝え合う',

  defaultSettings: () => ({ lives: 3, goal: 4 }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { lives: 3, goal: 4, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ライフ'), stepper(Number(s.lives), 1, 6, (lives) => set({ lives }), editable)),
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'クリア目標（レベル）', h('br'), h('small', { class: 'muted' }, 'レベルの数だけ1人にカードが配られる')),
        stepper(Number(s.goal), 1, 8, (goal) => set({ goal }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, 'みんなで協力するゲーム。数字そのものは言っちゃダメ！テーマ（例：こわいもの）に沿って「おばけくらい」のようにヒントを出し合おう。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    if (a.type === 'again') {
      if (g.phase !== 'over' || !isHost || playerCountError(ctx, 2)) return null;
      return newGame(ctx);
    }
    if (a.type === 'next') {
      if (g.phase !== 'clear' || !isHost) return null;
      if (g.cleared >= g.goal) return { game: { ...g, phase: 'over', win: true } };
      return deal(ctx, g, g.level + 1);
    }
    if (a.type === 'hint') {
      if (g.phase !== 'play' || !g.players.includes(a.from)) return null;
      return { game: { ...g, hints: { ...(g.hints || {}), [a.from]: String(a.text || '').trim().slice(0, 16) } } };
    }
    if (a.type !== 'play' || g.phase !== 'play' || !g.players.includes(a.from)) return null;
    const hands = { ...((ctx.private || {}).hands || {}) };
    const mine = [...(hands[a.from] || [])];
    if (!mine.length) return null;
    const card = mine.shift();
    hands[a.from] = mine;
    // 自分より小さいカードが残っていたら失敗。それらは捨てる
    const missed = [];
    for (const id of g.players) {
      const lower = (hands[id] || []).filter((n) => n < card);
      if (lower.length) {
        lower.forEach((n) => missed.push({ id, n }));
        hands[id] = (hands[id] || []).filter((n) => n > card);
      }
    }
    const pile = [...(g.pile || []), { id: a.from, n: card, bad: missed.length ? 1 : 0 }];
    const misses = [...(g.misses || []), ...missed];
    const lives = g.lives - (missed.length ? 1 : 0);
    const left = Object.fromEntries(g.players.map((id) => [id, (hands[id] || []).length]));
    const secrets = Object.fromEntries(g.players.map((id) => [id, { hand: hands[id] || [], level: g.level }]));
    let ng = { ...g, pile, misses, lives, left };
    if (lives <= 0) ng = { ...ng, phase: 'over', win: false };
    else if (g.players.every((id) => !(hands[id] || []).length)) ng = { ...ng, phase: 'clear', cleared: g.level };
    return { game: ng, private: { hands }, secrets };
  },

  render(ctx) {
    const g = ctx.game;
    if (view.level !== g.level + ':' + (g.theme || '')) {
      view.level = g.level + ':' + (g.theme || ''); view.seenPile = 0; view.seenMiss = 0;
      drafts['nb-hint'] = '';
    }
    const pile = g.pile || [];
    if (pile.length > view.seenPile) {
      const last = pile[pile.length - 1];
      if (last.bad) { beep(160, 0.4, 'sawtooth', 0.1, 80); buzz([100, 50, 100]); } else beep(700 + last.n * 6, 0.1, 'triangle', 0.08);
      view.seenPile = pile.length;
    }
    return g.phase === 'over' ? overView(ctx, g) : playView(ctx, g);
  },
});

function hearts(g) {
  return h('div', { class: 'nb-lives' }, Array.from({ length: g.maxLives }, (_, i) => h('span', { class: i < g.lives ? 'on' : 'off' }, i < g.lives ? '❤️' : '🖤')));
}

function playView(ctx, g) {
  const me = ctx.me;
  const sec = ctx.secret && ctx.secret.level === g.level ? ctx.secret : null;
  const hand = sec ? sec.hand || [] : [];
  const pile = g.pile || [];
  const top = pile[pile.length - 1];
  const sendHint = () => { ctx.send('hint', { text: drafts['nb-hint'] || '' }); toast('ヒントを出しました'); };
  return h('div', { class: 'stack' },
    h('div', { class: 'nb-top' }, h('span', { class: 'round-pill' }, `レベル ${g.level} / ${g.goal}`), hearts(g)),
    h('div', { class: 'card center nb-theme' }, h('div', { class: 'muted small' }, 'テーマ（大きい数字ほど「すごい」）'), h('div', { class: 'nb-theme-t' }, g.theme)),
    h('div', { class: 'card center' },
      h('div', { class: 'muted small' }, '場に出ているカード'),
      h('div', { class: 'nb-top-card' + (top && top.bad ? ' bad' : '') }, top ? top.n : '－'),
      top ? h('div', { class: 'muted small' }, `${nameOf(ctx, top.id)} が出した`) : h('div', { class: 'muted small' }, '一番小さいと思う人から出そう'),
      pile.length > 1 ? h('div', { class: 'nb-pile' }, pile.slice(0, -1).map((c) => h('span', { class: c.bad ? 'bad' : '' }, c.n))) : null),
    (g.misses || []).length
      ? h('div', { class: 'nb-miss' }, '失敗で捨てたカード：', (g.misses || []).map((m) => `${nameOf(ctx, m.id)} ${m.n}`).join('、'))
      : null,
    g.phase === 'clear'
      ? h('div', { class: 'card center nb-clear pop' }, h('div', { class: 'nb-big' }, '🎉 レベルクリア！'),
        ctx.isHost ? button(g.cleared >= g.goal ? '結果へ' : `レベル ${g.level + 1} へ`, () => ctx.send('next'), 'primary big') : h('p', { class: 'muted small' }, 'ホストが次へ進めます'))
      : g.players.includes(me)
        ? h('div', { class: 'card stack' },
          h('div', { class: 'muted small center' }, 'あなたのカード（ほかの人には見えない）'),
          h('div', { class: 'nb-hand' }, hand.length ? hand.map((n, i) => h('span', { class: 'nb-card' + (i === 0 ? ' next' : '') }, n)) : h('span', { class: 'muted' }, '出し切りました')),
          hand.length ? button(`${hand[0]} を出す`, () => ctx.send('play'), 'primary big') : null,
          h('div', { class: 'nb-row' },
            inputBox('nb-hint', { placeholder: 'テーマに沿ったヒント（例：おばけくらい）', maxlength: 16, onEnter: sendHint }),
            button('出す', sendHint, 'small')))
        : null,
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'みんなの様子'),
      h('div', { class: 'nb-players' }, g.players.map((id) => h('div', { class: 'nb-pl' + (id === me ? ' me' : '') },
        h('span', { class: 'nb-pn' }, nameOf(ctx, id)),
        h('span', { class: 'nb-hint' }, (g.hints || {})[id] ? `「${g.hints[id]}」` : ''),
        h('span', { class: 'nb-left' }, '🂠×' + ((g.left || {})[id] || 0)))))));
}

function overView(ctx, g) {
  return h('div', { class: 'stack' },
    h('div', { class: 'card center kit-final pop' },
      h('div', { class: 'kit-crown' }, g.win ? '🏆' : '💔'),
      h('div', { class: 'kit-winner' }, g.win ? '全レベルクリア！' : 'ゲームオーバー'),
      h('div', { class: 'muted' }, g.win ? `ライフ残り ${g.lives}` : `レベル ${g.cleared} までクリア（目標 ${g.goal}）`)),
    (g.pile || []).length ? h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '最後のレベルで出た順'),
      h('div', { class: 'nb-pile big' }, (g.pile || []).map((c) => h('span', { class: c.bad ? 'bad' : '' }, `${c.n}（${nameOf(ctx, c.id)}）`)))) : null,
    ctx.isHost
      ? button('もう一回（同じメンバー）', () => ctx.send('again'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストの操作を待っています…'));
}
})();
