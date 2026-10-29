import React, { useState, useRef, useEffect, useContext } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AuthContext } from '../contexts/AuthContext';
import { useLearningProgress } from './LearningProgressManager';
import LearningHeader from './LearningHeader';
import VideoSection from './VideoSection';
import TextSection from './TextSection';
import ChatSection from './ChatSection';
import FileUploadSection from './FileUploadSection';
import UploadModal from './UploadModal';
import AIAssistantService from './AIAssistantService';
import { SessionStorageManager } from '../../utils/sessionStorage';
import { API_BASE_URL } from '../../config/apiConfig';

const TEXT_ERROR_KEYWORDS = [
  'テキストファイルの読み込みに失敗しました',
  'テキストファイルが設定されていません',
  'テキスト内容が利用できません',
  '教材テキストを読み込めません'
];

// セクションに紐づく動画を、VideoSection 表示用の配列に変換する（動画が無ければ空配列）
// ※ レッスン全体の動画（lessonData.videos）をそのまま表示すると、複数動画が出てしまうため、
//   動画の表示は必ずセクションの動画（最大1本）で決める
const buildSectionVideos = (section) => {
  if (!section || !section.video_id || !section.youtube_url) {
    return [];
  }
  return [{
    id: section.video_id,
    title: section.video_title || 'セクション動画',
    description: section.video_description || '',
    youtube_url: section.youtube_url,
    duration: section.video_duration || ''
  }];
};

const EnhancedLearningPageRefactored = () => {
  const navigate = useNavigate();
  const { currentUser } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const [currentLesson, setCurrentLesson] = useState(1);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [textContent, setTextContent] = useState('');
  const [pdfTextContent, setPdfTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(true);
  const [textScrollPosition, setTextScrollPosition] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lessonData, setLessonData] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [pdfTextExtracted, setPdfTextExtracted] = useState(false);
  const [pdfProcessingStatus, setPdfProcessingStatus] = useState('idle'); // 'idle', 'processing', 'completed', 'error'
  const [assignmentStatus, setAssignmentStatus] = useState({ hasAssignment: false, assignmentSubmitted: false });
  const textContainerRef = useRef(null);
  const latestFetchId = useRef(0); // レースコンディション防止用
  const abortControllerRef = useRef(null); // リクエストキャンセル用

  const isErrorTextContent = (content) => {
    const normalized = (content || '').trim();
    if (!normalized) {
      return true;
    }
    return TEXT_ERROR_KEYWORDS.some(keyword => normalized.includes(keyword));
  };

  // 学習進捗管理フックを使用
  const {
    updateLearningProgress,
    handleStartLearning: progressHandleStartLearning,
    handleTestCompleted: progressHandleTestCompleted
  } = useLearningProgress();

  // currentLessonの状態変化を追跡
  useEffect(() => {
    console.log(`🔄 currentLesson状態変化: ${currentLesson}`);
  }, [currentLesson]);

  // URLパラメータからコースIDとレッスンIDを取得
  useEffect(() => {
    const courseParam = searchParams.get('course');
    const lessonParam = searchParams.get('lesson');
    
    console.log('🔍 URLパラメータ解析:', { courseParam, lessonParam });
    
    if (courseParam) {
      fetchCourseData(courseParam, 0, searchParams);
    }
    
    if (lessonParam) {
      const lessonId = parseInt(lessonParam);
      console.log('📚 レッスンID解析:', { lessonParam, lessonId, isValid: lessonId >= 1 });
      if (lessonId >= 1) {
        console.log(`🔄 setCurrentLesson呼び出し前: currentLesson = ${currentLesson}, 新しい値 = ${lessonId}`);
        setCurrentLesson(lessonId);
        setTextLoading(true);
        console.log('✅ レッスンID設定完了:', lessonId);
      }
    }
  }, [searchParams]); // searchParamsのみに依存

  // 学習開始時の進捗更新は削除（LessonList.jsのhandleStartLessonで実行されるため）

  // 提出物確認ファイルを取得
  const fetchUploadedFiles = async (lessonId = null) => {
    const targetLessonId = lessonId || currentLesson;
    
    try {
      console.log(`📁 提出物確認ファイル取得開始: レッスンID ${targetLessonId}`);
      
      const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${targetLessonId}/uploaded-files`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📁 提出物確認ファイルデータ:`, data);
        
        if (data.success) {
          setUploadedFiles(data.data);
          console.log(`✅ 提出物確認ファイル設定完了: ${data.data.length}件`);
        } else {
          console.error('提出物確認ファイル取得失敗:', data.message);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('提出物確認ファイルAPIエラー:', {
          status: response.status,
          error: errorData.message
        });
      }
    } catch (error) {
      console.error('提出物確認ファイル取得エラー:', error);
    }
  };

  // 課題提出状況を確認
  const checkAssignmentStatus = async (lessonId = null) => {
    const targetLessonId = lessonId || currentLesson;
    
    // レースコンディション防止: リクエストIDを生成
    const requestId = ++latestFetchId.current;
    
    try {
      console.log(`🔍 課題提出状況確認開始: レッスンID ${targetLessonId} (currentLesson: ${currentLesson}), requestId: ${requestId}`);
      
      const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${targetLessonId}/assignment-status`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      console.log(`📡 課題提出状況APIレスポンス:`, {
        status: response.status,
        ok: response.ok,
        targetLessonId,
        currentLesson,
        requestId
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`📊 課題提出状況データ:`, data);
        
        if (data.success) {
          setAssignmentStatus(data.data);
          console.log(`✅ 課題提出状況設定完了:`, {
            hasAssignment: data.data.hasAssignment,
            assignmentSubmitted: data.data.assignmentSubmitted
          });
        } else {
          console.error('課題提出状況取得失敗:', data.message);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('課題提出状況APIエラー:', {
          status: response.status,
          error: errorData.message,
          targetLessonId,
          currentLesson
        });
      }
    } catch (error) {
      console.error('課題提出状況確認エラー:', error);
    }
  };

  // レッスンデータをAPIから取得
  const fetchLessonData = async (retryCount = 0, lessonId = null) => {
    const targetLessonId = lessonId || currentLesson;
    
    // レースコンディション防止: リクエストIDを生成
    const requestId = ++latestFetchId.current;
    
    // 前のリクエストをキャンセル
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    // 新しいAbortControllerを作成
    const abortController = new AbortController();
    abortControllerRef.current = abortController;
    
    try {
      setLoading(true);
      setError(null);
      
      const userId = getUserId();
      
      console.log(`🚀 レッスンデータ取得開始:`, {
        currentLesson,
        targetLessonId,
        userId,
        retryCount: retryCount + 1,
        requestId,
        url: `${API_BASE_URL}/api/learning/lesson/${targetLessonId}/content`
      });
      
      const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${targetLessonId}/content`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        signal: abortController.signal
      });

      console.log(`📡 APIレスポンス:`, {
        status: response.status,
        ok: response.ok,
        targetLessonId
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMessage = `レッスンデータの取得に失敗しました: ${response.status} ${errorData.message || ''}`;
        
        console.error(`❌ APIエラー:`, {
          status: response.status,
          errorData,
          targetLessonId
        });
        
        // サーバーエラーの場合はリトライ
        if (response.status >= 500 && retryCount < 2) {
          console.log(`${retryCount + 1}回目のリトライを実行します...`);
          setTimeout(() => {
            fetchLessonData(retryCount + 1, targetLessonId);
          }, 2000 * (retryCount + 1));
          return;
        }
        
        setError(errorMessage);
        setLoading(false);
        return;
      }

      const data = await response.json();
      
      console.log(`📊 レスポンスデータ:`, {
        success: data.success,
        lessonId: data.data?.id,
        lessonTitle: data.data?.title,
        courseId: data.data?.course_id,
        requestId
      });
      
      // レスポンスデータの完全な内容をログ出力
      console.log(`🔍 完全なレスポンスデータ:`, JSON.stringify(data, null, 2));
      
      if (data.success) {
        // データの整合性チェックを追加
        if (data.data && data.data.id !== targetLessonId) {
          console.error(`❌ データ整合性エラー: 要求したレッスンID ${targetLessonId} とレスポンスのレッスンID ${data.data.id} が一致しません`);
          setError(`レッスンデータの整合性エラー: 要求したレッスンID ${targetLessonId} とレスポンスのレッスンID ${data.data.id} が一致しません`);
          setLoading(false);
          return;
        }
        
        setLessonData(data.data);
        setTextLoading(false);
        
        // レッスンデータにtextContentが含まれている場合は、textContentステートに設定
        if (data.data.textContent) {
          console.log('レッスンデータからtextContentを設定:', {
            textContentLength: data.data.textContent.length,
            fileType: data.data.file_type,
            s3Key: data.data.s3_key
          });
          setTextContent(data.data.textContent);
        } else {
          console.log('レッスンデータにtextContentが含まれていません:', {
            hasTextContent: !!data.data.textContent,
            fileType: data.data.file_type,
            s3Key: data.data.s3_key
          });
        }
        
        // 課題提出状況を確認
        console.log(`🔍 課題提出状況確認開始: レッスンID ${targetLessonId}`);
        await checkAssignmentStatus(targetLessonId);
        
        // 提出物確認ファイルを取得
        await fetchUploadedFiles(targetLessonId);
        
        console.log('レッスンデータ取得成功:', data.data);
      } else {
        setError(data.message || 'レッスンデータの取得に失敗しました');
      }
    } catch (error) {
      // AbortErrorの場合は無視（リクエストがキャンセルされた）
      if (error.name === 'AbortError') {
        console.log(`⏹️ リクエストがキャンセルされました: レッスンID ${targetLessonId}`);
        return;
      }
      
      console.error('レッスンデータ取得エラー:', error);
      
      // ネットワークエラーの場合はリトライ
      if (retryCount < 2 && (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
        console.log(`${retryCount + 1}回目のリトライを実行します...`);
        setTimeout(() => {
          fetchLessonData(retryCount + 1, targetLessonId);
        }, 2000 * (retryCount + 1));
        return;
      }
      
      setError('レッスンデータの取得中にエラーが発生しました: ' + error.message);
    } finally {
      setLoading(false);
    }
  };


  // currentLessonが変更された時にレッスンデータを取得
  useEffect(() => {
    if (currentLesson) {
      console.log(`🔄 useEffect: currentLesson変更検知 - レッスンID ${currentLesson}`);
      
      // 前のレッスンの状態をクリア
      if (lessonData && lessonData.id !== currentLesson) {
        console.log(`🗑️ 前のレッスン${lessonData.id}の状態をクリア中...`);
        setLessonData(null);
        setTextContent('');
        setPdfTextContent('');
        setChatMessages([]);
        setCurrentSection(0);
        setPdfTextExtracted(false);
        setPdfProcessingStatus('idle');
        setAssignmentStatus({ hasAssignment: false, assignmentSubmitted: false }); // 課題状況もクリア
      }
      
      // 新しいレッスンのデータを取得
      const targetLessonId = currentLesson; // 現在の値を保存
      console.log(`🚀 即座にレッスンデータ取得開始: レッスンID ${targetLessonId}`);
      fetchLessonData(0, targetLessonId);
      checkAssignmentStatus(targetLessonId); // 課題提出状況も確認
    }
  }, [currentLesson]); // currentLessonのみに依存

  // レッスンが変わったら、セクション一覧を取得する
  // （動画の表示をセクション単位にすること、およびセクション切替（changeSection）を有効にするため）
  useEffect(() => {
    if (!currentLesson) return;

    // 前のレッスンのセクション一覧が一瞬表示されないようにリセット
    setSectionData(null);

    const loadSectionList = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/lesson-text-video-links/lesson/${currentLesson}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });
        if (!response.ok) {
          console.warn('セクション一覧の取得に失敗しました:', response.status);
          return;
        }
        const data = await response.json();
        if (data.success && Array.isArray(data.data)) {
          setSectionData(data.data);
        }
      } catch (error) {
        console.error('セクション一覧の取得エラー:', error);
      }
    };

    loadSectionList();
  }, [currentLesson]);

  // コンポーネントのアンマウント時にセッションストレージをクリーンアップ
  useEffect(() => {
    return () => {
      // 必要に応じてセッションストレージをクリーンアップ
      // 注意: 他のタブにも影響する可能性があるため、慎重に使用
      // SessionStorageManager.clearAllContexts();
    };
  }, []);

  // レッスン変更処理
  const changeLesson = (lessonId) => {
    console.log(`🔄 レッスン変更処理開始: ${currentLesson} → ${lessonId}`);
    
    // 前のレッスンのコンテキストをクリア
    if (currentLesson) {
      SessionStorageManager.clearLessonContext(currentLesson);
    }
    
    // 状態をリセット
    setCurrentLesson(lessonId);
    setCurrentSection(0);
    setTextLoading(true);
    setChatMessages([]);
    setTextScrollPosition(0);
    setPdfTextExtracted(false);
    setPdfProcessingStatus('idle'); // PDF処理状態をリセット
    setLessonData(null); // レッスンデータをクリア
    setError(null); // エラー状態をクリア
    setAssignmentStatus({ hasAssignment: false, assignmentSubmitted: false }); // 課題状況をクリア
    
    if (courseData) {
      navigate(`/student/enhanced-learning?course=${courseData.id}&lesson=${lessonId}`);
    }
    
    // 新しいレッスンデータの取得はuseEffectで自動実行される
    console.log(`✅ レッスン変更処理完了: ${lessonId}`);
  };

     // セクション変更処理
   // 動画の表示用：セクション一覧がある場合は「現在のセクションの動画」だけ、
  // セクション一覧が無いレッスンだけレッスン全体の動画（lessonData.videos）を表示する
  const getDisplayVideos = () => {
    if (Array.isArray(sectionData) && sectionData.length > 0) {
      return buildSectionVideos(sectionData[currentSection]);
    }
    return lessonData?.videos || [];
  };

  const changeSection = (sectionIndex) => {
     if (!sectionData || !Array.isArray(sectionData)) return;
     
     const newSection = sectionData[sectionIndex];
     if (!newSection) return;
     
     setCurrentSection(sectionIndex);
     
     // セクション固有のテキストファイルがある場合は、新しいコンテキストで処理
     if (newSection.text_file_key && newSection.text_file_key !== lessonData?.s3_key) {
       console.log('セクション変更: 新しいテキストファイルを検出:', newSection.text_file_key);
       
       // ファイルタイプを拡張子から判定
       const fileExtension = newSection.text_file_key.split('.').pop().toLowerCase();
       const detectedFileType = fileExtension === 'md' ? 'md' : 
                               fileExtension === 'txt' ? 'text/plain' : 
                               fileExtension === 'rtf' ? 'application/rtf' : 
                               fileExtension === 'pdf' ? 'pdf' : 
                               'pdf';  // デフォルトはpdf
       
       // 新しいセクション用のlessonDataを設定
       setLessonData(prev => ({
         ...prev,
         s3_key: newSection.text_file_key, // セクション固有のS3キー
         file_type: detectedFileType
       }));
       
       // ファイルタイプに応じて処理状態をリセット
       if (detectedFileType === 'pdf') {
         setPdfProcessingStatus('processing');
         setPdfTextExtracted(false);
         setTextContent('');
         setPdfTextContent('');
       } else {
         // テキストファイルの場合は既存のtextContentを保持
         console.log('テキストファイルのため、既存のtextContentを保持します');
       }
       
       // 前のセクションのコンテキストをクリア（PDFの場合のみ）
       if (detectedFileType === 'pdf' && lessonData?.id) {
         SessionStorageManager.clearLessonContext(lessonData.id);
       }
     }
   };

  // セクションデータを取得
  const fetchSectionData = async (lessonId, retryCount = 0) => {
    try {
      console.log(`セクションデータを取得中: レッスンID ${lessonId} (試行回数: ${retryCount + 1})`);
      
      const response = await fetch(`${API_BASE_URL}/api/lesson-text-video-links/lesson/${lessonId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
               if (data.success) {
         console.log('セクションデータ取得成功:', data.data);
         console.log('セクションデータ - text_file_key詳細:', {
           text_file_key: data.data[0]?.text_file_key,
           text_file_key_type: typeof data.data[0]?.text_file_key,
           text_file_key_length: data.data[0]?.text_file_key?.length,
           text_file_key_starts_with_lessons: data.data[0]?.text_file_key?.startsWith('lessons/'),
           first_section: data.data[0]
         });
         setSectionData(data.data);
          
                     if (data.data.length > 0) {
             setCurrentSection(0);
             
            // 最初のセクションのテキストファイルがある場合は、lessonDataを更新
            const firstSection = data.data[0];
            if (firstSection.text_file_key && firstSection.text_file_key !== lessonData?.s3_key) {
              console.log('セクションデータ取得: 最初のセクションのテキストファイルを設定:', firstSection.text_file_key);
              
              // ファイルタイプを拡張子から判定
              const fileExtension = firstSection.text_file_key.split('.').pop().toLowerCase();
              const detectedFileType = fileExtension === 'md' ? 'md' : 
                                      fileExtension === 'txt' ? 'text/plain' : 
                                      fileExtension === 'rtf' ? 'application/rtf' : 
                                      fileExtension === 'pdf' ? 'pdf' : 
                                      lessonData?.file_type || 'pdf';  // 元のfile_typeを保持、なければpdf
              
              console.log('ファイルタイプ判定:', {
                text_file_key: firstSection.text_file_key,
                fileExtension: fileExtension,
                detectedFileType: detectedFileType,
                originalFileType: lessonData?.file_type
              });
              
              setLessonData(prev => ({
                ...prev,
                s3_key: firstSection.text_file_key, // セクション固有のS3キー
                file_type: detectedFileType  // 拡張子に基づいてfile_typeを設定
              }));
              
              // 処理状態をリセット（PDFの場合のみPDF処理用の状態をリセット）
              if (detectedFileType === 'pdf') {
                setPdfProcessingStatus('processing');
                setPdfTextExtracted(false);
                setTextContent('');
                setPdfTextContent('');
              } else {
                // テキストファイル（MD、TXT、RTF）の場合はtextContentを保持
                console.log('テキストファイルのため、既存のtextContentを保持します');
              }
            }
             
             displaySectionContent(firstSection);
           }
        } else {
          console.error('セクションデータ取得失敗:', data.message);
        }
      } else {
        const errorMessage = `セクションデータ取得失敗: ${response.status}`;
        console.error(errorMessage);
        
        // サーバーエラーの場合はリトライ
        if (response.status >= 500 && retryCount < 2) {
          console.log(`${retryCount + 1}回目のリトライを実行します...`);
          setTimeout(() => {
            fetchSectionData(lessonId, retryCount + 1);
          }, 2000 * (retryCount + 1));
          return;
        }
      }
    } catch (error) {
      console.error('セクションデータ取得エラー:', error);
      
      // ネットワークエラーの場合はリトライ
      if (retryCount < 2 && (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
        console.log(`${retryCount + 1}回目のリトライを実行します...`);
        setTimeout(() => {
          fetchSectionData(lessonId, retryCount + 1);
        }, 2000 * (retryCount + 1));
        return;
      }
    }
  };

     // セクションの内容を表示（動画のみ）
   const displaySectionContent = (section) => {
     if (!section) return;
     
     console.log('セクション内容を表示:', section);
     
     // セクションの動画のみを表示（動画が無いセクションでは空にし、前のセクションや全体の動画を残さない）
     setLessonData(prev => ({
       ...prev,
       videos: buildSectionVideos(section)
     }));
   };

     // セクションテキストコンテンツ取得は不要（PDF処理はTextSectionで自動実行）

  // ユーザーIDを取得する関数
  const getUserId = () => {
    // 1. 認証コンテキストから取得
    if (currentUser && currentUser.id) {
      console.log('認証コンテキストからユーザーID取得:', currentUser.id);
      return currentUser.id;
    }
    
    // 2. localStorageのcurrentUserから取得
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
      try {
        const userData = JSON.parse(storedUser);
        if (userData && userData.id) {
          console.log('localStorageのcurrentUserからユーザーID取得:', userData.id);
          return userData.id;
        }
      } catch (error) {
        console.error('localStorageのcurrentUserパースエラー:', error);
      }
    }
    
    // 3. フォールバック: localStorageのuserIdから取得
    const fallbackUserId = localStorage.getItem('userId');
    if (fallbackUserId) {
      console.log('localStorageのuserIdからユーザーID取得:', fallbackUserId);
      return fallbackUserId;
    }
    
    // 4. 最終フォールバック
    console.warn('ユーザーIDが取得できません。デフォルト値24を使用します。');
    return '24'; // 現在受講しているユーザーID
  };

  // コースデータを取得
  const fetchCourseData = async (courseId, retryCount = 0, searchParams = null) => {
    try {
      const userId = getUserId();
      
      console.log(`コースデータを取得中: コースID ${courseId}, 利用者ID ${userId} (試行回数: ${retryCount + 1})`);
      
      const response = await fetch(`${API_BASE_URL}/api/learning/progress/${userId}/course/${courseId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          setCourseData(data.data);
          console.log('コースデータ取得成功:', data.data);
          
          // URLパラメータでレッスンが指定されていない場合のみ最初のレッスンを設定
          const lessonParam = searchParams ? searchParams.get('lesson') : null;
          if (!lessonParam && !currentLesson && data.data.lessons && data.data.lessons.length > 0) {
            const firstLesson = data.data.lessons[0];
            setCurrentLesson(firstLesson.id);
            console.log(`最初のレッスンを設定: ${firstLesson.id}`);
          }
        } else {
          console.error('コースデータ取得失敗:', data.message);
        }
      } else {
        const errorMessage = `コースデータ取得失敗: ${response.status}`;
        console.error(errorMessage);
        const errorData = await response.json().catch(() => ({}));
        console.error('エラー詳細:', errorData);
        
        // サーバーエラーの場合はリトライ
        if (response.status >= 500 && retryCount < 2) {
          console.log(`${retryCount + 1}回目のリトライを実行します...`);
          setTimeout(() => {
            fetchCourseData(courseId, retryCount + 1);
          }, 2000 * (retryCount + 1));
          return;
        }
      }
    } catch (error) {
      console.error('コースデータ取得エラー:', error);
      
      // ネットワークエラーの場合はリトライ
      if (retryCount < 2 && (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
        console.log(`${retryCount + 1}回目のリトライを実行します...`);
        setTimeout(() => {
          fetchCourseData(courseId, retryCount + 1);
        }, 2000 * (retryCount + 1));
        return;
      }
    }
  };

  // 学習開始処理
  const handleStartLearningLocal = async () => {
    const success = await progressHandleStartLearning(currentLesson, courseData, currentUser);
    if (success) {
      fetchLessonData();
    }
  };

  // チャットメッセージ送信
  const handleSendMessage = async () => {
    if (chatInput.trim()) {
      const question = chatInput.trim();
      
      // 質問の品質チェック
      const questionValidation = AIAssistantService.validateQuestion(question);
      if (!questionValidation.isValid) {
        alert(questionValidation.error);
        return;
      }

             // PDFテキストの読み込み状態をチェック
       if (lessonData?.file_type === 'pdf' && !pdfTextContent) {
         // セッションストレージからコンテキストを確認
         const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
         if (!hasStoredContext) {
           alert('PDFファイルの読み込みが完了していません。しばらくお待ちください。');
           return;
         }
       }

      // 現在のセクションのテキスト内容を取得
      const currentSectionText = getCurrentSectionText();
      
      // デバッグログを追加
      console.log('handleSendMessage - テキスト内容検証:', {
        question,
        currentSectionTextLength: currentSectionText.length,
        currentSectionTextPreview: currentSectionText.substring(0, 100) + '...',
        textContentLength: textContent?.length || 0,
        pdfTextContentLength: pdfTextContent?.length || 0,
        lessonDescriptionLength: lessonData?.description?.length || 0
      });
      
      // コンテキストの品質チェック
      const contextValidation = AIAssistantService.validateContext(currentSectionText);
      if (!contextValidation.isValid) {
        console.error('コンテキスト検証エラー:', contextValidation);
        
        // より詳細なエラーメッセージを表示
        if (lessonData?.file_type === 'pdf') {
          alert('PDFファイルの読み込みが完了していないか、テキスト内容が短すぎます。しばらくお待ちください。');
        } else {
          alert(`AIアシスタントが利用できません: ${contextValidation.error}`);
        }
        return;
      }

      // ユーザーメッセージを追加
      const userMessage = {
        id: Date.now(),
        text: question,
        sender: 'user',
        timestamp: new Date().toLocaleTimeString()
      };
      setChatMessages(prev => [...prev, userMessage]);
      setChatInput('');
      setIsAILoading(true);

      try {
        // AIアシスタントに質問を送信
        const aiResponse = await AIAssistantService.askQuestion(
          question,
          currentSectionText,
          lessonData?.title || `レッスン${currentLesson}`
        );

        if (aiResponse.success) {
          // AIの回答を追加
          const aiMessage = {
            id: Date.now() + 1,
            text: aiResponse.answer,
            sender: 'ai',
            timestamp: new Date().toLocaleTimeString()
          };
          setChatMessages(prev => [...prev, aiMessage]);
        } else {
          // エラー時のフォールバック回答
          const fallbackMessage = {
            id: Date.now() + 1,
            text: aiResponse.fallbackAnswer,
            sender: 'ai',
            timestamp: new Date().toLocaleTimeString()
          };
          setChatMessages(prev => [...prev, fallbackMessage]);
        }
      } catch (error) {
        console.error('AIアシスタントエラー:', error);
        // エラーメッセージを追加
        const errorMessage = {
          id: Date.now() + 1,
          text: 'AIアシスタントの応答を取得できませんでした。しばらく時間をおいて再度お試しください。',
          sender: 'ai',
          timestamp: new Date().toLocaleTimeString()
        };
        setChatMessages(prev => [...prev, errorMessage]);
      } finally {
        setIsAILoading(false);
      }
    }
  };

  // 現在のセクションのテキスト内容を取得
  const getCurrentSectionText = () => {
    // セッションストレージからコンテキストを確認
    if (lessonData?.s3_key && lessonData?.id) {
      const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
      if (storedContext && !isErrorTextContent(storedContext.context)) {
        console.log('AIサポート用にセッションストレージからコンテキスト取得:', {
          contextLength: storedContext.context.length
        });
        return storedContext.context;
      }
    }
    
    // フォールバック: 既存のロジック
    if (currentSection >= 0 && sectionData && sectionData[currentSection]) {
      // セクション固有のテキストがある場合はそれを返す
      const fallbackText = textContent || pdfTextContent || lessonData?.description || '';
      return isErrorTextContent(fallbackText) ? '' : fallbackText;
    }
    
    // デフォルトはレッスンのテキスト内容
    const fallbackText = textContent || pdfTextContent || lessonData?.description || '';
    return isErrorTextContent(fallbackText) ? '' : fallbackText;
  };

  // PDFテキスト更新ハンドラー
  const handlePdfTextUpdate = (newPdfText) => {
    console.log('handlePdfTextUpdate 呼び出し:', { 
      textLength: newPdfText?.length,
      isError: newPdfText?.startsWith('エラー:'),
      isCancel: newPdfText?.includes('キャンセル')
    });
    
    const incomingText = newPdfText || '';
    
    if (incomingText && incomingText.length > 0) {
      if (
        incomingText.startsWith('エラー:') ||
        incomingText.includes('失敗') ||
        incomingText.includes('タイムアウト')
      ) {
        setPdfProcessingStatus('error');
        setPdfTextContent('');
        console.log('PDF処理でエラーが発生しました:', incomingText);
      } else if (incomingText.includes('キャンセル')) {
        setPdfProcessingStatus('idle');
        setPdfTextContent('');
        console.log('PDF処理がキャンセルされました');
      } else {
        setPdfTextExtracted(true);
        setPdfProcessingStatus('completed');
        setPdfTextContent(incomingText);
        console.log('PDFテキスト抽出完了:', { textLength: incomingText.length });
      }
    } else {
      setPdfProcessingStatus('error');
      setPdfTextContent('');
      console.log('PDF処理で空のテキストが返されました');
    }
  };

  // テキストスクロール位置を保存・復元
  const scrollToTextPosition = (position) => {
    if (textContainerRef.current) {
      textContainerRef.current.scrollTop = position;
    }
  };

  // 成果物アップロード処理
  const handleFileUpload = async (event) => {
    const files = Array.from(event.target.files);
    
    // ZIPファイルのみ許可
    const zipFiles = files.filter(file => 
      file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip')
    );
    
    if (zipFiles.length === 0) {
      alert('ZIPファイルのみアップロード可能です');
      return;
    }

    try {
      const formData = new FormData();
      formData.append('file', zipFiles[0]);
      formData.append('lessonId', currentLesson);

      const response = await fetch(`${API_BASE_URL}/api/learning/upload-assignment`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
        },
        body: formData
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success) {
          // アップロード成功
          const newFile = {
            id: Date.now() + Math.random(),
            name: data.data.fileName,
            type: 'application/zip',
            uploadDate: new Date().toLocaleString(),
            status: 'uploaded',
            s3Key: data.data.s3Key
          };
          
          setUploadedFiles(prev => [...prev, newFile]);
          setShowUploadModal(false);
          
          // 課題提出状況を更新
          setAssignmentStatus(prev => ({ ...prev, assignmentSubmitted: true }));
          
          alert('成果物のアップロードが完了しました！');
          
          // 課題提出完了の処理（既にassignmentStatusが更新されているため、追加処理は不要）
          
          // 課題提出状況と提出物確認ファイルを再確認
          setTimeout(() => {
            checkAssignmentStatus();
            fetchUploadedFiles();
          }, 500);
        } else {
          alert('アップロードに失敗しました: ' + data.message);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        alert('アップロードに失敗しました: ' + (errorData.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('ファイルアップロードエラー:', error);
      alert('アップロード中にエラーが発生しました: ' + error.message);
    }
  };

  // ファイル削除処理
  const handleFileDelete = async (fileId) => {
    try {
      console.log(`🗑️ ファイル削除開始: ファイルID ${fileId}, レッスンID ${currentLesson}`);
      
      const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${currentLesson}/uploaded-files/${fileId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        console.log('ファイル削除成功:', data);
        
        // フロントエンドの状態を更新
        setUploadedFiles(prev => prev.filter(file => file.id !== fileId));
        
        // 課題提出状況がリセットされた場合は、課題提出状況を再取得
        if (data.data && data.data.assignmentStatusReset) {
          console.log('課題提出状況がリセットされました。再取得します。');
          await checkAssignmentStatus(currentLesson);
        }
        
        console.log('✅ ファイル削除完了');
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('ファイル削除APIエラー:', {
          status: response.status,
          error: errorData.message
        });
        alert('ファイルの削除に失敗しました: ' + (errorData.message || '不明なエラー'));
      }
    } catch (error) {
      console.error('ファイル削除エラー:', error);
      alert('ファイルの削除中にエラーが発生しました');
    }
  };

  // テスト完了時の処理
  const handleTestCompletedLocal = async (testScore) => {
    await progressHandleTestCompleted(testScore, currentLesson, currentUser);
  };

  // 現在のレッスンデータ
  const currentLessonData = lessonData || {
    title: `第${currentLesson}回　学習内容`,
    description: 'レッスンの説明が読み込めませんでした。',
    videos: []
  };

  // レンダリング時の状態確認
  console.log(`🎨 レンダリング時の状態:`, {
    currentLesson,
    lessonDataId: lessonData?.id,
    lessonDataTitle: lessonData?.title,
    lessonDataS3Key: lessonData?.s3_key,
    isDataConsistent: currentLesson === lessonData?.id
  });

  // 学習画面表示条件を変更: 学習データ読み込み完了後は表示、PDF処理は並行継続
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600 text-xl font-semibold">
            学習データを読み込み中...
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-4">エラーが発生しました</div>
          <p className="text-gray-600 mb-4">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            再読み込み
          </button>
        </div>
      </div>
    );
  }

  const isPdfLesson = lessonData?.file_type === 'pdf';
  const effectiveTextContent = isPdfLesson ? pdfTextContent : textContent;
  let textStatusType = null;
  let textStatusMessage = '';

  if (!lessonData) {
    textStatusType = 'loading';
    textStatusMessage = '教材データを読み込み中です。';
  } else if (!lessonData?.s3_key) {
    textStatusType = 'error';
    textStatusMessage = '教材のテキストファイルが設定されていないため、テストとAIサポートを利用できません。';
  } else if (isPdfLesson) {
    if (pdfProcessingStatus === 'processing' || (pdfProcessingStatus === 'idle' && !pdfTextContent)) {
      textStatusType = 'loading';
      textStatusMessage = '教材PDFを処理中です。完了後にテストとAIサポートを利用できます。';
    } else if (pdfProcessingStatus === 'error' || isErrorTextContent(effectiveTextContent)) {
      textStatusType = 'error';
      textStatusMessage = '教材PDFの読み込みに失敗しました。ページを再読み込みしてください。';
    }
  } else if (textLoading) {
    textStatusType = 'loading';
    textStatusMessage = '教材テキストを読み込み中です。完了後にテストとAIサポートを利用できます。';
  } else if (isErrorTextContent(effectiveTextContent)) {
    textStatusType = 'error';
    textStatusMessage = '教材テキストの読み込みに失敗しました。ページを再読み込みしてください。';
  }

  const isTextReady = textStatusType === null;
  const isTestEnabled = isTextReady;
  const testDisabledReason = isTextReady ? '' : textStatusMessage;
  const isAIEnabled = isTextReady;
  const aiStatus = isTextReady ? null : { type: textStatusType, message: textStatusMessage };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* ヘッダー */}
      <LearningHeader
        lessonData={lessonData}
        courseData={courseData}
        currentLesson={currentLesson}
        currentSection={currentSection}
        sectionData={sectionData}
        onSectionChange={changeSection}
        onUploadModalOpen={() => setShowUploadModal(true)}
        onTestNavigate={(lessonId) => navigate(`/student/test?lesson=${lessonId}`)}
        isTestEnabled={isTestEnabled}
        testDisabledReason={testDisabledReason}
        hasAssignment={assignmentStatus.hasAssignment}
        assignmentSubmitted={assignmentStatus.assignmentSubmitted}
      />

      {/* PDF処理状態表示 - PDFファイルの場合のみ表示 */}
      {pdfProcessingStatus === 'processing' && lessonData?.file_type === 'pdf' && (
        <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2">
          <div className="flex items-center justify-center text-blue-600 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
            PDFファイルのコンテキスト化を処理中... AIサポート機能は準備完了までお待ちください
          </div>
        </div>
      )}
      
      {/* PDF処理エラー表示 - PDFファイルの場合のみ表示 */}
      {pdfProcessingStatus === 'error' && lessonData?.file_type === 'pdf' && (
        <div className="w-full bg-red-50 border-b border-red-200 px-4 py-2">
          <div className="flex items-center justify-center text-red-600 text-sm">
            <span className="mr-2">⚠️</span>
            PDFファイルの処理でエラーが発生しました。AIサポート機能は利用できません
            <button 
              onClick={() => {
                setPdfProcessingStatus('idle');
                if (lessonData?.file_type === 'pdf' && lessonData?.s3_key) {
                  // 再処理を試行
                  setTimeout(() => {
                    setPdfProcessingStatus('processing');
                  }, 100);
                }
              }}
              className="ml-3 px-2 py-1 bg-red-100 text-red-700 text-xs rounded hover:bg-red-200 transition-colors"
            >
              再試行
            </button>
          </div>
        </div>
      )}
      
      {/* PDF処理完了表示 - PDFファイルの場合のみ表示 */}
      {pdfProcessingStatus === 'completed' && lessonData?.file_type === 'pdf' && (
        <div className="w-full bg-green-50 border-b border-green-200 px-4 py-2">
          <div className="flex items-center justify-center text-green-600 text-sm">
            <span className="mr-2">✓</span>
            PDFファイルの処理が完了しました。AIサポート機能が利用可能です
          </div>
        </div>
      )}

      {/* テキストファイル（MD、TXT、RTF）のAI利用可能表示 */}
      {(lessonData?.file_type === 'md' || lessonData?.file_type === 'text/markdown' || lessonData?.file_type === 'txt' || lessonData?.file_type === 'application/rtf') && lessonData?.textContent && (
        <div className="w-full bg-green-50 border-b border-green-200 px-4 py-2">
          <div className="flex items-center justify-center text-green-600 text-sm">
            <span className="mr-2">💡</span>
            AIアシスタントが利用可能です。学習内容について質問してください。
          </div>
        </div>
      )}

      {/* メインコンテンツ - 3カラムレイアウト */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* 左カラム: 動画 */}
          <div className="lg:col-span-1">
            <VideoSection lessonData={{ ...lessonData, videos: getDisplayVideos() }} />
          </div>

          {/* 中央カラム: テキスト */}
          <div className="lg:col-span-1">
                         {console.log('TextSection呼び出し前 - lessonData:', lessonData)}
             {console.log('TextSection呼び出し前 - lessonData.file_type:', lessonData?.file_type)}
             {console.log('TextSection呼び出し前 - lessonData.s3_key:', lessonData?.s3_key)}
             {console.log('セッションストレージ状態:', SessionStorageManager.getStoredContexts())}
             <TextSection
              lessonData={lessonData}
              textContent={textContent}
              textLoading={textLoading}
              textContainerRef={textContainerRef}
              onTextContentUpdate={handlePdfTextUpdate}
            />
          </div>

          {/* 右カラム: AIチャット */}
          <div className="lg:col-span-1">
                         <ChatSection
               chatMessages={chatMessages}
               chatInput={chatInput}
               onChatInputChange={(e) => setChatInput(e.target.value)}
               onSendMessage={handleSendMessage}
               currentLessonData={currentLessonData}
               currentSectionText={getCurrentSectionText()}
               isAILoading={isAILoading}
              isAIEnabled={isAIEnabled}
              aiStatus={aiStatus}
             />

            {/* 提出物確認（課題がある場合のみ表示） */}
            {assignmentStatus.hasAssignment && (
              <FileUploadSection
                uploadedFiles={uploadedFiles}
                onFileDelete={handleFileDelete}
              />
            )}
          </div>
        </div>
      </div>

      {/* アップロードモーダル（課題がある場合のみ表示） */}
      {assignmentStatus.hasAssignment && (
        <UploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onFileUpload={handleFileUpload}
        />
      )}
    </div>
  );
};

export default EnhancedLearningPageRefactored;
