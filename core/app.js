// 画面の切り替え：トップ → ロビー → 各ゲーム
(() => {
const { createBackend, Room, GAMES } = window.Party;
const { MAX_CONNECTIONS } = window.PARTY_CONFIG;
const { h, inputBox, button, drafts, toast, patch, ask } = window.Party.ui;


const app = document.getElementById('app');
let db = null;
let room = null;
let stopPresence = null;
let busy = false;

// プレイヤーIDはタブごと。閉じても「前の部屋に戻る」で復帰できるよう最後の情報も残す
function getPid() {
  let id = sessionStorage.getItem('pr-pid');
  if (!id) {
    id = 'p' + Math.random().toString(36).slice(2, 10);
    sessionStorage.setItem('pr-pid', id);
  }
  return id;
}
let me = getPid();

const readLast = () => { try { return JSON.parse(localStorage.getItem('pr-last') || 'null'); } catch { return null; } };

// ---------- 描画 ----------
function render() {
  let view;
  try {
    view = room ? roomScreen() : topScreen();
  } catch (e) {
    console.error(e);
    view = h('div', { class: 'screen' }, h('div', { class: 'card' }, h('p', null, '表示エラー：' + e.message)));
  }
  patch(app, view);
}

async function guard(fn) {
  if (busy) return;
  busy = true;
  try { await fn(); } catch (e) { toast(e.message || String(e)); } finally { busy = false; }
}

// ---------- トップ ----------
const topView = { pick: null, all: false };

// 何人で遊べるかを、各ゲームの validate() に人数を変えて聞いて調べる
const rangeCache = {};
function playerRange(g) {
  if (rangeCache[g.id]) return rangeCache[g.id];
  const ok = [];
  for (let n = 1; n <= 8; n++) {
    const players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'p' + i, online: true, joinedAt: i }));
    try {
      if (!g.validate({ players, settings: g.defaultSettings(), me: 'p0', hostId: 'p0', isHost: true, game: null, memory: null, now: () => Date.now() })) ok.push(n);
    } catch { /* 判定できないゲーム */ }
  }
  const txt = !ok.length ? '' : ok[0] === ok[ok.length - 1] ? `${ok[0]}人` : `${ok[0]}〜${ok[ok.length - 1]}人`;
  rangeCache[g.id] = txt;
  return txt;
}

function topGames() {
  const SHOW = 12;
  const list = topView.all ? GAMES : GAMES.slice(0, SHOW);
  const picked = topView.pick && GAMES.find((g) => g.id === topView.pick);
  return h('section', { class: 'card' },
    h('h2', null, `あそべるゲーム（${GAMES.length}種類）`),
    h('p', { class: 'muted small', style: 'margin:0' }, 'タップすると説明が見られます。部屋に入ったら、遊ぶゲームはみんなの多数決で決めます。'),
    h('div', { class: 'tg-grid' }, list.map((g) => h('button', {
      type: 'button', class: 'tg-card' + (g.id === topView.pick ? ' on' : ''),
      onclick: () => { topView.pick = topView.pick === g.id ? null : g.id; render(); },
    }, h('span', { class: 'tg-icon' }, g.icon), h('span', { class: 'tg-name' }, g.name)))),
    picked && h('div', { class: 'tg-detail pop', id: 'tg-detail' },
      h('div', { class: 'tg-dhead' }, h('span', { class: 'tg-icon big' }, picked.icon), h('div', null, h('strong', null, picked.name), h('div', { class: 'muted small' }, playerRange(picked)))),
      h('p', { style: 'margin:0' }, picked.description),
      button('このゲームに投票して部屋を作る', () => onCreate(picked.id), 'primary small')),
    GAMES.length > SHOW && h('button', { type: 'button', class: 'link small', onclick: () => { topView.all = !topView.all; render(); } },
      topView.all ? '閉じる' : `ほかの${GAMES.length - SHOW}種類も見る`));
}

function topScreen() {
  const last = readLast();
  return h('div', { class: 'screen top' },
    h('div', { class: 'brand' },
      h('div', { class: 'moon' }),
      h('h1', null, 'パーティールーム'),
      h('p', { class: 'sub' }, '通話しながらスマホで遊ぶパーティーゲーム')),
    h('div', { class: 'card' },
      h('label', { class: 'label', for: 'name' }, 'あなたの名前'),
      inputBox('name', { placeholder: '例：ひろま', maxlength: 10 }),
      button('部屋を作る', () => onCreate(), 'primary'),
      h('div', { class: 'or' }, h('span', null, 'または')),
      h('label', { class: 'label', for: 'code' }, 'ルームコード'),
      inputBox('code', { placeholder: '123', maxlength: 3, digits: true, big: true, onEnter: onJoin }),
      button('参加する', onJoin)),
    last && last.room && h('button', { class: 'link', type: 'button', onclick: () => onRejoin(last) }, `前の部屋（${last.room}）に戻る`),
    topGames(),
    window.Party.doodle ? window.Party.doodle.element(db) : null,
    db && db.kind === 'local' && h('p', { class: 'note' }, 'テストモード：Firebase が未設定のため、同じブラウザのタブ同士でだけ遊べます'));
}

function needName() {
  const name = (drafts.name || '').trim();
  if (!name) throw new Error('名前を入力してください');
  localStorage.setItem('pr-name', name);
  return name;
}

function onCreate(voteFor) {
  guard(async () => {
    const name = needName();
    const code = await Room.create(db, me, name, voteFor);
    enter(code);
  });
}

function onJoin() {
  guard(async () => {
    const name = needName();
    const code = (drafts.code || '').trim();
    if (!/^\d{3}$/.test(code)) throw new Error('ルームコードは3桁の数字です');
    await Room.join(db, code, me, name);
    enter(code);
  });
}

function onRejoin(last) {
  guard(async () => {
    me = last.pid;
    sessionStorage.setItem('pr-pid', me);
    await Room.join(db, last.room, me, last.name || drafts.name || 'プレイヤー');
    enter(last.room);
  });
}

function enter(code) {
  room = new Room(db, code, me);
  sessionStorage.setItem('pr-room', code);
  localStorage.setItem('pr-last', JSON.stringify({ room: code, pid: me, name: localStorage.getItem('pr-name') || '' }));
  history.replaceState(null, '', location.pathname + '?room=' + code);
  stopPresence = db.presence(room.base + '/players/' + me + '/online');
  room.watch(onRoomChange);
  render();
}

function exitRoom(msg) {
  if (stopPresence) stopPresence();
  stopPresence = null;
  if (room) room.unwatch();
  room = null;
  sessionStorage.removeItem('pr-room');
  history.replaceState(null, '', location.pathname);
  render();
  if (msg) toast(msg);
}

function onRoomChange() {
  const s = room.state;
  if ('meta' in s && !s.meta) {
    localStorage.removeItem('pr-last');
    return exitRoom('部屋がなくなりました');
  }
  if ('players' in s && !(s.players && s.players[me] && s.players[me].name)) {
    if (s.players && s.players[me]) db.remove(room.base + '/players/' + me);
    return exitRoom('部屋から退出しました');
  }
  autoDecide();
  render();
}

// ---------- ルーム ----------
function roomScreen() {
  const s = room.state;
  if (!s.meta || !s.players) return h('div', { class: 'screen center' }, h('p', { class: 'muted' }, '読み込み中…'));
  return s.meta.status === 'playing' && s.game ? gameScreen() : lobbyScreen();
}

function hostBanner(ctx) {
  const host = ctx.players.find((p) => p.id === ctx.hostId);
  if (ctx.isHost || (host && host.online)) return null;
  return h('div', { class: 'banner' },
    h('span', null, host ? `ホスト（${host.name}）が切断中です` : 'ホストがいません'),
    button('自分がホストになる', () => guard(() => room.claimHost()), 'small'));
}

// 多数決：全員が投票したら、ホストの端末が少し待ってから自動で決定する
let autoTimer = null;
function autoDecide() {
  const s = room && room.state;
  const ok = s && s.meta && s.meta.status === 'lobby' && (s.meta.lobby || 'vote') === 'vote' && room.isHost();
  const online = ok ? room.players().filter((p) => p.online) : [];
  const votes = ok ? room.votes() : {};
  const all = ok && online.length > 0 && online.every((p) => votes[p.id]);
  if (!all) { clearTimeout(autoTimer); autoTimer = null; return; }
  if (autoTimer) return;
  autoTimer = setTimeout(() => {
    autoTimer = null;
    const v = room && room.votes();
    const on = room ? room.players().filter((p) => p.online) : [];
    if (room && room.isHost() && on.length && on.every((p) => v[p.id]) && (room.state.meta.lobby || 'vote') === 'vote') guard(() => room.decide());
  }, 2500);
}

function voteBoard(ctx, votes) {
  const by = {};
  Object.entries(votes).forEach(([pid, gid]) => { (by[gid] = by[gid] || []).push(pid); });
  const ranked = Object.keys(by).sort((a, b) => by[b].length - by[a].length);
  const name = (id) => (ctx.players.find((p) => p.id === id) || {}).name || '？';
  if (!ranked.length) return h('p', { class: 'muted small', style: 'margin:0' }, 'まだだれも投票していません');
  return h('div', { class: 'vt-list' }, ranked.map((gid) => {
    const g = GAMES.find((x) => x.id === gid);
    return h('div', { class: 'vt-row' },
      h('span', { class: 'vt-game' }, g.icon + ' ' + g.name),
      h('b', { class: 'vt-n' }, by[gid].length + '票'),
      h('div', { class: 'vt-who' }, by[gid].map((pid) => h('span', { class: 'chip on' }, name(pid)))));
  }));
}

function lobbyScreen() {
  const ctx = room.ctx();
  const mod = room.game;
  const meta = room.state.meta || {};
  const phase = meta.lobby || 'vote';
  const votes = room.votes();
  const inviteUrl = location.origin + location.pathname + '?room=' + room.code;

  const share = () => guard(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'パーティールーム', text: `ルームコード ${room.code}`, url: inviteUrl }); } catch { /* キャンセル */ }
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      toast('招待リンクをコピーしました');
    }
  });

  const online = ctx.players.filter((p) => p.online);
  const voted = online.filter((p) => votes[p.id]).length;
  const voteName = (gid) => ctx.players.filter((p) => votes[p.id] === gid).map((p) => p.name);

  const head = [
    hostBanner(ctx),
    h('div', { class: 'room-head' },
      h('div', null,
        h('div', { class: 'muted small' }, 'ルームコード'),
        h('div', { class: 'code' }, room.code)),
      button('招待する', share, 'small')),
    h('section', { class: 'card' },
      h('h2', null, `参加者 ${ctx.players.length}/${MAX_CONNECTIONS}`),
      h('ul', { class: 'players' }, ctx.players.map((p) => h('li', { class: p.online ? '' : 'offline' },
        h('span', { class: 'pname' }, p.name),
        phase === 'vote' && votes[p.id] && h('span', { class: 'tag' }, '投票済み'),
        p.id === ctx.hostId && h('span', { class: 'tag host' }, 'ホスト'),
        p.id === me && h('span', { class: 'tag' }, 'あなた'),
        !p.online && h('span', { class: 'tag off' }, '切断中'),
        ctx.isHost && p.id !== me && h('button', {
          class: 'kick', type: 'button', 'aria-label': p.name + 'を退出させる',
          onclick: () => ask(`${p.name} を部屋から外しますか？`, () => guard(() => room.kick(p.id))),
        }, '×'))))),
  ];
  const leaveBtn = button('部屋を出る', () => ask('部屋を出ますか？', () => leave()), 'ghost');

  if (phase === 'vote') {
    const mine = votes[me];
    return h('div', { class: 'screen' }, head,
      h('section', { class: 'card vt-card' },
        h('h2', null, `🗳️ 遊ぶゲームを多数決で決めよう（${voted}/${online.length}人投票）`),
        voteBoard(ctx, votes),
        voted && voted >= online.length ? h('p', { class: 'warn', style: 'margin:0' }, '全員投票しました。まもなく決定します…') : null,
        h('p', { class: 'muted small', style: 'margin:0' }, '下のゲームをタップして投票（もう一度タップで取り消し）。全員そろうと自動で決まり、同じ票数ならランダム。'),
        ctx.isHost && voted ? button('投票を締め切って決める', () => guard(() => room.decide()), 'small') : null),
      h('section', { class: 'card' },
        h('h2', null, `ゲーム（${GAMES.length}種類）`),
        h('div', { class: 'games' }, GAMES.map((g) => {
          const who = voteName(g.id);
          return h('button', {
            type: 'button',
            class: 'game-card' + (g.id === mine ? ' on' : ''),
            onclick: () => guard(() => room.vote(g.id)),
          },
            h('span', { class: 'game-icon' }, g.icon),
            h('span', null,
              h('strong', null, g.name, h('small', { class: 'gc-range' }, ' ' + playerRange(g))),
              h('small', null, g.description),
              who.length ? h('span', { class: 'gc-votes' }, `🗳️ ${who.length}票：${who.join('、')}`) : null));
        }))),
      leaveBtn);
  }

  // ゲームが決まったあと：設定して開始
  const err = mod.validate(ctx);
  const pick = meta.pick || {};
  return h('div', { class: 'screen' }, head,
    h('section', { class: 'card center vt-decided' },
      h('div', { class: 'muted small' }, pick.gameId ? '多数決で決定！' : '次に遊ぶゲーム'),
      h('div', { class: 'vt-big' }, mod.icon + ' ' + (mod.title ? mod.title(ctx) : mod.name)),
      pick.n ? h('div', { class: 'muted small' }, `${pick.n}票${pick.tie ? `（${pick.tie.length}つが同じ票数だったのでランダムで決定）` : ''}`) : null,
      h('p', { class: 'small', style: 'margin:4px 0 0' }, mod.description),
      Object.keys(votes).length ? h('details', { class: 'vt-details' }, h('summary', null, 'だれが何に投票した？'), voteBoard(ctx, votes)) : null),
    h('section', { class: 'card' },
      h('h2', null, '設定'),
      mod.renderSettings(ctx, { editable: ctx.isHost, set: (patch) => guard(() => room.updateSettings(patch)) })),
    ctx.isHost
      ? h('div', { class: 'actions' },
        err && h('p', { class: 'warn' }, err),
        button('ゲーム開始', () => guard(() => room.start()), 'primary', { disabled: !!err }))
      : h('p', { class: 'center muted' }, 'ホストが設定してゲームを始めます'),
    button('🗳️ 別のゲームを投票で選び直す', () => ask('投票をやり直しますか？\n（みんなの票がリセットされます）', () => guard(() => room.revote())), 'small'),
    leaveBtn);
}

function leave() {
  guard(async () => {
    if (stopPresence) stopPresence();
    stopPresence = null;
    const r = room;
    r.unwatch();
    room = null;
    await r.leave();
    localStorage.removeItem('pr-last');
    exitRoom();
  });
}

function gameScreen() {
  const ctx = room.ctx();
  const mod = room.game;
  return h('div', { class: 'screen' },
    hostBanner(ctx),
    h('div', { class: 'game-head' },
      h('span', { class: 'game-title' }, mod.icon + ' ' + (mod.title ? mod.title(ctx) : mod.name)),
      h('span', { class: 'muted small' }, room.code),
      ctx.isHost && h('button', {
        class: 'link small', type: 'button',
        onclick: () => ask('ゲームを終了してロビーに戻りますか？', () => guard(() => room.toLobby())),
      }, 'ロビーへ')),
    mod.render(ctx));
}

// ---------- 起動 ----------
(async () => {
  try {
    db = await createBackend();
  } catch (e) {
    console.error(e);
    app.replaceChildren(h('div', { class: 'screen center' }, h('p', null, '通信の準備に失敗しました。config.js を確認してください。')));
    return;
  }
  const params = new URLSearchParams(location.search);
  if (params.get('room')) drafts.code = params.get('room').replace(/\D/g, '').slice(0, 3);
  drafts.name = localStorage.getItem('pr-name') || '';

  // 同じタブで再読み込みしたときは自動で部屋に戻る
  const current = sessionStorage.getItem('pr-room');
  if (current) {
    try {
      await Room.join(db, current, me, drafts.name);
      enter(current);
      return;
    } catch {
      sessionStorage.removeItem('pr-room');
    }
  }
  render();
})();
})();
