import React, { useState, useEffect } from 'react';
import { updateRecipientNumber, getSupportPlan, upsertSupportPlan } from '../../utils/api';
import { toJapanDateKey } from '../../utils/dateUtils';

const GOAL_DATE_MIN_YEAR = 1900;
const GOAL_DATE_MAX_YEAR = 2100;

const goalDateError = (value, required = false) => {
  const text = (value || '').trim();
  if (!text) {
    return required ? '目標達成予定日を入力してください。' : '';
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    return '目標達成予定日は4桁の年で、実在する日付を入力してください。';
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  const exists = date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
  if (!exists || year < GOAL_DATE_MIN_YEAR || year > GOAL_DATE_MAX_YEAR) {
    return `目標達成予定日は${GOAL_DATE_MIN_YEAR}年から${GOAL_DATE_MAX_YEAR}年の実在する日付にしてください。`;
  }
  return '';
};

const goalDateForInput = (value) => {
  const key = toJapanDateKey(value);
  if (!key || goalDateError(key)) return '';
  return key;
};

const HomeSupportUserDetailModal = ({ isOpen, onClose, student, onSave }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [recipientNumber, setRecipientNumber] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [supportPlan, setSupportPlan] = useState({
    long_term_goal: '',
    short_term_goal: '',
    needs: '',
    support_content: '',
    goal_date: ''
  });

  useEffect(() => {
    if (isOpen && student) {
      // 別の利用者を開いたときに前のデータが残らないよう、いったん空でリセット
      setSupportPlan({
        long_term_goal: '',
        short_term_goal: '',
        needs: '',
        support_content: '',
        goal_date: ''
      });
      // 受給者証番号を設定（APIが snake_case / camelCase のどちらでも受け取れるように）
      setRecipientNumber(student.recipient_number ?? student.recipientNumber ?? '');
      setFieldErrors({});

      // 個別支援計画を取得（あれば上書き、404の場合は空のまま）
      fetchSupportPlan();
    }
  }, [isOpen, student]);

  const fetchSupportPlan = async () => {
    if (!student?.id) return;
    
    setLoading(true);
    try {
      const response = await getSupportPlan(student.id);
      if (response.success && response.data) {
        const data = response.data;
        setSupportPlan({
          long_term_goal: data.long_term_goal || '',
          short_term_goal: data.short_term_goal || '',
          needs: data.needs || '',
          support_content: data.support_content || '',
          goal_date: goalDateForInput(data.goal_date)
        });
      }
    } catch (error) {
      console.error('個別支援計画の取得エラー:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!student?.id) return;

    const goalDateValue = (supportPlan.goal_date || '').trim();
    const dateError = goalDateError(goalDateValue, true);
    if (dateError) {
      setFieldErrors({ goal_date: dateError });
      return;
    }

    const planToSave = {
      long_term_goal: supportPlan.long_term_goal.trim(),
      short_term_goal: supportPlan.short_term_goal.trim(),
      needs: supportPlan.needs.trim(),
      support_content: supportPlan.support_content.trim(),
      goal_date: goalDateValue,
    };
    const nextRecipientNumber = recipientNumber.trim();

    setFieldErrors({});
    setSaving(true);
    try {
      const currentRecipient = (student.recipient_number ?? student.recipientNumber ?? '').trim();
      if (nextRecipientNumber !== currentRecipient) {
        await updateRecipientNumber(student.id, nextRecipientNumber);
      }

      await upsertSupportPlan({
        user_id: student.id,
        ...planToSave,
      });

      alert('利用者情報を保存しました');
      onSave && onSave();
      onClose();
    } catch (error) {
      console.error('保存エラー:', error);
      const message = error.response?.data?.message || error.message || '保存に失敗しました';
      alert(message);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !student) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* ヘッダー */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-800">
              👤 {student.name}さんの詳細情報
            </h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
              <span className="ml-2 text-gray-600">読み込み中...</span>
            </div>
          ) : (
            <div className="space-y-6">
              {/* 基本情報 */}
              <div className="bg-gray-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">基本情報</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      利用者名
                    </label>
                    <input
                      type="text"
                      value={student.name}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      受給者証番号
                    </label>
                    <input
                      type="text"
                      value={recipientNumber}
                      onChange={(e) => setRecipientNumber(e.target.value)}
                      placeholder="受給者証番号を入力"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      担当指導員
                    </label>
                    <input
                      type="text"
                      value={student.instructorName || '未設定'}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ログインコード
                    </label>
                    <input
                      type="text"
                      value={student.email || '未設定'}
                      disabled
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-600"
                    />
                  </div>
                </div>
              </div>

              {/* 個別支援計画 */}
              <div className="bg-blue-50 rounded-xl p-6">
                <h3 className="text-lg font-semibold text-gray-800 mb-4">個別支援計画</h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      長期目標
                    </label>
                    <textarea
                      value={supportPlan.long_term_goal}
                      onChange={(e) => setSupportPlan(prev => ({ ...prev, long_term_goal: e.target.value }))}
                      placeholder="長期目標を入力してください"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      短期目標
                    </label>
                    <textarea
                      value={supportPlan.short_term_goal}
                      onChange={(e) => setSupportPlan(prev => ({ ...prev, short_term_goal: e.target.value }))}
                      placeholder="短期目標を入力してください"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      ニーズ
                    </label>
                    <textarea
                      value={supportPlan.needs}
                      onChange={(e) => setSupportPlan(prev => ({ ...prev, needs: e.target.value }))}
                      placeholder="ニーズを入力してください"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      支援内容
                    </label>
                    <textarea
                      value={supportPlan.support_content}
                      onChange={(e) => setSupportPlan(prev => ({ ...prev, support_content: e.target.value }))}
                      placeholder="支援内容を入力してください"
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      目標達成予定日 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="date"
                      min={`${GOAL_DATE_MIN_YEAR}-01-01`}
                      max={`${GOAL_DATE_MAX_YEAR}-12-31`}
                      value={/^\d{4}-\d{2}-\d{2}$/.test(supportPlan.goal_date) ? supportPlan.goal_date : ''}
                      onChange={(e) => {
                        const nextValue = e.target.value;
                        setSupportPlan(prev => ({ ...prev, goal_date: nextValue }));
                        setFieldErrors(prev => ({ ...prev, goal_date: goalDateError(nextValue) }));
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${fieldErrors.goal_date ? 'border-red-500' : 'border-gray-300'}`}
                    />
                    {fieldErrors.goal_date && (
                      <p className="mt-2 text-sm text-red-600">{fieldErrors.goal_date}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* 操作ボタン */}
              <div className="flex justify-end gap-3 pt-4">
                <button
                  onClick={onClose}
                  className="px-6 py-3 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      保存中...
                    </>
                  ) : (
                    '保存'
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HomeSupportUserDetailModal;
