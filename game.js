// ===== 笑ったら負け =====
// 通話しながら遊ぶ。笑ってしまったら自分で「笑った」ボタンを押して脱落。
// 各プレイヤーは相手1人につき1回、好きな単語を送りつけて
// 「制限時間内にしゃべれ！」と命令できる。言えなければ脱落。
// 設定した人数まで生き残った人の勝ち。
//
// 時間切れの判定はホストの端末の時計で行う（tick）。
(() => {
const { h, inputBox, button, drafts, toast, stepper } = window.Party.ui;

const MAX_PLAYERS = 8;
const COLORS = ['#ff5d73', '#ffb020', '#3ddc97', '#4cc9f0', '#a78bfa', '#f472b6', '#facc15', '#fb923c'];
const REASON = { laugh: '😂 笑った', word: '🤐 ワード失敗', kick: '🚪 退場' };
const GRACE = 700; // 「言った！」が通信で少し遅れても認める猶予（ミリ秒）

// 端末ごとの見た目だけの状態
const view = { round: -1, sel: null, armUntil: 0, seen: {}, feedSeen: null, wasAlive: null, outUntil: 0, beeped: {} };

const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '???';
const isOnline = (ctx, id) => { const p = ctx.players.find((x) => x.id === id); return !!(p && p.online); };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const newId = () => Math.random().toString(36).slice(2, 10);

// ---------- 音と振動 ----------
let actx;
function beep(f = 880, d = 0.08, type = 'square', vol = 0.06) {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const o = actx.createOscillator();
    const g = actx.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = vol;
    o.connect(g); g.connect(actx.destination);
    g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + d);
    o.start(); o.stop(actx.currentTime + d);
  } catch { /* 音が出せない端末 */ }
}
document.addEventListener('pointerdown', () => {
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch { /* なし */ }
}, { once: true });
const vib = (p) => { try { if (navigator.vibrate) navigator.vibrate(p); } catch { /* なし */ } };

// ---------- ルール ----------
function validate(ctx) {
  const n = ctx.players.length;
  if (n < 2) return '2人以上で遊べます';
  if (n > MAX_PLAYERS) return `${MAX_PLAYERS}人までです`;
  return null;
}

function newRound(ctx, prevRound) {
  const players = ctx.players.map((p) => p.id);
  const s = ctx.settings;
  return {
    game: {
      phase: 'play',
      round: (prevRound || 0) + 1,
      players,
      colors: Object.fromEntries(players.map((id, i) => [id, COLORS[i % COLORS.length]])),
      alive: Object.fromEntries(players.map((id) => [id, true])),
      out: null,
      outCount: 0,
      survivors: clamp(s.survivors || 2, 1, players.length - 1),
      wordTime: clamp(s.wordTime || 10, 3, 60),
      used: null,
      reqs: null,
      feed: null,
    },
  };
}

const addFeed = (g, text) => [...(g.feed || []), { id: newId(), text }].slice(-20);
const aliveIds = (g) => g.players.filter((id) => (g.alive || {})[id]);

function eliminate(ctx, g, id, reason, word) {
  if (!(g.alive || {})[id]) return g;
  const n = nameOf(ctx, id);
  const outCount = (g.outCount || 0) + 1;
  const text = reason === 'laugh' ? `😂 ${n} が笑った！ 脱落！`
    : reason === 'word' ? `🤐 ${n} はワード「${word}」を言えず脱落！`
      : `🚪 ${n} は退場になった`;
  const next = {
    ...g,
    alive: { ...g.alive, [id]: false },
    out: { ...(g.out || {}), [id]: { reason, order: outCount, word: word || null } },
    outCount,
    feed: addFeed(g, text),
  };
  if (aliveIds(next).length <= next.survivors) next.phase = 'end';
  return next;
}

const activeReqs = (g) => Object.entries(g.reqs || {}).map(([id, r]) => ({ id, ...r })).filter((r) => r.status === 'active');

window.Party.register({
  id: 'waraimake',
  name: '笑ったら負け',
  icon: '🤭',
  description: '笑ったら脱落。ワードを送りつけてしゃべらせろ',

  defaultSettings: () => ({ survivors: 2, wordTime: 10 }),
  validate,

  renderSettings(ctx, { editable, set }) {
    const s = { survivors: 2, wordTime: 10, ...ctx.settings };
    const n = ctx.players.length;
    return h('div', { class: 'settings' },
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, '勝ち残り人数', h('br'), h('small', { class: 'muted' }, 'この人数になったら終了')),
        stepper(s.survivors, 1, 7, (survivors) => set({ survivors }), editable)),
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, 'ワード制限時間（秒）', h('br'), h('small', { class: 'muted' }, '送られた単語を言うまでの時間')),
        stepper(s.wordTime, 3, 60, (wordTime) => set({ wordTime }), editable)),
      n >= 2 && s.survivors >= n && h('p', { class: 'warn' }, `勝ち残り人数が多すぎます（開始時に${n - 1}人に自動調整）`),
      h('p', { class: 'muted small', style: 'margin:0' },
        '笑ったら自分で「笑った」ボタンを押して脱落。相手1人につき1回、単語を送りつけて制限時間内にしゃべらせられます。'));
  },

  start: (ctx) => newRound(ctx, 0),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const alive = g.alive || {};

    if (a.type === 'again') {
      if (g.phase !== 'end' || from !== ctx.hostId || validate(ctx)) return null;
      return newRound(ctx, g.round);
    }
    if (g.phase !== 'play') return null;

    switch (a.type) {
      case 'laugh':
        if (!alive[from]) return null;
        return { game: eliminate(ctx, g, from, 'laugh') };
      case 'kick':
        if (from !== ctx.hostId || !alive[a.id]) return null;
        return { game: eliminate(ctx, g, a.id, 'kick') };
      case 'send': {
        const word = String(a.word || '').trim().slice(0, 20);
        const to = a.to;
        if (!word || !alive[from] || !alive[to] || to === from) return null;
        const key = `${from}_${to}`;
        if ((g.used || {})[key]) return null;
        if (activeReqs(g).some((r) => r.to === to)) return null;
        const id = newId();
        const dur = g.wordTime * 1000;
        return {
          game: {
            ...g,
            used: { ...(g.used || {}), [key]: true },
            reqs: { ...(g.reqs || {}), [id]: { from, to, word, status: 'active', dur, deadline: Date.now() + dur, at: Date.now() } },
          },
        };
      }
      case 'said': {
        const r = (g.reqs || {})[a.id];
        if (!r || r.status !== 'active' || r.to !== from) return null;
        if (Date.now() > r.deadline + GRACE) return null;
        return {
          game: {
            ...g,
            reqs: { ...g.reqs, [a.id]: { ...r, status: 'said' } },
            feed: addFeed(g, `✅ ${nameOf(ctx, from)} がワード「${r.word}」を言い切った！`),
          },
        };
      }
      default:
        return null;
    }
  },

  // ホストの端末で定期的に呼ばれる：時間切れの判定
  tick(ctx) {
    let g = ctx.game;
    if (!g || g.phase !== 'play') return null;
    let changed = false;
    const now = Date.now();
    for (const r of activeReqs(g)) {
      if (g.phase !== 'play') break;
      if (!(g.alive || {})[r.to]) {
        g = { ...g, reqs: { ...g.reqs, [r.id]: { ...g.reqs[r.id], status: 'void' } } };
        changed = true;
      } else if (now > r.deadline + GRACE) {
        g = { ...g, reqs: { ...g.reqs, [r.id]: { ...g.reqs[r.id], status: 'fail' } } };
        g = eliminate(ctx, g, r.to, 'word', r.word);
        changed = true;
      }
    }
    return changed ? { game: g } : null;
  },

  render(ctx) {
    const g = ctx.game;
    if (g.round !== view.round) {
      view.round = g.round;
      Object.assign(view, { sel: null, armUntil: 0, seen: {}, wasAlive: null, outUntil: 0, beeped: {} });
      view.feedSeen = new Set((g.feed || []).map((f) => f.id));
      drafts['wm-word'] = '';
      if (g.phase === 'play') { beep(523, 0.12, 'triangle', 0.1); setTimeout(() => beep(784, 0.18, 'triangle', 0.1), 130); }
    }
    // 実況：新しい出来事をトーストで知らせる
    for (const f of g.feed || []) {
      if (!view.feedSeen.has(f.id)) { view.feedSeen.add(f.id); toast(f.text); }
    }
    if (g.phase === 'end' && view.lastPhase === 'play') { beep(784, 0.15, 'triangle', 0.1); setTimeout(() => beep(1046, 0.3, 'triangle', 0.1), 160); }
    view.lastPhase = g.phase;
    return g.phase === 'end' ? endView(ctx, g) : playView(ctx, g);
  },
});

// ---------- 部品 ----------
function avatar(g, ctx, id, size) {
  return h('div', {
    class: 'wm-av',
    style: `background:${(g.colors || {})[id] || '#888'}${size ? `;width:${size}px;height:${size}px` : ''}`,
  }, (nameOf(ctx, id) || '?').slice(0, 1));
}

// 残り時間（届いた瞬間からこの端末で数えるので、端末の時計がずれていても正しく見える）
function remainMs(r) {
  if (!view.seen[r.id]) view.seen[r.id] = Date.now();
  return Math.max(0, r.dur - (Date.now() - view.seen[r.id]));
}

// ---------- プレイ中 ----------
function playView(ctx, g) {
  const alive = g.alive || {};
  const meAlive = !!alive[ctx.me];
  const act = activeReqs(g);
  const targeted = new Set(act.map((r) => r.to));
  const used = g.used || {};

  // 自分が脱落した瞬間の演出
  if (view.wasAlive === true && !meAlive) {
    view.outUntil = Date.now() + 2200;
    vib([400]); beep(180, 0.5, 'sawtooth', 0.1);
    setTimeout(() => ctx.rerender(), 2300);
  }
  view.wasAlive = meAlive;

  const grid = h('div', { class: 'wm-grid' }, g.players.map((id) => {
    const out = !alive[id];
    const reason = ((g.out || {})[id] || {}).reason;
    const canKick = ctx.isHost && id !== ctx.me && !out;
    return h('div', {
      class: 'wm-pc' + (id === ctx.me ? ' me' : '') + (out ? ' out' : '') + (!out && targeted.has(id) ? ' tgt' : ''),
      onclick: canKick ? () => confirm(`${nameOf(ctx, id)} を強制脱落させますか？\n（回線落ち・放置のときに使ってね）`) && ctx.send('kick', { id }) : null,
    },
      out && h('div', { class: 'wm-rs' }, (REASON[reason] || '❌').split(' ')[0]),
      avatar(g, ctx, id),
      h('div', { class: 'wm-nm' }, nameOf(ctx, id)),
      !out && targeted.has(id) ? h('div', { class: 'wm-ind' }, '指令中！')
        : !out && !isOnline(ctx, id) ? h('div', { class: 'wm-ind', style: 'color:var(--muted)' }, 'オフライン') : null);
  }));

  // 他の人あての指令
  const banners = act.filter((r) => r.to !== ctx.me).map((r) => h('div', { class: 'wm-banner' },
    h('div', null, '🎯 ', h('b', null, nameOf(ctx, r.to)), ' にワード指令中！', h('br'),
      h('span', { class: 'small muted' }, r.from === ctx.me
        ? ['あなた → 「', h('b', { style: 'color:var(--accent)' }, r.word), '」']
        : `${nameOf(ctx, r.from)}より・ワードは秘密`)),
    h('div', { class: 'wm-cd', 'data-wm-rid': r.id, 'data-wm-dur': r.dur }, (remainMs(r) / 1000).toFixed(1))));

  // ワード指令を出す
  let mission = null;
  if (meAlive) {
    const others = g.players.filter((id) => id !== ctx.me);
    const remain = others.filter((id) => alive[id] && !used[`${ctx.me}_${id}`]).length;
    const targets = others.filter((id) => alive[id]);
    if (view.sel && (!alive[view.sel] || used[`${ctx.me}_${view.sel}`] || targeted.has(view.sel))) view.sel = null;
    const send = () => {
      const word = (drafts['wm-word'] || '').trim();
      if (!word) return toast('単語を入れてね');
      if (!view.sel) return toast('相手を選んでね');
      if (targeted.has(view.sel)) return toast('その人は今ほかの指令中！');
      ctx.send('send', { to: view.sel, word });
      toast(`${nameOf(ctx, view.sel)} に「${word}」を送りつけた！`);
      beep(988, 0.08);
      drafts['wm-word'] = '';
      const el = document.getElementById('wm-word');
      if (el) el.value = '';
      view.sel = null;
      ctx.rerender();
    };
    mission = h('div', { class: 'card wm-mission' },
      h('div', { class: 'wm-mh' }, h('strong', null, '⚡ ワード指令'), h('span', { class: 'muted small' }, `残り ${remain} 回`)),
      inputBox('wm-word', { placeholder: 'しゃべらせたい単語（例：ニンジン）', maxlength: 20, onEnter: send }),
      h('div', { class: 'wm-chips' }, targets.length
        ? targets.map((id) => {
          const u = !!used[`${ctx.me}_${id}`];
          const busy = targeted.has(id);
          return h('button', {
            type: 'button',
            class: 'wm-chip' + (view.sel === id ? ' sel' : ''),
            disabled: u || busy,
            onclick: () => { view.sel = view.sel === id ? null : id; ctx.rerender(); },
          }, h('span', { class: 'wm-dot', style: `background:${(g.colors || {})[id]}` }), nameOf(ctx, id), busy && !u ? '⏳' : '');
        })
        : h('span', { class: 'small muted' }, '送れる相手がいません')),
      button('送りつける！', send, 'primary', { disabled: !view.sel }));
  }

  const feed = (g.feed || []).slice().reverse().slice(0, 8);
  const armed = Date.now() < view.armUntil;
  const pressLaugh = () => {
    if (Date.now() < view.armUntil) {
      view.armUntil = 0;
      ctx.send('laugh');
    } else {
      view.armUntil = Date.now() + 2500;
      beep(660, 0.05);
      setTimeout(() => ctx.rerender(), 2600);
    }
    ctx.rerender();
  };

  const mine = meAlive ? act.filter((r) => r.to === ctx.me).sort((x, y) => x.deadline - y.deadline) : [];
  for (const r of mine) {
    if (!view.beeped['alert-' + r.id]) { view.beeped['alert-' + r.id] = true; vib([200, 80, 200, 80, 300]); beep(1400, 0.12); }
  }

  return h('div', { class: 'stack wm' },
    h('div', { class: 'wm-top' },
      h('span', { class: 'muted small' }, '生存 ', h('b', null, aliveIds(g).length), `/${g.players.length}`),
      h('span', { class: 'muted small' }, `残り${g.survivors}人で終了`)),
    grid,
    banners,
    mission,
    h('div', { class: 'card' }, h('strong', { style: 'font-size:14px' }, '実況'),
      h('ul', { class: 'wm-log' }, feed.length ? feed.map((f) => h('li', null, f.text)) : h('li', { class: 'small muted' }, 'まだ何も起きていない…'))),
    h('div', { class: 'wm-spacer' }),
    h('div', { class: 'wm-laughbar' }, h('div', { class: 'wm-in' }, meAlive
      ? h('button', { type: 'button', class: 'wm-laugh' + (armed ? ' arm' : ''), onclick: pressLaugh }, armed ? 'もう一回押して確定！' : '😂 笑った…')
      : h('div', { class: 'wm-watch' }, '👀 観戦中…'))),
    mine.length > 0 && h('div', { class: 'wm-ov wm-word-ov' },
      h('div', { class: 'wm-hd' }, '⚡ ワード指令 ⚡'),
      mine.map((r) => {
        const left = remainMs(r);
        return h('div', { class: 'wm-wcard' },
          h('div', { class: 'wm-from' }, `${nameOf(ctx, r.from)} からの命令`),
          h('div', { class: 'wm-word' }, r.word),
          h('div', { class: 'wm-desc' }, '会話の中で', h('b', null, 'しゃべれ！'), '（あなたにしか見えていません）'),
          h('div', { class: 'wm-num', 'data-wm-rid': r.id, 'data-wm-dur': r.dur, 'data-wm-mine': '1' }, (left / 1000).toFixed(1)),
          h('div', { class: 'wm-bar' }, h('i', { 'data-wm-bar': r.id, 'data-wm-dur': r.dur, style: `width:${(left / r.dur) * 100}%` })),
          button('言った！', () => ctx.send('said', { id: r.id }), 'wm-say', { 'data-wm-say': r.id, disabled: left <= 0 }));
      })),
    Date.now() < view.outUntil && h('div', { class: 'wm-ov wm-out-ov' },
      h('div', null, h('div', { class: 'wm-big' }, '脱落…'),
        h('div', { style: 'margin-top:10px;font-weight:800' }, REASON[((g.out || {})[ctx.me] || {}).reason] || ''))));
}

// カウントダウンの表示を0.1秒ごとに更新
setInterval(() => {
  document.querySelectorAll('[data-wm-rid]').forEach((el) => {
    const id = el.getAttribute('data-wm-rid');
    const dur = Number(el.getAttribute('data-wm-dur'));
    if (!view.seen[id]) view.seen[id] = Date.now();
    const left = Math.max(0, dur - (Date.now() - view.seen[id]));
    el.textContent = (left / 1000).toFixed(1);
    if (el.getAttribute('data-wm-mine')) {
      const sec = Math.ceil(left / 1000);
      if (sec <= 5 && sec > 0 && view.beeped[id] !== sec) { view.beeped[id] = sec; beep(sec <= 2 ? 1200 : 900, 0.07); }
    }
  });
  document.querySelectorAll('[data-wm-bar]').forEach((el) => {
    const id = el.getAttribute('data-wm-bar');
    const dur = Number(el.getAttribute('data-wm-dur'));
    const left = Math.max(0, dur - (Date.now() - (view.seen[id] || Date.now())));
    el.style.width = (left / dur) * 100 + '%';
  });
  document.querySelectorAll('[data-wm-say]').forEach((el) => {
    const id = el.getAttribute('data-wm-say');
    const bar = document.querySelector(`[data-wm-bar="${id}"]`);
    if (bar && view.seen[id] && Date.now() - view.seen[id] > Number(bar.getAttribute('data-wm-dur')) + 300) el.disabled = true;
  });
}, 100);

// ---------- 結果 ----------
function endView(ctx, g) {
  const alive = g.alive || {};
  const out = g.out || {};
  const winners = g.players.filter((id) => alive[id]);
  const losers = g.players.filter((id) => !alive[id]).sort((a, b) => (out[b] || {}).order - (out[a] || {}).order);
  const reqs = Object.values(g.reqs || {}).sort((a, b) => (a.at || 0) - (b.at || 0));
  const mark = { said: '✅', fail: '❌', void: '―', active: '…' };
  return h('div', { class: 'stack wm' },
    h('div', { class: 'wm-crown' }, '👑'),
    h('div', { class: 'wm-win' }, '勝ち残り！'),
    h('div', { class: 'wm-winners' }, winners.length
      ? winners.map((id) => h('div', { class: 'wm-w1' }, avatar(g, ctx, id), nameOf(ctx, id)))
      : h('div', { class: 'small muted' }, '勝者なし')),
    h('div', { class: 'card' }, h('strong', null, '脱落順'),
      h('ul', { class: 'wm-plist' }, losers.length
        ? losers.map((id, i) => h('li', null,
          h('span', { class: 'wm-no' }, winners.length + i + 1), avatar(g, ctx, id, 28),
          h('b', null, nameOf(ctx, id)), h('span', { class: 'wm-reason' }, REASON[(out[id] || {}).reason] || '')))
        : h('li', { class: 'small muted' }, '脱落者なし'))),
    h('div', { class: 'card' }, h('strong', null, 'ワード指令の記録'),
      h('ul', { class: 'wm-plist small' }, reqs.length
        ? reqs.map((r) => h('li', null, `${mark[r.status] || ''} ${nameOf(ctx, r.from)} → ${nameOf(ctx, r.to)}「`, h('b', { style: 'color:var(--accent)' }, r.word), '」'))
        : h('li', { class: 'small muted' }, '指令なし'))),
    ctx.isHost
      ? h('div', { class: 'actions' },
        button('もう一回（同じメンバー）', () => ctx.send('again'), 'primary', { disabled: !!validate(ctx) }),
        h('p', { class: 'center muted small', style: 'margin:0' }, '設定を変えるときは右上の「ロビーへ」から'))
      : h('p', { class: 'center muted small' }, 'ホストの操作を待っています…'));
}
})();
