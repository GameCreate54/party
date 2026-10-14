// ===== ウソつきトーク =====
// 各自がウソを1〜3個仕込み、通話でふつうに会話する。
// 「今のウソでしょ」と思ったら嘘コール。言われた本人が正直に判定する。
// 最後に答え合わせをして、バレずに言い切ったウソが得点になる。
//
// 得点：ウソがバレなかった +1 / ウソがバレた −1 / 嘘コール成功 +2 / 嘘コール失敗 −2
//
// ウソの文章は各自のスマホ（localStorage）にだけ保存し、答え合わせまでだれにも送らない。
(() => {
const { h, button, drafts, toast, pick, ask } = window.Party.ui;
const { TOPICS, GENERIC } = window.Party.usotsukiTopics;

const MAX_PLAYERS = 8;
const COLORS = ['#ff8a97', '#ffc65e', '#86e28f', '#62d3ff', '#b993ff', '#ff9fe2', '#ffe682', '#8ef1dd'];
const EXAMPLES = ['例：小学生のとき、けん玉で県大会に出た', '例：昨日の夜、ラーメンを2杯食べた', '例：実家でカメを3匹飼っている'];

// 端末ごとの見た目だけの状態
const view = { dealId: '', editing: false, showLies: false, picking: false, confirmEnd: false, said: {}, dismissed: {}, autoClose: null };

const fmt = (n) => (n > 0 ? '+' + n : n < 0 ? '−' + Math.abs(n) : '±0');
const mmss = (s) => { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '（退出した人）';
const isOnline = (ctx, id) => { const p = ctx.players.find((x) => x.id === id); return !!(p && p.online); };
const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- 自分のウソ（この端末にだけ保存） ----------
const lieKey = (ctx) => `party-uso:${ctx.code}:${ctx.game.dealId}:${ctx.me}`;
function getLies(ctx) {
  try { return JSON.parse(localStorage.getItem(lieKey(ctx)) || 'null') || []; } catch { return []; }
}
function setLies(ctx, lies) {
  try { localStorage.setItem(lieKey(ctx), JSON.stringify(lies)); } catch { /* 保存できない端末 */ }
}

// ウソの文章からジャンルを推測（話題が出やすくなる）
const catsOf = (texts) => { const t = texts.join(' '); return Object.keys(TOPICS).filter((c) => TOPICS[c].k.some((k) => t.includes(k))); };

function makeTopic(g, by) {
  const weight = {};
  Object.values(g.ready || {}).forEach((r) => (r.cats || []).forEach((c) => { weight[c] = (weight[c] || 0) + 1; }));
  const weights = Object.entries(weight).filter(([c]) => TOPICS[c]);
  const recent = (g.topic && g.topic.recent) || [];
  let pool;
  const r = Math.random();
  if (weights.length && r < 0.6) {
    const total = weights.reduce((a, b) => a + b[1], 0);
    let x = Math.random() * total;
    let cat = weights[0][0];
    for (const [c, v] of weights) { if ((x -= v) <= 0) { cat = c; break; } }
    pool = TOPICS[cat].t.map((t) => [cat, t]);
  } else if (r < 0.85) {
    pool = Object.entries(TOPICS).flatMap(([c, d]) => d.t.map((t) => [c, t]));
  } else {
    pool = GENERIC.t.map((t) => [GENERIC.name, t]);
  }
  let cand = pool.filter(([, t]) => !recent.includes(t));
  if (!cand.length) cand = pool;
  const [cat, q] = pick(cand);
  return { cat, q, by, recent: [q, ...recent].slice(0, 15) };
}

function validate(ctx) {
  const n = ctx.players.length;
  if (n < 2) return '2人以上で遊べます';
  if (n > MAX_PLAYERS) return `${MAX_PLAYERS}人までです`;
  return null;
}

function newRound(ctx) {
  const players = ctx.players.map((p) => p.id);
  return {
    game: {
      phase: 'entry', dealId: newId(), players,
      colors: Object.fromEntries(players.map((id, i) => [id, COLORS[i % COLORS.length]])),
      ready: null, scores: null, caught: null, topic: null, call: null, log: null,
      startedAt: null, endedAt: null, reveals: null, revealDone: null,
    },
  };
}

const allDone = (g, map) => g.players.every((id) => map && map[id]);

window.Party.register({
  id: 'usotsuki',
  name: 'ウソつきトーク',
  icon: '🤥',
  description: '会話にウソをまぎれこませて、見破り合う',

  defaultSettings: () => ({}),
  validate,

  renderSettings(ctx) {
    return h('div', { class: 'settings' },
      h('p', { class: 'muted small', style: 'margin:0' }, '通話でふつうに会話しながら遊びます。全員がプレイヤーです（2〜8人）。'),
      h('div', { class: 'uso-score' },
        h('span', null, 'ウソを言ってバレなかった'), h('b', { class: 'plus' }, '+1'),
        h('span', null, 'ウソを言ってバレた'), h('b', { class: 'minus' }, '−1'),
        h('span', null, '嘘コール成功'), h('b', { class: 'plus' }, '+2'),
        h('span', null, '嘘コール失敗（本当の話だった）'), h('b', { class: 'minus' }, '−2')));
  },

  start: (ctx) => newRound(ctx),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const isHost = from === ctx.hostId;
    const inGame = g.players.includes(from);
    const add = (map, id, d) => ({ ...(map || {}), [id]: ((map || {})[id] || 0) + d });

    switch (a.type) {
      case 'ready': {
        if (g.phase !== 'entry' || !inGame) return null;
        const n = Math.max(1, Math.min(3, Number(a.lieCount) || 1));
        const cats = Array.isArray(a.cats) ? a.cats.filter((c) => TOPICS[c]).slice(0, 13) : [];
        const ready = { ...(g.ready || {}), [from]: { n, cats } };
        if (g.players.length >= 2 && allDone(g, ready)) {
          return { game: { ...g, ready, phase: 'talk', startedAt: window.Party.SERVER_TIME } };
        }
        return { game: { ...g, ready } };
      }
      case 'unready': {
        if (g.phase !== 'entry' || !inGame) return null;
        const ready = { ...(g.ready || {}) };
        delete ready[from];
        return { game: { ...g, ready } };
      }
      case 'topic':
        if (g.phase !== 'talk' || !inGame) return null;
        return { game: { ...g, topic: makeTopic(g, from) } };
      case 'call': {
        if (g.phase !== 'talk' || !inGame || !g.players.includes(a.target) || a.target === from) return null;
        if (g.call && g.call.status === 'pending') return null;
        return { game: { ...g, call: { id: newId(), a: from, b: a.target, status: 'pending' } } };
      }
      case 'cancelCall':
        if (!g.call || g.call.status !== 'pending' || g.call.a !== from) return null;
        return { game: { ...g, call: null } };
      case 'judge': {
        const c = g.call;
        if (g.phase !== 'talk' || !c || c.status !== 'pending' || c.b !== from || c.id !== a.callId) return null;
        const ok = !!a.ok;
        let scores = g.scores;
        let caught = g.caught;
        if (ok) {
          scores = add(add(scores, c.a, 2), c.b, -1);
          caught = add(caught, c.b, 1);
        } else {
          scores = add(scores, c.a, -2);
        }
        const t = typeof a.ts === 'number' && typeof g.startedAt === 'number' ? Math.max(0, a.ts - g.startedAt) : 0;
        const log = [...(g.log || []), { a: c.a, b: c.b, ok, t }].slice(-40);
        return { game: { ...g, scores, caught, log, call: { ...c, status: 'done', ok, text: ok ? String(a.text || '').slice(0, 80) : '' } } };
      }
      case 'toReveal':
        if (g.phase !== 'talk' || !isHost) return null;
        return { game: { ...g, phase: 'reveal', endedAt: window.Party.SERVER_TIME, call: null } };
      case 'reveal': {
        if (g.phase !== 'reveal' || !inGame || (g.revealDone || {})[from]) return null;
        const lies = (Array.isArray(a.lies) ? a.lies : []).slice(0, 3).map((l) => ({
          text: String(l.text || '').slice(0, 80), caught: !!l.caught, said: !l.caught && !!l.said,
        }));
        const plus = lies.filter((l) => l.said).length;
        const revealDone = { ...(g.revealDone || {}), [from]: true };
        const next = {
          ...g,
          reveals: { ...(g.reveals || {}), [from]: lies.length ? lies : null },
          scores: plus ? add(g.scores, from, plus) : g.scores,
          revealDone,
        };
        if (allDone(g, revealDone)) next.phase = 'final';
        return { game: next };
      }
      case 'forceFinal':
        if (g.phase !== 'reveal' || !isHost) return null;
        return { game: { ...g, phase: 'final' } };
      case 'again':
        if (g.phase !== 'final' || !isHost || validate(ctx)) return null;
        return newRound(ctx);
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (view.dealId !== g.dealId) {
      // 新しいゲーム：入力欄を保存済みのウソで埋めなおす
      view.dealId = g.dealId;
      Object.assign(view, { editing: false, showLies: false, picking: false, confirmEnd: false, said: {} });
      const saved = getLies(ctx);
      for (let k = 0; k < 3; k++) drafts['uso-lie-' + k] = saved[k] ? saved[k].text : '';
    }
    if (g.phase !== 'talk') { view.picking = false; view.confirmEnd = false; }
    const screens = { entry, talk, reveal, final };
    return (screens[g.phase] || entry)(ctx, g);
  },
});

// ---------- 小さな部品 ----------
function avatar(ctx, g, id, big) {
  const color = (g.colors || {})[id] || '#888';
  return h('span', {
    class: 'uso-av' + (big ? ' big' : '') + (isOnline(ctx, id) ? '' : ' off'),
    style: `background:${color}`,
  }, [...(nameOf(ctx, id) || '?').trim()][0] || '?');
}

function statusList(ctx, g, doneMap, doneLabel, waitLabel) {
  return h('div', { class: 'uso-plist' }, g.players.map((id) => h('div', { class: 'uso-pitem' },
    avatar(ctx, g, id),
    h('span', { class: 'uso-nm' }, nameOf(ctx, id)),
    id === ctx.me && h('span', { class: 'tag' }, 'あなた'),
    doneMap && doneMap[id]
      ? h('span', { class: 'uso-badge ok' }, doneLabel)
      : h('span', { class: 'uso-badge wait pulse' }, waitLabel))));
}

// ---------- ウソの仕込み ----------
function entry(ctx, g) {
  const ready = g.ready || {};
  if (ready[ctx.me] && !view.editing) {
    const done = g.players.filter((id) => ready[id]).length;
    return h('div', { class: 'stack' },
      h('span', { class: 'uso-eyebrow' }, 'ウソの仕込み'),
      h('div', { class: 'card' },
        h('h2', null, `みんなの入力を待っています ${done}/${g.players.length}`),
        statusList(ctx, g, ready, '完了', '入力中')),
      button('ウソを書き直す', () => { view.editing = true; ctx.send('unready'); ctx.rerender(); }, 'ghost'));
  }

  const save = () => {
    const texts = [0, 1, 2].map((k) => (drafts['uso-lie-' + k] || '').trim().slice(0, 80)).filter(Boolean);
    if (!texts.length) return toast('ウソを1つ以上書いてください');
    setLies(ctx, texts.map((text) => ({ text, caught: false })));
    view.editing = false;
    ctx.send('ready', { lieCount: texts.length, cats: catsOf(texts) });
    ctx.rerender();
  };

  return h('div', { class: 'stack' },
    h('span', { class: 'uso-eyebrow' }, 'ウソの仕込み'),
    h('div', { class: 'card', style: `border-color:${(g.colors || {})[ctx.me] || ''}` },
      h('div', { class: 'uso-row' }, avatar(ctx, g, ctx.me),
        h('div', null, h('strong', null, `${nameOf(ctx, ctx.me)}さんのウソ`),
          h('p', { class: 'muted small', style: 'margin:0' }, '会話の中で本当っぽく言えるウソを1〜3個'))),
      [0, 1, 2].map((k) => h('div', { class: 'uso-liebox' },
        h('label', { class: 'label', for: 'uso-lie-' + k }, `ウソ ${k + 1}${k ? '（任意）' : ''}`),
        h('textarea', {
          id: 'uso-lie-' + k, class: 'input', maxlength: 80, rows: 2, placeholder: EXAMPLES[k],
          value: drafts['uso-lie-' + k] || '',
          oninput: (e) => { drafts['uso-lie-' + k] = e.target.value; },
        }))),
      h('p', { class: 'muted small', style: 'margin:0' }, 'ウソの文章はこのスマホにだけ保存され、答え合わせまで誰にも送られません。')),
    button('決定', save, 'primary'));
}

// ---------- トーク ----------
function talk(ctx, g) {
  const lies = getLies(ctx);
  const elapsed = typeof g.startedAt === 'number' ? (Date.now() - g.startedAt) / 1000 : 0;
  const t = g.topic;
  const scores = g.scores || {};
  const caught = g.caught || {};
  const ready = g.ready || {};

  const board = h('div', { class: 'uso-board' }, g.players.map((id) => {
    const sc = scores[id] || 0;
    return h('div', { class: 'uso-pcard' + (id === ctx.me ? ' me' : '') },
      avatar(ctx, g, id),
      h('div', { class: 'uso-meta' },
        h('div', { class: 'uso-nm' }, nameOf(ctx, id)),
        h('div', { class: 'muted', style: 'font-size:11px' }, `バレたウソ ${caught[id] || 0}/${(ready[id] && ready[id].n) || 0}`)),
      h('div', { class: 'uso-sc ' + (sc > 0 ? 'plus' : sc < 0 ? 'minus' : '') }, fmt(sc)));
  }));

  const logs = (g.log || []).slice().reverse().slice(0, 8);

  return h('div', { class: 'stack uso' },
    h('div', { class: 'uso-topbar' },
      h('span', { class: 'uso-eyebrow' }, 'トーク中'),
      h('span', { class: 'uso-timer', id: 'uso-timer', 'data-start': typeof g.startedAt === 'number' ? g.startedAt : null }, mmss(elapsed))),
    h('section', { class: 'uso-topic' + (t ? '' : ' empty') },
      t
        ? [h('span', { class: 'uso-cat' }, t.cat, h('span', { class: 'muted' }, `　by ${nameOf(ctx, t.by)}`)), h('p', { class: 'uso-q' }, t.q)]
        : h('p', { class: 'uso-q' }, '会話に詰まったら、話題ボタンを押そう。全員の画面に表示されます。'),
      button(t ? '別の話題にする' : '話題をちょうだい', () => ctx.send('topic'), 'small')),
    h('button', {
      type: 'button', class: 'uso-call',
      onclick: () => {
        if (g.call && g.call.status === 'pending') return toast('ほかのコールを判定中です');
        view.picking = true; ctx.rerender();
      },
    }, h('span', { class: 'big' }, '嘘コール！'), h('span', { class: 'sub' }, '今の発言、ウソだと思ったら押す')),
    h('div', { class: 'card' },
      h('div', { class: 'uso-spread' }, h('h2', null, 'あなたのウソ'),
        button(view.showLies ? '隠す' : '表示', () => { view.showLies = !view.showLies; ctx.rerender(); }, 'ghost small')),
      lies.length
        ? h('ul', { class: 'uso-mylies' }, lies.map((l) => h('li', null,
          l.caught && h('span', { class: 'uso-chip caught' }, 'バレた'),
          h('span', { class: 'uso-t' + (view.showLies ? '' : ' blur') }, l.text))))
        : h('p', { class: 'muted small', style: 'margin:0' }, 'このスマホにウソの記録がありません。')),
    h('div', { class: 'uso-spread' }, h('h2', { style: 'margin:0' }, 'スコア'), h('span', { class: 'muted small' }, '逃げ切りの+1は答え合わせで加算')),
    board,
    logs.length > 0 && h('div', { class: 'card' }, h('h2', null, 'コール履歴'),
      h('ul', { class: 'uso-log' }, logs.map((e) => h('li', null,
        h('span', { class: 'uso-lt' }, mmss(e.t / 1000)),
        h('span', null, `${nameOf(ctx, e.a)} → ${nameOf(ctx, e.b)}　`,
          e.ok ? h('b', { class: 'plus' }, '見破り成功') : h('b', { class: 'minus' }, 'ハズレ')))))),
    ctx.isHost
      ? (view.confirmEnd
        ? h('div', { class: 'uso-confirm' },
          h('p', { style: 'margin:0;font-weight:700' }, '会話を終えて、全員を答え合わせに進めますか？'),
          h('div', { class: 'uso-two' },
            button('まだ続ける', () => { view.confirmEnd = false; ctx.rerender(); }, 'small'),
            button('答え合わせへ', () => ctx.send('toReveal'), 'primary small')))
        : button('会話を終えて答え合わせへ（ホスト）', () => { view.confirmEnd = true; ctx.rerender(); }, 'primary'))
      : h('p', { class: 'muted small center' }, 'ホストが会話を終えると答え合わせになります'),
    overlay(ctx, g, lies));
}

// 嘘コールの画面（上に重ねて表示）
function overlay(ctx, g, lies) {
  const c = g.call;
  const sheet = (...kids) => h('div', { class: 'uso-overlay' }, h('div', { class: 'uso-sheet' }, kids));

  if (c && c.status === 'pending') {
    if (c.b === ctx.me) {
      const judge = (k) => {
        if (k >= 0) {
          const all = getLies(ctx);
          if (all[k]) { all[k].caught = true; setLies(ctx, all); }
          ctx.send('judge', { callId: c.id, ok: true, text: lies[k].text });
        } else {
          ctx.send('judge', { callId: c.id, ok: false });
        }
      };
      return sheet(
        h('span', { class: 'uso-eyebrow', style: 'color:var(--wolf)' }, `${nameOf(ctx, c.a)}さんから嘘コール！`),
        h('h2', { class: 'uso-display' }, '今の発言は、仕込んだウソ？'),
        h('p', { class: 'muted small', style: 'margin:0' }, '正直に選んでください。答え合わせで全員にウソが公開されます。'),
        h('div', { class: 'uso-choice' },
          lies.map((l, k) => !l.caught && h('button', { type: 'button', onclick: () => judge(k) },
            `「${l.text}」`, h('br'), h('span', { class: 'muted small' }, 'このウソを言った'))),
          h('button', { type: 'button', class: 'truth', onclick: () => judge(-1) }, 'いまのは本当の話だった')));
    }
    return sheet(
      h('div', { class: 'uso-verdict wait' },
        h('span', { class: 'uso-eyebrow' }, '嘘コール'),
        h('div', { class: 'uso-row', style: 'justify-content:center' }, avatar(ctx, g, c.a), h('span', { style: 'font-size:22px' }, '→'), avatar(ctx, g, c.b)),
        h('div', { class: 'head' }, `${nameOf(ctx, c.a)} が`, h('br'), `${nameOf(ctx, c.b)} に嘘コール！`),
        h('p', { class: 'muted pulse', style: 'margin:0' }, `${nameOf(ctx, c.b)}さんが判定中…`)),
      c.a === ctx.me && button('コールを取り消す', () => ctx.send('cancelCall'), 'ghost'));
  }

  if (c && c.status === 'done' && !view.dismissed[c.id]) {
    const dismiss = () => { view.dismissed[c.id] = true; ctx.rerender(); };
    if (!view.autoClose || view.autoClose.id !== c.id) {
      clearTimeout(view.autoClose && view.autoClose.timer);
      view.autoClose = { id: c.id, timer: setTimeout(dismiss, 9000) };
    }
    const delta = (id, v) => h('div', { class: 'uso-delta' },
      h('span', { class: 'uso-row' }, avatar(ctx, g, id), nameOf(ctx, id)),
      h('span', { class: 'v ' + (v > 0 ? 'plus' : 'minus') }, fmt(v)));
    return h('div', { class: 'uso-overlay', onclick: dismiss }, h('div', { class: 'uso-sheet' },
      c.ok
        ? h('div', { class: 'uso-verdict win' },
          h('span', { class: 'uso-eyebrow' }, '嘘コール判定'),
          h('div', { class: 'head stamp' }, '見破った！'),
          h('p', { style: 'margin:0' }, `${nameOf(ctx, c.b)}さんの仕込んだウソ`),
          h('div', { class: 'uso-quote' }, `「${c.text}」`),
          h('div', { class: 'uso-deltas' }, delta(c.a, 2), delta(c.b, -1)))
        : h('div', { class: 'uso-verdict miss' },
          h('span', { class: 'uso-eyebrow' }, '嘘コール判定'),
          h('div', { class: 'head stamp' }, 'ハズレ！'),
          h('p', { style: 'margin:0' }, `${nameOf(ctx, c.b)}さんの今の話は`, h('b', null, '本当'), 'でした'),
          h('div', { class: 'uso-deltas' }, delta(c.a, -2))),
      button('トークに戻る', dismiss, 'primary')));
  }

  if (view.picking) {
    const close = () => { view.picking = false; ctx.rerender(); };
    return sheet(
      h('span', { class: 'uso-eyebrow', style: 'color:var(--wolf)' }, '嘘コール'),
      h('h2', { class: 'uso-display' }, '誰の発言がウソ？'),
      h('div', { class: 'uso-pick' }, g.players.filter((id) => id !== ctx.me).map((id) => h('button', {
        type: 'button',
        onclick: () => { view.picking = false; ctx.send('call', { target: id }); ctx.rerender(); },
      }, avatar(ctx, g, id), h('span', { class: 'uso-n' }, nameOf(ctx, id))))),
      button('やめる', close, 'ghost'));
  }
  return null;
}

// ---------- 答え合わせ ----------
function reveal(ctx, g) {
  const done = g.revealDone || {};
  if (done[ctx.me] || !g.players.includes(ctx.me)) {
    const n = g.players.filter((id) => done[id]).length;
    return h('div', { class: 'stack' },
      h('span', { class: 'uso-eyebrow' }, '答え合わせ'),
      h('div', { class: 'card' },
        h('h2', null, `全員の答え合わせを待っています ${n}/${g.players.length}`),
        statusList(ctx, g, done, '完了', '確認中')),
      ctx.isHost && button('待たずに結果発表へ（ホスト）', () => ask('まだ終わっていない人がいても結果発表に進みますか？', () => ctx.send('forceFinal')), 'ghost'));
  }
  const lies = getLies(ctx);
  const ready = lies.every((l, k) => l.caught || view.said[k] !== undefined);
  const save = () => {
    const out = lies.map((l, k) => ({ text: l.text, caught: !!l.caught, said: !l.caught && view.said[k] === true }));
    ctx.send('reveal', { lies: out });
  };
  return h('div', { class: 'stack' },
    h('span', { class: 'uso-eyebrow' }, '答え合わせ'),
    h('div', { class: 'card' },
      h('div', { class: 'uso-row' }, avatar(ctx, g, ctx.me),
        h('div', null, h('strong', null, `${nameOf(ctx, ctx.me)}さんのウソ`),
          h('p', { class: 'muted small', style: 'margin:0' }, 'バレずに言い切ったウソは1つにつき+1点'))),
      lies.length
        ? lies.map((l, k) => (l.caught
          ? h('div', { class: 'uso-toggle' }, h('div', { class: 'uso-spread' }, h('span', { class: 'uso-txt' }, `「${l.text}」`), h('span', { class: 'uso-chip caught' }, 'バレた')))
          : h('div', { class: 'uso-toggle' },
            h('span', { class: 'uso-txt' }, `「${l.text}」`),
            h('div', { class: 'uso-seg' },
              h('button', { type: 'button', class: view.said[k] === true ? 'on-said' : '', onclick: () => { view.said[k] = true; ctx.rerender(); } }, '会話で言った'),
              h('button', { type: 'button', class: view.said[k] === false ? 'on-not' : '', onclick: () => { view.said[k] = false; ctx.rerender(); } }, '言ってない')))))
        : h('p', { class: 'muted small', style: 'margin:0' }, 'このスマホにウソの記録がありません。そのまま決定してください。')),
    button('決定して公開', save, 'primary', { disabled: !ready }));
}

// ---------- 結果 ----------
function final(ctx, g) {
  const scores = g.scores || {};
  const ids = g.players.slice().sort((x, y) => (scores[y] || 0) - (scores[x] || 0));
  const reveals = g.reveals || {};
  let rank = 0;
  let prev = null;
  const top = ids.length ? scores[ids[0]] || 0 : 0;
  const winners = ids.filter((id) => (scores[id] || 0) === top).map((id) => nameOf(ctx, id)).join('・');
  const dur = typeof g.startedAt === 'number' && typeof g.endedAt === 'number' ? mmss((g.endedAt - g.startedAt) / 1000) : '--:--';

  return h('div', { class: 'stack' },
    h('div', { class: 'uso-hero' },
      h('span', { class: 'uso-eyebrow' }, `結果発表　トーク時間 ${dur}`),
      h('div', { class: 'uso-logo' }, 'いちばんの', h('br'), h('span', { class: 'tilt' }, 'ウソつき'), 'は'),
      h('p', { class: 'uso-winner' }, winners)),
    h('div', { class: 'stack' }, ids.map((id, n) => {
      const sc = scores[id] || 0;
      if (sc !== prev) { rank = n + 1; prev = sc; }
      const lies = reveals[id] || [];
      return h('div', { class: 'uso-rank' + (rank === 1 ? ' first' : '') },
        h('div', { class: 'uso-rank-head' },
          h('span', { class: 'uso-rank-no' }, rank),
          avatar(ctx, g, id),
          h('span', { class: 'uso-nm' }, nameOf(ctx, id)),
          h('span', { class: 'uso-sc ' + (sc > 0 ? 'plus' : sc < 0 ? 'minus' : '') }, fmt(sc))),
        h('ul', { class: 'uso-lielist' }, lies.length
          ? lies.map((l) => h('li', null,
            l.caught ? h('span', { class: 'uso-chip caught' }, 'バレた −1')
              : l.said ? h('span', { class: 'uso-chip escaped' }, '逃げ切り +1')
                : h('span', { class: 'uso-chip unused' }, '未使用'),
            h('span', { class: 'uso-t' }, l.text)))
          : h('li', { class: 'muted' }, '記録なし')));
    })),
    ctx.isHost
      ? button('同じメンバーでもう一度', () => ctx.send('again'), 'primary', { disabled: !!validate(ctx) })
      : h('p', { class: 'muted small center' }, 'ホストが次のゲームを始められます'));
}

// トーク時間の表示を毎秒更新
setInterval(() => {
  const el = document.getElementById('uso-timer');
  const start = el && Number(el.getAttribute('data-start'));
  if (start) el.textContent = mmss((Date.now() - start) / 1000);
}, 1000);
})();
