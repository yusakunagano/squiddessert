// ここを自分の Firebase プロジェクトの値に書き換えてください。
// Firebase コンソール > プロジェクトの設定 > 全般 > マイアプリ (ウェブアプリ) の firebaseConfig をそのまま貼り付けます。
// (これらの値は公開されても問題ありません。データはセキュリティルールで守られています)
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};

// Google Maps の API キー (Maps JavaScript API)。
// Google Cloud Console で「HTTP リファラー」を公開先のドメインに制限しておくこと。
export const googleMapsApiKey = '';

// マップ ID。吹き出しマーカーに必要。本番では Google Cloud Console で作ったものを推奨。
export const googleMapsMapId = 'DEMO_MAP_ID';
