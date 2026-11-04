import React, { useState, useEffect } from 'react';
import { getPendingSubmissions } from '../../utils/api';

const PendingSubmissionAlert = ({ satelliteId, onSubmissionClick, onStudentClick }) => {
  const [pendingSubmissions, setPendingSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 未承認の提出物を取得
  const fetchPendingSubmissions = async () => {
    if (!satelliteId) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await getPendingSubmissions(satelliteId);
      if (response.success) {
        setPendingSubmissions(response.data);
      } else {
        setError('未承認提出物の取得に失敗しました');
      }
    } catch (error) {
      console.error('未承認提出物取得エラー:', error);
      setError('未承認提出物の取得中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // コンポーネントマウント時とsatelliteId変更時にデータを取得
  useEffect(() => {
    if (satelliteId) {
      fetchPendingSubmissions();
      
      // 5分間隔で自動更新
      const interval = setInterval(fetchPendingSubmissions, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [satelliteId]);

  // 未承認の提出物がない場合は何も表示しない
  if (!satelliteId || loading || error || pendingSubmissions.length === 0) {
    return null;
  }

  // 利用者ごとにグループ化
  const groupedByStudent = pendingSubmissions.reduce((acc, submission) => {
    const studentId = submission.user_id;
    if (!acc[studentId]) {
      acc[studentId] = {
        student_name: submission.student_name,
        submissions: []
      };
    }
    acc[studentId].submissions.push(submission);
    return acc;
  }, {});

  return (
    <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-3 h-3 bg-orange-500 rounded-full animate-pulse"></div>
        <h3 className="font-semibold text-orange-800">
          未承認の提出物があります
        </h3>
      </div>
      
      <div className="space-y-2">
        {Object.entries(groupedByStudent).map(([studentId, studentData]) => (
          <div key={studentId} className="bg-white rounded-lg p-3 border border-orange-200">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <h4 
                  className="font-medium text-gray-800 mb-1 cursor-pointer hover:text-orange-700 transition-colors"
                  onClick={() => onStudentClick && onStudentClick(studentId)}
                  title="クリックして該当者の行に移動"
                >
                  {studentData.student_name}さん
                </h4>
                <div className="space-y-1">
                  {studentData.submissions.map((submission) => (
                    <div key={submission.submission_id} className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">
                        {submission.lesson_name}の提出物が未承認です
                      </span>
                      <span className="text-orange-600" style={{display: 'none'}}>
                        （{submission.file_name}）
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="mt-3 text-xs text-orange-700">
        💡 利用者名をクリックして該当者の行に移動し、提出物確認ボタンから個別に確認・承認できます
      </div>
    </div>
  );
};

export default PendingSubmissionAlert;
