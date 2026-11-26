import React, { useState } from 'react';
import { apiDelete, apiGet, apiPost } from '../../utils/api';

const asTypeList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const OfficeTypeManagement = () => {
  const [open, setOpen] = useState(false);
  const [types, setTypes] = useState([]);
  const [newType, setNewType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadTypes = async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiGet('/api/office-types');
      setTypes(asTypeList(payload).filter((item) => item && item.type));
    } catch (loadError) {
      console.error('事業所タイプの取得に失敗:', loadError);
      setError(loadError.message || '事業所タイプの取得に失敗しました。');
    } finally {
      setLoading(false);
    }
  };

  const openModal = () => {
    setNotice('');
    setNewType('');
    setOpen(true);
    loadTypes();
  };

  const handleAdd = async () => {
    const name = newType.trim();
    if (!name) return;
    if (types.some((item) => item.type === name)) {
      setNotice('同じ名前の事業所タイプが既に存在します。');
      return;
    }
    try {
      setNotice('');
      const result = await apiPost('/api/office-types', { type: name });
      if (result && result.success === false) {
        throw new Error(result.message || '事業所タイプの追加に失敗しました。');
      }
      setNewType('');
      setNotice(result?.message || '事業所タイプを追加しました。');
      await loadTypes();
    } catch (addError) {
      console.error('事業所タイプの追加に失敗:', addError);
      setNotice(addError.message || '事業所タイプの追加に失敗しました。');
    }
  };

  const handleRemove = async (typeItem) => {
    if (!window.confirm(`「${typeItem.type}」を削除しますか？\n\n注意: この事業所タイプを使用している企業が存在する場合は削除できません。`)) {
      return;
    }
    try {
      setNotice('');
      const result = await apiDelete(`/api/office-types/${typeItem.id}`);
      if (result && result.success === false) {
        throw new Error(result.message || '事業所タイプの削除に失敗しました。');
      }
      setNotice(result?.message || '事業所タイプを削除しました。');
      await loadTypes();
    } catch (removeError) {
      console.error('事業所タイプの削除に失敗:', removeError);
      setNotice(removeError.message || '事業所タイプの削除に失敗しました。');
    }
  };

  return (
    <>
      <div className="mt-8">
        <button
          type="button"
          onClick={openModal}
          className="rounded-lg bg-gray-600 px-6 py-3 font-medium text-white transition-colors duration-300 hover:bg-gray-700"
        >
          事業所タイプ管理
        </button>
      </div>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="mx-4 max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-8 shadow-2xl">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-800">事業所タイプ管理</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>

            {loading && <p className="py-8 text-center text-gray-600">事業所タイプを読み込み中...</p>}

            {!loading && error && (
              <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
                <button
                  type="button"
                  onClick={loadTypes}
                  className="mt-2 text-sm text-red-600 underline hover:text-red-800"
                >
                  再試行
                </button>
              </div>
            )}

            {!loading && !error && (
              <>
                {notice && <p className="mb-4 text-sm text-gray-700">{notice}</p>}
                <div className="mb-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-700">現在の事業所タイプ</h3>
                  {types.length === 0 ? (
                    <p className="py-4 text-center text-gray-500">事業所タイプが登録されていません</p>
                  ) : (
                    <div className="max-h-60 space-y-2 overflow-y-auto">
                      {types.map((typeItem) => (
                        <div
                          key={typeItem.id}
                          className="flex items-center justify-between rounded-lg bg-gray-50 p-3"
                        >
                          <span className="text-gray-800">{typeItem.type}</span>
                          <button
                            type="button"
                            onClick={() => handleRemove(typeItem)}
                            disabled={types.length <= 1}
                            title={types.length <= 1 ? '最低1つの事業所タイプが必要です' : ''}
                            className="rounded bg-red-500 px-3 py-1 text-sm font-medium text-white hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            削除
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mb-6">
                  <h3 className="mb-4 text-lg font-semibold text-gray-700">新しい事業所タイプを追加</h3>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newType}
                      onChange={(event) => setNewType(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') handleAdd();
                      }}
                      placeholder="新しい事業所タイプ名"
                      className="flex-1 rounded-lg border-2 border-gray-200 px-4 py-3 outline-none focus:border-indigo-400"
                    />
                    <button
                      type="button"
                      onClick={handleAdd}
                      disabled={!newType.trim()}
                      className="rounded-lg bg-indigo-600 px-6 py-3 font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      追加
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="border-t border-gray-200 pt-4">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full rounded-lg border-2 border-gray-200 bg-gray-100 px-6 py-3 font-semibold text-gray-700 hover:bg-gray-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default OfficeTypeManagement;
