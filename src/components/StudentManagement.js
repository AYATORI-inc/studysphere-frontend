import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';
import { getSatelliteUsers, getSatelliteInstructors } from '../utils/api';
import { debugAllStorage } from '../utils/debugUtils';
import TempPasswordManager from './student-management/TempPasswordManager';
import StudentEditor from './student-management/StudentEditor';
import CourseManager from './student-management/CourseManager';
import StudentAdder from './student-management/StudentAdder';
import TagManager from './student-management/TagManager';
import CourseAssignmentModal from './student-management/CourseAssignmentModal';
import StudentTable from './student-management/StudentTable';
import TestApprovalModal from './student-management/TestApprovalModal';
import PendingApprovalAlert from './student-management/PendingApprovalAlert';
import SubmissionApprovalModal from './student-management/SubmissionApprovalModal';
import PendingSubmissionAlert from './student-management/PendingSubmissionAlert';
import ModalErrorDisplay from './common/ModalErrorDisplay';

import TodayActiveModal from './student-management/TodayActiveModal';

import { API_BASE_URL } from '../config/apiConfig';

const StudentManagementRefactored = ({ teacherId, onTestApproval, onSubmissionApproval }) => {
  const { currentUser, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  
  // 基本状態管理
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [currentSatelliteId, setCurrentSatelliteId] = useState(null);
  const [currentSatelliteName, setCurrentSatelliteName] = useState('');
  const [error, setError] = useState(null);

  const [instructors, setInstructors] = useState([]);
  
  // フィルター関連のstate
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  
  // タグ管理用の選択状態
  const [selectedStudents, setSelectedStudents] = useState([]);
  
  // 今日の活動メッセージ関連のstate
  const [showTodayActiveModal, setShowTodayActiveModal] = useState(false);

  // 学習コース追加モーダルの状態
  const [showCourseAssignmentModal, setShowCourseAssignmentModal] = useState(false);
  const [showCourseManagerModal, setShowCourseManagerModal] = useState(false);

  // 適職診断管理画面への遷移状態
  const [isLoadingCareerAssessment, setIsLoadingCareerAssessment] = useState(false);


  // 合格承認モーダルの状態
  const [showTestApprovalModal, setShowTestApprovalModal] = useState(false);
  const [selectedStudentForApproval, setSelectedStudentForApproval] = useState(null);

  // 提出物承認モーダルの状態
  const [showSubmissionApprovalModal, setShowSubmissionApprovalModal] = useState(false);
  const [selectedStudentForSubmission, setSelectedStudentForSubmission] = useState(null);

  // 合否確認機能
  const handleViewTestResults = (student) => {
    navigate(`/instructor/student-detail/${student.id}`);
  };

  // 合格承認機能
  const handleTestApprovalInternal = (student) => {
    if (onTestApproval) {
      onTestApproval(student);
    } else {
      setSelectedStudentForApproval(student);
      setShowTestApprovalModal(true);
    }
  };

  // 提出物確認機能
  const handleSubmissionApprovalInternal = (student) => {
    if (onSubmissionApproval) {
      onSubmissionApproval(student);
    } else {
      setSelectedStudentForSubmission(student);
      setShowSubmissionApprovalModal(true);
    }
  };

  // 利用者の行にスクロールする機能
  const scrollToStudent = (studentId) => {
    const element = document.getElementById(`student-row-${studentId}`);
    if (element) {
      element.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'center' 
      });
      // ハイライト効果を追加
      element.style.backgroundColor = '#fef3c7';
      setTimeout(() => {
        element.style.backgroundColor = '';
      }, 2000);
    }
  };

  // 合格承認モーダルを閉じる
  const closeTestApprovalModal = () => {
    setShowTestApprovalModal(false);
    setSelectedStudentForApproval(null);
  };

  // 提出物承認モーダルを閉じる
  const closeSubmissionApprovalModal = () => {
    setShowSubmissionApprovalModal(false);
    setSelectedStudentForSubmission(null);
  };

  // 合格承認成功時の処理
  const handleApprovalSuccess = () => {
    // 利用者データを再取得
    fetchStudents();
  };

  // 適職診断管理画面への遷移
  const handleCareerAssessmentClick = async () => {
    setIsLoadingCareerAssessment(true);
    
    try {
      // アクセストークンを取得
      const accessToken = localStorage.getItem('accessToken');
      
      if (!accessToken) {
        alert('認証トークンが見つかりません。再度ログインしてください。');
        setIsLoadingCareerAssessment(false);
        return;
      }

      // SSOチケット生成APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/sso/ticket/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          target_system: 'findjob',
          source_system: 'studysphere',
          context: 'career_assessment_admin'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'SSOチケットの生成に失敗しました');
      }

      const result = await response.json();
      
      if (!result.success || !result.data?.ticket) {
        throw new Error('SSOチケットの生成に失敗しました');
      }

      // 生成されたチケットを使ってfindjobのauto-loginページにリダイレクト
      const ticket = result.data.ticket;
      const careerAssessmentUrl = `https://findjob.myou-kou.com/auto-login?ticket=${encodeURIComponent(ticket)}`;
      
      // 適職診断管理画面を新しいタブで開く
      window.open(careerAssessmentUrl, '_blank');
      
      // ローディング状態を解除
      setIsLoadingCareerAssessment(false);
      
    } catch (error) {
      console.error('適職診断管理画面への遷移エラー:', error);
      alert(error.message || '適職診断管理画面への遷移に失敗しました。');
      setIsLoadingCareerAssessment(false);
    }
  };



  // 現在の拠点IDを取得
  useEffect(() => {
    console.log('=== StudentManagement 拠点ID取得開始 ===');
    console.log('currentUser:', currentUser);
    console.log('currentUser.role:', currentUser?.role);
    console.log('currentUser.satellite_id:', currentUser?.satellite_id);
    console.log('currentUser.satellite_ids:', currentUser?.satellite_ids);
    console.log('currentUser.satellite_name:', currentUser?.satellite_name);
    
    // デバッグ用：ユーザー情報のログ出力（デバッグエンドポイントは削除）
    if (currentUser && currentUser.id) {
      console.log('=== デバッグ：現在のユーザー情報 ===');
      console.log('ユーザーID:', currentUser.id);
      console.log('ユーザー名:', currentUser.name);
      console.log('ロール:', currentUser.role);
      console.log('会社ID:', currentUser.company_id);
      console.log('satellite_ids:', currentUser.satellite_ids);
      console.log('satellite_id:', currentUser.satellite_id);
    }
    
    // 全ストレージのデバッグ情報を出力
    debugAllStorage();
    
    // セッションストレージの確認
    const selectedSatellite = sessionStorage.getItem('selectedSatellite');
    console.log('セッションストレージのselectedSatellite:', selectedSatellite);
    
    if (selectedSatellite) {
      try {
        const satelliteData = JSON.parse(selectedSatellite);
        console.log('パースされた拠点データ:', satelliteData);
      } catch (error) {
        console.error('拠点情報のパースエラー:', error);
      }
    }
    
    const satelliteId = getCurrentUserSatelliteId(currentUser);
    setCurrentSatelliteId(satelliteId);
    console.log('=== 拠点ID取得 ===');
    console.log('現在の拠点ID:', satelliteId);
    
    // 拠点IDが取得できない場合の詳細デバッグ
    if (!satelliteId) {
      console.log('=== 拠点ID取得失敗の詳細デバッグ ===');
      console.log('currentUser:', currentUser);
      console.log('currentUser.role:', currentUser?.role);
      console.log('currentUser.satellite_id:', currentUser?.satellite_id);
      console.log('currentUser.satellite_ids:', currentUser?.satellite_ids);
      console.log('currentUser.satellite_name:', currentUser?.satellite_name);
      
      // セッションストレージの確認
      const selectedSatellite = sessionStorage.getItem('selectedSatellite');
      console.log('セッションストレージのselectedSatellite:', selectedSatellite);
      
      if (selectedSatellite) {
        try {
          const satelliteData = JSON.parse(selectedSatellite);
          console.log('パースされた拠点データ:', satelliteData);
        } catch (error) {
          console.error('拠点情報のパースエラー:', error);
        }
      }
      
      // localStorageの確認
      const storedUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      console.log('localStorageのcurrentUser:', storedUser);
    }
    
    // 拠点名を取得
    if (satelliteId) {
      // セッションストレージから取得を再試行（getCurrentUserSatelliteIdが更新した可能性があるため）
      const updatedSelectedSatellite = sessionStorage.getItem('selectedSatellite');
      if (updatedSelectedSatellite) {
        try {
          const satelliteData = JSON.parse(updatedSelectedSatellite);
          console.log('パースされた拠点データ:', satelliteData);
          if (satelliteData.name) {
            setCurrentSatelliteName(satelliteData.name);
          } else if (currentUser && currentUser.satellite_name) {
            setCurrentSatelliteName(currentUser.satellite_name);
          } else {
            setCurrentSatelliteName(`拠点${satelliteId}`);
          }
        } catch (error) {
          console.error('拠点情報のパースエラー:', error);
          // パースエラーの場合は、ユーザーデータから取得
          if (currentUser && currentUser.satellite_name) {
            setCurrentSatelliteName(currentUser.satellite_name);
          } else {
            setCurrentSatelliteName(`拠点${satelliteId}`);
          }
        }
      } else {
        // セッションストレージにない場合は、ユーザーデータから取得
        console.log('セッションストレージに拠点情報なし、ユーザーデータから取得');
        if (currentUser && currentUser.satellite_name) {
          console.log('ユーザーデータから拠点名を取得:', currentUser.satellite_name);
          setCurrentSatelliteName(currentUser.satellite_name);
        } else {
          setCurrentSatelliteName(`拠点${satelliteId}`);
        }
      }
    } else {
      console.log('拠点IDが取得できませんでした');
      console.log('currentUser.role:', currentUser?.role);
      console.log('currentUser.satellite_id:', currentUser?.satellite_id);
      console.log('currentUser.satellite_ids:', currentUser?.satellite_ids);
      
      // 複数拠点に所属する指導員の場合、satellite_idsから直接取得を試みる
      if (currentUser && currentUser.satellite_ids) {
        let satelliteIds = currentUser.satellite_ids;
        
        // 既に配列の場合はそのまま使用
        if (Array.isArray(satelliteIds)) {
          // 既に配列なのでそのまま使用
        } else if (typeof satelliteIds === 'string') {
          // 文字列の場合はJSONパースを試行
          try {
            satelliteIds = JSON.parse(satelliteIds);
          } catch (error) {
            console.error('satellite_idsのパースエラー:', error);
            // パースに失敗した場合は、カンマ区切りとして扱う
            if (satelliteIds.includes(',')) {
              satelliteIds = satelliteIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
            } else {
              satelliteIds = [parseInt(satelliteIds)];
            }
          }
        } else {
          // その他の型（数値など）の場合は配列に変換
          satelliteIds = [satelliteIds];
        }
        
        // 配列でない場合は配列に変換（念のため）
        if (!Array.isArray(satelliteIds)) {
          satelliteIds = [satelliteIds];
        }
        // すべてのIDを数値に変換して統一
        satelliteIds = satelliteIds.map(id => parseInt(id)).filter(id => !isNaN(id));
        console.log('正規化後のsatelliteIds:', satelliteIds);
        
        if (satelliteIds.length > 0) {
          // セッションストレージに保存された拠点IDがある場合、それが所属拠点に含まれているか確認
          const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
          let selectedSatelliteId = parseInt(satelliteIds[0]); // デフォルトは最初の拠点
          
          if (sessionSelectedSatellite) {
            try {
              const satelliteData = JSON.parse(sessionSelectedSatellite);
              const sessionSatelliteId = parseInt(satelliteData.id);
              
              // セッションストレージの拠点IDが所属拠点に含まれているか確認
              if (!isNaN(sessionSatelliteId) && satelliteIds.includes(sessionSatelliteId)) {
                selectedSatelliteId = sessionSatelliteId;
                console.log('セッションストレージから有効な拠点IDを取得:', selectedSatelliteId);
              } else {
                console.log('セッションストレージの拠点IDが所属拠点に含まれていません。最初の拠点を使用します。');
                console.log('セッションストレージの拠点ID:', sessionSatelliteId);
                console.log('所属拠点:', satelliteIds);
              }
            } catch (error) {
              console.error('セッションストレージの拠点情報パースエラー:', error);
            }
          }
          
          console.log('最終的に選択された拠点ID:', selectedSatelliteId);
          console.log('この拠点IDが所属拠点に含まれているか:', satelliteIds.includes(selectedSatelliteId));
          
          setCurrentSatelliteId(selectedSatelliteId);
          setCurrentSatelliteName(currentUser?.satellite_name || `拠点${selectedSatelliteId}`);
          
          // sessionStorageにも保存（整合性を確保）
          const selectedSatelliteInfo = {
            id: selectedSatelliteId,
            name: currentUser.satellite_name || `拠点${selectedSatelliteId}`,
            company_id: currentUser.company_id,
            company_name: currentUser.company_name
          };
          sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
          console.log('sessionStorageに拠点情報を保存:', selectedSatelliteInfo);
        }
      }
    }
    
    console.log('=== StudentManagement 拠点ID取得完了 ===');
  }, [currentUser]);

  // 利用者データを取得（拠点フィルタリング付き）
  const fetchStudents = async () => {
    try {
      console.log('=== fetchStudents開始 ===');
      console.log('currentSatelliteId:', currentSatelliteId);
      console.log('currentUser:', currentUser);
      console.log('currentUser.satellite_ids:', currentUser?.satellite_ids);
      console.log('localStorage accessToken:', localStorage.getItem('accessToken') ? '存在' : 'なし');
      setLoading(true);
      setError(null); // エラーをクリア
      
      // 拠点IDが取得できない場合の処理を改善
      if (!currentSatelliteId) {
        console.log('拠点IDが取得できないため、利用者取得をスキップします');
        
        // 複数拠点に所属する指導員の場合の特別なメッセージ
        if (currentUser && currentUser.satellite_ids) {
          let satelliteIds = currentUser.satellite_ids;
          if (typeof satelliteIds === 'string') {
            try {
              satelliteIds = JSON.parse(satelliteIds);
            } catch (e) {
              // JSONパースに失敗した場合は文字列として扱う
            }
          }
          if (Array.isArray(satelliteIds) && satelliteIds.length > 1) {
            setError('複数拠点に所属しています。右上の拠点切り替えボタンから拠点を選択してください。');
          } else {
            setError('拠点IDが取得できません。拠点を選択してください。');
          }
        } else {
          setError('拠点IDが取得できません。拠点を選択してください。');
        }
        setStudents([]);
        return;
      }

      // 拠点に所属する利用者のみを取得
      console.log(`拠点ID ${currentSatelliteId} の利用者を取得します`);
      
      // 認証トークンの確認
      const accessToken = localStorage.getItem('accessToken');
      console.log('認証トークン確認:', {
        hasToken: !!accessToken,
        tokenLength: accessToken ? accessToken.length : 0,
        tokenPreview: accessToken ? accessToken.substring(0, 20) + '...' : 'なし'
      });
      
      console.log('getSatelliteUsers呼び出し前');
      const response = await getSatelliteUsers(currentSatelliteId);
      console.log('getSatelliteUsers呼び出し後:', response);
      console.log('レスポンス詳細:', {
        success: response.success,
        message: response.message,
        hasData: !!response.data,
        dataLength: response.data ? response.data.length : 0
      });
      
      if (response.success) {
        console.log('=== フィルタリング前のデータ ===');
        console.log('全ユーザーデータ:', response.data);
        
        const studentUsers = response.data.filter(user => user.role === 1);
        
        console.log('=== 拠点利用者データ取得デバッグ ===');
        console.log('拠点ID:', currentSatelliteId);
        console.log('全ユーザー数:', response.data.length);
        console.log('利用者数:', studentUsers.length);
        
        // 各利用者のタグとコース情報を確認
        studentUsers.forEach((student, index) => {
          console.log(`利用者${index + 1} (${student.name}):`, {
            id: student.id,
            name: student.name,
            tags: student.tags,
            tagsType: typeof student.tags,
            courses: student.courses,
            coursesType: typeof student.courses,
            temp_password: student.temp_password,
            expires_at: student.expires_at,
            instructor_name: student.instructor_name,
            is_remote_user: student.is_remote_user
          });
        });
        
        console.log('=== フィルタリング後の利用者データ ===');
        console.log('studentUsers:', studentUsers);
        
        setStudents(studentUsers);
      } else {
        console.error('拠点利用者取得に失敗しました:', response.message || '不明なエラー');
        console.error('失敗レスポンスの詳細:', {
          response: response,
          responseType: typeof response,
          responseKeys: Object.keys(response || {}),
          message: response.message,
          success: response.success
        });
        
        // 認証エラーの場合は特別な処理
        if (response.message && response.message.includes('認証')) {
          setError('認証に失敗しました。ログインし直してください。');
        } else {
          const errorMessage = response.message || '不明なエラー';
          setError(`拠点利用者の取得に失敗しました: ${errorMessage}`);
        }
        setStudents([]);
      }
    } catch (error) {
      console.error('利用者データ取得エラー:', error);
      console.error('エラー詳細:', {
        errorMessage: error.message,
        errorName: error.name,
        errorStack: error.stack,
        errorType: typeof error
      });
      
      // 認証エラーの場合は特別な処理
      if (error.message && error.message.includes('Authentication')) {
        setError('認証に失敗しました。ログインし直してください。');
      } else if (error.message && error.message.includes('バックエンドサーバーに接続できません')) {
        setError('バックエンドサーバーに接続できません。サーバーが起動しているか確認してください。');
      } else if (error.message && error.message.includes('拠点IDが無効です')) {
        setError('拠点IDが無効です。拠点を選択し直してください。');
      } else if (error.message && (error.message.includes('アクセス権限') || error.message.includes('Access denied'))) {
        setError('指定された拠点へのアクセス権限がありません。所属している拠点を選択してください。');
      } else if (error.status === 404 || error.message && error.message.includes('404')) {
        setError('指定された拠点が見つかりません。拠点を選択し直してください。');
      } else {
        setError('利用者データの取得中にエラーが発生しました。ページを再読み込みしてください。');
      }
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // 指導員データを取得（現在の拠点に限定）
  const fetchInstructors = async () => {
    try {
      if (!currentSatelliteId) {
        setInstructors([]);
        return;
      }
      const response = await getSatelliteInstructors(currentSatelliteId);
      // 期待形: { success: true, data: [...] }
      const list = response?.data || response?.data?.users || [];
      setInstructors(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('指導員データ取得エラー:', error);
      setInstructors([]);
    }
  };

  // 子コンポーネントのフックを使用
  const tempPasswordManager = TempPasswordManager({ 
    students, 
    onStudentsUpdate: (updatedStudents) => {
      setStudents(updatedStudents);
      // 一時パスワード発行後、サーバーから最新データを再取得
      setTimeout(() => {
        console.log('一時パスワード発行後、データを再取得します');
        fetchStudents();
      }, 1000);
    }
  });

  const studentEditor = StudentEditor({ 
    student: null, 
    onUpdate: fetchStudents, 
    onClose: () => {}, 
    instructors 
  });

  // CourseManagerが利用可能かチェック
  const isCourseManagerReady = currentSatelliteId;

  const studentAdder = StudentAdder({ 
    onStudentAdded: fetchStudents, 
    instructors 
  });

  const tagManager = TagManager({ 
    students, 
    onStudentsUpdate: fetchStudents 
  });

  // 利用者削除
  const deleteStudent = async (studentId) => {
    if (!window.confirm('この利用者を削除しますか？')) {
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/${studentId}`, {
        method: 'DELETE'
      });

      if (response.ok) {
        alert('利用者が削除されました');
        fetchStudents();
      } else {
        alert('利用者削除に失敗しました');
      }
    } catch (error) {
      console.error('利用者削除エラー:', error);
      alert('利用者削除に失敗しました');
    }
  };

  // 利用者ステータス切り替え
  const toggleStudentStatus = async (studentId) => {
    try {
      const student = students.find(s => s.id === studentId);
      const newStatus = student.status === 1 ? 0 : 1;
      
      const response = await fetch(`${API_BASE_URL}/api/users/${studentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus })
      });

      if (response.ok) {
        alert(`利用者のステータスが${newStatus === 1 ? '稼働中' : '停止中'}に変更されました`);
        fetchStudents();
      } else {
        alert('ステータス変更に失敗しました');
      }
    } catch (error) {
      console.error('ステータス変更エラー:', error);
      alert('ステータス変更に失敗しました');
    }
  };


  // フィルター機能
  const getFilteredStudents = () => {
    return students.filter(student => {
      // 検索フィルター
      const matchesSearch = !searchTerm || 
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.login_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.instructor_name && student.instructor_name.toLowerCase().includes(searchTerm.toLowerCase()));

      // ステータスフィルター
      const matchesStatus = statusFilter === 'all' || student.status.toString() === statusFilter;

      // タグフィルター
      const matchesTags = selectedTags.length === 0 || 
        selectedTags.some(tag => student.tags && student.tags.includes(tag));

      return matchesSearch && matchesStatus && matchesTags;
    });
  };

  // 全てのフィルターをクリア
  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTags([]);
    setStatusFilter('all');
  };

  // タグの選択/解除
  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };



  // コース更新時の処理
  const handleCoursesUpdated = () => {
    console.log('=== コース更新処理開始 ===');
    
    fetchStudents(); // 利用者データも更新
    console.log('=== コース更新処理完了 ===');
  };

  useEffect(() => {
    fetchStudents();
    fetchInstructors();
  }, [currentSatelliteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-xl text-gray-600">読み込み中...</div>
        </div>
      </div>
    );
  }

  // 拠点が選択されていない場合のメッセージ
  if (!currentSatelliteId) {
    // 複数拠点に所属する指導員かどうかを確認
    let isMultiSatellite = false;
    let satelliteIds = [];
    if (currentUser && currentUser.satellite_ids) {
      let ids = currentUser.satellite_ids;
      if (typeof ids === 'string') {
        try {
          ids = JSON.parse(ids);
        } catch (e) {
          // JSONパースに失敗した場合は文字列として扱う
          if (ids.includes(',')) {
            ids = ids.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
          } else {
            ids = [parseInt(ids)];
          }
        }
      }
      if (Array.isArray(ids) && ids.length > 1) {
        isMultiSatellite = true;
        satelliteIds = ids.filter(id => id !== null && id !== undefined);
      }
    }
    
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <div className="text-center">
              <div className="text-6xl mb-4">📍</div>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">拠点が選択されていません</h2>
              <p className="text-gray-600 mb-6">
                利用者一覧を表示するには、まず拠点を選択してください。
              </p>
              {isMultiSatellite ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-800 text-sm font-medium mb-2">
                    💡 複数拠点に所属しています
                  </p>
                  <p className="text-blue-700 text-sm">
                    あなたは {satelliteIds.length} つの拠点に所属しています。
                    <br />
                    右上の拠点切り替えボタンから、表示したい拠点を選択してください。
                  </p>
                </div>
              ) : (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                  <p className="text-yellow-800 text-sm">
                    💡 ヒント: 右上の拠点切り替えボタンから拠点を選択してください。
                  </p>
                </div>
              )}
              {currentUser && currentUser.role >= 6 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                  <p className="text-blue-800 text-sm">
                    🔧 管理者向け: ログイン時に選択した拠点情報が正しく保存されていない可能性があります。
                    <br />
                    解決方法: ログアウトして再度ログインしてください。
                  </p>
                </div>
              )}
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 mr-4"
              >
                🔄 ページを再読み込み
              </button>
              <button 
                onClick={() => window.location.href = '/instructor/dashboard'}
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                🏠 ダッシュボードに戻る
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // エラーが発生した場合のメッセージ
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <div className="text-center">
              <div className="text-6xl mb-4">⚠️</div>
              <h2 className="text-2xl font-bold text-red-800 mb-4">エラーが発生しました</h2>
              <p className="text-gray-600 mb-6">
                {error}
              </p>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-red-800 text-sm">
                  💡 解決方法: ページを再読み込みするか、管理者に連絡してください。
                </p>
              </div>
              <button 
                onClick={() => window.location.reload()}
                className="px-6 py-3 bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              >
                🔄 ページを再読み込み
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const filteredStudents = getFilteredStudents();

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex-1">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
                👥 利用者一覧
              </h2>
              <div className="flex items-center gap-2 text-gray-600">
                <span className="text-lg">📍</span>
                <div>
                                     <p className="font-medium">指導員ダッシュボード</p>
                   <p className="text-sm text-gray-500">※利用者の管理と一時パスワード発行を行います</p>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <button 
                className="px-6 py-3 bg-gradient-to-r from-purple-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                onClick={() => tagManager.setShowTagModal(true)}
              >
                🏷️ タグ一括追加
              </button>
                             <button 
                 className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                 onClick={() => setShowTodayActiveModal(true)}
               >
                 🔑 本日有効
               </button>
              <button 
                className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                onClick={() => setShowCourseAssignmentModal(true)}
              >
                📚 学習コース追加
              </button>
              <button 
                className="px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
                onClick={() => {
                  studentAdder.setShowAddForm(true);
                  studentAdder.setBulkInputText('');
                  studentAdder.setBulkInstructorId('');
                }}
              >
                + 新しい利用者を追加
              </button>
              <button 
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleCareerAssessmentClick}
                disabled={isLoadingCareerAssessment}
              >
                {isLoadingCareerAssessment ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    読み込み中...
                  </>
                ) : (
                  <>
                    🎯 適職診断管理
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* 1. テスト未承認アラート */}
        {currentSatelliteId && (
          <PendingApprovalAlert 
            satelliteId={currentSatelliteId}
            onApprovalClick={(studentId) => {
              const student = students.find(s => s.id === parseInt(studentId));
              if (student) {
                handleTestApprovalInternal(student);
              }
            }}
            onStudentClick={scrollToStudent}
          />
        )}

        {/* 2. 提出物未承認アラート */}
        {currentSatelliteId && (
          <PendingSubmissionAlert 
            satelliteId={currentSatelliteId}
            onSubmissionClick={(studentId) => {
              const student = students.find(s => s.id === studentId);
              if (student) {
                handleSubmissionApprovalInternal(student);
              }
            }}
            onStudentClick={scrollToStudent}
          />
        )}

        {/* 4. フィルター部分 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
          <div className="space-y-6">
            {/* トップフィルター */}
            <div className="flex flex-col lg:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="利用者名、ログインコード、指導員名で検索..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                  />
                  <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
                </div>
              </div>
              <div className="flex gap-3">
                <select 
                  value={statusFilter} 
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                >
                  <option value="all">全てのステータス</option>
                  <option value="1">稼働中</option>
                  <option value="0">停止中</option>
                </select>
                <button 
                  className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
                  onClick={clearFilters}
                >
                  クリア
                </button>
              </div>
            </div>

            {/* タグフィルター */}
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-3">タグフィルター:</label>
              <div className="flex flex-wrap gap-2">
                {tagManager.getAllTags().map(tag => (
                  <button
                    key={tag}
                    className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 transform hover:scale-105 ${
                      selectedTags.includes(tag) 
                        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>

            {/* フィルターサマリー */}
            <div className="flex items-center justify-between p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl border border-indigo-100">
              <div className="flex items-center gap-2">
                <span className="text-lg">📊</span>
                <span className="font-semibold text-gray-700">
                  表示中: {filteredStudents.length}名 / 全{students.length}名
                </span>
              </div>
              {selectedTags.length > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">選択中のタグ:</span>
                  <div className="flex gap-1">
                    {selectedTags.map(tag => (
                      <span key={tag} className="px-2 py-1 bg-indigo-100 text-indigo-700 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 利用者一覧 */}
        <div className="mb-8">
          <StudentTable
            students={filteredStudents}
            onIssueTemporaryPassword={tempPasswordManager.issueTemporaryPassword}
            onToggleStatus={toggleStudentStatus}
            onDeleteStudent={deleteStudent}
            onViewTestResults={handleViewTestResults}
            onTestApproval={handleTestApprovalInternal}
            onSubmissionApproval={handleSubmissionApprovalInternal}
            onEditStudent={(student) => studentEditor.openEditModal(student)}
          />
        </div>

        {/* モーダル類 */}
        {/* タグ一括追加モーダル */}
        {tagManager.showTagModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-gray-800">🏷️ タグ一括追加</h3>
                  <button 
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
                    onClick={tagManager.resetModal}
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <div className="flex">
                {/* 左側：利用者選択エリア */}
                <div className="w-1/2 p-6 border-r border-gray-200">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">利用者選択</h4>
                  
                  {/* 検索フィルター */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">検索</label>
                    <input
                      type="text"
                      value={tagManager.searchTerm}
                      onChange={(e) => tagManager.setSearchTerm(e.target.value)}
                      placeholder="利用者名、ログインコード、指導員名で検索..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  {/* タグフィルター */}
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">タグフィルター</label>
                    <div className="flex flex-wrap gap-2">
                      {tagManager.getAllTags().map((tag, index) => (
                        <button
                          key={index}
                          onClick={() => tagManager.toggleTagFilter(tag)}
                          className={`px-2 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                            tagManager.selectedTags.includes(tag)
                              ? 'bg-green-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 全選択ボタン */}
                  <div className="mb-4">
                    <button
                      onClick={tagManager.toggleAllStudents}
                      className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200 text-sm"
                    >
                      {tagManager.selectedStudents.length === tagManager.getFilteredStudents().length 
                        ? '全選択解除' 
                        : '全選択'}
                    </button>
                    <span className="ml-2 text-sm text-gray-600">
                      {tagManager.selectedStudents.length} / {tagManager.getFilteredStudents().length} 選択中
                    </span>
                  </div>

                  {/* 利用者リスト */}
                  <div className="max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                    {tagManager.getFilteredStudents().length === 0 ? (
                      <div className="p-4 text-center text-gray-500">
                        条件に一致する利用者がいません
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-200">
                        {tagManager.getFilteredStudents().map((student) => (
                          <div
                            key={student.id}
                            className={`p-3 hover:bg-gray-50 cursor-pointer transition-colors ${
                              tagManager.selectedStudents.includes(student.id) ? 'bg-blue-50' : ''
                            }`}
                            onClick={() => tagManager.toggleStudentSelection(student.id)}
                          >
                            <div className="flex items-center">
                              <input
                                type="checkbox"
                                checked={tagManager.selectedStudents.includes(student.id)}
                                onChange={() => tagManager.toggleStudentSelection(student.id)}
                                className="mr-3 rounded border-gray-300"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{student.name}</div>
                                <div className="text-sm text-gray-500">{student.login_code}</div>
                                {student.instructor_name && (
                                  <div className="text-xs text-gray-400">指導員: {student.instructor_name}</div>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-1 max-w-32">
                                {student.tags && student.tags.slice(0, 2).map((tag, index) => (
                                  <span
                                    key={index}
                                    className="px-1 py-0.5 bg-gray-100 text-gray-600 text-xs rounded truncate"
                                    title={tag}
                                  >
                                    {tag}
                                  </span>
                                ))}
                                {student.tags && student.tags.length > 2 && (
                                  <span className="text-xs text-gray-400">+{student.tags.length - 2}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* 右側：タグ選択エリア */}
                <div className="w-1/2 p-6">
                  <h4 className="text-lg font-semibold text-gray-800 mb-4">追加するタグ</h4>
                  
                                     <div className="mb-6">
                     <label className="block text-sm font-medium text-gray-700 mb-2">
                       タグ例
                     </label>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {tagManager.customTags.map((tag, index) => (
                        <button
                          key={index}
                          onClick={() => tagManager.toggleTag(tag)}
                          className={`px-3 py-1 rounded-full text-sm font-medium transition-all duration-200 ${
                            tagManager.tagsToAdd.includes(tag)
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                          }`}
                        >
                          {tag}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={tagManager.newTagName}
                        onChange={(e) => tagManager.setNewTagName(e.target.value)}
                        placeholder="新しいタグ名を入力"
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <button
                        onClick={tagManager.addNewTag}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-all duration-200"
                      >
                        追加
                      </button>
                    </div>
                  </div>

                  {/* 選択されたタグの表示 */}
                  {tagManager.tagsToAdd.length > 0 && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        追加予定のタグ ({tagManager.tagsToAdd.length}個)
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {tagManager.tagsToAdd.map((tag, index) => (
                          <span
                            key={index}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm font-medium"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 選択された利用者の表示 */}
                  {tagManager.selectedStudents.length > 0 && (
                    <div className="mb-6">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        選択された利用者 ({tagManager.selectedStudents.length}名)
                      </label>
                      <div className="max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                        {tagManager.selectedStudents.map((studentId) => {
                          const student = students.find(s => s.id === studentId);
                          return student ? (
                            <div key={studentId} className="text-sm text-gray-700 py-1">
                              {student.name} ({student.login_code})
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* フッター */}
              <div className="p-6 border-t border-gray-200 bg-gray-50">
                <div className="flex justify-between items-center">
                  <div className="text-sm text-gray-600">
                    {tagManager.selectedStudents.length > 0 && tagManager.tagsToAdd.length > 0 && (
                      <span>
                        {tagManager.selectedStudents.length}名の利用者に{tagManager.tagsToAdd.length}個のタグを追加します
                      </span>
                    )}
                  </div>
                  <div className="flex gap-4">
                    <button
                      onClick={tagManager.resetModal}
                      className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200"
                    >
                      キャンセル
                    </button>
                    <button
                      onClick={tagManager.handleBulkAddTags}
                      disabled={tagManager.selectedStudents.length === 0 || tagManager.tagsToAdd.length === 0}
                      className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-200"
                    >
                      タグを追加 ({tagManager.selectedStudents.length}名)
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

                 {/* 本日有効・一括利用設定モーダル */}
         <TodayActiveModal
           isOpen={showTodayActiveModal}
           onClose={() => setShowTodayActiveModal(false)}
           students={students}
           selectedStudents={selectedStudents}
           onStudentsUpdate={fetchStudents}
           onSelectStudents={setSelectedStudents}
         />

        {/* 学習コース追加モーダル */}
        <CourseAssignmentModal
          isOpen={showCourseAssignmentModal}
          onClose={() => setShowCourseAssignmentModal(false)}
          students={students}
          instructors={instructors}
          onCoursesUpdated={handleCoursesUpdated}
        />

        {/* 利用者追加モーダル */}
        {studentAdder.showAddForm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-gray-800">新しい利用者を追加</h3>
                  <button 
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
                    onClick={() => {
                      studentAdder.setShowAddForm(false);
                      studentAdder.setBulkInputMode(false);
                      studentAdder.setBulkInputText('');
                      studentAdder.setBulkInstructorId('');
                      studentAdder.setModalError(null);
                    }}
                  >
                    ×
                  </button>
                </div>
              </div>
              
              <div className="p-6">
                {/* エラー表示 */}
                <ModalErrorDisplay 
                  error={studentAdder.modalError} 
                  onClose={() => studentAdder.setModalError(null)} 
                />
                
                <div className="flex gap-2 mb-6 p-1 bg-gray-100 rounded-xl">
                  <button 
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                      !studentAdder.bulkInputMode 
                        ? 'bg-white text-indigo-600 shadow-md' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => studentAdder.setBulkInputMode(false)}
                  >
                    個別入力
                  </button>
                  <button 
                    className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all duration-200 ${
                      studentAdder.bulkInputMode 
                        ? 'bg-white text-indigo-600 shadow-md' 
                        : 'text-gray-600 hover:text-gray-800'
                    }`}
                    onClick={() => studentAdder.setBulkInputMode(true)}
                  >
                    一括入力
                  </button>
                </div>
                
                {!studentAdder.bulkInputMode ? (
                  // 個別入力モード
                  <form onSubmit={studentAdder.handleAddStudent} className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                        <label htmlFor="name" className="block text-sm font-semibold text-gray-700 mb-2">利用者名 <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          id="name"
                          name="name"
                          value={studentAdder.newStudent.name}
                          onChange={studentAdder.handleInputChange}
                          required
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label htmlFor="email" className="block text-sm font-semibold text-gray-700 mb-2">メールアドレス（任意）</label>
                        <input
                          type="email"
                          id="email"
                          name="email"
                          value={studentAdder.newStudent.email}
                          onChange={studentAdder.handleInputChange}
                          placeholder="example@example.com"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>
                    <div>
                      <label htmlFor="instructor_id" className="block text-sm font-semibold text-gray-700 mb-2">担当指導員</label>
                      <select
                        id="instructor_id"
                        name="instructor_id"
                        value={studentAdder.newStudent.instructor_id}
                        onChange={studentAdder.handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">指導員を選択</option>
                        {instructors.map(instructor => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="tags" className="block text-sm font-semibold text-gray-700 mb-2">タグ（カンマ区切り）</label>
                      <input
                        type="text"
                        id="tags"
                        name="tags"
                        value={studentAdder.tagsInput}
                        onChange={studentAdder.handleTagChange}
                        onKeyDown={(e) => {
                          console.log('キー押下:', e.key, 'コード:', e.keyCode);
                          if (e.key === ',') {
                            console.log('カンマキーが押されました');
                          }
                        }}
                        onInput={(e) => {
                          console.log('onInput:', e.target.value);
                        }}
                        onPaste={(e) => {
                          console.log('ペースト:', e.clipboardData.getData('text'));
                        }}
                        onCompositionStart={(e) => {
                          console.log('IME開始');
                        }}
                        onCompositionEnd={(e) => {
                          console.log('IME終了:', e.target.value);
                        }}
                        placeholder="優秀, 要フォロー"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        autoComplete="off"
                        spellCheck="false"
                      />
                    </div>
                    <div className="flex justify-end gap-4">
                      <button
                        type="button"
                        onClick={() => studentAdder.setShowAddForm(false)}
                        className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200"
                      >
                        キャンセル
                      </button>
                      <button
                        type="submit"
                        className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all duration-200"
                      >
                        追加
                      </button>
                    </div>
                  </form>
                ) : (
                  // 一括入力モード
                  <div className="space-y-6">
                    <div>
                                             <label className="block text-sm font-semibold text-gray-700 mb-2">利用者情報（1行1人、カンマ区切り）</label>
                       <p className="text-xs text-gray-500 mb-2">※メールアドレスは任意です。空欄の場合はnullとして登録されます。</p>
                                             <textarea
                         value={studentAdder.bulkInputText}
                         onChange={(e) => studentAdder.setBulkInputText(e.target.value)}
                         placeholder="利用者名,メールアドレス（任意）&#10;例：田中太郎,tanaka@example.com&#10;例：佐藤花子,&#10;例：山田次郎,&#10;例：鈴木一郎,suzuki@example.com&#10;例：高橋美咲,"
                         rows={8}
                         className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                       />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-2">担当指導員（全員共通）</label>
                      <select
                        value={studentAdder.bulkInstructorId}
                        onChange={(e) => studentAdder.setBulkInstructorId(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">指導員を選択</option>
                        {instructors.map(instructor => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.name}
                          </option>
                        ))}
                      </select>
                    </div>
                      <div>
                        <p className="text-xs text-gray-500 mt-1">
                          選択中の拠点の企業・拠点に所属する利用者として追加されます
                        </p>
                     </div>
                    <div className="flex justify-end gap-4">
                      <button
                        onClick={() => studentAdder.setShowAddForm(false)}
                        className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200"
                      >
                        キャンセル
                      </button>
                      <button
                        onClick={studentAdder.handleBulkAddStudents}
                        className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all duration-200"
                      >
                        一括追加
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 編集モーダル */}
        {studentEditor.showEditModal && studentEditor.editingStudent && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-gray-800">✏️ 利用者情報編集</h3>
                  <button 
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
                    onClick={() => studentEditor.setShowEditModal(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6">
                <form onSubmit={(e) => { e.preventDefault(); studentEditor.handleUpdateStudent(); }} className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="edit_name" className="block text-sm font-semibold text-gray-700 mb-2">利用者名 <span className="text-red-500">*</span></label>
                      <input
                        type="text"
                        id="edit_name"
                        name="name"
                        value={studentEditor.editFormData.name}
                        onChange={studentEditor.handleInputChange}
                        required
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit_email" className="block text-sm font-semibold text-gray-700 mb-2">メールアドレス（任意）</label>
                      <input
                        type="email"
                        id="edit_email"
                        name="email"
                        value={studentEditor.editFormData.email || ''}
                        onChange={studentEditor.handleInputChange}
                        placeholder="example@example.com"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="edit_instructor_id" className="block text-sm font-semibold text-gray-700 mb-2">担当指導員</label>
                      <select
                        id="edit_instructor_id"
                        name="instructor_id"
                        value={studentEditor.editFormData.instructor_id}
                        onChange={studentEditor.handleInputChange}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">指導員を選択</option>
                        {instructors.map(instructor => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="edit_tags" className="block text-sm font-semibold text-gray-700 mb-2">タグ（カンマ区切り）</label>
                    <input
                      type="text"
                      id="edit_tags"
                      name="tags"
                      value={studentEditor.tagsInput}
                      onChange={studentEditor.handleTagChange}
                      placeholder="優秀, 要フォロー"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div className="flex justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => studentEditor.setShowEditModal(false)}
                      className="px-6 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-all duration-200"
                    >
                      キャンセル
                    </button>
                    <button
                      type="submit"
                      className="px-6 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition-all duration-200"
                    >
                      更新
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

        {/* CourseManagerモーダル */}
        {showCourseManagerModal && isCourseManagerReady && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-2xl font-bold text-gray-800">🎯 コース管理</h3>
                  <button 
                    className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
                    onClick={() => setShowCourseManagerModal(false)}
                  >
                    ×
                  </button>
                </div>
              </div>
              <div className="p-6">
                <CourseManager
                  students={students}
                  onStudentsUpdate={setStudents}
                  satelliteId={currentSatelliteId}
                />
              </div>
            </div>
          </div>
        )}


        {/* 合格承認モーダル */}
        {showTestApprovalModal && selectedStudentForApproval && (
          <TestApprovalModal
            isOpen={showTestApprovalModal}
            onClose={closeTestApprovalModal}
            student={selectedStudentForApproval}
            satelliteId={currentSatelliteId}
            onApprovalSuccess={handleApprovalSuccess}
          />
        )}

        {/* 提出物承認モーダル */}
        {showSubmissionApprovalModal && selectedStudentForSubmission && (
          <SubmissionApprovalModal
            isOpen={showSubmissionApprovalModal}
            onClose={closeSubmissionApprovalModal}
            student={selectedStudentForSubmission}
            onApprovalSuccess={handleApprovalSuccess}
          />
        )}
      </div>
    </div>
  );
};

export default StudentManagementRefactored;
