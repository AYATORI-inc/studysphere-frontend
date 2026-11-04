import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const CourseManagement = () => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: '選択科目',
    order_index: 0
  });
  const [isAuthError, setIsAuthError] = useState(false);
  
  // 重複操作防止用のref
  const isProcessingRef = useRef(false);

  // コース一覧取得
  const fetchCourses = async () => {
    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、コース取得をスキップします');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiGet('/api/courses');
      console.log('コース取得レスポンス:', response);
      if (response.success) {
        setCourses(response.data);
      } else {
        setError('コースの取得に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('コースの取得中にエラーが発生しました');
      console.error('Error fetching courses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  // 認証エラーが発生した場合は再取得をスキップ
  useEffect(() => {
    if (isAuthError) {
      console.log('認証エラー状態のため、コンポーネントの再レンダリングをスキップします');
    }
  }, [isAuthError]);

  // フォームデータの更新
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    console.log('フォーム入力変更:', { name, value });
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // コース作成
  const handleCreateCourse = async (e) => {
    e.preventDefault();
    
    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }
    
    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、コース作成をスキップします');
      return;
    }

    // ローディング状態を設定
    setLoading(true);
    setError(null);
    isProcessingRef.current = true;

    try {
      console.log('コース作成リクエスト:', formData);
      const response = await apiPost('/api/courses', formData);
      console.log('コース作成レスポンス:', response);
      
      if (response.success) {
        setShowCreateModal(false);
        setFormData({ title: '', description: '', category: '選択科目', order_index: 0 });
        fetchCourses();
        // 成功メッセージを表示
        alert('コースが正常に作成されました');
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError(response.message || 'コースの作成に失敗しました');
      }
    } catch (err) {
      console.error('コース作成エラー:', err);
      
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError(`コースの作成中にエラーが発生しました: ${err.message}`);
    } finally {
      setLoading(false);
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // コース更新
  const handleUpdateCourse = async (e) => {
    e.preventDefault();
    
    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }
    
    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、コース更新をスキップします');
      return;
    }

    isProcessingRef.current = true;

    try {
      const response = await apiPut(`/api/courses/${selectedCourse.id}`, formData);
      if (response.success) {
        setShowEditModal(false);
        setSelectedCourse(null);
        setFormData({ title: '', description: '', category: '選択科目', order_index: 0 });
        fetchCourses();
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError('コースの更新に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('コースの更新中にエラーが発生しました');
      console.error('Error updating course:', err);
    } finally {
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // コース削除
  const handleDeleteCourse = async (courseId) => {
    if (!window.confirm('このコースを削除しますか？関連するレッスンも削除されます。')) {
      return;
    }

    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }

    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、コース削除をスキップします');
      return;
    }

    // 削除対象のコース情報を取得
    const courseToDelete = courses.find(course => course.id === courseId);
    if (!courseToDelete) {
      setError('削除対象のコースが見つかりません');
      return;
    }

    isProcessingRef.current = true;

    try {
      const response = await apiDelete(`/api/courses/${courseId}`);
      if (response.success) {
        fetchCourses();
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError('コースの削除に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('コースの削除中にエラーが発生しました');
      console.error('Error deleting course:', err);
    } finally {
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // 編集モーダルを開く
  const openEditModal = (course) => {
    setSelectedCourse(course);
    setFormData({
      title: course.title,
      description: course.description || '',
      category: course.category,
      order_index: course.order_index || 0
    });
    setShowEditModal(true);
  };

  // モーダルを閉じる
  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setSelectedCourse(null);
    setFormData({ title: '', description: '', category: '選択科目', order_index: 0 });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent">
            コース管理
          </h1>
          <button
            onClick={() => {
              console.log('新規コース作成モーダルを開きます');
              setShowCreateModal(true);
            }}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            ＋ 新規コース作成
          </button>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
            {error}
          </div>
        )}

        {/* コース一覧 */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">コース名</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">説明</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">カテゴリ</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">レッスン数</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">表示順序</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">操作</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors duration-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{course.title}</td>
                    <td className="px-4 py-3 text-gray-600">{course.description || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        course.category === '必修科目'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {course.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{course.lesson_count || 0}</td>
                    <td className="px-4 py-3 text-gray-600">{course.order_index || 0}</td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(course)}
                          className="px-3 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                          ✏️ 編集
                        </button>
                        <button
                          onClick={() => handleDeleteCourse(course.id)}
                          className="px-3 py-1 bg-gradient-to-r from-red-500 to-red-600 text-white rounded-lg font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                          🗑️ 削除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* 新規作成モーダル */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">新規コース作成</h2>
            <form onSubmit={handleCreateCourse}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                  コース名
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  説明
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                  カテゴリ
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="選択科目">選択科目</option>
                  <option value="必修科目">必修科目</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  表示順序
                </label>
                <input
                  type="number"
                  name="order_index"
                  value={formData.order_index}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 px-4 py-2 rounded-lg font-semibold transition-all duration-200 ${
                    loading 
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed' 
                      : 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white hover:shadow-lg'
                  }`}
                >
                  {loading ? '作成中...' : '作成'}
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && selectedCourse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-2xl font-bold text-gray-800 mb-4">コース編集</h2>
            <form onSubmit={handleUpdateCourse}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                  コース名
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  説明
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  rows="3"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                  カテゴリ
                </label>
                <select
                  name="category"
                  value={formData.category}
                  onChange={handleInputChange}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="選択科目">選択科目</option>
                  <option value="必修科目">必修科目</option>
                </select>
              </div>
              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  表示順序
                </label>
                <input
                  type="number"
                  name="order_index"
                  value={formData.order_index}
                  onChange={handleInputChange}
                  min="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                >
                  更新
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
                >
                  キャンセル
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default CourseManagement; 