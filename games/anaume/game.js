// ===== 穴〇め早打ち =====
// 出題者が「東京タワ〇」のような〇入りのお題を出し、ほかの人は〇に入る文字を
// だれよりも早く打つ。みんなの入力中の文字はリアルタイムで見える。
//
// - 出題者はロビーで選ぶ：ホスト／交代制（1問ごとに順番に交代）／指名。問題の合間にホストが変えることもできる
// - 〇はいくつでも入れられる。〇ごとに正解を書き、1つの〇に2文字以上入ってもよい
// - 回答の順番はサーバーの時刻で決める
// - ひらがな・カタカナ、全角・半角、伸ばし棒の違いは同じ扱い。別解は「/」区切り
(() => {
const { h, inputBox, button, drafts, toast, ask } = window.Party.ui;

const BLANK = '〇';
const MAX_ANSWERERS = 8;
const MAX_ANSWERS = 80; // 1問で保存する回答の数の上限
const MAX_HOLES = 8;

// 端末ごとの見た目だけの状態
const view = { round: -1, playStart: 0, typingTimer: null, lastSend: 0 };

// ---------- 判定 ----------
function norm(s) {
  s = String(s || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
  s = s.replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)); // ひらがな → カタカナ
  s = s.replace(/[-‐‑‒–—―−~〜～]/g, 'ー');
  return s;
}
const normQ = (s) => String(s || '').replace(/[○◯]/g, BLANK);
const holeCount = (q) => [...String(q || '')].filter((c) => c === BLANK).length;
const alternatives = (ans) => String(ans || '').split(/[/／|｜]/).map((s) => s.trim()).filter(Boolean);

// 〇ごとの正解（別解つき）から、正解になる入力をすべて作る
function correctSet(question, holeAnswers) {
  let combos = [[]];
  for (const ans of holeAnswers || []) {
    const alts = alternatives(ans);
    const next = [];
    for (const c of combos) for (const a of alts) if (next.length < 200) next.push([...c, a]);
    combos = next;
  }
  const set = new Set();
  for (const parts of combos) {
    set.add(norm(parts.join('')));
    // お題全体を打ってきた場合も正解にする
    let i = 0;
    set.add(norm([...question].map((c) => (c === BLANK ? parts[i++] ?? '' : c)).join('')));
  }
  return set;
}

// 打った文字を〇ごとに分ける（holes は〇ごとの文字数のめやす）
function split(text, n, holes) {
  const chars = [...String(text || '')];
  const parts = [];
  let ci = 0;
  for (let i = 0; i < n; i++) {
    if (i === n - 1) { parts.push(chars.slice(ci).join('')); break; }
    const len = (holes && holes[i]) || 1;
    parts.push(chars.slice(ci, ci + len).join(''));
    ci += len;
  }
  return parts;
}

// お題の〇を文字で埋めた表示を作る（parts は〇ごとの文字）
function fill(question, parts) {
  const out = [];
  let bi = 0;
  let plain = '';
  for (const c of question) {
    if (c !== BLANK) { plain += c; continue; }
    if (plain) { out.push(plain); plain = ''; }
    const put = (parts || [])[bi++] || '';
    out.push(put ? h('span', { class: 'aq-blank' }, put) : h('span', { class: 'aq-blank empty' }, BLANK));
  }
  if (plain) out.push(plain);
  return out;
}

const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '（退出した人）';
const answerers = (ctx, g) => ctx.players.filter((p) => p.id !== g.asker);
const isOnline = (ctx, id) => { const p = ctx.players.find((x) => x.id === id); return !!(p && p.online); };

function validate(ctx) {
  const n = ctx.players.length;
  if (n < 2) return '出題者のほかに、答える人が1人以上必要です（2人以上）';
  if (n - 1 > MAX_ANSWERERS) return `答える人は${MAX_ANSWERERS}人までです`;
  return null;
}

// 出題者を決める
function firstAsker(ctx) {
  const mode = ctx.settings.asker || 'host';
  if (mode === 'host' || mode === 'rotate') return ctx.hostId;
  return ctx.players.some((p) => p.id === mode) ? mode : ctx.hostId;
}
// 交代制のとき、次の出題者（参加順で次の人。オフラインの人は飛ばす）
function nextAsker(ctx, g) {
  if (g.mode !== 'rotate') return ctx.players.some((p) => p.id === g.asker) ? g.asker : ctx.hostId;
  const ids = ctx.players.map((p) => p.id);
  if (!ids.length) return g.asker;
  const start = Math.max(0, ids.indexOf(g.asker));
  for (let k = 1; k <= ids.length; k++) {
    const id = ids[(start + k) % ids.length];
    if (isOnline(ctx, id)) return id;
  }
  return ids[(start + 1) % ids.length];
}

function reveal(ctx, g, extra) {
  const answers = (ctx.private && ctx.private.answers) || [];
  return {
    game: {
      ...g, ...extra,
      phase: 'reveal',
      reveal: answers.map((a) => alternatives(a)[0] || ''),
      asker: nextAsker(ctx, g),
      prevAsker: g.asker,
    },
    secrets: null,
  };
}

function win(ctx, g, list, index) {
  const e = list[index];
  list[index] = { ...e, ok: true };
  const scores = { ...(g.scores || {}) };
  scores[e.pid] = (scores[e.pid] || 0) + 1;
  return reveal(ctx, g, { answers: list, winner: { pid: e.pid, text: e.text, ts: e.ts }, scores });
}

window.Party.register({
  id: 'anaume',
  name: '穴〇め早打ち',
  icon: '⌨️',
  description: '〇に入る文字を、だれよりも早く打て',

  defaultSettings: () => ({ asker: 'host' }),
  validate,

  renderSettings(ctx, { editable, set }) {
    const cur = ctx.settings.asker || 'host';
    const valid = cur === 'host' || cur === 'rotate' || ctx.players.some((p) => p.id === cur);
    const sel = valid ? cur : 'host';
    const chip = (value, label) => h('button', {
      type: 'button', class: 'chip' + (sel === value ? ' on' : ''), disabled: !editable,
      onclick: () => set({ asker: value }),
    }, label);
    return h('div', { class: 'settings' },
      h('div', { class: 'row col' },
        h('span', { class: 'row-label' }, '出題者'),
        h('div', { class: 'chips' },
          chip('host', 'ホスト'),
          chip('rotate', '交代制'),
          ctx.players.filter((p) => p.id !== ctx.hostId).map((p) => chip(p.id, p.name))),
        h('small', { class: 'muted' }, sel === 'rotate'
          ? '1問ごとに、参加した順番で出題者が交代します（ホストから）'
          : `${sel === 'host' ? 'ホスト' : nameOf(ctx, sel)}が出題します。問題の合間にホストが変えることもできます`)),
      h('p', { class: 'muted small', style: 'margin:0' },
        '出題者が〇入りのお題を出し、ほかの人は〇に入る文字をいちばん早く送った人が1ポイント。〇はいくつでも入れられます。'));
  },

  start: (ctx) => ({
    game: {
      phase: 'compose', round: 0, question: '', holes: null, answers: null, winner: null, reveal: null,
      scores: null, startedAt: null, mode: ctx.settings.asker === 'rotate' ? 'rotate' : 'fixed', asker: firstAsker(ctx), prevAsker: null,
    },
    private: null,
    secrets: null,
  }),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const from = a.from;
    const isAsker = from === g.asker;
    const isHost = from === ctx.hostId;

    switch (a.type) {
      case 'ask': {
        if (!isAsker || g.phase === 'playing') return null;
        const question = normQ(a.question).trim().slice(0, 40);
        const n = holeCount(question);
        const answers = (Array.isArray(a.answers) ? a.answers : []).map((s) => String(s || '').trim().slice(0, 30));
        if (n < 1 || n > MAX_HOLES || answers.length !== n || answers.some((s) => !alternatives(s).length)) return null;
        return {
          game: {
            ...g, phase: 'playing', round: g.round + 1, question, answers: null, winner: null, reveal: null,
            holes: answers.map((s) => [...alternatives(s)[0]].length),
            startedAt: window.Party.SERVER_TIME,
          },
          private: { answers },
          // 出題者は自分の画面で正解を確認できるように
          secrets: { [from]: { answers } },
        };
      }
      case 'answer': {
        const text = String(a.text || '').trim().slice(0, 30);
        if (isAsker || !text || a.round !== g.round) return null;
        const list = [...(g.answers || [])];
        if (list.length >= MAX_ANSWERS) return null;
        // 正解が出たあとに届いた回答は「おそかった」として残す
        if (g.phase === 'reveal') {
          if (g.round !== a.round) return null;
          list.push({ pid: from, text, ts: a.ts, ok: 'late' });
          return { game: { ...g, answers: list } };
        }
        if (g.phase !== 'playing') return null;
        const ok = correctSet(g.question, ctx.private && ctx.private.answers).has(norm(text));
        list.push({ pid: from, text, ts: a.ts, ok });
        if (ok) return win(ctx, g, list, list.length - 1);
        return { game: { ...g, answers: list } };
      }
      case 'accept': {
        // 別解を出題者が手動で正解にする
        if (!isAsker || g.phase !== 'playing') return null;
        const list = [...(g.answers || [])];
        if (!list[a.index] || list[a.index].ok === true) return null;
        return win(ctx, g, list, a.index);
      }
      case 'giveup':
        // 出題者が落ちたときのため、ホストも締め切れる
        if ((!isAsker && !isHost) || g.phase !== 'playing') return null;
        return reveal(ctx, g, { winner: null });
      case 'setAsker': {
        // 問題の合間に、ホストが次の出題者を変える
        if (!isHost || g.phase === 'playing') return null;
        if (a.id === 'rotate') return { game: { ...g, mode: 'rotate' } };
        if (!ctx.players.some((p) => p.id === a.id)) return null;
        return { game: { ...g, mode: 'fixed', asker: a.id } };
      }
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    const amAsker = ctx.me === g.asker;
    if (g.round !== view.round) {
      view.round = g.round;
      view.playStart = Date.now();
      drafts['aq-ans'] = '';
      const el = document.getElementById('aq-ans');
      if (el) el.value = '';
      // 新しい問題が出たら、回答欄にカーソルを置く
      if (g.phase === 'playing' && !amAsker) setTimeout(() => { const i = document.getElementById('aq-ans'); if (i) i.focus(); }, 60);
    }
    return amAsker ? askerView(ctx, g) : playerView(ctx, g);
  },
});

// ---------- 画面 ----------
const elapsed = () => ((Date.now() - view.playStart) / 1000).toFixed(1) + ' 秒';
setInterval(() => {
  document.querySelectorAll('.aq-timer').forEach((el) => { el.textContent = elapsed(); });
}, 100);

function questionBlock(g, parts) {
  // id を問題ごとに変えて、新しい問題のときだけ登場アニメーションを出す
  return h('div', { class: 'aq-q pop', id: `aq-q-${g.round}-${g.phase}` }, fill(g.question, parts));
}

function resultBlock(ctx, g) {
  const w = g.winner;
  const sec = w && typeof w.ts === 'number' && typeof g.startedAt === 'number' ? ((w.ts - g.startedAt) / 1000).toFixed(2) : null;
  const parts = g.reveal || [];
  return h('div', null,
    questionBlock(g, parts),
    w
      ? h('div', { class: 'aq-result' },
        h('div', { class: 'aq-who pop' }, `🎉 ${nameOf(ctx, w.pid)} の勝ち！`),
        sec && h('div', { class: 'muted small' }, `${sec} 秒`))
      : h('div', { class: 'aq-result' },
        h('div', { class: 'aq-who none' }, '正解者なし'),
        h('div', { class: 'muted small' }, `正解：${parts.join('・')}`)));
}

// 出題者の表示と、ホストが次の出題者を変えるところ
function askerBar(ctx, g) {
  const playing = g.phase === 'playing';
  const label = playing || g.phase === 'compose' ? '出題者' : '次の出題者';
  const canChange = ctx.isHost && !playing;
  return h('div', { class: 'aq-askerbar' },
    h('div', { class: 'aq-asker-now' },
      h('span', { class: 'muted small' }, label),
      h('strong', null, nameOf(ctx, g.asker), g.asker === ctx.me ? '（あなた）' : ''),
      g.mode === 'rotate' && h('span', { class: 'tag' }, '交代制')),
    canChange && h('div', { class: 'chips' },
      h('button', { type: 'button', class: 'chip' + (g.mode === 'rotate' ? ' on' : ''), onclick: () => ctx.send('setAsker', { id: 'rotate' }) }, '交代制'),
      ctx.players.map((p) => h('button', {
        type: 'button', class: 'chip' + (g.mode !== 'rotate' && g.asker === p.id ? ' on' : ''),
        onclick: () => ctx.send('setAsker', { id: p.id }),
      }, p.name))));
}

function board(ctx, g, amAsker) {
  const list = answerers(ctx, g).concat(
    // 出題者のぶんの得点も見えるように（問題中は答えないので一番下）
    ctx.players.filter((p) => p.id === g.asker));
  const byPlayer = {};
  (g.answers || []).forEach((ans, index) => { (byPlayer[ans.pid] = byPlayer[ans.pid] || []).push({ ...ans, index }); });
  const playing = g.phase === 'playing';
  const scores = g.scores || {};

  return h('div', { class: 'aq-board' }, list.map((p) => {
    const asking = p.id === g.asker;
    const live = ctx.live[p.id];
    const typing = playing && !asking && live && live.r === g.round ? live.t : '';
    const tries = (byPlayer[p.id] || []).slice(-4);
    const isWinner = g.winner && g.winner.pid === p.id;
    const n = holeCount(g.question);
    return h('div', { class: 'aq-pl' + (p.online ? '' : ' off') + (isWinner ? ' win' : '') + (p.id === ctx.me ? ' mine' : '') + (asking ? ' asker' : '') },
      h('div', { class: 'aq-pl-h' },
        h('span', { class: 'aq-pl-name' }, isWinner ? '👑 ' : '', p.name, p.id === ctx.me ? '（あなた）' : '', asking ? '　🎤出題者' : ''),
        h('span', { class: 'aq-pl-score' }, `${scores[p.id] || 0} pt`)),
      playing && !asking && (typing
        ? h('div', { class: 'aq-live' }, fill(g.question, split(typing, n, g.holes)))
        : h('div', { class: 'aq-live idle' }, '…')),
      tries.length > 0 && h('div', { class: 'aq-tries' }, tries.map((t) => {
        const cls = t.ok === true ? 'ok' : t.ok === false ? 'ng' : t.ok === 'late' ? 'late' : '';
        const label = (t.ok === true ? '✓ ' : '') + t.text;
        // 出題者は別解をタップして正解にできる
        if (amAsker && playing && t.ok !== true) {
          return h('button', {
            type: 'button', class: 'aq-try ' + cls,
            onclick: () => ask(`「${t.text}」（${p.name}）を正解にしますか？`, () => ctx.send('accept', { index: t.index })),
          }, label);
        }
        return h('span', { class: 'aq-try ' + cls }, label);
      })));
  }));
}

// ----- 出題者 -----
function askerView(ctx, g) {
  const n = answerers(ctx, g).length;
  const mine = (ctx.secret && ctx.secret.answers) || [];
  const stage = g.phase === 'playing'
    ? h('div', { class: 'card' },
      questionBlock(g, []),
      h('div', { class: 'aq-hostinfo' }, '正解：', h('b', null, mine.join('・')), '（出題者にだけ見えています）'),
      h('div', { class: 'aq-timer timer' }, elapsed()),
      h('p', { class: 'muted small center', style: 'margin:0' }, '別解が来たら、下の回答をタップすると手動で正解にできます'),
      button('正解者なしで発表する', () => ask('正解者なしで発表しますか？', () => ctx.send('giveup')), 'ghost'))
    : g.phase === 'reveal'
      ? h('div', { class: 'card' }, resultBlock(ctx, g))
      : h('div', { class: 'card center' }, h('p', { class: 'muted', style: 'margin:0' }, `あなたが出題者です。${n}人が答えます。問題を出そう！`));

  return h('div', { class: 'stack' },
    askerBar(ctx, g),
    stage,
    g.phase !== 'playing' && composer(ctx, g),
    h('div', { class: 'aq-sec' }, 'みんなの回答'),
    board(ctx, g, true));
}

function composer(ctx, g) {
  const q = normQ(drafts['aq-question'] || '');
  const n = holeCount(q);
  const insertBlank = () => {
    const el = document.getElementById('aq-question');
    if (!el) return;
    const v = el.value;
    const i = el.selectionStart ?? v.length;
    const j = el.selectionEnd ?? i;
    el.value = v.slice(0, i) + BLANK + v.slice(j);
    drafts['aq-question'] = el.value;
    el.setSelectionRange(i + 1, i + 1);
    el.focus();
    ctx.rerender();
  };
  const send = () => {
    const question = normQ(drafts['aq-question'] || '').trim();
    const k = holeCount(question);
    if (!k) return toast('お題に〇を1つ以上入れてね');
    if (k > MAX_HOLES) return toast(`〇は${MAX_HOLES}個までです`);
    const answers = [];
    for (let i = 0; i < k; i++) {
      const v = (drafts['aq-answer-' + i] || '').trim();
      if (!alternatives(v).length) return toast(k > 1 ? `〇${i + 1}の正解を入れてね` : '正解を入れてね');
      answers.push(v);
    }
    ctx.send('ask', { question, answers });
    drafts['aq-question'] = '';
    for (let i = 0; i < MAX_HOLES; i++) drafts['aq-answer-' + i] = '';
    document.querySelectorAll('#aq-question, [id^="aq-answer-"]').forEach((el) => { el.value = ''; });
  };
  return h('div', { class: 'card' },
    h('label', { class: 'label', for: 'aq-question' }, 'お題（文字はキーボード、〇はボタンで入力。〇はいくつでもOK）'),
    h('div', { class: 'aq-row' },
      inputBox('aq-question', { placeholder: '例：東京タワ〇／〇ン〇ン', maxlength: 40, onInput: () => ctx.rerender() }),
      h('button', { type: 'button', class: 'btn aq-blank-btn', onpointerdown: (e) => e.preventDefault(), onclick: insertBlank }, BLANK)),
    h('div', { class: 'aq-preview' }, q ? fill(q, []) : ''),
    n === 0
      ? h('p', { class: 'muted small', style: 'margin:0' }, '〇を入れると、ここに正解を書く欄が出ます')
      : Array.from({ length: Math.min(n, MAX_HOLES) }, (_, i) => h('div', { class: 'aq-holeans', id: 'aq-hole-' + i },
        h('label', { class: 'label', for: 'aq-answer-' + i }, n > 1 ? `〇${i + 1}の正解` : '正解（〇に入る文字）'),
        inputBox('aq-answer-' + i, { placeholder: n > 1 ? `〇${i + 1}に入る文字` : '例：ー', maxlength: 30 }))),
    n > MAX_HOLES && h('p', { class: 'warn' }, `〇は${MAX_HOLES}個までです`),
    h('p', { class: 'muted small', style: 'margin:0' },
      '1つの〇に2文字以上入れてもOK。別解は「/」で区切ります（例：ー/－）。ひらがな・カタカナ、全角・半角の違いは自動で同じ扱いになります。答える人は、〇に入る文字を前から順につなげて打ちます。'),
    button(g.round ? '次の問題を出題する' : '出題する', send, 'primary'));
}

// ----- 答える人 -----
function playerView(ctx, g) {
  const myScore = (g.scores || {})[ctx.me] || 0;
  const canAnswer = g.phase === 'playing' && !g.winner;
  const n = holeCount(g.question);

  const sendTyping = (value) => {
    clearTimeout(view.typingTimer);
    view.typingTimer = setTimeout(() => {
      if (ctx.game.phase === 'playing') ctx.setLive({ r: g.round, t: value || '' });
    }, 80);
  };
  const submit = () => {
    const text = (drafts['aq-ans'] || '').trim();
    if (!text || !canAnswer) return;
    if (Date.now() - view.lastSend < 400) return; // 連打よけ
    view.lastSend = Date.now();
    ctx.send('answer', { text, round: g.round });
    drafts['aq-ans'] = '';
    const el = document.getElementById('aq-ans');
    if (el) { el.value = ''; el.focus(); }
    clearTimeout(view.typingTimer);
    ctx.setLive(null);
  };

  const stage = g.phase === 'playing'
    ? h('div', { class: 'card' }, questionBlock(g, []),
      n > 1 && h('p', { class: 'muted small center', style: 'margin:0' }, `〇が${n}つ。入る文字を前から順につなげて打とう`),
      h('div', { class: 'aq-timer timer' }, elapsed()))
    : g.phase === 'reveal'
      ? h('div', { class: 'card' }, resultBlock(ctx, g))
      : h('div', { class: 'card center' }, h('p', { class: 'muted', style: 'margin:0' }, `${nameOf(ctx, g.asker)}が問題を準備中…`));

  return h('div', { class: 'stack aq-player' },
    askerBar(ctx, g),
    h('div', { class: 'aq-me' }, h('span', { class: 'muted small' }, 'あなたの得点'), h('strong', null, `${myScore} pt`)),
    stage,
    h('div', { class: 'aq-sec' }, 'みんなの回答'),
    board(ctx, g, false),
    h('div', { class: 'aq-answerbar' },
      h('div', { class: 'aq-row' },
        inputBox('aq-ans', {
          placeholder: canAnswer ? '〇に入る文字' : '次の問題を待っています',
          maxlength: 30, keepFocus: true, enterkeyhint: 'send', disabled: !canAnswer,
          onInput: sendTyping, onEnter: submit,
        }),
        h('button', {
          type: 'button', class: 'btn primary', disabled: !canAnswer,
          onpointerdown: (e) => e.preventDefault(), // キーボードを閉じない
          onclick: submit,
        }, '送信'))));
}
})();
