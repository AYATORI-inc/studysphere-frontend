import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import MultipleChoiceTest from '../components/learning/MultipleChoiceTest';
import { SessionStorageManager } from '../utils/sessionStorage';
import { API_BASE_URL } from '../config/apiConfig';

const LessonTestPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const [currentLesson, setCurrentLesson] = useState(1);
  const [testData, setTestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lessonData, setLessonData] = useState(null);
  const [sectionData, setSectionData] = useState(null);
  const abortControllerRef = useRef(null);
  const currentLessonRef = useRef(currentLesson);
  const GENERATION_FAILURE_MESSAGE = '問題の作成に失敗しました。再読み込みをしてください。';

  useEffect(() => {
    currentLessonRef.current = currentLesson;
  }, [currentLesson]);

  const handleTestGenerationFailure = (detail) => {
    if (detail) {
      console.warn('テスト問題の作成に失敗しました:', detail);
    }
    setTestData(null);
    setError(GENERATION_FAILURE_MESSAGE);
  };

  // URLパラメータからレッスン番号を取得
  useEffect(() => {
    const lessonParam = searchParams.get('lesson');
    
    if (lessonParam) {
      const lessonNumber = parseInt(lessonParam);
      if (lessonNumber >= 1) {
        setCurrentLesson(lessonNumber);
      }
    }
  }, [searchParams]);

  // レッスンデータとセクションデータを取得
  // 注意: URLの?lesson=とcurrentLessonのずれによる二重fetch・後勝ち上書きを防ぐため、
  // AbortControllerでキャンセルし、リクエスト一致時のみstateを更新する
  useEffect(() => {
    const lessonParam = searchParams.get('lesson');
    const urlLesson = lessonParam ? parseInt(lessonParam, 10) : null;
    if (urlLesson != null && urlLesson >= 1 && currentLesson === 1 && urlLesson !== 1) {
      return;
    }
    if (!currentLesson) return;

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const fetchedFor = currentLesson;

    setLessonData(null);
    setSectionData(null);
    setTestData(null);

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const lessonResponse = await fetch(`${API_BASE_URL}/api/learning/lesson/${fetchedFor}/content`, {
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
        if (lessonResult.success && currentLessonRef.current === fetchedFor) {
          setLessonData(lessonResult.data);
        }

        const sectionResponse = await fetch(`${API_BASE_URL}/api/lesson-text-video-links/lesson/${fetchedFor}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          },
          signal: controller.signal
        });

        if (sectionResponse.ok) {
          const sectionResult = await sectionResponse.json();
          if (sectionResult.success && currentLessonRef.current === fetchedFor) {
            setSectionData(sectionResult.data);
          }
        }
      } catch (err) {
        if (err?.name === 'AbortError') return;
        console.error('データ取得エラー:', err);
        handleTestGenerationFailure(err);
        setLoading(false);
      }
    };

    fetchData();

    return () => {
      abortControllerRef.current?.abort();
      abortControllerRef.current = null;
    };
  }, [currentLesson, searchParams]);

  // セクションデータが取得された後にテストデータを生成
  // 修正: セクションデータが空（動画がない場合）でも、レッスンデータがあればテストを生成
  useEffect(() => {
    // セクションデータが取得された（空配列でもOK）かつレッスンデータがある場合
    if (sectionData !== null && lessonData) {
      console.log('セクションデータ取得完了、テストデータ生成開始:', {
        sectionCount: sectionData.length,
        lessonTitle: lessonData.title,
        hasSections: sectionData.length > 0
      });
      generateTestData();
    }
  }, [sectionData, lessonData, currentLesson]);

  // テストデータを生成（OpenAI APIを使用）
  const generateTestData = async (forceRefresh = false) => {
    try {
      // テスト問題のキャッシュキーを生成
      const testCacheKey = `test_data_lesson_${currentLesson}`;
      
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
      
      // レッスン全体のテキスト内容を取得（コンテキスト化の完了を確実に待機）
      console.log('レッスンテキスト内容の取得を開始...');
      const textContent = await getLessonTextContent();
      
      // テキストコンテンツの検証（最小長さを50文字に緩和）
      if (!textContent || textContent.trim().length < 50) {
        throw new Error(`テキストコンテンツが不足しています: 長さ=${textContent?.length || 0}`);
      }
      
      // テキストコンテンツが有効な内容を含んでいるかチェック（より柔軟な検証）
      const hasValidContent = textContent.includes('AI') || 
                            textContent.includes('Google') || 
                            textContent.includes('検索') || 
                            textContent.includes('音声') ||
                            textContent.includes('翻訳') ||
                            textContent.includes('画像') ||
                            textContent.includes('DALL') ||
                            textContent.includes('Perplexity') ||
                            textContent.includes('倫理') ||
                            textContent.includes('バイアス') ||
                            textContent.includes('Windows') ||
                            textContent.includes('ソフトウェア') ||
                            textContent.includes('コンピュータ') ||
                            textContent.includes('基本操作') ||
                            textContent.length > 200; // 長いテキストの場合は有効とみなす
      
      if (!hasValidContent) {
        console.warn('テキストコンテンツに有効な学習内容が含まれていない可能性があります:', {
          textContentPreview: textContent.substring(0, 1000),
          textContentLength: textContent.length
        });
      }
      
      console.log('テキストコンテンツの検証完了:', {
        textContentLength: textContent.length,
        hasValidContent,
        textContentPreview: textContent.substring(0, 500),
        textContentEnd: textContent.substring(textContent.length - 500)
      });
      
      const requestBody = {
        type: 'lesson',
        lessonId: currentLesson,
        lessonTitle: lessonData?.title || `第${currentLesson}回`,
        lessonDescription: lessonData?.description || '',
        textContent: textContent,
        fileType: lessonData?.file_type || 'text/plain',
        fileName: lessonData?.s3_key || `lesson_${currentLesson}`,
        questionCount: 30
      };
      
      console.log('テスト生成APIリクエスト送信:', {
        url: `${API_BASE_URL}/api/test/learning/generate-test`,
        requestBody: {
          ...requestBody,
          textContentLength: textContent?.length || 0,
          textContentPreview: textContent?.substring(0, 200) + '...',
          textContentEnd: textContent ? textContent.substring(textContent.length - 200) : 'null',
          textContentFull: textContent // 完全なテキストコンテンツをログ出力
        }
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
        console.log('テスト生成APIレスポンス:', {
          success: result.success,
          dataLength: result.data ? JSON.stringify(result.data).length : 0,
          dataPreview: result.data ? JSON.stringify(result.data).substring(0, 500) + '...' : 'null',
          firstQuestion: result.data?.questions?.[0]?.question || 'null'
        });
        
        if (result.success && result.data && result.data.questions && result.data.questions.length > 0) {
          // テスト問題をキャッシュに保存（成功した場合のみ）
          sessionStorage.setItem(testCacheKey, JSON.stringify(result.data));
          console.log('テスト問題をキャッシュに保存:', {
            key: testCacheKey,
            dataLength: JSON.stringify(result.data).length,
            questionCount: result.data?.questions?.length || 0,
            firstQuestion: result.data.questions[0]?.question || 'null'
          });
          
          setTestData(result.data);
        } else {
          console.warn('APIレスポンスが無効です:', {
            success: result.success,
            hasData: !!result.data,
            hasQuestions: !!(result.data?.questions),
            questionCount: result.data?.questions?.length || 0
          });
          throw new Error(result.message || 'テストデータの生成に失敗しました');
        }
      } else {
        const errorText = await response.text();
        console.error('API呼び出し失敗:', {
          status: response.status,
          statusText: response.statusText,
          errorText: errorText
        });
        throw new Error(`テストデータの生成に失敗しました: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('テストデータ生成エラー:', {
        error: error.message,
        stack: error.stack,
        currentLesson: currentLesson
      });
      handleTestGenerationFailure(error);
    } finally {
      setLoading(false);
    }
  };

  // レッスン全体のテキスト内容を取得（全セクションを結合）
  const getLessonTextContent = async () => {
    try {
      let allTextContent = '';
      
      console.log('レッスンテキスト内容取得開始:', {
        lessonId: currentLesson,
        sectionCount: sectionData?.length || 0,
        lessonTitle: lessonData?.title
      });
      
      // セッションストレージの状態を確認
      const allContextKeys = Object.keys(sessionStorage).filter(key => key.startsWith('pdf_context_'));
      console.log('現在のセッションストレージのコンテキストキー:', allContextKeys);
      
      // 各コンテキストの詳細情報を表示
      allContextKeys.forEach(key => {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          console.log(`コンテキストキー ${key}:`, {
            lessonId: data.metadata?.lessonId,
            lessonTitle: data.metadata?.lessonTitle,
            contextLength: data.context?.length || 0,
            contextPreview: data.context?.substring(0, 100) + '...'
          });
        } catch (error) {
          console.warn(`コンテキストキー ${key} の解析に失敗:`, error);
        }
      });
      
      // レッスンの基本情報
      if (lessonData?.description) {
        allTextContent += `# ${lessonData.title || `第${currentLesson}回`}\n\n`;
        allTextContent += lessonData.description + '\n\n';
      }
      
      // 各セクションのテキスト内容を取得
      // 修正: セクションデータがない場合でも、レッスンのテキストファイルから直接取得
      if (sectionData && sectionData.length > 0) {
        for (let i = 0; i < sectionData.length; i++) {
          const section = sectionData[i];
          console.log(`セクション${i + 1}のテキスト取得開始:`, {
            sectionTitle: section.section_title,
            textFileKey: section.text_file_key,
            hasTextFileKey: !!section.text_file_key
          });
          
          if (section.text_file_key) {
            try {
              // まずセッションストレージからコンテキスト化されたテキストを取得（厳密なマッチング）
              let storedContext = SessionStorageManager.getContext(currentLesson, section.text_file_key, 'md');
              
              // メタデータから正確なレッスンIDを確認
              if (storedContext && storedContext.metadata && storedContext.metadata.lessonId !== currentLesson) {
                console.warn(`セクション${i + 1}のコンテキストのレッスンIDが一致しません:`, {
                  expectedLessonId: currentLesson,
                  actualLessonId: storedContext.metadata.lessonId,
                  sectionTitle: section.section_title,
                  textFileKey: section.text_file_key
                });
                storedContext = null; // 間違ったレッスンのコンテキストは使用しない
              }
              
              if (storedContext && storedContext.context) {
                // コンテキストが有効かどうかを検証
                const contextLength = storedContext.context.length;
                const hasValidContent = storedContext.context.includes('AI') || 
                                      storedContext.context.includes('Google') || 
                                      storedContext.context.includes('検索') || 
                                      storedContext.context.includes('音声') ||
                                      storedContext.context.includes('翻訳') ||
                                      storedContext.context.includes('画像') ||
                                      storedContext.context.includes('DALL') ||
                                      storedContext.context.includes('Perplexity') ||
                                      storedContext.context.includes('倫理') ||
                                      storedContext.context.includes('バイアス') ||
                                      storedContext.context.includes('Windows') ||
                                      storedContext.context.includes('ソフトウェア') ||
                                      storedContext.context.includes('コンピュータ') ||
                                      storedContext.context.includes('基本操作') ||
                                      storedContext.context.length > 200;
                
                if (contextLength > 50 && hasValidContent) {
                  allTextContent += `\n\n## セクション${i + 1}: ${section.section_title || 'セクション'}\n\n`;
                  allTextContent += storedContext.context;
                  console.log(`セクション${i + 1}のコンテキスト取得完了:`, {
                    contextLength: storedContext.context.length,
                    sectionTitle: section.section_title,
                    lessonId: storedContext.metadata?.lessonId,
                    expectedLessonId: currentLesson,
                    hasValidContent
                  });
                  continue; // セッションストレージから取得できた場合は次のセクションへ
                } else {
                  console.warn(`セクション${i + 1}のコンテキストが無効です:`, {
                    contextLength,
                    hasValidContent,
                    contextPreview: storedContext.context.substring(0, 200)
                  });
                  storedContext = null; // 無効なコンテキストは使用しない
                }
              }
              
              // セッションストレージにない場合は、レッスンIDに基づいてコンテンツを取得
              console.log(`セクション${i + 1}のコンテンツ取得:`, {
                currentLesson: currentLesson,
                sectionTitle: section.section_title,
                note: 'セッションストレージにコンテンツがないため、レッスンコンテンツAPIを使用'
              });
              
              // レッスンコンテンツAPIを呼び出してテキストコンテンツを取得
              const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${currentLesson}/content`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result.success && result.data?.textContent) {
                  // レッスンコンテンツが有効かどうかを検証
                  const extractedText = result.data.textContent;
                  const textLength = extractedText.length;
                  const hasValidContent = extractedText.includes('AI') || 
                                        extractedText.includes('Google') || 
                                        extractedText.includes('検索') || 
                                        extractedText.includes('音声') ||
                                        extractedText.includes('翻訳') ||
                                        extractedText.includes('画像') ||
                                        extractedText.includes('DALL') ||
                                        extractedText.includes('Perplexity') ||
                                        extractedText.includes('倫理') ||
                                        extractedText.includes('バイアス') ||
                                        extractedText.includes('Windows') ||
                                        extractedText.includes('ソフトウェア') ||
                                        extractedText.includes('コンピュータ') ||
                                        extractedText.includes('基本操作') ||
                                        extractedText.length > 200;
                  
                  if (textLength > 50 && hasValidContent) {
                    allTextContent += `\n\n## セクション${i + 1}: ${section.section_title || 'セクション'}\n\n`;
                    allTextContent += extractedText;
                    
                    // 取得したテキストをセッションストレージに保存
                    const saveSuccess = SessionStorageManager.saveContext(
                      currentLesson,
                      `lesson_${currentLesson}_content`,
                      extractedText,
                      {
                        fileType: 'lesson_content',
                        lessonTitle: lessonData?.title,
                        sectionTitle: section.section_title,
                        source: 'lesson_content_api'
                      }
                    );
                    
                    if (saveSuccess) {
                      console.log(`セクション${i + 1}のコンテキストをセッションストレージに保存完了`);
                    }
                    
                    console.log(`セクション${i + 1}のレッスンコンテンツ取得完了:`, {
                      textLength: extractedText.length,
                      sectionTitle: section.section_title,
                      savedToSessionStorage: saveSuccess,
                      hasValidContent
                    });
                  } else {
                    console.warn(`セクション${i + 1}のレッスンコンテンツが無効です:`, {
                      textLength,
                      hasValidContent,
                      textPreview: extractedText.substring(0, 200)
                    });
                  }
                } else {
                  console.warn(`セクション${i + 1}のレッスンコンテンツ取得結果が空:`, result);
                }
              } else {
                console.warn(`セクション${i + 1}のレッスンコンテンツAPI失敗:`, {
                  status: response.status,
                  statusText: response.statusText,
                  sectionTitle: section.section_title
                });
              }
            } catch (error) {
              console.error(`セクション${i + 1}のレッスンコンテンツ取得エラー:`, {
                error: error.message,
                sectionTitle: section.section_title,
                currentLesson: currentLesson
              });
            }
          } else {
            console.warn(`セクション${i + 1}にtext_file_keyがありません:`, {
              sectionTitle: section.section_title,
              section: section
            });
          }
        }
      } else {
        // セクションデータが空の場合（動画がない場合）、レッスンのテキストファイルから直接取得
        console.log('セクションデータが空です。レッスンのテキストファイルから直接取得します:', {
          lessonId: currentLesson,
          lessonS3Key: lessonData?.s3_key,
          fileType: lessonData?.file_type
        });
        
        if (lessonData?.s3_key) {
          try {
            // セッションストレージからコンテキストを取得
            const fileType = lessonData.file_type || 'pdf';
            const storedContext = SessionStorageManager.getContext(currentLesson, lessonData.s3_key, fileType);
            
            if (storedContext && storedContext.context) {
              console.log('セッションストレージからレッスンテキストを取得:', {
                contextLength: storedContext.context.length,
                lessonId: currentLesson,
                s3Key: lessonData.s3_key
              });
              allTextContent += storedContext.context;
            } else {
              // セッションストレージにない場合は、APIから取得
              console.log('セッションストレージにコンテキストがないため、APIから取得します');
              const response = await fetch(`${API_BASE_URL}/api/learning/lesson/${currentLesson}/content`, {
                headers: {
                  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                  'Content-Type': 'application/json'
                }
              });
              
              if (response.ok) {
                const result = await response.json();
                if (result.success && result.data.textContent) {
                  allTextContent += result.data.textContent;
                }
              }
            }
          } catch (error) {
            console.error('レッスンテキスト取得エラー:', error);
          }
        }
      }
      
      // 追加テキストファイル（lesson_text_files）の内容を取得
      // セクションデータに既に含まれているものは除外する
      try {
        console.log('追加テキストファイルの取得を開始:', { lessonId: currentLesson });
        
        // セクションデータに既に含まれているtext_file_keyを収集
        const sectionTextFileKeys = new Set();
        if (sectionData && sectionData.length > 0) {
          sectionData.forEach(section => {
            if (section.text_file_key) {
              sectionTextFileKeys.add(section.text_file_key);
            }
          });
        }
        
        // 追加テキストファイルの一覧を取得
        const additionalFilesResponse = await fetch(`${API_BASE_URL}/api/lesson-text-files/lesson/${currentLesson}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });
        
        if (additionalFilesResponse.ok) {
          const additionalFilesResult = await additionalFilesResponse.json();
          if (additionalFilesResult.success && additionalFilesResult.data && additionalFilesResult.data.length > 0) {
            console.log('追加テキストファイル一覧取得成功:', {
              fileCount: additionalFilesResult.data.length,
              files: additionalFilesResult.data.map(f => ({ id: f.id, fileName: f.file_name, s3Key: f.s3_key }))
            });
            
            // 各追加テキストファイルの内容を取得
            for (const textFile of additionalFilesResult.data) {
              // セクションデータに既に含まれている場合はスキップ
              if (sectionTextFileKeys.has(textFile.s3_key)) {
                console.log('追加テキストファイルはセクションデータに既に含まれているためスキップ:', {
                  fileName: textFile.file_name,
                  s3Key: textFile.s3_key
                });
                continue;
              }
              
              try {
                // セッションストレージからコンテキストを取得
                const fileType = textFile.file_type || 'text/plain';
                let storedContext = SessionStorageManager.getContext(currentLesson, textFile.s3_key, fileType);
                
                // メタデータから正確なレッスンIDを確認
                if (storedContext && storedContext.metadata && storedContext.metadata.lessonId !== currentLesson) {
                  console.warn('追加テキストファイルのコンテキストのレッスンIDが一致しません:', {
                    expectedLessonId: currentLesson,
                    actualLessonId: storedContext.metadata.lessonId,
                    fileName: textFile.file_name,
                    s3Key: textFile.s3_key
                  });
                  storedContext = null;
                }
                
                let fileContent = null;
                
                if (storedContext && storedContext.context) {
                  // コンテキストが有効かどうかを検証
                  const contextLength = storedContext.context.length;
                  const hasValidContent = storedContext.context.length > 50;
                  
                  if (contextLength > 50 && hasValidContent) {
                    fileContent = storedContext.context;
                    console.log('追加テキストファイルのコンテキストをセッションストレージから取得:', {
                      fileName: textFile.file_name,
                      contextLength: storedContext.context.length
                    });
                  } else {
                    storedContext = null;
                  }
                }
                
                // セッションストレージにない場合は、APIから取得
                if (!fileContent) {
                  console.log('追加テキストファイルをAPIから取得:', {
                    fileName: textFile.file_name,
                    s3Key: textFile.s3_key,
                    fileType: textFile.file_type
                  });
                  
                  // クエリパラメータとして送信することで、CORSエラーを回避（日本語を含む長いパスの問題を解決）
                  const extractResponse = await fetch(`${API_BASE_URL}/api/test/learning/extract-text?s3Key=${encodeURIComponent(textFile.s3_key)}`, {
                    headers: {
                      'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                      'Content-Type': 'application/json'
                    }
                  });
                  
                  if (extractResponse.ok) {
                    const extractResult = await extractResponse.json();
                    if (extractResult.success && extractResult.data && extractResult.data.text) {
                      fileContent = extractResult.data.text;
                      
                      // 取得したテキストをセッションストレージに保存
                      const saveSuccess = SessionStorageManager.saveContext(
                        currentLesson,
                        textFile.s3_key,
                        fileContent,
                        {
                          fileType: textFile.file_type,
                          lessonTitle: lessonData?.title,
                          fileName: textFile.file_name,
                          source: 'additional_text_file'
                        }
                      );
                      
                      if (saveSuccess) {
                        console.log('追加テキストファイルのコンテキストをセッションストレージに保存完了:', {
                          fileName: textFile.file_name
                        });
                      }
                    }
                  } else {
                    console.warn('追加テキストファイルの取得に失敗:', {
                      fileName: textFile.file_name,
                      status: extractResponse.status,
                      statusText: extractResponse.statusText
                    });
                  }
                }
                
                // 取得した内容を追加
                if (fileContent && fileContent.trim().length > 0) {
                  allTextContent += `\n\n## 追加テキスト: ${textFile.file_name || '追加テキスト'}\n\n`;
                  allTextContent += fileContent;
                  console.log('追加テキストファイルの内容を追加:', {
                    fileName: textFile.file_name,
                    contentLength: fileContent.length
                  });
                }
              } catch (error) {
                console.error('追加テキストファイルの取得エラー:', {
                  error: error.message,
                  fileName: textFile.file_name,
                  s3Key: textFile.s3_key
                });
              }
            }
          } else {
            console.log('追加テキストファイルはありません');
          }
        } else {
          console.warn('追加テキストファイル一覧の取得に失敗:', {
            status: additionalFilesResponse.status,
            statusText: additionalFilesResponse.statusText
          });
        }
      } catch (error) {
        console.error('追加テキストファイル取得処理エラー:', error);
        // エラーが発生しても処理を続行
      }
      
      // コンテキスト化の完了を確認
      const finalTextLength = allTextContent.length;
      const hasValidFinalContent = allTextContent.includes('AI') || 
                                   allTextContent.includes('Google') || 
                                   allTextContent.includes('検索') || 
                                   allTextContent.includes('音声') ||
                                   allTextContent.includes('翻訳') ||
                                   allTextContent.includes('画像') ||
                                   allTextContent.includes('DALL') ||
                                   allTextContent.includes('Perplexity') ||
                                   allTextContent.includes('倫理') ||
                                   allTextContent.includes('バイアス') ||
                                   allTextContent.includes('Windows') ||
                                   allTextContent.includes('ソフトウェア') ||
                                   allTextContent.includes('コンピュータ') ||
                                   allTextContent.includes('基本操作') ||
                                   allTextContent.length > 200;
      
      console.log('レッスン全体のテキスト内容取得完了:', {
        totalLength: allTextContent.length,
        sectionCount: sectionData?.length || 0,
        hasValidFinalContent,
        textPreview: allTextContent.substring(0, 500),
        textEnd: allTextContent.substring(allTextContent.length - 500),
        hasContent: allTextContent.length > 0,
        contentPreview: allTextContent.substring(0, 200) + '...',
        currentLesson: currentLesson,
        lessonTitle: lessonData?.title
      });
      
      return allTextContent;
    } catch (error) {
      console.error('レッスンテキスト内容取得エラー:', error);
      return '';
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
      
      // テスト結果を提出
      const response = await fetch(`${API_BASE_URL}/api/learning/test/submit`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          lessonId: parseInt(currentLesson),
          testType: 'lesson',
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
              testType: 'lesson',
              lessonId: currentLesson,
              lessonTitle: lessonData?.title || `第${currentLesson}回`,
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
            レッスンテストを準備中...
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
                <h1 className="text-2xl font-bold">レッスンまとめテスト</h1>
                <span className="text-blue-100 text-sm">
                  {lessonData?.title} - 全セクション
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

export default LessonTestPage;

