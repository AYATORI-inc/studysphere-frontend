/**
 * デバッグ用ユーティリティ
 */

// セッションストレージの内容を確認
export const debugSessionStorage = () => {
  console.log('=== セッションストレージ デバッグ ===');
  
  const selectedSatellite = sessionStorage.getItem('selectedSatellite');
  console.log('selectedSatellite:', selectedSatellite);
  
  if (selectedSatellite) {
    try {
      const parsed = JSON.parse(selectedSatellite);
      console.log('パースされた拠点情報:', parsed);
    } catch (error) {
      console.error('拠点情報のパースエラー:', error);
    }
  }
  
  // その他のセッションストレージ項目も確認
  const allKeys = Object.keys(sessionStorage);
  console.log('セッションストレージの全キー:', allKeys);
  
  allKeys.forEach(key => {
    if (key !== 'selectedSatellite') {
      console.log(`${key}:`, sessionStorage.getItem(key));
    }
  });
};

// ローカルストレージの内容を確認
export const debugLocalStorage = () => {
  console.log('=== ローカルストレージ デバッグ ===');
  
  const currentUser = localStorage.getItem('currentUser');
  console.log('currentUser:', currentUser);
  
  if (currentUser) {
    try {
      const parsed = JSON.parse(currentUser);
      console.log('パースされたユーザー情報:', parsed);
    } catch (error) {
      console.error('ユーザー情報のパースエラー:', error);
    }
  }
  
  // その他のローカルストレージ項目も確認
  const allKeys = Object.keys(localStorage);
  console.log('ローカルストレージの全キー:', allKeys);
  
  allKeys.forEach(key => {
    if (key !== 'currentUser') {
      //console.log(`${key}:`, localStorage.getItem(key));
    }
  });
};

// 全ストレージの内容を確認
export const debugAllStorage = () => {
  debugSessionStorage();
  debugLocalStorage();
};
