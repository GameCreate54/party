// ===== トーク・推理ゲーム5種 =====
// スパイを探せ・絵文字で伝えて・2つの本当と1つのウソ・わたしは誰でしょう・20の質問
(() => {
const { h, button, stepper, segmented, shuffle, pick, inputBox, drafts, toast } = window.Party.ui;
const { nameOf, activeIds, scoreList, overView, doneChips, playerCountError } = window.Party.kit;
const reg = window.Party.register;
const zero = (ids) => Object.fromEntries(ids.map((id) => [id, 0]));
const note = (t) => h('p', { class: 'muted small', style: 'margin:0' }, t);
const addScores = (scores, gain) => Object.fromEntries(Object.keys(scores).map((id) => [id, (scores[id] || 0) + ((gain || {})[id] || 0)]));
const norm = (s) => String(s || '').normalize('NFKC').toLowerCase()
  .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
  .replace(/[\s。、!?！？ー〜~・]/g, '');
function row(id, ph, onSend, opts = {}) {
  const submit = () => { const v = (drafts[id] || '').trim(); if (!v) return; drafts[id] = ''; const el = document.getElementById(id); if (el) el.value = ''; onSend(v); };
  return h('div', { class: 'mx-row' }, inputBox(id, { placeholder: ph, maxlength: opts.max || 40, onEnter: submit, keepFocus: true, enterkeyhint: 'send' }), button(opts.label || '送信', submit, 'primary'));
}
const timerEl = (end, attr) => h('span', { class: 'qz-time', [attr]: end }, '');
const clocks = {};
function clock(attr, ref) {
  if (clocks[attr]) return;
  clocks[attr] = setInterval(() => {
    document.querySelectorAll(`[${attr}]`).forEach((el) => {
      if (!ref.now) return;
      const left = Math.max(0, Number(el.getAttribute(attr)) - ref.now());
      const t = `⏱ ${Math.floor(left / 60000)}:${String(Math.floor(left / 1000) % 60).padStart(2, '0')}`;
      if (el.textContent !== t) el.textContent = t;
    });
  }, 250);
}

// ================= スパイを探せ =================
(() => {
  const PLACES = ['学校', '病院', '遊園地', '空港', '映画館', '図書館', '海水浴場', '動物園', '寿司屋', '宇宙ステーション', '警察署', '結婚式場',
    '温泉旅館', 'コンビニ', '美容院', 'サーカス', '潜水艦', 'お化け屋敷', '野球場', '銀行', 'キャンプ場', 'ラーメン屋', '水族館', 'カラオケ'];
  const view = { now: null, voted: null, r: null };
  clock('data-spy-end', view);
  function newRound(ctx, g, round) {
    const spy = pick(g.players);
    const place = pick(PLACES);
    const secrets = Object.fromEntries(g.players.map((id) => [id, { round, spy: id === spy ? 1 : 0, place: id === spy ? null : place }]));
    return { game: { ...g, phase: 'talk', round, endAt: ctx.now() + g.mins * 60000, done: null, accused: null, spy: null, place: null, guess: null, gain: null, choices: shuffle(PLACES) }, private: { spy, place, votes: {} }, secrets };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 3, mins: Number(ctx.settings.mins) || 5 }, 1);
  }
  function result(ctx, g, pv, winner) {
    const gain = Object.fromEntries(g.players.map((id) => [id, winner === 'spy' ? (id === pv.spy ? 3 : 0) : (id === pv.spy ? 0 : 1)]));
    return { game: { ...g, phase: 'result', winner, place: pv.place, spy: pv.spy, gain, scores: addScores(g.scores, gain) }, private: null, secrets: null };
  }
  function endVote(ctx, g, votesIn) {
    const pv = ctx.private || {};
    const cnt = {};
    Object.values(votesIn || {}).forEach((v) => { cnt[v] = (cnt[v] || 0) + 1; });
    const max = Math.max(0, ...Object.values(cnt));
    const tops = Object.keys(cnt).filter((k) => cnt[k] === max);
    const accused = tops.length === 1 ? tops[0] : null;
    const ng = { ...g, accused, spy: pv.spy };
    if (accused && accused === pv.spy) return { game: { ...ng, phase: 'guess' }, private: pv };
    return result(ctx, ng, pv, 'spy');
  }
  reg({
    id: 'spy', name: 'スパイを探せ', icon: '🕵️',
    description: '全員に同じ「場所」が配られるが、スパイだけは知らない。通話で質問し合ってスパイを見つけ出せ',
    defaultSettings: () => ({ rounds: 3, mins: 5 }),
    validate: (ctx) => playerCountError(ctx, 3),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 3, mins: 5, ...ctx.settings };
      return h('div', { class: 'settings' },
        h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'ラウンド数'), stepper(Number(s.rounds), 1, 10, (rounds) => set({ rounds }), editable)),
        h('div', { class: 'row col' }, h('span', { class: 'row-label' }, '話し合いの時間'), segmented([{ value: 3, label: '3分' }, { value: 5, label: '5分' }, { value: 8, label: '8分' }], Number(s.mins), (mins) => set({ mins }), editable)),
        note('通話で「そこってよく行く？」のように場所について質問し合う。スパイは話を合わせてバレないように。投票でスパイを当てても、スパイが場所を当てたらスパイの勝ち（3人から）。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      const pv = ctx.private || {};
      const isHost = a.from === ctx.hostId;
      if (a.type === 'again' && isHost && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && isHost && g.phase === 'result') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (a.type === 'tovote' && isHost && g.phase === 'talk') return { game: { ...g, phase: 'vote' } };
      if (a.type === 'vote' && g.phase === 'vote' && g.players.includes(a.from) && g.players.includes(a.to) && a.to !== a.from) {
        const votes = { ...(pv.votes || {}), [a.from]: a.to };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => votes[id])) return endVote({ ...ctx, private: { ...pv, votes } }, ng, votes);
        return { game: ng, private: { ...pv, votes } };
      }
      if (a.type === 'close' && isHost && g.phase === 'vote') return endVote(ctx, g, pv.votes);
      if (a.type === 'guess' && g.phase === 'guess' && a.from === pv.spy) return result(ctx, { ...g, guess: a.place }, pv, a.place === pv.place ? 'spy' : 'team');
      return null;
    },
    tick(ctx) {
      const g = ctx.game;
      if (g && g.phase === 'talk' && ctx.now() >= g.endAt) return { game: { ...g, phase: 'vote' } };
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      view.now = ctx.now;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🕵️', topLabel: '名探偵（または名スパイ）' });
      if (view.r !== g.round) { view.r = g.round; view.voted = null; }
      const sec = ctx.secret && ctx.secret.round === g.round ? ctx.secret : null;
      const roleCard = sec ? h('div', { class: 'card center spy-role' + (sec.spy ? ' spy' : '') },
        sec.spy ? [h('div', { class: 'spy-big' }, '🕵️ あなたはスパイ'), h('div', { class: 'muted small' }, '場所はわからない。話を合わせて、場所を推理しよう')]
          : [h('div', { class: 'muted small' }, '場所は'), h('div', { class: 'spy-big' }, sec.place), h('div', { class: 'muted small' }, 'この中に1人、場所を知らないスパイがいる')]) : null;
      const head = h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `ラウンド ${g.round} / ${g.rounds}`), g.phase === 'talk' ? timerEl(g.endAt, 'data-spy-end') : null);
      if (g.phase === 'talk') {
        return h('div', { class: 'stack' }, head, roleCard,
          note('通話で順番に質問し合おう（例：「そこには何を着ていく？」）。時間になるか、ホストが投票へ進めたら投票。'),
          ctx.isHost ? button('話し合いを終えて投票へ', () => ctx.send('tovote'), 'primary big') : null);
      }
      if (g.phase === 'vote') {
        return h('div', { class: 'stack' }, head, roleCard,
          h('div', { class: 'card stack' }, h('div', { class: 'row-label center' }, view.voted ? `${nameOf(ctx, view.voted)} に投票（変更OK）` : 'スパイだと思う人に投票'),
            h('div', { class: 'vote-grid' }, g.players.filter((id) => id !== ctx.me).map((id) => h('button', { type: 'button', class: 'vote-btn' + (view.voted === id ? ' on' : ''), onclick: () => { view.voted = id; ctx.send('vote', { to: id }); ctx.rerender(); } }, nameOf(ctx, id))))),
          h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '投票した人'), doneChips(ctx, g.players, g.done)),
          ctx.isHost ? h('div', { class: 'host-tools' }, button('締め切って開票', () => ctx.send('close'), 'ghost small')) : null);
      }
      if (g.phase === 'guess') {
        const isSpy = g.spy === ctx.me;
        return h('div', { class: 'stack' }, head,
          h('div', { class: 'card center pop' }, h('div', { class: 'spy-big' }, `スパイは ${nameOf(ctx, g.spy)}！`), h('div', { class: 'muted small' }, 'でもまだ終わらない。スパイが場所を当てたら逆転！')),
          isSpy ? h('div', { class: 'card stack' }, h('div', { class: 'row-label center' }, '場所はどこだった？'),
            h('div', { class: 'spy-places' }, (g.choices || []).map((p) => button(p, () => ctx.send('guess', { place: p }), 'small')))) : h('p', { class: 'center muted' }, 'スパイが場所を考えています…'));
      }
      return h('div', { class: 'stack' }, head,
        h('div', { class: 'card center pop' }, h('div', { class: 'spy-big' }, g.winner === 'spy' ? '🕵️ スパイの勝ち！' : '🎉 みんなの勝ち！'),
          h('div', null, `スパイは ${nameOf(ctx, g.spy)}・場所は「${g.place}」`),
          g.guess ? h('div', { class: 'muted small' }, `スパイの答え：「${g.guess}」`) : g.accused ? h('div', { class: 'muted small' }, `一番票を集めたのは ${nameOf(ctx, g.accused)}`) : h('div', { class: 'muted small' }, '票が割れた！')),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
        ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のラウンドへ', () => ctx.send('next'), 'primary big') : null);
    },
  });
})();

// ================= 絵文字で伝えて =================
(() => {
  const WORDS = ['ラーメン', '花火|はなび', '雪だるま|ゆきだるま', 'サンタクロース|さんた|サンタ', '宇宙人|うちゅうじん', '動物園|どうぶつえん', '遊園地|ゆうえんち', '誕生日|たんじょうび|バースデー',
    '桃太郎|ももたろう', '浦島太郎|うらしまたろう', '富士山|ふじさん', '海水浴|かいすいよく', 'お正月|おしょうがつ|正月', 'ハロウィン', 'お化け屋敷|おばけやしき', '新幹線|しんかんせん',
    'カレーライス|カレー', '焼き肉|やきにく|焼肉', 'キャンプ', '野球|やきゅう', 'サッカー', '温泉|おんせん', '結婚式|けっこんしき', '病院|びょういん',
    '台風|たいふう', '虹|にじ', 'シンデレラ', '忍者|にんじゃ', 'ゾンビ', 'お月見|おつきみ|月見', '目覚まし時計|めざましどけい|目覚まし', 'ピクニック'];
  const PAL = ['😀', '😂', '😭', '😡', '😱', '😴', '🤔', '😍', '👍', '👎', '👋', '🙏', '💪', '👀', '👂', '👄', '🦷', '❤', '💔', '⭐',
    '🌞', '🌙', '⛅', '🌧', '⛄', '🔥', '💧', '🌊', '⚡', '🌈', '🌸', '🌳', '🍎', '🍌', '🍜', '🍙', '🍣', '🍖', '🍰', '🍺',
    '🐶', '🐱', '🐵', '🐼', '🐸', '🐟', '🐦', '🐍', '🦁', '🐘', '👶', '👦', '👧', '👨', '👩', '👴', '👻', '👽', '🤖', '🎅',
    '🏠', '🏫', '🏥', '🏯', '🗻', '🏖', '🎡', '🎢', '🚗', '🚃', '🚀', '✈', '🚢', '⚽', '⚾', '🎮', '🎤', '🎁', '🎂', '🎃',
    '🎆', '💤', '💰', '📱', '⏰', '🔑', '✂', '🍳', '🛁', '🔪', '🗡', '📚', '✏', '➕', '➖', '❌', '⭕', '❓', '⬆', '⬇'];
  const view = { r: null, now: null, msg: [] };
  clock('data-emo-end', view);
  function newRound(ctx, g, round) {
    const teller = g.players[(round - 1) % g.players.length];
    const used = new Set(g.used || []);
    let pool = WORDS.map((_, i) => i).filter((i) => !used.has(i));
    if (!pool.length) pool = WORDS.map((_, i) => i);
    const wi = pick(pool);
    const parts = WORDS[wi].split('|');
    return { game: { ...g, phase: 'play', round, teller, msg: null, correct: null, chat: null, word: null, used: [...(g.used || []), wi], endAt: ctx.now() + 120000 }, private: { answers: parts.map(norm), word: parts[0] }, secrets: { [teller]: { round, word: parts[0] } } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: players.length * (Number(ctx.settings.laps) || 1), used: [] }, 1);
  }
  const end = (ctx, g) => ({ game: { ...g, phase: 'reveal', word: (ctx.private || {}).word }, private: null, secrets: null });
  reg({
    id: 'emoji', name: '絵文字で伝えて', icon: '😀',
    description: 'お題を絵文字だけで伝える！みんなは絵文字を見て答えを当てよう',
    defaultSettings: () => ({ laps: 1 }),
    validate: (ctx) => playerCountError(ctx, 2),
    renderSettings(ctx, { editable, set }) {
      const s = { laps: 1, ...ctx.settings };
      return h('div', { class: 'settings' }, h('div', { class: 'row' }, h('span', { class: 'row-label' }, '伝える回数（1人あたり）'), stepper(Number(s.laps), 1, 3, (laps) => set({ laps }), editable)),
        note('伝える人は絵文字ボタンだけで説明（文字は使えない）。当てた人+2点、伝えた人は当ててもらえた人数ぶん+1点。1回2分。'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      const isHost = a.from === ctx.hostId;
      if (a.type === 'again' && isHost && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && isHost && g.phase === 'reveal') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (g.phase !== 'play') return null;
      if (a.type === 'skip' && (isHost || a.from === g.teller)) return end(ctx, g);
      if (a.type === 'emo' && a.from === g.teller && Array.isArray(a.msg)) return { game: { ...g, msg: a.msg.filter((e) => PAL.includes(e)).slice(0, 30) } };
      if (a.type === 'guess' && a.from !== g.teller && g.players.includes(a.from) && !(g.correct || {})[a.from]) {
        const t = String(a.text || '').trim().slice(0, 20);
        if (((ctx.private || {}).answers || []).includes(norm(t))) {
          const correct = { ...(g.correct || {}), [a.from]: true };
          const scores = { ...g.scores, [a.from]: (g.scores[a.from] || 0) + 2, [g.teller]: (g.scores[g.teller] || 0) + 1 };
          const ng = { ...g, correct, scores, chat: [...(g.chat || []), { by: a.from, ok: 1 }].slice(-20) };
          if (activeIds(ctx, g.players).filter((id) => id !== g.teller).every((id) => correct[id])) return end(ctx, ng);
          return { game: ng };
        }
        return { game: { ...g, chat: [...(g.chat || []), { by: a.from, t }].slice(-20) } };
      }
      return null;
    },
    tick(ctx) { const g = ctx.game; return g && g.phase === 'play' && ctx.now() >= g.endAt ? end(ctx, g) : null; },
    render(ctx) {
      const g = ctx.game;
      view.now = ctx.now;
      if (g.phase === 'over') return overView(ctx, g, { crown: '😀', topLabel: '絵文字マスター' });
      const me = ctx.me;
      const teller = g.teller === me && g.phase === 'play';
      if (view.r !== g.round) { view.r = g.round; view.msg = []; drafts['emo-g'] = ''; }
      const word = ctx.secret && ctx.secret.round === g.round ? ctx.secret.word : null;
      const msg = teller ? view.msg : g.msg || [];
      const push = (list) => { view.msg = list; ctx.send('emo', { msg: list }); ctx.rerender(); };
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `${g.round} / ${g.rounds}`), g.phase === 'play' ? timerEl(g.endAt, 'data-emo-end') : null),
        h('div', { class: 'card center' }, g.phase === 'reveal' ? [h('div', { class: 'muted small' }, '正解は'), h('div', { class: 'spy-big' }, g.word)]
          : teller ? [h('div', { class: 'muted small' }, 'あなたが伝える番！お題'), h('div', { class: 'spy-big' }, word || '…')]
            : [h('div', { class: 'muted small' }, `${nameOf(ctx, g.teller)} が伝えています`), h('div', { class: 'spy-big' }, (g.correct || {})[me] ? '正解！' : '？？？')]),
        h('div', { class: 'card emo-msg' }, msg.length ? msg.join('') : h('span', { class: 'muted small' }, teller ? '下の絵文字をタップして並べてね' : 'まだ絵文字がありません')),
        teller ? h('div', { class: 'stack' },
          h('div', { class: 'emo-pal' }, PAL.map((e) => h('button', { type: 'button', class: 'emo-b', onclick: () => push([...view.msg, e].slice(0, 30)) }, e))),
          h('div', { class: 'mx-two' }, button('⌫ 1つ消す', () => push(view.msg.slice(0, -1)), 'small'), button('全部消す', () => push([]), 'small')),
          button('パス（降参）', () => ctx.send('skip'), 'ghost small')) : null,
        !teller && g.phase === 'play' && !(g.correct || {})[me] ? row('emo-g', '答えを入力（何回でもOK）', (t) => ctx.send('guess', { text: t }), { max: 20 }) : null,
        h('div', { class: 'oe-chat' }, [...(g.chat || [])].reverse().slice(0, 6).map((c) => h('div', { class: 'oe-msg' + (c.ok ? ' ok' : '') }, h('b', null, nameOf(ctx, c.by)), c.ok ? ' が正解！' : '：' + c.t))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)),
        ctx.isHost && g.phase === 'reveal' ? button(g.round >= g.rounds ? '最終結果へ' : '次へ', () => ctx.send('next'), 'primary big') : null,
        ctx.isHost && g.phase === 'play' && !teller ? h('div', { class: 'host-tools' }, button('この回を終わらせる', () => ctx.send('skip'), 'ghost small')) : null);
    },
  });
})();

// ================= 2つの本当と1つのウソ =================
(() => {
  const view = { r: null, lie: null, voted: null };
  function newRound(ctx, g, round) {
    return { game: { ...g, phase: 'write', round, star: g.players[(round - 1) % g.players.length], items: null, done: null, votes: null, lie: null, gain: null }, private: { votes: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: players.length }, 1);
  }
  function reveal(ctx, g, votes) {
    const pv = ctx.private || {};
    const gain = zero(g.players);
    Object.entries(votes || {}).forEach(([id, v]) => { if (v === pv.lie) gain[id] += 1; else gain[g.star] += 1; });
    return { game: { ...g, phase: 'reveal', votes, lie: pv.lie, gain, scores: addScores(g.scores, gain) }, private: null };
  }
  const nextRound = (ctx, g) => (g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1));
  reg({
    id: 'uso3', name: '2つの本当と1つのウソ', icon: '🤔',
    description: '主役が自分について3つの話を書く。そのうち1つはウソ。みんなはどれがウソか当てる',
    defaultSettings: () => ({}),
    validate: (ctx) => playerCountError(ctx, 3),
    renderSettings: () => h('div', { class: 'settings' }, note('全員が1回ずつ主役になります。ウソを当てた人+1点、だまされた人1人につき主役+1点（3人から）。')),
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      const isHost = a.from === ctx.hostId;
      if (a.type === 'again' && isHost && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && isHost && g.phase === 'reveal') return nextRound(ctx, g);
      if (a.type === 'skip' && isHost && g.phase === 'write') return nextRound(ctx, g);
      if (a.type === 'write' && g.phase === 'write' && a.from === g.star) {
        const items = (a.items || []).map((t) => String(t || '').trim().slice(0, 50));
        if (items.length !== 3 || items.some((t) => !t) || ![0, 1, 2].includes(a.lie)) return null;
        const order = shuffle([0, 1, 2]);
        return { game: { ...g, phase: 'vote', items: order.map((i) => items[i]) }, private: { lie: order.indexOf(a.lie), votes: {} } };
      }
      const pv = ctx.private || {};
      if (a.type === 'vote' && g.phase === 'vote' && a.from !== g.star && g.players.includes(a.from) && [0, 1, 2].includes(a.i)) {
        const votes = { ...(pv.votes || {}), [a.from]: a.i };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).filter((id) => id !== g.star).every((id) => votes[id] != null)) return reveal({ ...ctx, private: { ...pv, votes } }, ng, votes);
        return { game: ng, private: { ...pv, votes } };
      }
      if (a.type === 'close' && isHost && g.phase === 'vote') return reveal(ctx, g, pv.votes);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🤔', topLabel: 'ウソ見抜き＆ウソつき王' });
      const me = ctx.me;
      const star = g.star === me;
      if (view.r !== g.round) { view.r = g.round; view.lie = null; view.voted = null; ['u3-0', 'u3-1', 'u3-2'].forEach((k) => { drafts[k] = ''; }); }
      const head = h('div', { class: 'card center' }, h('div', { class: 'muted small' }, `${g.round} / ${g.rounds}・このラウンドの主役`), h('div', { class: 'spy-big' }, nameOf(ctx, g.star) + (star ? '（あなた）' : '')));
      if (g.phase === 'write') {
        if (!star) return h('div', { class: 'stack' }, head, h('p', { class: 'center muted' }, `${nameOf(ctx, g.star)} が3つの話を書いています…`), ctx.isHost ? h('div', { class: 'host-tools' }, button('この人を飛ばす', () => ctx.send('skip'), 'ghost small')) : null);
        const submit = () => {
          const items = [0, 1, 2].map((i) => (drafts['u3-' + i] || '').trim());
          if (items.some((t) => !t)) { toast('3つとも書いてね'); return; }
          if (view.lie == null) { toast('どれがウソか選んでね'); return; }
          ctx.send('write', { items, lie: view.lie });
        };
        return h('div', { class: 'stack' }, head,
          h('div', { class: 'card stack' }, h('div', { class: 'row-label' }, '自分についての話を3つ（1つはウソ）'),
            [0, 1, 2].map((i) => h('div', { class: 'u3-row' }, inputBox('u3-' + i, { placeholder: `話${i + 1}（例：北海道に住んでいたことがある）`, maxlength: 50 }),
              button(view.lie === i ? 'ウソ ✓' : 'ウソ?', () => { view.lie = i; ctx.rerender(); }, 'small' + (view.lie === i ? ' ng' : '')))),
            button('出題する', submit, 'primary big')));
      }
      if (g.phase === 'vote') {
        return h('div', { class: 'stack' }, head,
          h('div', { class: 'og-list' }, (g.items || []).map((t, i) => h('button', { type: 'button', class: 'og-a' + (view.voted === i ? ' on' : ''), disabled: star,
            onclick: () => { view.voted = i; ctx.send('vote', { i }); ctx.rerender(); } }, `${i + 1}. ${t}`))),
          star ? h('p', { class: 'center muted' }, 'みんながウソを探しています…') : h('p', { class: 'center muted small', style: 'margin:0' }, 'ウソだと思うものをタップ（変更OK）'),
          h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '投票した人'), doneChips(ctx, g.players.filter((id) => id !== g.star), g.done)),
          ctx.isHost ? h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')) : null);
      }
      return h('div', { class: 'stack' }, head,
        h('div', { class: 'og-list' }, (g.items || []).map((t, i) => h('div', { class: 'og-a res' + (i === g.lie ? ' top' : '') },
          h('div', null, `${i === g.lie ? '🤥 ウソ：' : '⭕ 本当：'}${t}`),
          h('div', { class: 'og-by' }, h('span', null, Object.keys(g.votes || {}).filter((id) => g.votes[id] === i).map((id) => nameOf(ctx, id)).join('、') || 'だれも選ばず'))))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
        ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次の主役へ', () => ctx.send('next'), 'primary big') : null);
    },
  });
})();

// ================= わたしは誰でしょう =================
(() => {
  const QS = ['子どものころの夢は？', '最近ハマっているものは？', '無人島に1つだけ持っていくなら？', '人生で一番おいしかったものは？', '生まれ変わったら何になりたい？',
    'もし1億円あったら何に使う？', '一番好きな季節とその理由は？', '最近いちばん笑ったことは？', '自分の意外な特技は？', '行ってみたい国は？',
    '苦手な食べ物は？', '休みの日の過ごし方は？', '子どものころのあだ名は？', '一番好きなゲームは？', '寝る前に必ずすることは？'];
  const view = { r: null, sent: null, guess: {} };
  function newRound(ctx, g, round) {
    const q = QS[g.qorder[(round - 1) % g.qorder.length]];
    return { game: { ...g, phase: 'write', round, q, done: null, list: null, owner: null, guesses: null, gain: null }, private: { ans: {}, guesses: {} } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: Number(ctx.settings.rounds) || 3, qorder: shuffle(QS.map((_, i) => i)) }, 1);
  }
  function toGuess(ctx, g, ans) {
    const ids = shuffle(g.players.filter((id) => ans[id]));
    const list = ids.map((id, i) => ({ k: 'w' + i, t: ans[id] }));
    const owner = Object.fromEntries(ids.map((id, i) => ['w' + i, id]));
    return { game: { ...g, phase: 'guess', list, done: null }, private: { ans, owner, guesses: {} } };
  }
  function reveal(ctx, g, guesses) {
    const owner = (ctx.private || {}).owner || {};
    const gain = zero(g.players);
    Object.entries(guesses || {}).forEach(([id, m]) => { Object.entries(m || {}).forEach(([k, who]) => { if (owner[k] === who && owner[k] !== id) gain[id] += 1; }); });
    return { game: { ...g, phase: 'reveal', owner, guesses, gain, scores: addScores(g.scores, gain) }, private: null };
  }
  reg({
    id: 'watashi', name: 'わたしは誰でしょう', icon: '🎭',
    description: 'お題に全員が答えを書く。だれが書いたか伏せて表示されるので、書いた人を当てよう',
    defaultSettings: () => ({ rounds: 3 }),
    validate: (ctx) => playerCountError(ctx, 3),
    renderSettings(ctx, { editable, set }) {
      const s = { rounds: 3, ...ctx.settings };
      return h('div', { class: 'settings' }, h('div', { class: 'row' }, h('span', { class: 'row-label' }, 'お題の数'), stepper(Number(s.rounds), 1, 10, (rounds) => set({ rounds }), editable)),
        note('書いた人を当てるたびに+1点。仲間のことをどれだけ知ってる？（3人から）'));
    },
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      const pv = ctx.private || {};
      const isHost = a.from === ctx.hostId;
      if (a.type === 'again' && isHost && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && isHost && g.phase === 'reveal') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (a.type === 'write' && g.phase === 'write' && g.players.includes(a.from)) {
        const t = String(a.text || '').trim().slice(0, 40);
        if (!t) return null;
        const ans = { ...(pv.ans || {}), [a.from]: t };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => ans[id])) return toGuess(ctx, ng, ans);
        return { game: ng, private: { ...pv, ans } };
      }
      if (a.type === 'close' && isHost && g.phase === 'write') return toGuess(ctx, g, pv.ans || {});
      if (a.type === 'guess' && g.phase === 'guess' && g.players.includes(a.from) && a.map && typeof a.map === 'object') {
        const guesses = { ...(pv.guesses || {}), [a.from]: a.map };
        const ng = { ...g, done: { ...(g.done || {}), [a.from]: true } };
        if (activeIds(ctx, g.players).every((id) => guesses[id])) return reveal({ ...ctx, private: { ...pv, guesses } }, ng, guesses);
        return { game: ng, private: { ...pv, guesses } };
      }
      if (a.type === 'close' && isHost && g.phase === 'guess') return reveal(ctx, g, pv.guesses);
      return null;
    },
    render(ctx) {
      const g = ctx.game;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🎭', topLabel: 'みんなを一番わかってる人' });
      const me = ctx.me;
      if (view.r !== g.round) { view.r = g.round; view.sent = null; view.guess = {}; drafts['wt-a'] = ''; }
      const head = h('div', { class: 'card center og-q' }, h('div', { class: 'muted small' }, `お題 ${g.round} / ${g.rounds}`), h('div', { class: 'og-qt' }, g.q));
      if (g.phase === 'write') {
        return h('div', { class: 'stack' }, head,
          view.sent ? h('p', { class: 'center muted' }, `「${view.sent}」で送りました`) : null,
          row('wt-a', 'あなたの答え', (t) => { view.sent = t; ctx.send('write', { text: t }); ctx.rerender(); }),
          h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '書けた人'), doneChips(ctx, g.players, g.done)),
          ctx.isHost ? h('div', { class: 'host-tools' }, button('締め切って推理へ', () => ctx.send('close'), 'ghost small')) : null);
      }
      if (g.phase === 'guess') {
        const list = g.list || [];
        const mineK = (list.find((x) => x.t === view.sent) || {}).k;
        const need = list.filter((x) => x.k !== mineK);
        return h('div', { class: 'stack' }, head,
          note('それぞれの答えを書いたのはだれ？名前をタップ（自分の答えはそのまま）'),
          need.map((x) => h('div', { class: 'card wt-item' }, h('div', { class: 'wt-t' }, x.t),
            h('div', { class: 'chips' }, g.players.filter((id) => id !== me).map((id) => h('button', { type: 'button', class: 'chip' + (view.guess[x.k] === id ? ' on' : ''), onclick: () => { view.guess[x.k] = id; ctx.rerender(); } }, nameOf(ctx, id)))))),
          button(`この推理で決定（${Object.keys(view.guess).length}/${need.length}）`, () => ctx.send('guess', { map: view.guess }), 'primary big'),
          h('div', { class: 'card' }, h('div', { class: 'muted small', style: 'margin-bottom:6px' }, '決定した人'), doneChips(ctx, g.players, g.done)),
          ctx.isHost ? h('div', { class: 'host-tools' }, button('締め切って発表', () => ctx.send('close'), 'ghost small')) : null);
      }
      const owner = g.owner || {};
      const myG = (g.guesses || {})[me] || {};
      return h('div', { class: 'stack' }, head,
        h('div', { class: 'og-list' }, (g.list || []).map((x) => h('div', { class: 'og-a res' + (myG[x.k] === owner[x.k] ? ' top' : '') }, h('div', null, x.t),
          h('div', { class: 'og-by' }, h('span', null, '— ' + nameOf(ctx, owner[x.k])), h('b', null, myG[x.k] ? (myG[x.k] === owner[x.k] ? '⭕ 当たり' : `❌ ${nameOf(ctx, myG[x.k])}と予想`) : ''))))),
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '合計'), scoreList(ctx, g.players, g.scores, { extra: (id) => h('span', { class: 'kb-plus' }, '+' + ((g.gain || {})[id] || 0)) })),
        ctx.isHost ? button(g.round >= g.rounds ? '最終結果へ' : '次のお題へ', () => ctx.send('next'), 'primary big') : null);
    },
  });
})();

// ================= 20の質問 =================
(() => {
  const THEMES = ['ゾウ', 'ペンギン', '冷蔵庫|れいぞうこ', 'スマホ|スマートフォン|携帯', '富士山|ふじさん', 'ラーメン', '消しゴム|けしごむ', '自転車|じてんしゃ',
    'サンタクロース|サンタ', '傘|かさ', 'ピアノ', 'カブトムシ', '新幹線|しんかんせん', 'おにぎり|おむすび', '時計|とけい', '歯ブラシ|はぶらし', '雪|ゆき', '月|つき', 'うんち', 'ロボット'];
  const view = { now: null };
  clock('data-q20-end', view);
  function newRound(ctx, g, round) {
    const thinker = g.players[(round - 1) % g.players.length];
    const t = pick(THEMES).split('|');
    return { game: { ...g, phase: 'play', round, thinker, qs: null, guesses: null, solver: null, word: null, endAt: ctx.now() + 300000 }, private: { answers: t.map(norm), word: t[0] }, secrets: { [thinker]: { round, word: t[0] } } };
  }
  function newGame(ctx) {
    const players = ctx.players.map((p) => p.id);
    return newRound(ctx, { players, scores: zero(players), rounds: players.length }, 1);
  }
  const end = (ctx, g, solver) => {
    const scores = solver ? { ...g.scores, [solver]: (g.scores[solver] || 0) + 2, [g.thinker]: (g.scores[g.thinker] || 0) + 1 } : g.scores;
    return { game: { ...g, phase: 'reveal', solver: solver || null, word: (ctx.private || {}).word, scores }, private: null, secrets: null };
  };
  reg({
    id: 'q20', name: '20の質問', icon: '🔎',
    description: '出題者が思い浮かべたものを、「はい／いいえ」で答えられる質問20回以内で当てる',
    defaultSettings: () => ({}),
    validate: (ctx) => playerCountError(ctx, 2),
    renderSettings: () => h('div', { class: 'settings' }, note('出題者にだけお題が見える。みんなは「それは生き物？」のような質問を送り、出題者が はい／いいえ／どちらとも で答える。答えがわかったら「答える」。当てた人+2点、出題者+1点。全員が1回ずつ出題。')),
    start: (ctx) => newGame(ctx),
    handle(ctx, a) {
      const g = ctx.game;
      const isHost = a.from === ctx.hostId;
      if (a.type === 'again' && isHost && g.phase === 'over') return newGame(ctx);
      if (a.type === 'next' && isHost && g.phase === 'reveal') return g.round >= g.rounds ? { game: { ...g, phase: 'over' } } : newRound(ctx, g, g.round + 1);
      if (g.phase !== 'play') return null;
      const qs = g.qs || [];
      if (a.type === 'ask' && a.from !== g.thinker && g.players.includes(a.from) && qs.length < 20 && !qs.some((q) => !q.a)) {
        const t = String(a.text || '').trim().slice(0, 40);
        return t ? { game: { ...g, qs: [...qs, { by: a.from, t, a: null }] } } : null;
      }
      if (a.type === 'answer' && a.from === g.thinker && ['y', 'n', 'm'].includes(a.v)) {
        const i = qs.findIndex((q) => !q.a);
        if (i < 0) return null;
        return { game: { ...g, qs: qs.map((q, k) => (k === i ? { ...q, a: a.v } : q)) } };
      }
      if (a.type === 'guess' && a.from !== g.thinker && g.players.includes(a.from)) {
        const t = String(a.text || '').trim().slice(0, 20);
        if (!t) return null;
        if (((ctx.private || {}).answers || []).includes(norm(t))) return end(ctx, { ...g, guesses: [...(g.guesses || []), { by: a.from, t, ok: 1 }] }, a.from);
        return { game: { ...g, guesses: [...(g.guesses || []), { by: a.from, t }].slice(-20) } };
      }
      if (a.type === 'accept' && a.from === g.thinker) { const gs = g.guesses || []; const last = gs[gs.length - 1]; return last ? end(ctx, g, last.by) : null; }
      if (a.type === 'giveup' && (isHost || a.from === g.thinker)) return end(ctx, g, null);
      return null;
    },
    tick(ctx) { const g = ctx.game; return g && g.phase === 'play' && ctx.now() >= g.endAt ? end(ctx, g, null) : null; },
    render(ctx) {
      const g = ctx.game;
      view.now = ctx.now;
      if (g.phase === 'over') return overView(ctx, g, { crown: '🔎', topLabel: '名推理' });
      const me = ctx.me;
      const thinker = g.thinker === me;
      const qs = g.qs || [];
      const pending = qs.find((q) => !q.a);
      const word = ctx.secret && ctx.secret.round === g.round ? ctx.secret.word : null;
      const A = { y: '⭕ はい', n: '❌ いいえ', m: '🤷 どちらとも' };
      const gs = g.guesses || [];
      return h('div', { class: 'stack' },
        h('div', { class: 'qz-top' }, h('span', { class: 'round-pill' }, `${g.round} / ${g.rounds}・質問 ${qs.length}/20`), g.phase === 'play' ? timerEl(g.endAt, 'data-q20-end') : null),
        h('div', { class: 'card center' }, g.phase === 'reveal' ? [h('div', { class: 'muted small' }, '答えは'), h('div', { class: 'spy-big' }, g.word), h('div', null, g.solver ? `${nameOf(ctx, g.solver)} が正解！` : 'だれも当てられず…')]
          : thinker ? [h('div', { class: 'muted small' }, 'あなたが出題者。お題は'), h('div', { class: 'spy-big' }, word || '…')]
            : [h('div', { class: 'muted small' }, `${nameOf(ctx, g.thinker)} が思い浮かべているものは？`), h('div', { class: 'spy-big' }, '？？？')]),
        thinker && pending ? h('div', { class: 'card stack' }, h('div', { class: 'row-label center' }, `${nameOf(ctx, pending.by)}「${pending.t}」`),
          h('div', { class: 'q20-btns' }, Object.entries(A).map(([k, l]) => button(l, () => ctx.send('answer', { v: k }), 'primary')))) : null,
        !thinker && g.phase === 'play' ? h('div', { class: 'stack' },
          pending ? h('p', { class: 'center muted small', style: 'margin:0' }, '出題者が答えるのを待っています…') : qs.length < 20 ? row('q20-q', '質問（例：それは食べられる？）', (t) => ctx.send('ask', { text: t }), { label: '質問' }) : h('p', { class: 'center muted' }, '質問はもうできません。答えを当てよう！'),
          row('q20-g', '答えがわかったら入力', (t) => ctx.send('guess', { text: t }), { label: '答える', max: 20 })) : null,
        h('div', { class: 'card q20-log' }, qs.length ? [...qs].reverse().map((q, i) => h('div', { class: 'q20-l' }, h('span', { class: 'muted small' }, `${qs.length - i}.`), h('span', null, q.t), h('b', null, q.a ? A[q.a] : '…'))) : h('span', { class: 'muted small' }, 'まだ質問がありません')),
        gs.length ? h('div', { class: 'oe-chat' }, [...gs].reverse().slice(0, 5).map((x) => h('div', { class: 'oe-msg' + (x.ok ? ' ok' : '') }, h('b', null, nameOf(ctx, x.by)), `：${x.t}`, x.ok ? ' ⭕' : ''))) : null,
        thinker && g.phase === 'play' && gs.length ? button(`「${gs[gs.length - 1].t}」を正解にする`, () => ctx.send('accept'), 'ghost small') : null,
        h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '得点'), scoreList(ctx, g.players, g.scores)),
        g.phase === 'play' && (ctx.isHost || thinker) ? h('div', { class: 'host-tools' }, button('答えを発表して終わる', () => ctx.send('giveup'), 'ghost small')) : null,
        ctx.isHost && g.phase === 'reveal' ? button(g.round >= g.rounds ? '最終結果へ' : '次の出題者へ', () => ctx.send('next'), 'primary big') : null);
    },
  });
})();
})();
