// StudySphere API設定
// 本番環境と開発環境を自動判定してAPI URLを設定

// デバッグ情報を出力
console.log('=== API Config Debug ===');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('REACT_APP_API_URL:', process.env.REACT_APP_API_URL);
console.log('window.location.hostname:', window.location.hostname);

// 本番環境判定
const isProduction = process.env.NODE_ENV === 'production' || 
  window.location.hostname.includes('conoha') || 
  window.location.hostname.includes('studysphere') ||
  window.location.hostname.includes('ayatori-inc.co.jp');

console.log('isProduction:', isProduction);

// API URL設定
// 環境変数 REACT_APP_API_URL が設定されていれば、それを最優先で使用する
// （.env.local / .env で指定。開発環境・本番環境の区別なし）
// 未設定の場合のみ、従来どおり本番判定・開発判定でデフォルトを決める
let API_BASE_URL;
if (process.env.REACT_APP_API_URL) {
  API_BASE_URL = process.env.REACT_APP_API_URL;
} else if (isProduction) {
  // 本番環境（デフォルト）
  API_BASE_URL = 'https://backend.studysphere.ayatori-inc.co.jp';
} else {
  // 開発環境（デフォルト: 開発バックエンド）
  API_BASE_URL = 'http://127.0.0.1:5050';
}

console.log('API_BASE_URL:', API_BASE_URL);
console.log('========================');

// 設定オブジェクト
const config = {
  API_BASE_URL,
  isProduction,
  
  // 本番環境特有の設定
  production: {
    // API呼び出し時のタイムアウト
    apiTimeout: 30000,
    
    // リトライ設定
    maxRetries: 3,
    retryDelay: 1000,
  }
};

export { API_BASE_URL, isProduction };
export default config;
