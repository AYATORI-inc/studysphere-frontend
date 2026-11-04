import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';
import { useAuth } from './contexts/AuthContext';

const SSOAuditLogs = () => {
  const { currentUser } = useAuth();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({
    user_name: '',
    source_system: '',
    target_system: '',
    action: '',
    start_date: '',
    end_date: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    totalPages: 0
  });

  // 監査ログを取得
  const fetchLogs = async (page = 1, opts = {}) => {
    const { limit = pagination.limit, filterOverrides = null } = opts;
    const f = filterOverrides != null ? filterOverrides : filters;
    try {
      setLoading(true);
      setError('');
      
      const params = new URLSearchParams();
      params.append('page', String(page));
      params.append('limit', String(limit));
      
      if (f.user_name) params.append('user_name', f.user_name);
      if (f.source_system) params.append('source_system', f.source_system);
      if (f.target_system) params.append('target_system', f.target_system);
      if (f.action) params.append('action', f.action);
      if (f.start_date) params.append('start_date', f.start_date);
      if (f.end_date) params.append('end_date', f.end_date);

      const response = await apiGet(`/api/sso/audit-logs?${params.toString()}`);
      if (response.success && response.data) {
        setLogs(Array.isArray(response.data) ? response.data : []);
        const p = response.pagination || {};
        const total = Number(p.total) || 0;
        const limitNum = Number(p.limit) || limit || 50;
        const totalPages = Math.max(1, Math.ceil(total / limitNum));
        setPagination(prev => ({
          ...prev,
          page: Math.max(1, Number(p.page) || page),
          limit: limitNum,
          total,
          totalPages
        }));
      } else {
        setError('監査ログの取得に失敗しました');
      }
    } catch (err) {
      console.error('監査ログ取得エラー:', err);
      setError('監査ログの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs(pagination.page);
  }, [pagination.page]);

  // ページ切り替え（前へ・次へ）
  const handlePageChange = (nextPage) => {
    const p = Math.max(1, Number(nextPage));
    if (p === pagination.page) return;
    setPagination(prev => ({ ...prev, page: p }));
  };

  // フィルタ適用
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };

  const handleApplyFilters = () => {
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLogs(1, { filterOverrides: filters });
  };

  const handleResetFilters = () => {
    const cleared = {
      user_id: '',
      source_system: '',
      target_system: '',
      action: '',
      start_date: '',
      end_date: ''
    };
    setFilters(cleared);
    setPagination(prev => ({ ...prev, page: 1 }));
    fetchLogs(1, { filterOverrides: cleared });
  };

  // 日付フォーマット
  const formatDateTime = (dateString) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Tokyo'
    });
  };

  // アクション種別の表示名
  const getActionLabel = (action) => {
    const labels = {
      generate: 'チケット生成',
      verify: 'チケット検証',
      dispatch: 'リダイレクト',
      failed: '失敗'
    };
    return labels[action] || action;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">SSO監査ログ</h2>
        <div className="text-sm text-gray-600">
          表示期間: 過去1ヶ月
        </div>
      </div>

      {/* フィルタ */}
      <div className="bg-white p-4 rounded-lg shadow-md border border-gray-200">
        <h3 className="text-lg font-semibold mb-4">フィルタ</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ユーザー名
            </label>
            <input
              type="text"
              value={filters.user_name}
              onChange={(e) => handleFilterChange('user_name', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: 末吉 元気"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              遷移元システム
            </label>
            <input
              type="text"
              value={filters.source_system}
              onChange={(e) => handleFilterChange('source_system', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: studysphere"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              遷移先システム
            </label>
            <input
              type="text"
              value={filters.target_system}
              onChange={(e) => handleFilterChange('target_system', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="例: toybox_prod"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              アクション種別
            </label>
            <select
              value={filters.action}
              onChange={(e) => handleFilterChange('action', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">すべて</option>
              <option value="generate">チケット生成</option>
              <option value="verify">チケット検証</option>
              <option value="dispatch">リダイレクト</option>
              <option value="failed">失敗</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              開始日時
            </label>
            <input
              type="datetime-local"
              value={filters.start_date}
              onChange={(e) => handleFilterChange('start_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              終了日時
            </label>
            <input
              type="datetime-local"
              value={filters.end_date}
              onChange={(e) => handleFilterChange('end_date', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            onClick={handleApplyFilters}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            フィルタ適用
          </button>
          <button
            onClick={handleResetFilters}
            className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
          >
            リセット
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {/* ログ一覧 */}
      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      日時
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ユーザー
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      遷移元
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      遷移先
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      アクション
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      結果
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      エラー
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.length === 0 ? (
                    <tr>
                      <td colSpan="7" className="px-6 py-4 text-center text-gray-500">
                        監査ログがありません
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => (
                      <tr key={log.id} className={!log.success ? 'bg-red-50' : ''}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {formatDateTime(log.created_at)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {log.user_name || log.username || `ID: ${log.user_id}`}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.source_system || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {log.target_system || '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {getActionLabel(log.action)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 text-xs font-semibold rounded-full ${
                              log.success
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {log.success ? '成功' : '失敗'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-red-600">
                          {log.error_message || '-'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {/* ページネーション */}
            {!loading && (pagination.total > 0 || logs.length > 0) && (
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-200">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    全{pagination.total}件中 {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)}件を表示
                  </div>
                  {pagination.totalPages > 1 && (
                    <div className="flex gap-2 items-center">
                      <button
                        onClick={() => handlePageChange(pagination.page - 1)}
                        disabled={pagination.page === 1}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                      >
                        前へ
                      </button>
                      <span className="px-4 py-2 text-gray-700">
                        {pagination.page} / {pagination.totalPages}
                      </span>
                      <button
                        onClick={() => handlePageChange(pagination.page + 1)}
                        disabled={pagination.page >= pagination.totalPages}
                        className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-gray-300"
                      >
                        次へ
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default SSOAuditLogs;

