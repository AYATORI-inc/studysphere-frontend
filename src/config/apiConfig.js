// StudySphere API設定
// 本番環境と開発環境を自動判定してAPI URLを設定

const DEFAULT_DEV_API_URL = 'http://localhost:5050';
const DEFAULT_PROD_API_URL = 'https://backend.studysphere.ayatori-inc.co.jp';

const getHostname = () => {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.location.hostname || '';
};

const hostname = getHostname();

const isLocalhost = [
  'localhost',
  '127.0.0.1',
  '0.0.0.0'
].includes(hostname) || hostname.endsWith('.local');

const isProductionHost = hostname.includes('conoha') ||
  hostname.includes('studysphere') ||
  hostname.includes('ayatori-inc.co.jp');

// 本番環境判定
const isProduction = process.env.NODE_ENV === 'production' || isProductionHost;

const resolveApiBaseUrl = () => {
  const envUrl = (process.env.REACT_APP_API_URL || '').trim();

  if (envUrl) {
    // .env で指定されたURLを最優先（環境判定で上書きしない）
    return envUrl;
  }

  if (isLocalhost) {
    return DEFAULT_DEV_API_URL;
  }

  return isProduction ? DEFAULT_PROD_API_URL : DEFAULT_DEV_API_URL;
};

// API URL設定
const API_BASE_URL = resolveApiBaseUrl();

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
