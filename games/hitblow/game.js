// ===== ヒット＆ブロー早解き =====
// ホストの端末がひみつの数字（同じ数字は使わない）を決める。全員が同時に、自分だけで推理する。
// 数字と場所が合っていたら「ヒット」、数字だけ合っていたら「ブロー」。早く当てた順に高得点。
// 自分の推理の記録は自分にだけ見える。
(() => {
const { h, button, stepper, segmented, inputBox, drafts, toast, shuffle } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, playerCountError, beep, buzz } = window.Party.kit;

const LIMIT_MS = 4 * 60 * 1000;
const view = { round: null, seenSolve: 0, now: null };

function newRound(ctx, g, round) {
  const secret = shuffle(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']).slice(0, g.len).join('');
  const now = ctx.now();
  return {
    game: { ...g, phase: 'play', round, startAt: now, endAt: now + LIMIT_MS, tries: null, solved: null, answer: null, gain: null },
    private: { secret, logs: {} },
    secrets: {},
  };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 3, len: Number(ctx.settings.len) || 3 }, 1);
}
function judge(secret, guess) {
  let hit = 0;
  let blow = 0;
  for (let i = 0; i < guess.length; i++) {
    if (guess[i] === secret[i]) hit++;
    else if (secret.includes(guess[i])) blow++;
  }
  return { hit, blow };
}
function finish(ctx, g) {
  const solved = g.solved || [];
  const gain = Object.fromEntries(g.players.map((id) => [id, 0]));
  solved.forEach((s, i) => { gain[s.id] = Math.max(1, g.players.length - i); });
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  return { game: { ...g, phase: 'reveal', answer: (ctx.private || {}).secret, gain, scores }, private: null };
}

window.Party.register({
  id: 'hitblow',
  name: 'ヒット＆ブロー',
  icon: '🔐',
  description: 'ひみつの数字をヒントだけで推理。全員同時に解いて、早く当てた人ほど高得点',
  defaultSettings: () => ({ rounds: 3, len: 3 }),
  validate: (ctx) => playerCountError(ctx, 1),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 3, len: 3, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 6, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, 'けた数'),
        segmented([{ value: 3, label: '3けた' }, { value: 4, label: '4けた' }], Number(s.len), (len) => set({ len }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '答えは0〜9の数字で、同じ数字は2回使われない。数字も場所も合っていたらヒット、数字だけ合っていたらブロー。制限時間4分。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    if (a.type === 'again') return isHost && g.phase === 'over' ? newGame(ctx) : null;
    if (a.type === 'next') {
      if (!isHost || g.phase !== 'reveal') return null;
      return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
    }
    if (a.type === 'close') return isHost && g.phase === 'play' ? finish(ctx, g) : null;
    if (a.type !== 'guess' || g.phase !== 'play' || a.round !== g.round || !g.players.includes(a.from)) return null;
    const pv = ctx.private || {};
    const guess = String(a.v || '');
    if (!new RegExp(`^\\d{${g.len}}$`).test(guess) || new Set(guess).size !== g.len) return null;
    if ((g.solved || []).some((s) => s.id === a.from)) return null;
    const r = judge(pv.secret, guess);
    const logs = { ...(pv.logs || {}) };
    logs[a.from] = [...(logs[a.from] || []), { v: guess, ...r }];
    const tries = { ...(g.tries || {}), [a.from]: logs[a.from].length };
    let solved = g.solved || [];
    if (r.hit === g.len) solved = [...solved, { id: a.from, n: logs[a.from].length, t: ctx.now() - g.startAt }];
    const secrets = Object.fromEntries(Object.entries(logs).map(([id, l]) => [id, { round: g.round, log: l }]));
    let res = { game: { ...g, tries, solved }, private: { ...pv, logs }, secrets };
    if (activeIds(ctx, g.players).every((id) => solved.some((s) => s.id === id))) res = { ...finish({ ...ctx, private: pv }, res.game), secrets };
    return res;
  },
  tick(ctx) {
    const g = ctx.game;
    if (!g || g.phase !== 'play' || ctx.now() < g.endAt) return null;
    return finish(ctx, g);
  },
  render(ctx) {
    const g = ctx.game;
    view.now = ctx.now;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🔐', topLabel: '名探偵' });
    if (view.round !== g.round) { view.round = g.round; view.seenSolve = 0; drafts['hb-v'] = ''; }
    const solved = g.solved || [];
    if (solved.length > view.seenSolve) { view.seenSolve = solved.length; const last = solved[solved.length - 1]; if (last.id === ctx.me) { beep(1200, 0.3, 'triangle', 0.1, 1800); buzz(80); } else beep(700, 0.1, 'triangle', 0.06); }
    const sec = ctx.secret && ctx.secret.round === g.round ? ctx.secret.log || [] : [];
    const meSolved = solved.some((s) => s.id === ctx.me);
    const playing = g.players.includes(ctx.me);
    const status = h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, 'みんなの様子'),
      h('div', { class: 'hb-status' }, g.players.map((id) => {
        const s = solved.findIndex((x) => x.id === id);
        return h('div', { class: 'hb-st' + (s >= 0 ? ' ok' : '') }, h('span', null, nameOf(ctx, id)),
          h('span', null, s >= 0 ? `${s + 1}位で正解（${solved[s].n}回）` : `${(g.tries || {})[id] || 0}回目…`));
      })));
    if (g.phase === 'reveal') {
      return h('div', { class: 'stack' },
        h('div', { class: 'card center pop' }, h('div', { class: 'muted small' }, `ラウンド ${g.round} の答え`), h('div', { class: 'hb-ans' }, g.answer)),
        status,
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
        ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
    }
    const submit = () => {
      const v = (drafts['hb-v'] || '').trim();
      if (!new RegExp(`^\\d{${g.len}}$`).test(v) || new Set(v).size !== g.len) { toast(`ちがう数字を${g.len}つ入れてね`); return; }
      drafts['hb-v'] = '';
      const el = document.getElementById('hb-v'); if (el) el.value = '';
      ctx.send('guess', { v, round: g.round });
    };
    return h('div', { class: 'stack' },
      h('div', { class: 'hb-top' }, h('span', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`), h('span', { class: 'hb-time', 'data-hb-end': g.endAt }, '')),
      h('div', { class: 'card center' }, h('div', { class: 'hb-ans hidden' }, '？'.repeat(g.len)), h('div', { class: 'muted small' }, `${g.len}けた・同じ数字なし`)),
      playing && !meSolved ? h('div', { class: 'hb-row' },
        inputBox('hb-v', { placeholder: `${g.len}けたの数字`, digits: true, maxlength: g.len, big: true, onEnter: submit, keepFocus: true, enterkeyhint: 'send' }),
        button('推理', submit, 'primary')) : playing ? h('p', { class: 'center hb-done' }, '🎉 正解！ほかの人を待っています') : null,
      playing ? h('div', { class: 'card hb-log' }, sec.length ? [...sec].reverse().map((r, i) => h('div', { class: 'hb-l' + (r.hit === g.len ? ' ok' : '') },
        h('span', { class: 'muted small' }, `${sec.length - i}.`), h('b', null, r.v), h('span', { class: 'hb-h' }, `${r.hit} ヒット`), h('span', { class: 'hb-b' }, `${r.blow} ブロー`)))
        : h('span', { class: 'muted small' }, '例：123 と入れると「1ヒット 1ブロー」のようにヒントが返ってきます')) : null,
      status,
      ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って答えを見る', () => ctx.send('close'), 'ghost small')));
  },
});

setInterval(() => {
  document.querySelectorAll('[data-hb-end]').forEach((el) => {
    if (!view.now) return;
    const left = Math.max(0, Number(el.getAttribute('data-hb-end')) - view.now());
    const t = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
    if (el.textContent !== t) el.textContent = t;
  });
}, 250);
})();
