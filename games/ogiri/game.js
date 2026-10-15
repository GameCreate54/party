// ===== 大喜利 =====
// お題に全員が回答を書く → だれが書いたか伏せたまま並べて、一番おもしろいと思うものに投票（自分のには入れられない）。
// もらった票の数がそのまま得点。
(() => {
const { h, button, stepper, inputBox, drafts, shuffle, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const PROMPTS = [
  'こんな桃太郎はイヤだ。どんな桃太郎？', 'ロボットが反乱を起こした。その理由とは？', '「この店、二度と来ないな」と思った理由は？', '宇宙人が地球に来て最初に言ったひと言は？',
  'サンタクロースの意外な副業とは？', 'こんな校長先生はイヤだ。どんな校長先生？', '100年後の小学生の夏休みの宿題とは？', 'おばけが一番こわがっているものとは？',
  '新しくできた祝日。何の日？', '犬がしゃべり出した。最初のひと言は？', 'こんな結婚式はイヤだ。どんな結婚式？', 'コンビニで売り始めた意外なものとは？',
  'ヒーローが引退を決めた理由とは？', 'こんな美容院はイヤだ。どんな美容院？', 'カップラーメンの「3分」が「3時間」になった。なぜ？', 'この遊園地、絶対おかしい。なぜ？',
  '鬼が島の鬼たちの悩みとは？', '総理大臣の最初の仕事、まさかの内容とは？', 'こんな占い師は信じられない。どんな占い師？', '目覚まし時計の新機能とは？',
  '「このゲーム、クソゲーだ」と思った瞬間とは？', '忍者が現代で就職した。職業は？', 'こんなタクシーはイヤだ。どんなタクシー？', '冷蔵庫を開けたら何かがいた。何？',
  '動物園の新しい人気者とは？', 'こんなお医者さんはイヤだ。どんなお医者さん？', 'うちのおじいちゃんの意外な特技とは？', '天気予報で絶対に聞きたくないひと言は？',
  'スマホの新しいアプリ。どんなアプリ？', '魔法使いの見習いがやらかした失敗とは？', 'こんな修学旅行はイヤだ。どこへ行く？', 'うんちが主人公の映画のタイトルとは？',
];

const view = { round: null, sent: null, voted: null, seen: null };

function newRound(ctx, g, round) {
  const used = new Set(g.used || []);
  let pool = PROMPTS.map((_, i) => i).filter((i) => !used.has(i));
  if (!pool.length) pool = PROMPTS.map((_, i) => i);
  const pi = shuffle(pool)[0];
  return { game: { ...g, phase: 'write', round, prompt: PROMPTS[pi], used: [...(g.used || []), pi], done: null, list: null, votes: null, gain: null }, private: { ans: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 4, used: [], best: null }, 1);
}
// 回答を伏せて並べる（作者はホストだけが知っている）
function toVote(ctx, g, ansIn) {
  const ans = { ...(ansIn || {}) };
  const ids = shuffle(g.players.filter((id) => ans[id]));
  const list = ids.map((id, i) => ({ k: 'a' + i, t: ans[id] }));
  const owner = Object.fromEntries(ids.map((id, i) => ['a' + i, id]));
  if (list.length < 2) return revealVotes(ctx, { ...g, list }, owner, {});
  return { game: { ...g, phase: 'vote', list, done: null }, private: { owner, votes: {} } };
}
function revealVotes(ctx, g, owner, votes) {
  const count = {};
  Object.values(votes).forEach((k) => { count[k] = (count[k] || 0) + 1; });
  const gain = Object.fromEntries(g.players.map((id) => [id, 0]));
  const list = (g.list || []).map((x) => ({ ...x, by: owner[x.k], n: count[x.k] || 0 }));
  list.forEach((x) => { if (x.by) gain[x.by] = x.n; });
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  const top = [...list].sort((a, b) => b.n - a.n)[0];
  const best = top && top.n ? [...(g.best || []), { p: g.prompt, t: top.t, by: top.by, n: top.n }] : g.best || null;
  return { game: { ...g, phase: 'reveal', list: list.sort((a, b) => b.n - a.n), voters: votes, gain, scores, best }, private: null };
}

window.Party.register({
  id: 'ogiri',
  name: '大喜利',
  icon: '🎤',
  description: 'お題にみんなで回答。名前を伏せて投票し、一番ウケた人が勝ち',
  defaultSettings: () => ({ rounds: 4 }),
  validate: (ctx) => playerCountError(ctx, 3),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 4, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'お題の数'), stepper(Number(s.rounds), 1, 10, (rounds) => set({ rounds }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '回答はだれが書いたか伏せて表示。自分以外の一番おもしろい回答に投票し、もらった票が得点に（3人から）。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    const pv = ctx.private || {};
    switch (a.type) {
      case 'answer': {
        if (g.phase !== 'write' || a.round !== g.round || !g.players.includes(a.from)) return null;
        const t = String(a.text || '').trim().slice(0, 60);
        if (!t) return null;
        const ans = { ...(pv.ans || {}), [a.from]: t };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => ans[id])) return toVote(ctx, ng, ans);
        return { game: ng, private: { ans } };
      }
      case 'close':
        if (!isHost) return null;
        if (g.phase === 'write') return toVote(ctx, g, pv.ans);
        if (g.phase === 'vote') return revealVotes(ctx, g, pv.owner || {}, pv.votes || {});
        return null;
      case 'vote': {
        if (g.phase !== 'vote' || a.round !== g.round || !g.players.includes(a.from)) return null;
        const owner = pv.owner || {};
        if (!owner[a.k] || owner[a.k] === a.from) return null;
        const votes = { ...(pv.votes || {}), [a.from]: a.k };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        // 回答していない人も投票できる。自分の回答しかない人はいない前提
        if (activeIds(ctx, g.players).every((id) => votes[id])) return revealVotes(ctx, ng, owner, votes);
        return { game: ng, private: { owner, votes } };
      }
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      case 'again': return isHost && g.phase === 'over' ? newGame(ctx) : null;
      default: return null;
    }
  },
  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') {
      return overView(ctx, g, { crown: '🎤', topLabel: '大喜利王',
        after: (g.best || []).length ? h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '各お題の一番ウケた回答'),
          h('div', { class: 'og-best' }, (g.best || []).map((b) => h('div', { class: 'og-b' }, h('div', { class: 'muted small' }, b.p), h('div', { class: 'og-t' }, b.t), h('div', { class: 'muted small' }, `${nameOf(ctx, b.by)}（${b.n}票）`))))) : null });
    }
    if (view.round !== g.round) { view.round = g.round; view.sent = null; view.voted = null; drafts['og-ans'] = ''; }
    if (g.phase === 'reveal' && view.seen !== g.round) { view.seen = g.round; beep(700, 0.3, 'triangle', 0.1, 1400); }
    const playing = g.players.includes(ctx.me);
    const head = h('div', { class: 'card center og-q' }, h('div', { class: 'muted small' }, `お題 ${g.round} / ${g.rounds}`), h('div', { class: 'og-qt' }, g.prompt));
    if (g.phase === 'write') {
      const submit = () => {
        const t = (drafts['og-ans'] || '').trim();
        if (!t) { toast('回答を入れてね'); return; }
        view.sent = t; ctx.send('answer', { text: t, round: g.round }); ctx.rerender();
      };
      return h('div', { class: 'stack' }, head,
        playing ? h('div', { class: 'card stack' },
          h('div', { class: 'row-label' }, view.sent ? '送信しました（書き直してもう一度送るとOK）' : '回答を書こう'),
          h('div', { class: 'og-row' }, inputBox('og-ans', { placeholder: '回答（60文字まで）', maxlength: 60, onEnter: submit, enterkeyhint: 'send' }), button('送信', submit, 'primary'))) : null,
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '書けた人'), doneChips(ctx, g.players, g.done)),
        ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って投票へ', () => ctx.send('close'), 'ghost small')));
    }
    if (g.phase === 'vote') {
      return h('div', { class: 'stack' }, head,
        h('div', { class: 'muted small center' }, '一番おもしろいと思う回答をタップ（自分のには入れられません）'),
        h('div', { class: 'og-list' }, (g.list || []).map((x) => h('button', {
          type: 'button', class: 'og-a' + (view.voted === x.k ? ' on' : ''), disabled: !playing || x.t === view.sent,
          onclick: () => { view.voted = x.k; ctx.send('vote', { k: x.k, round: g.round }); ctx.rerender(); },
        }, x.t))),
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '投票した人'), doneChips(ctx, g.players, g.done)),
        ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
    }
    return h('div', { class: 'stack' }, head,
      h('div', { class: 'og-list' }, (g.list || []).map((x, i) => h('div', { class: 'og-a res pop' + (i === 0 && x.n ? ' top' : '') },
        h('div', null, x.t), h('div', { class: 'og-by' }, h('span', null, '— ' + nameOf(ctx, x.by)), h('b', null, '👏'.repeat(Math.min(x.n, 8)) + ` ${x.n}票`))))),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
      ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のお題へ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
  },
});
})();
