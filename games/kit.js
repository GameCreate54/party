// ===== 小さなゲームで共通に使う部品 =====
// 名前の取得・得点表・最終結果の画面など。window.Party.kit から使う。
(() => {
const { h, button } = window.Party.ui;

const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '（退出）';

// ゲームに参加中で、いまオンラインの人（全員そろったかの判定に使う）
const activeIds = (ctx, ids) => (ids || []).filter((id) => ctx.players.some((p) => p.id === id && p.online));

// 同点は同じ順位。lowerBetter=true なら小さいほうが上
function ranking(ids, scores, lowerBetter = false) {
  const list = ids.map((id) => ({ id, score: (scores || {})[id] || 0 }));
  list.sort((a, b) => (lowerBetter ? a.score - b.score : b.score - a.score));
  let rank = 0;
  let prev = null;
  list.forEach((r, i) => {
    if (r.score !== prev) { rank = i + 1; prev = r.score; }
    r.rank = rank;
  });
  return list;
}

// 得点の一覧（小さめのカード）
function scoreList(ctx, ids, scores, opts = {}) {
  const rows = ranking(ids, scores, opts.lowerBetter);
  return h('div', { class: 'kit-scores' },
    rows.map((r) => h('div', { class: 'kit-score' + (r.id === ctx.me ? ' me' : '') + (opts.mark && opts.mark[r.id] ? ' ' + opts.mark[r.id] : '') },
      h('span', { class: 'kit-rank' }, r.rank),
      h('span', { class: 'kit-name' }, nameOf(ctx, r.id)),
      opts.extra ? opts.extra(r.id) : null,
      h('span', { class: 'kit-pt' }, (opts.format || ((v) => v + '点'))(r.score)))));
}

// 最終結果の画面
function overView(ctx, g, opts = {}) {
  const rows = ranking(g.players, opts.scores || g.scores, opts.lowerBetter);
  const top = rows.filter((r) => r.rank === 1).map((r) => nameOf(ctx, r.id));
  return h('div', { class: 'stack' },
    h('div', { class: 'card center kit-final pop' },
      h('div', { class: 'kit-crown' }, opts.crown || '👑'),
      h('div', { class: 'muted small' }, opts.topLabel || '優勝'),
      h('div', { class: 'kit-winner' }, top.join('・')),
      opts.sub ? h('div', { class: 'muted small' }, opts.sub) : null),
    scoreList(ctx, g.players, opts.scores || g.scores, opts),
    opts.after || null,
    ctx.isHost
      ? h('div', { class: 'actions' },
        button('もう一回（同じメンバー）', () => ctx.send('again'), 'primary big'),
        h('p', { class: 'center muted small', style: 'margin:0' }, '設定を変えるときは右上の「ロビーへ」から'))
      : h('p', { class: 'center muted small' }, 'ホストの操作を待っています…'));
}

// 「○人中○人」の進み具合（だれが済んだか）
function doneChips(ctx, ids, done) {
  return h('div', { class: 'chips kit-done' },
    ids.map((id) => h('span', { class: 'chip' + ((done || {})[id] ? ' on' : '') }, ((done || {})[id] ? '✓ ' : '… ') + nameOf(ctx, id))));
}

function playerCountError(ctx, min, max = 8) {
  const n = ctx.players.length;
  if (n < min) return `${min}人以上で遊べます`;
  if (n > max) return `${max}人までです`;
  return null;
}

// 効果音（端末で鳴らすだけ）
let ac = null;
function beep(freq = 800, dur = 0.08, type = 'square', vol = 0.06, to) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const gn = ac.createGain();
    o.connect(gn); gn.connect(ac.destination);
    const t = ac.currentTime;
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    gn.gain.setValueAtTime(vol, t);
    gn.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch { /* 音が出せない端末 */ }
}
const buzz = (ms) => { try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* なし */ } };

window.Party.kit = { nameOf, activeIds, ranking, scoreList, overView, doneChips, playerCountError, beep, buzz };
})();
