// ===== 設定ファイル =====
// USE_FIREBASE を true にすると、下の Firebase につながって、スマホ同士で遊べます。
// false のままだと「テストモード」になり、同じブラウザのタブ同士でだけ遊べます。
const USE_FIREBASE = true;

// Firebase の設定（Firebase コンソール → プロジェクトの設定 → マイアプリ でコピーできるもの）
const FIREBASE_SETTINGS = {
  apiKey: "AIzaSyBep2KE-6NsQFbRDXfum5Pb8s3eyJoyHT0",
  authDomain: "tetris-god.firebaseapp.com",
  databaseURL: "https://tetris-god-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tetris-god",
  storageBucket: "tetris-god.firebasestorage.app",
  messagingSenderId: "112375802420",
  appId: "1:112375802420:web:8e607bae36a463dd973861",
};

// データベース内の保存場所。テトリス神。など他のゲームと混ざらないよう分けています。
const ROOT = 'party';

// 1部屋に入れる最大人数（「プレイヤー8人＋ホスト1人」に合わせて9）
const MAX_CONNECTIONS = 9;

window.PARTY_CONFIG = { firebaseConfig: USE_FIREBASE ? FIREBASE_SETTINGS : null, ROOT, MAX_CONNECTIONS };
