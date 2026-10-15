// ===== 平均の2/3 =====
// 全員が0〜100の数字をこっそり選ぶ。「みんなの平均 × 2/3」に一番近い人が勝ち。
// みんなが小さい数を選ぶと読むと…さらに小さく？ 読み合いのゲーム。
(() => {
const { h, button, stepper, segmented, inputBox, drafts, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const RATES = { '2/3': 2 / 3, '1/2': 0.5, '1': 1 };
const view = { round: null, sent: null, seen: null };

function newRound(ctx, g, round) {
  return { game: { ...g, phase: 'pick', round, done: null, picks: null, target: null, gain: null }, private: { picks: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 5, rate: ctx.settings.rate || '2/3', history: [] }, 1);
}
function reveal(g, picksIn) {
  const picks = { ...(picksIn || {}) };
  const ids = g.players.filter((id) => picks[id] != null);
  const avg = ids.length ? ids.reduce((s, id) => s + picks[id], 0) / ids.length : 0;
  const target = Math.round(avg * RATES[g.rate] * 100) / 100;
  const best = Math.min(...ids.map((id) => Math.abs(picks[id] - target)));
  const gain = Object.fromEntries(g.players.map((id) => [id, ids.includes(id) && Math.abs(picks[id] - target) === best ? 1 : 0]));
  const scores = { ...g.scores };
  g.players.forEach((id) => { scores[id] = (scores[id] || 0) + gain[id]; });
  const history = [...(g.history || []), { round: g.round, avg: Math.round(avg * 100) / 100, target }];
  return { game: { ...g, phase: 'reveal', picks, avg: Math.round(avg * 100) / 100, target, gain, scores, history }, private: null };
}

window.Party.register({
  id: 'heikin',
  name: '平均の2/3',
  icon: '🧠',
  description: '0〜100の数字を選んで「みんなの平均×2/3」に一番近い人が勝ち。究極の読み合い',
  defaultSettings: () => ({ rounds: 5, rate: '2/3' }),
  validate: (ctx) => playerCountError(ctx, 2),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, rate: '2/3', ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 10, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '目標'),
        segmented([{ value: '2/3', label: '平均×2/3' }, { value: '1/2', label: '平均×1/2' }, { value: '1', label: '平均ぴったり' }], s.rate, (rate) => set({ rate }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '全員の数字の平均 × 倍率 に一番近い人に+1点（同じ近さなら全員）。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'pick': {
        const n = Number(a.n);
        if (g.phase !== 'pick' || a.round !== g.round || !g.players.includes(a.from) || !Number.isInteger(n) || n < 0 || n > 100) return null;
        const picks = { ...((ctx.private || {}).picks || {}), [a.from]: n };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => picks[id] != null)) return reveal(ng, picks);
        return { game: ng, private: { picks } };
      }
      case 'close': return isHost && g.phase === 'pick' ? reveal(g, (ctx.private || {}).picks) : null;
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      case 'again': return isHost && g.phase === 'over' ? newGame(ctx) : null;
      default: return null;
    }
  },
  render(ctx) {
    const g = ctx.game;
    const rl = { '2/3': '平均 × 2/3', '1/2': '平均 × 1/2', '1': '平均ぴったり' }[g.rate];
    if (g.phase === 'over') {
      return overView(ctx, g, { crown: '🧠', topLabel: '読み合いの達人',
        after: h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '目標の数字の移り変わり'),
          h('div', { class: 'hk-hist' }, (g.history || []).map((r) => h('span', null, `${r.round}回目：${r.target}`)))) });
    }
    if (view.round !== g.round) { view.round = g.round; view.sent = null; drafts['hk-n'] = ''; }
    if (g.phase === 'reveal' && view.seen !== g.round) { view.seen = g.round; beep(700, 0.25, 'triangle', 0.1, 1400); }
    const head = h('div', { class: 'card center' }, h('div', { class: 'muted small' }, `ラウンド ${g.round} / ${g.rounds}`), h('div', { class: 'hk-rule' }, `${rl} に近い人の勝ち`));
    if (g.phase === 'pick') {
      const submit = () => {
        const v = (drafts['hk-n'] || '').trim();
        const n = Number(v);
        if (v === '' || !Number.isInteger(n) || n < 0 || n > 100) { toast('0〜100の整数で入れてね'); return; }
        view.sent = n;
        ctx.send('pick', { n, round: g.round });
        ctx.rerender();
      };
      return h('div', { class: 'stack' }, head,
        g.players.includes(ctx.me) ? h('div', { class: 'card stack' },
          h('div', { class: 'row-label center' }, view.sent != null ? `${view.sent} を出しました（変更OK）` : '0〜100 の数字を入力'),
          h('div', { class: 'hk-row' }, inputBox('hk-n', { placeholder: '0〜100', digits: true, maxlength: 3, big: true, onEnter: submit, enterkeyhint: 'send' }), button('決定', submit, 'primary'))) : h('p', { class: 'center muted' }, '観戦中'),
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '出した人'), doneChips(ctx, g.players, g.done)),
        ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
    }
    const picks = g.picks || {};
    const rows = g.players.filter((id) => picks[id] != null).sort((x, y) => Math.abs(picks[x] - g.target) - Math.abs(picks[y] - g.target));
    return h('div', { class: 'stack' }, head,
      h('div', { class: 'card center pop' }, h('div', { class: 'muted small' }, `平均 ${g.avg}`), h('div', { class: 'hk-target' }, '目標 ' + g.target)),
      h('div', { class: 'hk-line' },
        h('div', { class: 'hk-mark target', style: `left:${g.target}%` }, '🎯'),
        rows.map((id) => h('div', { class: 'hk-dot' + (g.gain[id] ? ' win' : ''), style: `left:${picks[id]}%`, title: nameOf(ctx, id) }))),
      h('div', { class: 'hk-list' }, rows.map((id) => h('div', { class: 'hk-r' + (g.gain[id] ? ' win' : '') },
        h('span', null, nameOf(ctx, id)), h('b', null, picks[id]), h('span', { class: 'muted small' }, '差 ' + Math.round(Math.abs(picks[id] - g.target) * 100) / 100)))),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
      ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
  },
});
})();
