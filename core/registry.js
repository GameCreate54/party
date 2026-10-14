// ===== ゲーム一覧 =====
// 各ゲームのファイルが Party.register(ゲーム) で自分を登録する。
// 新しいゲームを追加するときは、games/<名前>/game.js を作って index.html に1行足すだけ。
(() => {
  const GAMES = [];
  window.Party.GAMES = GAMES;
  window.Party.register = (game) => { GAMES.push(game); };
  window.Party.getGame = (id) => GAMES.find((g) => g.id === id) || GAMES[0];
})();
