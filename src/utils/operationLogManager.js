// 操作ログ管理ユーティリティ
import { getCachedIPAddress } from './ipAddress';
import { getCurrentUserName, getCurrentUserId } from './userContext';
import { apiGet, apiPost, apiDelete } from './api';

const LOG_STORAGE_KEY = 'adminOperationLogs';
const MAX_LOGS = 100; // 最大100件
const MAX_AGE_DAYS = 30; // 最大30日間

// 重複チェック用のキャッシュ（メモリ内）
const recentOperations = new Map();
const DUPLICATE_CHECK_WINDOW = 3000; // 3秒以内の同じ操作は重複とみなす

/**
 * バックエンドからIPアドレスを取得する
 * @returns {Promise<string>} IPアドレス
 */
const getIPFromBackend = async () => {
  try {
    const response = await apiGet('/api/operation-logs/client-ip');
    if (response.success && response.data && response.data.ip) {
      return response.data.ip;
    }
  } catch (error) {
    console.warn('バックエンドからのIP取得に失敗:', error);
  }
  return null;
};

/**
 * 重複操作をチェックする
 * @param {string} action - 操作名
 * @param {string} details - 詳細情報
 * @returns {boolean} 重複している場合はtrue
 */
const isDuplicateOperation = (action, details) => {
  const key = `${action}:${details}`;
  const now = Date.now();
  const lastTime = recentOperations.get(key);
  
  if (lastTime && (now - lastTime) < DUPLICATE_CHECK_WINDOW) {
    console.log('重複操作を検出しました:', { action, details, timeDiff: now - lastTime });
    return true;
  }
  
  // 新しい操作を記録
  recentOperations.set(key, now);
  
  // 古いエントリをクリーンアップ（5分以上古いもの）
  const cleanupTime = now - 300000; // 5分
  for (const [k, v] of recentOperations.entries()) {
    if (v < cleanupTime) {
      recentOperations.delete(k);
    }
  }
  
  return false;
};

/**
 * 操作ログを記録する
 * 使用例:
 *  - addOperationLog({ action: 'xxx', details: 'yyy' })
 *  - addOperationLog('xxx', 'yyy') // 旧形式の互換
 * @param {Object|string} logDataOrAction - ログデータ or 操作名
 * @param {string} [detailsText] - 旧形式の詳細テキスト
 */
export const addOperationLog = async (logDataOrAction, detailsText) => {
  // 互換性対応: 旧シグネチャ (action, details)
  const logData = typeof logDataOrAction === 'string'
    ? { action: logDataOrAction, details: detailsText }
    : (logDataOrAction || {});

  // details はサーバ側で文字列化されるが、念のためここでも整形
  const normalizedDetails =
    typeof logData.details === 'object' && logData.details !== null
      ? JSON.stringify(logData.details)
      : (logData.details ?? null);

  // 重複チェック
  if (isDuplicateOperation(logData.action, normalizedDetails)) {
    console.log('重複操作のため、ログ記録をスキップします:', { action: logData.action, details: normalizedDetails });
    return null;
  }

  // IP は外で宣言して catch でも参照できるようにする
  let ipAddress = logData.ipAddress;

  try {
    // IPアドレスを取得（優先順位: 指定値 > バックエンド取得 > キャッシュ > 外部API）
    if (!ipAddress || ipAddress === 'N/A') {
      // まずバックエンドから取得を試行
      const backendIP = await getIPFromBackend();
      if (backendIP && backendIP !== 'N/A') {
        ipAddress = backendIP;
      } else {
        // バックエンド取得に失敗した場合はキャッシュを使用
        ipAddress = await getCachedIPAddress();
      }
    }
    
    const logPayload = {
      adminId: logData.adminId || getCurrentUserId(),
      adminName: logData.adminName || getCurrentUserName(),
      action: logData.action,
      details: normalizedDetails,
      ipAddress: ipAddress
    };
    
    console.log('操作ログを送信:', logPayload);
    
    // バックエンドAPIにログを送信
    const response = await apiPost('/api/operation-logs', logPayload);
    
    console.log('操作ログ送信レスポンス:', response);
    
    if (response.success) {
      // ローカルストレージにも保存（フォールバック用）
      const logs = await getOperationLogs();
      const logsArray = Array.isArray(logs) ? logs : [];
      const newLog = {
        id: response.data.id,
        adminId: logData.adminId || getCurrentUserId(),
        adminName: logData.adminName || getCurrentUserName(),
        action: logData.action,
        details: normalizedDetails,
        timestamp: new Date().toISOString(),
        ipAddress: ipAddress
      };
      
      logsArray.unshift(newLog);
      const cleanedLogs = cleanOldLogs(logsArray);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(cleanedLogs));
      
      return newLog;
    } else {
      throw new Error(response.message || 'ログの記録に失敗しました');
    }
  } catch (error) {
    console.error('操作ログの記録に失敗しました:', error);
    
    // バックエンドが利用できない場合はローカルストレージのみに保存
    try {
      const logs = await getOperationLogs();
      const logsArray = Array.isArray(logs) ? logs : [];
      const fallbackIp = ipAddress || await getCachedIPAddress();
      const newLog = {
        id: Date.now() + Math.random(),
        adminId: (logData && logData.adminId) || getCurrentUserId(),
        adminName: (logData && logData.adminName) || getCurrentUserName(),
        action: (logData && logData.action) || 'unknown_action',
        details: normalizedDetails,
        timestamp: new Date().toISOString(),
        ipAddress: fallbackIp
      };
      
      logsArray.unshift(newLog);
      const cleanedLogs = cleanOldLogs(logsArray);
      localStorage.setItem(LOG_STORAGE_KEY, JSON.stringify(cleanedLogs));
      
      return newLog;
    } catch (localError) {
      console.error('ローカルログ保存にも失敗しました:', localError);
      return null;
    }
  }
};

/**
 * 操作ログを取得する
 * @param {Object} options - 取得オプション
 * @param {number} options.page - ページ番号（デフォルト: 1）
 * @param {number} options.limit - 1ページあたりの件数（デフォルト: 50）
 * @param {string} options.adminName - 管理者名フィルター
 * @param {string} options.action - 操作内容フィルター
 * @param {string} options.startDate - 開始日フィルター
 * @param {string} options.endDate - 終了日フィルター
 * @returns {Object} { logs: Array, pagination: Object } ログ配列とページネーション情報
 */
export const getOperationLogs = async (options = {}) => {
  try {
    const { page = 1, limit = 50, adminName, action, startDate, endDate } = options;
    
    // クエリパラメータを構築
    const params = new URLSearchParams();
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    if (adminName) params.append('adminName', adminName);
    if (action) params.append('action', action);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    
    // バックエンドAPIからログを取得
    const response = await apiGet(`/api/operation-logs?${params.toString()}`);
    console.log('バックエンドからの操作ログレスポンス:', response);
    
    if (response.success && response.data && response.data.logs) {
      // バックエンドから取得したログを変換
      const logs = response.data.logs.map(log => ({
        id: log.id,
        adminId: log.admin_id,
        adminName: log.admin_name,
        action: log.action,
        details: log.details,
        timestamp: log.created_at,
        ipAddress: log.ip_address
      }));
      
      console.log('変換後のログデータ:', logs);
      
      // ページネーション情報を返す
      return {
        logs,
        pagination: response.data.pagination || {
          total: logs.length,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: 1
        }
      };
    } else {
      console.log('バックエンドからのレスポンスが期待形式と異なります:', response);
      // バックエンドが利用できない場合はローカルストレージから取得
      const savedLogs = localStorage.getItem(LOG_STORAGE_KEY);
      if (savedLogs) {
        try {
          const parsedLogs = JSON.parse(savedLogs);
          const logsArray = Array.isArray(parsedLogs) ? parsedLogs : [];
          
          // ローカルストレージの場合はページネーションをクライアント側で実装
          const startIndex = (page - 1) * limit;
          const endIndex = startIndex + limit;
          const paginatedLogs = logsArray.slice(startIndex, endIndex);
          
          return {
            logs: paginatedLogs,
            pagination: {
              total: logsArray.length,
              page: parseInt(page),
              limit: parseInt(limit),
              totalPages: Math.ceil(logsArray.length / limit)
            }
          };
        } catch (parseError) {
          console.error('ローカルストレージのログデータの解析に失敗:', parseError);
          return { logs: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } };
        }
      }
      return { logs: [], pagination: { total: 0, page: 1, limit: parseInt(limit), totalPages: 0 } };
    }
  } catch (error) {
    console.error('操作ログの取得に失敗しました:', error);
    
    // エラー時はローカルストレージから取得
    try {
      const savedLogs = localStorage.getItem(LOG_STORAGE_KEY);
      if (savedLogs) {
        const parsedLogs = JSON.parse(savedLogs);
        const logsArray = Array.isArray(parsedLogs) ? parsedLogs : [];
        const { page = 1, limit = 50 } = options;
        
        // ローカルストレージの場合はページネーションをクライアント側で実装
        const startIndex = (page - 1) * limit;
        const endIndex = startIndex + limit;
        const paginatedLogs = logsArray.slice(startIndex, endIndex);
        
        return {
          logs: paginatedLogs,
          pagination: {
            total: logsArray.length,
            page: parseInt(page),
            limit: parseInt(limit),
            totalPages: Math.ceil(logsArray.length / limit)
          }
        };
      }
    } catch (localError) {
      console.error('ローカルログ取得にも失敗しました:', localError);
    }
    return { logs: [], pagination: { total: 0, page: 1, limit: parseInt(options.limit || 50), totalPages: 0 } };
  }
};

/**
 * 古いログを削除する（最大100件、最大30日間）
 * @param {Array} logs - ログ配列
 * @returns {Array} クリーンアップされたログ配列
 */
const cleanOldLogs = (logs) => {
  if (!Array.isArray(logs)) {
    return [];
  }
  
  const now = new Date();
  const maxAgeMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000; // 30日をミリ秒に変換
  
  // 30日以上古いログを削除
  const filteredLogs = logs.filter(log => {
    const logDate = new Date(log.timestamp);
    return (now - logDate) < maxAgeMs;
  });
  
  // 最大100件に制限
  return filteredLogs.slice(0, MAX_LOGS);
};

/**
 * ログをクリアする
 */
export const clearOperationLogs = async () => {
  try {
    // バックエンドAPIでログをクリア（すべてのログを削除）
    const response = await apiDelete('/api/operation-logs?clearAll=true');
    
    if (response.success) {
      // ローカルストレージもクリア
      localStorage.removeItem(LOG_STORAGE_KEY);
      console.log('ログクリア成功:', response.message);
      return true;
    } else {
      console.error('バックエンドログクリアに失敗:', response.message);
      return false;
    }
  } catch (error) {
    console.error('操作ログのクリアに失敗しました:', error);
    
    // バックエンドが利用できない場合はローカルストレージのみクリア
    try {
      localStorage.removeItem(LOG_STORAGE_KEY);
      console.log('ローカルストレージのログをクリアしました');
      return true;
    } catch (localError) {
      console.error('ローカルログクリアにも失敗しました:', localError);
      return false;
    }
  }
};

/**
 * モックデータを完全に削除する
 */
export const clearAllMockData = () => {
  try {
    // 操作ログをクリア
    localStorage.removeItem(LOG_STORAGE_KEY);
    
    // その他のモックデータ関連のキーも削除
    const keysToRemove = [
      'adminOperationLogs',
      'mockAdminLogs',
      'adminLogs',
      'operationLogs'
    ];
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });
    
    console.log('すべてのモックデータを削除しました');
    return true;
  } catch (error) {
    console.error('モックデータの削除に失敗しました:', error);
    return false;
  }
};

/**
 * ログの統計情報を取得する
 * @returns {Object} 統計情報
 */
export const getLogStats = async () => {
  try {
    // バックエンドAPIから統計情報を取得
    const response = await apiGet('/api/operation-logs/stats');
    
    if (response.success && response.data) {
      return {
        totalLogs: response.data.totalLogs || 0,
        todayLogs: response.data.todayLogs || 0,
        thisWeekLogs: response.data.thisWeekLogs || 0,
        thisMonthLogs: response.data.thisMonthLogs || 0,
        actionCounts: response.data.actionStats ? response.data.actionStats.reduce((acc, stat) => {
          acc[stat.action] = stat.count;
          return acc;
        }, {}) : {}
      };
    } else {
      // バックエンドが利用できない場合はローカル計算
      const result = await getOperationLogs({ page: 1, limit: 1000 }); // 統計用に全件取得
      const logsArray = Array.isArray(result.logs) ? result.logs : [];
      const now = new Date();
      
      const stats = {
        totalLogs: logsArray.length,
        todayLogs: 0,
        thisWeekLogs: 0,
        thisMonthLogs: 0,
        actionCounts: {}
      };
      
      logsArray.forEach(log => {
        const logDate = new Date(log.timestamp);
        const daysDiff = (now - logDate) / (1000 * 60 * 60 * 24);
        
        // 今日のログ
        if (daysDiff < 1) {
          stats.todayLogs++;
        }
        
        // 今週のログ
        if (daysDiff < 7) {
          stats.thisWeekLogs++;
        }
        
        // 今月のログ
        if (daysDiff < 30) {
          stats.thisMonthLogs++;
        }
        
        // 操作別カウント
        if (stats.actionCounts[log.action]) {
          stats.actionCounts[log.action]++;
        } else {
          stats.actionCounts[log.action] = 1;
        }
      });
      
      return stats;
    }
  } catch (error) {
    console.error('ログ統計の取得に失敗しました:', error);
    
    // エラー時はローカル計算
    const result = await getOperationLogs({ page: 1, limit: 1000 }); // 統計用に全件取得
    const logsArray = Array.isArray(result.logs) ? result.logs : [];
    const now = new Date();
    
    const stats = {
      totalLogs: logsArray.length,
      todayLogs: 0,
      thisWeekLogs: 0,
      thisMonthLogs: 0,
      actionCounts: {}
    };
    
    logsArray.forEach(log => {
      const logDate = new Date(log.timestamp);
      const daysDiff = (now - logDate) / (1000 * 60 * 60 * 24);
      
      if (daysDiff < 1) stats.todayLogs++;
      if (daysDiff < 7) stats.thisWeekLogs++;
      if (daysDiff < 30) stats.thisMonthLogs++;
      
      if (stats.actionCounts[log.action]) {
        stats.actionCounts[log.action]++;
      } else {
        stats.actionCounts[log.action] = 1;
      }
    });
    
    return stats;
  }
};

/**
 * 特定の条件でログを検索する
 * @param {Object} filters - 検索条件
 * @param {string} filters.adminName - 管理者名
 * @param {string} filters.action - 操作内容
 * @param {string} filters.startDate - 開始日
 * @param {string} filters.endDate - 終了日
 * @param {number} filters.page - ページ番号（デフォルト: 1）
 * @param {number} filters.limit - 1ページあたりの件数（デフォルト: 50）
 * @returns {Object} { logs: Array, pagination: Object } フィルタリングされたログ配列とページネーション情報
 */
export const searchOperationLogs = async (filters = {}) => {
  try {
    const { page = 1, limit = 50 } = filters;
    // バックエンドAPIを使用して検索（ページネーション対応）
    return await getOperationLogs({
      page,
      limit,
      adminName: filters.adminName,
      action: filters.action,
      startDate: filters.startDate,
      endDate: filters.endDate
    });
  } catch (error) {
    console.error('ログ検索エラー:', error);
    return { logs: [], pagination: { total: 0, page: 1, limit: parseInt(filters.limit || 50), totalPages: 0 } };
  }
};

/**
 * ログをエクスポートする（CSV形式）
 * @returns {string} CSVデータ
 */
export const exportLogsToCSV = async () => {
  const result = await getOperationLogs({ page: 1, limit: 10000 }); // エクスポート用に全件取得
  const logsArray = Array.isArray(result.logs) ? result.logs : [];
  
  const headers = ['日時', '管理者名', '操作', '詳細', 'IPアドレス'];
  const csvRows = [headers.join(',')];
  
  logsArray.forEach(log => {
    // CSVの特殊文字（カンマ、改行、ダブルクォート）を適切にエスケープ
    const escapeCSV = (str) => {
      if (!str) return '';
      const escaped = str.toString().replace(/"/g, '""');
      return `"${escaped}"`;
    };
    
    const row = [
      new Date(log.timestamp).toLocaleString('ja-JP'),
      escapeCSV(log.adminName),
      escapeCSV(log.action),
      escapeCSV(log.details),
      escapeCSV(log.ipAddress)
    ];
    csvRows.push(row.join(','));
  });
  
  return csvRows.join('\n');
}; 