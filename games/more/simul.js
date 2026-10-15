// ===== 同時に答えるゲーム5種 =====
// イエスの数当て・数えてみて・ひとりだけ・ハイ＆ロー・価値観ランキング
(() => {
const { simul, fromBank } = window.Party.kit2;
const { h, button, inputBox, drafts, toast, shuffle, pick, segmented } = window.Party.ui;
const { nameOf } = window.Party.kit;

const idsOf = (g) => g.players;
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s「」、。,.!?！？・ー-]/g, '');

// 入力欄＋送信ボタン
function textInput(id, view, send, opts = {}) {
  const submit = () => {
    const v = (drafts[id] || '').trim();
    if (!v) { toast(opts.empty || '入力してね'); return; }
    send(opts.number ? Number(v) : v);
  };
  return h('div', { class: 'card stack' },
    view.sent != null ? h('div', { class: 'row-label center' }, `「${view.sent}」で送りました（変更OK）`) : null,
    h('div', { class: 'mx-row' }, inputBox(id, { placeholder: opts.placeholder || '', digits: !!opts.number, maxlength: opts.max || 20, onEnter: submit, enterkeyhint: 'send' }), button('送信', submit, 'primary')));
}

// ---------- イエスの数当て ----------
const YN = [
  '子どものころピーマンが苦手だった', '幽霊を信じている', '1人カラオケに行ったことがある', '迷子になったことがある', '寝言を言うと言われたことがある',
  '財布をなくしたことがある', '最近10時間以上寝た日がある', '1日に2回コンビニに行ったことがある', '辛いものが得意', 'ジェットコースターが好き',
  'サンタさんを10歳まで信じていた', '目覚ましを3つ以上かけたことがある', '推しがいる', '料理は得意な方だ', '虫を素手でさわれる',
  'スマホの画面を割ったことがある', '1日3時間以上スマホを見る', '炭酸が苦手', '自分で髪を切ったことがある', '人前で歌うのは平気',
  '朝型だと思う', '夏より冬が好き', '犬より猫派', '徹夜でゲームをしたことがある', 'UFOを見たことがある気がする',
  '傘をなくしたことがある', '絵を描くのが好き', '左利き', '動物を飼っている（飼っていた）', '一番好きな食べ物はカレー',
];
simul({
  id: 'yesno', name: 'イエスの数当て', icon: '🙋', min: 3, rounds: 6, champion: '人の心を読む達人',
  description: '「幽霊を信じている？」に匿名でイエス/ノー。さらに「何人がイエスか」を予想して当てる',
  note: '自分の答え（だれにも見えません）と、イエスの人数の予想を出します。人数ぴったりで+2点、1人ちがいで+1点。',
  round: (ctx, g) => { const r = fromBank(YN, g.used, (q) => ({ q })); return { q: r.q, used: [...g.used, r.key] }; },
  prompt: (ctx, g) => h('div', { class: 'card center mx-q' }, h('div', { class: 'muted small' }, 'あなたは…'), h('div', { class: 'mx-qt' }, g.q)),
  input(ctx, g, view, send) {
    if (view.r !== g.round) { view.r = g.round; view.yn = null; view.pre = null; }
    const n = g.players.length;
    const ok = () => view.yn && view.pre != null && send({ a: view.yn, p: view.pre });
    return h('div', { class: 'card stack' },
      h('div', { class: 'row-label' }, '① あなたの答え（匿名）'),
      h('div', { class: 'mx-two' }, [['y', 'イエス'], ['n', 'ノー']].map(([k, l]) => button(l, () => { view.yn = k; ok(); ctx.rerender(); }, view.yn === k ? 'primary' : ''))),
      h('div', { class: 'row-label' }, `② イエスは何人？（${n}人中）`),
      h('div', { class: 'mx-nums' }, Array.from({ length: n + 1 }, (_, i) => button(String(i), () => { view.pre = i; ok(); ctx.rerender(); }, 'small' + (view.pre === i ? ' primary' : '')))),
      view.sent ? h('div', { class: 'muted small center' }, '送信済み（変更OK）') : h('div', { class: 'muted small center' }, '両方えらぶと送信されます'));
  },
  accept: (g, v) => (v && ['y', 'n'].includes(v.a) && Number.isInteger(v.p) && v.p >= 0 && v.p <= g.players.length ? { a: v.a, p: v.p } : undefined),
  score(g, picks) {
    const yes = Object.values(picks).filter((v) => v.a === 'y').length;
    const gain = {};
    idsOf(g).forEach((id) => { const p = picks[id]; gain[id] = !p ? 0 : p.p === yes ? 2 : Math.abs(p.p - yes) === 1 ? 1 : 0; });
    return { gain, extra: { yes, total: Object.keys(picks).length } };
  },
  reveal: (ctx, g) => h('div', { class: 'stack' },
    h('div', { class: 'card center pop' }, h('div', { class: 'muted small' }, 'イエスは'), h('div', { class: 'mx-big' }, `${g.yes}人`), h('div', { class: 'muted small' }, `（回答 ${g.total}人中・だれがイエスかはヒミツ）`)),
    h('div', { class: 'mx-list' }, idsOf(g).map((id) => h('div', { class: 'mx-r' + ((g.gain || {})[id] ? ' win' : '') }, h('span', null, nameOf(ctx, id)), h('b', null, (g.picks[id] ? g.picks[id].p : '－') + '人と予想'))))),
});

// ---------- 数えてみて ----------
simul({
  id: 'kazoe', name: '数えてみて', icon: '👀', min: 1, rounds: 5, champion: '動体視力王',
  description: '一瞬だけ表示される●の数を当てる。一番近い人が勝ち',
  note: '●は2秒だけ表示されます。一番近い人に+2点、ぴったりならさらに+1点。',
  round: (ctx, g) => {
    const n = 12 + Math.floor(Math.random() * (10 + g.round * 8));
    const dots = Array.from({ length: n }, () => [Math.round(4 + Math.random() * 92), Math.round(4 + Math.random() * 92), Math.floor(Math.random() * 4)]);
    return { dots, showAt: ctx.now() + 1500, __private: { n } };
  },
  prompt(ctx, g) {
    const t = ctx.now();
    const on = g.phase === 'reveal' || (t >= g.showAt && t < g.showAt + 2000);
    if (g.phase === 'pick' && t < g.showAt + 2100) setTimeout(ctx.rerender, Math.max(30, (t < g.showAt ? g.showAt : g.showAt + 2000) - t + 20));
    return h('div', { class: 'mx-dots' }, on ? (g.dots || []).map(([x, y, c]) => h('span', { class: 'mx-dot c' + c, style: `left:${x}%;top:${y}%` }))
      : h('div', { class: 'mx-hide' }, t < g.showAt ? 'よーく見て…' : '何個あった？'));
  },
  input: (ctx, g, view, send) => (ctx.now() < g.showAt + 2000 ? h('p', { class: 'center muted' }, '表示が終わったら入力') : textInput('kz-n', view, send, { number: true, placeholder: '数を入力', max: 3 })),
  accept: (g, v) => (Number.isInteger(v) && v >= 0 && v < 1000 ? v : undefined),
  score(g, picks) {
    const n = g.__private.n;
    const best = Math.min(...Object.values(picks).map((v) => Math.abs(v - n)));
    const gain = {};
    idsOf(g).forEach((id) => { const v = picks[id]; gain[id] = v == null ? 0 : (Math.abs(v - n) === best ? 2 : 0) + (v === n ? 1 : 0); });
    return { gain, extra: { n } };
  },
  reveal: (ctx, g) => h('div', { class: 'stack' },
    h('div', { class: 'card center pop' }, h('div', { class: 'muted small' }, '正解は'), h('div', { class: 'mx-big' }, `${g.n}個`)),
    h('div', { class: 'mx-list' }, idsOf(g).map((id) => h('div', { class: 'mx-r' + ((g.gain || {})[id] ? ' win' : '') }, h('span', null, nameOf(ctx, id)), h('b', null, g.picks[id] != null ? `${g.picks[id]}個` : '－'))))),
});

// ---------- ひとりだけ ----------
const HITORI = [
  '赤い食べ物', '丸いもの', '空を飛ぶもの', '学校にあるもの', '冷たいもの', '海の生き物', '野菜', '果物', 'スポーツ', '楽器',
  '虫', '乗り物', 'お菓子', '国の名前', '色', '寿司ネタ', '鳥', '職業', '文房具', 'キッチンにあるもの', '遊園地の乗り物',
  '白いもの', '甘いもの', '四角いもの', 'お弁当のおかず', '飲み物', '花', '家電', '冬のもの', '夏のもの',
];
simul({
  id: 'hitori', name: 'ひとりだけ', icon: '☝️', min: 3, rounds: 6, champion: 'ひねくれ王',
  description: 'お題に合う言葉を書く。だれともかぶらなければ得点！以心伝心の逆バージョン',
  note: 'ほかの人と同じ答え（ひらがな・カタカナの違いは同じ扱い）は0点。だれともかぶらなければ+1点。お題に合わない答えはホストが判断してね。',
  round: (ctx, g) => { const r = fromBank(HITORI, g.used, (q) => ({ q })); return { q: r.q, used: [...g.used, r.key] }; },
  prompt: (ctx, g) => h('div', { class: 'card center mx-q' }, h('div', { class: 'muted small' }, 'だれとも同じにならない答えを！'), h('div', { class: 'mx-qt' }, g.q)),
  input: (ctx, g, view, send) => textInput('ht-' + g.round, view, send, { placeholder: '答えを入力' }),
  accept: (g, v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 20) : undefined),
  score(g, picks) {
    const cnt = {};
    Object.values(picks).forEach((v) => { cnt[norm(v)] = (cnt[norm(v)] || 0) + 1; });
    const gain = {};
    idsOf(g).forEach((id) => { gain[id] = picks[id] && cnt[norm(picks[id])] === 1 ? 1 : 0; });
    return { gain };
  },
  reveal: (ctx, g) => h('div', { class: 'mx-list' }, idsOf(g).map((id) => h('div', { class: 'mx-r' + ((g.gain || {})[id] ? ' win' : ' ng') }, h('span', null, nameOf(ctx, id)), h('b', null, g.picks[id] || '－'), h('span', { class: 'muted small' }, (g.gain || {})[id] ? 'ひとりだけ！' : g.picks[id] ? 'かぶり' : '')))),
});

// ---------- ハイ＆ロー ----------
const CARD = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const SUITS = ['♠', '♥', '♦', '♣'];
simul({
  id: 'highlow', name: 'ハイ＆ロー', icon: '🃏', min: 1, rounds: 10, champion: '勝負師',
  description: '今のカードより次が大きい？小さい？全員で同時に予想。当たった人に得点',
  note: 'A=1〜K=13。同じ数字が出たら全員はずれ。予想の逆張りも作戦のうち。',
  round: (ctx, g) => {
    const cur = g.next || 1 + Math.floor(Math.random() * 13);
    const next = 1 + Math.floor(Math.random() * 13);
    return { cur, cs: g.ns != null ? g.ns : Math.floor(Math.random() * 4), next: null, __private: { next, ns: Math.floor(Math.random() * 4) } };
  },
  prompt: (ctx, g) => h('div', { class: 'card center' },
    h('div', { class: 'hl-cards' },
      h('div', { class: 'hl-card s' + g.cs }, SUITS[g.cs], h('b', null, CARD[g.cur])),
      h('div', { class: 'hl-arrow' }, '→'),
      g.phase === 'reveal' ? h('div', { class: 'hl-card pop s' + g.ns }, SUITS[g.ns], h('b', null, CARD[g.next])) : h('div', { class: 'hl-card back' }, '？'))),
  input: (ctx, g, view, send) => h('div', { class: 'mx-two' },
    button('⬆ 大きい', () => send('h'), 'big' + (view.sent === 'h' ? ' primary' : '')),
    button('⬇ 小さい', () => send('l'), 'big' + (view.sent === 'l' ? ' primary' : ''))),
  accept: (g, v) => (v === 'h' || v === 'l' ? v : undefined),
  score(g, picks) {
    const { next, ns } = g.__private;
    const res = next > g.cur ? 'h' : next < g.cur ? 'l' : 'e';
    const gain = {};
    idsOf(g).forEach((id) => { gain[id] = picks[id] === res ? 1 : 0; });
    return { gain, extra: { next, ns, res } };
  },
  reveal: (ctx, g) => h('div', { class: 'mx-list' },
    h('div', { class: 'center mx-verdict' }, g.res === 'e' ? '同じ数字！全員はずれ' : g.res === 'h' ? '大きい が正解' : '小さい が正解'),
    idsOf(g).map((id) => h('div', { class: 'mx-r' + ((g.gain || {})[id] ? ' win' : '') }, h('span', null, nameOf(ctx, id)), h('b', null, g.picks[id] === 'h' ? '⬆' : g.picks[id] === 'l' ? '⬇' : '－')))),
});

// ---------- 価値観ランキング ----------
const SETS = [
  ['カレー', 'ラーメン', '寿司', '焼肉'], ['海', '山', '温泉', '遊園地'], ['犬', '猫', 'ウサギ', 'ハムスター'], ['春', '夏', '秋', '冬'],
  ['お金', '時間', '友達', '健康'], ['ゲーム', 'マンガ', '映画', '音楽'], ['朝ごはん', '昼ごはん', '夜ごはん', 'おやつ'], ['電車', '車', '自転車', '飛行機'],
  ['チョコ', 'ポテチ', 'アイス', 'グミ'], ['赤', '青', '黄', '緑'], ['サッカー', '野球', 'バスケ', 'テニス'], ['透明人間', '空を飛ぶ', '瞬間移動', '時間停止'],
  ['いちご', 'メロン', 'ぶどう', 'もも'], ['ピザ', 'ハンバーガー', 'パスタ', 'オムライス'], ['ディズニー', 'USJ', '水族館', '動物園'], ['からあげ', 'ハンバーグ', 'エビフライ', 'ぎょうざ'],
];
simul({
  id: 'ranking', name: '価値観ランキング', icon: '🥇', min: 3, rounds: 5, champion: 'いちばんの理解者',
  description: '主役が4つを好きな順に並べる。ほかの人は主役の並べ方を予想して当てる',
  note: '主役は毎ラウンド交代。順位がひとつ合うごとに+1点。主役は「全部当てた人がいたら」+2点。',
  round: (ctx, g) => { const r = fromBank(SETS, g.used, (items) => ({ items })); return { items: r.items, star: g.players[(g.round - 1) % g.players.length], used: [...g.used, r.key] }; },
  prompt: (ctx, g) => h('div', { class: 'card center mx-q' }, h('div', { class: 'muted small' }, 'このラウンドの主役'), h('div', { class: 'mx-qt' }, `${nameOf(ctx, g.star)}${g.star === ctx.me ? '（あなた）' : ''}`),
    h('div', { class: 'muted small' }, g.star === ctx.me ? '好きな順にタップして並べてね' : `${nameOf(ctx, g.star)} が好きな順を予想してタップ`)),
  input(ctx, g, view, send) {
    view.order = view.order && view.order.length <= 4 && view.r === g.round ? view.order : [];
    view.r = g.round;
    return h('div', { class: 'card stack' },
      h('div', { class: 'rk-items' }, g.items.map((it, i) => {
        const pos = view.order.indexOf(i);
        return button(pos >= 0 ? `${pos + 1}位　${it}` : it, () => {
          if (pos >= 0) view.order = view.order.slice(0, pos); else view.order = [...view.order, i];
          if (view.order.length === 4) send(view.order); else ctx.rerender();
        }, 'rk-it' + (pos >= 0 ? ' primary' : ''));
      })),
      h('div', { class: 'muted small center' }, view.order.length === 4 ? '送信しました（タップで並べ直しOK）' : '1位から順にタップ（もう一度タップで取り消し）'));
  },
  accept: (g, v) => (Array.isArray(v) && v.length === 4 && new Set(v).size === 4 && v.every((x) => [0, 1, 2, 3].includes(x)) ? v : undefined),
  score(g, picks) {
    const ans = picks[g.star];
    const gain = {};
    let perfect = 0;
    idsOf(g).forEach((id) => {
      if (id === g.star || !ans || !picks[id]) { gain[id] = 0; return; }
      gain[id] = picks[id].filter((x, i) => ans[i] === x).length;
      if (gain[id] === 4) perfect++;
    });
    if (ans) gain[g.star] = perfect ? 2 : 0;
    return { gain };
  },
  reveal(ctx, g) {
    const ans = g.picks[g.star];
    return h('div', { class: 'stack' },
      h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, `${nameOf(ctx, g.star)} の答え`),
        ans ? h('ol', { class: 'rk-ans' }, ans.map((i) => h('li', null, g.items[i]))) : h('p', { class: 'muted' }, '主役が答えませんでした')),
      h('div', { class: 'mx-list' }, idsOf(g).filter((id) => id !== g.star).map((id) => h('div', { class: 'mx-r' + ((g.gain || {})[id] ? ' win' : '') },
        h('span', null, nameOf(ctx, id)), h('b', { class: 'small' }, g.picks[id] ? g.picks[id].map((i) => g.items[i]).join(' > ') : '－'), h('span', { class: 'muted small' }, `${(g.gain || {})[id] || 0}こ一致`)))));
  },
});
})();
