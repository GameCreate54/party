// ===== 穴〇め早打ち =====
// ホストが「東京タワ〇」のような〇入りのお題を出し、プレイヤーは〇に入る文字を
// だれよりも早く打つ。みんなの入力中の文字はリアルタイムで見える。
//
// - ホストは出題者（プレイヤーには入らない）。プレイヤーは1〜8人
// - 回答の順番はサーバーの時刻で決める
// - ひらがな・カタカナ、全角・半角、伸ばし棒の違いは同じ扱い。別解は「/」区切り
(() => {
const { h, inputBox, button, drafts, toast, ask } = window.Party.ui;

const BLANK = '〇';
const MAX_PLAYERS = 8;
const MAX_ANSWERS = 80; // 1問で保存する回答の数の上限

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
const alternatives = (ans) => String(ans || '').split(/[/／|｜]/).map((s) => s.trim()).filter(Boolean);

function correctSet(question, answer) {
  const set = new Set();
  for (const a of alternatives(answer)) {
    set.add(norm(a));
    // お題全体を打ってきた場合も正解にする
    const ch = [...a];
    let i = 0;
    const full = [...question].map((c) => (c === BLANK ? ch[i++] ?? '' : c)).join('') + ch.slice(i).join('');
    set.add(norm(full));
  }
  return set;
}

// お題の〇を文字で埋めた表示を作る
function fill(question, text) {
  const chars = [...String(text || '')];
  const blanks = [...question].filter((c) => c === BLANK).length;
  const out = [];
  let bi = 0;
  let ci = 0;
  let plain = '';
  for (const c of question) {
    if (c !== BLANK) { plain += c; continue; }
    if (plain) { out.push(plain); plain = ''; }
    bi++;
    let put = chars[ci++] ?? '';
    if (bi === blanks && ci < chars.length) { put += chars.slice(ci).join(''); ci = chars.length; }
    out.push(put ? h('span', { class: 'aq-blank' }, put) : h('span', { class: 'aq-blank empty' }, BLANK));
  }
  if (plain) out.push(plain);
  return out;
}

const players = (ctx) => ctx.players.filter((p) => p.id !== ctx.hostId);
const nameOf = (ctx, id) => (ctx.players.find((p) => p.id === id) || {}).name || '（退出した人）';

function validate(ctx) {
  const n = players(ctx).length;
  if (n < 1) return 'ホストは出題者なので、ほかにプレイヤーが1人以上必要です';
  if (n > MAX_PLAYERS) return `プレイヤーはホストを除いて${MAX_PLAYERS}人までです`;
  return null;
}

function win(ctx, g, list, index) {
  const e = list[index];
  list[index] = { ...e, ok: true };
  const scores = { ...(g.scores || {}) };
  scores[e.pid] = (scores[e.pid] || 0) + 1;
  return {
    game: {
      ...g,
      answers: list,
      phase: 'reveal',
      winner: { pid: e.pid, text: e.text, ts: e.ts },
      scores,
      reveal: alternatives(ctx.private && ctx.private.answer)[0] || e.text,
    },
  };
}

window.Party.register({
  id: 'anaume',
  name: '穴〇め早打ち',
  icon: '⌨️',
  description: '〇に入る文字を、だれよりも早く打て',

  defaultSettings: () => ({}),
  validate,

  renderSettings(ctx) {
    const n = players(ctx).length;
    return h('div', { class: 'settings' },
      h('p', { class: 'muted small', style: 'margin:0' },
        'ホストが出題者になって、〇入りのお題を出します。プレイヤーは〇に入る文字をいちばん早く送った人が1ポイント。'),
      h('div', { class: 'row' },
        h('span', { class: 'row-label' }, 'プレイヤー'),
        h('strong', null, `${n}人`, h('small', { class: 'muted' }, `（ホスト除く・最大${MAX_PLAYERS}人）`))));
  },

  start: () => ({
    game: { phase: 'compose', round: 0, question: '', answers: null, winner: null, reveal: '', scores: null, startedAt: null },
    private: null,
  }),

  handle(ctx, a) {
    const g = ctx.game;
    if (!g) return null;
    const isHost = a.from === ctx.hostId;

    switch (a.type) {
      case 'ask': {
        if (!isHost || g.phase === 'playing') return null;
        const question = normQ(a.question).trim().slice(0, 40);
        const answer = String(a.answer || '').trim().slice(0, 40);
        if (!question.includes(BLANK) || !answer) return null;
        return {
          game: {
            ...g, phase: 'playing', round: g.round + 1, question, answers: null, winner: null, reveal: '',
            startedAt: window.Party.SERVER_TIME,
          },
          private: { answer },
        };
      }
      case 'answer': {
        const text = String(a.text || '').trim().slice(0, 30);
        if (isHost || !text || a.round !== g.round) return null;
        const list = [...(g.answers || [])];
        if (list.length >= MAX_ANSWERS) return null;
        // 正解が出たあとに届いた回答は「おそかった」として残す
        if (g.phase === 'reveal') {
          list.push({ pid: a.from, text, ts: a.ts, ok: 'late' });
          return { game: { ...g, answers: list } };
        }
        if (g.phase !== 'playing') return null;
        const ok = correctSet(g.question, ctx.private && ctx.private.answer).has(norm(text));
        list.push({ pid: a.from, text, ts: a.ts, ok });
        if (ok) return win(ctx, g, list, list.length - 1);
        return { game: { ...g, answers: list } };
      }
      case 'accept': {
        // 別解をホストが手動で正解にする
        if (!isHost || g.phase !== 'playing') return null;
        const list = [...(g.answers || [])];
        if (!list[a.index] || list[a.index].ok === true) return null;
        return win(ctx, g, list, a.index);
      }
      case 'giveup':
        if (!isHost || g.phase !== 'playing') return null;
        return { game: { ...g, phase: 'reveal', winner: null, reveal: alternatives(ctx.private && ctx.private.answer)[0] || '' } };
      default:
        return null;
    }
  },

  render(ctx) {
    const g = ctx.game;
    if (g.round !== view.round) {
      view.round = g.round;
      view.playStart = Date.now();
      drafts['aq-ans'] = '';
      const el = document.getElementById('aq-ans');
      if (el) el.value = '';
      // 新しい問題が出たら、回答欄にカーソルを置く
      if (g.phase === 'playing' && !ctx.isHost) setTimeout(() => { const i = document.getElementById('aq-ans'); if (i) i.focus(); }, 60);
    }
    return ctx.isHost ? hostView(ctx, g) : playerView(ctx, g);
  },
});

// ---------- 画面 ----------
const elapsed = () => ((Date.now() - view.playStart) / 1000).toFixed(1) + ' 秒';
setInterval(() => {
  document.querySelectorAll('.aq-timer').forEach((el) => { el.textContent = elapsed(); });
}, 100);

function questionBlock(g, text) {
  // id を問題ごとに変えて、新しい問題のときだけ登場アニメーションを出す
  return h('div', { class: 'aq-q pop', id: `aq-q-${g.round}-${g.phase}` }, fill(g.question, text));
}

function resultBlock(ctx, g) {
  const w = g.winner;
  const sec = w && typeof w.ts === 'number' && typeof g.startedAt === 'number' ? ((w.ts - g.startedAt) / 1000).toFixed(2) : null;
  return h('div', null,
    questionBlock(g, g.reveal),
    w
      ? h('div', { class: 'aq-result' },
        h('div', { class: 'aq-who pop' }, `🎉 ${nameOf(ctx, w.pid)} の勝ち！`),
        sec && h('div', { class: 'muted small' }, `${sec} 秒`))
      : h('div', { class: 'aq-result' },
        h('div', { class: 'aq-who none' }, '正解者なし'),
        h('div', { class: 'muted small' }, `正解：${g.reveal}`)));
}

function board(ctx, g) {
  const list = players(ctx);
  if (!list.length) return h('p', { class: 'muted center' }, 'まだだれもいません');
  const byPlayer = {};
  (g.answers || []).forEach((ans, index) => { (byPlayer[ans.pid] = byPlayer[ans.pid] || []).push({ ...ans, index }); });
  const playing = g.phase === 'playing';
  const scores = g.scores || {};

  return h('div', { class: 'aq-board' }, list.map((p) => {
    const live = ctx.live[p.id];
    const typing = playing && live && live.r === g.round ? live.t : '';
    const tries = (byPlayer[p.id] || []).slice(-4);
    const isWinner = g.winner && g.winner.pid === p.id;
    return h('div', { class: 'aq-pl' + (p.online ? '' : ' off') + (isWinner ? ' win' : '') + (p.id === ctx.me ? ' mine' : '') },
      h('div', { class: 'aq-pl-h' },
        h('span', { class: 'aq-pl-name' }, isWinner ? '👑 ' : '', p.name, p.id === ctx.me ? '（あなた）' : ''),
        h('span', { class: 'aq-pl-score' }, `${scores[p.id] || 0} pt`)),
      playing && (typing
        ? h('div', { class: 'aq-live' }, fill(g.question, typing))
        : h('div', { class: 'aq-live idle' }, '…')),
      tries.length > 0 && h('div', { class: 'aq-tries' }, tries.map((t) => {
        const cls = t.ok === true ? 'ok' : t.ok === false ? 'ng' : t.ok === 'late' ? 'late' : '';
        const label = (t.ok === true ? '✓ ' : '') + t.text;
        // ホストは別解をタップして正解にできる
        if (ctx.isHost && playing && t.ok !== true) {
          return h('button', {
            type: 'button', class: 'aq-try ' + cls,
            onclick: () => ask(`「${t.text}」（${p.name}）を正解にしますか？`, () => ctx.send('accept', { index: t.index })),
          }, label);
        }
        return h('span', { class: 'aq-try ' + cls }, label);
      })));
  }));
}

// ----- ホスト（出題者） -----
function hostView(ctx, g) {
  const n = players(ctx).length;
  const stage = g.phase === 'playing'
    ? h('div', { class: 'card' },
      questionBlock(g, ''),
      h('div', { class: 'aq-hostinfo' }, '正解：', h('b', null, (ctx.private && ctx.private.answer) || ''), '（ホストにだけ見えています）'),
      h('div', { class: 'aq-timer timer' }, elapsed()),
      h('p', { class: 'muted small center', style: 'margin:0' }, '別解が来たら、下の回答をタップすると手動で正解にできます'),
      button('正解者なしで発表する', () => ask('正解者なしで発表しますか？', () => ctx.send('giveup')), 'ghost'))
    : g.phase === 'reveal'
      ? h('div', { class: 'card' }, resultBlock(ctx, g))
      : h('div', { class: 'card center' }, h('p', { class: 'muted', style: 'margin:0' }, `${n}人が参加中。最初の問題を出そう！`));

  return h('div', { class: 'stack' },
    stage,
    g.phase !== 'playing' && composer(ctx, g),
    h('div', { class: 'aq-sec' }, 'プレイヤー'),
    board(ctx, g));
}

function composer(ctx, g) {
  const q = normQ(drafts['aq-question'] || '');
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
  const ask = () => {
    const question = normQ(drafts['aq-question'] || '').trim();
    const answer = (drafts['aq-answer'] || '').trim();
    if (!question.includes(BLANK)) return toast('お題に〇を1つ以上入れてね');
    if (!answer) return toast('正解を入れてね');
    ctx.send('ask', { question, answer });
    drafts['aq-question'] = '';
    drafts['aq-answer'] = '';
    for (const id of ['aq-question', 'aq-answer']) { const el = document.getElementById(id); if (el) el.value = ''; }
  };
  return h('div', { class: 'card' },
    h('label', { class: 'label', for: 'aq-question' }, 'お題（文字はキーボード、〇はボタンで入力）'),
    h('div', { class: 'aq-row' },
      inputBox('aq-question', { placeholder: '例：東京タワ〇', maxlength: 40, onInput: () => ctx.rerender() }),
      h('button', { type: 'button', class: 'btn aq-blank-btn', onpointerdown: (e) => e.preventDefault(), onclick: insertBlank }, BLANK)),
    h('div', { class: 'aq-preview' }, q ? fill(q, '') : ''),
    h('label', { class: 'label', for: 'aq-answer' }, '正解（〇に入る文字）'),
    inputBox('aq-answer', { placeholder: '例：ー', maxlength: 40 }),
    h('p', { class: 'muted small', style: 'margin:0' }, '別解は「/」で区切ります（例：ー/－）。ひらがな・カタカナ、全角・半角の違いは自動で同じ扱いになります。'),
    button(g.round ? '次の問題を出題する' : '出題する', ask, 'primary'));
}

// ----- プレイヤー -----
function playerView(ctx, g) {
  const myScore = (g.scores || {})[ctx.me] || 0;
  const canAnswer = g.phase === 'playing' && !g.winner;

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
    ? h('div', { class: 'card' }, questionBlock(g, ''), h('div', { class: 'aq-timer timer' }, elapsed()))
    : g.phase === 'reveal'
      ? h('div', { class: 'card' }, resultBlock(ctx, g))
      : h('div', { class: 'card center' }, h('p', { class: 'muted', style: 'margin:0' }, 'ホストが問題を準備中…'));

  return h('div', { class: 'stack aq-player' },
    h('div', { class: 'aq-me' }, h('span', { class: 'muted small' }, 'あなたの得点'), h('strong', null, `${myScore} pt`)),
    stage,
    h('div', { class: 'aq-sec' }, 'みんなの回答'),
    board(ctx, g),
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
