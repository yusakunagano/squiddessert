// ここを自分の Firebase プロジェクトの値に書き換えてください。
// Firebase コンソール > プロジェクトの設定 > 全般 > マイアプリ (ウェブアプリ) の firebaseConfig をそのまま貼り付けます。
// (これらの値は公開されても問題ありません。データはセキュリティルールで守られています)
export const firebaseConfig = {
  apiKey: 'AIzaSyDr3rNdEtf9S8BhM2RhNeoBBSQPzJP1GjU',
  authDomain: 'map-comments-30fab.firebaseapp.com',
  projectId: 'map-comments-30fab',
  storageBucket: 'map-comments-30fab.firebasestorage.app',
  messagingSenderId: '322501203835',
  appId: '1:322501203835:web:2a594ee7b943ae7d4a4fde',
};

// Google Maps の API キー (Maps JavaScript API)。
// Google Cloud Console で「HTTP リファラー」を公開先のドメインに制限しておくこと。
export const googleMapsApiKey = 'AIzaSyDDwhre_rUs84ay9pgIv8bcbTAl9jAU8Ac';

// マップ ID。吹き出しマーカーに必要。本番では Google Cloud Console で作ったものを推奨。
export const googleMapsMapId = 'DEMO_MAP_ID';
