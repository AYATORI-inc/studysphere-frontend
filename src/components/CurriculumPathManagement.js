import React, { useState, useEffect, useRef } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '../utils/api';

const CurriculumPathManagement = () => {
  const [curriculumPaths, setCurriculumPaths] = useState([]);
  const [availableCourses, setAvailableCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedPath, setSelectedPath] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isAuthError, setIsAuthError] = useState(false);
  
  // 重複操作防止用のref
  const isProcessingRef = useRef(false);

  // カリキュラムパス一覧取得
  const fetchCurriculumPaths = async () => {
    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、カリキュラムパス取得をスキップします');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await apiGet('/api/curriculum-paths');
      console.log('カリキュラムパス取得レスポンス:', response);
      if (response.success) {
        setCurriculumPaths(response.data);
      } else {
        setError('カリキュラムパスの取得に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('カリキュラムパスの取得中にエラーが発生しました');
      console.error('Error fetching curriculum paths:', err);
    } finally {
      setLoading(false);
    }
  };

  // 利用可能なコース一覧取得
  const fetchAvailableCourses = async () => {
    try {
      const response = await apiGet('/api/curriculum-paths/available-courses');
      if (response.success) {
        setAvailableCourses(response.data);
      }
    } catch (err) {
      console.error('Error fetching available courses:', err);
    }
  };

  // 初期データ取得
  useEffect(() => {
    fetchCurriculumPaths();
    fetchAvailableCourses();
  }, []);

  // コース名を取得
  const getCourseName = (courseId) => {
    const course = availableCourses.find(c => c.id === courseId);
    return course ? course.title : courseId;
  };

  // フィルタリング機能
  const getFilteredPaths = () => {
    let filtered = curriculumPaths;

    if (searchTerm) {
      filtered = filtered.filter(path =>
        path.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        path.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        path.target_audience.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (statusFilter !== 'all') {
      filtered = filtered.filter(path => path.status === statusFilter);
    }

    return filtered;
  };

  // ソート機能を追加
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortedPaths = () => {
    const filtered = getFilteredPaths();
    return [...filtered].sort((a, b) => {
      let aValue = a[sortConfig.key];
      let bValue = b[sortConfig.key];
      
      if (sortConfig.key === 'status') {
        aValue = getStatusLabel(aValue);
        bValue = getStatusLabel(bValue);
      }
      
      if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  };

  // パス編集処理
  const handleEditPath = (path) => {
    console.log('編集対象のパスデータ:', path);
    console.log('パスのコースデータ:', path.courses);
    setSelectedPath(path);
    setShowEditModal(true);
  };

  // パス新規作成処理
  const handleAddPath = async (newPath) => {
    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }

    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、カリキュラムパス作成をスキップします');
      return;
    }

    // デバッグ情報を出力
    console.log('送信するカリキュラムパスデータ:', newPath);
    console.log('コース数:', newPath.courses?.length || 0);

    isProcessingRef.current = true;

    try {
      const response = await apiPost('/api/curriculum-paths', newPath);
      if (response.success) {
        fetchCurriculumPaths();
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError('カリキュラムパスの作成に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('カリキュラムパスの作成中にエラーが発生しました');
      console.error('Error creating curriculum path:', err);
    } finally {
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // パス更新処理
  const handleUpdatePath = async (updatedPath) => {
    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }

    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、カリキュラムパス更新をスキップします');
      return;
    }

    isProcessingRef.current = true;

    try {
      const response = await apiPut(`/api/curriculum-paths/${updatedPath.id}`, updatedPath);
      if (response.success) {
        fetchCurriculumPaths();
        setShowEditModal(false);
        setSelectedPath(null);
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError('カリキュラムパスの更新に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('カリキュラムパスの更新中にエラーが発生しました');
      console.error('Error updating curriculum path:', err);
    } finally {
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // パス削除処理
  const handleDeletePath = async (pathId) => {
    if (!window.confirm('このカリキュラムパスを削除してもよろしいですか？\n※削除すると元に戻せません。')) {
      return;
    }

    // 重複操作防止
    if (isProcessingRef.current) {
      console.log('処理中のため、重複操作をスキップします');
      return;
    }

    // 認証エラーが発生している場合はスキップ
    if (isAuthError) {
      console.log('認証エラーのため、カリキュラムパス削除をスキップします');
      return;
    }

    // 削除対象のパス情報を取得
    const pathToDelete = curriculumPaths.find(path => path.id === pathId);
    if (!pathToDelete) {
      setError('削除対象のカリキュラムパスが見つかりません');
      return;
    }

    isProcessingRef.current = true;

    try {
      const response = await apiDelete(`/api/curriculum-paths/${pathId}`);
      if (response.success) {
        fetchCurriculumPaths();
        // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
      } else {
        setError('カリキュラムパスの削除に失敗しました');
      }
    } catch (err) {
      // 認証エラーの場合
      if (err.message === 'Authentication failed' || err.message === 'Authentication error handling in progress') {
        console.log('認証エラーが発生しました。処理を停止します。');
        setIsAuthError(true);
        setError('認証エラーが発生しました。ログインページにリダイレクトされます。');
        return;
      }
      
      setError('カリキュラムパスの削除中にエラーが発生しました');
      console.error('Error deleting curriculum path:', err);
    } finally {
      // 処理完了後、少し待ってからフラグをリセット（重複操作防止）
      setTimeout(() => {
        isProcessingRef.current = false;
      }, 1000);
    }
  };

  // ステータス表示用の関数
  const getStatusLabel = (status) => {
    switch (status) {
      case 'active': return '公開中';
      case 'inactive': return '非公開';
      case 'draft': return '下書き';
      default: return status;
    }
  };

  // ローディング表示
  if (loading) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">カリキュラムパスを読み込み中...</p>
        </div>
      </div>
    );
  }

  // エラー表示
  if (error) {
    return (
      <div className="p-6 max-w-7xl mx-auto">
        <div className="text-center py-12">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
            <p className="font-bold">エラーが発生しました</p>
            <p>{error}</p>
          </div>
          <button 
            onClick={() => {
              setError(null);
              setIsAuthError(false);
              fetchCurriculumPaths();
            }}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-700"
          >
            再試行
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-800 mb-4">🎯 カリキュラムパス管理</h2>
        <p className="text-gray-600 text-lg">複数のカリキュラムパスを作成・管理し、受講者の学習経路を最適化できます。</p>
      </div>

      {/* フィルターセクション */}
      <div className="bg-gray-50 rounded-xl p-6 mb-6 shadow-sm">
        <div className="mb-4">
          <input
            type="text"
            placeholder="パス名、説明、対象者で検索..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
          />
        </div>

        <div className="flex flex-wrap gap-6 items-end mb-4">
          <div className="flex flex-col min-w-[150px]">
            <label className="font-semibold text-gray-700 mb-2 text-sm">ステータス:</label>
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
            >
              <option value="all">全てのステータス</option>
              <option value="active">公開中</option>
              <option value="inactive">非公開</option>
              <option value="draft">下書き</option>
            </select>
          </div>

          <button 
            className="bg-gray-600 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-700"
            onClick={() => {
              setSearchTerm('');
              setStatusFilter('all');
            }}
          >
            フィルタークリア
          </button>
        </div>

        <div className="font-semibold text-gray-700 text-sm">
          表示中: {getSortedPaths().length}パス / 全{curriculumPaths.length}パス
        </div>
      </div>

      {/* パス一覧テーブル */}
      <div className="bg-white rounded-2xl shadow-xl overflow-x-auto p-6 mb-8 w-full">
        <table className="min-w-full text-sm">
          <thead className="bg-red-50">
            <tr>
              <th 
                className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                onClick={() => handleSort('name')}
              >
                🎯 パス名
                {sortConfig.key === 'name' && (
                  <span className="ml-1">
                    {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              <th 
                className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                onClick={() => handleSort('target_audience')}
              >
                👥 対象者
                {sortConfig.key === 'target_audience' && (
                  <span className="ml-1">
                    {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              <th 
                className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                onClick={() => handleSort('duration')}
              >
                ⏱️ 期間
                {sortConfig.key === 'duration' && (
                  <span className="ml-1">
                    {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              <th 
                className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                onClick={() => handleSort('total_courses')}
              >
                📚 コース数
                {sortConfig.key === 'total_courses' && (
                  <span className="ml-1">
                    {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              <th 
                className="px-6 py-4 text-left text-sm font-semibold text-red-800 cursor-pointer hover:bg-red-100 transition-colors duration-200"
                onClick={() => handleSort('status')}
              >
                📊 ステータス
                {sortConfig.key === 'status' && (
                  <span className="ml-1">
                    {sortConfig.direction === 'asc' ? ' ↑' : ' ↓'}
                  </span>
                )}
              </th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-red-800">📖 コース構成</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-red-800">📅 最終更新</th>
              <th className="px-6 py-4 text-left text-sm font-semibold text-red-800">⚙️ 操作</th>
            </tr>
          </thead>
          <tbody>
            {getSortedPaths().map(path => (
              <tr key={path.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                <td className="px-6 py-4">
                  <div>
                    <strong className="text-gray-800">{path.name}</strong>
                    <div className="text-xs text-gray-500 mt-1 max-w-xs truncate">{path.description}</div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">{path.target_audience}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="text-gray-700 font-medium">{path.duration}</span>
                </td>
                <td className="px-6 py-4">
                  <span className="font-medium text-gray-800">{path.total_courses}コース</span>
                </td>
                <td className="px-6 py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    path.status === 'active' 
                      ? 'bg-green-100 text-green-800'
                      : path.status === 'inactive'
                      ? 'bg-red-100 text-red-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {getStatusLabel(path.status)}
                  </span>
                </td>
                <td className="px-6 py-4">
                  <div className="flex flex-wrap items-center gap-2">
                    {path.courses && path.courses.length > 0 ? (
                      path.courses.map((course, index) => (
                        <div key={course.id} className="flex items-center gap-1">
                          <span className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold">
                            {course.order_index}
                          </span>
                          <span className="text-gray-700 text-sm">{course.course_title}</span>
                          {index < path.courses.length - 1 && (
                            <span className="text-gray-400 text-sm">→</span>
                          )}
                        </div>
                      ))
                    ) : (
                      <span className="text-gray-500 text-sm">コース未設定</span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-gray-600 text-sm">
                  📅 {new Date(path.updated_at).toLocaleDateString('ja-JP')}
                </td>
                <td className="px-6 py-4">
                  <div className="flex gap-2">
                    <button 
                      className="bg-blue-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-blue-600"
                      onClick={() => handleEditPath(path)}
                      title="編集"
                    >
                      ✏️ 編集
                    </button>
                    <button 
                      className="bg-red-500 text-white px-3 py-1 rounded text-sm font-medium transition-colors duration-300 hover:bg-red-600"
                      onClick={() => handleDeletePath(path.id)}
                      title="削除"
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

      {getSortedPaths().length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-500 text-lg">条件に合致するカリキュラムパスが見つかりません。</p>
        </div>
      )}

      <div className="text-center mb-8">
        <button 
          className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-8 py-4 rounded-xl font-medium transition-all duration-300 hover:-translate-y-0.5 shadow-lg hover:shadow-xl"
          onClick={() => setShowAddModal(true)}
        >
          + 新しいカリキュラムパスを作成
        </button>
      </div>

      {/* パス統計サマリー（下部に移動） */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
          <h3 className="text-gray-700 font-semibold mb-4">総パス数</h3>
          <p className="text-3xl font-bold text-indigo-600 mb-2">{curriculumPaths.length}</p>
          <small className="text-gray-500">全カテゴリ</small>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
          <h3 className="text-gray-700 font-semibold mb-4">公開中パス</h3>
          <p className="text-3xl font-bold text-green-600 mb-2">{curriculumPaths.filter(p => p.status === 'active').length}</p>
          <small className="text-gray-500">アクティブ</small>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
          <h3 className="text-gray-700 font-semibold mb-4">平均コース数</h3>
          <p className="text-3xl font-bold text-blue-600 mb-2">
            {curriculumPaths.length > 0 ? Math.round(curriculumPaths.reduce((sum, p) => sum + (p.total_courses || 0), 0) / curriculumPaths.length) : 0}
          </p>
          <small className="text-gray-500">パスあたり</small>
        </div>
        <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200 text-center transition-transform duration-300 hover:-translate-y-1 hover:shadow-lg">
          <h3 className="text-gray-700 font-semibold mb-4">下書きパス</h3>
          <p className="text-3xl font-bold text-purple-600 mb-2">
            {curriculumPaths.filter(p => p.status === 'draft').length}
          </p>
          <small className="text-gray-500">編集中</small>
        </div>
      </div>

      {/* パス新規作成モーダル */}
      {showAddModal && (
        <PathAddModal
          availableCourses={availableCourses}
          onAdd={handleAddPath}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* パス編集モーダル */}
      {showEditModal && selectedPath && (
        <PathEditModal
          path={selectedPath}
          availableCourses={availableCourses}
          onUpdate={handleUpdatePath}
          onClose={() => {
            setShowEditModal(false);
            setSelectedPath(null);
          }}
        />
      )}
    </div>
  );
};

// パス新規作成モーダルコンポーネント
const PathAddModal = ({ availableCourses, onAdd, onClose }) => {
  // コースデータを正しい形式に変換（新規作成時は空配列）
  const convertCoursesData = (courses) => {
    if (!courses || !Array.isArray(courses)) return [];
    
    return courses.map(course => ({
      courseId: course.course_id || course.courseId,
      order: course.order_index || course.order || 1,
      isRequired: course.is_required !== false,
      estimatedDuration: course.estimated_duration || course.estimatedDuration || '3ヶ月'
    }));
  };

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    target_audience: '',
    duration: '',
    status: 'draft',
    courses: convertCoursesData([])
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCourseOrderChange = (index, newOrder) => {
    const updatedCourses = [...formData.courses];
    updatedCourses[index].order = parseInt(newOrder);
    updatedCourses.sort((a, b) => a.order - b.order);
    
    setFormData(prev => ({
      ...prev,
      courses: updatedCourses
    }));
  };

  const handleAddCourse = () => {
    const newCourse = {
      courseId: '',
      order: formData.courses.length + 1,
      isRequired: true,
      estimatedDuration: '3ヶ月'
    };
    
    setFormData(prev => ({
      ...prev,
      courses: [...prev.courses, newCourse]
    }));
  };

  const handleRemoveCourse = (index) => {
    const updatedCourses = formData.courses.filter((_, i) => i !== index);
    // 順序を再調整
    updatedCourses.forEach((course, i) => {
      course.order = i + 1;
    });
    
    setFormData(prev => ({
      ...prev,
      courses: updatedCourses
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const newPath = {
      id: `path${Date.now()}`,
      ...formData,
      totalCourses: formData.courses.length,
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0]
    };
    
    onAdd(newPath);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">カリキュラムパス新規作成</h3>
          <button 
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors duration-200"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">パス名</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">対象者</label>
              <textarea
                name="target_audience"
                value={formData.target_audience}
                onChange={handleInputChange}
                required
                rows={3}
                placeholder="例：Web制作職志望者&#10;デジタルマーケティングに興味がある方&#10;個人事業主・フリーランス志望者"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">説明</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              required
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">期間</label>
              <input
                type="text"
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                required
                placeholder="例: 12ヶ月"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ステータス <span className="text-red-500">*</span></label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              >
                <option value="draft">下書き</option>
                <option value="active">公開中</option>
                <option value="inactive">非公開</option>
              </select>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-800">コース構成</h4>
              <button
                type="button"
                onClick={handleAddCourse}
                className="bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-700"
              >
                + コースを追加
              </button>
            </div>

            {formData.courses.map((course, index) => (
              <div key={index} className="flex items-center gap-4 mb-4 p-4 bg-white rounded-lg border">
                <div className="flex-1">
                  <select
                    value={course.courseId || ''}
                    onChange={(e) => {
                      const updatedCourses = [...formData.courses];
                      updatedCourses[index].courseId = e.target.value;
                      setFormData(prev => ({ ...prev, courses: updatedCourses }));
                    }}
                    required
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  >
                    <option value="">コースを選択</option>
                    {availableCourses.map(c => (
                      <option key={c.id} value={c.id}>{c.title}</option>
                    ))}
                  </select>
                </div>
                <div className="w-20">
                  <input
                    type="number"
                    value={course.order || 1}
                    onChange={(e) => handleCourseOrderChange(index, e.target.value)}
                    min="1"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="w-32">
                  <input
                    type="text"
                    value={course.estimatedDuration || '3ヶ月'}
                    onChange={(e) => {
                      const updatedCourses = [...formData.courses];
                      updatedCourses[index].estimatedDuration = e.target.value;
                      setFormData(prev => ({ ...prev, courses: updatedCourses }));
                    }}
                    placeholder="期間"
                    className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveCourse(index)}
                  className="text-red-600 hover:text-red-800 font-medium"
                >
                  削除
                </button>
              </div>
            ))}
          </div>

          <div className="flex justify-end gap-4">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-50"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-700"
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// パス編集モーダルコンポーネント
const PathEditModal = ({ path, availableCourses, onUpdate, onClose }) => {
  // コースデータを正しい形式に変換
  const convertCoursesData = (courses) => {
    if (!courses || !Array.isArray(courses)) return [];
    
    return courses.map(course => ({
      courseId: course.course_id || course.courseId, // course_id または courseId のどちらかを使用
      order: course.order_index || course.order || 1,
      isRequired: course.is_required !== false,
      estimatedDuration: course.estimated_duration || course.estimatedDuration || '3ヶ月'
    }));
  };

  const convertedCourses = convertCoursesData(path.courses);
  console.log('変換後のコースデータ:', convertedCourses);
  
  const [formData, setFormData] = useState({
    name: path.name,
    description: path.description,
    target_audience: path.target_audience,
    duration: path.duration,
    status: path.status,
    courses: convertedCourses
  });

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  const handleCourseOrderChange = (index, newOrder) => {
    const updatedCourses = [...formData.courses];
    updatedCourses[index].order = parseInt(newOrder);
    updatedCourses.sort((a, b) => a.order - b.order);
    
    setFormData(prev => ({
      ...prev,
      courses: updatedCourses
    }));
  };

  const handleAddCourse = () => {
    const newCourse = {
      courseId: '',
      order: formData.courses.length + 1,
      isRequired: true,
      estimatedDuration: '3ヶ月'
    };
    
    setFormData(prev => ({
      ...prev,
      courses: [...prev.courses, newCourse]
    }));
  };

  const handleRemoveCourse = (index) => {
    const updatedCourses = formData.courses.filter((_, i) => i !== index);
    // 順序を再調整
    updatedCourses.forEach((course, i) => {
      course.order = i + 1;
    });
    
    setFormData(prev => ({
      ...prev,
      courses: updatedCourses
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    const updatedPath = {
      ...path,
      ...formData,
      totalCourses: formData.courses.length,
      updatedAt: new Date().toISOString().split('T')[0]
    };
    
    onUpdate(updatedPath);
    // バックエンドで操作ログが記録されるため、フロントエンドでは記録しない
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-xl font-bold text-gray-800">カリキュラムパス編集: {path.name}</h3>
          <button 
            className="text-gray-400 hover:text-gray-600 text-2xl font-bold transition-colors duration-200"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">パス名</label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">対象者</label>
              <textarea
                name="target_audience"
                value={formData.target_audience}
                onChange={handleInputChange}
                required
                rows={3}
                placeholder="例：Web制作職志望者&#10;デジタルマーケティングに興味がある方&#10;個人事業主・フリーランス志望者"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">説明</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              required
              rows={3}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
            />
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">期間</label>
              <input
                type="text"
                name="duration"
                value={formData.duration}
                onChange={handleInputChange}
                required
                placeholder="例: 12ヶ月"
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              />
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">ステータス <span className="text-red-500">*</span></label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                required
                className="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
              >
                <option value="active">公開中</option>
                <option value="inactive">非公開</option>
                <option value="draft">下書き</option>
              </select>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-6">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-lg font-semibold text-gray-800">コース構成</h4>
              <button
                type="button"
                onClick={handleAddCourse}
                className="bg-indigo-500 text-white px-4 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-600"
              >
                + コースを追加
              </button>
            </div>

            <div className="space-y-4">
              {formData.courses.map((course, index) => (
                <div key={index} className="bg-white rounded-lg p-4 border border-gray-200">
                  <div className="grid md:grid-cols-5 gap-4 items-center">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">順序</label>
                      <input
                        type="number"
                        value={course.order || 1}
                        onChange={(e) => handleCourseOrderChange(index, e.target.value)}
                        min="1"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                      />
                    </div>
                    
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-2">コース</label>
                      <select
                        value={course.courseId || ''}
                        onChange={(e) => {
                          const updatedCourses = [...formData.courses];
                          updatedCourses[index].courseId = e.target.value;
                          setFormData(prev => ({ ...prev, courses: updatedCourses }));
                        }}
                        required
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                      >
                        <option value="">コースを選択</option>
                        {availableCourses.map(c => (
                          <option key={c.id} value={c.id}>
                            {c.title} ({c.category})
                          </option>
                        ))}
                      </select>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">期間</label>
                      <input
                        type="text"
                        value={course.estimatedDuration || '3ヶ月'}
                        onChange={(e) => {
                          const updatedCourses = [...formData.courses];
                          updatedCourses[index].estimatedDuration = e.target.value;
                          setFormData(prev => ({ ...prev, courses: updatedCourses }));
                        }}
                        placeholder="例: 3ヶ月"
                        className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 transition-colors duration-300"
                      />
                    </div>
                    
                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={() => handleRemoveCourse(index)}
                        className="bg-red-500 text-white px-3 py-2 rounded-lg font-medium transition-colors duration-300 hover:bg-red-600"
                      >
                        削除
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              className="flex-1 bg-indigo-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-indigo-600"
            >
              保存
            </button>
            <button
              type="button"
              className="flex-1 bg-gray-500 text-white px-6 py-3 rounded-lg font-medium transition-colors duration-300 hover:bg-gray-600"
              onClick={onClose}
            >
              キャンセル
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CurriculumPathManagement; 