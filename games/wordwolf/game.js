// ===== ワードウルフ =====
// ゲームモジュールの見本。新しいゲームもこれと同じ形（id / name / defaultSettings /
// validate / renderSettings / start / handle / render）で作れば、土台が動かしてくれる。
//
// - start / handle はホストの端末だけで動く。戻り値 { game, private, secrets, memory } を土台が保存する
//   game    … 全員に見える状態
//   private … ホストだけが読む情報（役職・両方のお題）
//   secrets … プレイヤーごとの秘密（{ playerId: { topic } }）。各自は自分の分だけ読む
//   memory  … 部屋に残しておく情報（最近出たお題など）
// - render は全員の端末で動き、ctx.send(type, data) で操作をホストに送る
(() => {
const { h, inputBox, button, stepper, segmented, shuffle, pick, drafts } = window.Party.ui;
const GENRES = window.Party.wordwolfTopics;

const MIN_PLAYERS = 3;
const MAX_PLAYERS = 8;

// 端末ごとの見た目だけの状態（お題カードを開いているか など）
const view = { reveal: false, peek: false, dealKey: '' };

const participants = (ctx) => ctx.players.filter((p) => !(ctx.settings.mode === 'gm' && p.id === ctx.hostId));
const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '（退出した人）';
// 人狼は市民より少なくする（3人なら1人、5人なら2人、8人なら3人まで）
const maxWolves = (n) => Math.max(1, Math.ceil(n / 2) - 1);

function pairPool(genre) {
  const list = genre === 'all' || !genre ? GENRES : GENRES.filter((g) => g.id === genre);
  return list.flatMap((g) => g.pairs.map((pair, i) => ({ key: `${g.id}:${i}`, pair, genre: g.name })));
}

// 最近出たペアはしばらく避けて選ぶ
function pickPair(ctx) {
  const pool = pairPool(ctx.settings.genre);
  const used = (ctx.memory && ctx.memory.used) || [];
  const fresh = pool.filter((p) => !used.includes(p.key));
  const chosen = pick(fresh.length ? fresh : pool);
  const keep = Math.min(30, Math.max(0, pool.length - 1));
  return { ...chosen, used: [...used.filter((k) => k !== chosen.key), chosen.key].slice(-keep) };
}

// お題を配る。fixed のときは [多数派, 少数派] の順をそのまま使う（GMモード）
function deal(base, pair, fixed) {
  const [majority, minority] = fixed || Math.random() < 0.5 ? pair : [pair[1], pair[0]];
  const wolves = shuffle(base.players).slice(0, base.wolfCount);
  const roles = {};
  const secrets = {};
  for (const id of base.players) {
    roles[id] = wolves.includes(id) ? 'wolf' : 'citizen';
    secrets[id] = { topic: roles[id] === 'wolf' ? minority : majority };
  }
  return {
    game: {
      ...base,
      phase: 'topic',
      dealId: Math.random().toString(36).slice(2, 8),
      ready: null,
      order: shuffle(base.players),
      round: 1,
      turn: 0,
      votes: null,
      candidates: null,
      firstTally: null,
      tally: null,
      executed: null,
      random: false,
      guess: null,
      answer: null,
      winner: null,
      reveal: null,
    },
    private: { roles, majority, minority },
    secrets,
  };
}

const baseOf = (g) => ({ players: g.players, rounds: g.rounds, wolfCount: g.wolfCount, mode: g.mode });

function startRound(ctx) {
  const s = ctx.settings;
  const base = {
    players: shuffle(participants(ctx).map((p) => p.id)),
    rounds: s.rounds,
    wolfCount: s.wolfCount,
    mode: s.mode,
  };
  if (s.mode === 'gm') {
    return { game: { ...base, phase: 'gmInput', dealId: Math.random().toString(36).slice(2, 8) }, private: null, secrets: null };
  }
  const chosen = pickPair(ctx);
  return { ...deal(base, chosen.pair, false), memory: { used: chosen.used } };
}

const toVote = (g) => ({ game: { ...g, phase: 'vote', candidates: g.players, votes: null, firstTally: null } });

function finish(ctx, g, winner) {
  const p = ctx.private || {};
  return {
    game: {
      ...g,
      phase: 'result',
      winner,
      reveal: { roles: p.roles || {}, majority: p.majority || '', minority: p.minority || '' },
    },
  };
}

function execute(ctx, g, id, counts, random) {
  const roles = (ctx.private && ctx.private.roles) || {};
  const next = { ...g, executed: id, tally: counts, random };
  if (roles[id] !== 'wolf') return finish(ctx, next, 'wolf');
  return { game: { ...next, phase: 'guess' } };
}

// 集計：最多得票が1人なら決定。同票なら決選投票、それでも同票ならランダム
function tally(ctx, g) {
  const counts = {};
  for (const c of g.candidates) counts[c] = 0;
  for (const target of Object.values(g.votes || {})) if (target in counts) counts[target]++;
  const max = Math.max(...Object.values(counts));
  const top = g.candidates.filter((c) => counts[c] === max);
  if (top.length === 1) return execute(ctx, g, top[0], counts, false);
  if (g.phase === 'vote') {
    return { game: { ...g, phase: 'runoff', candidates: top, votes: null, firstTally: counts } };
  }
  return execute(ctx, g, pick(top), counts, true);
}

function advanceTurn(g) {
  let turn = g.turn + 1;
  let round = g.round;
  if (turn >= g.order.length) { turn = 0; round += 1; }
  if (round > g.rounds) return toVote(g);
  return { game: { ...g, turn, round } };
}

function validate(ctx) {
  const n = participants(ctx).length;
  const gm = ctx.settings.mode === 'gm';
  if (n < MIN_PLAYERS) return gm ? `GM以外に${MIN_PLAYERS}人以上必要です` : `${MIN_PLAYERS}人以上で遊べます`;
  if (n > MAX_PLAYERS) return gm ? `GM以外のプレイヤーは${MAX_PLAYERS}人までです` : `プレイヤーは${MAX_PLAYERS}人までです（GMモードなら9人目をGMにできます）`;
  if (ctx.settings.wolfCount > maxWolves(n)) return `${n}人なら人狼は${maxWolves(n)}人までにしてください`;
  return null;
}

window.Party.register({
  id: 'wordwolf',
  name: 'ワードウルフ',
  icon: '🐺',
  description: '似たお題の中から少数派を見つけ出す',

  defaultSettings: () => ({ mode: 'play', wolfCount: 1, rounds: 3, genre: 'all' }),

  validate,

  renderSettings(ctx, { editable, set }) {
    const s = ctx.settings;
    const n = participants(ctx).length;
    const wolfMax = maxWolves(Math.max(n, MIN_PLAYERS));
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, 'モード'),
        segmented([{ value: 'play', label: 'ホストも参加' }, { value: 'gm', label: 'ホストがGM' }], s.mode, (mode) => set({ mode }), editable),
        h('small', { class: 'muted' }, s.mode === 'gm'
          ? 'ホストがお題を決めて進行と判定だけ行います'
          : 'お題はリストからランダム。ホストも一緒に遊びます')),
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, '人狼の人数', h('small', { class: 'muted' }, ` 市民 ${Math.max(0, n - s.wolfCount)}人`)),
        stepper(s.wolfCount, 1, wolfMax, (wolfCount) => set({ wolfCount }), editable)),
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, '発言の周回数'),
        stepper(s.rounds, 1, 5, (rounds) => set({ rounds }), editable)),
      s.mode !== 'gm' && h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, 'お題のジャンル'),
        h('div', { class: 'chips' },
          [{ id: 'all', name: '全部' }, ...GENRES].map((g) => h('button', {
            type: 'button',
            class: 'chip' + ((s.genre || 'all') === g.id ? ' on' : ''),
            disabled: !editable,
            onclick: () => set({ genre: g.id }),
          }, g.name)))));
  },

  start: (ctx) => startRound(ctx),

  // ホストの端末で、届いた操作を1つずつ処理する
  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const isHost = from === ctx.hostId;
    const inGame = (g.players || []).includes(from);

    switch (a.type) {
      case 'gmTopics': {
        if (g.phase !== 'gmInput' || !isHost) return null;
        const maj = String(a.majority || '').trim();
        const min = String(a.minority || '').trim();
        if (!maj || !min || maj === min) return null;
        return deal(baseOf(g), [maj, min], true);
      }
      case 'ready': {
        if (g.phase !== 'topic' || !inGame) return null;
        const ready = { ...(g.ready || {}), [from]: true };
        const all = g.players.every((id) => ready[id]);
        return { game: { ...g, ready, phase: all ? 'talk' : 'topic' } };
      }
      case 'forceTalk':
        if (g.phase !== 'topic' || !isHost) return null;
        return { game: { ...g, phase: 'talk' } };
      case 'endTurn': {
        if (g.phase !== 'talk') return null;
        if (a.turnKey !== `${g.round}-${g.turn}`) return null; // 二重タップ対策
        if (from !== g.order[g.turn] && !isHost) return null;
        return advanceTurn(g);
      }
      case 'goVote':
        if (g.phase !== 'talk' || !isHost) return null;
        return toVote(g);
      case 'vote': {
        if ((g.phase !== 'vote' && g.phase !== 'runoff') || !inGame) return null;
        if (!g.candidates.includes(a.target) || a.target === from) return null;
        const votes = { ...(g.votes || {}), [from]: a.target };
        const next = { ...g, votes };
        // 決選投票で、候補者が自分しかいない人は投票できないので数えない
        const voters = g.players.filter((id) => g.candidates.some((c) => c !== id));
        if (voters.every((id) => votes[id])) return tally(ctx, next);
        return { game: next };
      }
      case 'tally':
        if ((g.phase !== 'vote' && g.phase !== 'runoff') || !isHost) return null;
        return tally(ctx, g);
      case 'guess': {
        const text = String(a.text || '').trim();
        if (g.phase !== 'guess' || from !== g.executed || g.guess || !text) return null;
        return { game: { ...g, guess: text.slice(0, 30), answer: (ctx.private && ctx.private.majority) || '' } };
      }
      case 'judge':
        if (g.phase !== 'guess' || !isHost || !g.guess) return null;
        return finish(ctx, g, a.ok ? 'draw' : 'citizen');
      case 'again':
        if (g.phase !== 'result' || !isHost) return null;
        if (validate(ctx)) return null;
        return startRound(ctx);
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (view.dealKey !== g.dealId) {
      view.dealKey = g.dealId;
      view.reveal = false;
      view.peek = false;
    }
    const screens = { gmInput, topic, talk, vote, runoff: vote, guess, result };
    return (screens[g.phase] || (() => h('p', null, '…')))(ctx, g);
  },
});

// ---------- 画面 ----------
const isGM = (ctx, g) => g.mode === 'gm' && ctx.isHost;
const inGame = (ctx, g) => g.players.includes(ctx.me);
const rerenderAfter = (ctx, fn) => () => { fn(); ctx.rerender(); };

function waiting(text) {
  return h('div', { class: 'card center waiting' }, h('div', { class: 'dots' }, h('i'), h('i'), h('i')), h('p', null, text));
}

function progress(ctx, g, doneMap, label) {
  const done = g.players.filter((id) => doneMap && doneMap[id]).length;
  return h('div', { class: 'card' },
    h('h2', null, `${label} ${done}/${g.players.length}`),
    h('ul', { class: 'checklist' }, g.players.map((id) => h('li', { class: doneMap && doneMap[id] ? 'done' : '' },
      h('span', { class: 'check' }, doneMap && doneMap[id] ? '✓' : ''), nameOf(ctx, id)))));
}

function gmInput(ctx, g) {
  if (!isGM(ctx, g)) return waiting('GMがお題を準備しています');
  const fill = () => {
    const p = pick(pairPool('all')).pair;
    drafts['gm-maj'] = p[0];
    drafts['gm-min'] = p[1];
    ctx.rerender();
  };
  const submit = () => {
    const majority = (drafts['gm-maj'] || '').trim();
    const minority = (drafts['gm-min'] || '').trim();
    if (!majority || !minority || majority === minority) return alert('違う2つのお題を入れてください');
    ctx.send('gmTopics', { majority, minority });
  };
  return h('div', { class: 'stack' },
    h('div', { class: 'card' },
      h('h2', null, 'お題を決める'),
      h('p', { class: 'muted small' }, '似ているけど違う2つにすると盛り上がります'),
      h('label', { class: 'label', for: 'gm-maj' }, '多数派（市民）のお題'),
      inputBox('gm-maj', { placeholder: '例：うどん', maxlength: 20 }),
      h('label', { class: 'label', for: 'gm-min' }, '少数派（人狼）のお題'),
      inputBox('gm-min', { placeholder: '例：そば', maxlength: 20 }),
      button('リストからランダムに入れる', fill, 'ghost'),
      button('このお題で始める', submit, 'primary')));
}

function topicCard(ctx, g) {
  const topicWord = ctx.secret && ctx.secret.topic;
  return h('button', {
    type: 'button',
    class: 'topic-card' + (view.reveal ? ' open' : ''),
    onclick: rerenderAfter(ctx, () => { view.reveal = !view.reveal; }),
  },
    view.reveal
      ? [h('span', { class: 'small' }, 'あなたのお題'), h('strong', { class: 'word' }, topicWord || '…'), h('span', { class: 'small' }, 'タップで隠す')]
      : [h('span', { class: 'card-moon' }), h('strong', null, 'タップしてお題を見る'), h('span', { class: 'small' }, 'まわりに見られないように')]);
}

function gmTopics(ctx) {
  const p = ctx.private || {};
  return h('div', { class: 'card gm-topics' },
    h('div', null, h('small', { class: 'muted' }, '多数派'), h('strong', null, p.majority || '')),
    h('div', null, h('small', { class: 'muted' }, '少数派'), h('strong', null, p.minority || '')));
}

function topic(ctx, g) {
  const ready = g.ready || {};
  if (!inGame(ctx, g)) {
    return h('div', { class: 'stack' },
      isGM(ctx, g) && gmTopics(ctx),
      progress(ctx, g, ready, 'お題を確認中'),
      ctx.isHost && button('確認を待たずに発言へ進む', () => confirm('発言フェーズに進みますか？') && ctx.send('forceTalk'), 'ghost'));
  }
  return h('div', { class: 'stack' },
    h('p', { class: 'center lead' }, '自分のお題を確認しよう。少数派かどうかは、まだ誰にも分かりません。'),
    topicCard(ctx, g),
    ready[ctx.me]
      ? progress(ctx, g, ready, 'みんなの確認待ち')
      : button('確認した', () => ctx.send('ready'), 'primary'),
    ctx.isHost && ready[ctx.me] && button('確認を待たずに発言へ進む', () => confirm('発言フェーズに進みますか？') && ctx.send('forceTalk'), 'ghost'));
}

function talk(ctx, g) {
  const current = g.order[g.turn];
  const mine = current === ctx.me;
  const turnKey = `${g.round}-${g.turn}`;
  return h('div', { class: 'stack' },
    h('div', { class: 'round-pill' }, `${g.round} / ${g.rounds} 周目`),
    h('div', { class: 'card speaker' + (mine ? ' me' : '') },
      h('small', null, mine ? 'あなたの番です' : '今しゃべる人'),
      h('strong', null, nameOf(ctx, current)),
      mine && button('話し終わった', () => ctx.send('endTurn', { turnKey }), 'primary big')),
    h('ol', { class: 'order' }, g.order.map((id, i) => h('li', { class: i === g.turn ? 'now' : i < g.turn ? 'past' : '' },
      h('span', { class: 'num' }, i + 1), nameOf(ctx, id), id === ctx.me && h('span', { class: 'tag' }, 'あなた')))),
    inGame(ctx, g) && h('button', {
      type: 'button', class: 'peek' + (view.peek ? ' open' : ''),
      onclick: rerenderAfter(ctx, () => { view.peek = !view.peek; }),
    }, view.peek ? `自分のお題：${(ctx.secret && ctx.secret.topic) || '…'}` : '自分のお題をもう一度見る'),
    isGM(ctx, g) && gmTopics(ctx),
    ctx.isHost && h('div', { class: 'host-tools' },
      h('small', { class: 'muted' }, 'ホスト操作'),
      !mine && button(`${nameOf(ctx, current)}の番を飛ばす`, () => ctx.send('endTurn', { turnKey }), 'ghost small'),
      button('投票へ進む', () => confirm('発言を終えて投票に進みますか？') && ctx.send('goVote'), 'small')));
}

function vote(ctx, g) {
  const runoff = g.phase === 'runoff';
  const votes = g.votes || {};
  const myVote = votes[ctx.me];
  const canVote = inGame(ctx, g) && g.candidates.some((c) => c !== ctx.me);
  return h('div', { class: 'stack' },
    h('div', { class: 'card center' },
      h('h2', null, runoff ? '決選投票' : '投票'),
      h('p', { class: 'muted' }, runoff
        ? `同票だった${g.candidates.length}人から選んでください。また同票ならランダムで決まります。`
        : '少数派（人狼）だと思う人に投票しよう。全員が投票すると集計されます。')),
    canVote && h('div', { class: 'vote-grid' }, g.candidates.filter((c) => c !== ctx.me).map((c) => h('button', {
      type: 'button',
      class: 'vote-btn' + (myVote === c ? ' on' : ''),
      onclick: () => ctx.send('vote', { target: c }),
    }, nameOf(ctx, c), myVote === c && h('small', null, '投票中')))),
    inGame(ctx, g) && !canVote && h('p', { class: 'center muted' }, 'あなたは決選投票の候補なので、今回は投票できません'),
    progress(ctx, g, votes, '投票済み'),
    ctx.isHost && h('div', { class: 'host-tools' },
      h('small', { class: 'muted' }, 'ホスト操作'),
      button('今の票で集計する', () => confirm('まだ投票していない人がいても集計しますか？') && ctx.send('tally'), 'small ghost')));
}

function guess(ctx, g) {
  const name = nameOf(ctx, g.executed);
  const mine = g.executed === ctx.me;
  return h('div', { class: 'stack' },
    h('div', { class: 'card center reveal-wolf' },
      h('div', { class: 'big-icon' }, '🐺'),
      h('h2', null, mine ? 'あなたは少数派でした！' : `${name}は少数派でした！`),
      h('p', null, '市民のお題を当てれば引き分けに持ち込めます')),
    !g.guess && (mine
      ? h('div', { class: 'card' },
        h('label', { class: 'label', for: 'guess' }, '市民のお題は？'),
        inputBox('guess', { placeholder: 'みんなの発言から考えよう', maxlength: 30, onEnter: () => sendGuess(ctx) }),
        button('回答する', () => sendGuess(ctx), 'primary'))
      : waiting(`${name}が答えを考えています`)),
    g.guess && h('div', { class: 'card answer' },
      h('div', null, h('small', { class: 'muted' }, `${name}の回答`), h('strong', null, g.guess)),
      h('div', null, h('small', { class: 'muted' }, '市民のお題'), h('strong', null, g.answer))),
    g.guess && (ctx.isHost
      ? h('div', { class: 'judge' },
        h('p', { class: 'center muted' }, '当たっているか判定してください'),
        h('div', { class: 'judge-btns' },
          button('○ 正解', () => ctx.send('judge', { ok: true }), 'ok'),
          button('× 不正解', () => ctx.send('judge', { ok: false }), 'ng')))
      : waiting('ホストが判定しています')));
}

function sendGuess(ctx) {
  const text = (drafts.guess || '').trim();
  if (!text) return;
  ctx.send('guess', { text });
  drafts.guess = '';
}

function result(ctx, g) {
  const r = g.reveal || { roles: {} };
  const exName = nameOf(ctx, g.executed);
  const banner = {
    wolf: { title: '少数派の勝ち！', sub: `市民の${exName}が吊られました`, cls: 'wolf' },
    draw: { title: '引き分け！', sub: `${exName}が市民のお題を当てました`, cls: 'draw' },
    citizen: { title: '市民の勝ち！', sub: `少数派の${exName}を見つけました`, cls: 'citizen' },
  }[g.winner] || { title: '結果', sub: '', cls: '' };
  const tallyMap = g.tally || {};
  const err = ctx.isHost ? validate(ctx) : null;

  return h('div', { class: 'stack' },
    h('div', { class: 'result-banner ' + banner.cls }, h('strong', null, banner.title), h('span', null, banner.sub)),
    g.random && h('p', { class: 'center muted small' }, '決選投票も同票だったため、ランダムで決まりました'),
    h('div', { class: 'card gm-topics' },
      h('div', null, h('small', { class: 'muted' }, '市民のお題'), h('strong', null, r.majority)),
      h('div', null, h('small', { class: 'muted' }, '少数派のお題'), h('strong', null, r.minority))),
    g.guess && h('p', { class: 'center muted small' }, `${exName}の回答：${g.guess}`),
    h('div', { class: 'card' },
      h('table', { class: 'result-table' },
        h('thead', null, h('tr', null, h('th', null, '名前'), h('th', null, '役職'), h('th', null, '票'))),
        h('tbody', null, g.players.map((id) => h('tr', { class: id === g.executed ? 'executed' : '' },
          h('td', null, nameOf(ctx, id), id === g.executed && h('span', { class: 'tag' }, '吊られた')),
          h('td', null, h('span', { class: 'role ' + (r.roles[id] || '') }, r.roles[id] === 'wolf' ? '人狼' : '市民')),
          h('td', { class: 'votes' }, id in tallyMap ? tallyMap[id] : '–')))))),
    ctx.isHost
      ? h('div', { class: 'actions' },
        err && h('p', { class: 'warn' }, err),
        button('もう一回', () => ctx.send('again'), 'primary', { disabled: !!err }),
        h('p', { class: 'center muted small' }, '人数や設定を変えるときは右上の「ロビーへ」から'))
      : h('p', { class: 'center muted' }, 'ホストの操作を待っています'));
}
})();
