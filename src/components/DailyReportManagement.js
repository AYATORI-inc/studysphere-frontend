import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import SanitizedInput from './SanitizedInput';
import SanitizedTextarea from './SanitizedTextarea';
import { SANITIZE_OPTIONS } from '../utils/sanitizeUtils';
import { convertTimeToMySQLDateTime } from '../utils/dateUtils';
import { API_BASE_URL } from '../config/apiConfig';

const DailyReportManagement = ({ student, onClose }) => {
  const { currentUser } = useAuth();
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedReport, setSelectedReport] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({});
  const [newComment, setNewComment] = useState('');
  const [filterDate, setFilterDate] = useState(new Date().toISOString().split('T')[0]);
  const [showCommentForm, setShowCommentForm] = useState(false);

  // 日報一覧を取得
  const fetchDailyReports = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_BASE_URL}/api/remote-support/daily-reports?userId=${student.id}&startDate=${filterDate}&endDate=${filterDate}`);
      
      if (response.ok) {
        const result = await response.json();
        setReports(result.data.reports || []);
        console.log('日報取得成功:', result.data);
      } else {
        const errorData = await response.json();
        console.error('日報取得エラー:', response.status, errorData);
        alert(`日報取得エラー: ${errorData.message || '不明なエラーが発生しました'}`);
      }
    } catch (error) {
      console.error('日報取得エラー:', error);
      alert(`日報取得エラー: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // 日報詳細を取得
  const fetchReportDetail = async (reportId) => {
    try {
      const response = await fetch(`${API_BASE_URL}/api/remote-support/daily-reports/${reportId}`);
      if (response.ok) {
        const result = await response.json();
        setSelectedReport(result.data);
        
        // 編集フォームを初期化
        const formatTimeForInput = (datetime) => {
          if (!datetime) return '';
          // DATETIME形式（例：2025-08-26T03:44:00.000Z）からHH:MM形式に変換
          const date = new Date(datetime);
          const timeString = date.toTimeString().slice(0, 5); // HH:MM形式
          console.log(`時間変換: ${datetime} -> ${timeString} (型: ${typeof timeString})`);
          return timeString;
        };

        setEditForm({
          temperature: result.data.temperature || '',
          condition: result.data.condition || '',
          condition_note: result.data.condition_note || '',
          work_note: result.data.work_note || '',
          work_result: result.data.work_result || '',
          daily_report: result.data.daily_report || '',
          support_method: result.data.support_method || '',
          support_method_note: result.data.support_method_note || '',
          task_content: result.data.task_content || '',
          support_content: result.data.support_content || '',
          advice: result.data.advice || '',
          mark_start: formatTimeForInput(result.data.mark_start),
          mark_lunch_start: formatTimeForInput(result.data.mark_lunch_start),
          mark_lunch_end: formatTimeForInput(result.data.mark_lunch_end),
          mark_end: formatTimeForInput(result.data.mark_end)
        });
      }
    } catch (error) {
      console.error('日報詳細取得エラー:', error);
    }
  };

  // 日報を更新
  const updateReport = async () => {
    try {
      // 時間フィールドを正規化（MySQL形式の日時文字列に変換）
      const normalizedForm = { ...editForm };
      
      // 時間フィールドをMySQL形式の日時文字列に変換
      if (editForm.mark_start && editForm.mark_start.trim() !== '') {
        // Dateオブジェクトの場合はHH:MM形式に変換してからMySQL形式に
        if (editForm.mark_start instanceof Date) {
          const timeStr = editForm.mark_start.toTimeString().slice(0, 5);
          normalizedForm.mark_start = convertTimeToMySQLDateTime(timeStr);
        } else if (typeof editForm.mark_start === 'string') {
          // 既にHH:MM形式の場合はMySQL形式に変換
          if (/^\d{2}:\d{2}$/.test(editForm.mark_start)) {
            normalizedForm.mark_start = convertTimeToMySQLDateTime(editForm.mark_start);
          } else {
            // その他の文字列形式の場合はDateオブジェクトに変換してからMySQL形式に
            try {
              const date = new Date(editForm.mark_start);
              if (!isNaN(date.getTime())) {
                const timeStr = date.toTimeString().slice(0, 5);
                normalizedForm.mark_start = convertTimeToMySQLDateTime(timeStr);
              } else {
                normalizedForm.mark_start = null;
              }
            } catch (e) {
              normalizedForm.mark_start = null;
            }
          }
        } else {
          normalizedForm.mark_start = null;
        }
      } else {
        normalizedForm.mark_start = null;
      }
      
      if (editForm.mark_lunch_start && editForm.mark_lunch_start.trim() !== '') {
        if (editForm.mark_lunch_start instanceof Date) {
          const timeStr = editForm.mark_lunch_start.toTimeString().slice(0, 5);
          normalizedForm.mark_lunch_start = convertTimeToMySQLDateTime(timeStr);
        } else if (typeof editForm.mark_lunch_start === 'string') {
          if (/^\d{2}:\d{2}$/.test(editForm.mark_lunch_start)) {
            normalizedForm.mark_lunch_start = convertTimeToMySQLDateTime(editForm.mark_lunch_start);
          } else {
            try {
              const date = new Date(editForm.mark_lunch_start);
              if (!isNaN(date.getTime())) {
                const timeStr = date.toTimeString().slice(0, 5);
                normalizedForm.mark_lunch_start = convertTimeToMySQLDateTime(timeStr);
              } else {
                normalizedForm.mark_lunch_start = null;
              }
            } catch (e) {
              normalizedForm.mark_lunch_start = null;
            }
          }
        } else {
          normalizedForm.mark_lunch_start = null;
        }
      } else {
        normalizedForm.mark_lunch_start = null;
      }
      
      if (editForm.mark_lunch_end && editForm.mark_lunch_end.trim() !== '') {
        if (editForm.mark_lunch_end instanceof Date) {
          const timeStr = editForm.mark_lunch_end.toTimeString().slice(0, 5);
          normalizedForm.mark_lunch_end = convertTimeToMySQLDateTime(timeStr);
        } else if (typeof editForm.mark_lunch_end === 'string') {
          if (/^\d{2}:\d{2}$/.test(editForm.mark_lunch_end)) {
            normalizedForm.mark_lunch_end = convertTimeToMySQLDateTime(editForm.mark_lunch_end);
          } else {
            try {
              const date = new Date(editForm.mark_lunch_end);
              if (!isNaN(date.getTime())) {
                const timeStr = date.toTimeString().slice(0, 5);
                normalizedForm.mark_lunch_end = convertTimeToMySQLDateTime(timeStr);
              } else {
                normalizedForm.mark_lunch_end = null;
              }
            } catch (e) {
              normalizedForm.mark_lunch_end = null;
            }
          }
        } else {
          normalizedForm.mark_lunch_end = null;
        }
      } else {
        normalizedForm.mark_lunch_end = null;
      }
      
      if (editForm.mark_end && editForm.mark_end.trim() !== '') {
        if (editForm.mark_end instanceof Date) {
          const timeStr = editForm.mark_end.toTimeString().slice(0, 5);
          normalizedForm.mark_end = convertTimeToMySQLDateTime(timeStr);
        } else if (typeof editForm.mark_end === 'string') {
          if (/^\d{2}:\d{2}$/.test(editForm.mark_end)) {
            normalizedForm.mark_end = convertTimeToMySQLDateTime(editForm.mark_end);
          } else {
            try {
              const date = new Date(editForm.mark_end);
              if (!isNaN(date.getTime())) {
                const timeStr = date.toTimeString().slice(0, 5);
                normalizedForm.mark_end = convertTimeToMySQLDateTime(timeStr);
              } else {
                normalizedForm.mark_end = null;
              }
            } catch (e) {
              normalizedForm.mark_end = null;
            }
          }
        } else {
          normalizedForm.mark_end = null;
        }
      } else {
        normalizedForm.mark_end = null;
      }
      
      if (Object.prototype.hasOwnProperty.call(normalizedForm, 'instructor_comment')) {
        const commentValue = normalizedForm.instructor_comment;
        if (commentValue === null) {
          normalizedForm.instructor_comment = null;
        } else if (commentValue === undefined || commentValue === '') {
          normalizedForm.instructor_comment = '';
        } else if (typeof commentValue === 'object') {
          try {
            normalizedForm.instructor_comment = JSON.stringify(commentValue);
          } catch (error) {
            console.error('instructor_commentのJSON変換に失敗しました:', error);
            normalizedForm.instructor_comment = '';
          }
        } else {
          normalizedForm.instructor_comment = String(commentValue);
        }
      }
      
      const response = await fetch(`${API_BASE_URL}/api/remote-support/daily-reports/${selectedReport.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(normalizedForm)
      });

      if (response.ok) {
        alert('日報が更新されました');
        setIsEditing(false);
        fetchReportDetail(selectedReport.id);
        fetchDailyReports();
      } else {
        const errorData = await response.json();
        console.error('日報更新エラー詳細:', errorData);
        alert(`日報の更新に失敗しました: ${errorData.message || '不明なエラー'}`);
      }
    } catch (error) {
      console.error('日報更新エラー:', error);
      alert('日報の更新に失敗しました');
    }
  };

  // コメントを追加
  const addComment = async () => {
    if (!newComment.trim()) {
      alert('コメントを入力してください');
      return;
    }

    if (newComment.length > 1000) {
      alert('コメントは1000文字以内で入力してください');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/remote-support/daily-reports/${selectedReport.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          comment: newComment,
          instructor_name: currentUser.name
        })
      });

      if (response.ok) {
        alert('コメントが追加されました');
        setNewComment('');
        setShowCommentForm(false);
        fetchReportDetail(selectedReport.id);
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'コメントの追加に失敗しました');
      }
    } catch (error) {
      console.error('コメント追加エラー:', error);
      alert('コメントの追加に失敗しました');
    }
  };

  // コメントを削除
  const deleteComment = async (comment) => {
    if (!selectedReport) return;

    const commentId = comment?.id ?? comment?.created_at ?? '';
    if (!commentId) {
      alert('コメントIDが見つかりませんでした');
      return;
    }

    const confirmMessage = `コメントを削除しますか？\n\n指導員: ${comment.instructor_name || '不明'}\n投稿日: ${comment.created_at ? new Date(comment.created_at).toLocaleString('ja-JP') : '不明'}`;
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const encodedCommentId = encodeURIComponent(commentId);
      const query = comment.created_at ? `?createdAt=${encodeURIComponent(comment.created_at)}` : '';
      const response = await fetch(`${API_BASE_URL}/api/remote-support/daily-reports/${selectedReport.id}/comments/${encodedCommentId}${query}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('コメントを削除しました');
        fetchReportDetail(selectedReport.id);
        fetchDailyReports();
      } else {
        const errorData = await response.json();
        alert(errorData.message || 'コメントの削除に失敗しました');
      }
    } catch (error) {
      console.error('コメント削除エラー:', error);
      alert('コメントの削除に失敗しました');
    }
  };

  const normalizeInstructorComments = (instructorComment) => {
    if (!instructorComment) {
      return [];
    }

    if (Array.isArray(instructorComment)) {
      return instructorComment;
    }

    if (typeof instructorComment === 'object') {
      return Array.isArray(instructorComment?.comments)
        ? instructorComment.comments
        : [];
    }

    if (typeof instructorComment === 'string') {
      try {
        const parsed = JSON.parse(instructorComment);
        return Array.isArray(parsed) ? parsed : [];
      } catch (error) {
        console.warn('指導員コメントのJSON変換に失敗しました:', error);
        return [];
      }
    }

    return [];
  };

  // コメント数を取得
  const getCommentCount = (instructorComment) => {
    return normalizeInstructorComments(instructorComment).length;
  };

  // コメントを取得（新しい順）
  const getComments = (instructorComment) => {
    return normalizeInstructorComments(instructorComment)
      .slice()
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  };

  // 指導員名の色を取得
  const getInstructorColor = (instructorName) => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800',
      'bg-purple-100 text-purple-800',
      'bg-orange-100 text-orange-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800',
      'bg-red-100 text-red-800',
      'bg-yellow-100 text-yellow-800'
    ];
    
    // 指導員名のハッシュ値に基づいて色を決定
    let hash = 0;
    for (let i = 0; i < instructorName.length; i++) {
      hash = instructorName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // 日付フィルター変更時
  useEffect(() => {
    fetchDailyReports();
  }, [filterDate, student.id]);

  // 体調の表示用テキスト
  const getConditionText = (condition) => {
    switch (condition) {
      case 'good': return '良好';
      case 'normal': return '普通';
      case 'bad': return '悪い';
      default: return condition;
    }
  };

  // 体調の色クラス
  const getConditionColor = (condition) => {
    switch (condition) {
      case 'good': return 'bg-green-100 text-green-800';
      case 'normal': return 'bg-yellow-100 text-yellow-800';
      case 'bad': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // 時間フォーマット
  const formatTime = (datetime) => {
    if (!datetime) return '--';
    return new Date(datetime).toLocaleTimeString('ja-JP', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[95vh] flex flex-col">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white p-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold">日報管理</h2>
              <p className="text-indigo-100 mt-1">
                {student.name} 様の日報確認・編集・コメント
              </p>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-indigo-200 transition-colors duration-200"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* 左側：日報一覧 */}
          <div className="w-1/3 border-r border-gray-200 flex flex-col">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2 mb-4">
                <label className="text-sm font-medium text-gray-700">日付:</label>
                <input
                  type="date"
                  value={filterDate}
                  onChange={(e) => setFilterDate(e.target.value)}
                  className="px-3 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <button
                onClick={fetchDailyReports}
                className="w-full px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors duration-200"
              >
                更新
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="text-center text-gray-500">読み込み中...</div>
              ) : reports.length === 0 ? (
                <div className="text-center text-gray-500">日報がありません</div>
              ) : (
                <div className="space-y-2">
                  {reports.map((report) => (
                    <div
                      key={report.id}
                      onClick={() => fetchReportDetail(report.id)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all duration-200 ${
                        selectedReport?.id === report.id
                          ? 'border-indigo-500 bg-indigo-50'
                          : 'border-gray-200 hover:border-indigo-300 hover:bg-indigo-25'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          {new Date(report.date).toLocaleDateString('ja-JP')}
                        </span>
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionColor(report.condition)}`}>
                          {getConditionText(report.condition)}
                        </span>
                      </div>
                      <div className="text-xs text-gray-600 space-y-1">
                        <div>体温: {report.temperature || '--'}℃</div>
                        <div>開始: {formatTime(report.mark_start)}</div>
                        <div>終了: {formatTime(report.mark_end)}</div>
                        <div className="flex items-center gap-1 mt-2">
                          <span className="text-blue-600">💬</span>
                          <span className="text-blue-600 font-medium">
                            {getCommentCount(report.instructor_comment)}件のコメント
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 右側：日報詳細 */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {selectedReport ? (
              <>
                {/* 詳細ヘッダー */}
                <div className="p-4 border-b border-gray-200 bg-gray-50">
                  <div className="flex justify-between items-center">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">
                        {new Date(selectedReport.date).toLocaleDateString('ja-JP')} の日報
                      </h3>
                      <p className="text-sm text-gray-600">
                        最終更新: {new Date(selectedReport.updated_at).toLocaleString('ja-JP')}
                      </p>
                    </div>
                    <div className="flex gap-2">
                      {!isEditing && (
                        <button
                          onClick={() => {
                            // 編集フォームを初期化
                            const timeFields = {};
                            if (selectedReport.mark_start) {
                              const startDate = new Date(selectedReport.mark_start);
                              timeFields.mark_start = startDate.toTimeString().slice(0, 5);
                            }
                            if (selectedReport.mark_lunch_start) {
                              const lunchStartDate = new Date(selectedReport.mark_lunch_start);
                              timeFields.mark_lunch_start = lunchStartDate.toTimeString().slice(0, 5);
                            }
                            if (selectedReport.mark_lunch_end) {
                              const lunchEndDate = new Date(selectedReport.mark_lunch_end);
                              timeFields.mark_lunch_end = lunchEndDate.toTimeString().slice(0, 5);
                            }
                            if (selectedReport.mark_end) {
                              const endDate = new Date(selectedReport.mark_end);
                              timeFields.mark_end = endDate.toTimeString().slice(0, 5);
                            }
                            
                            setEditForm({
                              temperature: selectedReport.temperature || '',
                              condition: selectedReport.condition || 'good',
                              condition_note: selectedReport.condition_note || '',
                              work_note: selectedReport.work_note || '',
                              work_result: selectedReport.work_result || '',
                              daily_report: selectedReport.daily_report || '',
                              support_method: selectedReport.support_method || '',
                              support_method_note: selectedReport.support_method_note || '',
                              task_content: selectedReport.task_content || '',
                              support_content: selectedReport.support_content || '',
                              advice: selectedReport.advice || '',
                              instructor_comment: selectedReport.instructor_comment || '',
                              ...timeFields
                            });
                            setIsEditing(true);
                          }}
                          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors duration-200"
                        >
                          編集
                        </button>
                      )}
                      <button
                        onClick={() => setShowCommentForm(!showCommentForm)}
                        className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors duration-200"
                      >
                        コメント追加
                      </button>
                    </div>
                  </div>
                </div>

                {/* 日報内容 */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  {isEditing ? (
                    <div className="space-y-6">
                      {/* 基本情報 */}
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">体温</label>
                          <SanitizedInput
                            type="text"
                            value={editForm.temperature}
                            onChange={(e) => setEditForm({...editForm, temperature: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            placeholder="36.5"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">体調</label>
                          <select
                            value={editForm.condition}
                            onChange={(e) => setEditForm({...editForm, condition: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          >
                            <option value="good">良好</option>
                            <option value="normal">普通</option>
                            <option value="bad">悪い</option>
                          </select>
                        </div>
                      </div>

                      {/* 時間情報 */}
                      <div className="grid grid-cols-4 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">開始時間</label>
                          <input
                            type="time"
                            value={editForm.mark_start || ''}
                            onChange={(e) => setEditForm({...editForm, mark_start: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">昼休み開始</label>
                          <input
                            type="time"
                            value={editForm.mark_lunch_start || ''}
                            onChange={(e) => setEditForm({...editForm, mark_lunch_start: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">昼休み終了</label>
                          <input
                            type="time"
                            value={editForm.mark_lunch_end || ''}
                            onChange={(e) => setEditForm({...editForm, mark_lunch_end: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">終業時間</label>
                          <input
                            type="time"
                            value={editForm.mark_end || ''}
                            onChange={(e) => setEditForm({...editForm, mark_end: e.target.value})}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">体調備考</label>
                        <SanitizedTextarea
                          value={editForm.condition_note}
                          onChange={(e) => setEditForm({...editForm, condition_note: e.target.value})}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="体調についての詳細な備考"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">本日の作業内容（予定）</label>
                        <SanitizedTextarea
                          value={editForm.work_note}
                          onChange={(e) => setEditForm({...editForm, work_note: e.target.value})}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="本日の作業予定"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">作業内容実績</label>
                        <SanitizedTextarea
                          value={editForm.work_result}
                          onChange={(e) => setEditForm({...editForm, work_result: e.target.value})}
                          rows={3}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="実際に行った作業内容"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">日報</label>
                        <SanitizedTextarea
                          value={editForm.daily_report}
                          onChange={(e) => setEditForm({...editForm, daily_report: e.target.value})}
                          rows={4}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="本日の日報"
                        />
                      </div>

                      {/* 在宅支援対象者のみ表示するフィールド */}
                      {student.is_remote_user === true && (
                        <>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">支援方法</label>
                            <select
                              value={editForm.support_method}
                              onChange={(e) => setEditForm({...editForm, support_method: e.target.value})}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">選択してください</option>
                              <option value="訪問">訪問</option>
                              <option value="電話">電話</option>
                              <option value="その他">その他</option>
                            </select>
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">作業・訓練内容</label>
                            <SanitizedTextarea
                              value={editForm.task_content}
                              onChange={(e) => setEditForm({...editForm, task_content: e.target.value})}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="作業・訓練内容の詳細"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">支援内容</label>
                            <SanitizedTextarea
                              value={editForm.support_content}
                              onChange={(e) => setEditForm({...editForm, support_content: e.target.value})}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="支援内容の詳細"
                            />
                          </div>

                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">助言内容</label>
                            <SanitizedTextarea
                              value={editForm.advice}
                              onChange={(e) => setEditForm({...editForm, advice: e.target.value})}
                              rows={3}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                              placeholder="対象者の心身の状況・助言内容"
                            />
                          </div>
                        </>
                      )}

                      {/* コメント（編集モードでも参照・削除可能） */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-semibold text-gray-800">指導員コメント</h4>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                            {getCommentCount(selectedReport.instructor_comment)}件
                          </span>
                        </div>
                        {selectedReport.instructor_comment ? (
                          <div className="space-y-4">
                            {getComments(selectedReport.instructor_comment).map((comment, index) => (
                              <div key={comment.id || index} className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getInstructorColor(comment.instructor_name)}`}>
                                      {comment.instructor_name}
                                    </span>
                                    {comment.instructor_name === currentUser.name && (
                                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                        あなた
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm text-gray-500">
                                    {new Date(comment.created_at).toLocaleString('ja-JP')}
                                  </span>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg">
                                  <p className="text-gray-700 whitespace-pre-wrap">{comment.comment}</p>
                                </div>
                                <div className="flex justify-end mt-3">
                                  <button
                                    onClick={() => deleteComment(comment)}
                                    className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors duration-200"
                                  >
                                    コメント削除
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-lg">
                            <div className="text-gray-400 mb-2">
                              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </div>
                            <p className="text-gray-500">まだコメントはありません</p>
                            <p className="text-sm text-gray-400 mt-1">最初のコメントを追加してみましょう</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {/* 基本情報 */}
                      <div className="grid grid-cols-2 gap-6">
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">体温:</span>
                            <span className="text-gray-800">{selectedReport.temperature || '--'}℃</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">体調:</span>
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${getConditionColor(selectedReport.condition)}`}>
                              {getConditionText(selectedReport.condition)}
                            </span>
                          </div>
                          {selectedReport.condition_note && (
                            <div>
                              <span className="font-medium text-gray-700">体調備考:</span>
                              <p className="mt-1 text-gray-800">{selectedReport.condition_note}</p>
                            </div>
                          )}
                        </div>
                        <div className="space-y-4">
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">開始時間:</span>
                            <span className="text-gray-800">{formatTime(selectedReport.mark_start)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">昼休憩開始:</span>
                            <span className="text-gray-800">{formatTime(selectedReport.mark_lunch_start)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">昼休憩終了:</span>
                            <span className="text-gray-800">{formatTime(selectedReport.mark_lunch_end)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="font-medium text-gray-700">終了時間:</span>
                            <span className="text-gray-800">{formatTime(selectedReport.mark_end)}</span>
                          </div>
                        </div>
                      </div>

                      {/* 作業内容 */}
                      <div>
                        <h4 className="text-lg font-semibold text-gray-800 mb-3">作業内容</h4>
                        <div className="space-y-4">
                          <div>
                            <span className="font-medium text-gray-700">本日の作業内容（予定）:</span>
                            <p className="mt-1 text-gray-800">{selectedReport.work_note || '未入力'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">作業内容実績:</span>
                            <p className="mt-1 text-gray-800">{selectedReport.work_result || '未入力'}</p>
                          </div>
                          <div>
                            <span className="font-medium text-gray-700">日報:</span>
                            <p className="mt-1 text-gray-800">{selectedReport.daily_report || '未入力'}</p>
                          </div>
                        </div>
                      </div>

                      {/* 支援情報（在宅支援対象者のみ表示） */}
                      {student.is_remote_user === true && (
                        <div>
                          <h4 className="text-lg font-semibold text-gray-800 mb-3">支援情報</h4>
                          <div className="space-y-4">
                            <div>
                              <span className="font-medium text-gray-700">支援方法:</span>
                              <p className="mt-1 text-gray-800">{selectedReport.support_method || '未設定'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">作業・訓練内容:</span>
                              <p className="mt-1 text-gray-800">{selectedReport.task_content || '未入力'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">支援内容:</span>
                              <p className="mt-1 text-gray-800">{selectedReport.support_content || '未入力'}</p>
                            </div>
                            <div>
                              <span className="font-medium text-gray-700">助言内容:</span>
                              <p className="mt-1 text-gray-800">{selectedReport.advice || '未入力'}</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* コメント */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-lg font-semibold text-gray-800">指導員コメント</h4>
                          <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                            {getCommentCount(selectedReport.instructor_comment)}件
                          </span>
                        </div>
                        {selectedReport.instructor_comment ? (
                          <div className="space-y-4">
                            {getComments(selectedReport.instructor_comment).map((comment, index) => (
                              <div key={comment.id || index} className="bg-white border border-gray-200 p-4 rounded-lg shadow-sm">
                                <div className="flex justify-between items-start mb-3">
                                  <div className="flex items-center gap-2">
                                    <span className={`px-3 py-1 rounded-full text-sm font-medium ${getInstructorColor(comment.instructor_name)}`}>
                                      {comment.instructor_name}
                                    </span>
                                    {comment.instructor_name === currentUser.name && (
                                      <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                                        あなた
                                      </span>
                                    )}
                                  </div>
                                  <span className="text-sm text-gray-500">
                                    {new Date(comment.created_at).toLocaleString('ja-JP')}
                                  </span>
                                </div>
                                <div className="bg-gray-50 p-3 rounded-lg">
                                  <p className="text-gray-700 whitespace-pre-wrap">{comment.comment}</p>
                                </div>
                                <div className="flex justify-end mt-3">
                                  <button
                                    onClick={() => deleteComment(comment)}
                                    className="px-3 py-1 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 transition-colors duration-200"
                                  >
                                    コメント削除
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 bg-gray-50 rounded-lg">
                            <div className="text-gray-400 mb-2">
                              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                              </svg>
                            </div>
                            <p className="text-gray-500">まだコメントはありません</p>
                            <p className="text-sm text-gray-400 mt-1">最初のコメントを追加してみましょう</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* コメント追加フォーム */}
                  {showCommentForm && (
                    <div className="mt-6 p-6 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
                      <div className="flex items-center gap-2 mb-4">
                        <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                          <span className="text-white text-sm font-bold">{currentUser.name.charAt(0)}</span>
                        </div>
                        <div>
                          <h4 className="text-lg font-semibold text-gray-800">コメント追加</h4>
                          <p className="text-sm text-gray-600">指導員: {currentUser.name}</p>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-2">コメント内容</label>
                          <SanitizedTextarea
                            value={newComment}
                            onChange={(e) => setNewComment(e.target.value)}
                            rows={4}
                            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200"
                            placeholder="利用者の状況やアドバイス、次回の支援方針などを記入してください..."
                          />
                          <div className="flex justify-between items-center mt-2">
                            <span className={`text-xs ${newComment.length > 1000 ? 'text-red-500' : 'text-gray-500'}`}>
                              {newComment.length}/1000文字
                            </span>
                            <span className="text-xs text-gray-500">
                              Enter + Shift で改行
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-3">
                          <button
                            onClick={addComment}
                            disabled={!newComment.trim() || newComment.length > 1000}
                            className="flex-1 px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200 font-medium"
                          >
                            💬 コメント追加
                          </button>
                          <button
                            onClick={() => {
                              setShowCommentForm(false);
                              setNewComment('');
                            }}
                            className="px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-all duration-200"
                          >
                            キャンセル
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 編集モードのフッターボタン */}
                  {isEditing && (
                    <div className="p-6 border-t border-gray-200 bg-gray-50 flex-shrink-0">
                      <div className="flex gap-4">
                        <button
                          onClick={updateReport}
                          className="flex-1 px-6 py-3 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-colors duration-200 font-medium"
                        >
                          💾 保存
                        </button>
                        <button
                          onClick={() => setIsEditing(false)}
                          className="flex-1 px-6 py-3 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors duration-200 font-medium"
                        >
                          ❌ キャンセル
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <p>左側から日報を選択してください</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailyReportManagement;
