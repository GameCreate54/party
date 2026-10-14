// ルーム：参加者・設定・ゲーム状態の同期と、ホストによるゲーム進行
//
// しくみ：プレイヤーの操作はすべて actions に積まれ、ホストの端末だけがそれを
// ゲームモジュールの handle() に渡して結果を書き込む（ホストが審判役）。
(() => {
const { ROOT, MAX_CONNECTIONS } = window.PARTY_CONFIG;
const { GAMES, getGame } = window.Party;

// ルームコードは3桁の数字（100〜999）
const genCode = () => String(100 + Math.floor(Math.random() * 900));
// 作ってから時間がたった部屋は放置とみなし、同じコードを使い回してよい
const STALE_MS = 6 * 60 * 60 * 1000;
const roomPath = (code) => `${ROOT}/rooms/${code}`;
const validPlayers = (obj) => Object.entries(obj || {}).filter(([, p]) => p && p.name);

class Room {
  static async create(db, me, name) {
    let code = null;
    for (let i = 0; i < 60 && !code; i++) {
      const c = genCode();
      const meta = await db.get(roomPath(c) + '/meta');
      if (!meta || Date.now() - (meta.createdAt || 0) > STALE_MS) code = c;
    }
    if (!code) throw new Error('部屋がいっぱいです。少し待ってからもう一度お試しください');
    const game = GAMES[0];
    const now = Date.now();
    await db.set(roomPath(code), {
      meta: { hostId: me, gameId: game.id, status: 'lobby', createdAt: now },
      players: { [me]: { name, joinedAt: now, online: true } },
      settings: game.defaultSettings(),
    });
    return code;
  }

  static async join(db, code, me, name) {
    const base = roomPath(code);
    const meta = await db.get(base + '/meta');
    if (!meta) throw new Error('部屋が見つかりません');
    const players = await db.get(base + '/players');
    const mine = players && players[me];
    if (mine && mine.name) {
      await db.update(base + '/players/' + me, { name: name || mine.name, online: true });
      return;
    }
    if (meta.status === 'playing') throw new Error('ゲーム中のため参加できません。ロビーに戻るまで待ってください');
    if (validPlayers(players).length >= MAX_CONNECTIONS) throw new Error(`満員です（最大${MAX_CONNECTIONS}人）`);
    await db.set(base + '/players/' + me, { name, joinedAt: Date.now(), online: true });
  }

  constructor(db, code, me) {
    this.db = db;
    this.code = code;
    this.me = me;
    this.base = roomPath(code);
    this.state = {};
    this.subs = [];
    this.hostSubs = null;
    this.done = new Set();
    this.busy = false;
    this.pending = null;
    this.scheduled = false;
  }

  watch(onChange) {
    this.onChange = onChange;
    const w = (key, path) => this.subs.push(this.db.subscribe(this.base + path, (v) => {
      this.state[key] = v;
      this.changed();
    }));
    w('meta', '/meta');
    w('players', '/players');
    w('settings', '/settings');
    w('game', '/game');
    w('memory', '/memory');
    w('live', '/live');
    w('secret', '/secret/' + this.me);
  }

  unwatch() {
    this.subs.forEach((off) => off());
    this.subs = [];
    this.setHostSubs(false);
  }

  // 複数の購読が同時に届いても描画は1回にまとめる
  changed() {
    this.setHostSubs(this.isHost());
    if (this.scheduled) return;
    this.scheduled = true;
    Promise.resolve().then(() => { this.scheduled = false; this.onChange && this.onChange(); });
  }

  isHost() { return !!this.state.meta && this.state.meta.hostId === this.me; }
  get game() { return getGame(this.state.meta && this.state.meta.gameId); }

  // ホストになったら、ホストだけが読む情報と操作キューを購読する
  setHostSubs(on) {
    if (on && !this.hostSubs) {
      this.done.clear();
      this.hostSubs = [
        this.db.subscribe(this.base + '/private', (v) => { this.state.private = v; this.changed(); }),
        this.db.subscribe(this.base + '/actions', (v) => this.onActions(v)),
      ];
      // 時間切れの判定などのため、ホストの端末だけでゲームの tick() を定期的に呼ぶ
      this.tickTimer = setInterval(() => this.tick(), 250);
    } else if (!on && this.hostSubs) {
      this.hostSubs.forEach((off) => off());
      this.hostSubs = null;
      clearInterval(this.tickTimer);
      this.state.private = null;
    }
  }

  players() {
    return validPlayers(this.state.players)
      .map(([id, p]) => ({ id, name: p.name, online: p.online !== false, joinedAt: p.joinedAt || 0 }))
      .sort((a, b) => a.joinedAt - b.joinedAt);
  }

  // ゲームモジュールに渡す情報のまとめ
  ctx() {
    const meta = this.state.meta || {};
    const mod = this.game;
    return {
      code: this.code,
      me: this.me,
      hostId: meta.hostId,
      isHost: meta.hostId === this.me,
      players: this.players(),
      settings: this.state.settings || mod.defaultSettings(),
      game: this.state.game || null,
      secret: this.state.secret || null,
      private: this.isHost() ? this.state.private || null : null,
      memory: (this.state.memory || {})[mod.id] || null,
      send: (type, data = {}) => this.send(type, data),
      // 全員共通の時計（サーバー時刻）。操作に付く ts と同じ基準
      now: () => this.db.now(),
      // ホストを通さず、自分の欄に直接書く情報（入力中の文字など、頻繁に変わるもの）
      live: this.state.live || {},
      setLive: (v) => this.db.set(this.base + '/live/' + this.me, v ?? null),
      rerender: () => this.onChange && this.onChange(),
    };
  }

  send(type, data = {}) {
    // ts はサーバー時刻（早押しの順番の判定に使える）
    return this.db.push(this.base + '/actions', { ...data, type, from: this.me, t: Date.now(), ts: window.Party.SERVER_TIME });
  }

  // ---------- ホストの処理 ----------
  onActions(val) {
    this.pending = val;
    if (!this.busy) this.drain();
  }

  async drain() {
    this.busy = true;
    try {
      while (this.pending) {
        const all = this.pending;
        this.pending = null;
        for (const key of Object.keys(all).sort()) {
          if (this.done.has(key)) continue;
          this.done.add(key);
          try { await this.applyAction(all[key]); } catch (e) { console.error('action failed', e); }
          await this.db.remove(this.base + '/actions/' + key);
        }
      }
    } finally {
      this.busy = false;
    }
  }

  async applyAction(action) {
    while (this.ticking) await new Promise((r) => setTimeout(r, 10));
    if (!this.isHost() || !this.state.game) return;
    const mod = this.game;
    const res = mod.handle(this.ctx(), action);
    if (res) await this.write(res, mod);
  }

  async tick() {
    const mod = this.game;
    if (this.busy || this.ticking || !mod.tick || !this.state.game || !this.isHost()) return;
    if (!this.state.meta || this.state.meta.status !== 'playing') return;
    this.ticking = true;
    try {
      const res = mod.tick(this.ctx());
      if (res) await this.write(res, mod);
    } catch (e) {
      console.error('tick failed', e);
    } finally {
      this.ticking = false;
    }
  }

  // モジュールが返した { game, private, secrets, memory } を書き込む
  async write(res, mod, extra = {}) {
    const u = { ...extra };
    if ('game' in res) { u.game = res.game ?? null; this.state.game = res.game ?? null; }
    if ('private' in res) { u.private = res.private ?? null; this.state.private = res.private ?? null; }
    if ('secrets' in res) {
      u.secret = res.secrets ?? null;
      this.state.secret = (res.secrets || {})[this.me] || null;
    }
    if ('memory' in res) u['memory/' + mod.id] = res.memory ?? null;
    await this.db.update(this.base, u);
  }

  // ---------- ロビーでの操作（ホスト） ----------
  async start() {
    const mod = this.game;
    const ctx = this.ctx();
    const err = mod.validate(ctx);
    if (err) throw new Error(err);
    await this.write(mod.start(ctx), mod, { actions: null, live: null, 'meta/status': 'playing' });
  }

  toLobby() {
    return this.db.update(this.base, { game: null, private: null, secret: null, actions: null, live: null, 'meta/status': 'lobby' });
  }

  selectGame(id) {
    return this.db.update(this.base, { 'meta/gameId': id, settings: getGame(id).defaultSettings() });
  }

  updateSettings(patch) { return this.db.update(this.base + '/settings', patch); }
  kick(id) { return this.db.remove(this.base + '/players/' + id); }
  claimHost() { return this.db.update(this.base + '/meta', { hostId: this.me }); }

  async leave() {
    const others = this.players().filter((p) => p.id !== this.me);
    if (!others.length) {
      await this.db.remove(this.base);
      return;
    }
    if (this.isHost()) {
      const next = others.find((p) => p.online) || others[0];
      await this.db.update(this.base + '/meta', { hostId: next.id });
    }
    await this.db.remove(this.base + '/players/' + this.me);
  }
}

window.Party.Room = Room;
})();
