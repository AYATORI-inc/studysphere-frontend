import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut, apiDelete, apiCall, apiDownloadBinary } from '../utils/api';
import { API_BASE_URL } from '../config/apiConfig';

const LessonManagement = () => {
  const [lessons, setLessons] = useState([]);
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedLesson, setSelectedLesson] = useState(null);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    duration: '120分',
    order_index: 0,
    has_assignment: false,
    course_id: '',
    videos: []
  });
  const [showVideoManagementModal, setShowVideoManagementModal] = useState(false);
  const [selectedLessonForVideos, setSelectedLessonForVideos] = useState(null);
  const [lessonVideos, setLessonVideos] = useState([]);
  const [videoFormData, setVideoFormData] = useState({
    title: '',
    description: '',
    youtube_url: '',
    order_index: 0,
    duration: ''
  });
  const [showVideoFormModal, setShowVideoFormModal] = useState(false);
  const [editingVideo, setEditingVideo] = useState(null);
  const [file, setFile] = useState(null);
  const [showFileListModal, setShowFileListModal] = useState(false);
  const [selectedLessonFiles, setSelectedLessonFiles] = useState(null);
  const [fileListLoading, setFileListLoading] = useState(false);
  const [updateFile, setUpdateFile] = useState(false);
  const [createLessonValidationError, setCreateLessonValidationError] = useState(null);
  
  // 複数テキストファイルアップロード用の状態
  const [additionalTextFiles, setAdditionalTextFiles] = useState([]);
  const [showMultiTextModal, setShowMultiTextModal] = useState(false);
  const [selectedLessonForMultiText, setSelectedLessonForMultiText] = useState(null);
  const [multiTextFiles, setMultiTextFiles] = useState([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  
  // テキストと動画の紐づけ機能用の状態
  const [showTextVideoLinkModal, setShowTextVideoLinkModal] = useState(false);
  const [selectedLessonForLinks, setSelectedLessonForLinks] = useState(null);
  const [textVideoLinks, setTextVideoLinks] = useState([]);
  const [availableVideos, setAvailableVideos] = useState([]);
  const [availableTextFiles, setAvailableTextFiles] = useState([]);
  const [linkFormData, setLinkFormData] = useState({
    text_file_key: '',
    video_id: '',
    link_order: 0
  });
  const [showLinkFormModal, setShowLinkFormModal] = useState(false);
  const [editingLink, setEditingLink] = useState(null);
  
  // 動画視聴モーダル用の状態
  const [showVideoPlayerModal, setShowVideoPlayerModal] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState(null);

  // コース一覧取得
  const fetchCourses = async () => {
    try {
      console.log('LessonManagement: コース一覧取得開始');
      
      // 認証トークンの確認
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      console.log('LessonManagement: 認証トークン確認:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken?.length
      });
      
      let response;
      
      if (!accessToken) {
        console.log('LessonManagement: アクセストークンが存在しないため、テストエンドポイントを使用');
        // 認証なしのテストエンドポイントを使用
        response = await fetch(`/api/test/courses`);
        const data = await response.json();
        response = data;
      } else {
        response = await apiGet('/api/courses');
      }
      
      console.log('LessonManagement: コース取得レスポンス:', response);
      
      if (response.success) {
        console.log('LessonManagement: コース取得成功、データ数:', response.data.length);
        setCourses(response.data);
      } else {
        console.error('LessonManagement: コース取得失敗:', response.message);
        setError('コースの取得に失敗しました: ' + response.message);
      }
    } catch (err) {
      console.error('LessonManagement: コース取得エラー:', err);
      
      // 認証エラーの場合はテストエンドポイントを試行
      if (err.message === 'Authentication failed' || err.message.includes('401') || err.message.includes('403')) {
        console.log('LessonManagement: 認証エラーのため、テストエンドポイントを試行');
        try {
          const testResponse = await fetch(`${API_BASE_URL}/api/test/courses`);
          const testData = await testResponse.json();
          
          if (testData.success) {
            console.log('LessonManagement: テストエンドポイントでコース取得成功');
            setCourses(testData.data);
            return;
          }
        } catch (testErr) {
          console.error('LessonManagement: テストエンドポイントでもエラー:', testErr);
        }
      }
      
      setError('コースの取得中にエラーが発生しました: ' + err.message);
    }
  };

  // レッスン一覧取得
  const fetchLessons = async () => {
    try {
      setLoading(true);
      const queryString = selectedCourseId ? `?courseId=${selectedCourseId}` : '';
      const response = await apiGet(`/api/lessons${queryString}`);
      
      console.log('LessonManagement: レッスン取得レスポンス:', response);
      
      if (response.success) {
        setLessons(response.data);
        setError(null); // エラーをクリア
      } else {
        setError('レッスンの取得に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('レッスンの取得中にエラーが発生しました: ' + err.message);
      console.error('Error fetching lessons:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCourses();
  }, []);

  // コースデータの状態を監視
  useEffect(() => {
    console.log('LessonManagement: コースデータ状態更新:', {
      coursesCount: courses.length,
      courses: courses.map(c => ({ id: c.id, title: c.title }))
    });
  }, [courses]);

  useEffect(() => {
    fetchLessons();
  }, [selectedCourseId]);

  // フォームデータの更新
  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : (value === '' ? null : value)
    }));
  };

  // ファイル選択
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // 複数テキストファイル選択
  const handleMultiTextFileChange = (e) => {
    const files = Array.from(e.target.files);
    setAdditionalTextFiles(prev => [...prev, ...files]);
  };

  // 複数テキストファイル削除
  const handleRemoveMultiTextFile = (index) => {
    setAdditionalTextFiles(prev => prev.filter((_, i) => i !== index));
  };

  // 複数テキストファイルアップロード
  const handleUploadMultiTextFiles = async () => {
    if (additionalTextFiles.length === 0) {
      alert('アップロードするファイルを選択してください');
      return;
    }

    setUploadingFiles(true);
    try {
      const uploadPromises = additionalTextFiles.map(async (file, index) => {
        const formData = new FormData();
        formData.append('file', file);
        // ファイル名を明示的に送信（文字化け対策）
        formData.append('fileName', file.name);
        formData.append('lessonId', selectedLessonForMultiText.id);
        formData.append('order', index);

        const response = await fetch(`${API_BASE_URL}/api/lesson-text-files`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
          },
          body: formData
        });

        if (!response.ok) {
          // エラーレスポンスの詳細を取得
          let errorMessage = `ファイル ${file.name} のアップロードに失敗しました`;
          try {
            const errorData = await response.json();
            if (errorData.message) {
              errorMessage = `${errorMessage}: ${errorData.message}`;
            }
            if (errorData.error && process.env.NODE_ENV === 'development') {
              errorMessage += ` (詳細: ${errorData.error})`;
            }
          } catch (e) {
            // JSONの解析に失敗した場合はデフォルトメッセージを使用
            errorMessage += ` (ステータス: ${response.status})`;
          }
          throw new Error(errorMessage);
        }

        return await response.json();
      });

      await Promise.all(uploadPromises);
      alert('すべてのファイルがアップロードされました');
      setAdditionalTextFiles([]);
      setShowMultiTextModal(false);
      fetchLessons(); // レッスン一覧を更新
    } catch (error) {
      console.error('複数ファイルアップロードエラー:', error);
      alert('ファイルのアップロード中にエラーが発生しました: ' + error.message);
    } finally {
      setUploadingFiles(false);
    }
  };

  // 複数テキストファイル管理モーダルを開く
  const handleOpenMultiTextManagement = async (lesson) => {
    setSelectedLessonForMultiText(lesson);
    setShowMultiTextModal(true);
    await fetchMultiTextFiles(lesson.id);
  };

  // 複数テキストファイル一覧取得
  const fetchMultiTextFiles = async (lessonId) => {
    try {
      const response = await apiGet(`/api/lesson-text-files/lesson/${lessonId}`);
      if (response.success) {
        setMultiTextFiles(response.data);
      }
    } catch (error) {
      console.error('複数テキストファイル取得エラー:', error);
    }
  };

  // 複数テキストファイル削除
  const handleDeleteMultiTextFile = async (fileId) => {
    if (!window.confirm('このファイルを削除しますか？')) return;

    try {
      const response = await apiDelete(`/api/lesson-text-files/${fileId}`);
      if (response.success) {
        alert('ファイルが削除されました');
        await fetchMultiTextFiles(selectedLessonForMultiText.id);
      } else {
        alert('ファイルの削除に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('複数テキストファイル削除エラー:', error);
      alert('ファイルの削除中にエラーが発生しました: ' + error.message);
    }
  };

  // 動画管理モーダルを開く
  const handleOpenVideoManagement = async (lesson) => {
    setSelectedLessonForVideos(lesson);
    setShowVideoManagementModal(true);
    await fetchLessonVideos(lesson.id);
  };

  // 動画視聴モーダルを開く
  const handleOpenVideoPlayer = (video) => {
    setSelectedVideo(video);
    setShowVideoPlayerModal(true);
  };

  // YouTube動画IDを抽出する関数
  const getYouTubeVideoId = (url) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    if (match && match[2].length === 11) {
      return match[2];
    }
    return null;
  };

  // レッスン動画一覧取得
  const fetchLessonVideos = async (lessonId) => {
    try {
      const response = await apiGet(`/api/lesson-videos/lesson/${lessonId}`);
      if (response.success) {
        setLessonVideos(response.data);
      } else {
        setError('動画の取得に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('動画の取得中にエラーが発生しました: ' + err.message);
    }
  };

  // 動画フォーム入力変更ハンドラー
  const handleVideoInputChange = (e) => {
    const { name, value } = e.target;
    setVideoFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 動画作成
  const handleCreateVideo = async (e) => {
    e.preventDefault();
    try {
      const response = await apiPost('/api/lesson-videos', {
        ...videoFormData,
        lesson_id: selectedLessonForVideos.id
      });
      
      if (response.success) {
        await fetchLessonVideos(selectedLessonForVideos.id);
        setShowVideoFormModal(false);
        setVideoFormData({
          title: '',
          description: '',
          youtube_url: '',
          order_index: 0,
          duration: ''
        });
        setEditingVideo(null);
      } else {
        setError('動画の作成に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('動画の作成中にエラーが発生しました: ' + err.message);
    }
  };

  // 動画編集モーダルを開く
  const handleEditVideo = (video) => {
    setEditingVideo(video);
    setVideoFormData({
      title: video.title,
      description: video.description || '',
      youtube_url: video.youtube_url,
      order_index: video.order_index,
      duration: video.duration || ''
    });
    setShowVideoFormModal(true);
  };

  // 動画更新
  const handleUpdateVideo = async (e) => {
    e.preventDefault();
    try {
      const response = await apiPut(`/api/lesson-videos/${editingVideo.id}`, videoFormData);
      
      if (response.success) {
        await fetchLessonVideos(selectedLessonForVideos.id);
        setShowVideoFormModal(false);
        setVideoFormData({
          title: '',
          description: '',
          youtube_url: '',
          order_index: 0,
          duration: ''
        });
        setEditingVideo(null);
      } else {
        setError('動画の更新に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('動画の更新中にエラーが発生しました: ' + err.message);
    }
  };

  // 動画削除
  const handleDeleteVideo = async (videoId) => {
    if (!window.confirm('この動画を削除しますか？')) return;
    
    try {
      const response = await apiDelete(`/api/lesson-videos/${videoId}`);
      
      if (response.success) {
        await fetchLessonVideos(selectedLessonForVideos.id);
      } else {
        setError('動画の削除に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('動画の削除中にエラーが発生しました: ' + err.message);
    }
  };

  // 動画順序更新
  const handleUpdateVideoOrder = async (videos) => {
    try {
      const response = await apiPut('/api/lesson-videos/order', { videos });
      
      if (response.success) {
        await fetchLessonVideos(selectedLessonForVideos.id);
      } else {
        setError('動画の順序更新に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      setError('動画の順序更新中にエラーが発生しました: ' + err.message);
    }
  };

  // レッスン作成
  const handleCreateLesson = async (e) => {
    e.preventDefault();
    setCreateLessonValidationError(null);
    if (!file) {
      setCreateLessonValidationError('テキストファイル（PDF、MD、TXT、RTF）を選択してください。');
      return;
    }
    try {
      const formDataToSend = new FormData();
      Object.keys(formData).forEach(key => {
        const value = formData[key];
        if (key === 'videos') {
          // 動画データはJSON文字列として送信
          formDataToSend.append(key, JSON.stringify(value));
        } else {
          // undefined値をnullに変換
          formDataToSend.append(key, value === undefined ? null : value);
        }
      });
      if (file) {
        formDataToSend.append('file', file);
        // ファイル名を別途送信（文字化け対策）
        formDataToSend.append('fileName', file.name);
      }

      console.log('LessonManagement: レッスン作成開始');
      const response = await apiCall('/api/lessons', {
        method: 'POST',
        body: formDataToSend
      });

      console.log('LessonManagement: レッスン作成レスポンス:', response);

      if (response.success) {
        console.log('LessonManagement: レッスン作成成功');
        
        // テキストと動画の紐づけモーダルが開いている場合は、ファイル一覧を再取得
        if (showTextVideoLinkModal && selectedLessonForLinks) {
          console.log('レッスン作成後、テキストファイル一覧を再取得');
          await fetchAvailableTextFiles(selectedLessonForLinks.id);
        }
        
        closeModals(); // closeModals関数を使用
        setError(null); // エラーをクリア
        await fetchLessons(); // レッスンリストを再取得
        // レッスン操作のログはバックエンド側で記録（重複防止のためフロント側では送信しない）
      } else {
        console.error('LessonManagement: レッスン作成失敗:', response.message);
        setError('レッスンの作成に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      console.error('LessonManagement: レッスン作成エラー:', err);
      let errorMessage = 'レッスンの作成中にエラーが発生しました';
      
      // ファイルアップロードエラーの詳細処理
      if (err.message.includes('許可されていないファイル形式')) {
        errorMessage = 'ファイル形式が正しくありません。PDF、MD、TXT、RTFファイルのみアップロード可能です。';
      } else if (err.message.includes('ファイルサイズが大きすぎます')) {
        errorMessage = 'ファイルサイズが大きすぎます。50MB以下のファイルをアップロードしてください。';
      } else if (err.message.includes('ファイルがアップロードされていません')) {
        errorMessage = 'ファイルが選択されていません。ファイルを選択してから作成してください。';
      } else if (err.message.includes('Authentication failed')) {
        errorMessage = '認証に失敗しました。再度ログインしてください。';
      } else if (err.message.includes('401')) {
        errorMessage = '認証が必要です。再度ログインしてください。';
      } else if (err.message.includes('403')) {
        errorMessage = '管理者権限が必要です。';
      } else if (err.message.includes('500')) {
        // サーバーエラーの詳細を取得
        if (err.response && err.response.data && err.response.data.message) {
          errorMessage = `サーバーエラー: ${err.response.data.message}`;
        } else {
          errorMessage = 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。';
        }
      } else {
        errorMessage += ': ' + err.message;
      }
      
      setError(errorMessage);
    }
  };

  // レッスン更新
  const handleUpdateLesson = async (e) => {
    e.preventDefault();
    try {
      // 認証トークンの確認
      const accessToken = localStorage.getItem('accessToken');
      const refreshToken = localStorage.getItem('refreshToken');
      console.log('LessonManagement: レッスン更新 - 認証トークン確認:', {
        hasAccessToken: !!accessToken,
        hasRefreshToken: !!refreshToken,
        accessTokenLength: accessToken?.length,
        selectedLessonId: selectedLesson?.id
      });

      const formDataToSend = new FormData();

      // ファイル以外はフォームの値をそのまま送信（常に最新値を送る）
      Object.keys(formData).forEach(key => {
        const value = formData[key];
        if (key === 'videos') {
          // 動画データはJSON文字列として送信
          formDataToSend.append(key, JSON.stringify(value));
        } else if (key === 'has_assignment') {
          // has_assignmentはbooleanを明示的に文字列として送信
          formDataToSend.append(key, Boolean(value) ? 'true' : 'false');
        } else {
          formDataToSend.append(key, value === undefined ? null : value);
        }
      });

      // ファイル更新フラグ
      formDataToSend.append('update_file', updateFile ? 'true' : 'false');

      if (updateFile) {
        if (file) {
          // 新しいファイルが選択されている場合
          formDataToSend.append('file', file);
          formDataToSend.append('fileName', file.name);
          formDataToSend.append('remove_file', 'false');
        } else {
          // チェックのみ（ファイル未選択）は既存ファイル削除
          formDataToSend.append('remove_file', 'true');
        }
      } else {
        formDataToSend.append('remove_file', 'false');
      }

      // FormDataの内容をログ出力
      console.log('LessonManagement: 送信するFormDataの内容:');
      for (let [key, value] of formDataToSend.entries()) {
        console.log(`${key}:`, value);
      }

      // 動画データの詳細ログ
      console.log('LessonManagement: 動画データの詳細:', {
        formDataVideos: formData.videos,
        videosLength: formData.videos?.length,
        videosJson: JSON.stringify(formData.videos)
      });

      console.log('LessonManagement: レッスン更新開始');
      const response = await apiCall(`/api/lessons/${selectedLesson.id}`, {
        method: 'PUT',
        body: formDataToSend
      });

      console.log('LessonManagement: レッスン更新レスポンス:', response);

      if (response.success) {
        console.log('LessonManagement: レッスン更新成功');
        
        // テキストと動画の紐づけモーダルが開いている場合は、ファイル一覧を再取得
        if (showTextVideoLinkModal && selectedLessonForLinks) {
          console.log('レッスン更新後、テキストファイル一覧を再取得');
          await fetchAvailableTextFiles(selectedLessonForLinks.id);
        }
        
        closeModals(); // closeModals関数を使用
        setError(null); // エラーをクリア
        await fetchLessons(); // レッスンリストを再取得
        // レッスン操作のログはバックエンド側で記録（重複防止のためフロント側では送信しない）
      } else {
        console.error('LessonManagement: レッスン更新失敗:', response.message);
        setError('レッスンの更新に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      console.error('LessonManagement: レッスン更新エラー:', err);
      let errorMessage = 'レッスンの更新中にエラーが発生しました';
      
      // ファイルアップロードエラーの詳細処理
      if (err.message.includes('許可されていないファイル形式')) {
        errorMessage = 'ファイル形式が正しくありません。PDF、MD、TXT、RTFファイルのみアップロード可能です。';
      } else if (err.message.includes('ファイルサイズが大きすぎます')) {
        errorMessage = 'ファイルサイズが大きすぎます。50MB以下のファイルをアップロードしてください。';
      } else if (err.message.includes('ファイルがアップロードされていません')) {
        errorMessage = 'ファイルが選択されていません。ファイルを選択してから更新してください。';
      } else if (err.message.includes('Authentication failed')) {
        errorMessage = '認証に失敗しました。再度ログインしてください。';
      } else if (err.message.includes('401')) {
        errorMessage = '認証が必要です。再度ログインしてください。';
      } else if (err.message.includes('403')) {
        errorMessage = '管理者権限が必要です。';
      } else if (err.message.includes('404')) {
        errorMessage = 'レッスンが見つかりません。';
      } else if (err.message.includes('500')) {
        // サーバーエラーの詳細を取得
        if (err.response && err.response.data && err.response.data.message) {
          errorMessage = `サーバーエラー: ${err.response.data.message}`;
        } else {
          errorMessage = 'サーバーエラーが発生しました。しばらく時間をおいて再度お試しください。';
        }
      } else {
        errorMessage += ': ' + err.message;
      }
      
      setError(errorMessage);
    }
  };

  // レッスン削除
  const handleDeleteLesson = async (lessonId) => {
    const lesson = lessons.find(l => l.id === lessonId);
    if (!lesson) return;

    const confirmMessage = lesson.s3_key 
      ? `このレッスン「${lesson.title}」を削除しますか？\n\n削除される内容：\n• レッスンデータ\n• ストレージ上のファイル・フォルダ\n\nこの操作は取り消せません。`
      : `このレッスン「${lesson.title}」を削除しますか？\n\nこの操作は取り消せません。`;

    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      console.log('LessonManagement: レッスン削除開始', { lessonId, lessonTitle: lesson.title });
      const response = await apiDelete(`/api/lessons/${lessonId}`);
      
      console.log('LessonManagement: レッスン削除レスポンス:', response);
      
      if (response.success) {
        console.log('LessonManagement: レッスン削除成功');
        setError(null); // エラーをクリア
        await fetchLessons(); // レッスンリストを再取得
        
        // 成功メッセージを表示
        const successMessage = lesson.s3_key 
          ? `レッスン「${lesson.title}」が正常に削除されました。\nストレージ上のファイル・フォルダも削除されました。`
          : `レッスン「${lesson.title}」が正常に削除されました。`;
        
                  alert(successMessage);
          // レッスン操作のログはバックエンド側で記録（重複防止のためフロント側では送信しない）
      } else {
        console.error('LessonManagement: レッスン削除失敗:', response.message);
        setError('レッスンの削除に失敗しました: ' + (response.message || ''));
      }
    } catch (err) {
      console.error('LessonManagement: レッスン削除エラー:', err);
      setError('レッスンの削除中にエラーが発生しました: ' + err.message);
    }
  };

  // フォルダダウンロード（ZIP形式）
  const handleDownloadFolder = async (lessonId) => {
    try {
      const blob = await apiDownloadBinary(`/api/lessons/${lessonId}/download-folder`, {
        method: 'GET'
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `lesson-folder-${lessonId}.zip`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError('フォルダのダウンロードに失敗しました');
      console.error('Error downloading folder:', err);
    }
  };

  const decodeBase64Utf8 = (value) => {
    if (typeof value !== 'string' || value.length === 0) return null;
    try {
      const binary = atob(value);
      let result = '';
      for (let i = 0; i < binary.length; i++) {
        const hex = binary.charCodeAt(i).toString(16).padStart(2, '0');
        result += `%${hex.toUpperCase()}`;
      }
      return decodeURIComponent(result);
    } catch (error) {
      console.warn('Base64デコードに失敗しました', { value, error });
      return null;
    }
  };

  const normalizeTextEncoding = (value) => {
    if (typeof value !== 'string' || value.length === 0) return value;
    try {
      return decodeURIComponent(escape(value));
    } catch (error) {
      return value;
    }
  };

  // ファイル一覧表示
  const handleShowFileList = async (lessonId) => {
    try {
      setFileListLoading(true);
      const response = await apiGet(`/api/lessons/${lessonId}/files`);
      
      console.log('ファイル一覧取得レスポンス:', response);
      
      if (response.success && response.data) {
        // レスポンスデータの構造を確認
        console.log('レスポンスデータの型:', typeof response.data);
        console.log('レスポンスデータの内容:', response.data);
        if (Array.isArray(response.data)) {
          response.data.forEach((file, idx) => {
            console.log(`ファイルメタデータ[${idx}]:`, file);
            if (file?.metadata) {
              console.log(`metadata[${idx}]:`, file.metadata);
            }
            if (file?.metadataRaw) {
              console.log(`metadataRaw[${idx}]:`, file.metadataRaw);
            }
          });
        }
        
        let fileData;
        
        // 配列の場合（直接ファイルリストが返される場合）
        if (Array.isArray(response.data)) {
          console.log('配列形式のデータを検出');
          // 現在のレッスン情報を取得
          const currentLesson = lessons.find(lesson => lesson.id === lessonId);
          if (!currentLesson) {
            setError('レッスン情報が見つかりません');
            return;
          }
          
          fileData = {
            lesson: {
              title: currentLesson.title,
              courseTitle: currentLesson.course_title || '不明なコース'
            },
            files: response.data
          };
        } 
        // オブジェクトの場合（従来の形式）
        else if (response.data.lesson && response.data.files) {
          console.log('オブジェクト形式のデータを検出');
          fileData = response.data;
        } 
        // その他の形式
        else {
          console.error('ファイル一覧データの構造が不正:', response.data);
          setError('ファイル一覧データの形式が正しくありません');
          return;
        }
        
        setSelectedLessonFiles(fileData);
        setShowFileListModal(true);
      } else {
        setError('ファイル一覧の取得に失敗しました: ' + (response.message || '不明なエラー'));
      }
    } catch (err) {
      console.error('ファイル一覧取得エラー:', err);
      setError('ファイル一覧の取得に失敗しました: ' + err.message);
    } finally {
      setFileListLoading(false);
    }
  };

  // 個別ファイルダウンロード
  const handleDownloadIndividualFile = async (file) => {
    try {
      const rawOriginalNameBase64 =
        file?.metadataRaw &&
        typeof file.metadataRaw === 'object' &&
        typeof file.metadataRaw['original-name'] === 'string'
          ? file.metadataRaw['original-name']
          : null;

      const decodedRawOriginalName = rawOriginalNameBase64
        ? decodeBase64Utf8(rawOriginalNameBase64)
        : null;

      const fileKey =
        file?.key ||
        file?.s3_key ||
        file?.s3Key ||
        file?.file_key ||
        file?.fileKey ||
        file?.Key ||
        file?.S3Key ||
        null;

      if (!fileKey) {
        const message = 'ファイルキーが取得できませんでした。';
        console.error(message, { file });
        setError(message);
        return;
      }

      const resolvedFileNameCandidate =
        decodedRawOriginalName ||
        file?.display_name ||
        file?.original_file_name ||
        file?.file_name ||
        file?.name ||
        file?.originalName ||
        (typeof file?.fileName === 'string' ? file.fileName : undefined) ||
        (file?.metadata && typeof file.metadata['original-name'] === 'string'
          ? file.metadata['original-name']
          : undefined) ||
        (fileKey ? fileKey.split('/').pop() : undefined);

      const resolvedFileName = normalizeTextEncoding(
        resolvedFileNameCandidate || 'downloaded-file'
      );

      const blob = await apiDownloadBinary(`/api/lessons/download-file`, {
        method: 'POST',
        body: JSON.stringify({ fileKey }),
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', resolvedFileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading individual file:', err);
      const fallbackMessage =
        err?.message && typeof err.message === 'string'
          ? `ファイルのダウンロードに失敗しました: ${err.message}`
          : 'ファイルのダウンロードに失敗しました';
      setError(fallbackMessage);
    }
  };

  // テキストと動画の紐づけ機能
  const handleOpenTextVideoLinkModal = async (lesson) => {
    setSelectedLessonForLinks(lesson);
    setShowTextVideoLinkModal(true);
    await fetchTextVideoLinks(lesson.id);
    await fetchAvailableVideos(lesson.id);
    await fetchAvailableTextFiles(lesson.id);
  };

  const fetchTextVideoLinks = async (lessonId) => {
    try {
      console.log('fetchTextVideoLinks: 開始', { lessonId });
      const response = await apiGet(`/api/lesson-text-video-links/lesson/${lessonId}`);
      console.log('fetchTextVideoLinks: レスポンス取得成功', response);
      
      if (response.success) {
        setTextVideoLinks(response.data);
      } else {
        console.error('テキストと動画の紐づけ取得失敗:', response.message);
        setError('テキストと動画の紐づけ取得に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('テキストと動画の紐づけ取得エラー:', error);
      
      // エラーの詳細情報をログ出力
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        console.error('ネットワークエラー: バックエンドサーバーに接続できません');
        setError('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else {
        setError('テキストと動画の紐づけ取得中にエラーが発生しました: ' + error.message);
      }
    }
  };

  const fetchAvailableVideos = async (lessonId) => {
    try {
      console.log('fetchAvailableVideos: 開始', { lessonId });
      const response = await apiGet(`/api/lesson-videos/lesson/${lessonId}`);
      console.log('fetchAvailableVideos: レスポンス取得成功', response);
      
      if (response.success) {
        setAvailableVideos(response.data);
      } else {
        console.error('利用可能な動画取得失敗:', response.message);
        setError('動画の取得に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('利用可能な動画取得エラー:', error);
      
      // エラーの詳細情報をログ出力
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        console.error('ネットワークエラー: バックエンドサーバーに接続できません');
        setError('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else {
        setError('動画の取得中にエラーが発生しました: ' + error.message);
      }
    }
  };

  const fetchAvailableTextFiles = async (lessonId) => {
    try {
      console.log('fetchAvailableTextFiles: 開始', { lessonId });
      const response = await apiGet(`/api/lessons/${lessonId}/files`);
      console.log('fetchAvailableTextFiles: レスポンス取得成功', response);
      
      if (response.success) {
        // テキストファイル（PDF、MD、TXT、RTF）をフィルタリング
        const textFiles = response.data.filter(file => {
          const fileName = file.file_name.toLowerCase();
          return file.file_type === 'pdf' || 
                 file.file_type === 'text/plain' ||
                 file.file_type === 'text/markdown' ||
                 file.file_type === 'application/rtf' ||
                 fileName.endsWith('.pdf') ||
                 fileName.endsWith('.md') ||
                 fileName.endsWith('.txt') ||
                 fileName.endsWith('.rtf');
        });
        console.log('fetchAvailableTextFiles: テキストファイル数', textFiles.length);
        setAvailableTextFiles(textFiles);
      } else {
        console.error('利用可能なテキストファイル取得失敗:', response.message);
        setError('テキストファイルの取得に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('利用可能なテキストファイル取得エラー:', error);
      
      // エラーの詳細情報をログ出力
      if (error.name === 'TypeError' && error.message === 'Failed to fetch') {
        console.error('ネットワークエラー: バックエンドサーバーに接続できません');
        setError('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else {
        setError('テキストファイルの取得中にエラーが発生しました: ' + error.message);
      }
    }
  };

  const handleCreateTextVideoLink = async (e) => {
    e.preventDefault();
    try {
      const response = await apiPost('/api/lesson-text-video-links', {
        lesson_id: selectedLessonForLinks.id,
        ...linkFormData
      });
      
      if (response.success) {
        await fetchTextVideoLinks(selectedLessonForLinks.id);
        setShowLinkFormModal(false);
        setLinkFormData({
          text_file_key: '',
          video_id: '',
          link_order: 0
        });
        setEditingLink(null);
      } else {
        setError('テキストと動画の紐づけ作成に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('テキストと動画の紐づけ作成エラー:', error);
      setError('テキストと動画の紐づけ作成中にエラーが発生しました: ' + error.message);
    }
  };

  const handleUpdateTextVideoLink = async (e) => {
    e.preventDefault();
    try {
      const response = await apiPut(`/api/lesson-text-video-links/${editingLink.id}`, {
        ...linkFormData
      });
      
      if (response.success) {
        await fetchTextVideoLinks(selectedLessonForLinks.id);
        setShowLinkFormModal(false);
        setLinkFormData({
          text_file_key: '',
          video_id: '',
          link_order: 0
        });
        setEditingLink(null);
      } else {
        setError('テキストと動画の紐づけ更新に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('テキストと動画の紐づけ更新エラー:', error);
      setError('テキストと動画の紐づけ更新中にエラーが発生しました: ' + error.message);
    }
  };

  const handleDeleteTextVideoLink = async (linkId) => {
    if (!window.confirm('このテキストと動画の紐づけを削除しますか？')) {
      return;
    }

    try {
      const response = await apiDelete(`/api/lesson-text-video-links/${linkId}`);
      
      if (response.success) {
        await fetchTextVideoLinks(selectedLessonForLinks.id);
      } else {
        setError('テキストと動画の紐づけ削除に失敗しました: ' + response.message);
      }
    } catch (error) {
      console.error('テキストと動画の紐づけ削除エラー:', error);
      setError('テキストと動画の紐づけ削除中にエラーが発生しました: ' + error.message);
    }
  };

  const handleEditTextVideoLink = (link) => {
    setEditingLink(link);
    setLinkFormData({
      text_file_key: link.text_file_key,
      video_id: link.video_id,
      link_order: link.link_order
    });
    setShowLinkFormModal(true);
  };

  const handleLinkInputChange = (e) => {
    const { name, value } = e.target;
    setLinkFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // 編集モーダルを開く
  const openEditModal = async (lesson) => {
    try {
      console.log('LessonManagement: レッスン編集モーダルを開く', { lesson });
      setSelectedLesson(lesson);
      
      // レッスンの動画データを取得
      console.log('LessonManagement: 動画データ取得開始', { lessonId: lesson.id });
      const videosResponse = await apiGet(`/api/lesson-videos/lesson/${lesson.id}`);
      console.log('LessonManagement: 動画データ取得レスポンス', { videosResponse });
      
      const videos = videosResponse.success ? videosResponse.data : [];
      console.log('LessonManagement: 設定する動画データ', { videos });
      
      setFormData({
        title: lesson.title,
        description: lesson.description || '',
        duration: lesson.duration || '120分',
        order_index: lesson.order_index || 0,
        has_assignment: Boolean(lesson.has_assignment),
        course_id: lesson.course_id,
        videos: videos
      });
      setFile(null);
      setUpdateFile(false);
      setShowEditModal(true);
    } catch (error) {
      console.error('レッスン編集モーダルを開く際にエラーが発生しました:', error);
      setError('レッスン情報の取得に失敗しました');
    }
  };

  // モーダルを閉じる
  const closeModals = () => {
    setShowCreateModal(false);
    setShowEditModal(false);
    setCreateLessonValidationError(null);
    setShowFileListModal(false);
    setShowVideoManagementModal(false);
    setShowVideoFormModal(false);
    setShowTextVideoLinkModal(false);
    setShowLinkFormModal(false);
    setShowVideoPlayerModal(false);
    setSelectedLesson(null);
    setSelectedLessonFiles(null);
    setSelectedLessonForVideos(null);
    setSelectedLessonForLinks(null);
    setSelectedVideo(null);
    setEditingVideo(null);
    setEditingLink(null);
    setFormData({
      title: '',
      description: '',
      duration: '120分',
      order_index: 0,
      has_assignment: false,
      course_id: '',
      videos: []
    });
    setVideoFormData({
      title: '',
      description: '',
      youtube_url: '',
      order_index: 0,
      duration: ''
    });
    setLinkFormData({
      text_file_key: '',
      video_id: '',
      link_order: 0
    });
    setFile(null);
    setUpdateFile(false);
  };

  // 動画管理機能
  const addVideo = () => {
    setFormData(prev => ({
      ...prev,
      videos: [...prev.videos, {
        title: '',
        description: '',
        youtube_url: '',
        order_index: prev.videos.length,
        duration: ''
      }]
    }));
  };

  const removeVideo = (index) => {
    setFormData(prev => ({
      ...prev,
      videos: prev.videos.filter((_, i) => i !== index)
    }));
  };

  const updateVideo = (index, field, value) => {
    setFormData(prev => ({
      ...prev,
      videos: prev.videos.map((video, i) => 
        i === index ? { ...video, [field]: value } : video
      )
    }));
  };

  const moveVideo = (index, direction) => {
    setFormData(prev => {
      const newVideos = [...prev.videos];
      const newIndex = direction === 'up' ? index - 1 : index + 1;
      
      if (newIndex >= 0 && newIndex < newVideos.length) {
        [newVideos[index], newVideos[newIndex]] = [newVideos[newIndex], newVideos[index]];
        // order_indexも更新
        newVideos[index].order_index = index;
        newVideos[newIndex].order_index = newIndex;
      }
      
      return {
        ...prev,
        videos: newVideos
      };
    });
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
            レッスン管理
          </h1>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
          >
            ＋ 新規レッスン作成
          </button>
        </div>

        {/* エラーメッセージ */}
        {error && (
          <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg shadow-md">
            <div className="flex items-center">
              <svg className="w-5 h-5 mr-2 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">エラーが発生しました</span>
            </div>
            <p className="mt-2 text-sm">{error}</p>
            <button 
              onClick={() => setError(null)}
              className="mt-3 text-sm text-red-600 hover:text-red-800 underline"
            >
              エラーメッセージを閉じる
            </button>
          </div>
        )}

        {/* コースフィルター */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            コースで絞り込み
          </label>
          <select
            value={selectedCourseId}
            onChange={(e) => setSelectedCourseId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">すべてのコース</option>
            {courses.map(course => (
              <option key={course.id} value={course.id}>
                {course.title}
              </option>
            ))}
          </select>
        </div>

        {/* レッスン一覧 */}
        <div className="bg-white rounded-2xl shadow-xl p-6">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-blue-50">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">レッスン名</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">コース</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">説明</th>
                  <th className="px-4 py-3 text-left font-semibold text-blue-800">所要時間</th>
                                     <th className="px-4 py-3 text-left font-semibold text-blue-800">課題</th>
                   <th className="px-4 py-3 text-left font-semibold text-blue-800">ファイル</th>
                   <th className="px-4 py-3 text-left font-semibold text-blue-800">動画</th>
                   <th className="px-4 py-3 text-left font-semibold text-blue-800">操作</th>
                </tr>
              </thead>
              <tbody>
                {lessons.map((lesson) => (
                  <tr key={lesson.id} className="border-b border-gray-100 hover:bg-blue-50 transition-colors duration-200">
                    <td className="px-4 py-3 font-semibold text-gray-800">{lesson.title}</td>
                    <td className="px-4 py-3 text-gray-600">{lesson.course_title}</td>
                    <td className="px-4 py-3 text-gray-600">{lesson.description || '-'}</td>
                    <td className="px-4 py-3 text-gray-600">{lesson.duration}</td>
                                         <td className="px-4 py-3">
                       {lesson.has_assignment ? (
                         <span className="text-green-600 font-medium">あり</span>
                       ) : (
                         <span className="text-gray-400">なし</span>
                       )}
                     </td>
                                           <td className="px-4 py-3">
                        {lesson.s3_key ? (
                          <div className="flex flex-col gap-2">
                            <button
                              onClick={() => handleShowFileList(lesson.id)}
                              className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap text-left px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                            >
                              📋 ファイル一覧
                            </button>
                            <button
                              onClick={() => handleDownloadFolder(lesson.id)}
                              className="text-green-600 hover:text-green-800 font-medium whitespace-nowrap text-left px-2 py-1 rounded hover:bg-green-50 transition-colors"
                            >
                              テキスト一括DL
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400">なし</span>
                        )}
                      </td>
                     <td className="px-4 py-3">
                       <div className="flex flex-col gap-1">
                         <div className="flex flex-col gap-2">
                           <button
                             onClick={() => handleOpenVideoManagement(lesson)}
                             className="text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap text-left px-2 py-1 rounded hover:bg-blue-50 transition-colors"
                           >
                             🎥 動画管理・視聴
                           </button>
                           <button
                             onClick={() => handleOpenTextVideoLinkModal(lesson)}
                             className="text-green-600 hover:text-green-800 font-medium whitespace-nowrap text-left px-2 py-1 rounded hover:bg-green-50 transition-colors"
                           >
                             🔗 テキスト・動画紐づけ
                           </button>
                         </div>
                         <div className="text-xs text-gray-500">
                           {lesson.videos && lesson.videos.length > 0 && (
                             <span>動画数: {lesson.videos.length}個</span>
                           )}
                         </div>
                       </div>
                     </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          onClick={() => openEditModal(lesson)}
                          className="px-3 py-1 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                        >
                          ✏️ 編集
                        </button>
                        <button
                          onClick={() => handleDeleteLesson(lesson.id)}
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
          <div className="bg-white rounded-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">新規レッスン作成</h2>
              <button
                onClick={closeModals}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
                        {/* コンテンツエリア - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
                            <form id="createLessonForm" onSubmit={handleCreateLesson}>
                {/* 2カラムレイアウト */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 左カラム: 基本情報 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        コース
                      </label>
                      <select
                        name="course_id"
                        value={formData.course_id}
                        onChange={handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">コースを選択</option>
                        {courses.length > 0 ? (
                          courses.map(course => (
                            <option key={course.id} value={course.id}>
                              {course.title}
                            </option>
                          ))
                        ) : (
                          <option value="" disabled>
                            コースが読み込まれていません
                          </option>
                        )}
                      </select>
                      {courses.length === 0 && (
                        <p className="text-xs text-red-500 mt-1">
                          コースデータの読み込みに失敗しました。ページを再読み込みしてください。
                        </p>
                      )}
                      <p className="text-xs text-gray-500 mt-1">
                        利用可能なコース数: {courses.length}
                      </p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        レッスン名
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
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        所要時間
                      </label>
                      <input
                        type="text"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
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
                    
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          name="has_assignment"
                          checked={formData.has_assignment}
                          onChange={handleInputChange}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">課題あり</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* 右カラム: 説明とファイル */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        説明
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows="8"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        テキスト（PDF、MD、TXT、RTF）
                      </label>
                      {createLessonValidationError && (
                        <p className="text-sm text-red-600 mb-2">{createLessonValidationError}</p>
                      )}
                      <input
                        type="file"
                        onChange={(e) => { handleFileChange(e); setCreateLessonValidationError(null); }}
                        accept=".pdf,.md,.txt,.rtf"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

               {/* 複数動画管理セクション */}
               <div className="mb-6">
                 <div className="flex justify-between items-center mb-3">
                   <label className="block text-sm font-medium text-gray-700">
                     動画管理
                   </label>
                   <button
                     type="button"
                     onClick={addVideo}
                     className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                   >
                     ＋ 動画追加
                   </button>
                 </div>
                 
                 {formData.videos.length === 0 ? (
                   <div className="text-center py-4 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                     動画が登録されていません
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {formData.videos.map((video, index) => (
                       <div key={index} className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-sm font-medium text-gray-700">動画 {index + 1}</span>
                           <div className="flex gap-1">
                             <button
                               type="button"
                               onClick={() => moveVideo(index, 'up')}
                               disabled={index === 0}
                               className="px-2 py-1 text-xs bg-gray-500 text-white rounded disabled:opacity-50"
                             >
                               ↑
                             </button>
                             <button
                               type="button"
                               onClick={() => moveVideo(index, 'down')}
                               disabled={index === formData.videos.length - 1}
                               className="px-2 py-1 text-xs bg-gray-500 text-white rounded disabled:opacity-50"
                             >
                               ↓
                             </button>
                             <button
                               type="button"
                               onClick={() => removeVideo(index)}
                               className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                             >
                               ×
                             </button>
                           </div>
                         </div>
                         
                         <div className="space-y-2">
                           <input
                             type="text"
                             placeholder="動画タイトル *"
                             value={video.title}
                             onChange={(e) => updateVideo(index, 'title', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <textarea
                             placeholder="動画の説明"
                             value={video.description}
                             onChange={(e) => updateVideo(index, 'description', e.target.value)}
                             rows="2"
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <input
                             type="url"
                             placeholder="YouTube URL *"
                             value={video.youtube_url}
                             onChange={(e) => updateVideo(index, 'youtube_url', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <input
                             type="text"
                             placeholder="動画の長さ（例：15分30秒）"
                             value={video.duration}
                             onChange={(e) => updateVideo(index, 'duration', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>
            </form>
            </div>
            
            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  type="submit"
                  form="createLessonForm"
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                >
                  作成
                </button>
                <button
                  type="button"
                  onClick={closeModals}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 編集モーダル */}
      {showEditModal && selectedLesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">レッスン編集</h2>
              <button
                onClick={closeModals}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* コンテンツエリア - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              <form id="updateLessonForm" onSubmit={handleUpdateLesson}>
                {/* 2カラムレイアウト */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* 左カラム: 基本情報 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-500 mb-2">
                        コース
                      </label>
                      <select
                        name="course_id"
                        value={formData.course_id}
                        disabled
                        required
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-100 text-gray-600 cursor-not-allowed"
                      >
                        {courses.map(course => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </select>
                      <p className="text-xs text-gray-500 mt-1">編集時はコースの変更はできません</p>
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        レッスン名
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
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        所要時間
                      </label>
                      <input
                        type="text"
                        name="duration"
                        value={formData.duration}
                        onChange={handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
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
                    
                    <div>
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          name="has_assignment"
                          checked={formData.has_assignment}
                          onChange={handleInputChange}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">課題あり</span>
                      </label>
                    </div>
                  </div>
                  
                  {/* 右カラム: 説明とファイル */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        説明
                      </label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows="8"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          checked={updateFile}
                          onChange={(e) => setUpdateFile(e.target.checked)}
                          className="mr-2"
                        />
                        <span className="text-sm font-medium text-gray-700">ファイルを更新する</span>
                      </label>
                      {updateFile ? (
                        <>
                          <input
                            type="file"
                            onChange={handleFileChange}
                            accept=".pdf,.md,.txt,.rtf"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                          <p className="text-xs text-gray-500 mt-1">
                            ファイル未選択で更新すると、既存ファイルは削除されます。
                          </p>
                        </>
                      ) : (
                        selectedLesson.s3_key ? (
                          <p className="text-sm text-gray-500 mt-1">
                            現在のファイル: {selectedLesson.s3_key.split('/').pop()}
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 mt-1">現在のファイル: なし</p>
                        )
                      )}
                    </div>
                  </div>
                </div>

               {/* 複数動画管理セクション */}
               <div className="mb-6">
                 <div className="flex justify-between items-center mb-3">
                   <label className="block text-sm font-medium text-gray-700">
                     動画管理
                   </label>
                   <button
                     type="button"
                     onClick={addVideo}
                     className="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600 transition-colors"
                   >
                     ＋ 動画追加
                   </button>
                 </div>
                 
                 {formData.videos.length === 0 ? (
                   <div className="text-center py-4 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                     動画が登録されていません
                   </div>
                 ) : (
                   <div className="space-y-3">
                     {formData.videos.map((video, index) => (
                       <div key={index} className="border border-gray-300 rounded-lg p-3 bg-gray-50">
                         <div className="flex justify-between items-start mb-2">
                           <span className="text-sm font-medium text-gray-700">動画 {index + 1}</span>
                           <div className="flex gap-1">
                             <button
                               type="button"
                               onClick={() => moveVideo(index, 'up')}
                               disabled={index === 0}
                               className="px-2 py-1 text-xs bg-gray-500 text-white rounded disabled:opacity-50"
                             >
                               ↑
                             </button>
                             <button
                               type="button"
                               onClick={() => moveVideo(index, 'down')}
                               disabled={index === formData.videos.length - 1}
                               className="px-2 py-1 text-xs bg-gray-500 text-white rounded disabled:opacity-50"
                             >
                               ↓
                             </button>
                             <button
                               type="button"
                               onClick={() => removeVideo(index)}
                               className="px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600"
                             >
                               ×
                             </button>
                           </div>
                         </div>
                         
                         <div className="space-y-2">
                           <input
                             type="text"
                             placeholder="動画タイトル *"
                             value={video.title}
                             onChange={(e) => updateVideo(index, 'title', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <textarea
                             placeholder="動画の説明"
                             value={video.description}
                             onChange={(e) => updateVideo(index, 'description', e.target.value)}
                             rows="2"
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <input
                             type="url"
                             placeholder="YouTube URL *"
                             value={video.youtube_url}
                             onChange={(e) => updateVideo(index, 'youtube_url', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                           <input
                             type="text"
                             placeholder="動画の長さ（例：15分30秒）"
                             value={video.duration}
                             onChange={(e) => updateVideo(index, 'duration', e.target.value)}
                             className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                           />
                         </div>
                       </div>
                     ))}
                   </div>
                 )}
               </div>

               {/* 複数テキスト管理セクション */}
               <div className="mb-6">
                 <div className="flex justify-between items-center mb-3">
                   <label className="block text-sm font-medium text-gray-700">
                     📄 複数テキスト管理
                   </label>
                   <button
                     type="button"
                     onClick={() => {
                       setSelectedLessonForMultiText(selectedLesson);
                       setShowMultiTextModal(true);
                       fetchMultiTextFiles(selectedLesson.id);
                     }}
                     className="px-3 py-1 bg-purple-500 text-white text-sm rounded hover:bg-purple-600 transition-colors"
                   >
                     📄 テキスト管理
                   </button>
                 </div>
                 
                 <div className="text-center py-4 text-gray-500 border-2 border-dashed border-gray-300 rounded-lg">
                   複数テキストファイルの管理は「テキスト管理」ボタンから行えます
                 </div>
               </div>
            </form>
            </div>
            
            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  type="submit"
                  form="updateLessonForm"
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
            </div>
          </div>
        </div>
      )}

      {/* ファイル一覧モーダル */}
      {showFileListModal && selectedLessonFiles && selectedLessonFiles.lesson && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-bold text-gray-800">
                ファイル一覧 - {selectedLessonFiles.lesson?.title || '不明なレッスン'}
              </h2>
              <button
                onClick={closeModals}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            <div className="mb-4 p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                <strong>コース:</strong> {selectedLessonFiles.lesson?.courseTitle || '不明なコース'}
              </p>
              <p className="text-sm text-blue-800">
                <strong>ファイル数:</strong> {selectedLessonFiles.files?.length || 0}個
              </p>
            </div>

            {fileListLoading ? (
              <div className="text-center py-8">
                <div className="text-blue-600 text-lg">ファイル一覧を読み込み中...</div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800">ファイル名</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800">サイズ</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800">更新日時</th>
                      <th className="px-4 py-3 text-left font-semibold text-gray-800">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLessonFiles.files?.map((file, index) => {
                      const fileKey =
                        file?.key ||
                        file?.s3_key ||
                        file?.s3Key ||
                        file?.file_key ||
                        file?.fileKey ||
                        file?.Key ||
                        file?.S3Key ||
                        null;
                      const displayFileName =
                        normalizeTextEncoding(
                          decodeBase64Utf8(
                            file?.metadataRaw &&
                              typeof file.metadataRaw === 'object' &&
                              typeof file.metadataRaw['original-name'] === 'string'
                              ? file.metadataRaw['original-name']
                              : ''
                          ) ||
                            file?.display_name ||
                            file?.original_file_name ||
                            file?.file_name ||
                            file?.name ||
                            file?.originalName ||
                            (typeof file?.fileName === 'string' ? file.fileName : undefined) ||
                            (file?.metadata && typeof file.metadata['original-name'] === 'string'
                              ? file.metadata['original-name']
                              : undefined) ||
                            (fileKey ? fileKey.split('/').pop() : undefined) ||
                            '不明なファイル'
                        );

                      return (
                        <tr key={index} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {displayFileName}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {file?.sizeFormatted || file?.size || '不明'}
                          </td>
                          <td className="px-4 py-3 text-gray-600">
                            {file?.lastModified ? new Date(file.lastModified).toLocaleString('ja-JP') : '不明'}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleDownloadIndividualFile(file)}
                              className="px-3 py-1 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                            >
                              📥 ダウンロード
                            </button>
                          </td>
                        </tr>
                      );
                    }) || (
                      <tr>
                        <td colSpan="4" className="px-4 py-3 text-center text-gray-500">
                          ファイルが見つかりません
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 flex justify-end">
              <button
                onClick={closeModals}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 動画管理モーダル */}
      {showVideoManagementModal && selectedLessonForVideos && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                動画管理・視聴 - {selectedLessonForVideos.title}
              </h2>
              <button
                onClick={closeModals}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* コンテンツ - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>コース:</strong> {selectedLessonForVideos.course_title}
                </p>
                <p className="text-sm text-blue-800">
                  <strong>動画数:</strong> {lessonVideos.length}個
                </p>
              </div>

              {/* 2カラムレイアウト */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左カラム: 動画視聴セクション */}
                {lessonVideos.length > 0 && (
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="text-lg font-semibold text-gray-800 mb-3">🎬 動画視聴</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {lessonVideos.map((video, index) => (
                        <div key={video.id} className="bg-white p-3 rounded-lg shadow-sm border border-gray-200">
                          <div className="mb-2">
                            <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              動画 {index + 1}
                            </span>
                          </div>
                          <h4 className="font-medium text-gray-800 mb-2 text-sm">{video.title}</h4>
                          {video.description && (
                            <p className="text-xs text-gray-600 mb-2 line-clamp-2">{video.description}</p>
                          )}
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-gray-500">{video.duration || '時間未設定'}</span>
                            <span className="text-xs text-gray-500">順序: {video.order_index}</span>
                          </div>
                          <button
                            onClick={() => handleOpenVideoPlayer(video)}
                            className="block w-full px-2 py-1.5 bg-red-600 text-white text-center rounded hover:bg-red-700 transition-colors text-xs"
                          >
                            🎥 視聴
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 右カラム: 動画管理セクション */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="flex justify-between items-center mb-3">
                    <h3 className="text-lg font-semibold text-gray-800">⚙️ 動画管理</h3>
                    <button
                      onClick={() => setShowVideoFormModal(true)}
                      className="px-3 py-1.5 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200 text-sm"
                    >
                      ＋ 新規動画追加
                    </button>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs">
                      <thead className="bg-white">
                        <tr>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-800">順序</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-800">タイトル</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-800">説明</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-800">長さ</th>
                          <th className="px-2 py-1.5 text-left font-semibold text-gray-800">操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lessonVideos.map((video) => (
                          <tr key={video.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors duration-200 bg-white">
                            <td className="px-2 py-1.5 text-gray-600">{video.order_index}</td>
                            <td className="px-2 py-1.5 font-medium text-gray-800 max-w-[120px] truncate">{video.title}</td>
                            <td className="px-2 py-1.5 text-gray-600 max-w-[100px] truncate">{video.description || '-'}</td>
                            <td className="px-2 py-1.5 text-gray-600">{video.duration || '-'}</td>
                            <td className="px-2 py-1.5">
                              <div className="flex gap-1">
                                <button
                                  onClick={() => handleEditVideo(video)}
                                  className="px-1.5 py-0.5 bg-gradient-to-r from-green-500 to-green-600 text-white rounded text-xs font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
                                >
                                  ✏️ 編集
                                </button>
                                <button
                                  onClick={() => handleDeleteVideo(video.id)}
                                  className="px-1.5 py-0.5 bg-gradient-to-r from-red-500 to-red-600 text-white rounded text-xs font-medium hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
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
            </div>

            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={closeModals}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 動画作成・編集モーダル */}
      {showVideoFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[95vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingVideo ? '動画編集' : '新規動画作成'}
              </h2>
            </div>
            
            {/* コンテンツ - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              <form id={editingVideo ? 'updateVideoForm' : 'createVideoForm'} onSubmit={editingVideo ? handleUpdateVideo : handleCreateVideo}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                    タイトル
                  </label>
                  <input
                    type="text"
                    name="title"
                    value={videoFormData.title}
                    onChange={handleVideoInputChange}
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
                    value={videoFormData.description}
                    onChange={handleVideoInputChange}
                    rows="3"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                    YouTube動画URL
                  </label>
                  <input
                    type="url"
                    name="youtube_url"
                    value={videoFormData.youtube_url}
                    onChange={handleVideoInputChange}
                    required
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    表示順序
                  </label>
                  <input
                    type="number"
                    name="order_index"
                    value={videoFormData.order_index}
                    onChange={handleVideoInputChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    動画の長さ
                  </label>
                  <input
                    type="text"
                    name="duration"
                    value={videoFormData.duration}
                    onChange={handleVideoInputChange}
                    placeholder="例：15分30秒"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </form>
            </div>
            
            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  type="submit"
                  form={editingVideo ? 'updateVideoForm' : 'createVideoForm'}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                >
                  {editingVideo ? '更新' : '作成'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowVideoFormModal(false);
                    setEditingVideo(null);
                    setVideoFormData({
                      title: '',
                      description: '',
                      youtube_url: '',
                      order_index: 0,
                      duration: ''
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* テキストと動画の紐づけ管理モーダル */}
      {showTextVideoLinkModal && selectedLessonForLinks && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-gray-800">
                テキストと動画の紐づけ管理 - {selectedLessonForLinks.title}
              </h2>
              <button
                onClick={() => setShowTextVideoLinkModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-6">
              <button
                onClick={() => setShowLinkFormModal(true)}
                className="px-4 py-2 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
              >
                新しい紐づけを追加
              </button>
            </div>

            <div className="space-y-4">
              {textVideoLinks.length === 0 ? (
                <p className="text-gray-500 text-center py-8">まだ紐づけがありません</p>
              ) : (
                textVideoLinks.map((link, index) => (
                  <div key={link.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-4 mb-2">
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm font-medium">
                            順序: {link.link_order + 1}
                          </span>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">テキストファイル</h4>
                            <p className="text-sm text-gray-600 break-all">{link.text_file_key}</p>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-800 mb-1">動画</h4>
                            <p className="text-sm text-gray-600">{link.video_title}</p>
                            <p className="text-xs text-gray-500">{link.youtube_url}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleEditTextVideoLink(link)}
                          className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
                        >
                          編集
                        </button>
                        <button
                          onClick={() => handleDeleteTextVideoLink(link.id)}
                          className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                        >
                          削除
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* テキストと動画の紐づけ作成・編集モーダル */}
      {showLinkFormModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-lg max-h-[95vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                {editingLink ? 'テキストと動画の紐づけ編集' : '新しいテキストと動画の紐づけ'}
              </h2>
            </div>
            
            {/* コンテンツ - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              <form id={editingLink ? 'updateLinkForm' : 'createLinkForm'} onSubmit={editingLink ? handleUpdateTextVideoLink : handleCreateTextVideoLink}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                    テキストファイル
                  </label>
                  <select
                    name="text_file_key"
                    value={linkFormData.text_file_key}
                    onChange={handleLinkInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">テキストファイルを選択</option>
                    {availableTextFiles.map((file) => (
                      <option key={file.file_name} value={file.file_name}>
                        {file.file_name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                    動画
                  </label>
                  <select
                    name="video_id"
                    value={linkFormData.video_id}
                    onChange={handleLinkInputChange}
                    required
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">動画を選択</option>
                    {availableVideos.map((video) => (
                      <option key={video.id} value={video.id}>
                        {video.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="mb-6">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    表示順序
                  </label>
                  <input
                    type="number"
                    name="link_order"
                    value={linkFormData.link_order}
                    onChange={handleLinkInputChange}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </form>
            </div>
            
            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200">
              <div className="flex gap-3">
                <button
                  type="submit"
                  form={editingLink ? 'updateLinkForm' : 'createLinkForm'}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200"
                >
                  {editingLink ? '更新' : '作成'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLinkFormModal(false);
                    setEditingLink(null);
                    setLinkFormData({
                      text_file_key: '',
                      video_id: '',
                      link_order: 0
                    });
                  }}
                  className="flex-1 px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
                >
                  キャンセル
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 動画視聴モーダル */}
      {showVideoPlayerModal && selectedVideo && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                🎬 動画視聴 - {selectedVideo.title}
              </h2>
              <button
                onClick={() => setShowVideoPlayerModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* コンテンツ - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* 動画情報 */}
              <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                <h3 className="font-semibold text-blue-800 mb-2">{selectedVideo.title}</h3>
                {selectedVideo.description && (
                  <p className="text-sm text-blue-600 mb-2">{selectedVideo.description}</p>
                )}
                <div className="flex gap-4 text-xs text-blue-600">
                  {selectedVideo.duration && (
                    <span>⏱️ {selectedVideo.duration}</span>
                  )}
                  <span>📺 YouTube</span>
                </div>
              </div>

              {/* 動画プレーヤー */}
              <div className="bg-gray-100 rounded-lg overflow-hidden">
                {(() => {
                  const videoId = getYouTubeVideoId(selectedVideo.youtube_url);
                  if (!videoId) {
                    return (
                      <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <div className="text-center">
                          <p className="text-gray-500 mb-4">動画URLが正しくありません</p>
                          <a
                            href={selectedVideo.youtube_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                          >
                            YouTubeで開く
                          </a>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div className="aspect-video bg-gray-100 rounded-lg overflow-hidden">
                      <iframe
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title={selectedVideo.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="w-full h-full border-0"
                      />
                    </div>
                  );
                })()}
              </div>

              {/* 外部リンク */}
              <div className="mt-4 text-center">
                <a
                  href={selectedVideo.youtube_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                >
                  <span>🎥</span>
                  YouTubeで開く
                </a>
              </div>
            </div>

            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowVideoPlayerModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 複数テキストファイル管理モーダル */}
      {showMultiTextModal && selectedLessonForMultiText && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl w-full max-w-[95vw] max-h-[90vh] flex flex-col">
            {/* ヘッダー - 固定 */}
            <div className="flex justify-between items-center p-6 border-b border-gray-200">
              <h2 className="text-2xl font-bold text-gray-800">
                📄 複数テキストファイル管理 - {selectedLessonForMultiText.title}
              </h2>
              <button
                onClick={() => setShowMultiTextModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* コンテンツ - スクロール可能 */}
            <div className="flex-1 overflow-y-auto p-6">
              <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                <p className="text-sm text-purple-800">
                  <strong>コース:</strong> {selectedLessonForMultiText.course_title}
                </p>
                <p className="text-sm text-purple-800">
                  <strong>テキストファイル数:</strong> {multiTextFiles.length}個
                </p>
              </div>

              {/* 2カラムレイアウト */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 左カラム: ファイルアップロードセクション */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">📤 ファイルアップロード</h3>
                  
                  {/* ファイル選択 */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      複数ファイル選択
                    </label>
                    <input
                      type="file"
                      multiple
                      accept=".pdf,.txt,.md,.rtf"
                      onChange={handleMultiTextFileChange}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      PDF、テキスト、Markdown、RTFファイルを選択できます
                    </p>
                  </div>

                  {/* 選択されたファイル一覧 */}
                  {additionalTextFiles.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">選択されたファイル:</h4>
                      <div className="space-y-2">
                        {additionalTextFiles.map((file, index) => (
                          <div key={index} className="flex items-center justify-between bg-white p-2 rounded border">
                            <span className="text-sm text-gray-700 truncate">{file.name}</span>
                            <button
                              onClick={() => handleRemoveMultiTextFile(index)}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* アップロードボタン */}
                  <button
                    onClick={handleUploadMultiTextFiles}
                    disabled={additionalTextFiles.length === 0 || uploadingFiles}
                    className="w-full px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-lg font-semibold hover:shadow-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {uploadingFiles ? 'アップロード中...' : 'ファイルをアップロード'}
                  </button>
                </div>

                {/* 右カラム: ファイル管理セクション */}
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="text-lg font-semibold text-gray-800 mb-3">📋 ファイル一覧</h3>
                  
                  {multiTextFiles.length > 0 ? (
                    <div className="space-y-2">
                      {multiTextFiles.map((file, index) => (
                        <div key={file.id} className="bg-white p-3 rounded-lg border border-gray-200">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-xs">
                                  ファイル {index + 1}
                                </span>
                                <span className="text-xs text-gray-500">
                                  順序: {file.order_index + 1}
                                </span>
                              </div>
                              <h4 className="font-medium text-gray-800 text-sm">{file.file_name}</h4>
                              <p className="text-xs text-gray-500">
                                サイズ: {file.file_size ? `${(file.file_size / 1024).toFixed(1)}KB` : '不明'}
                              </p>
                              <p className="text-xs text-gray-500">
                                タイプ: {file.file_type || '不明'}
                              </p>
                            </div>
                            <div className="flex gap-1 ml-2">
                              <button
                                onClick={() => handleDeleteMultiTextFile(file.id)}
                                className="px-2 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600"
                              >
                                削除
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <p>アップロードされたファイルがありません</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* フッター - 固定 */}
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button
                onClick={() => setShowMultiTextModal(false)}
                className="px-4 py-2 bg-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-400 transition-all duration-200"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LessonManagement; 