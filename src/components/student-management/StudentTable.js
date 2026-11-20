import React from 'react';
import { isExpired } from '../../utils/dateUtils';

// 一時パスワードの有効期限を日本時間の読みやすい形式に変換
const formatTempPasswordExpiry = (expiryTime) => {
  if (!expiryTime) return '';
  
  try {
    // データベースから取得した時刻をDateオブジェクトに変換
    const date = new Date(expiryTime);
    
    // 日本時間（Asia/Tokyo）でフォーマット
    return date.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'Asia/Tokyo'
    });
  } catch (error) {
    console.error('一時パスワード有効期限のフォーマットエラー:', error);
    return expiryTime; // エラーの場合は元の値を返す
  }
};

const currentLearning = (student) => {
  const hasCurrentCourse = Object.prototype.hasOwnProperty.call(student, 'currentCourse');
  if (hasCurrentCourse) {
    const fromApi = student.currentCourse;
    const apiTitle = fromApi?.title || fromApi?.course_title || '';
    if (!apiTitle) {
      return { title: '', progress: null };
    }
    const progress = student.currentProgress ?? student.current_progress;
    return {
      title: apiTitle,
      progress: progress === undefined || progress === null ? 0 : Number(progress),
    };
  }

  const courses = (student.courses || []).filter((course) => {
    const category = course.category || course.course_category || '';
    return category !== 'カリキュラムパス';
  });
  if (courses.length === 1) {
    return {
      title: courses[0].title || courses[0].course_title || '',
      progress: Number(student.progress || 0),
    };
  }

  return { title: '', progress: null };
};

const StudentTable = ({
  students,
  onIssueTemporaryPassword,
  onToggleStatus,
  onDeleteStudent,
  onViewTestResults,
  onTestApproval,
  onSubmissionApproval,
  onEditStudent,
  showDangerActions = false,
}) => {
  console.log('=== StudentTable レンダリング ===');
  console.log('受け取ったstudents:', students);
  console.log('students.length:', students.length);
  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      <div className="overflow-x-auto" style={{ minWidth: '1200px' }}>
        <table className="w-full table-fixed">
          <thead className="bg-gradient-to-r from-indigo-50 to-purple-50">
            <tr>

              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '200px' }}>利用者名</th>
              <th className="px-2 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '108px' }}>本日有効</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '220px' }}>現在学習コース</th>
              <th className="px-2 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '132px' }}>承認操作</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '180px' }}>進捗状況</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '120px' }}>担当指導員</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '200px' }}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student, index) => (
              <tr key={student.id} id={`student-row-${student.id}`} className={`hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 ${
                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}>

                <td className="px-4 py-3">
                  <div className="min-w-0 space-y-2">
                    <button 
                      className="block text-left font-semibold text-indigo-600 hover:text-indigo-800 transition-colors duration-200 break-words w-full p-0 m-0"
                      onClick={() => onEditStudent && onEditStudent(student)}
                      title="利用者情報を編集"
                    >
                      {student.name}
                    </button>
                    <div className="text-xs text-gray-500 font-mono whitespace-nowrap">
                      {student.login_code}
                    </div>
                  </div>
                </td>
                <td className="px-2 py-3">
                  <div className="space-y-1">
                    {student.temp_password ? (
                      <div className="text-xs">
                        <div className="break-all font-semibold text-blue-600 font-mono">
                          {student.temp_password}
                        </div>
                        <div className="text-gray-500">
                          <div className={student.expires_at && !isExpired(student.expires_at) ? 'text-green-600' : 'text-red-600'}>
                            {student.expires_at && !isExpired(student.expires_at) ? '有効' : '期限切れ'}
                          </div>
                          {student.expires_at && (
                            <div className="break-all text-gray-400">
                              {formatTempPasswordExpiry(student.expires_at)}
                            </div>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <div className="text-gray-400 mb-1">無効</div>
                        <button 
                          className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
                          onClick={() => onIssueTemporaryPassword(student.id)}
                          title="本日有効にする"
                        >
                          有効化
                        </button>
                      </div>
                    )}
                    {student.temp_password && (
                      <button 
                        className="px-2 py-1 bg-gradient-to-r from-orange-500 to-orange-600 text-white text-xs rounded font-medium hover:from-orange-600 hover:to-orange-700 transition-all duration-200"
                        onClick={() => onIssueTemporaryPassword(student.id)}
                        title="一時パスワードを再発行"
                      >
                        再発行
                      </button>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const learning = currentLearning(student);
                    if (!learning.title) {
                      return <span className="text-sm text-gray-400">未設定</span>;
                    }
                    return <span className="text-sm text-gray-800">{learning.title}</span>;
                  })()}
                </td>
                <td className="px-2 py-3">
                  <div className="flex flex-col gap-1">
                    <button
                      className="px-2 py-1 bg-green-600 text-white rounded text-xs font-medium hover:bg-green-700 transition-all duration-200"
                      onClick={() => onTestApproval && onTestApproval(student)}
                      title="テストの合格承認"
                    >
                      ✅ 合格承認
                    </button>
                    <button
                      className="px-2 py-1 bg-purple-600 text-white rounded text-xs font-medium hover:bg-purple-700 transition-all duration-200"
                      onClick={() => onSubmissionApproval && onSubmissionApproval(student)}
                      title="提出物の確認・承認"
                    >
                      📄 提出物確認
                    </button>
                  </div>
                </td>
                <td className="px-4 py-3">
                  {(() => {
                    const learning = currentLearning(student);
                    const progress = learning.progress;
                    const hasProgress = progress !== null && !Number.isNaN(progress);
                    const value = hasProgress ? progress : 0;
                    return (
                  <div className="space-y-2">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          !hasProgress
                            ? 'bg-gray-300'
                            : value >= 75 
                            ? 'bg-gradient-to-r from-green-400 to-green-600' 
                            : value >= 50 
                              ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' 
                              : 'bg-gradient-to-r from-red-400 to-red-600'
                        }`}
                        style={{ width: `${hasProgress ? value : 0}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{hasProgress ? `${value}%` : '—'}</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        !hasProgress
                          ? 'bg-gray-100 text-gray-500'
                          : value >= 75 
                          ? 'bg-green-100 text-green-800' 
                          : value > 0 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {!hasProgress ? '—' : value >= 75 ? '合格' : value > 0 ? '受講中' : '未開始'}
                      </span>
                    </div>
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      student.status === 1 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {student.status === 1 ? '稼働中' : '停止中'}
                    </span>
                  </div>
                    );
                  })()}
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    {student.instructor_name || '未設定'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1">
                    <button
                      className="w-full px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-all duration-200"
                      onClick={() => onEditStudent && onEditStudent(student)}
                    >
                      編集
                    </button>
                    {showDangerActions && (
                      <div className="grid grid-cols-2 gap-1">
                        <button
                          className={`px-2 py-1 rounded text-xs font-medium transition-all duration-200 ${
                            student.status === 1
                              ? 'bg-red-600 text-white hover:bg-red-700'
                              : 'bg-green-600 text-white hover:bg-green-700'
                          }`}
                          onClick={() => onToggleStatus(student.id)}
                        >
                          {student.status === 1 ? '停止' : '再開'}
                        </button>
                        <button
                          className="px-2 py-1 bg-red-600 text-white rounded text-xs font-medium hover:bg-red-700 transition-all duration-200"
                          onClick={() => onDeleteStudent(student.id)}
                        >
                          削除
                        </button>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default StudentTable;
