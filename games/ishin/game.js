// ===== 以心伝心 =====
// お題（例：「赤い果物といえば？」）にみんなが答えを書く。
// 自分と同じ答えを書いた人の数だけ得点。みんなと心をそろえよう。
// 答えは全員がそろうまで、ホストの端末だけが持っている。
(() => {
const { h, button, stepper, segmented, inputBox, drafts, shuffle, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError, beep } = window.Party.kit;

const TOPICS = [
  '赤い果物といえば？', '黄色い食べ物といえば？', 'おにぎりの具といえば？', 'カレーに入れたい具といえば？', 'ラーメンの味といえば？',
  'コンビニで買うものといえば？', '夏といえば？', '冬といえば？', 'お正月といえば？', '学校の行事といえば？',
  '動物園の人気者といえば？', '海の生き物といえば？', '空を飛ぶものといえば？', 'ペットといえば？', '鳥といえば？',
  '日本の観光地といえば？', '北海道の名物といえば？', '大阪といえば？', '外国といえば？', '富士山の次に高そうな山といえば？',
  'スポーツといえば？', 'ボールを使うスポーツといえば？', 'オリンピックの競技といえば？', '野球のポジションといえば？', '武道といえば？',
  'キッチンにあるものといえば？', 'お風呂にあるものといえば？', 'カバンに入っているものといえば？', '文房具といえば？', '家電といえば？',
  '朝ごはんといえば？', 'おやつといえば？', 'パンの種類といえば？', 'お寿司のネタといえば？', '鍋料理といえば？',
  '飲み物といえば？', 'アイスの味といえば？', 'ケーキといえば？', '和菓子といえば？', '屋台の食べ物といえば？',
  '色といえば？', '形といえば？', '星座といえば？', '曜日といえば？', '惑星といえば？',
  '楽器といえば？', '昔話といえば？', 'ことわざに出てくる動物といえば？', '花といえば？', '野菜といえば？',
  '乗り物といえば？', '職業といえば？', '病院の科といえば？', 'お店の種類といえば？', 'デートの場所といえば？',
  '雨の日にすることといえば？', '休みの日にすることといえば？', '運動会の種目といえば？', '遊園地の乗り物といえば？', 'ゲームのジャンルといえば？',
  '「パ」で始まる言葉といえば？', '「あ」で始まる食べ物といえば？', '3文字の動物といえば？', '丸いものといえば？', '白いものといえば？',
  '甘いものといえば？', '辛いものといえば？', '冷たいものといえば？', 'うるさいものといえば？', '高いものといえば？',
  '1から10で好きな数字といえば？', '春の花といえば？', 'お弁当のおかずといえば？', 'ファミレスで頼むものといえば？', '牛丼屋といえば？',
  '虫といえば？', '恐竜といえば？', '天気といえば？', 'トランプの遊びといえば？', 'じゃんけんで最初に出す手といえば？',
];

const view = { round: null, sent: null, merging: null, seenReveal: null };

// 表記ゆれをそろえる（カタカナ→ひらがな、全角半角、空白、長音の一部）
function norm(s) {
  return String(s || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[\s「」『』、。,.!?！？・〜~ー－-]/g, '');
}

function nextTopic(g) {
  const used = new Set(g.used || []);
  const pool = TOPICS.map((_, i) => i).filter((i) => !used.has(i));
  const i = shuffle(pool.length ? pool : TOPICS.map((_, k) => k))[0];
  return { topic: TOPICS[i], used: [...(pool.length ? g.used || [] : []), i] };
}

function newRound(ctx, g, round) {
  const t = nextTopic(g);
  return {
    game: { ...g, phase: 'answer', round, topic: t.topic, used: t.used, done: null, groups: null, roundPts: null },
    private: { answers: {} },
  };
}

function newGame(ctx) {
  const players = ctx.players.map((p) => p.id);
  const scores = {};
  players.forEach((id) => { scores[id] = 0; });
  return newRound(ctx, { players, scores, base: scores, rounds: ctx.settings.rounds || 5, used: [] }, 1);
}

// グループ分けと得点（同じ答えの人数−1 が得点）
function score(g, groups) {
  const roundPts = {};
  g.players.forEach((id) => { roundPts[id] = 0; });
  for (const gr of groups) for (const id of gr.ids) roundPts[id] = gr.ids.length - 1;
  const scores = {};
  g.players.forEach((id) => { scores[id] = ((g.base || {})[id] || 0) + roundPts[id]; });
  return { roundPts, scores };
}

function reveal(ctx, g) {
  const answers = (ctx.private || {}).answers || {};
  const map = new Map();
  for (const id of g.players) {
    const a = answers[id];
    if (!a) continue;
    const k = norm(a);
    if (!map.has(k)) map.set(k, { text: a, ids: [] });
    map.get(k).ids.push(id);
  }
  const groups = [...map.values()].sort((x, y) => y.ids.length - x.ids.length).map((gr, i) => ({ ...gr, key: 'g' + i }));
  const answerOf = {};
  for (const id of g.players) if (answers[id]) answerOf[id] = answers[id];
  return { game: { ...g, phase: 'reveal', groups, answerOf, ...score(g, groups) }, private: null };
}

window.Party.register({
  id: 'ishin',
  name: '以心伝心',
  icon: '🤝',
  description: '「赤い果物といえば？」にみんなで答える。同じ答えの人が多いほど得点',

  defaultSettings: () => ({ rounds: 5 }),
  validate: (ctx) => playerCountError(ctx, 2),

  renderSettings(ctx, { editable, set }) {
    const s = { rounds: 5, ...ctx.settings };
    return h('div', { class: 'settings' },
      h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'お題の数'), stepper(s.rounds, 1, 15, (rounds) => set({ rounds }), editable)),
      h('p', { class: 'muted small', style: 'margin:0' },
        '自分と同じ答えを書いた人1人につき1点。「りんご」と「リンゴ」は自動で同じ扱い。「林檎」のような表記ゆれは、ホストが答え合わせでまとめられます。'));
  },

  start: (ctx) => newGame(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const isHost = from === ctx.hostId;
    switch (a.type) {
      case 'answer': {
        if (g.phase !== 'answer' || !g.players.includes(from) || a.round !== g.round || a.topic !== g.topic) return null;
        const text = String(a.text || '').trim().slice(0, 30);
        if (!text) return null;
        const answers = { ...((ctx.private || {}).answers || {}), [from]: text };
        const ng = { ...g, done: { ...(g.done || {}), [from]: true } };
        const need = activeIds(ctx, g.players);
        if (need.every((id) => answers[id])) return reveal({ ...ctx, private: { answers } }, ng);
        return { game: ng, private: { answers } };
      }
      case 'close':
        if (!isHost || g.phase !== 'answer') return null;
        return reveal(ctx, g);
      case 'skip': {
        if (!isHost || g.phase !== 'answer') return null;
        const t = nextTopic(g);
        return { game: { ...g, topic: t.topic, used: t.used, done: null, round: g.round }, private: { answers: {} } };
      }
      case 'merge': {
        if (!isHost || g.phase !== 'reveal') return null;
        const gs = g.groups || [];
        const A = gs.find((x) => x.key === a.a);
        const B = gs.find((x) => x.key === a.b);
        if (!A || !B || A === B) return null;
        const merged = { ...A, ids: [...A.ids, ...B.ids] };
        const groups = gs.filter((x) => x !== A && x !== B).concat(merged).sort((x, y) => y.ids.length - x.ids.length);
        return { game: { ...g, groups, ...score(g, groups) } };
      }
      case 'next':
        if (!isHost || g.phase !== 'reveal') return null;
        if (g.round >= g.rounds) return { game: { ...g, phase: 'over' } };
        return newRound(ctx, { ...g, base: g.scores }, g.round + 1);
      case 'again':
        if (!isHost || g.phase !== 'over' || playerCountError(ctx, 2)) return null;
        return newGame(ctx);
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (g.phase === 'over') return overView(ctx, g, { crown: '🤝', topLabel: 'いちばん心が通じた人' });
    if (view.round !== g.round + ':' + g.topic) {
      view.round = g.round + ':' + g.topic;
      view.sent = null;
      view.merging = null;
      drafts['is-ans'] = '';
    }
    if (g.phase === 'reveal' && view.seenReveal !== view.round) { view.seenReveal = view.round; beep(700, 0.25, 'triangle', 0.1, 1400); }
    return g.phase === 'answer' ? answerView(ctx, g) : revealView(ctx, g);
  },
});

function topicCard(g) {
  return h('div', { class: 'card center is-topic' },
    h('div', { class: 'muted small' }, `お題 ${g.round} / ${g.rounds}`),
    h('div', { class: 'is-q' }, g.topic));
}

function answerView(ctx, g) {
  const me = ctx.me;
  const playing = g.players.includes(me);
  const done = !!(g.done || {})[me];
  const submit = () => {
    const t = (drafts['is-ans'] || '').trim();
    if (!t) { toast('答えを入れてね'); return; }
    view.sent = t;
    ctx.send('answer', { text: t, round: g.round, topic: g.topic });
  };
  return h('div', { class: 'stack' },
    topicCard(g),
    playing
      ? h('div', { class: 'card stack' },
        h('div', { class: 'row-label' }, done ? `「${view.sent || '送信済み'}」で送りました（変更もできます）` : 'みんなが書きそうな答えは？'),
        h('div', { class: 'is-row' },
          inputBox('is-ans', { placeholder: '答えを入力', maxlength: 30, onEnter: submit, enterkeyhint: 'send' }),
          button(done ? '変更' : '送信', submit, 'primary')))
      : h('p', { class: 'center muted' }, '観戦中'),
    h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '回答済み'), doneChips(ctx, g.players, g.done)),
    ctx.isHost && h('div', { class: 'host-tools' },
      button('締め切って答え合わせ', () => ctx.send('close'), 'ghost small'),
      button('お題を変える', () => ctx.send('skip'), 'ghost small')));
}

function revealView(ctx, g) {
  const groups = g.groups || [];
  const mineKey = (groups.find((gr) => gr.ids.includes(ctx.me)) || {}).key;
  const tapGroup = (key) => {
    if (!ctx.isHost) return;
    if (!view.merging) { view.merging = key; ctx.rerender(); return; }
    if (view.merging === key) { view.merging = null; ctx.rerender(); return; }
    ctx.send('merge', { a: view.merging, b: key });
    view.merging = null;
  };
  const noAns = g.players.filter((id) => !(g.answerOf || {})[id]);
  return h('div', { class: 'stack' },
    topicCard(g),
    h('div', { class: 'is-groups' },
      groups.map((gr) => h('button', {
        type: 'button',
        class: 'is-group' + (gr.ids.length > 1 ? ' match' : '') + (gr.key === mineKey ? ' mine' : '') + (view.merging === gr.key ? ' sel' : ''),
        disabled: !ctx.isHost,
        onclick: () => tapGroup(gr.key),
      },
      h('div', { class: 'is-ans' }, gr.text, gr.ids.length > 1 ? h('span', { class: 'is-cnt' }, `×${gr.ids.length}`) : null),
      h('div', { class: 'is-who' }, gr.ids.map((id) => {
        const a = (g.answerOf || {})[id];
        return nameOf(ctx, id) + (a && a !== gr.text ? `（${a}）` : '');
      }).join('、')),
      h('div', { class: 'is-pt' }, gr.ids.length > 1 ? `+${gr.ids.length - 1}点ずつ` : '0点'))),
      noAns.length ? h('div', { class: 'muted small center' }, '未回答：' + noAns.map((id) => nameOf(ctx, id)).join('、')) : null),
    ctx.isHost && groups.length > 1 && h('p', { class: 'muted small center', style: 'margin:0' },
      view.merging ? 'まとめる相手の答えをタップ（もう一度タップで取り消し）' : '同じ意味の答えは、2つを順にタップしてまとめられます'),
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'),
      scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'is-plus' }, '+' + ((g.roundPts || {})[id] || 0)) })),
    ctx.isHost
      ? button(g.round >= g.rounds ? '最終結果へ' : '次のお題へ', () => ctx.send('next'), 'primary big')
      : h('p', { class: 'center muted small' }, 'ホストが次へ進めます'));
}
})();
