import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MultipleChoiceTest from '../components/learning/MultipleChoiceTest';
import { SessionStorageManager } from '../utils/sessionStorage';
import { API_BASE_URL } from '../config/apiConfig';

const SectionTestPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const [currentLesson, setCurrentLesson] = useState(1);
  const [currentSection, setCurrentSection] = useState(0);
  const previousSectionRef = useRef(null); // 前回のセクション番号を記録
  const abortControllerRef = useRef(null);
  const currentLessonRef = useRef(currentLesson);
  const currentSectionRef = useRef(currentSection);

  useEffect(() => {
    currentLessonRef.current = currentLesson;
  }, [currentLesson]);
  useEffect(() => {
    currentSectionRef.current = currentSection;
  }, [currentSection]);

  // 初期化時のURLパラメータ確認（デバッグ時のみ）
  console.log('SectionTestPage初期化:', {
    url: window.location.href,
    search: window.location.search,
    lessonParam: searchParams.get('lesson'),
    sectionParam: searchParams.get('section'),
    allParams: Object.fromEntries(searchParams.entries())
  });
  const [testData, setTestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lessonData, setLessonData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const GENERATION_FAILURE_MESSAGE = '問題の作成に失敗しました。再読み込みをしてください。';

  const handleTestGenerationFailure = (detail) => {
    if (detail) {
      console.warn('セクションテストの問題作成に失敗しました:', detail);
    }
    setTestData(null);
    setError(GENERATION_FAILURE_MESSAGE);
  };

  // URLパラメータからレッスン番号とセクション番号を取得
  useEffect(() => {
    const lessonParam = searchParams.get('lesson');
    const sectionParam = searchParams.get('section');
    
    console.log('URLパラメータ取得:', {
      lessonParam,
      sectionParam,
      allParams: Object.fromEntries(searchParams.entries())
    });
    
    if (lessonParam) {
      const lessonNumber = parseInt(lessonParam);
      if (lessonNumber >= 1) {
        console.log('レッスン番号設定:', lessonNumber);
        setCurrentLesson(lessonNumber);
      }
    } else {
      console.warn('レッスンパラメータが見つかりません。デフォルト値(1)を使用します。');
    }
    
    if (sectionParam) {
      const sectionNumber = parseInt(sectionParam);
      if (sectionNumber >= 0) {
        console.log('セクション番号設定:', sectionNumber);
        setCurrentSection(sectionNumber);
      }
    } else {
      console.warn('セクションパラメータが見つかりません。デフォルト値(0)を使用します。');
    }
  }, [searchParams]);

  // レッスンデータとセクションデータを取得
  // 注意: URLとstateのずれによる二重fetch・後勝ち上書きを防ぐため、
  // AbortControllerでキャンセルし、リクエスト一致時のみstateを更新する
  useEffect(() => {
    if (!currentLesson) {
      console.log('レッスン番号が未設定のため、データ取得をスキップします');
      return;
    }

    const lessonParam = searchParams.get('lesson');
    const sectionParam = searchParams.get('section');
    const urlLesson = lessonParam ? parseInt(lessonParam, 10) : null;
    const urlSection = sectionParam ? parseInt(sectionParam, 10) : null;
    if (urlLesson != null && urlLesson >= 1 && urlSection != null && urlSection >= 0 &&
        currentLesson === 1 && currentSection === 0 && (urlLesson !== 1 || urlSection !== 0)) {
      return;
    }

    const testCacheKey = `test_data_${currentLesson}_${currentSection}`;
    const cachedTestData = sessionStorage.getItem(testCacheKey);
    const sectionChanged = previousSectionRef.current !== null && previousSectionRef.current !== currentSection;

    if (sectionChanged) {
      console.log('セクションが変更されたため、テストデータをクリアして再生成します:', {
        previousSection: previousSectionRef.current,
        currentSection: currentSection
      });
      setTestData(null);
    }

    if (!sectionChanged && cachedTestData) {
      try {
        const parsedCachedData = JSON.parse(cachedTestData);
        if (parsedCachedData.sectionIndex === currentSection) {
          console.log('キャッシュされたテスト問題を使用:', {
            key: testCacheKey,
            sectionIndex: parsedCachedData.sectionIndex,
            currentSection: currentSection
          });
          setTestData(parsedCachedData);
          setLoading(false);
          previousSectionRef.current = currentSection;
          return;
        }
      } catch (e) {
        console.warn('キャッシュデータのパースに失敗しました。再生成します:', e);
      }
    }

    previousSectionRef.current = currentSection;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const fetchedFor = { lesson: currentLesson, section: currentSection };

    setLessonData(null);
    setSectionData(null);
    setTestData(null);

    const fetchData = async () => {
      try {
        setIsFetching(true);
        setLoading(true);
        setError(null);

        console.log('データ取得開始:', {
          currentLesson: fetchedFor.lesson,
          currentSection: fetchedFor.section
        });

        const lessonResponse = await fetch(`${API_BASE_URL}/api/learning/lesson/${fetchedFor.lesson}/content`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        if (!lessonResponse.ok) {
          throw new Error('レッスンデータの取得に失敗しました');
        }

        const lessonResult = await lessonResponse.json();
        if (lessonResult.success && currentLessonRef.current === fetchedFor.lesson && currentSectionRef.current === fetchedFor.section) {
          setLessonData(lessonResult.data);
        }

        const sectionResponse = await fetch(
          `${API_BASE_URL}/api/lesson-text-video-links/lesson/${fetchedFor.lesson}?includeNoVideo=true`,
          {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json'
            },
            signal: controller.signal
          }
        );

        let fetchedSectionData = null;
        if (sectionResponse.ok) {
          const sectionResult = await sectionResponse.json();
          if (sectionResult.success && sectionResult.data) {
            fetchedSectionData = sectionResult.data;
            if (currentLessonRef.current === fetchedFor.lesson && currentSectionRef.current === fetchedFor.section) {
              setSectionData(fetchedSectionData);
              if (fetchedSectionData.length > 0 && fetchedFor.section >= fetchedSectionData.length) {
                setCurrentSection(0);
                return;
              }
            }
          }
        }

        // セクションが0件の場合（動画未紐づけのPDFのみレッスン等）、レッスン本文をセクション0としてフォールバック
        const lessonContent = lessonResult?.data;
        if ((!fetchedSectionData || fetchedSectionData.length === 0) && lessonContent?.s3_key) {
          const key = (lessonContent.s3_key || '').toLowerCase();
          const fileType = lessonContent.file_type ||
            (key.endsWith('.pdf') ? 'application/pdf' : key.endsWith('.md') ? 'text/markdown' : 'text/plain');
          fetchedSectionData = [{
            text_file_key: lessonContent.s3_key,
            file_type: fileType,
            section_title: lessonContent.title || '本文',
            video_title: lessonContent.title || '本文',
            link_order: 0,
            source: 'lesson_main'
          }];
          if (currentLessonRef.current === fetchedFor.lesson && currentSectionRef.current === fetchedFor.section) {
            setSectionData(fetchedSectionData);
          }
          console.log('セクションが空のためレッスン本文でフォールバック:', { s3_key: lessonContent.s3_key, title: lessonContent.title });
        }

        if (currentLessonRef.current !== fetchedFor.lesson || currentSectionRef.current !== fetchedFor.section) {
          return;
        }
        // 取得直後のレッスンデータ（textContent含む）を渡す。stateは非同期のため渡さないとフォールバックで使えない
        const lessonContentForTest = lessonResult?.success ? lessonResult.data : null;
        if (fetchedSectionData && fetchedSectionData.length > 0) {
          await generateTestDataFromSessionStorage(false, fetchedSectionData, lessonContentForTest);
        } else {
          await generateTestDataFromSessionStorage(false, null, lessonContentForTest);
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('データ取得エラー:', err);
        handleTestGenerationFailure(err);
      } finally {
        setLoading(false);
        setIsFetching(false);
      }
    };

    fetchData();

    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [currentLesson, currentSection, searchParams]);

  // セッションストレージから直接コンテキストを取得してテスト生成
  // lessonContentOverride: 取得直後のレッスンAPI応答（textContent含む）。state更新前でもフォールバックに使う
  const generateTestDataFromSessionStorage = async (forceRefresh = false, sectionDataOverride = null, lessonContentOverride = null) => {
    try {
      console.log('セッションストレージから直接テスト生成開始:', {
        currentLesson,
        currentSection,
        forceRefresh,
        sectionData: sectionData?.[currentSection]
      });
      
      // テスト問題のキャッシュキーを生成
      const testCacheKey = `test_data_${currentLesson}_${currentSection}`;
      
      // 強制リフレッシュが指定されていない場合のみキャッシュをチェック
      if (!forceRefresh) {
        const cachedTestData = sessionStorage.getItem(testCacheKey);
        if (cachedTestData) {
          console.log('キャッシュされたテスト問題を使用:', {
            key: testCacheKey,
            dataLength: cachedTestData.length
          });
          const parsedTestData = JSON.parse(cachedTestData);
          setTestData(parsedTestData);
          setLoading(false);
          return;
        }
      } else {
        // 強制リフレッシュの場合はキャッシュをクリア
        console.log('キャッシュをクリアして新しい問題を生成:', {
          key: testCacheKey
        });
        sessionStorage.removeItem(testCacheKey);
      }
      
      // セクションデータを取得（引数で渡された場合はそれを使用、なければstateを使用）
      const effectiveSectionData = sectionDataOverride || sectionData;
      
      // 現在のセクションのtext_file_keyを取得
      // sectionDataはソートされているため、currentSectionはインデックスとして使用可能
      // ただし、セクションデータが存在しない場合はエラーを出す
      if (!effectiveSectionData || effectiveSectionData.length === 0) {
        console.error('セクションデータが存在しません', {
          sectionDataOverride: !!sectionDataOverride,
          sectionData: !!sectionData,
          effectiveSectionDataLength: effectiveSectionData?.length || 0
        });
        handleTestGenerationFailure('セクションデータが存在しません');
        return;
      }
      
      if (currentSection < 0 || currentSection >= effectiveSectionData.length) {
        console.error('無効なセクションインデックス:', {
          currentSection,
          sectionDataLength: effectiveSectionData.length,
          effectiveSectionDataArray: effectiveSectionData.map((s, idx) => ({
            index: idx,
            text_file_key: s.text_file_key,
            section_title: s.section_title || s.video_title
          }))
        });
        handleTestGenerationFailure(`無効なセクションインデックス: ${currentSection}`);
        return;
      }
      
      const currentSectionData = effectiveSectionData[currentSection];
      const sectionTextFileKey = currentSectionData?.text_file_key;
      const sectionFileType = currentSectionData?.file_type;
      
      console.log('現在のセクション情報:', {
        currentSection,
        sectionDataLength: effectiveSectionData?.length || 0,
        sectionDataArray: effectiveSectionData?.map((s, idx) => ({
          index: idx,
          text_file_key: s.text_file_key,
          section_title: s.section_title || s.video_title,
          link_order: s.link_order,
          file_type: s.file_type
        })),
        currentSectionData: currentSectionData ? {
          text_file_key: currentSectionData.text_file_key,
          section_title: currentSectionData.section_title || currentSectionData.video_title,
          link_order: currentSectionData.link_order,
          file_type: currentSectionData.file_type
        } : null,
        sectionTextFileKey,
        sectionFileType,
        usingOverride: !!sectionDataOverride
      });
      
      // セクションに応じたコンテキストを取得（SessionStorageManagerを使用）
      let textContent = null;
      let contextKey = null;
      let currentLessonKey = null; // 関数スコープで定義
      
      if (sectionTextFileKey && currentLesson) {
        // SessionStorageManagerを使用してセクションに応じたコンテキストを取得
        const context = SessionStorageManager.getContext(currentLesson, sectionTextFileKey, sectionFileType);
        if (context) {
          textContent = context.context;
          contextKey = SessionStorageManager.generateKey(currentLesson, sectionTextFileKey, sectionFileType);
          console.log('セクションに応じたコンテキストを取得:', {
            contextKey,
            contextLength: textContent?.length || 0,
            metadata: context.metadata
          });
        }
      }
      
      // セクションに応じたコンテキストが見つからない場合、レッスン全体のコンテキストを検索
      if (!textContent) {
        console.log('セクションに応じたコンテキストが見つからないため、レッスン全体のコンテキストを検索します');
        
        // セッションストレージの全コンテキストキーを確認（PDF/MD/TXTなどを含む）
        const contextPrefixes = ['pdf_context_', 'md_context_', 'txt_context_', 'context_'];
        const allKeys = Object.keys(sessionStorage).filter(key =>
          contextPrefixes.some(prefix => key.startsWith(prefix))
        );
        console.log('利用可能なコンテキストキー:', allKeys);
        
        // 現在のレッスンに対応するコンテキストを探す（改善されたマッチング）
        // currentLessonKeyは既に関数スコープで定義されている
        
        // 1. 完全一致を試す（例: pdf_context_4_4_xxx.pdf）
        currentLessonKey = allKeys.find(key => key.includes(`_${currentLesson}_${currentLesson}_`));
        if (currentLessonKey) {
          console.log(`完全一致でコンテキスト発見: ${currentLessonKey}`);
        }
        
        // 2. 部分一致を試す（例: pdf_context_1_xxx.pdf）
        if (!currentLessonKey) {
          currentLessonKey = allKeys.find(key => key.includes(`_${currentLesson}_`));
          if (currentLessonKey) {
            console.log(`部分一致でコンテキスト発見: ${currentLessonKey}`);
          }
        }
        
        // 3. セッションストレージのメタデータから正確なレッスンIDを確認
        if (!currentLessonKey) {
          console.log('メタデータからレッスンIDを確認中...');
          for (const key of allKeys) {
            try {
              const storedData = sessionStorage.getItem(key);
              if (storedData) {
                const contextData = JSON.parse(storedData);
                console.log(`キー ${key} のメタデータ:`, {
                  lessonId: contextData.metadata?.lessonId,
                  lessonTitle: contextData.metadata?.lessonTitle,
                  fileType: contextData.metadata?.fileType
                });
                
                if (contextData.metadata && contextData.metadata.lessonId === currentLesson) {
                  currentLessonKey = key;
                  console.log(`メタデータから正確なレッスンIDでマッチ: ${key} (lessonId: ${contextData.metadata.lessonId})`);
                  break;
                }
              }
            } catch (error) {
              console.warn(`キー ${key} のメタデータ解析に失敗:`, error);
            }
          }
        }
        
        // 4. レッスン番号の部分文字列マッチを試す（最後の手段）
        if (!currentLessonKey) {
          console.log('キーの部分文字列からレッスン番号を抽出中...');
          currentLessonKey = allKeys.find(key => {
            // キーからレッスン番号を抽出して比較
            const keyParts = key.split('_');
            if (keyParts.length >= 3) {
              const keyLessonId = parseInt(keyParts[2]);
              console.log(`キー ${key} から抽出したレッスンID: ${keyLessonId}, 検索対象: ${currentLesson}`);
              return keyLessonId === currentLesson;
            }
            return false;
          });
          if (currentLessonKey) {
            console.log(`部分文字列マッチでコンテキスト発見: ${currentLessonKey}`);
          }
        }
        
        // 5. フォールバック: 利用可能なコンテキストの最初のものを使用（デバッグ用）
        if (!currentLessonKey && allKeys.length > 0) {
          console.warn(`レッスン${currentLesson}のコンテキストが見つからないため、利用可能な最初のコンテキストを使用します`);
          currentLessonKey = allKeys[0];
          console.log(`フォールバックコンテキスト: ${currentLessonKey}`);
        }
        
        if (!currentLessonKey) {
          // 利用可能なコンテキストの詳細情報を表示
          const availableContexts = [];
          for (const key of allKeys) {
            try {
              const storedData = sessionStorage.getItem(key);
              if (storedData) {
                const contextData = JSON.parse(storedData);
                availableContexts.push({
                  key,
                  lessonId: contextData.metadata?.lessonId,
                  lessonTitle: contextData.metadata?.lessonTitle,
                  fileType: contextData.metadata?.fileType
                });
              }
            } catch (error) {
              console.warn(`キー ${key} の解析に失敗:`, error);
            }
          }
          
          console.warn(`レッスン${currentLesson}に対応するコンテキストが見つかりません。利用可能なコンテキスト:`, availableContexts);
          
          // フォールバック: レッスンデータから直接テキストコンテンツを取得（渡されたAPI応答を優先・stateは非同期で未反映のため）
          const lessonForFallback = lessonContentOverride || lessonData;
          if (lessonForFallback && lessonForFallback.textContent) {
            console.log('セッションストレージにコンテキストがないため、レッスンデータから直接テキストコンテンツを取得します');
            const fallbackTextContent = lessonForFallback.textContent;
          
          const sectionTitle = effectiveSectionData?.[currentSection]?.section_title || effectiveSectionData?.[currentSection]?.video_title || `セクション${currentSection + 1}`;
          const sectionDescription = effectiveSectionData?.[currentSection]?.section_description || 'セクションの説明';
          
            const requestBody = {
              type: 'section',
              lessonId: currentLesson,
              sectionIndex: currentSection,
              sectionTitle: sectionTitle,
              sectionDescription: sectionDescription,
              textContent: fallbackTextContent,
              fileType: lessonForFallback.file_type || 'text/plain',
              fileName: lessonForFallback.s3_key || `lesson_${currentLesson}_section_${currentSection}`,
              questionCount: 10
            };
            
            console.log('レッスンデータから直接テスト生成APIリクエスト送信:', requestBody);
            
            const response = await fetch(`${API_BASE_URL}/api/test/learning/generate-test`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(requestBody)
            });

            if (response.ok) {
              const result = await response.json();
              if (result.success) {
                const testCacheKey = `test_data_${currentLesson}_${currentSection}`;
                sessionStorage.setItem(testCacheKey, JSON.stringify(result.data));
                console.log('レッスンデータから直接テスト問題をキャッシュに保存:', {
                  key: testCacheKey,
                  dataLength: JSON.stringify(result.data).length
                });
                
                setTestData(result.data);
                return;
              }
            } else {
              const errorData = await response.json().catch(() => ({}));
              console.error('テスト生成APIエラー:', {
                status: response.status,
                error: errorData.message
              });
              throw new Error(errorData.message || 'テストデータの生成に失敗しました');
            }
          }
          
          // フォールバック: レッスン1のコンテキストを動的に生成する
          if (currentLesson === 1 && availableContexts.length > 0) {
            console.log('レッスン1のコンテキストを動的に生成します...');
            await generateLesson1ContextFromAvailableData(availableContexts);
            return;
          }
          
          // フォールバック: レッスン4のコンテキストが見つからない場合の処理
          if (currentLesson === 4 && availableContexts.length > 0) {
            console.log('レッスン4のコンテキストが見つからないため、利用可能なコンテキストを使用します...');
            const fallbackContext = availableContexts[0];
            console.log('フォールバックコンテキストを使用:', fallbackContext);
            
            // フォールバックコンテキストを使用してテストを生成
            const storedData = sessionStorage.getItem(fallbackContext.key);
            if (storedData) {
              const contextData = JSON.parse(storedData);
              const fallbackTextContent = contextData.context;
              
              const sectionTitle = `セクション${currentSection + 1}`;
              const sectionDescription = 'セクションの説明';
              
              const requestBody = {
                type: 'section',
                lessonId: currentLesson,
                sectionIndex: currentSection,
                sectionTitle: sectionTitle,
                sectionDescription: sectionDescription,
                textContent: fallbackTextContent,
                fileType: contextData.metadata?.fileType || 'text/plain',
                fileName: `lesson_${currentLesson}_section_${currentSection}_fallback`,
                questionCount: 10
              };
              
              console.log('フォールバックコンテキストでAPIリクエスト送信:', requestBody);
              
              const response = await fetch(`${API_BASE_URL}/api/test/learning/generate-test`, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
              });

              if (response.ok) {
                const result = await response.json();
                if (result.success) {
                  const testCacheKey = `test_data_${currentLesson}_${currentSection}`;
                  sessionStorage.setItem(testCacheKey, JSON.stringify(result.data));
                  console.log('フォールバックコンテキストでテスト問題をキャッシュに保存:', {
                    key: testCacheKey,
                    dataLength: JSON.stringify(result.data).length
                  });
                  
                  setTestData(result.data);
                  return;
                }
              }
            }
          }
          
          console.warn('テスト生成に必要なデータが揃わないため、ユーザーに再試行を促します');
          handleTestGenerationFailure('利用可能なコンテキストが見つかりません。レッスンデータにもテキストコンテンツがありません。');
          return;
        }
        
        // currentLessonKeyが見つかった場合、そのコンテキストを取得
        if (currentLessonKey) {
          const storedData = sessionStorage.getItem(currentLessonKey);
          if (storedData) {
            const contextData = JSON.parse(storedData);
            textContent = contextData.context;
            
            console.log('セッションストレージからコンテキスト取得:', {
              key: currentLessonKey,
              contextLength: textContent?.length || 0,
              metadata: contextData.metadata,
              searchLesson: currentLesson,
              foundLesson: contextData.metadata?.lessonId
            });
          }
        }
      }
      
      // セクションデータが空の場合でも動作するように、デフォルト値を設定
      // currentSectionDataは既に取得されているので、それを使用
      const sectionTitle = currentSectionData?.section_title || 
                           currentSectionData?.video_title || 
                           `セクション${currentSection + 1}`;
      const sectionDescription = currentSectionData?.section_description || 
                                 currentSectionData?.video_description || 
                                 'セクションの説明';
      
      // セクションに応じたfile_typeを取得（渡されたレッスンAPI応答を優先・state未反映時用）
      const lessonForMeta = lessonContentOverride || lessonData;
      const fileType = sectionFileType || 
                       lessonForMeta?.file_type || 
                       'text/plain';
      
      console.log('テスト生成用データ:', {
        sectionTitle,
        sectionDescription,
        textContentLength: textContent?.length || 0,
        textContentPreview: textContent?.substring(0, 200) + '...',
        currentLesson,
        currentSection,
        sessionStorageKey: contextKey || currentLessonKey,
        sectionTextFileKey: sectionTextFileKey,
        fileType: fileType,
        hasSectionData: !!effectiveSectionData,
        sectionDataLength: effectiveSectionData?.length || 0
      });
      
      // テキストコンテンツが空の場合は警告
      if (!textContent || textContent.trim().length === 0) {
        console.warn('⚠️ テキストコンテンツが空です。');
        handleTestGenerationFailure('テキストコンテンツが空です');
        return;
      }
      
      const requestBody = {
        type: 'section',
        lessonId: currentLesson,
        sectionIndex: currentSection,
        sectionTitle: sectionTitle,
        sectionDescription: sectionDescription,
        textContent: textContent,
        fileType: fileType,
        fileName: sectionTextFileKey || lessonForMeta?.s3_key || `lesson_${currentLesson}_section_${currentSection}`,
        questionCount: 10
      };
      
      console.log('APIリクエスト送信:', {
        url: `${API_BASE_URL}/api/test/learning/generate-test`,
        body: requestBody
      });
      
      const response = await fetch(`${API_BASE_URL}/api/test/learning/generate-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // テスト問題をキャッシュに保存
          sessionStorage.setItem(testCacheKey, JSON.stringify(result.data));
          console.log('テスト問題をキャッシュに保存:', {
            key: testCacheKey,
            dataLength: JSON.stringify(result.data).length
          });
          
          setTestData(result.data);
        } else {
          throw new Error(result.message || 'テストデータの生成に失敗しました');
        }
      } else {
        throw new Error('テストデータの生成に失敗しました');
      }
    } catch (error) {
      console.error('テストデータ生成エラー:', error);
      handleTestGenerationFailure(error);
    }
  };

  // レッスン1のコンテキストを動的に生成する関数
  const generateLesson1ContextFromAvailableData = async (availableContexts) => {
    try {
      console.log('レッスン1のコンテキストを動的に生成開始:', availableContexts);
      
      // 利用可能なコンテキストから最も適切なものを選択
      // 優先順位: 1. レッスン4のコンテキスト, 2. 最初のコンテキスト
      let selectedContext = availableContexts.find(ctx => ctx.lessonId === 4) || availableContexts[0];
      
      if (!selectedContext) {
        console.warn('利用可能なコンテキストがありません');
        handleTestGenerationFailure('利用可能なコンテキストがありません');
        return;
      }
      
      console.log('選択されたコンテキスト:', selectedContext);
      
      // 選択されたコンテキストのデータを取得
      const storedData = sessionStorage.getItem(selectedContext.key);
      if (!storedData) {
        console.warn('選択されたコンテキストのデータを取得できません');
        handleTestGenerationFailure('選択されたコンテキストのデータを取得できません');
        return;
      }
      
      const contextData = JSON.parse(storedData);
      const textContent = contextData.context;
      
      // レッスン1用のコンテキストを生成（既存のコンテキストをベースに）
      const lesson1Context = `レッスン1の学習内容:\n\n${textContent}`;
      
      // レッスン1用のキーを生成
      const lesson1Key = `pdf_context_1_1_lesson1_generated`;
      
      // レッスン1のコンテキストをセッションストレージに保存
      const lesson1Data = {
        context: lesson1Context,
        metadata: {
          ...contextData.metadata,
          lessonId: 1,
          lessonTitle: 'レッスン1',
          fileType: 'generated',
          generatedFrom: selectedContext.key,
          generatedAt: new Date().toISOString()
        }
      };
      
      sessionStorage.setItem(lesson1Key, JSON.stringify(lesson1Data));
      console.log('レッスン1のコンテキストを生成して保存:', {
        key: lesson1Key,
        contextLength: lesson1Context.length,
        generatedFrom: selectedContext.key
      });
      
      // 生成したコンテキストを使用してテストを生成
      const sectionTitle = `セクション${currentSection + 1}`;
      const sectionDescription = 'セクションの説明';
      
      const requestBody = {
        type: 'section',
        lessonId: currentLesson,
        sectionIndex: currentSection,
        sectionTitle: sectionTitle,
        sectionDescription: sectionDescription,
        textContent: lesson1Context,
        fileType: 'generated',
        fileName: `lesson_${currentLesson}_section_${currentSection}_generated`,
        questionCount: 10
      };
      
      console.log('生成されたコンテキストでAPIリクエスト送信:', {
        url: `${API_BASE_URL}/api/test/learning/generate-test`,
        body: requestBody
      });
      
      const response = await fetch(`${API_BASE_URL}/api/test/learning/generate-test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // テスト問題をキャッシュに保存
          const testCacheKey = `test_data_${currentLesson}_${currentSection}`;
          sessionStorage.setItem(testCacheKey, JSON.stringify(result.data));
          console.log('生成されたコンテキストでテスト問題をキャッシュに保存:', {
            key: testCacheKey,
            dataLength: JSON.stringify(result.data).length
          });
          
          setTestData(result.data);
        } else {
          throw new Error(result.message || 'テストデータの生成に失敗しました');
        }
      } else {
        throw new Error('テストデータの生成に失敗しました');
      }
    } catch (error) {
      console.error('レッスン1コンテキスト生成エラー:', error);
      handleTestGenerationFailure(error);
    }
  };

  // 回答の変更
  const handleAnswerChange = (answers) => {
    // 回答の変更を処理（必要に応じて）
    console.log('回答が変更されました:', answers);
  };

  // テスト完了
  const handleTestComplete = async (submissionData) => {
    setIsSubmitting(true);
    
    try {
      if (isPreview) {
        alert('プレビューでは提出/採点/結果表示はできません（問題画面の閲覧のみ可能です）。');
        setIsSubmitting(false);
        return;
      }
      // 認証されたユーザーIDを使用するため、userIdはリクエストボディに含めない
      
      // デバッグログ
      console.log('テスト提出データ:', {
        currentLesson,
        sectionIndex: currentSection,
        hasAnswers: !!submissionData.answers,
        hasTestData: !!testData,
        hasShuffledQuestions: !!submissionData.shuffledQuestions,
        answersCount: Object.keys(submissionData.answers || {}).length,
        testDataQuestions: testData?.questions?.length,
        shuffledQuestionsLength: submissionData.shuffledQuestions?.length
      });
      
      // テスト結果を提出
      const response = await fetch(`${API_BASE_URL}/api/learning/test/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lessonId: parseInt(currentLesson),
          sectionIndex: currentSection,
          testType: 'section',
          answers: submissionData.answers,
          testData: testData,
          shuffledQuestions: submissionData.shuffledQuestions // シャッフル情報を送信
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          // テスト結果画面に遷移
          navigate('/student/test-result', {
            state: {
              testType: 'section',
              lessonId: currentLesson,
              sectionIndex: currentSection,
              lessonTitle: lessonData?.title || `第${currentLesson}回`,
              sectionTitle: sectionData?.[currentSection]?.section_title || `セクション${currentSection + 1}`,
              answers: submissionData.answers,
              testData: testData,
              shuffledQuestions: submissionData.shuffledQuestions,
              score: result.data?.score || 0,
              totalQuestions: testData.questions.length,
              examResultId: result.data?.examResultId,
              s3Key: result.data?.s3Key
            }
          });
        } else {
          throw new Error(result.message || 'テスト結果の提出に失敗しました');
        }
      } else {
        throw new Error('テスト結果の提出に失敗しました');
      }
    } catch (error) {
      console.error('テスト提出エラー:', error);
      alert('テストの提出に失敗しました: ' + error.message);
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-blue-600 text-xl font-semibold">
            セクションテストを準備中...
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
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                className="px-4 py-2 bg-white bg-opacity-10 border border-white border-opacity-30 rounded-lg hover:bg-opacity-20 transition-all duration-200 font-medium"
                onClick={() => navigate(-1)}
              >
                ← 学習画面に戻る
              </button>
              <div>
                <h1 className="text-2xl font-bold">セクションまとめテスト</h1>
                <span className="text-blue-100 text-sm">
                  {lessonData?.title} - {sectionData?.[currentSection]?.section_title || `セクション${currentSection + 1}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* テストコンテンツ */}
      <div className="py-8">
        <MultipleChoiceTest
          testData={testData}
          onAnswerChange={handleAnswerChange}
          onComplete={handleTestComplete}
          isSubmitting={isSubmitting}
        />
      </div>
    </div>
  );
};

export default SectionTestPage;

