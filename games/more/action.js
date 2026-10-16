// ===== アクションゲーム7種 =====
// チキンレース・陣取り合戦・サイモン記憶・反射神経・色えらび・1→25タッチ・早打ちタイピング
(() => {
const { h, button, stepper, segmented, shuffle, pick, inputBox, drafts, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep, buzz } = window.Party.kit;
const reg = window.Party.register;
const zero = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));
const note = (t) => h('p', { class: 'muted small', style: 'margin:0' }, t);
const roundsRow = (s, set, editable, label = 'ラウンド数', min = 1, max = 10) => h('div', { class: 'row' }, h('span', { class: 'row-label' }, label), stepper(Number(s.rounds), min, max, (rounds) => set({ rounds }), editable));
// 時間の早い順に 3・2・1 点
function rankGain(ids, timeOf) {
  const ok = ids.filter((id) => timeOf(id) != null).sort((a, b) => timeOf(a) - timeOf(b));
  const gain = zero(ids);
  ok.forEach((id, i) => { gain[id] = i === 0 ? 3 : i === 1 ? 2 : 1; });
  return gain;
}
const addScores = (scores, gain) => Object.fromEntries(Object.keys(scores).map((id) => [id, (scores[id] || 0) + (gain[id] || 0)]));
const ticker = (fn) => setInterval(fn, 50);

// ================= チキンレース =================
(() => {
  const view = { round: null, out: null, now: null, g: null, send: null, seenCrash: null };
  const mult = (ms) => { const t = ms / 1000; return 1 + 0.1 * t + 0.02 * t * t; };
  const msOf = (m) => ((-0.1 + Math.sqrt(0.01 + 0.08 * (m - 1))) / 0.04) * 1000;
  function newRound(ctx, g, round) {
    const u = Math.random();
    const crash = Math.min(20, Math.max(1.05, 0.97 / (1 - u)));
    return { game: { ...g, phase: 'run', round, startAt: ctx.now() + 3000, outs: null, crash: null, gain: null }, private: { crashMs: msOf(crash), crash } };
  }
  function finish(ctx, g) {
    const pv = ctx.private || {};
    const outs = g.outs || {};
    const gain = Object.fromEntries(g.players.map((id) => [id, outs[id] ? Math.round(mult(outs[id]) * 10) / 10 : 0]));
    return { game: { ...g, phase: 'crash', crash: Math.round(pv.crash * 100) / 100, gain, scores: addScores(g.scores, gain), nextAt: ctx.now() + 4000 }, private: null };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 5 }, 1);
  }
  function doOut() {
    const g = view.g;
    if (!g || g.phase !== 'run' || view.out) return;
    const ms = view.now() - g.startAt;
    if (ms <= 0) return;
    view.out = ms;
    beep(1200, 0.1, 'triangle', 0.1);
    view.send('out', { ms, round: g.round });
  }
  reg({
    id: 'chicken', name: 'チキンレース', icon: '🐔',
    description: 'どんどん上がる倍率。爆発する前に「降りる」を押せばその倍率が得点。欲ばりすぎると0点！',
    defaultSettings: () => ({ rounds: 5 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) { const s = { rounds: 5, ...ctx.settings }; return h('div', { class: 'settings' }, roundsRow(s, set, editable), note('倍率は1.0倍から上がっていき、いつか爆発します（すぐのこともあれば、10倍をこえることも）。降りたときの倍率が得点。')); },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type !== 'out' || g.phase !== 'run' || a.round !== g.round || !g.players.includes(a.from) || (g.outs || {})[a.from]) return null;
      const ms = Number(a.ms);
      const pv = ctx.private || {};
      if (!(ms > 0) || ms >= pv.crashMs) return null;
      const ng = { ...g, outs: { ...(g.outs || {}), [a.from]: ms } };
      return activeIds(ctx, g.players).every((id) => ng.outs[id]) ? finish(ctx, ng) : { game: ng };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g) return null;
      const now = ctx.now();
      if (g.phase === 'run' && now >= g.startAt + ((ctx.private || {}).crashMs || 0)) return finish(ctx, g);
      if (g.phase === 'crash' && now >= g.nextAt) return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      Object.assign(view, { now: ctx.now, g, send: ctx.send });
      if (g.phase === 'over') return overView(ctx, g, { crown: '🐔', topLabel: '度胸No.1', format: (v) => Number(v).toFixed(1) + '点' });
      if (view.round !== g.round) { view.round = g.round; view.out = null; }
      if (g.phase === 'crash' && view.seenCrash !== g.round) { view.seenCrash = g.round; beep(120, 0.7, 'sawtooth', 0.15, 50); if (!(g.outs || {})[ctx.me]) buzz([200, 80, 200]); }
      const outs = g.outs || {};
      const myOut = outs[ctx.me] || view.out;
      const playing = g.players.includes(ctx.me);
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        h('div', { class: 'card center ck-stage' + (g.phase === 'crash' ? ' boom' : '') },
          g.phase === 'crash' ? [h('div', { class: 'ck-boom pop' }, '💥'), h('div', { class: 'ck-m' }, `${g.crash.toFixed(2)}倍で爆発！`)]
            : [h('div', { class: 'ck-m', 'data-ck': '1' }, '1.00×'), h('div', { class: 'muted small' }, '倍率がどんどん上がる…')]),
        playing && g.phase === 'run' ? (myOut
          ? h('div', { class: 'card center ck-safe' }, `${mult(myOut).toFixed(2)}倍で降りた！`)
          : h('button', { type: 'button', class: 'pt-btn ck-btn', onpointerdown: (e) => { e.preventDefault(); doOut(); } }, '降りる！')) : null,
        h('div', { class: 'mx-list' }, g.players.map((id) => h('div', { class: 'mx-r' + (outs[id] ? ' win' : g.phase === 'crash' ? ' ng' : '') },
          h('span', null, nameOf(ctx, id)), h('b', null, outs[id] ? mult(outs[id]).toFixed(2) + '×' : g.phase === 'crash' ? '爆発…' : '乗ってる'),
          g.phase === 'crash' ? h('span', { class: 'kb-plus' }, '+' + (g.gain[id] || 0)) : null))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { format: (v) => Number(v).toFixed(1) + '点' })));
    },
  });
  ticker(() => {
    const el = document.querySelector('[data-ck]');
    const g = view.g;
    if (!el || !g || !view.now) return;
    const t = view.now() - g.startAt;
    const txt = t < 0 ? `${Math.ceil(-t / 1000)}` : mult(t).toFixed(2) + '×';
    if (el.textContent !== txt) el.textContent = txt;
    el.style.color = t > 0 ? `hsl(${Math.max(0, 50 - (mult(t) - 1) * 8)}, 90%, 60%)` : '';
  });
})();

// ================= 陣取り合戦 =================
(() => {
  const N = 8;
  const COLORS = ['#e5484d', '#2f6fde', '#22a35a', '#f59e0b', '#8e4ec6', '#ec4899', '#14b8a6', '#a3a3a3'];
  const view = { pend: [], timer: null, send: null, g: null, now: null, me: null };
  const adj = (i) => { const x = i % N; const y = Math.floor(i / N); return [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]].filter(([a, b]) => a >= 0 && a < N && b >= 0 && b < N).map(([a, b]) => b * N + a); };
  function newRound(ctx, g, round) {
    const starts = shuffle(Array.from({ length: N * N }, (_, i) => i)).slice(0, g.players.length);
    const cells = {};
    g.players.forEach((id, k) => { cells[starts[k]] = id; });
    const now = ctx.now();
    view.pend = [];
    return { game: { ...g, phase: 'play', round, cells, startAt: now + 3000, endAt: now + 3000 + g.secs * 1000, gain: null } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    const color = Object.fromEntries(players.map((id, i) => [id, COLORS[i % COLORS.length]]));
    return newRound(ctx, { players, color, scores: zero(players), rounds: Number(ctx.settings.rounds) || 3, secs: Number(ctx.settings.secs) || 20 }, 1);
  }
  const count = (cells, id) => Object.values(cells || {}).filter((v) => v === id).length;
  function claim(i) {
    const g = view.g;
    if (!g || g.phase !== 'play' || view.now() < g.startAt) return;
    const cells = g.cells || {};
    if (cells[i] === view.me || view.pend.includes(i)) return;
    const mineOrPend = (j) => cells[j] === view.me || view.pend.includes(j);
    if (!adj(i).some(mineOrPend)) { beep(200, 0.05, 'square', 0.04); return; }
    view.pend.push(i);
    beep(900, 0.03, 'square', 0.04);
    const el = document.querySelectorAll('.jt-cell')[i];
    if (el) el.classList.add('pend');
    if (!view.timer) {
      view.timer = setTimeout(() => {
        view.timer = null;
        const list = view.pend.splice(0);
        if (list.length && view.g) view.send('claim', { cells: list, round: view.g.round });
      }, 150);
    }
  }
  reg({
    id: 'jintori', name: '陣取り合戦', icon: '🟥',
    description: '自分の陣地のとなりのマスをタップして広げていく。相手の陣地もうばえる！',
    defaultSettings: () => ({ rounds: 3, secs: 20 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 3, secs: 20, ...ctx.settings };
      return h('div', { class: 'settings' }, roundsRow(s, set, editable),
        h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '時間'), segmented([{ value: 15, label: '15秒' }, { value: 20, label: '20秒' }, { value: 30, label: '30秒' }], Number(s.secs), (secs) => set({ secs }), editable)),
        note('タップできるのは自分の色のマスのとなりだけ。終了時のマスの数が得点。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && a.from === ctx.hostId && g.phase === 'result') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (a.type !== 'claim' || g.phase !== 'play' || a.round !== g.round || !g.players.includes(a.from)) return null;
      const now = ctx.now();
      if (now < g.startAt - 300 || now > g.endAt + 500) return null;
      const cells = { ...(g.cells || {}) };
      let changed = false;
      for (const i of (a.cells || []).slice(0, 12)) {
        if (!(i >= 0 && i < N * N) || cells[i] === a.from) continue;
        if (!adj(i).some((j) => cells[j] === a.from)) continue;
        cells[i] = a.from;
        changed = true;
      }
      return changed ? { game: { ...g, cells } } : null;
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'play' || ctx.now() < g.endAt + 700) return null;
      const gain = Object.fromEntries(g.players.map((id) => [id, count(g.cells, id)]));
      return { game: { ...g, phase: 'result', gain, scores: addScores(g.scores, gain) } };
    },
    render(ctx) {
      const g = ctx.game;
      Object.assign(view, { send: ctx.send, g, now: ctx.now, me: ctx.me });
      if (g.phase === 'over') return overView(ctx, g, { crown: '🟥', topLabel: '陣取り王', format: (v) => v + 'マス' });
      const cells = g.cells || {};
      view.pend = view.pend.filter((i) => cells[i] !== ctx.me);
      const pend = new Set(view.pend);
      const t = ctx.now();
      if (g.phase === 'play' && t < g.startAt) setTimeout(ctx.rerender, Math.max(50, g.startAt - t + 20));
      const live = g.phase === 'play' && t >= g.startAt;
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`), g.phase === 'play' ? h('span', { class: 'qz-time', 'data-jt': '1' }, '') : h('span', { class: 'muted small' }, '終了！')),
        h('div', { class: 'jt-grid', style: `grid-template-columns:repeat(${N},1fr)` }, Array.from({ length: N * N }, (_, i) => {
          const o = cells[i];
          return h('button', { type: 'button', class: 'jt-cell' + (pend.has(i) ? ' pend' : '') + (o === ctx.me ? ' mine' : ''), style: o ? `background:${g.color[o]}` : '', disabled: !live,
            onpointerdown: (e) => { e.preventDefault(); claim(i); } });
        })),
        h('div', { class: 'jt-legend' }, g.players.map((id) => h('span', { class: 'jt-l' }, h('i', { style: `background:${g.color[id]}` }), `${nameOf(ctx, id)} ${count(cells, id)}`))),
        g.phase === 'result' ? h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { format: (v) => v + 'マス', extra: (id) => h('span', { class: 'kb-plus' }, '+' + (g.gain[id] || 0)) })) : null,
        ctx.isHost && g.phase === 'result' ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : null);
    },
  });
  ticker(() => {
    const el = document.querySelector('[data-jt]');
    const g = view.g;
    if (!el || !g || !view.now) return;
    const t = view.now();
    const txt = t < g.startAt ? `${Math.ceil((g.startAt - t) / 1000)}…` : `⏱ ${Math.max(0, (g.endAt - t) / 1000).toFixed(1)}`;
    if (el.textContent !== txt) el.textContent = txt;
  });
})();

// ================= サイモン記憶 =================
(() => {
  const PADS = ['#e5484d', '#2f6fde', '#22a35a', '#f5c400'];
  const TONES = [330, 440, 554, 660];
  const STEP = 650;
  const view = { lvl: null, input: [], sent: false, now: null, g: null, played: {} };
  function newLevel(ctx, g, lvl, alive) {
    const seq = [...(g.seq || []), Math.floor(Math.random() * 4)];
    const showAt = ctx.now() + 1800;
    return { game: { ...g, phase: 'show', lvl, seq, alive, showAt, inputUntil: showAt + seq.length * STEP + 4000 + seq.length * 900, done: null }, private: { res: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newLevel(ctx, { players, seq: [], best: zero(players), outAt: {} }, 1, players);
  }
  function judge(ctx, g, resIn) {
    const res = { ...(resIn || {}) };
    const alive = g.alive.filter((id) => res[id] === 1);
    const best = { ...g.best };
    alive.forEach((id) => { best[id] = g.lvl; });
    const outAt = { ...(g.outAt || {}) };
    g.alive.filter((id) => !alive.includes(id)).forEach((id) => { outAt[id] = g.lvl; });
    const ng = { ...g, best, outAt };
    if (!alive.length || (alive.length === 1 && g.players.length > 1)) return { game: { ...ng, phase: 'over', scores: best }, private: null };
    return newLevel(ctx, ng, g.lvl + 1, alive);
  }
  function flash(i, ms) {
    const el = document.querySelector(`[data-pad="${i}"]`);
    if (el) { el.classList.add('lit'); setTimeout(() => el.classList.remove('lit'), ms); }
  }
  reg({
    id: 'simon', name: 'サイモン記憶', icon: '🟩',
    description: '光った色の順番をおぼえて、同じ順にタップ。1回ごとに1つずつ長くなる。まちがえたら脱落',
    defaultSettings: () => ({}),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings: () => h('div', { class: 'settings' }, note('全員同時に同じ順番を見て、自分のスマホで入力します。最後まで残った人の勝ち（1人なら行けるところまで）。')),
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type !== 'input' || g.phase !== 'show' || a.lvl !== g.lvl || !g.alive.includes(a.from)) return null;
      const pv = ctx.private || {};
      if ((pv.res || {})[a.from] != null) return null;
      const ok = Array.isArray(a.seq) && a.seq.length === g.seq.length && a.seq.every((v, i) => v === g.seq[i]) ? 1 : 0;
      const res = { ...(pv.res || {}), [a.from]: ok };
      if (activeIds(ctx, g.alive).every((id) => res[id] != null)) return judge(ctx, g, res);
      return { game: { ...g, done: { ...(g.done || {}), [a.from]: true } }, private: { res } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'show' || ctx.now() < g.inputUntil) return null;
      return judge(ctx, g, (ctx.private || {}).res);
    },
    render(ctx) {
      const g = ctx.game;
      Object.assign(view, { now: ctx.now, g });
      if (g.phase === 'over') {
        return overView(ctx, g, { crown: '🟩', topLabel: '記憶力チャンピオン', format: (v) => `レベル${v}`, sub: `最高レベル ${Math.max(0, ...Object.values(g.best || {}))}` });
      }
      if (view.lvl !== g.lvl) { view.lvl = g.lvl; view.input = []; view.sent = false; view.played = {}; }
      const alive = g.alive.includes(ctx.me);
      const t = ctx.now();
      const showEnd = g.showAt + g.seq.length * STEP;
      const canInput = alive && t >= showEnd && !view.sent;
      if (t < showEnd + 50) setTimeout(ctx.rerender, Math.max(30, Math.min(STEP, showEnd - t + 30)));
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `レベル ${g.lvl}（${g.seq.length}個）`), h('span', { class: 'qz-time', 'data-sm': '1' }, '')),
        h('div', { class: 'card center' }, t < g.showAt ? 'よーく見て…' : t < showEnd ? '覚えて！' : !alive ? '脱落… 観戦中' : view.sent ? `入力完了！ほかの人を待っています` : `同じ順にタップ！（${view.input.length} / ${g.seq.length}）`),
        h('div', { class: 'sm-pads' }, PADS.map((c, i) => h('button', {
          type: 'button', class: 'sm-pad', style: `background:${c}`, disabled: !canInput, 'data-pad': i,
          onpointerdown: (e) => {
            e.preventDefault();
            if (!canInput) return;
            beep(TONES[i], 0.15, 'triangle', 0.1);
            flash(i, 250);
            view.input.push(i);
            const k = view.input.length - 1;
            if (view.input[k] !== g.seq[k] || view.input.length === g.seq.length) {
              view.sent = true;
              ctx.send('input', { lvl: g.lvl, seq: view.input });
              if (view.input[k] !== g.seq[k]) buzz([150, 50, 150]);
            }
            ctx.rerender();
          },
        }))),
        h('div', { class: 'chips kit-done' }, g.players.map((id) => h('span', { class: 'chip' + (g.alive.includes(id) ? ' on' : '') }, (g.alive.includes(id) ? '' : '× ') + nameOf(ctx, id) + ` Lv${(g.best || {})[id] || 0}`))));
    },
  });
  ticker(() => {
    const g = view.g;
    if (!g || g.phase !== 'show' || !view.now) return;
    const t = view.now() - g.showAt;
    const k = Math.floor(t / STEP);
    if (t >= 0 && k < g.seq.length && (t % STEP) < STEP * 0.6 && !view.played[k]) {
      view.played[k] = true;
      beep(TONES[g.seq[k]], 0.3, 'triangle', 0.1);
      flash(g.seq[k], STEP * 0.55);
    }
    const el = document.querySelector('[data-sm]');
    if (el) { const txt = `⏱ ${Math.ceil(Math.max(0, g.inputUntil - view.now()) / 1000)}`; if (el.textContent !== txt) el.textContent = txt; }
  });
})();

// ================= 反射神経 =================
(() => {
  const view = { round: null, tap: null, now: null, g: null, send: null, beeped: null };
  function newRound(ctx, g, round) {
    const goAt = ctx.now() + 2500 + Math.round(Math.random() * 4000);
    return { game: { ...g, phase: 'wait', round, goAt, res: null, gain: null, done: null }, private: { res: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 5 }, 1);
  }
  function finish(ctx, g, resIn) {
    const res = { ...(resIn || {}) };
    const gain = rankGain(g.players, (id) => (res[id] != null && res[id] >= 0 ? res[id] : null));
    g.players.forEach((id) => { if (res[id] === -1) gain[id] = -1; });
    return { game: { ...g, phase: 'result', res, gain, scores: addScores(g.scores, gain), nextAt: ctx.now() + 3500 }, private: null };
  }
  function tap() {
    const g = view.g;
    if (!g || g.phase !== 'wait' || view.tap != null) return;
    const ms = view.now() - g.goAt;
    view.tap = ms < 0 ? -1 : Math.round(ms);
    if (ms < 0) buzz([150, 50, 150]); else beep(1300, 0.08, 'square', 0.06);
    view.send('tap', { ms: view.tap, round: g.round });
    const el = document.querySelector('[data-hn]');
    if (el) el.textContent = view.tap < 0 ? 'フライング！' : `${view.tap}ms`;
  }
  reg({
    id: 'hanno', name: '反射神経', icon: '⚡',
    description: '画面が緑になった瞬間にタップ！一番速い人の勝ち。早すぎるとフライングで減点',
    defaultSettings: () => ({ rounds: 5 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) { const s = { rounds: 5, ...ctx.settings }; return h('div', { class: 'settings' }, roundsRow(s, set, editable), note('速い順に3・2・1点。緑になる前に押すとフライング（−1点）。')); },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type !== 'tap' || g.phase !== 'wait' || a.round !== g.round || !g.players.includes(a.from)) return null;
      const pv = ctx.private || {};
      if ((pv.res || {})[a.from] != null) return null;
      const ms = Number(a.ms);
      const res = { ...(pv.res || {}), [a.from]: ms < 0 ? -1 : Math.max(0, Math.round(ms)) };
      const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
      if (activeIds(ctx, g.players).every((id) => res[id] != null)) return finish(ctx, ng, res);
      return { game: ng, private: { res } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g) return null;
      const now = ctx.now();
      if (g.phase === 'wait' && now >= g.goAt + 3000) return finish(ctx, g, (ctx.private || {}).res);
      if (g.phase === 'result' && now >= g.nextAt) return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      Object.assign(view, { now: ctx.now, g, send: ctx.send });
      if (g.phase === 'over') return overView(ctx, g, { crown: '⚡', topLabel: '反射神経No.1' });
      if (view.round !== g.round) { view.round = g.round; view.tap = null; view.beeped = null; }
      const res = g.res || {};
      const mine = view.tap;
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
        g.phase === 'wait' && g.players.includes(ctx.me)
          ? h('button', { type: 'button', class: 'hn-pad', 'data-hn': '1', onpointerdown: (e) => { e.preventDefault(); tap(); } }, mine == null ? 'まだ…' : mine < 0 ? 'フライング！' : `${mine}ms`)
          : g.phase === 'wait' ? h('div', { class: 'hn-pad', 'data-hn': '1' }, '観戦中')
            : h('div', { class: 'mx-list pop' }, g.players.map((id) => h('div', { class: 'mx-r' + (g.gain[id] > 0 ? ' win' : g.gain[id] < 0 ? ' ng' : '') },
              h('span', null, nameOf(ctx, id)), h('b', null, res[id] == null ? '－' : res[id] < 0 ? 'フライング' : `${res[id]}ms`), h('span', { class: 'kb-plus' }, (g.gain[id] > 0 ? '+' : '') + g.gain[id])))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)));
    },
  });
  ticker(() => {
    const el = document.querySelector('[data-hn]');
    const g = view.g;
    if (!el || !g || g.phase !== 'wait' || !view.now) return;
    const go = view.now() >= g.goAt;
    el.classList.toggle('go', go && view.tap == null);
    el.classList.toggle('done', view.tap != null);
    if (go && view.tap == null && el.textContent !== 'タップ！') { el.textContent = 'タップ！'; if (view.beeped !== g.round) { view.beeped = g.round; beep(1000, 0.1, 'square', 0.06); } }
  });
})();

// ================= 色えらび（ストループ） =================
(() => {
  const COLS = [['あか', '#e5484d'], ['あお', '#2f6fde'], ['みどり', '#22a35a'], ['きいろ', '#f5c400']];
  const view = { seen: null };
  function newQ(ctx, g, qn) {
    const w = Math.floor(Math.random() * 4);
    let c = Math.floor(Math.random() * 4);
    if (Math.random() < 0.8) while (c === w) c = Math.floor(Math.random() * 4);
    const mode = Math.random() < 0.7 ? 'ink' : 'word';
    const now = ctx.now();
    return { game: { ...g, phase: 'q', qn, w, c, mode, order: shuffle([0, 1, 2, 3]), startAt: now + 1000, endAt: now + 7000, out: null, winner: null } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newQ(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 12 }, 1);
  }
  const answer = (g) => (g.mode === 'ink' ? g.c : g.w);
  reg({
    id: 'stroop', name: '色えらび', icon: '🎨',
    description: '「あか」と青い文字で書いてある！文字の色？書いてある色？指示どおりの色を一番早くタップ',
    defaultSettings: () => ({ rounds: 12 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) { const s = { rounds: 12, ...ctx.settings }; return h('div', { class: 'settings' }, roundsRow(s, set, editable, '問題数', 5, 30), note('一番早く正しい色を押した人に+1点。まちがえたらその問題はおやすみ。')); },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type !== 'pick' || g.phase !== 'q' || a.qn !== g.qn || !g.players.includes(a.from) || (g.out || {})[a.from]) return null;
      if (a.i === answer(g)) return { game: { ...g, phase: 'won', winner: a.from, scores: { ...g.scores, [a.from]: (g.scores[a.from] || 0) + 1 }, nextAt: ctx.now() + 1500 } };
      const out = { ...(g.out || {}), [a.from]: true };
      return { game: { ...g, out, ...(g.players.every((id) => out[id]) ? { phase: 'won', winner: null, nextAt: ctx.now() + 1500 } : {}) } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g) return null;
      const now = ctx.now();
      if (g.phase === 'q' && now >= g.endAt) return { game: { ...g, phase: 'won', winner: null, nextAt: now + 1500 } };
      if (g.phase === 'won' && now >= g.nextAt) return g.qn >= g.rounds ? { game: { ...g, phase: 'over' } } : newQ(ctx, g, g.qn + 1);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🎨', topLabel: 'まどわされなかった人' });
      if (g.phase === 'won' && view.seen !== g.qn) { view.seen = g.qn; if (g.winner === ctx.me) beep(1200, 0.12, 'triangle', 0.1); }
      const ready = ctx.now() >= g.startAt;
      if (!ready) setTimeout(ctx.rerender, Math.max(30, g.startAt - ctx.now() + 20));
      const out = (g.out || {})[ctx.me];
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `第${g.qn}問 / ${g.rounds}`), h('span', { class: 'muted small' }, g.phase === 'won' ? (g.winner ? `${nameOf(ctx, g.winner)} が正解！` : 'だれも正解できず') : out ? 'おやすみ中' : '')),
        h('div', { class: 'card center sr-q' },
          h('div', { class: 'sr-mode ' + g.mode }, g.mode === 'ink' ? '文字の「色」をタップ' : '書いてある「言葉」の色をタップ'),
          ready ? h('div', { class: 'sr-word', style: `color:${COLS[g.c][1]}` }, COLS[g.w][0]) : h('div', { class: 'sr-word muted' }, '…')),
        h('div', { class: 'sr-btns' }, g.order.map((i) => h('button', {
          type: 'button', class: 'sr-b' + (g.phase === 'won' && i === answer(g) ? ' ok' : ''), style: `background:${COLS[i][1]}`, disabled: !ready || g.phase !== 'q' || out || !g.players.includes(ctx.me),
          onclick: () => ctx.send('pick', { i, qn: g.qn }),
        }, COLS[i][0]))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)));
    },
  });
})();

// ================= 1→25タッチ =================
(() => {
  const view = { round: null, next: 1, pen: 0, done: null, now: null, g: null, send: null };
  function newRound(ctx, g, round) {
    return { game: { ...g, phase: 'play', round, grid: shuffle(Array.from({ length: 25 }, (_, i) => i + 1)), startAt: ctx.now() + 3000, res: null, gain: null, done: null }, private: { res: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 3 }, 1);
  }
  function finish(ctx, g, resIn) {
    const res = { ...(resIn || {}) };
    const gain = rankGain(g.players, (id) => res[id]);
    return { game: { ...g, phase: 'result', res, gain, scores: addScores(g.scores, gain) }, private: null };
  }
  function touch(n, el) {
    const g = view.g;
    if (!g || view.done) return;
    if (n !== view.next) { view.pen += 1000; beep(200, 0.08, 'square', 0.05); return; }
    beep(500 + n * 30, 0.04, 'triangle', 0.06);
    if (el) el.classList.add('got');
    view.next++;
    const nx = document.querySelector('.t25-next');
    if (view.next > 25) {
      view.done = Math.round(view.now() - g.startAt + view.pen);
      view.send('done', { ms: view.done, round: g.round });
      buzz(60);
      if (nx) nx.textContent = `完了！ ${(view.done / 1000).toFixed(2)}秒`;
    } else if (nx) nx.textContent = `次は ${view.next}`;
  }
  reg({
    id: 'touch25', name: '1→25タッチ', icon: '🔢',
    description: 'バラバラに並んだ1〜25を、1から順番にできるだけ速くタップ！',
    defaultSettings: () => ({ rounds: 3 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) { const s = { rounds: 3, ...ctx.settings }; return h('div', { class: 'settings' }, roundsRow(s, set, editable), note('全員同じ並び。まちがえてタップすると+1秒のペナルティ。速い順に3・2・1点。60秒で締め切り。')); },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && a.from === ctx.hostId && g.phase === 'result') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (a.type !== 'done' || g.phase !== 'play' || a.round !== g.round || !g.players.includes(a.from)) return null;
      const pv = ctx.private || {};
      if ((pv.res || {})[a.from] != null) return null;
      const ms = Math.round(Number(a.ms));
      if (!(ms > 1500)) return null;
      const res = { ...(pv.res || {}), [a.from]: ms };
      const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
      if (activeIds(ctx, g.players).every((id) => res[id] != null)) return finish(ctx, ng, res);
      return { game: ng, private: { res } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g || g.phase !== 'play' || ctx.now() < g.startAt + 60000) return null;
      return finish(ctx, g, (ctx.private || {}).res);
    },
    render(ctx) {
      const g = ctx.game;
      Object.assign(view, { now: ctx.now, g, send: ctx.send });
      if (g.phase === 'over') return overView(ctx, g, { crown: '🔢', topLabel: '最速の指' });
      if (view.round !== g.round) Object.assign(view, { round: g.round, next: 1, pen: 0, done: null });
      const t = ctx.now();
      const ready = t >= g.startAt;
      if (!ready) setTimeout(ctx.rerender, Math.max(30, g.startAt - t + 20));
      if (g.phase === 'result') {
        const res = g.res || {};
        return h('div', { class: 'stack' }, h('div', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`),
          h('div', { class: 'mx-list pop' }, g.players.map((id) => h('div', { class: 'mx-r' + (g.gain[id] ? ' win' : '') }, h('span', null, nameOf(ctx, id)), h('b', null, res[id] ? (res[id] / 1000).toFixed(2) + '秒' : '時間切れ'), h('span', { class: 'kb-plus' }, '+' + (g.gain[id] || 0))))),
          h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
          ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
      }
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`), h('span', { class: 'qz-time', 'data-t25': '1' }, '')),
        h('div', { class: 'center t25-next' }, view.done ? `完了！ ${(view.done / 1000).toFixed(2)}秒` : ready ? `次は ${view.next}` : 'よーい…'),
        h('div', { class: 't25-grid' }, g.grid.map((n) => h('button', {
          type: 'button', class: 't25-c' + (n < view.next ? ' got' : ''), disabled: !ready || !!view.done || !g.players.includes(ctx.me), 'data-n': n,
          onpointerdown: (e) => { e.preventDefault(); touch(n, e.currentTarget); },
        }, ready ? n : ''))),
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, 'ゴールした人'), doneChips(ctx, g.players, g.done)));
    },
  });
  ticker(() => {
    const el = document.querySelector('[data-t25]');
    const g = view.g;
    if (!el || !g || !view.now) return;
    const t = view.now() - g.startAt;
    const txt = t < 0 ? `${Math.ceil(-t / 1000)}` : view.done ? '' : `⏱ ${((t + view.pen) / 1000).toFixed(1)}`;
    if (el.textContent !== txt) el.textContent = txt;
  });
})();

// ================= 早打ちタイピング =================
(() => {
  const WORDS = [
    'いちごだいふく', 'かたつむり', 'ちょこれーとぱふぇ', 'じどうはんばいき', 'すまーとふぉん', 'ゆきだるま', 'おこのみやき', 'かいてんずし',
    'しんかんせん', 'ぺんぎんのおやこ', 'とうきょうたわー', 'はなびたいかい', 'ろけっとはっしゃ', 'うちゅうひこうし', 'からあげべんとう', 'たこやきぱーてぃー',
    'ゆうえんち', 'ぷりんあらもーど', 'にんじゃはっとり', 'かぶとむし', 'おばけやしき', 'すいかわり', 'れいぞうこ', 'でんしれんじ',
    'ちきゅうおんだんか', 'てんきよほう', 'あいすくりーむ', 'ほっとけーき', 'じゃんけんぽん', 'ふじさんのぼり',
  ];
  const toHira = (s) => String(s || '').normalize('NFKC').replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/\s/g, '');
  const view = { round: null };
  function newRound(ctx, g, round) {
    const used = new Set(g.used || []);
    let pool = WORDS.map((_, i) => i).filter((i) => !used.has(i));
    if (!pool.length) pool = WORDS.map((_, i) => i);
    const wi = pick(pool);
    return { game: { ...g, phase: 'type', round, word: WORDS[wi], used: [...(g.used || []), wi], startAt: ctx.now() + 2000, res: null, gain: null, done: null }, private: { res: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 8, used: [] }, 1);
  }
  function finish(ctx, g, resIn) {
    const res = { ...(resIn || {}) };
    const gain = rankGain(g.players, (id) => res[id]);
    return { game: { ...g, phase: 'result', res, gain, scores: addScores(g.scores, gain), nextAt: ctx.now() + 3500 }, private: null };
  }
  reg({
    id: 'typing', name: '早打ちタイピング', icon: '⌨️',
    description: '表示されたひらがなの言葉を、だれよりも速く正確に打ちこめ！',
    defaultSettings: () => ({ rounds: 8 }),
    validate: (ctx) => playerCountError(ctx, 1),
    renderSettings(ctx, { editable, set }) { const s = { rounds: 8, ...ctx.settings }; return h('div', { class: 'settings' }, roundsRow(s, set, editable, '問題数', 3, 20), note('ひらがなで入力（カタカナでもOK）。正しく打てた人の中で速い順に3・2・1点。1問30秒。')); },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      if (a.type === 'again' && a.from === ctx.hostId && g.phase === 'over') return newGame(ctx);
      if (a.type !== 'type' || g.phase !== 'type' || a.round !== g.round || !g.players.includes(a.from)) return null;
      if (toHira(a.text) !== g.word) return null;
      const pv = ctx.private || {};
      if ((pv.res || {})[a.from] != null) return null;
      const t = (typeof a.ts === 'number' ? a.ts : ctx.now()) - g.startAt;
      const res = { ...(pv.res || {}), [a.from]: Math.max(1, t) };
      const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
      if (activeIds(ctx, g.players).every((id) => res[id] != null)) return finish(ctx, ng, res);
      return { game: ng, private: { res } };
    },
    tick(ctx) {
      const g = ctx.game;
      if (!g) return null;
      const now = ctx.now();
      if (g.phase === 'type' && now >= g.startAt + 30000) return finish(ctx, g, (ctx.private || {}).res);
      if (g.phase === 'result' && now >= g.nextAt) return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '⌨️', topLabel: 'タイピング王' });
      if (view.round !== g.round) { view.round = g.round; drafts['ty-in'] = ''; }
      const ready = ctx.now() >= g.startAt;
      if (!ready) setTimeout(ctx.rerender, Math.max(30, g.startAt - ctx.now() + 20));
      const done = (g.done || {})[ctx.me];
      const submit = () => {
        const v = drafts['ty-in'] || '';
        if (toHira(v) !== g.word) { toast('まちがいがあるよ'); buzz(60); return; }
        ctx.send('type', { text: v, round: g.round });
        beep(1200, 0.1, 'triangle', 0.08);
      };
      return h('div', { class: 'stack' },
        h('div', { class: 'round-pill' }, `第${g.round}問 / ${g.rounds}`),
        h('div', { class: 'card center ty-word' }, ready || g.phase === 'result' ? g.word : 'よーい…'),
        g.phase === 'type' && g.players.includes(ctx.me) ? (done ? h('p', { class: 'center hb-done' }, '⭕ 正解！') : h('div', { class: 'mx-row' },
          inputBox('ty-in', { placeholder: ready ? 'ここに入力してEnter' : '', disabled: !ready, onEnter: submit, keepFocus: true, enterkeyhint: 'send',
            onInput: (v) => { if (toHira(v) === g.word) submit(); } }),
          button('OK', submit, 'primary'))) : null,
        g.phase === 'result' ? h('div', { class: 'mx-list pop' }, g.players.map((id) => h('div', { class: 'mx-r' + (g.gain[id] ? ' win' : '') },
          h('span', null, nameOf(ctx, id)), h('b', null, (g.res || {})[id] ? (g.res[id] / 1000).toFixed(2) + '秒' : '－'), h('span', { class: 'kb-plus' }, '+' + (g.gain[id] || 0)))))
          : h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '打てた人'), doneChips(ctx, g.players, g.done)),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)));
    },
  });
})();
})();
