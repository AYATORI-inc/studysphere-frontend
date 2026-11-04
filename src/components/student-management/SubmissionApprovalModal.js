import React, { useState, useEffect } from 'react';
import { 
  getStudentSubmissions, 
  downloadSubmission, 
  approveSubmission,
  resubmitSubmission
} from '../../utils/api';
import { formatDatabaseTime } from '../../utils/dateUtils';

const SubmissionApprovalModal = ({ 
  isOpen, 
  onClose, 
  student,
  onApprovalSuccess 
}) => {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [resubmitting, setResubmitting] = useState(false);
  const [resubmittedIds, setResubmittedIds] = useState(new Set());
  const [error, setError] = useState(null);
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [comment, setComment] = useState('');

  // 利用者の提出物一覧を取得
  const fetchSubmissions = async () => {
    if (!student) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await getStudentSubmissions(student.id);
      if (response.success) {
        setSubmissions(response.data);
      } else {
        setError('提出物の取得に失敗しました');
      }
    } catch (error) {
      console.error('提出物取得エラー:', error);
      setError('提出物の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // file_urlから正式なファイル名を抽出する関数
  const extractFileNameFromUrl = (fileUrl) => {
    if (!fileUrl) return null;
    
    // URLの最後の部分（ファイル名）を取得
    const urlParts = fileUrl.split('/');
    const fileName = urlParts[urlParts.length - 1];
    
    // ファイル名が存在し、拡張子がある場合はそのまま返す
    if (fileName && fileName.includes('.')) {
      return fileName;
    }
    
    return null;
  };

  // 提出物ダウンロード
  const handleDownload = async (submission) => {
    try {
      setError(null);
      
      const blob = await downloadSubmission(submission.submission_id);
      
      // ファイル名を取得（file_urlから抽出を優先）
      let fileName = extractFileNameFromUrl(submission.file_url);
      
      // file_urlから抽出できない場合は、file_nameを使用
      if (!fileName) {
        fileName = submission.file_name || `submission_${submission.submission_id}`;
      }
      
      console.log('ダウンロードファイル名:', fileName);
      console.log('file_url:', submission.file_url);
      console.log('file_name:', submission.file_name);
      
      // Blobからダウンロード
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('ダウンロードエラー:', error);
      setError('ファイルのダウンロードに失敗しました');
    }
  };

  // 提出物承認処理
  const handleApproveSubmission = async (submission) => {
    if (!window.confirm(`${submission.lesson_name}の提出物を承認しますか？`)) {
      return;
    }

    setApproving(true);
    setError(null);

    try {
      const response = await approveSubmission(
        submission.submission_id,
        submission.user_id,
        submission.lesson_id,
        comment
      );
      
      if (response.success) {
        alert(response.message);
        // 承認成功後、リストを更新
        await fetchSubmissions();
        // 親コンポーネントに通知
        onApprovalSuccess && onApprovalSuccess();
        setComment('');
      } else {
        setError(response.message || '承認に失敗しました');
      }
    } catch (error) {
      console.error('提出物承認エラー:', error);
      setError('承認処理中にエラーが発生しました');
    } finally {
      setApproving(false);
    }
  };

  // 提出物再提出処理
  const handleResubmitSubmission = async (submission) => {
    if (!window.confirm(`${submission.lesson_name}の提出物を再提出待ちの状態にしますか？\nファイルは削除されず、フラグのみ変更されます。`)) {
      return;
    }

    setResubmitting(true);
    setError(null);

    try {
      const response = await resubmitSubmission(submission.submission_id);
      
      if (response.success) {
        // 再提出成功後、その提出物IDを記録（ボタン表記を変更）
        setResubmittedIds(prev => new Set([...prev, submission.submission_id]));
        // リストを更新
        await fetchSubmissions();
        // 親コンポーネントに通知
        onApprovalSuccess && onApprovalSuccess();
        alert('再提出待ちの状態に変更しました');
      } else {
        setError(response.message || '再提出処理に失敗しました');
      }
    } catch (error) {
      console.error('提出物再提出エラー:', error);
      setError('再提出処理中にエラーが発生しました');
    } finally {
      setResubmitting(false);
    }
  };

  // ファイルサイズをフォーマット
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // 日付をフォーマット（UTCを日本時間に変換して表示）
  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    // formatDatabaseTimeを使用してUTCを日本時間に変換
    return formatDatabaseTime(dateString, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(/-/g, '/');
  };

  // モーダルが開かれた時にデータを取得
  useEffect(() => {
    if (isOpen && student) {
      fetchSubmissions();
    }
  }, [isOpen, student]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-4 pb-4 border-b">
          <h2 className="text-xl font-bold text-gray-800">
            提出物確認 - {student?.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
          >
            ×
          </button>
        </div>

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-300 text-red-700 rounded">
            {error}
          </div>
        )}

        {/* ローディング表示 */}
        {loading && (
          <div className="flex justify-center items-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <span className="ml-2 text-gray-600">提出物を読み込み中...</span>
          </div>
        )}

        {/* 提出物一覧 */}
        {!loading && (
          <div className="flex-1 overflow-y-auto">
            {submissions.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                提出物がありません
              </div>
            ) : (
              <div className="space-y-4">
                {submissions.map((submission) => (
                  <div
                    key={submission.submission_id}
                    className={`p-4 border rounded-lg ${
                      submission.instructor_approved 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-yellow-50 border-yellow-200'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-semibold text-gray-800">
                            {submission.lesson_name}
                          </h3>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            submission.instructor_approved
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {submission.instructor_approved ? '承認済み' : '未承認'}
                          </span>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm text-gray-600 mb-3">
                          <div>
                            <span className="font-medium">ファイル名:</span> {extractFileNameFromUrl(submission.file_url) || submission.file_name}
                          </div>
                          <div>
                            <span className="font-medium">提出日時:</span> {formatDate(submission.uploaded_at)}
                          </div>
                          <div>
                            <span className="font-medium">レッスン:</span> {submission.lesson_name}
                          </div>
                          <div>
                            <span className="font-medium">コース:</span> {submission.course_title}
                          </div>
                        </div>

                        {submission.instructor_approved === 1 && submission.approver_name && (
                          <div className="text-sm text-green-700 mb-2">
                            <span className="font-medium">承認者:</span> {submission.approver_name}
                            {submission.instructor_approved_at && (
                              <span className="ml-2">
                                ({formatDate(submission.instructor_approved_at)})
                              </span>
                            )}
                          </div>
                        )}

                        {submission.instructor_comment && (
                          <div className="text-sm text-gray-600 mb-2">
                            <span className="font-medium">コメント:</span> {submission.instructor_comment}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <button
                          onClick={() => handleDownload(submission)}
                          className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 transition-colors"
                          disabled={approving || resubmitting}
                        >
                          ダウンロード
                        </button>
                        
                        {!submission.instructor_approved && (
                          <button
                            onClick={() => handleApproveSubmission(submission)}
                            className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 transition-colors"
                            disabled={approving || resubmitting}
                          >
                            {approving ? '承認中...' : '承認'}
                          </button>
                        )}

                        <button
                          onClick={() => handleResubmitSubmission(submission)}
                          className={`px-3 py-1 rounded text-sm transition-colors ${
                            resubmittedIds.has(submission.submission_id)
                              ? 'bg-orange-600 text-white hover:bg-orange-700'
                              : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                          disabled={approving || resubmitting}
                        >
                          {resubmitting ? '処理中...' : resubmittedIds.has(submission.submission_id) ? '課題再提出' : '再提出'}
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* コメント入力欄（未承認の提出物がある場合のみ表示） - 非表示 */}
        {false && !loading && submissions.some(s => !s.instructor_approved) && (
          <div className="mt-4 pt-4 border-t">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              承認コメント（任意）
            </label>
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={3}
              placeholder="承認時のコメントを入力してください..."
            />
          </div>
        )}

        {/* フッター */}
        <div className="mt-4 pt-4 border-t flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600 transition-colors"
            disabled={approving || resubmitting}
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};

export default SubmissionApprovalModal;
