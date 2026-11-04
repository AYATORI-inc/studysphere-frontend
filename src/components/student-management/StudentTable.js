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

const StudentTable = ({
  students,
  onIssueTemporaryPassword,
  onToggleStatus,
  onDeleteStudent,
  onViewTestResults,
  onTestApproval,
  onSubmissionApproval,
  onEditStudent
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

              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '260px' }}>利用者名</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '120px' }}>担当指導員</th>
                             <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '200px' }}>コース・タグ</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '180px' }}>進捗状況</th>
              <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '120px' }}>パスワード</th>
                             <th className="px-4 py-3 text-left text-sm font-semibold text-indigo-800 border-b border-indigo-200" style={{ width: '200px' }}>操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {students.map((student, index) => (
              <tr key={student.id} id={`student-row-${student.id}`} className={`hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50 transition-all duration-200 ${
                index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
              }`}>

                <td className="px-4 py-3">
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0 space-y-2">
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
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button
                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-medium hover:bg-indigo-700 transition-all duration-200 w-fit"
                        onClick={() => onEditStudent && onEditStudent(student)}
                      >
                        編集
                      </button>
                      <button
                        className="px-2 py-1 bg-gray-600 text-white rounded text-xs font-medium hover:bg-gray-700 transition-all duration-200 w-fit"
                        onClick={async () => {
                          try {
                            if (navigator.clipboard && navigator.clipboard.writeText) {
                              await navigator.clipboard.writeText(student.login_code || '');
                              alert('ログインコードをコピーしました');
                            } else {
                              const textarea = document.createElement('textarea');
                              textarea.value = student.login_code || '';
                              document.body.appendChild(textarea);
                              textarea.select();
                              document.execCommand('copy');
                              document.body.removeChild(textarea);
                              alert('ログインコードをコピーしました');
                            }
                          } catch (e) {
                            console.error('クリップボードコピーに失敗しました', e);
                            alert('コピーに失敗しました');
                          }
                        }}
                      >
                        コピー
                      </button>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="text-sm text-gray-600">
                    {student.instructor_name || '未設定'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    {/* コース情報 */}
                    <div className="flex flex-wrap gap-1">
                      {(() => {
                        // student.coursesからコース情報を取得（バックエンドから返される）
                        const displayCourses = student.courses || [];

                        return (
                          <>
                            {displayCourses.slice(0, 4).map((course, index) => {
                              const courseTitle = course.title || course.course_title || '';
                              const courseCategory = course.category || '';
                              const isCurriculumPath = courseCategory === 'カリキュラムパス';
                              
                              return (
                                <span 
                                  key={index} 
                                  className={`px-2 py-1 text-xs rounded-full font-medium ${
                                    isCurriculumPath 
                                      ? 'bg-blue-100 text-blue-700' 
                                      : 'bg-orange-100 text-orange-700'
                                  }`}
                                  title={`${courseTitle} (${courseCategory})`}
                                >
                                  {courseTitle && courseTitle.length > 12 ? courseTitle.substring(0, 12) + '...' : courseTitle}
                                </span>
                              );
                            })}
                            {displayCourses.length > 4 && (
                              <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                                +{displayCourses.length - 4}
                              </span>
                            )}
                            {displayCourses.length === 0 && (
                              <span className="text-gray-400 text-xs">未割り当て</span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                    {/* タグ情報 */}
                    <div className="flex flex-wrap gap-1">
                      {student.tags && Array.isArray(student.tags) && student.tags.length > 0 ? (
                        student.tags.slice(0, 5).map(tag => (
                          <span key={tag} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full font-medium">
                            {tag.length > 10 ? tag.substring(0, 10) + '...' : tag}
                          </span>
                        ))
                      ) : (
                        <span className="text-gray-400 text-xs">タグなし</span>
                      )}
                      {student.tags && Array.isArray(student.tags) && student.tags.length > 5 && (
                        <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
                          +{student.tags.length - 5}
                        </span>
                      )}
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-2">
                    {/* 進捗バー */}
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          (student.progress || 0) >= 75 
                            ? 'bg-gradient-to-r from-green-400 to-green-600' 
                            : (student.progress || 0) >= 50 
                              ? 'bg-gradient-to-r from-yellow-400 to-yellow-600' 
                              : 'bg-gradient-to-r from-red-400 to-red-600'
                        }`}
                        style={{ width: `${student.progress || 0}%` }}
                      />
                    </div>
                    {/* 進捗情報 */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">{student.progress || 0}%</span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        (student.progress || 0) >= 75 
                          ? 'bg-green-100 text-green-800' 
                          : (student.progress || 0) > 0 
                            ? 'bg-yellow-100 text-yellow-800' 
                            : 'bg-gray-100 text-gray-800'
                      }`}>
                        {(student.progress || 0) >= 75 ? '合格' : (student.progress || 0) > 0 ? '受講中' : '未開始'}
                      </span>
                    </div>
                    {/* 状態 */}
                    <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                      student.status === 1 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {student.status === 1 ? '稼働中' : '停止中'}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {student.temp_password ? (
                      <div className="text-xs">
                        <div className="font-semibold text-blue-600 font-mono">
                          {student.temp_password}
                        </div>
                        <div className="text-gray-500">
                          <div className="flex items-center gap-1">
                            <span className={student.expires_at && !isExpired(student.expires_at) ? 'text-green-600' : 'text-red-600'}>
                              {student.expires_at && !isExpired(student.expires_at) ? '有効' : '期限切れ'}
                            </span>
                            {student.expires_at && (
                              <span className="text-gray-400">
                                ({formatTempPasswordExpiry(student.expires_at)})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-xs">
                        <div className="text-gray-400 mb-1">未発行</div>
                        <button 
                          className="px-2 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white text-xs rounded font-medium hover:from-blue-600 hover:to-blue-700 transition-all duration-200"
                          onClick={() => {
                            console.log(`一時パスワード発行ボタンクリック: ユーザー${student.id} (${student.name})`);
                            onIssueTemporaryPassword(student.id);
                          }}
                          title="一時パスワードを発行"
                        >
                          発行
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
                  <div className="grid grid-cols-2 gap-1">
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
