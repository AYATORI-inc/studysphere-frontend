import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';
import { useAuth } from './contexts/AuthContext';

const SSOTrustedSystemsManagement = () => {
  const { currentUser } = useAuth();
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingSystem, setEditingSystem] = useState(null);
  const [formData, setFormData] = useState({
    system_key: '',
    system_name: '',
    base_url: '',
    landing_path: '/landing',
    description: '',
    enabled: true
  });

  // 信頼システム一覧を取得
  const fetchSystems = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await apiGet('/api/sso/systems');
      if (response.success) {
        setSystems(response.data);
      } else {
        setError('信頼システム一覧の取得に失敗しました');
      }
    } catch (err) {
      console.error('信頼システム取得エラー:', err);
      setError('信頼システム一覧の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSystems();
  }, []);

  // フォームリセット
  const resetForm = () => {
    setFormData({
      system_key: '',
      system_name: '',
      base_url: '',
      landing_path: '/landing',
      description: '',
      enabled: true
    });
    setEditingSystem(null);
    setShowForm(false);
  };

  // フォーム送信
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    try {
      if (editingSystem) {
        // 更新
        const response = await apiPut(`/api/sso/systems/${editingSystem.id}`, formData);
        if (response.success) {
          setSuccess('信頼システムを更新しました');
          resetForm();
          fetchSystems();
        } else {
          setError(response.message || '信頼システムの更新に失敗しました');
        }
      } else {
        // 新規作成
        const response = await apiPost('/api/sso/systems', formData);
        if (response.success) {
          setSuccess('信頼システムを追加しました');
          resetForm();
          fetchSystems();
        } else {
          setError(response.message || '信頼システムの追加に失敗しました');
        }
      }
    } catch (err) {
      console.error('信頼システム保存エラー:', err);
      setError('信頼システムの保存に失敗しました');
    }
  };

  // 編集開始
  const handleEdit = (system) => {
    setEditingSystem(system);
    setFormData({
      system_key: system.system_key,
      system_name: system.system_name,
      base_url: system.base_url,
      landing_path: system.landing_path,
      description: system.description || '',
      enabled: system.enabled
    });
    setShowForm(true);
  };

  // 削除（論理削除）
  const handleDelete = async (id) => {
    if (!window.confirm('この信頼システムを無効化しますか？')) {
      return;
    }

    try {
      setError('');
      const response = await apiDelete(`/api/sso/systems/${id}`);
      if (response.success) {
        setSuccess('信頼システムを無効化しました');
        fetchSystems();
      } else {
        setError(response.message || '信頼システムの無効化に失敗しました');
      }
    } catch (err) {
      console.error('信頼システム削除エラー:', err);
      setError('信頼システムの無効化に失敗しました');
    }
  };

  // URLバリデーション
  const validateUrl = (url) => {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-800">SSO信頼システム管理</h2>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          + 新規追加
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
          <h3 className="text-xl font-semibold mb-4">
            {editingSystem ? '信頼システム編集' : '信頼システム追加'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                システム識別子 (system_key) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.system_key}
                onChange={(e) => setFormData({ ...formData, system_key: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={!!editingSystem}
                placeholder="例: toybox_prod"
              />
              <p className="text-xs text-gray-500 mt-1">
                {editingSystem ? 'システム識別子は変更できません' : '英数字とアンダースコアのみ使用可能'}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                システム表示名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.system_name}
                onChange={(e) => setFormData({ ...formData, system_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="例: ToyBox本番環境"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ベースURL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={formData.base_url}
                onChange={(e) => setFormData({ ...formData, base_url: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                placeholder="例: https://toybox.example.com"
              />
              {formData.base_url && !validateUrl(formData.base_url) && (
                <p className="text-xs text-red-500 mt-1">有効なURL形式を入力してください</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ランディングパス
              </label>
              <input
                type="text"
                value={formData.landing_path}
                onChange={(e) => setFormData({ ...formData, landing_path: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="/landing"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                説明
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="3"
                placeholder="システムの説明（任意）"
              />
            </div>

            {editingSystem && (
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.enabled}
                    onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">有効</span>
                </label>
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {editingSystem ? '更新' : '追加'}
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
              >
                キャンセル
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">読み込み中...</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  システム識別子
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  システム名
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ベースURL
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ランディングパス
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  状態
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  操作
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {systems.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-4 text-center text-gray-500">
                    信頼システムが登録されていません
                  </td>
                </tr>
              ) : (
                systems.map((system) => (
                  <tr key={system.id} className={!system.enabled ? 'bg-gray-100' : ''}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                      {system.system_key}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {system.system_name}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      <a
                        href={system.base_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        {system.base_url}
                      </a>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {system.landing_path}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 py-1 text-xs font-semibold rounded-full ${
                          system.enabled
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {system.enabled ? '有効' : '無効'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEdit(system)}
                          className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-blue-600"
                          title="編集"
                        >
                          ✏️ 編集
                        </button>
                        {system.enabled && (
                          <button
                            onClick={() => handleDelete(system.id)}
                            className="bg-red-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-red-600"
                            title="無効化"
                          >
                            🗑️ 無効化
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default SSOTrustedSystemsManagement;

