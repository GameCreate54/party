// ===== テーブルゲーム6種 =====
// ビンゴ・神経衰弱・ロシアンわさび寿司・四目ならべ・ブラックジャック・風船わり
(() => {
const { h, button, stepper, segmented, shuffle } = window.Party.ui;
const { nameOf, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;
const reg = window.Party.register;
const roundsRow = (s, set, editable, label, min, max, key = 'rounds') => h('div', { class: 'row' }, h('span', { class: 'row-label' }, label), stepper(Number(s[key]), min, max, (v) => set({ [key]: v }), editable));
const note = (t) => h('p', { class: 'muted small', style: 'margin:0' }, t);
const nextOf = (order, id) => order[(order.indexOf(id) + 1) % order.length];
const zero = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));

// ================= ビンゴ =================
(() => {
  const view = { seen: 0, now: null };
  const COLS = 'BINGO';
  function card() {
    const c = [];
    for (let col = 0; col < 5; col++) c.push(...shuffle(Array.from({ length: 15 }, (_, i) => col * 15 + i + 1)).slice(0, 5));
    const grid = [];
    for (let r = 0; r < 5; r++) for (let col = 0; col < 5; col++) grid.push(c[col * 5 + r]);
    grid[12] = 0; // FREE
    return grid;
  }
  const LINES = [];
  for (let i = 0; i < 5; i++) { LINES.push([0, 1, 2, 3, 4].map((j) => i * 5 + j)); LINES.push([0, 1, 2, 3, 4].map((j) => j * 5 + i)); }
  LINES.push([0, 6, 12, 18, 24], [4, 8, 12, 16, 20]);
  const hit = (grid, called) => grid.map((n) => n === 0 || called.includes(n));
  const lines = (grid, called) => { const m = hit(grid, called); return LINES.filter((l) => l.every((i) => m[i])).length; };
  const reach = (grid, called) => { const m = hit(grid, called); return LINES.some((l) => l.filter((i) => m[i]).length === 4); };
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    const cards = Object.fromEntries(players.map((id) => [id, card()]));
    return { game: { phase: 'play', players, cards, called: [], winners: [], gap: (Number(ctx.settings.gap) || 5) * 1000, need: Math.min(3, players.length), nextAt: ctx.now() + 2500 }, private: { bag: shuffle(Array.from({ length: 75 }, (_, i) => i + 1)) } };
  }
  reg({
    id: 'bingo', name: 'ビンゴ', icon: '🎱',
    description: '自動で数字が読み上げられるビンゴ大会。最初にそろった人から順位がつく',
    defaultSettings: () => ({ gap: 5 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) {
      const s = { gap: 5, ...ctx.settings };
      return h('div', { class: 'settings' },
        h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '数字が出る間隔'),
          segmented([{ value: 3, label: '3秒' }, { value: 5, label: '5秒' }, { value: 8, label: '8秒' }], Number(s.gap), (gap) => set({ gap }), editable)),
        note('カードの数字は自動でマークされます。たてよこななめ1列そろったらビンゴ！上位3人（人数が少ないときは全員）が決まるまで続きます。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'pause' && a.from === ctx.hostId && g.phase === 'play') return { game: { ...g, paused: !g.paused, nextAt: ctx.now() + 1500 } };
      return null;
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'play' || g.paused || ctx.now() < g.nextAt) return null;
      const bag = [...((ctx.private || {}).bag || [])];
      if (!bag.length) return { game: { ...g, phase: 'over' } };
      const n = bag.shift();
      const called = [...(g.called || []), n];
      const winners = [...(g.winners || [])];
      g.players.forEach((id) => { if (!winners.some((w) => w.id === id) && lines(g.cards[id], called)) winners.push({ id, at: called.length }); });
      const scores = {};
      g.players.forEach((id) => { const k = winners.findIndex((w) => w.id === id); scores[id] = k < 0 ? 0 : Math.max(1, 3 - k); });
      const done = winners.length >= g.need;
      return { game: { ...g, called, winners, scores, phase: done ? 'over' : 'play', nextAt: ctx.now() + g.gap }, private: { bag } };
    },
    render(ctx) {
      const g = ctx.game;
      view.now = ctx.now;
      const called = g.called || [];
      if (called.length !== view.seen) { view.seen = called.length; beep(660, 0.12, 'triangle', 0.08); }
      if (g.phase === 'over') {
        return overView(ctx, g, { scores: g.scores || zero(g.players), crown: '🎱', topLabel: '一番にビンゴ',
          after: h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'ビンゴした順'),
            h('ol', { class: 'st-rank' }, (g.winners || []).map((w) => h('li', null, `${nameOf(ctx, w.id)}（${w.at}個目）`)))) });
      }
      const last = called[called.length - 1];
      const mine = (g.cards || {})[ctx.me];
      const m = mine ? hit(mine, called) : [];
      return h('div', { class: 'stack' },
        h('div', { class: 'card center' },
          h('div', { class: 'muted small' }, `${called.length}個目`),
          h('div', { class: 'bg-ball pop', key: last }, last ? `${COLS[Math.floor((last - 1) / 15)]}-${last}` : '…'),
          h('div', { class: 'bg-recent' }, called.slice(-8, -1).reverse().map((n) => h('span', null, n)))),
        mine ? h('div', { class: 'bg-card' + (reach(mine, called) ? ' reach' : '') },
          [...COLS].map((c) => h('div', { class: 'bg-h' }, c)),
          mine.map((n, i) => h('div', { class: 'bg-cell' + (m[i] ? ' on' : '') + (n === last ? ' new' : '') }, n === 0 ? 'FREE' : n))) : h('p', { class: 'center muted' }, '観戦中'),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'みんなの様子'),
          h('div', { class: 'chips kit-done' }, g.players.map((id) => {
            const w = (g.winners || []).findIndex((x) => x.id === id);
            return h('span', { class: 'chip' + (w >= 0 ? ' on' : '') }, `${nameOf(ctx, id)} ${w >= 0 ? `🎉${w + 1}位` : reach(g.cards[id], called) ? 'リーチ！' : ''}`);
          }))),
        ctx.isHost ? button(g.paused ? '▶ 再開' : '⏸ 一時停止', () => ctx.send('pause'), 'ghost small') : null);
    },
  });
})();

// ================= 神経衰弱 =================
(() => {
  const EMO = ['🍎', '🍌', '🍇', '🍓', '🍒', '🍑', '🐶', '🐱', '🐼', '🐸', '🦊', '🐧', '🚗', '🚀', '⚽', '🎈', '🌙', '⭐'];
  const view = { seen: null };
  function newGame(ctx) {
    const order = shuffle(ctx.players.map((p) => p.id));
    const pairs = Number(ctx.settings.pairs) || 10;
    const board = shuffle(shuffle(EMO).slice(0, pairs).flatMap((e) => [e, e]));
    return { game: { phase: 'play', players: order, order, scores: zero(order), turn: order[0], n: board.length, face: null, owner: null, open: null, wait: null, seq: 0 }, private: { board } };
  }
  reg({
    id: 'shinkei', name: '神経衰弱', icon: '🧩',
    description: '順番にカードを2枚めくって、同じ絵がそろったらもらえる。そろったらもう1回！',
    defaultSettings: () => ({ pairs: 10 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) {
      const s = { pairs: 10, ...ctx.settings };
      return h('div', { class: 'settings' }, roundsRow(s, set, editable, 'ペアの数', 6, 18, 'pairs'), note('そろえたペアの数が得点。番の人がいなくなったら、ホストが番を飛ばせます。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (g.phase !== 'play') return null;
      if (a.type === 'skip' && a.from === ctx.hostId && !g.wait) return { game: { ...g, turn: nextOf(g.order, g.turn), open: null, face: Object.fromEntries(Object.entries(g.face || {}).filter(([i]) => (g.owner || {})[i])) } };
      if (a.type !== 'flip' || a.from !== g.turn || g.wait) return null;
      const i = Number(a.i);
      const open = g.open || [];
      if (!(i >= 0 && i < g.n) || (g.owner || {})[i] || open.includes(i)) return null;
      const board = (ctx.private || {}).board || [];
      const face = { ...(g.face || {}), [i]: board[i] };
      const nopen = [...open, i];
      if (nopen.length < 2) return { game: { ...g, face, open: nopen, seq: g.seq + 1 } };
      return { game: { ...g, face, open: nopen, wait: ctx.now() + 1300, seq: g.seq + 1, hitPair: board[nopen[0]] === board[nopen[1]] ? 1 : 0 } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'play' || !g.wait || ctx.now() < g.wait) return null;
      const [x, y] = g.open;
      if (g.hitPair) {
        const owner = { ...(g.owner || {}), [x]: g.turn, [y]: g.turn };
        const scores = { ...g.scores, [g.turn]: (g.scores[g.turn] || 0) + 1 };
        const over = Object.keys(owner).length >= g.n;
        return { game: { ...g, owner, scores, open: null, wait: null, hitPair: 0, phase: over ? 'over' : 'play' } };
      }
      const face = { ...(g.face || {}) };
      delete face[x]; delete face[y];
      return { game: { ...g, face, open: null, wait: null, turn: nextOf(g.order, g.turn) } };
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🧩', topLabel: '記憶力No.1', format: (v) => v + 'ペア' });
      if (view.seen !== g.seq) { view.seen = g.seq; beep(g.wait ? (g.hitPair ? 1200 : 400) : 800, 0.08, 'triangle', 0.07); }
      const mine = g.turn === ctx.me;
      const face = g.face || {};
      const owner = g.owner || {};
      const cols = g.n > 24 ? 6 : g.n > 16 ? 5 : 4;
      return h('div', { class: 'stack' },
        h('div', { class: 'card center' + (mine ? ' sk-mine' : '') }, mine ? 'あなたの番！2枚めくってね' : `${nameOf(ctx, g.turn)} の番`,
          g.wait ? h('div', { class: g.hitPair ? 'sk-ok' : 'muted small' }, g.hitPair ? 'そろった！もう1回' : 'ざんねん…') : null),
        h('div', { class: 'sk-grid', style: `grid-template-columns:repeat(${cols},1fr)` }, Array.from({ length: g.n }, (_, i) => h('button', {
          type: 'button', class: 'sk-card' + (face[i] ? ' up' : '') + (owner[i] ? ' got' : ''), disabled: !mine || !!face[i] || !!g.wait,
          onclick: () => ctx.send('flip', { i }),
        }, face[i] || ''))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'そろえたペア'), scoreList(ctx, g.players, g.scores, { format: (v) => v + 'ペア', mark: { [g.turn]: 'dc-turn' } })),
        ctx.isHost && !mine ? h('div', { class: 'host-tools' }, button(`${nameOf(ctx, g.turn)} の番を飛ばす`, () => ctx.send('skip'), 'ghost small')) : null);
    },
  });
})();

// ================= ロシアンわさび寿司 =================
(() => {
  const NETA = ['🍣', '🍤', '🍙', '🥟', '🍥', '🍱', '🍘', '🥚', '🐟', '🦐', '🦑', '🐙'];
  const view = { seen: null };
  function newRound(ctx, g, round, first) {
    const n = g.plates;
    const wasabi = shuffle(Array.from({ length: n }, (_, i) => i)).slice(0, g.wasabi);
    return { game: { ...g, phase: 'play', round, turn: first, eaten: null, hitBy: null, nextAt: null, neta: shuffle(NETA).slice(0, n) }, private: { wasabi } };
  }
  function newGame(ctx) {
    const order = shuffle(ctx.players.map((p) => p.id));
    const s = ctx.settings;
    return newRound(ctx, { players: order, order, miss: zero(order), rounds: Number(s.rounds) || 5, plates: 10, wasabi: Number(s.wasabi) || 1 }, 1, order[0]);
  }
  reg({
    id: 'sushi', name: 'ロシアンわさび寿司', icon: '🍣',
    description: '順番にお寿司を1皿ずつ食べる。わさびたっぷりの1皿に当たったら負け！',
    defaultSettings: () => ({ rounds: 5, wasabi: 1 }),
    validate: (ctx) => playerCountError(ctx, 2),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 5, wasabi: 1, ...ctx.settings };
      return h('div', { class: 'settings' }, roundsRow(s, set, editable, 'ラウンド数', 1, 10),
        h('div', { class: 'row col' }, h('span', { class: 'row-label' }, 'わさび入り'), segmented([{ value: 1, label: '1皿' }, { value: 2, label: '2皿' }], Number(s.wasabi), (wasabi) => set({ wasabi }), editable)),
        note('10皿の中にわさび入りがまざっている。当たった人に失点+1、その人から次のラウンド。失点が少ない人の勝ち。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'skip' && a.from === ctx.hostId && g.phase === 'play') return { game: { ...g, turn: nextOf(g.order, g.turn) } };
      if (a.type !== 'eat' || g.phase !== 'play' || a.from !== g.turn) return null;
      const i = Number(a.i);
      const eaten = g.eaten || {};
      if (!(i >= 0 && i < g.plates) || eaten[i]) return null;
      const wasabi = (ctx.private || {}).wasabi || [];
      if (wasabi.includes(i)) {
        const miss = { ...g.miss, [a.from]: (g.miss[a.from] || 0) + 1 };
        return { game: { ...g, eaten: { ...eaten, [i]: a.from }, phase: 'hit', hitBy: a.from, hitAt: i, miss, wasabiAt: wasabi, nextAt: ctx.now() + 3000 } };
      }
      return { game: { ...g, eaten: { ...eaten, [i]: a.from }, turn: nextOf(g.order, a.from) } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'hit' || ctx.now() < g.nextAt) return null;
      return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1, g.hitBy);
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { scores: g.miss, lowerBetter: true, crown: '🍣', topLabel: 'わさびをよけた人', format: (v) => '😭×' + v });
      const key = g.round + ':' + Object.keys(g.eaten || {}).length + g.phase;
      if (view.seen !== key) { view.seen = key; if (g.phase === 'hit') { beep(140, 0.6, 'sawtooth', 0.12, 60); if (g.hitBy === ctx.me) buzz([200, 80, 200]); } else beep(800, 0.06, 'triangle', 0.06); }
      const mine = g.phase === 'play' && g.turn === ctx.me;
      const eaten = g.eaten || {};
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        h('div', { class: 'card center' + (g.phase === 'hit' ? ' su-hit' : '') }, g.phase === 'hit' ? h('div', { class: 'su-big pop' }, `🔥 ${nameOf(ctx, g.hitBy)} がわさびを食べた！`) : mine ? 'あなたの番！1皿えらんで食べて' : `${nameOf(ctx, g.turn)} の番…`),
        h('div', { class: 'su-lane' }, Array.from({ length: g.plates }, (_, i) => {
          const isW = g.phase === 'hit' && (g.wasabiAt || []).includes(i);
          return h('button', { type: 'button', class: 'su-plate' + (eaten[i] ? ' eaten' : '') + (isW ? ' wasabi' : ''), disabled: !mine || !!eaten[i], onclick: () => ctx.send('eat', { i }) },
            h('span', { class: 'su-neta' }, eaten[i] && !isW ? '🍽️' : isW ? '🟢' : (g.neta || [])[i] || '🍣'),
            eaten[i] ? h('span', { class: 'su-who' }, nameOf(ctx, eaten[i])) : null);
        })),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'わさびを食べた回数'), scoreList(ctx, g.players, g.miss, { lowerBetter: true, format: (v) => '😭×' + v, mark: { [g.turn]: 'dc-turn' } })),
        ctx.isHost && !mine && g.phase === 'play' ? h('div', { class: 'host-tools' }, button(`${nameOf(ctx, g.turn)} の番を飛ばす`, () => ctx.send('skip'), 'ghost small')) : null);
    },
  });
})();

// ================= 四目ならべ =================
(() => {
  const W = 7;
  const H = 6;
  const view = { seen: null };
  function winLine(b, i) {
    const p = b[i];
    if (!p) return null;
    const x0 = i % W;
    const y0 = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const line = [i];
      for (const s of [1, -1]) {
        let x = x0 + dx * s;
        let y = y0 + dy * s;
        while (x >= 0 && x < W && y >= 0 && y < H && b[y * W + x] === p) { line.push(y * W + x); x += dx * s; y += dy * s; }
      }
      if (line.length >= 4) return line;
    }
    return null;
  }
  function newMatch(ctx, g, a, b) {
    return { game: { ...g, phase: 'play', p1: a, p2: b, turn: a, board: Array(W * H).fill(0), win: null, line: null, last: null, match: (g.match || 0) + 1 } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newMatch(ctx, { players, queue: players.slice(2), scores: zero(players) }, players[0], players[1]);
  }
  reg({
    id: 'yonmoku', name: '四目ならべ', icon: '🔴',
    description: '交互にコマを落として、たて・よこ・ななめに4つ並べたら勝ち。3人以上なら勝ち残り戦',
    defaultSettings: () => ({}),
    validate: (ctx) => playerCountError(ctx, 2),
    renderSettings: () => h('div', { class: 'settings' }, note('対戦は2人ずつ。3人以上いるときは、勝った人が残って次の人と対戦します（勝ち残り）。勝ち数で順位。')),
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && a.from === ctx.hostId && g.phase === 'done') {
        const winner = g.win === 'draw' ? g.p2 : g.win;
        const loser = winner === g.p1 ? g.p2 : g.p1;
        const queue = [...(g.queue || [])];
        if (!queue.length) return newMatch(ctx, g, loser, winner);
        const challenger = queue.shift();
        return newMatch(ctx, { ...g, queue: [...queue, loser] }, challenger, winner);
      }
      if (a.type === 'end' && a.from === ctx.hostId) return { game: { ...g, phase: 'over' } };
      if (a.type !== 'drop' || g.phase !== 'play' || a.from !== g.turn) return null;
      const col = Number(a.c);
      if (!(col >= 0 && col < W)) return null;
      const b = [...g.board];
      let i = -1;
      for (let y = H - 1; y >= 0; y--) if (!b[y * W + col]) { i = y * W + col; break; }
      if (i < 0) return null;
      b[i] = a.from === g.p1 ? 1 : 2;
      const line = winLine(b, i);
      if (line) return { game: { ...g, board: b, last: i, phase: 'done', win: a.from, line, scores: { ...g.scores, [a.from]: (g.scores[a.from] || 0) + 1 } } };
      if (b.every((v) => v)) return { game: { ...g, board: b, last: i, phase: 'done', win: 'draw' } };
      return { game: { ...g, board: b, last: i, turn: a.from === g.p1 ? g.p2 : g.p1 } };
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🔴', topLabel: '四目王', format: (v) => v + '勝' });
      if (view.seen !== g.last + ':' + g.match) { view.seen = g.last + ':' + g.match; beep(g.phase === 'done' ? 1200 : 500, 0.1, 'triangle', 0.08); }
      const mine = g.phase === 'play' && g.turn === ctx.me;
      const b = g.board || [];
      const line = new Set(g.line || []);
      return h('div', { class: 'stack' },
        h('div', { class: 'card center c4-head' },
          h('div', null, h('span', { class: 'c4-p one' }, '🔴 ' + nameOf(ctx, g.p1)), h('span', { class: 'muted' }, ' vs '), h('span', { class: 'c4-p two' }, '🟡 ' + nameOf(ctx, g.p2))),
          h('div', { class: 'c4-msg' }, g.phase === 'done' ? (g.win === 'draw' ? '引き分け！' : `${nameOf(ctx, g.win)} の勝ち！`) : mine ? 'あなたの番！列をタップ' : `${nameOf(ctx, g.turn)} の番`)),
        h('div', { class: 'c4-board' }, Array.from({ length: W }, (_, c) => h('button', { type: 'button', class: 'c4-col', disabled: !mine, onclick: () => ctx.send('drop', { c }) },
          Array.from({ length: H }, (_, y) => { const i = y * W + c; return h('span', { class: 'c4-cell' + (b[i] === 1 ? ' one' : b[i] === 2 ? ' two' : '') + (line.has(i) ? ' line' : '') + (g.last === i ? ' last' : '') }); })))),
        (g.queue || []).length ? h('p', { class: 'center muted small', style: 'margin:0' }, '次の挑戦者：' + g.queue.map((id) => nameOf(ctx, id)).join(' → ')) : null,
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '勝ち数'), scoreList(ctx, g.players, g.scores, { format: (v) => v + '勝' })),
        ctx.isHost && g.phase === 'done' ? h('div', { class: 'actions' }, button('次の対戦へ', () => ctx.send('next'), 'primary big'), button('ここで終わって結果発表', () => ctx.send('end'), 'ghost small')) : null);
    },
  });
})();

// ================= ブラックジャック =================
(() => {
  const SUIT = ['♠', '♥', '♦', '♣'];
  const RANK = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const view = { seen: null };
  const val = (cards) => {
    let t = 0;
    let aces = 0;
    for (const c of cards || []) { const r = c % 13; if (r === 0) { aces++; t += 11; } else t += Math.min(10, r + 1); }
    while (t > 21 && aces) { t -= 10; aces--; }
    return t;
  };
  const cardEl = (c, hidden) => (hidden ? h('span', { class: 'bj-c back' }, '？') : h('span', { class: 'bj-c' + ([1, 2].includes(Math.floor(c / 13)) ? ' red' : '') }, SUIT[Math.floor(c / 13)] + RANK[c % 13]));
  function newRound(ctx, g, round) {
    const deck = shuffle(Array.from({ length: 52 * 2 }, (_, i) => i % 52));
    const hands = {};
    const st = {};
    g.players.forEach((id) => { hands[id] = [deck.pop(), deck.pop()]; st[id] = val(hands[id]) === 21 ? 'bj' : 'play'; });
    const dealer = [deck.pop(), deck.pop()];
    return { game: { ...g, phase: 'play', round, hands, st, dealer: [dealer[0]], endAt: ctx.now() + 40000, res: null, gain: null }, private: { deck, hole: dealer[1] } };
  }
  function finish(ctx, g) {
    const pv = ctx.private || {};
    const deck = [...(pv.deck || [])];
    const dealer = [...g.dealer, pv.hole];
    while (val(dealer) < 17) dealer.push(deck.pop());
    const dv = val(dealer);
    const res = {};
    const gain = {};
    const scores = { ...g.scores };
    g.players.forEach((id) => {
      const v = val(g.hands[id]);
      let r;
      if (v > 21) r = 'bust';
      else if (g.st[id] === 'bj' && !(dealer.length === 2 && dv === 21)) r = 'bj';
      else if (dv > 21 || v > dv) r = 'win';
      else if (v === dv) r = 'push';
      else r = 'lose';
      res[id] = r;
      gain[id] = { bj: 3, win: 2, push: 1, lose: 0, bust: 0 }[r];
      scores[id] = (scores[id] || 0) + gain[id];
    });
    return { game: { ...g, phase: 'result', dealer, res, gain, scores }, private: null };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 5 }, 1);
  }
  const allDone = (g) => g.players.every((id) => g.st[id] !== 'play');
  reg({
    id: 'blackjack', name: 'ブラックジャック', icon: '♠️',
    description: '全員がディーラーと同時に勝負。21に近づけて、こえたらバースト！',
    defaultSettings: () => ({ rounds: 5 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 5, ...ctx.settings };
      return h('div', { class: 'settings' }, roundsRow(s, set, editable, 'ラウンド数', 1, 10), note('勝ち+2点・引き分け+1点・ブラックジャック（最初の2枚で21）+3点。ディーラーは17以上になるまで引きます。1ラウンド40秒。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && a.from === ctx.hostId && g.phase === 'result') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (g.phase !== 'play' || !g.players.includes(a.from) || g.st[a.from] !== 'play') return null;
      let ng;
      let pv = ctx.private || {};
      if (a.type === 'hit') {
        const deck = [...(pv.deck || [])];
        const hand = [...g.hands[a.from], deck.pop()];
        const v = val(hand);
        ng = { ...g, hands: { ...g.hands, [a.from]: hand }, st: { ...g.st, [a.from]: v > 21 ? 'bust' : v === 21 ? 'stand' : 'play' } };
        pv = { ...pv, deck };
      } else if (a.type === 'stand') {
        ng = { ...g, st: { ...g.st, [a.from]: 'stand' } };
      } else return null;
      if (allDone(ng)) return finish({ ...ctx, private: pv }, ng);
      return { game: ng, private: pv };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'play') return null;
      if (ctx.now() >= g.endAt || allDone(g)) return finish(ctx, { ...g, st: Object.fromEntries(g.players.map((id) => [id, g.st[id] === 'play' ? 'stand' : g.st[id]])) });
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '♠️', topLabel: 'カジノ王' });
      if (view.seen !== g.round + g.phase) { view.seen = g.round + g.phase; beep(700, 0.1, 'triangle', 0.08); }
      const me = ctx.me;
      const my = (g.hands || {})[me];
      const LABEL = { bj: 'ブラックジャック！ +3', win: '勝ち +2', push: '引き分け +1', lose: '負け', bust: 'バースト' };
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        h('div', { class: 'card center' }, h('div', { class: 'muted small' }, 'ディーラー' + (g.phase === 'result' ? `（${val(g.dealer)}）` : '')),
          h('div', { class: 'bj-hand' }, (g.dealer || []).map((c) => cardEl(c)), g.phase === 'play' ? cardEl(0, true) : null)),
        my ? h('div', { class: 'card center bj-me' + (g.phase === 'result' ? ' ' + g.res[me] : '') },
          h('div', { class: 'muted small' }, 'あなた'),
          h('div', { class: 'bj-hand' }, my.map((c) => cardEl(c))),
          h('div', { class: 'bj-val' }, val(my) + (g.st[me] === 'bust' ? ' バースト！' : g.st[me] === 'bj' ? ' ブラックジャック！' : '')),
          g.phase === 'result' ? h('div', { class: 'bj-res pop' }, LABEL[g.res[me]]) : g.st[me] === 'play'
            ? h('div', { class: 'mx-two' }, button('もう1枚（ヒット）', () => ctx.send('hit'), 'primary'), button('これで勝負（スタンド）', () => ctx.send('stand')))
            : h('div', { class: 'muted small' }, 'ほかの人を待っています…')) : null,
        h('div', { class: 'bj-others' }, g.players.filter((id) => id !== me).map((id) => h('div', { class: 'bj-o' },
          h('b', null, nameOf(ctx, id)), h('span', { class: 'bj-hand sm' }, (g.hands[id] || []).map((c) => cardEl(c))),
          h('span', { class: 'muted small' }, g.phase === 'result' ? LABEL[g.res[id]] : g.st[id] === 'play' ? '考え中…' : g.st[id] === 'bust' ? 'バースト' : 'スタンド')))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)),
        ctx.isHost && g.phase === 'result' ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : null);
    },
  });
})();

// ================= 風船わり =================
(() => {
  const view = { seen: null };
  function newRound(ctx, g, round, first) {
    return { game: { ...g, phase: 'play', round, turn: first, air: 0, popBy: null, log: null }, private: { limit: 8 + Math.floor(Math.random() * 18) } };
  }
  function newGame(ctx) {
    const order = shuffle(ctx.players.map((p) => p.id));
    return newRound(ctx, { players: order, order, miss: zero(order), rounds: Number(ctx.settings.rounds) || 5 }, 1, order[0]);
  }
  reg({
    id: 'fusen', name: '風船わり', icon: '🎈',
    description: '順番に風船に空気を1〜3回入れる。風船を割っちゃった人の負け！',
    defaultSettings: () => ({ rounds: 5 }),
    validate: (ctx) => playerCountError(ctx, 2),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 5, ...ctx.settings };
      return h('div', { class: 'settings' }, roundsRow(s, set, editable, 'ラウンド数', 1, 10), note('風船が何回で割れるかはだれにも分かりません（8〜25回）。割った人に失点+1。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'skip' && a.from === ctx.hostId && g.phase === 'play') return { game: { ...g, turn: nextOf(g.order, g.turn) } };
      if (a.type !== 'pump' || g.phase !== 'play' || a.from !== g.turn || ![1, 2, 3].includes(a.k) || a.air !== g.air) return null;
      const limit = (ctx.private || {}).limit;
      const air = g.air + a.k;
      const log = [...(g.log || []), { by: a.from, k: a.k }].slice(-10);
      if (air >= limit) return { game: { ...g, air: limit, log, phase: 'pop', popBy: a.from, miss: { ...g.miss, [a.from]: (g.miss[a.from] || 0) + 1 }, nextAt: ctx.now() + 3000 } };
      return { game: { ...g, air, log, turn: nextOf(g.order, a.from) } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'pop' || ctx.now() < g.nextAt) return null;
      return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1, g.popBy);
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { scores: g.miss, lowerBetter: true, crown: '🎈', topLabel: 'ビビらなかった人', format: (v) => '💥×' + v });
      const key = g.round + ':' + g.air + g.phase;
      if (view.seen !== key) { view.seen = key; if (g.phase === 'pop') { beep(120, 0.6, 'sawtooth', 0.15, 50); if (g.popBy === ctx.me) buzz([250]); } else if (g.air) beep(300 + g.air * 40, 0.12, 'sine', 0.08, 500 + g.air * 40); }
      const mine = g.phase === 'play' && g.turn === ctx.me;
      const size = 60 + g.air * 9;
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        h('div', { class: 'card center fs-stage' },
          g.phase === 'pop' ? h('div', { class: 'fs-pop pop' }, '💥') : h('div', { class: 'fs-balloon', style: `font-size:${size}px` }, '🎈'),
          h('div', { class: 'muted small' }, `空気 ${g.air}回`),
          h('div', { class: 'fs-msg' }, g.phase === 'pop' ? `${nameOf(ctx, g.popBy)} が割った！` : mine ? 'あなたの番！何回入れる？' : `${nameOf(ctx, g.turn)} の番`)),
        mine ? h('div', { class: 'fs-btns' }, [1, 2, 3].map((k) => button(`${k}回`, () => ctx.send('pump', { k, air: g.air }), 'primary big'))) : null,
        h('div', { class: 'card c3-log' }, (g.log || []).length ? [...g.log].reverse().map((l) => h('div', null, h('b', null, nameOf(ctx, l.by)), ` が ${l.k}回`)) : h('span', { class: 'muted small' }, 'まだだれも入れていません')),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '割った回数'), scoreList(ctx, g.players, g.miss, { lowerBetter: true, format: (v) => '💥×' + v, mark: { [g.turn]: 'dc-turn' } })),
        ctx.isHost && !mine && g.phase === 'play' ? h('div', { class: 'host-tools' }, button(`${nameOf(ctx, g.turn)} の番を飛ばす`, () => ctx.send('skip'), 'ghost small')) : null);
    },
  });
})();
})();
