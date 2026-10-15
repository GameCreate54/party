// ===== しりとりサバイバル =====
// 順番に、制限時間内にしりとりの言葉を打つ。時間切れ・「ん」で終わる・同じ言葉はライフ−1。
// ライフがなくなったら脱落。最後の1人が勝ち。変な言葉はホストが「ダウト」で取り消せる。
(() => {
const { h, button, segmented, stepper, inputBox, drafts, toast, pick } = window.Party.ui;
const { nameOf, playerCountError, beep, buzz } = window.Party.kit;

const STARTS = ['しりとり', 'りんご', 'さくら', 'すいか', 'たぬき', 'からす', 'くるま', 'めだか', 'こあら', 'ねこ'];
const SMALL = { 'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ', 'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け' };

// カタカナ→ひらがな。かなと「ー」以外は不可
const toHira = (s) => String(s || '').normalize('NFKC').trim()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s・]/g, '');
const isKana = (s) => /^[ぁ-ゖー]+$/.test(s);
// 最後の文字（ー はその前の文字、小さい字は大きく）
function tail(w) {
  const t = w.replace(/ー+$/, '');
  const c = t[t.length - 1] || '';
  return SMALL[c] || c;
}
const head = (w) => SMALL[w[0]] || w[0];

const view = { seenLen: 0, seenErr: null, now: null, myTurnBeep: null };

function nextAlive(g, from) {
  const n = g.order.length;
  for (let k = 1; k <= n; k++) {
    const id = g.order[(g.order.indexOf(from) + k) % n];
    if ((g.lives[id] || 0) > 0) return id;
  }
  return from;
}

function lastOk(g) {
  const hist = g.hist || [];
  for (let i = hist.length - 1; i >= 0; i--) if (hist[i].ok) return hist[i].w;
  return g.first;
}

// ライフを減らす。脱落したら記録。残り1人なら終了
function hurt(ctx, g, id, why) {
  const lives = { ...g.lives, [id]: Math.max(0, (g.lives[id] || 0) - 1) };
  let outs = g.outs || [];
  if (lives[id] === 0) outs = [...outs, id];
  let ng = { ...g, lives, outs, err: { id, why, at: ctx.now() } };
  const alive = g.order.filter((x) => lives[x] > 0);
  if (alive.length <= 1) {
    const ranking = [...alive, ...[...outs].reverse()];
    const scores = {};
    ranking.forEach((x, i) => { scores[x] = ranking.length - i; });
    return { ...ng, phase: 'over', winner: alive[0] || null, scores };
  }
  return ng;
}

function startTurn(ctx, g, who) {
  return { ...g, turn: who, deadline: ctx.now() + g.secs * 1000 };
}

function newGame(ctx) {
  const order = ctx.players.map((p) => p.id);
  const s = ctx.settings;
  const lives = {};
  order.forEach((id) => { lives[id] = Number(s.lives) || 2; });
  const g = { phase: 'play', players: order, order, lives, maxLives: Number(s.lives) || 2, secs: Number(s.secs) || 15, first: pick(STARTS), hist: null, used: null, outs: null, err: null };
  return { game: startTurn(ctx, { ...g, deadline: 0 }, order[Math.floor(Math.random() * order.length)]) };
}

window.Party.register({
  id: 'shiritori',
  name: 'しりとりサバイバル',
  icon: '🔤',
  description: '時間内にしりとりの言葉を打つ。時間切れ・「ん」・同じ言葉でライフが減る。最後の1人が勝ち',

  defaultSettings: () => ({ secs: 15, lives: 2 }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { secs: 15, lives: 2, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '1人の持ち時間'),
        segmented([{ value: 10, label: '10秒' }, { value: 15, label: '15秒' }, { value: 20, label: '20秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ライフ'), stepper(Number(s.lives), 1, 3, (lives) => set({ lives }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, 'ひらがな・カタカナで入力。「ー」で終わる言葉はその前の字、小さい「ゃ」などは大きい字でつなぎます。存在しない言葉はホストが「ダウト」で取り消せます。'));
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
    if (g.phase !== 'play') return null;
    if (a.type === 'doubt') {
      // 直前の言葉を取り消して、言った人のライフ−1。順番はそのまま
      const hist = [...(g.hist || [])];
      const i = hist.length - 1;
      if (!isHost || i < 0 || !hist[i].ok || hist[i].n !== a.n) return null;
      hist[i] = { ...hist[i], ok: 0, why: 'ダウト' };
      const used = (g.used || []).filter((w) => w !== hist[i].w);
      let ng = hurt(ctx, { ...g, hist, used }, hist[i].by, 'ダウト！');
      if (ng.phase === 'play') ng = startTurn(ctx, ng, (ng.lives[g.turn] || 0) > 0 ? g.turn : nextAlive(ng, g.turn));
      return { game: ng };
    }
    if (a.type !== 'word' || a.from !== g.turn) return null;
    const w = toHira(a.text);
    const fail = (why) => ({ game: { ...g, err: { id: a.from, why, at: ctx.now(), soft: 1 } } });
    if (!w || !isKana(w)) return fail('ひらがなかカタカナで入力してね');
    if (w.length < 2) return fail('2文字以上の言葉にしてね');
    const need = tail(lastOk(g));
    if (head(w) !== need) return fail(`「${need}」から始まる言葉だよ`);
    const n = (g.hist || []).length + 1;
    if ((g.used || []).includes(w)) {
      let ng = hurt(ctx, { ...g, hist: [...(g.hist || []), { w, by: a.from, ok: 0, why: '使用済み', n }] }, a.from, `「${w}」はもう出たよ`);
      if (ng.phase === 'play') ng = startTurn(ctx, ng, nextAlive(ng, a.from));
      return { game: ng };
    }
    if (tail(w) === 'ん') {
      let ng = hurt(ctx, { ...g, hist: [...(g.hist || []), { w, by: a.from, ok: 0, why: '「ん」', n }] }, a.from, '「ん」で終わった！');
      if (ng.phase === 'play') ng = startTurn(ctx, ng, nextAlive(ng, a.from));
      return { game: ng };
    }
    const ng = { ...g, hist: [...(g.hist || []), { w, by: a.from, ok: 1, n }].slice(-60), used: [...(g.used || []), w], err: null };
    return { game: startTurn(ctx, ng, nextAlive(ng, a.from)) };
  },

  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'play' || ctx.now() < g.deadline) return null;
    let ng = hurt(ctx, g, g.turn, '時間切れ！');
    if (ng.phase === 'play') ng = startTurn(ctx, ng, nextAlive(ng, g.turn));
    return { game: ng };
  },

  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    const len = (g.hist || []).length;
    if (len !== view.seenLen) { view.seenLen = len; beep(800, 0.07, 'triangle', 0.07); }
    if (g.err && g.err.at !== view.seenErr) {
      view.seenErr = g.err.at;
      if (g.err.soft) { if (g.err.id === ctx.me) toast(g.err.why); } else { beep(180, 0.4, 'sawtooth', 0.1, 90); if (g.err.id === ctx.me) buzz([120, 60, 120]); }
    }
    const turnKey = g.turn + ':' + g.deadline;
    if (g.phase === 'play' && g.turn === ctx.me && view.myTurnBeep !== turnKey) { view.myTurnBeep = turnKey; beep(1000, 0.12, 'square', 0.06); buzz(50); drafts['st-word'] = ''; }
    return g.phase === 'over' ? overView(ctx, g) : playView(ctx, g);
  },
});

function livesOf(g, id) {
  return Array.from({ length: g.maxLives }, (_, i) => (i < (g.lives[id] || 0) ? '❤️' : '🖤')).join('');
}

function playView(ctx, g) {
  const me = ctx.me;
  const mine = g.turn === me;
  const last = lastOk(g);
  const need = tail(last);
  const submit = () => {
    const t = (drafts['st-word'] || '').trim();
    if (!t) return;
    ctx.send('word', { text: t });
  };
  const hist = g.hist || [];
  const lastEntry = hist[hist.length - 1];
  return h('div', { class: 'stack' },
    h('div', { class: 'card center st-now' },
      h('div', { class: 'muted small' }, '今の言葉'),
      h('div', { class: 'st-word' }, last),
      h('div', { class: 'st-next' }, '次は「', h('b', null, need), '」から')),
    h('div', { class: 'card center st-turn' + (mine ? ' mine' : '') },
      h('div', null, mine ? 'あなたの番！' : `${nameOf(ctx, g.turn)} の番`),
      h('div', { class: 'st-clock', 'data-st-end': g.deadline }, '')),
    mine
      ? h('div', { class: 'st-row' },
        inputBox('st-word', { placeholder: `「${need}」から始まる言葉`, maxlength: 20, onEnter: submit, keepFocus: true, enterkeyhint: 'send' }),
        button('送信', submit, 'primary'))
      : null,
    g.err && !g.err.soft ? h('div', { class: 'st-err pop' }, `${nameOf(ctx, g.err.id)}：${g.err.why}`) : null,
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'プレイヤー'),
      h('div', { class: 'st-players' }, g.order.map((id) => h('div', { class: 'st-pl' + (id === g.turn ? ' turn' : '') + ((g.lives[id] || 0) <= 0 ? ' out' : '') + (id === me ? ' me' : '') },
        h('span', { class: 'st-pn' }, nameOf(ctx, id)), h('span', null, (g.lives[id] || 0) > 0 ? livesOf(g, id) : '脱落'))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'これまでの言葉'),
      h('div', { class: 'st-hist' },
        h('span', { class: 'st-w first' }, g.first),
        hist.map((e) => h('span', { class: 'st-w' + (e.ok ? '' : ' ng'), title: e.why || '' }, e.w, h('small', null, nameOf(ctx, e.by))))),
      ctx.isHost && lastEntry && lastEntry.ok
        ? button(`「${lastEntry.w}」をダウト（取り消し）`, () => ctx.send('doubt', { n: lastEntry.n }), 'ghost small')
        : null));
}

function overView(ctx, g) {
  const order = [g.winner, ...[...(g.outs || [])].reverse()].filter(Boolean);
  return h('div', { class: 'stack' },
    h('div', { class: 'card center kit-final pop' },
      h('div', { class: 'kit-crown' }, '🔤'),
      h('div', { class: 'muted small' }, '最後まで生き残った人'),
      h('div', { class: 'kit-winner' }, g.winner ? nameOf(ctx, g.winner) : '―'),
      h('div', { class: 'muted small' }, `つながった言葉：${(g.hist || []).filter((e) => e.ok).length}個`)),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '順位'),
      h('ol', { class: 'st-rank' }, order.map((id) => h('li', null, nameOf(ctx, id))))),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'しりとりの記録'),
      h('div', { class: 'st-hist' }, h('span', { class: 'st-w first' }, g.first),
        (g.hist || []).map((e) => h('span', { class: 'st-w' + (e.ok ? '' : ' ng') }, e.w)))),
    ctx.isHost
      ? button('もう一回（同じメンバー）', () => ctx.send('again'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストの操作を待っています…'));
}

setInterval(() => {
  document.querySelectorAll('[data-st-end]').forEach((el) => {
    if (!view.now) return;
    const left = Math.max(0, Number(el.getAttribute('data-st-end')) - view.now());
    const t = (left / 1000).toFixed(1);
    if (el.textContent !== t) el.textContent = t;
    el.classList.toggle('hurry', left < 4000);
  });
}, 100);
})();
