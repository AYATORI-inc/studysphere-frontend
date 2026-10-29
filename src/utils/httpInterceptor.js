// HTTPリクエストインターセプター
import { getStoredTokens, isRefreshTokenExpired, handleTokenInvalid } from './authUtils';

let globalNavigate = null;
let isAuthErrorHandling = false;

// グローバルナビゲーション関数を設定
export const setGlobalNavigate = (navigate) => {
  globalNavigate = navigate;
};

// 認証が必要なエンドポイントかどうかを判定
const isAuthRequiredEndpoint = (url) => {
  // 認証が不要なエンドポイントのリスト
  const authExcludedEndpoints = [
    '/login',
    '/instructor-login',
    '/refresh',
    '/register',
    '/forgot-password',
    '/api/messages/unread-count',
    '/verify-temp-password',
    '/api/users/verify-temp-password',
    '/api/users/login',
    '/api/users/instructor-login',
    '/api/users/refresh',
    '/api/users/register',
    '/api/users/forgot-password',
    '/api/remote-support/login',
    '/api/remote-support/check-temp-password',
    '/api/remote-support/auto-login'
  ];
  
  // 静的リソースやHMRファイルを除外
  const staticResourcePatterns = [
    /\.hot-update\.json$/,
    /\.hot-update\.js$/,
    /\.hot-update\.css$/,
    /\.js$/,
    /\.css$/,
    /\.png$/,
    /\.jpg$/,
    /\.jpeg$/,
    /\.gif$/,
    /\.svg$/,
    /\.ico$/,
    /\.woff$/,
    /\.woff2$/,
    /\.ttf$/,
    /\.eot$/,
    /\.map$/
  ];
  
  // 静的リソースの場合は認証不要
  if (staticResourcePatterns.some(pattern => pattern.test(url))) {
    return false;
  }
  
  // URLに認証不要エンドポイントが含まれているかチェック
  return !authExcludedEndpoints.some(endpoint => url.includes(endpoint));
};

// ログインエンドポイントかどうかを判定
const isLoginEndpoint = (url) => {
  return url.includes('/login') || url.endsWith('/login') || url.includes('/instructor-login');
};

// 既存のfetchを拡張するためのプロキシ
export const setupFetchInterceptor = () => {
  const originalFetch = window.fetch;
  
  window.fetch = async (url, options = {}) => {
    // 静的リソースの場合はログを出力しない
    const isStaticResource = !isAuthRequiredEndpoint(url);
    if (!isStaticResource) {
      console.log('Fetchインターセプター: リクエスト開始', { url, method: options.method });
    }
    
    // 完全なURLでもインターセプトを適用（認証ヘッダー追加のため）
    const isFullUrl = url.startsWith('http://') || url.startsWith('https://');
    if (isFullUrl && !isStaticResource) {
      console.log('Fetchインターセプター: 完全なURLを検出、認証ヘッダーを追加します');
    }
    
    // ログインエンドポイントの場合は、認証エラー処理を完全にスキップ
    if (isLoginEndpoint(url)) {
      console.log('Fetchインターセプター: ログインエンドポイントのため、認証処理をスキップ');
      return originalFetch(url, options);
    }
    
    // 認証エラー処理中は新しいリクエストをブロック（ただし、IP取得などの重要なリクエストは除外）
    if (isAuthErrorHandling && !url.includes('/client-ip') && !url.includes('/health')) {
      console.log('Fetchインターセプター: 認証エラー処理中のため、リクエストをスキップします');
      throw new Error('Authentication error handling in progress');
    }

    try {
      const { accessToken, refreshToken } = getStoredTokens();
      
      // 認証が必要なエンドポイントの場合のみAuthorizationヘッダーを追加
      if (isAuthRequiredEndpoint(url) && accessToken && !options.headers?.['Authorization']) {
        options.headers = {
          ...options.headers,
          'Authorization': `Bearer ${accessToken}`
        };
        if (!isStaticResource) {
          console.log('Fetchインターセプター: Authorizationヘッダーを追加', { 
            hasToken: !!accessToken, 
            tokenLength: accessToken ? accessToken.length : 0 
          });
        }
      } else if (isAuthRequiredEndpoint(url) && !accessToken && !isStaticResource) {
        console.warn('Fetchインターセプター: 認証が必要なエンドポイントですが、トークンがありません', { url });
      }

      const response = await originalFetch(url, options);
      
      // 401 Unauthorized または 403 Forbidden の場合
      if (response.status === 401 || response.status === 403) {
        console.warn('Fetchインターセプター: 認証エラーを検出', { 
          url, 
          status: response.status, 
          hasToken: !!accessToken,
          tokenLength: accessToken ? accessToken.length : 0
        });
        
        // ログインエンドポイントの場合は処理をスキップ
        if (isLoginEndpoint(url)) {
          console.log('Fetchインターセプター: ログインエンドポイントのため、認証エラー処理をスキップ');
          return response;
        }
        
        // 認証が不要なエンドポイントの場合は処理をスキップ
        if (!isAuthRequiredEndpoint(url)) {
          console.log('Fetchインターセプター: 認証不要エンドポイントのため、認証エラー処理をスキップ');
          return response;
        }
        
        // 認証エラー処理フラグを設定
        isAuthErrorHandling = true;
        
        console.log('Fetchインターセプター: 認証エラー処理を開始します');
        
        // リフレッシュトークンの有効期限をチェック
        if (refreshToken && isRefreshTokenExpired(refreshToken)) {
          console.error('Fetchインターセプター: リフレッシュトークンの有効期限が切れています');
          if (globalNavigate) {
            handleTokenInvalid(globalNavigate, 'セッションが期限切れです。再度ログインしてください。');
          }
          throw new Error('Refresh token expired');
        }
        
        // リフレッシュトークンを使用して自動再認証を試行
        if (refreshToken && !isRefreshTokenExpired(refreshToken)) {
          try {
            console.log('Fetchインターセプター: リフレッシュトークンを使用して自動再認証を試行');
            const { refreshTokenAPI, storeTokens } = await import('./authUtils');
            const refreshResult = await refreshTokenAPI(refreshToken);
            
            if (refreshResult.success && refreshResult.data) {
              storeTokens(refreshResult.data.access_token, refreshResult.data.refresh_token);
              console.log('Fetchインターセプター: トークン更新成功、リクエストを再実行');
              
              // 更新されたトークンでリクエストを再実行
              const newOptions = {
                ...options,
                headers: {
                  ...options.headers,
                  'Authorization': `Bearer ${refreshResult.data.access_token}`
                }
              };
              
              const retryResponse = await originalFetch(url, newOptions);
              return retryResponse;
            }
          } catch (refreshError) {
            console.error('Fetchインターセプター: トークン更新に失敗:', refreshError);
          }
        }
        
        // 認証エラーの場合はログインページにリダイレクト
        console.warn('Fetchインターセプター: Authentication failed, redirecting to login');
        if (globalNavigate) {
          handleTokenInvalid(globalNavigate, '認証に失敗しました。再度ログインしてください。');
        }
        throw new Error('Authentication failed');
      }
      
      return response;
    } catch (error) {
      // 認証エラーの場合はリダイレクト
      if (error.message === 'Authentication failed' || error.message === 'Refresh token expired') {
        throw error;
      }
      
      // その他のエラーはそのまま投げる
      throw error;
    } finally {
      // 認証エラー処理フラグをリセット
      setTimeout(() => {
        isAuthErrorHandling = false;
      }, 1000);
    }
  };
};

// 認証付きfetch関数（既存のコードとの互換性のため）
export const authenticatedFetch = async (url, options = {}) => {
  return window.fetch(url, options);
}; 