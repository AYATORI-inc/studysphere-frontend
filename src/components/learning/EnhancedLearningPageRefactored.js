import React, { useState, useRef, useEffect, useContext, useCallback } from 'react';
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
import LearningWorkspaceLayout, {
  createDefaultLayouts,
  normalizeLayouts,
  syncCommonLayoutItems,
  layoutWithoutAssignment
} from './LearningWorkspaceLayout';

const EnhancedLearningPageRefactored = () => {
  const navigate = useNavigate();
  const { currentUser } = useContext(AuthContext);
  const [searchParams] = useSearchParams();
  const previewUserIdParam = searchParams.get('previewUserId');
  const previewSatelliteIdParam = searchParams.get('previewSatelliteId');
  const isPreview = searchParams.get('preview') === '1' && (currentUser?.role >= 4);
  const [currentLesson, setCurrentLesson] = useState(1);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [textContent, setTextContent] = useState('');
  // `textContent` がどの S3 キー由来か（セクション切替/復帰時の誤表示・誤キャッシュ防止）
  const [textContentS3Key, setTextContentS3Key] = useState(null);
  const [pdfTextContent, setPdfTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(true);
  const [textScrollPosition, setTextScrollPosition] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [lessonData, setLessonData] = useState(null);
  const [courseData, setCourseData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [currentSection, setCurrentSection] = useState(0);
  const [resumeSectionIndex, setResumeSectionIndex] = useState(null);
  const [resumeSectionTextKey, setResumeSectionTextKey] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isAILoading, setIsAILoading] = useState(false);
  const [pdfTextExtracted, setPdfTextExtracted] = useState(false);
  const [pdfProcessingStatus, setPdfProcessingStatus] = useState('idle'); // 'idle', 'processing', 'completed', 'error'
  const [assignmentStatus, setAssignmentStatus] = useState({ hasAssignment: false, assignmentSubmitted: false });
  const [workspaceLayouts, setWorkspaceLayouts] = useState(() => ({
    withAssignment: createDefaultLayouts(true),
    withoutAssignment: createDefaultLayouts(false)
  }));
  // ウィジェットの表示/非表示を管理
  const [widgetVisibility, setWidgetVisibility] = useState({ video: true, text: true, chat: true, assignment: true });
  const textContainerRef = useRef(null);
  const textSectionContainerRef = useRef(null); // セクション変更時に「テキスト内容」へスクロールする用
  const latestFetchId = useRef(0); // レースコンディション防止用
  const abortControllerRef = useRef(null); // リクエストキャンセル用
  const layoutStorageKeyRef = useRef(null);
  const layoutInitializedRef = useRef(false);
  const sectionProgressUpdateTimeoutRef = useRef(null);
  const resumeSectionIndexRef = useRef(null);
  const resumeSectionTextKeyRef = useRef(null);

  const getUserId = useCallback(() => {
    // 指導員プレビュー（指導員/管理者のみ許可）
    if (isPreview && previewUserIdParam) {
      console.log('プレビューモード: previewUserId を使用します:', previewUserIdParam);
      return String(previewUserIdParam);
    }
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
  }, [currentUser, isPreview, previewUserIdParam]);

  const buildPreviewQueryParams = useCallback((base) => {
    const params = new URLSearchParams(base);
    params.set('preview', '1');
    if (previewSatelliteIdParam) params.set('previewSatelliteId', String(previewSatelliteIdParam));
    if (previewUserIdParam) params.set('previewUserId', String(previewUserIdParam));
    return params;
  }, [previewSatelliteIdParam, previewUserIdParam]);

  const buildLayoutStorageKey = (userId) => `studysphere:workspaceLayouts:user:${userId}`;

  const getLayoutStorageKey = useCallback(() => {
    if (layoutStorageKeyRef.current) {
      return layoutStorageKeyRef.current;
    }
    const userId = getUserId();
    const storageKey = buildLayoutStorageKey(userId);
    layoutStorageKeyRef.current = storageKey;
    return storageKey;
  }, [getUserId]);

  const persistWorkspaceLayouts = useCallback(async (layouts) => {
    const storageKey = getLayoutStorageKey();
    // プレビューでない場合はDB（API）に保存
    if (!isPreview) {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(`${API_BASE_URL}/api/learning/workspace-layout`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` })
          },
          body: JSON.stringify({ layouts })
        });
        if (response.ok) {
          console.log('学習ワークスペースレイアウトをDBに保存しました');
        } else {
          console.warn('レイアウトのDB保存に失敗しました。ローカルに保存します。', response.status);
        }
      } catch (err) {
        console.warn('レイアウトのAPI保存に失敗しました。ローカルに保存します。', err);
      }
    }
    // 常にローカルストレージにも保存（キャッシュ・プレビュー・オフライン用）
    try {
      localStorage.setItem(storageKey, JSON.stringify(layouts));
      console.log('学習ワークスペースレイアウトをローカルに保存しました:', storageKey);
    } catch (error) {
      console.error('学習ワークスペースレイアウトのローカル保存に失敗しました:', error);
    }
  }, [getLayoutStorageKey, isPreview]);

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

  // セクション変更時、「テキスト内容」パネル位置へスクロールして表示を移動
  useEffect(() => {
    if (textSectionContainerRef.current) {
      const el = textSectionContainerRef.current;
      requestAnimationFrame(() => {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [currentSection]);

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

  // URLの section パラメータで開くセクションを指定（例: テスト結果の「次のセクションへ」から遷移時）
  useEffect(() => {
    const lessonParam = searchParams.get('lesson');
    const sectionParam = searchParams.get('section');
    const lessonMatch = lessonParam != null && String(currentLesson) === String(lessonParam);
    if (!lessonMatch || sectionParam == null || !sectionData || !Array.isArray(sectionData) || sectionData.length === 0) return;
    const idx = parseInt(sectionParam, 10);
    if (!isNaN(idx) && idx >= 0 && idx < sectionData.length) {
      setCurrentSection(idx);
    }
  }, [searchParams, sectionData, currentLesson]);

  // 学習開始時の進捗更新は削除（LessonList.jsのhandleStartLessonで実行されるため）

  // 提出物確認ファイルを取得
  const fetchUploadedFiles = async (lessonId = null) => {
    if (isPreview) return;
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
    if (isPreview) return;
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
        
        // レッスンデータを設定（videosは空配列に設定 - セクションデータで設定される）
        const lessonDataWithoutVideos = {
          ...data.data,
          videos: [] // セクションデータで動画を設定するため、ここでは空配列に設定
        };
        
        // DB保存の「最後に閲覧したセクション(0始まり)」を保持
        // ※URLに section 指定がある場合は後段でそちらを優先する
        if (typeof data.data?.last_viewed_section_index === 'number' && !Number.isNaN(data.data.last_viewed_section_index)) {
          resumeSectionIndexRef.current = data.data.last_viewed_section_index;
          setResumeSectionIndex(data.data.last_viewed_section_index);
        } else {
          resumeSectionIndexRef.current = null;
          setResumeSectionIndex(null);
        }
        // DB保存の「最後に閲覧したセクションのテキストキー（S3キー）」を保持（indexより優先）
        if (typeof data.data?.last_viewed_section_text_key === 'string' && data.data.last_viewed_section_text_key.trim().length > 0) {
          resumeSectionTextKeyRef.current = data.data.last_viewed_section_text_key.trim();
          setResumeSectionTextKey(data.data.last_viewed_section_text_key.trim());
        } else {
          resumeSectionTextKeyRef.current = null;
          setResumeSectionTextKey(null);
        }
        setLessonData(lessonDataWithoutVideos);
        setTextLoading(false);
        
        // レッスンデータにtextContentが含まれている場合は、textContentステートに設定
        if (data.data.textContent) {
          console.log('レッスンデータからtextContentを設定:', {
            textContentLength: data.data.textContent.length,
            fileType: data.data.file_type,
            s3Key: data.data.s3_key
          });
          setTextContent(data.data.textContent);
          setTextContentS3Key(data.data.s3_key || null);
        } else {
          console.log('レッスンデータにtextContentが含まれていません:', {
            hasTextContent: !!data.data.textContent,
            fileType: data.data.file_type,
            s3Key: data.data.s3_key
          });
        }
        
        // 課題提出状況/提出物確認は、プレビューでは利用者データを書き換え/誤参照する可能性があるため無効化
        if (!isPreview) {
          console.log(`🔍 課題提出状況確認開始: レッスンID ${targetLessonId}`);
          await checkAssignmentStatus(targetLessonId);
          await fetchUploadedFiles(targetLessonId);
        } else {
          setAssignmentStatus({ hasAssignment: false, assignmentSubmitted: false });
          setUploadedFiles([]);
        }
        
        // レッスンデータ取得成功後、セクションデータを取得
        // currentLessonDataにはvideosを含めない（セクションデータで設定される）
        const lessonDataForSection = {
          ...data.data,
          videos: [] // セクションデータで動画を設定するため、ここでは空配列に設定
        };
        console.log('レッスンデータ取得成功、セクションデータを取得開始:', lessonDataForSection);
        await fetchSectionData(targetLessonId, 0, lessonDataForSection);
        
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
        setTextContentS3Key(null);
        setPdfTextContent('');
        setChatMessages([]);
        setCurrentSection(0);
        setResumeSectionIndex(null);
        resumeSectionIndexRef.current = null;
        setResumeSectionTextKey(null);
        resumeSectionTextKeyRef.current = null;
        if (sectionProgressUpdateTimeoutRef.current) {
          clearTimeout(sectionProgressUpdateTimeoutRef.current);
          sectionProgressUpdateTimeoutRef.current = null;
        }
        setPdfTextExtracted(false);
        setPdfProcessingStatus('idle');
        setAssignmentStatus({ hasAssignment: false, assignmentSubmitted: false }); // 課題状況もクリア
      }
      
      // 新しいレッスンのデータを取得
      const targetLessonId = currentLesson; // 現在の値を保存
      console.log(`🚀 即座にレッスンデータ取得開始: レッスンID ${targetLessonId}`);
      fetchLessonData(0, targetLessonId);
      if (!isPreview) {
        checkAssignmentStatus(targetLessonId); // 課題提出状況も確認
      }
    }
  }, [currentLesson]); // currentLessonのみに依存

  // レッスンデータ・セクションが設定された時点で、セッションストレージにコンテキストがあれば完了状態に復元
  // （複数キーを試行し、TextSection と同一の「アクティブキー」で保存されていれば確実に復元する）
  useEffect(() => {
    if (!lessonData || lessonData.file_type !== 'pdf') return;
    const lessonId = lessonData.id;
    const fileType = lessonData.file_type;
    const keysToTry = [
      lessonData.s3_key,
      sectionData?.[currentSection]?.text_file_key,
      ...(Array.isArray(sectionData) ? sectionData.map(s => s.text_file_key).filter(Boolean) : [])
    ].filter(Boolean);
    const uniqueKeys = [...new Set(keysToTry)];
    for (const s3Key of uniqueKeys) {
      const stored = SessionStorageManager.getContext(lessonId, s3Key, fileType);
      if (stored && stored.context && typeof stored.context === 'string' && stored.context.length > 0) {
        const isError = stored.context.startsWith('エラー:') ||
          stored.context.startsWith('PDFファイルが見つかりません') ||
          stored.context.startsWith('テキスト抽出に失敗');
        if (!isError) {
          console.log('セッションストレージからPDFコンテキストを復元:', { s3Key, contextLength: stored.context.length });
          setPdfProcessingStatus('completed');
          setPdfTextExtracted(true);
          setPdfTextContent(stored.context);
          setTextContentS3Key(s3Key);
          setTextLoading(false);
          return;
        }
      }
    }
    // コンテキストが見つからなくても 'idle' に戻さない（handlePdfTextUpdate で既に 'completed' になっている可能性があるため上書きしない）
  }, [lessonData, sectionData, currentSection]);

  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      layoutInitializedRef.current = true;
      return;
    }

    const storageKey = buildLayoutStorageKey(userId);

    if (layoutStorageKeyRef.current !== storageKey) {
      layoutStorageKeyRef.current = storageKey;
      layoutInitializedRef.current = false;
      // ユーザーが切り替わったらいったんデフォルトに戻す（前のユーザーのレイアウトを表示しない）
      setWorkspaceLayouts({
        withAssignment: createDefaultLayouts(true),
        withoutAssignment: createDefaultLayouts(false)
      });
    }

    if (layoutInitializedRef.current) {
      return;
    }

    let cancelled = false;
    const loadingForUserId = userId;

    const applyLayouts = (parsedLayouts) => {
      if (!parsedLayouts || cancelled) return;
      let withA = parsedLayouts.withAssignment
        ? normalizeLayouts(parsedLayouts.withAssignment, true, null)
        : undefined;
      let withoutA = parsedLayouts.withoutAssignment
        ? normalizeLayouts(parsedLayouts.withoutAssignment, false, null)
        : undefined;
      if (withA && !withoutA) withoutA = layoutWithoutAssignment(withA);
      if (withA && withoutA) {
        const synced = syncCommonLayoutItems(withA, withoutA);
        withA = synced.withLayout;
        withoutA = synced.withoutLayout;
      }
      setWorkspaceLayouts(prevLayouts => ({
        withAssignment: withA || prevLayouts.withAssignment,
        withoutAssignment: withoutA || prevLayouts.withoutAssignment
      }));
    };

    (async () => {
      // プレビューでない場合は先にAPIから取得（APIは常にログインユーザー分を返すため安全）
      if (!isPreview) {
        try {
          const token = localStorage.getItem('accessToken');
          const response = await fetch(`${API_BASE_URL}/api/learning/workspace-layout`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (cancelled) return;
          if (response.ok) {
            const json = await response.json();
            if (json.success && json.data) {
              console.log('保存済みワークスペースレイアウトをDBから読み込みました:', json.data);
              applyLayouts(json.data);
              layoutInitializedRef.current = true;
              return;
            }
          }
        } catch (err) {
          console.warn('レイアウトのAPI取得に失敗しました。ローカルを参照します。', err);
        }
      }
      // フォールバック: ローカルストレージ（読み出し時点のユーザーと一致する場合のみ適用）
      try {
        const storedLayouts = localStorage.getItem(storageKey);
        if (storedLayouts) {
          const parsedLayouts = JSON.parse(storedLayouts);
          if (!cancelled && getUserId() === loadingForUserId) {
            console.log('保存済みワークスペースレイアウトをローカルから読み込みます:', parsedLayouts);
            applyLayouts(parsedLayouts);
          }
        }
      } catch (error) {
        if (!cancelled) console.error('学習ワークスペースレイアウトの読み込みに失敗しました:', error);
      } finally {
        if (!cancelled) layoutInitializedRef.current = true;
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser, getUserId, isPreview]);

  // ウィジェット表示状態をDB主・ローカル補助で読み込み
  useEffect(() => {
    const userId = getUserId();
    if (!userId) {
      return;
    }

    const storageKey = `studysphere:widgetVisibility:user:${userId}`;
    let cancelled = false;

    const applyVisibility = (visibility) => {
      if (!visibility || typeof visibility !== 'object' || cancelled) return;
      setWidgetVisibility(prev => ({
        ...prev,
        video: visibility.video !== false,
        text: visibility.text !== false,
        chat: visibility.chat !== false,
        assignment: visibility.assignment !== false
      }));
    };

    (async () => {
      if (!isPreview) {
        try {
          const token = localStorage.getItem('accessToken');
          const response = await fetch(`${API_BASE_URL}/api/learning/widget-visibility`, {
            headers: token ? { Authorization: `Bearer ${token}` } : {}
          });
          if (cancelled) return;
          if (response.ok) {
            const json = await response.json();
            if (json.success && json.data) {
              console.log('ウィジェット表示設定をDBから読み込みました:', json.data);
              applyVisibility(json.data);
              return;
            }
          }
        } catch (err) {
          console.warn('ウィジェット表示設定のAPI取得に失敗しました。ローカルを参照します。', err);
        }
      }
      try {
        const stored = localStorage.getItem(storageKey);
        if (stored && getUserId() === userId) {
          const parsed = JSON.parse(stored);
          applyVisibility(parsed);
        }
      } catch (error) {
        if (!cancelled) console.error('ウィジェット表示状態の読み込みに失敗しました:', error);
      }
    })();

    return () => { cancelled = true; };
  }, [currentUser, getUserId, isPreview]);

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
    setTextContent('');
    setTextContentS3Key(null);
    setAssignmentStatus({ hasAssignment: false, assignmentSubmitted: false }); // 課題状況をクリア
    
    if (courseData) {
      // プレビュー中はプレビューパラメータを引き継ぐ
      if (isPreview) {
        const params = buildPreviewQueryParams({ course: String(courseData.id), lesson: String(lessonId) });
        navigate(`/student/enhanced-learning?${params.toString()}`);
      } else {
        navigate(`/student/enhanced-learning?course=${courseData.id}&lesson=${lessonId}`);
      }
    }
    
    // 新しいレッスンデータの取得はuseEffectで自動実行される
    console.log(`✅ レッスン変更処理完了: ${lessonId}`);
  };

  // 複数テキストが存在するかどうかを判定する関数
  const hasMultipleTexts = (sections) => {
    if (!sections || !Array.isArray(sections) || sections.length === 0) {
      return false;
    }
    
    // text_file_keyを持つセクションを抽出
    const sectionsWithText = sections.filter(section => section.text_file_key);
    
    // text_file_keyを持つセクションが2つ以上ある場合、複数テキストと判定
    if (sectionsWithText.length >= 2) {
      // 異なるtext_file_keyが存在するか確認
      const uniqueTextFileKeys = new Set(
        sectionsWithText.map(section => section.text_file_key)
      );
      return uniqueTextFileKeys.size > 1;
    }
    
    return false;
  };

  // セクション変更処理
  const changeSection = (sectionIndex) => {
     if (!sectionData || !Array.isArray(sectionData)) return;
     
     const newSection = sectionData[sectionIndex];
     if (!newSection) return;
     
     setCurrentSection(sectionIndex);

     // 最後に閲覧したセクションを保存（localStorageはプレビュー含む・リロードで復元するため）
     const userId = getUserId();
     SessionStorageManager.saveLastSection(userId, currentLesson, sectionIndex, newSection?.text_file_key || null);

     // DBへはプレビューでは保存しない（閲覧のみ）
     if (!isPreview) {
       try {
         if (sectionProgressUpdateTimeoutRef.current) {
           clearTimeout(sectionProgressUpdateTimeoutRef.current);
         }
         sectionProgressUpdateTimeoutRef.current = setTimeout(async () => {
           await fetch(`${API_BASE_URL}/api/learning/progress/lesson`, {
             method: 'PUT',
             headers: {
               'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
               'Content-Type': 'application/json'
             },
             body: JSON.stringify({
               userId: parseInt(userId),
               lessonId: parseInt(currentLesson),
               status: 'in_progress',
               lastViewedSectionIndex: sectionIndex,
               lastViewedSectionTextKey: newSection?.text_file_key || null
             })
           });
         }, 600);
       } catch (e) {
         console.warn('最後に閲覧したセクションの保存に失敗しました:', e);
       }
     }
     
     console.log('セクション変更:', {
       sectionIndex,
       newSection,
       lessonS3Key: lessonData?.s3_key,
       sectionTextFileKey: newSection?.text_file_key
     });
     
     // 複数テキストが存在するかどうかを判定
     const multipleTexts = hasMultipleTexts(sectionData);
     
     const sectionTextFileKey = newSection?.text_file_key;
     const currentS3Key = lessonData?.s3_key;
     
     // 複数テキストが存在する場合と単一テキストの場合で処理を分ける
     let shouldUpdateText = false;
     
     if (multipleTexts) {
       // 複数テキストが存在する場合：セクションにtext_file_keyがあれば常に更新
       if (sectionTextFileKey) {
         shouldUpdateText = true;
         console.log('複数テキストが存在します。セクションのテキストファイルを更新します:', {
           sectionTextFileKey,
           currentS3Key,
           newSection
         });
       }
     } else {
       // 単一テキストの場合：従来の処理（text_file_keyが存在し、現在のs3_keyと異なる場合のみ更新）
       if (sectionTextFileKey && sectionTextFileKey !== currentS3Key) {
         shouldUpdateText = true;
         console.log('単一テキストの場合。セクションのテキストファイルを更新します:', {
           sectionTextFileKey,
           currentS3Key,
           newSection
         });
       }
     }
     
     if (shouldUpdateText) {
       // バックエンドから完全パスとfile_typeが返されているので、それを使用
       const finalS3Key = sectionTextFileKey; // バックエンドで既に完全パスに変換されている
       
       // ファイルタイプを判定（newSection.file_typeが存在する場合はそれを使用）
       let fileType = newSection?.file_type;
       if (!fileType) {
         // 拡張子から判定（フォールバック）
         const lowerKey = finalS3Key.toLowerCase();
         if (lowerKey.endsWith('.md')) {
           fileType = 'text/markdown';
         } else if (lowerKey.endsWith('.txt')) {
           fileType = 'text/plain';
         } else if (lowerKey.endsWith('.pdf')) {
           fileType = 'application/pdf';
         } else if (lowerKey.endsWith('.rtf')) {
           fileType = 'application/rtf';
         } else {
           fileType = 'text/plain'; // デフォルト
         }
       }
       
       console.log('ファイルタイプ判定:', {
         sectionFileType: newSection?.file_type,
         finalFileType: fileType,
         s3Key: finalS3Key,
         source: newSection?.source
       });
       
       // lessonDataを更新（s3_keyとfile_typeを更新）
       // TextSectionコンポーネントがs3_keyの変更を検知して、新しいテキストファイルを読み込む
       setLessonData(prev => {
         if (!prev) {
           console.warn('lessonDataがnullのため、テキストファイルを更新できません');
           return prev;
         }
         return {
           ...prev,
           s3_key: finalS3Key,
           file_type: fileType,
           textContent: '' // テキストコンテンツをリセット（新しいファイルを読み込むため）
         };
       });
       
       // テキストコンテンツをリセット
       setTextContent('');
       setTextContentS3Key(null);
       setPdfTextContent('');
       setTextLoading(true);
       setPdfTextExtracted(false);
       setPdfProcessingStatus('idle');
     }
     
     // 動画がある場合のみ更新
     if (newSection.video_id && newSection.youtube_url) {
       const sectionVideo = {
         id: newSection.video_id,
         title: newSection.video_title || 'セクション動画',
         description: newSection.video_description || '',
         youtube_url: newSection.youtube_url,
         duration: newSection.video_duration || ''
       };
       
       setLessonData(prev => {
         if (!prev) {
           console.warn('lessonDataがnullのため、動画を設定できません');
           return prev;
         }
         return {
           ...prev,
           videos: [sectionVideo]
         };
       });
     } else {
       // 動画がない場合は空の配列に設定
       setLessonData(prev => {
         if (!prev) {
           console.warn('lessonDataがnullのため、動画配列を設定できません');
           return prev;
         }
         return {
           ...prev,
           videos: []
         };
       });
     }
   };

  // セクションデータを取得
  const fetchSectionData = async (lessonId, retryCount = 0, currentLessonData = null) => {
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
         
         // 重複を除去（ファイル名のみで比較、大文字小文字を区別せず）
         // 単独登録（lesson_text_video_links）を優先し、複数登録（lesson_text_files）で重複する場合は除外
         // text_file_keyはファイル名のみ、s3_keyは完全パスの可能性があるため、ファイル名のみを抽出
         const extractFileName = (key) => {
           if (!key) return '';
           // スラッシュで分割して最後の部分（ファイル名）を取得
           const parts = key.split('/');
           return parts[parts.length - 1].trim().toLowerCase();
         };
         
         const seenTextFileKeys = new Set();
         const uniqueSections = data.data.filter(section => {
           if (!section.text_file_key) return true; // text_file_keyがない場合は含める
           const fileName = extractFileName(section.text_file_key);
           if (seenTextFileKeys.has(fileName)) {
             // 既に存在する場合、単独登録を優先（sourceがlesson_text_video_linksの場合は既に追加されている）
             console.warn('重複セクションを除外:', {
               text_file_key: section.text_file_key,
               extractedFileName: fileName,
               video_title: section.video_title,
               section_title: section.section_title,
               source: section.source
             });
             return false;
           }
           seenTextFileKeys.add(fileName);
           return true;
         });
         
         // ソート: まずソース（単独登録を先）、次にlink_order、最後にcreated_at
         const sortedSections = uniqueSections.sort((a, b) => {
           // 1. ソースでソート（lesson_text_video_linksを先、lesson_text_filesを後）
           const sourceOrder = { 'lesson_text_video_links': 0, 'lesson_text_files': 1 };
           const sourceA = sourceOrder[a.source] ?? 1;
           const sourceB = sourceOrder[b.source] ?? 1;
           
           if (sourceA !== sourceB) {
             return sourceA - sourceB;
           }
           
           // 2. link_orderでソート（link_orderがNULLの場合は最後に配置）
           const orderA = a.link_order != null ? Number(a.link_order) : 999999;
           const orderB = b.link_order != null ? Number(b.link_order) : 999999;
           
           if (orderA !== orderB) {
             return orderA - orderB;
           }
           
           // 3. link_orderが同じ場合はcreated_atでソート
           const dateA = a.created_at ? new Date(a.created_at) : new Date(0);
           const dateB = b.created_at ? new Date(b.created_at) : new Date(0);
           return dateA - dateB;
         });
         
         console.log('セクションデータ処理完了:', {
           元の数: data.data.length,
           重複除去後: uniqueSections.length,
           ソート後: sortedSections.length,
           ソート済みセクション: sortedSections.map(s => ({
             link_order: s.link_order,
             title: s.video_title || s.section_title,
             text_file_key: s.text_file_key
           }))
         });
         
         setSectionData(sortedSections);
          
         // セクションデータが空の場合（動画がない場合）でも処理を続行
         if (sortedSections.length > 0) {
          // 初期表示セクション（優先順位: URLのsection → プレビュー時はlocalStorage → DB保存のテキストキー → DB保存のindex → localStorage → 0）
           const sectionParam = searchParams.get('section');
           let initialSectionIndex = 0;
           if (sectionParam != null) {
             const idx = parseInt(sectionParam, 10);
             if (!isNaN(idx) && idx >= 0 && idx < sortedSections.length) {
               initialSectionIndex = idx;
             }
          } else if (isPreview) {
            // プレビュー時: リロードで同じセクションに戻るよう、localStorageを優先
            const lastSection = SessionStorageManager.getLastSection(getUserId(), lessonId);
            if (lastSection && typeof lastSection.index === 'number' && lastSection.index >= 0 && lastSection.index < sortedSections.length) {
              initialSectionIndex = lastSection.index;
              console.log('プレビュー: 最後に開いたセクションをローカルから復元:', { lessonId, initialSectionIndex });
            }
          } else if (typeof resumeSectionTextKeyRef.current === 'string' && resumeSectionTextKeyRef.current.trim().length > 0) {
            const targetKey = resumeSectionTextKeyRef.current.trim();
            const normalize = (key) => String(key || '').trim();
            const extractFileName = (key) => {
              const parts = String(key || '').split('/');
              return (parts[parts.length - 1] || '').trim().toLowerCase();
            };
            const exactIdx = sortedSections.findIndex(s => normalize(s.text_file_key) === targetKey);
            if (exactIdx >= 0) {
              initialSectionIndex = exactIdx;
            } else {
              // フォールバック: ファイル名一致（旧データ/不整合に強くする）
              const targetFile = extractFileName(targetKey);
              const byNameIdx = sortedSections.findIndex(s => extractFileName(s.text_file_key) === targetFile);
              if (byNameIdx >= 0) {
                initialSectionIndex = byNameIdx;
              }
            }
           } else if (typeof resumeSectionIndexRef.current === 'number' && resumeSectionIndexRef.current >= 0 && resumeSectionIndexRef.current < sortedSections.length) {
             initialSectionIndex = resumeSectionIndexRef.current;
           } else {
             // APIに保存が無い場合: 最後に開いたセクションをlocalStorageから復元（学習再開）
             const userId = getUserId();
             const lastSection = SessionStorageManager.getLastSection(userId, lessonId);
             if (lastSection && typeof lastSection.index === 'number' && lastSection.index >= 0 && lastSection.index < sortedSections.length) {
               initialSectionIndex = lastSection.index;
               console.log('最後に開いたセクションをローカルから復元:', { lessonId, initialSectionIndex });
             }
           }

           setCurrentSection(initialSectionIndex);
           
           // 修正: 初期表示セクションを使用
           const firstSection = sortedSections[initialSectionIndex];
           const lessonS3Key = currentLessonData?.s3_key || lessonData?.s3_key;
           const sectionTextFileKey = firstSection?.text_file_key;

           // 旧データ救済:
           // 以前は last_viewed_section_index しか保存していなかったため、混在ソートで復帰先がズレやすい。
           // text_key が未保存のユーザーは、初回ロード時に “現在の並びで解決したセクションの text_key” をDBへ補完保存する。
           if (
             sectionParam == null &&
             (!resumeSectionTextKeyRef.current || String(resumeSectionTextKeyRef.current).trim().length === 0) &&
             sectionTextFileKey &&
             typeof sectionTextFileKey === 'string' &&
             sectionTextFileKey.trim().length > 0
           ) {
             try {
               const userId = getUserId();
               console.log('🧩 last_viewed_section_text_key を補完保存します（旧データ救済）:', {
                 userId,
                 lessonId,
                 initialSectionIndex,
                 sectionTextFileKey
               });
               // ref/state も更新して以降のロジックで優先されるようにする
               resumeSectionTextKeyRef.current = sectionTextFileKey.trim();
               setResumeSectionTextKey(sectionTextFileKey.trim());

               await fetch(`${API_BASE_URL}/api/learning/progress/lesson`, {
                 method: 'PUT',
                 headers: {
                   'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                   'Content-Type': 'application/json'
                 },
                 body: JSON.stringify({
                   userId: parseInt(userId, 10),
                   lessonId: parseInt(lessonId, 10),
                   status: 'in_progress',
                   lastViewedSectionIndex: initialSectionIndex,
                   lastViewedSectionTextKey: sectionTextFileKey.trim()
                 })
               });
             } catch (e) {
               console.warn('last_viewed_section_text_key の補完保存に失敗しました:', e);
             }
           }
           
           console.log('セクションデータ取得成功:', {
             sectionCount: data.data.length,
             firstSection: firstSection,
             initialSectionIndex,
             lessonS3Key: lessonS3Key,
             sectionTextFileKey: sectionTextFileKey,
             sectionFileType: firstSection?.file_type,
             currentLessonData: currentLessonData,
             hasVideoId: !!firstSection?.video_id,
             hasYoutubeUrl: !!firstSection?.youtube_url,
             videoId: firstSection?.video_id,
             youtubeUrl: firstSection?.youtube_url
           });
           
           // テキストファイルの更新（text_file_keyとfile_typeを更新）
           // セクションのtext_file_keyとlessonS3Keyのファイル名を比較
           const extractFileName = (key) => {
             if (!key) return '';
             const parts = key.split('/');
             return parts[parts.length - 1].trim().toLowerCase();
           };
           
           const sectionFileName = extractFileName(sectionTextFileKey);
           const lessonFileName = extractFileName(lessonS3Key);
           
           // ファイル名が一致する場合は、textContentをリセットしない
           const fileNamesMatch = sectionFileName === lessonFileName;
           
           if (sectionTextFileKey && sectionTextFileKey !== lessonS3Key) {
             console.log('最初のセクションのテキストファイルを更新します:', {
               sectionTextFileKey,
               lessonS3Key,
               sectionFileType: firstSection?.file_type,
               sectionFileName,
               lessonFileName,
               fileNamesMatch
             });
             
             // ファイルタイプを判定（firstSection.file_typeが存在する場合はそれを使用）
             let fileType = firstSection?.file_type;
             if (!fileType) {
               // 拡張子から判定（フォールバック）
               const lowerKey = sectionTextFileKey.toLowerCase();
               if (lowerKey.endsWith('.md')) {
                 fileType = 'text/markdown';
               } else if (lowerKey.endsWith('.txt')) {
                 fileType = 'text/plain';
               } else if (lowerKey.endsWith('.pdf')) {
                 fileType = 'application/pdf';
               } else if (lowerKey.endsWith('.rtf')) {
                 fileType = 'application/rtf';
               } else {
                 fileType = 'text/plain'; // デフォルト
               }
             }
             
             console.log('最初のセクションのファイルタイプ判定:', {
               sectionFileType: firstSection?.file_type,
               finalFileType: fileType,
               s3Key: sectionTextFileKey,
               source: firstSection?.source
             });
             
             // lessonDataを更新（s3_keyとfile_typeを更新）
             // 重要: 復帰/初期ロード時に old textContent が残ると、
             // TextSection が「新しい s3_key に旧コンテンツを保存」してしまい表示がズレるため、
             // s3_key を切り替える際は必ず textContent をクリアして再取得させる。
             setLessonData(prev => {
               const baseData = currentLessonData || prev;
               if (!baseData) {
                 console.warn('lessonDataがnullのため、テキストファイルを更新できません');
                 return prev;
               }
               return {
                 ...baseData,
                 s3_key: sectionTextFileKey,
                 file_type: fileType,
                 textContent: '' // TextSectionに再読み込みさせるため必ずクリア
               };
             });
             
            // s3_key を切り替える場合: PDFでセッションにコンテキストがあれば復元、なければリセット
            const isPdfSection = (fileType || '').toLowerCase().includes('pdf');
            const lessonIdForRestore = currentLessonData?.id ?? lessonData?.id;
            let restoredPdfFromStorage = false;
            if (isPdfSection && lessonIdForRestore) {
              const sectionsFromFetch = Array.isArray(data.data) ? data.data : [];
            const keysToTryRestore = [sectionTextFileKey, lessonS3Key, ...sectionsFromFetch.map(s => s.text_file_key).filter(Boolean)];
              for (const k of [...new Set(keysToTryRestore)]) {
                const stored = SessionStorageManager.getContext(lessonIdForRestore, k, fileType);
                if (stored?.context && typeof stored.context === 'string' && stored.context.length > 0 &&
                    !stored.context.startsWith('エラー') && !stored.context.startsWith('PDFファイルが見つかりません') && !stored.context.startsWith('テキスト抽出に失敗')) {
                  setPdfTextContent(stored.context);
                  setTextContentS3Key(sectionTextFileKey);
                  setPdfTextExtracted(true);
                  setPdfProcessingStatus('completed');
                  setTextLoading(false);
                  restoredPdfFromStorage = true;
                  console.log('初期セクション適用: セッションストレージからPDFコンテキストを復元（リセット省略）');
                  break;
                }
              }
            }
            if (!restoredPdfFromStorage) {
              console.log('🔄 テキストコンテンツをリセットして再読み込みします（初期セクション適用）');
              setTextContent('');
              setTextContentS3Key(null);
              setPdfTextContent('');
              setTextLoading(true);
              setPdfTextExtracted(false);
              setPdfProcessingStatus('idle');
            }
           }
           
           // 動画がある場合のみ更新（既存の動画をクリアしてから新しい動画を設定）
           if (firstSection.video_id && firstSection.youtube_url) {
             const sectionVideo = {
               id: firstSection.video_id,
               title: firstSection.video_title || 'セクション動画',
               description: firstSection.video_description || '',
               youtube_url: firstSection.youtube_url,
               duration: firstSection.video_duration || ''
             };
             
             console.log('🎬 動画を設定します:', {
               sectionVideo,
               currentLessonData,
               hasCurrentLessonData: !!currentLessonData
             });
             
             setLessonData(prev => {
               // currentLessonDataが存在する場合はそれを優先（fetchLessonDataから渡された最新データ）
               const baseData = currentLessonData || prev;
               if (!baseData) {
                 console.warn('lessonDataがnullのため、動画を設定できません');
                 return prev;
               }
               // 既存の動画をクリアして、最初のセクションの動画のみを設定
               const updatedData = {
                 ...baseData,
                 videos: [sectionVideo] // 常に1つの動画のみ
               };
               console.log('🎬 動画設定後のlessonData:', {
                 videos: updatedData.videos,
                 videoCount: updatedData.videos.length,
                 lessonId: updatedData.id,
                 usedCurrentLessonData: !!currentLessonData,
                 prevVideos: prev?.videos
               });
               return updatedData;
             });
           } else {
             // セクションに動画がない場合: 既存の動画を保持（上書きしない）
             console.log('🎬 セクションに動画がありません。既存の動画を保持します');
             setLessonData(prev => {
               const baseData = currentLessonData || prev;
               if (!baseData) {
                 console.warn('lessonDataがnullのため、動画配列を設定できません');
                 return prev;
               }
               // 既存の動画がある場合は保持、ない場合のみ空配列に設定
               const existingVideos = baseData.videos || [];
               if (existingVideos.length > 0) {
                 console.log('🎬 既存の動画を保持します:', existingVideos);
                 return baseData; // 既存のデータをそのまま返す
               }
               console.log('🎬 既存の動画がないため、空配列に設定します');
               return {
                 ...baseData,
                 videos: [] // 既存の動画がない場合のみ空配列
               };
             });
           }
         } else {
           // セクションデータが空の場合: 既存の動画を保持（上書きしない）
           console.log('セクションデータが空です。既存の動画を保持します:', {
             lessonId: lessonId,
             lessonS3Key: currentLessonData?.s3_key || lessonData?.s3_key,
             existingVideos: currentLessonData?.videos || lessonData?.videos,
             existingVideoCount: (currentLessonData?.videos || lessonData?.videos || []).length
           });
           // セクションデータが空の場合、空配列を設定（複数のテキストを持たない学習画面であることを示す）
           setSectionData([]);
           setCurrentSection(0);
           // セクションデータが空の場合でも、currentLessonDataにs3_keyとfile_typeが存在する場合は保持する
           // これは単一テキスト、動画なしのレッスンで、既に読み込まれたテキストコンテンツを保持するため
           setLessonData(prev => {
             const baseData = currentLessonData || prev;
             if (!baseData) {
               console.warn('lessonDataがnullのため、動画配列を設定できません');
               return prev;
             }
             // 既存の動画がある場合は保持、ない場合のみ空配列に設定
             const existingVideos = baseData.videos || [];
             
             // currentLessonDataにs3_keyとfile_typeが存在する場合は保持する
             // これにより、単一テキスト、動画なしのレッスンでも、既に読み込まれたテキストコンテンツが保持される
             const shouldKeepS3Key = !!(currentLessonData?.s3_key);
             const shouldKeepFileType = !!(currentLessonData?.file_type);
             
             const updatedData = {
               ...baseData,
               // セクションデータが空で、かつcurrentLessonDataにs3_keyがない場合のみ、s3_keyをクリア
               s3_key: shouldKeepS3Key ? baseData.s3_key : null,
               // セクションデータが空で、かつcurrentLessonDataにfile_typeがない場合のみ、file_typeをクリア
               file_type: shouldKeepFileType ? baseData.file_type : null,
               videos: existingVideos.length > 0 ? existingVideos : [] // 既存の動画がある場合は保持、ない場合のみ空配列
             };
             
             if (existingVideos.length > 0) {
               console.log('🎬 既存の動画を保持します:', existingVideos);
             } else {
               console.log('🎬 既存の動画がないため、空配列に設定します');
             }
             
             if (shouldKeepS3Key || shouldKeepFileType) {
               console.log('✅ セクションデータが空ですが、currentLessonDataにs3_key/file_typeが存在するため、それらを保持します:', {
                 s3_key: updatedData.s3_key,
                 file_type: updatedData.file_type
               });
             } else {
               console.log('⚠️ セクションデータが空で、currentLessonDataにもs3_key/file_typeがないため、クリアしました');
             }
             return updatedData;
           });
           // PDFの処理はTextSectionコンポーネントで自動的に開始されるため、ここでは何もしない
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
            fetchSectionData(lessonId, retryCount + 1, currentLessonData);
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
          fetchSectionData(lessonId, retryCount + 1, currentLessonData);
        }, 2000 * (retryCount + 1));
        return;
      }
    }
  };

     // セクションの内容を表示（動画のみ）
   const displaySectionContent = (section) => {
     if (!section) return;
     
     console.log('セクション内容を表示:', section);
     
     // 動画がある場合のみ更新
     if (section.video_id && section.youtube_url) {
       const sectionVideo = {
         id: section.video_id,
         title: section.video_title || 'セクション動画',
         description: section.video_description || '',
         youtube_url: section.youtube_url,
         duration: section.video_duration || ''
       };
       
       setLessonData(prev => {
         if (!prev) {
           console.warn('lessonDataがnullのため、動画を設定できません');
           return prev;
         }
         return {
           ...prev,
           videos: [sectionVideo]
         };
       });
     } else {
       // 動画がない場合は空の配列に設定
       setLessonData(prev => {
         if (!prev) {
           console.warn('lessonDataがnullのため、動画配列を設定できません');
           return prev;
         }
         return {
           ...prev,
           videos: []
         };
       });
     }
   };

     // セクションテキストコンテンツ取得は不要（PDF処理はTextSectionで自動実行）

  // ユーザーIDを取得する関数
  // コースデータを取得
  const fetchCourseData = async (courseId, retryCount = 0, searchParams = null) => {
    try {
      const userId = getUserId();

      if (isPreview) {
        console.log(`（プレビュー）コースデータを取得中: コースID ${courseId} (試行回数: ${retryCount + 1})`);
        const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            // lessons を active のみに絞る（学習画面は active のみ閲覧対象）
            const lessons = Array.isArray(data.data?.lessons) ? data.data.lessons : [];
            const activeLessons = lessons.filter(l => l.status === 'active' || l.status === undefined);
            setCourseData({ ...data.data, lessons: activeLessons });

            const lessonParam = searchParams ? searchParams.get('lesson') : null;
            if (!lessonParam && activeLessons.length > 0) {
              setCurrentLesson(activeLessons[0].id);
            }
          }
        } else {
          const errorMessage = `（プレビュー）コースデータ取得失敗: ${response.status}`;
          console.error(errorMessage);
          const errorData = await response.json().catch(() => ({}));
          console.error('エラー詳細:', errorData);

          if (response.status >= 500 && retryCount < 2) {
            setTimeout(() => {
              fetchCourseData(courseId, retryCount + 1);
            }, 2000 * (retryCount + 1));
          }
        }
        return;
      }

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

      // 会話履歴を取得（現在の質問を除く、送信前の状態）
      const conversationHistory = chatMessages.filter(msg => 
        msg.sender === 'user' || msg.sender === 'ai'
      );

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

        // AIアシスタントに質問を送信（会話履歴を含める）
        const aiResponse = await AIAssistantService.askQuestion(
          question,
          currentSectionText,
          lessonData?.title || `レッスン${currentLesson}`,
          conversationHistory
        );

        if (aiResponse.success) {
          // AIの回答を追加（要約も一緒に保存）
          const aiMessage = {
            id: Date.now() + 1,
            text: aiResponse.answer, // 表示用の完全な回答
            summary: aiResponse.summary || '', // 会話履歴用の要約
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
      if (storedContext) {
        console.log('AIサポート用にセッションストレージからコンテキスト取得:', {
          contextLength: storedContext.context.length
        });
        return storedContext.context;
      }
    }
    
    // フォールバック: 既存のロジック
    if (currentSection >= 0 && sectionData && sectionData[currentSection]) {
      // セクション固有のテキストがある場合はそれを返す
      return textContent || pdfTextContent || lessonData?.description || 'テキスト内容が利用できません';
    }
    
    // デフォルトはレッスンのテキスト内容
    return textContent || pdfTextContent || lessonData?.description || 'テキスト内容が利用できません';
  };

  // PDFテキスト更新ハンドラー（テキストファイルも含む）
  const handlePdfTextUpdate = (newPdfText, meta = null) => {
    console.log('handlePdfTextUpdate 呼び出し:', { 
      textLength: newPdfText?.length,
      isError: newPdfText?.startsWith('エラー:'),
      isCancel: newPdfText?.includes('キャンセル'),
      textPreview: newPdfText?.substring(0, 100),
      fileType: meta?.fileType || lessonData?.file_type,
      s3Key: meta?.s3Key || lessonData?.s3_key
    });
    
    // textLoadingをfalseに設定（読み込み完了）
    setTextLoading(false);
    
    if (newPdfText && newPdfText.length > 0) {
      // エラーメッセージの判定をより厳密にする
      // 「失敗」や「タイムアウト」という文字列が含まれていても、エラーメッセージの形式でない場合は正常とみなす
      const isError = newPdfText.startsWith('エラー:') || 
                     newPdfText.startsWith('PDFファイルが見つかりません') ||
                     newPdfText.startsWith('テキスト抽出に失敗しました') ||
                     newPdfText.startsWith('テキストファイルの読み込みに失敗しました') ||
                     (newPdfText.includes('失敗') && newPdfText.length < 200) || // 短いエラーメッセージの場合
                     (newPdfText.includes('タイムアウト') && newPdfText.length < 200); // 短いエラーメッセージの場合
      
      if (isError) {
        setPdfProcessingStatus('error');
        console.log('テキスト処理でエラーが発生しました:', newPdfText);
      } else if (newPdfText.includes('キャンセル')) {
        setPdfProcessingStatus('idle');
        console.log('テキスト処理がキャンセルされました');
      } else {
        // 正常にテキストが抽出された場合（セッションストレージから取得した場合も含む）
        // PDF判定関数（TextSectionと同じロジック）
        const isPdfFile = (fileType, s3Key) => {
          if (!fileType && !s3Key) return false;
          const lowerFileType = fileType?.toLowerCase() || '';
          const lowerS3Key = s3Key?.toLowerCase() || '';
          
          // MD、TXT、RTFファイルの場合はPDFではない
          if (lowerFileType === 'text/markdown' || lowerFileType === 'md' || 
              lowerFileType === 'text/plain' || lowerFileType === 'txt' ||
              lowerFileType === 'application/rtf' || lowerFileType === 'rtf') {
            return false;
          }
          
          // PDF判定
          return lowerFileType === 'pdf' || 
                 lowerFileType === 'application/pdf' ||
                 lowerS3Key.endsWith('.pdf');
        };
        
        // meta があればそれで判定（TextSection から渡るため確実）、なければ lessonData を使用
        const fileTypeForCheck = meta?.fileType ?? lessonData?.file_type;
        const s3KeyForCheck = meta?.s3Key ?? lessonData?.s3_key;
        const isPdf = isPdfFile(fileTypeForCheck, s3KeyForCheck);
        
        if (isPdf) {
          // PDFファイルの場合
          setPdfTextExtracted(true);
          setPdfProcessingStatus('completed');
          setPdfTextContent(newPdfText);
          setTextContentS3Key(meta?.s3Key || lessonData?.s3_key || null);
          console.log('PDFテキスト抽出完了:', { textLength: newPdfText.length });
        } else {
          // テキストファイル（MD、TXT、RTF）の場合
          // pdfProcessingStatusを'completed'に設定して、AIアシスタントを有効化
          setPdfProcessingStatus('completed');
          setTextContent(newPdfText);
          setTextContentS3Key(meta?.s3Key || lessonData?.s3_key || null);
          console.log('テキストファイル読み込み完了:', { 
            textLength: newPdfText.length,
            fileType: lessonData?.file_type,
            s3Key: lessonData?.s3_key
          });
        }
      }
    } else {
      // 空のテキストの場合はエラーとして扱わない（まだ処理中の可能性がある）
      // ただし、既存のtextContentがある場合は保持する（空で上書きしない）
      if (textContent && textContent.length > 0) {
        console.log('テキストが空です（処理中または未処理）。既存のtextContentを保持します:', {
          existingTextLength: textContent.length
        });
        // 既存のtextContentを保持するため、何もしない
      } else {
        console.log('テキストが空です（処理中または未処理）');
      }
      // エラー状態に設定しない（処理中または未処理の可能性があるため）
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
    if (isPreview) {
      alert('プレビューでは成果物アップロードはできません。');
      return;
    }
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
    if (isPreview) {
      alert('プレビューでは提出物の削除はできません。');
      return;
    }
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

  const handleWorkspaceLayoutChange = useCallback((newLayouts) => {
    setWorkspaceLayouts(prevLayouts => {
      if (assignmentStatus.hasAssignment) {
        const withAssignment = normalizeLayouts(newLayouts, true, widgetVisibility);
        const withoutAssignment = layoutWithoutAssignment(withAssignment);
        const updatedLayouts = { withAssignment, withoutAssignment };
        persistWorkspaceLayouts(updatedLayouts);
        return updatedLayouts;
      }
      const withoutAssignment = normalizeLayouts(newLayouts, false, widgetVisibility);
      const withAssignment = prevLayouts.withAssignment;
      const mergedWith = { ...withAssignment };
      Object.keys(mergedWith).forEach(bp => {
        const arr = (mergedWith[bp] || []).map(item => {
          if (item.i === 'assignment') return item;
          const fromNew = (withoutAssignment[bp] || []).find(n => n.i === item.i);
          return fromNew ? { ...item, x: fromNew.x, y: fromNew.y, w: fromNew.w, h: fromNew.h } : item;
        });
        mergedWith[bp] = arr;
      });
      const updatedLayouts = { withAssignment: mergedWith, withoutAssignment };
      persistWorkspaceLayouts(updatedLayouts);
      return updatedLayouts;
    });
  }, [assignmentStatus.hasAssignment, persistWorkspaceLayouts, widgetVisibility]);

  // ウィジェットの表示/非表示を切り替え
  const persistWidgetVisibility = useCallback(async (visibility) => {
    const userId = getUserId();
    const storageKey = `studysphere:widgetVisibility:user:${userId}`;
    if (!isPreview) {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(`${API_BASE_URL}/api/learning/widget-visibility`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token && { Authorization: `Bearer ${token}` })
          },
          body: JSON.stringify({ visibility })
        });
        if (response.ok) {
          console.log('ウィジェット表示設定をDBに保存しました');
        } else {
          console.warn('ウィジェット表示設定のDB保存に失敗しました。ローカルに保存します。', response.status);
        }
      } catch (err) {
        console.warn('ウィジェット表示設定のAPI保存に失敗しました。ローカルに保存します。', err);
      }
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(visibility));
    } catch (error) {
      console.error('ウィジェット表示状態のローカル保存に失敗しました:', error);
    }
  }, [getUserId, isPreview]);

  const toggleWidgetVisibility = useCallback((widgetKey) => {
    setWidgetVisibility(prev => {
      const newVisibility = {
        ...prev,
        [widgetKey]: !prev[widgetKey]
      };
      persistWidgetVisibility(newVisibility);
      return newVisibility;
    });
  }, [persistWidgetVisibility]);

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

  // 表示状態に基づいてウィジェットをフィルタリング
  const workspaceWidgets = {
    video: widgetVisibility.video ? (
      <VideoSection lessonData={lessonData} />
    ) : null,
    text: widgetVisibility.text ? (
      <TextSection
        lessonData={lessonData}
        textContent={textContent}
        textContentS3Key={textContentS3Key}
        textLoading={textLoading}
        textContainerRef={textContainerRef}
        onTextContentUpdate={handlePdfTextUpdate}
        sectionData={sectionData}
        currentSection={currentSection}
        isLastSection={!sectionData || sectionData.length === 0 || currentSection === sectionData.length - 1}
        onSectionTestClick={() => {
          sessionStorage.removeItem(`test_data_${currentLesson}_${currentSection}`);
          if (isPreview) {
            const params = buildPreviewQueryParams({ lesson: String(currentLesson), section: String(currentSection) });
            navigate(`/student/section-test?${params.toString()}`);
          } else {
            navigate(`/student/section-test?lesson=${currentLesson}&section=${currentSection}`);
          }
        }}
        onNextSectionClick={() => {
          const lastSection = !sectionData || sectionData.length === 0 || currentSection === sectionData.length - 1;
          if (lastSection) {
            sessionStorage.removeItem(`test_data_lesson_${currentLesson}`);
            if (isPreview) {
              const params = buildPreviewQueryParams({ lesson: String(currentLesson) });
              navigate(`/student/lesson-test?${params.toString()}`);
            } else {
              navigate(`/student/lesson-test?lesson=${currentLesson}`);
            }
          } else {
            changeSection(currentSection + 1);
          }
        }}
      />
    ) : null,
    chat: widgetVisibility.chat ? (
      <ChatSection
        chatMessages={chatMessages}
        chatInput={chatInput}
        onChatInputChange={(e) => setChatInput(e.target.value)}
        onSendMessage={handleSendMessage}
        currentLessonData={currentLessonData}
        currentSectionText={getCurrentSectionText()}
        isAILoading={isAILoading}
        showAIError={lessonData?.file_type === 'pdf' && pdfProcessingStatus === 'error'}
        isAIEnabled={(() => {
          // PDF判定関数（TextSectionと同じロジック）
          const isPdfFile = (fileType, s3Key) => {
            if (!fileType && !s3Key) return false;
            const lowerFileType = fileType?.toLowerCase() || '';
            const lowerS3Key = s3Key?.toLowerCase() || '';
            
            // MD、TXT、RTFファイルの場合はPDFではない
            if (lowerFileType === 'text/markdown' || lowerFileType === 'md' || 
                lowerFileType === 'text/plain' || lowerFileType === 'txt' ||
                lowerFileType === 'application/rtf' || lowerFileType === 'rtf') {
              return false;
            }
            
            // PDF判定
            return lowerFileType === 'pdf' || 
                   lowerFileType === 'application/pdf' ||
                   lowerS3Key.endsWith('.pdf');
          };
          
          const isPdf = isPdfFile(lessonData?.file_type, lessonData?.s3_key);
          
          // PDFファイルの場合: 処理完了 or セッションにコンテキストあり or 既にテキスト取得済み
          if (isPdf) {
            const hasPdfContext = !!(pdfTextContent && pdfTextContent.length > 0 &&
              !pdfTextContent.startsWith('エラー') &&
              !pdfTextContent.startsWith('PDFファイルが見つかりません') &&
              !pdfTextContent.startsWith('テキスト抽出に失敗'));
            return pdfProcessingStatus === 'completed' ||
                   SessionStorageManager.hasContext(lessonData?.id, lessonData?.s3_key, lessonData?.file_type) ||
                   hasPdfContext;
          }
          
          // テキストファイル（MD、TXT、RTF）の場合
          return SessionStorageManager.hasContext(lessonData?.id, lessonData?.s3_key, lessonData?.file_type) ||
                 !!textContent;
        })()}
      />
    ) : null,
    assignment: (assignmentStatus.hasAssignment && widgetVisibility.assignment) ? (
      <FileUploadSection
        uploadedFiles={uploadedFiles}
        onFileDelete={handleFileDelete}
      />
    ) : null
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {isPreview && (
        <div className="w-full bg-yellow-50 border-b border-yellow-200 px-4 py-2 sticky top-0 z-[60]">
          <div className="max-w-7xl mx-auto text-yellow-800 text-sm">
            🎓 指導員プレビュー中（閲覧のみ）: 提出物/進捗更新は無効です。テストは「問題画面の閲覧のみ」可能（提出/採点/結果は無効）です（閲覧用ユーザ）
          </div>
        </div>
      )}
      {/* ヘッダー＋ステータスバー（スクロール時も固定表示） */}
      <div className="sticky top-0 z-50 bg-gradient-to-br from-blue-50 to-cyan-50 shadow-md">
        <LearningHeader
          lessonData={lessonData}
          courseData={courseData}
          currentLesson={currentLesson}
          currentSection={currentSection}
          sectionData={sectionData}
          onSectionChange={changeSection}
          onUploadModalOpen={() => {
            if (isPreview) {
              alert('プレビューでは成果物アップロードはできません。');
              return;
            }
            setShowUploadModal(true);
          }}
          onTestNavigate={(lessonId) => {
            if (isPreview) {
              // プレビューでもテスト問題画面への遷移は許可（提出/採点はテスト側でブロック）
              const params = buildPreviewQueryParams({ lesson: String(lessonId) });
              navigate(`/student/test?${params.toString()}`);
              return;
            }
            navigate(`/student/test?lesson=${lessonId}`);
          }}
          isTestEnabled={
            pdfProcessingStatus === 'completed' || // PDF処理完了時
            (lessonData?.file_type === 'pdf' && (
              SessionStorageManager.hasContext(lessonData?.id, lessonData?.s3_key, lessonData?.file_type) ||
              (pdfTextContent && pdfTextContent.length > 0 &&
                !pdfTextContent.startsWith('エラー') &&
                !pdfTextContent.startsWith('PDFファイルが見つかりません') &&
                !pdfTextContent.startsWith('テキスト抽出に失敗'))
            )) || // PDFでコンテキストあり or テキスト取得済み
            (lessonData?.file_type !== 'pdf' && lessonData?.textContent) // テキストファイルの場合
          }
          hasAssignment={assignmentStatus.hasAssignment}
          assignmentSubmitted={assignmentStatus.assignmentSubmitted}
          isPreview={isPreview}
          previewDisabledReason="プレビューではテスト/提出物操作はできません"
          previewQueryParams={isPreview ? buildPreviewQueryParams({}).toString() : ''}
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
      </div>

      {/* ウィジェット表示 on/off 切り替えバー */}
      <div className="w-full bg-white border-b border-gray-200 px-4 py-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-3 justify-center">
          <span className="text-sm font-medium text-gray-700">表示:</span>
          <button
            onClick={() => toggleWidgetVisibility('video')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              widgetVisibility.video
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            🎥 動画学習 {widgetVisibility.video ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => toggleWidgetVisibility('text')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              widgetVisibility.text
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            📄 テキスト教材 {widgetVisibility.text ? 'ON' : 'OFF'}
          </button>
          <button
            onClick={() => toggleWidgetVisibility('chat')}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
              widgetVisibility.chat
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
            }`}
          >
            🤖 AIアシスタント {widgetVisibility.chat ? 'ON' : 'OFF'}
          </button>
          {assignmentStatus.hasAssignment && (
            <button
              onClick={() => toggleWidgetVisibility('assignment')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                widgetVisibility.assignment
                  ? 'bg-blue-500 text-white hover:bg-blue-600'
                  : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
              }`}
            >
              📁 課題提出 {widgetVisibility.assignment ? 'ON' : 'OFF'}
            </button>
          )}
        </div>
      </div>

      {/* メインコンテンツ - フリーレイアウト（ドラッグ＆リサイズ可能） */}
      <div className="w-full px-4 sm:px-6 lg:px-8 py-8">
        {/* 固定レイアウト（3列グリッド）- フリーレイアウトに切り替えたため無効化 */}
        {/*
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {workspaceWidgets.video && (
            <div className="lg:col-span-1 self-start w-full min-h-[500px]">
              {workspaceWidgets.video}
            </div>
          )}
          {workspaceWidgets.text && (
            <div ref={textSectionContainerRef} className="lg:col-span-1 min-h-[800px]">
              {workspaceWidgets.text}
            </div>
          )}
          <div className="lg:col-span-1 flex flex-col gap-6">
            {workspaceWidgets.chat && (
              <div className="min-h-[800px]">
                {workspaceWidgets.chat}
              </div>
            )}
            {workspaceWidgets.assignment && (
              <div>
                {workspaceWidgets.assignment}
              </div>
            )}
          </div>
        </div>
        */}
        <LearningWorkspaceLayout
          widgets={workspaceWidgets}
          layouts={assignmentStatus.hasAssignment ? workspaceLayouts.withAssignment : workspaceLayouts.withoutAssignment}
          hasAssignment={assignmentStatus.hasAssignment}
          widgetVisibility={widgetVisibility}
          onLayoutsChange={handleWorkspaceLayoutChange}
        />
      </div>

      {/* アップロードモーダル（課題がある場合のみ表示） */}
      {assignmentStatus.hasAssignment && !isPreview && (
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
