// 画面の切り替え：トップ → ロビー → 各ゲーム
(() => {
const { createBackend, Room, GAMES } = window.Party;
const { MAX_CONNECTIONS } = window.PARTY_CONFIG;
const { h, inputBox, button, drafts, toast, patch } = window.Party.ui;


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
      button('部屋を作る', onCreate, 'primary'),
      h('div', { class: 'or' }, h('span', null, 'または')),
      h('label', { class: 'label', for: 'code' }, 'ルームコード'),
      inputBox('code', { placeholder: '123', maxlength: 3, digits: true, big: true, onEnter: onJoin }),
      button('参加する', onJoin)),
    last && last.room && h('button', { class: 'link', type: 'button', onclick: () => onRejoin(last) }, `前の部屋（${last.room}）に戻る`),
    db && db.kind === 'local' && h('p', { class: 'note' }, 'テストモード：Firebase が未設定のため、同じブラウザのタブ同士でだけ遊べます'));
}

function needName() {
  const name = (drafts.name || '').trim();
  if (!name) throw new Error('名前を入力してください');
  localStorage.setItem('pr-name', name);
  return name;
}

function onCreate() {
  guard(async () => {
    const name = needName();
    const code = await Room.create(db, me, name);
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

function lobbyScreen() {
  const ctx = room.ctx();
  const mod = room.game;
  const err = mod.validate(ctx);
  const inviteUrl = location.origin + location.pathname + '?room=' + room.code;

  const share = () => guard(async () => {
    if (navigator.share) {
      try { await navigator.share({ title: 'パーティールーム', text: `ルームコード ${room.code}`, url: inviteUrl }); } catch { /* キャンセル */ }
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      toast('招待リンクをコピーしました');
    }
  });

  return h('div', { class: 'screen' },
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
        p.id === ctx.hostId && h('span', { class: 'tag host' }, 'ホスト'),
        p.id === me && h('span', { class: 'tag' }, 'あなた'),
        !p.online && h('span', { class: 'tag off' }, '切断中'),
        ctx.isHost && p.id !== me && h('button', {
          class: 'kick', type: 'button', 'aria-label': p.name + 'を退出させる',
          onclick: () => confirm(`${p.name} を部屋から外しますか？`) && guard(() => room.kick(p.id)),
        }, '×'))))),

    h('section', { class: 'card' },
      h('h2', null, 'ゲーム'),
      h('div', { class: 'games' }, GAMES.map((g) => h('button', {
        type: 'button',
        class: 'game-card' + (g.id === mod.id ? ' on' : ''),
        disabled: !ctx.isHost,
        onclick: () => g.id !== mod.id && guard(() => room.selectGame(g.id)),
      },
        h('span', { class: 'game-icon' }, g.icon),
        h('span', null, h('strong', null, g.name), h('small', null, g.description)))))),

    h('section', { class: 'card' },
      h('h2', null, '設定'),
      mod.renderSettings(ctx, { editable: ctx.isHost, set: (patch) => guard(() => room.updateSettings(patch)) })),

    ctx.isHost
      ? h('div', { class: 'actions' },
        err && h('p', { class: 'warn' }, err),
        button('ゲーム開始', () => guard(() => room.start()), 'primary', { disabled: !!err }))
      : h('p', { class: 'center muted' }, 'ホストがゲームを始めるのを待っています'),

    button('部屋を出る', () => confirm('部屋を出ますか？') && leave(), 'ghost'));
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
      h('span', { class: 'game-title' }, mod.icon + ' ' + mod.name),
      h('span', { class: 'muted small' }, room.code),
      ctx.isHost && h('button', {
        class: 'link small', type: 'button',
        onclick: () => confirm('ゲームを終了してロビーに戻りますか？') && guard(() => room.toLobby()),
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
