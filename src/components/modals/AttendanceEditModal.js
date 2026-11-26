import React, { useState, useEffect } from 'react';
import { updateDailyAttendance } from '../../utils/api';
import HalfHourTimeInput, { toClockTime } from '../common/HalfHourTimeInput';

const AttendanceEditModal = ({ isOpen, onClose, record, date, onSuccess }) => {
  const [formData, setFormData] = useState({
    startTime: '',
    endTime: '',
    breakStartTime: '',
    breakEndTime: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (record) {
      setFormData({
        startTime: toClockTime(record.startTime || ''),
        endTime: toClockTime(record.endTime || ''),
        breakStartTime: toClockTime(record.breakStartTime || ''),
        breakEndTime: toClockTime(record.breakEndTime || '')
      });
    }
  }, [record]);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!record || !date) {
      setError('データが正しく設定されていません');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // recordIdがある場合は更新、ない場合は新規作成（userIdを指定）
      const recordId = record.recordId || 'new';
      
      // JST時刻をそのまま送信（バックエンドでUTCに変換）
      const updateData = {
        startTime: formData.startTime || null,
        endTime: formData.endTime || null,
        breakStartTime: formData.breakStartTime || null,
        breakEndTime: formData.breakEndTime || null,
        date: date,
        userId: record.userId // 新規作成の場合に必要
      };

      // recordIdが'new'の場合は、エンドポイントを変更
      const response = recordId === 'new' || !recordId
        ? await updateDailyAttendance('new', updateData)
        : await updateDailyAttendance(recordId, updateData);

      if (response.success) {
        if (onSuccess) {
          onSuccess({ ...formData });
        }
        onClose();
      } else {
        setError(response.message || '勤怠データの更新に失敗しました');
      }
    } catch (err) {
      console.error('勤怠データ更新エラー:', err);
      setError('勤怠データの更新に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-800">勤怠修正</h3>
            <button 
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
            >
              ×
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            {record && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">利用者</label>
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="font-semibold text-gray-800">{record.name}</p>
                  <p className="text-xs text-gray-600">受給者証: {record.recipientCertificateId}</p>
                </div>
              </div>
            )}
            
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">開始時間</label>
                <HalfHourTimeInput
                  value={formData.startTime}
                  onChange={(startTime) => setFormData({ ...formData, startTime })}
                  className="focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">終了時間</label>
                <HalfHourTimeInput
                  value={formData.endTime}
                  onChange={(endTime) => setFormData({ ...formData, endTime })}
                  className="focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">休憩開始</label>
                <HalfHourTimeInput
                  value={formData.breakStartTime}
                  onChange={(breakStartTime) => setFormData({ ...formData, breakStartTime })}
                  className="focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">休憩終了</label>
                <HalfHourTimeInput
                  value={formData.breakEndTime}
                  onChange={(breakEndTime) => setFormData({ ...formData, breakEndTime })}
                  className="focus:ring-blue-500"
                />
              </div>
            </div>
          </div>
          
          <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors disabled:opacity-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AttendanceEditModal;
