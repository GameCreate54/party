// ===== 多数決 =====
// 「犬派？猫派？」のような2択に全員がこっそり答える。多数派（設定で少数派）に入れた人が+1点。
(() => {
const { h, button, stepper, segmented, shuffle } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const QS = [
  ['犬派？猫派？', '犬', '猫'], ['朝ごはんは？', 'ごはん', 'パン'], ['きのこ？たけのこ？', 'きのこの山', 'たけのこの里'], ['夏と冬、好きなのは？', '夏', '冬'],
  ['海と山、行くなら？', '海', '山'], ['目玉焼きにかけるのは？', 'しょうゆ', 'ソース'], ['お風呂は？', '朝', '夜'], ['カレーは？', '甘口', '辛口'],
  ['からあげにレモン', 'かける', 'かけない'], ['生まれ変わるなら？', '男', '女'], ['宝くじ1億円当たったら', '使う', '貯める'], ['旅行するなら', '国内', '海外'],
  ['ラーメンは？', 'こってり', 'あっさり'], ['休日は', 'インドア', 'アウトドア'], ['すき焼きの卵', 'つける', 'つけない'], ['ショートケーキのいちご', '最初に食べる', '最後に食べる'],
  ['過去と未来、行けるなら', '過去', '未来'], ['スマホの充電', 'こまめにする', '減ってからする'], ['ポテトは', '細いの', '太いの'], ['透明人間と空を飛ぶ、なるなら', '透明人間', '空を飛ぶ'],
  ['アイスは', 'カップ', 'コーン'], ['寝るとき', '電気つける', '真っ暗'], ['お寿司', 'わさびあり', 'わさび抜き'], ['ゲームは', 'ひとりで', 'みんなで'],
  ['テストの答え合わせ', 'すぐする', 'しない'], ['靴下は', '右から', '左から'], ['肉と魚', '肉', '魚'], ['ジェットコースター', '好き', '苦手'],
  ['メールの返信', 'すぐ返す', 'ためる'], ['おでんの具なら', '大根', 'たまご'], ['ジュースは', 'つぶあり', 'つぶなし'], ['無人島に持っていくなら', 'ナイフ', 'ライター'],
  ['お年玉は', 'すぐ使う', '貯金'], ['写真を撮られるのは', '好き', '苦手'], ['天ぷらは', '天つゆ', '塩'], ['ゾンビ映画の主人公なら', '戦う', '隠れる'],
];

const view = { round: null, chosen: null, seen: null };

function newRound(ctx, g, round) {
  const used = new Set(g.used || []);
  let pool = QS.map((_, i) => i).filter((i) => !used.has(i));
  if (!pool.length) pool = QS.map((_, i) => i);
  const qi = shuffle(pool)[0];
  return { game: { ...g, phase: 'pick', round, qi, used: [...(g.used || []), qi], done: null, picks: null, win: null, gain: null }, private: { picks: {} } };
}
function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = Object.fromEntries(players.map((id) => [id, 0]));
  return newRound(ctx, { players, scores, rounds: Number(ctx.settings.rounds) || 8, mode: ctx.settings.mode || 'major', used: [] }, 1);
}
function reveal(g, picksIn) {
  const picks = { ...(picksIn || {}) };
  const a = Object.values(picks).filter((v) => v === 'a').length;
  const b = Object.values(picks).filter((v) => v === 'b').length;
  let win = null;
  if (a !== b && a + b) win = (g.mode === 'major') === (a > b) ? 'a' : 'b';
  if (win && (win === 'a' ? a : b) === 0) win = null;
  const gain = {};
  const scores = { ...g.scores };
  g.players.forEach((id) => { gain[id] = win && picks[id] === win ? 1 : 0; scores[id] = (scores[id] || 0) + gain[id]; });
  return { game: { ...g, phase: 'reveal', picks, win, gain, scores, ca: a, cb: b }, private: null };
}

window.Party.register({
  id: 'tasuketsu',
  name: '多数決',
  icon: '🗳️',
  description: '2択のお題にこっそり投票。多数派（または少数派）になれたら得点',
  defaultSettings: () => ({ rounds: 8, mode: 'major' }),
  validate: (ctx) => playerCountError(ctx, 3),
  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 8, mode: 'major', ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'お題の数'), stepper(Number(s.rounds), 1, 20, (rounds) => set({ rounds }), editable)),
      h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '勝ちになるのは'),
        segmented([{ value: 'major', label: '多数派' }, { value: 'minor', label: '少数派' }], s.mode, (mode) => set({ mode }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' }, '自分の好みではなく「みんなはどっちを選ぶか」を読むゲーム。同数ならだれも得点なし（3人から）。'));
  },
  start: (ctx) => newGame(ctx),
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;
    switch (a.type) {
      case 'pick': {
        if (g.phase !== 'pick' || a.round !== g.round || !g.players.includes(a.from) || !['a', 'b'].includes(a.v)) return null;
        const picks = { ...((ctx.private || {}).picks || {}), [a.from]: a.v };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => picks[id])) return reveal(ng, picks);
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
    if (g.phase === 'over') return overView(ctx, g, { crown: '🗳️', topLabel: g.mode === 'major' ? 'いちばん空気が読めた人' : 'いちばんひねくれていた人' });
    if (view.round !== g.round) { view.round = g.round; view.chosen = null; }
    if (g.phase === 'reveal' && view.seen !== g.round) { view.seen = g.round; beep(600, 0.25, 'triangle', 0.1, 1200); }
    const [q, A, B] = QS[g.qi];
    const picks = g.picks || {};
    const playing = g.players.includes(ctx.me);
    const card = h('div', { class: 'card center tk-q' }, h('div', { class: 'muted small' }, `お題 ${g.round} / ${g.rounds}・${g.mode === 'major' ? '多数派' : '少数派'}が勝ち`), h('div', { class: 'tk-qt' }, q));
    if (g.phase === 'pick') {
      return h('div', { class: 'stack' }, card,
        playing ? h('div', { class: 'tk-two' }, [['a', A], ['b', B]].map(([v, label]) => h('button', {
          type: 'button', class: 'tk-opt ' + v + (view.chosen === v ? ' on' : ''),
          onclick: () => { view.chosen = v; ctx.send('pick', { v, round: g.round }); ctx.rerender(); },
        }, label))) : h('p', { class: 'center muted' }, '観戦中'),
        h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '答えた人'), doneChips(ctx, g.players, g.done)),
        ctx.isHost && h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')));
    }
    const side = (v, label, n) => h('div', { class: 'tk-res ' + v + (g.win === v ? ' win' : '') },
      h('div', { class: 'tk-lab' }, label), h('div', { class: 'tk-n' }, n + '人'),
      h('div', { class: 'tk-who' }, g.players.filter((id) => picks[id] === v).map((id) => nameOf(ctx, id)).join('、') || '－'));
    return h('div', { class: 'stack' }, card,
      h('div', { class: 'tk-two pop' }, side('a', A, g.ca || 0), side('b', B, g.cb || 0)),
      h('div', { class: 'center tk-verdict' }, g.win ? `「${g.win === 'a' ? A : B}」を選んだ人に+1点` : '引き分け！だれも得点なし'),
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores)),
      ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のお題へ', () => ctx.send('next'), 'primary big') : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
  },
});
})();
