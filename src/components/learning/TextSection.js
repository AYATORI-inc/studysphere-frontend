import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MarkdownRenderer from './MarkdownRenderer';
import { SessionStorageManager } from '../../utils/sessionStorage';
import { API_BASE_URL } from '../../config/apiConfig';

const TEXT_ERROR_KEYWORDS = [
  'テキストファイルの読み込みに失敗しました',
  'テキストファイルが設定されていません',
  'テキスト内容が利用できません'
];

const TextSection = ({
  lessonData,
  textContent,
  textLoading,
  textContainerRef,
  onTextContentUpdate // テキスト内容更新のコールバック
}) => {
  const [pdfTextContent, setPdfTextContent] = useState('');
  const [isPdfProcessing, setIsPdfProcessing] = useState(false);
  const [pdfProcessingError, setPdfProcessingError] = useState(null);
  
  // 処理のキャンセル用のAbortController
  const abortControllerRef = useRef(null);
  // 処理のタイムアウト用のタイマー
  const timeoutRef = useRef(null);
  // 処理済みのS3キーを記録（無限ループ防止）
  const processedS3KeyRef = useRef(null);

  // PDF表示用（iframeはAuthorizationヘッダーを送れないため、fetchで取得してBlob URLにする）
  const [pdfViewerUrl, setPdfViewerUrl] = useState(null);
  const [pdfViewerError, setPdfViewerError] = useState(null);

  useEffect(() => {
    setPdfViewerUrl(null);
    setPdfViewerError(null);

    if (lessonData?.file_type !== 'pdf' || lessonData?.pdfUrl || !lessonData?.s3_key) {
      return;
    }

    let cancelled = false;
    let objectUrl = null;

    const loadPdf = async () => {
      try {
        const token = localStorage.getItem('accessToken');
        const response = await fetch(
          `${API_BASE_URL}/api/learning/pdf-viewer?key=${encodeURIComponent(lessonData.s3_key)}`,
          {
            headers: token ? { 'Authorization': `Bearer ${token}` } : {},
          }
        );
        if (!response.ok) {
          throw new Error(`PDFの取得に失敗しました（${response.status}）`);
        }
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfViewerUrl(objectUrl);
      } catch (err) {
        console.error('PDF取得エラー:', err);
        if (!cancelled) setPdfViewerError(err.message);
      }
    };

    loadPdf();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [lessonData?.file_type, lessonData?.pdfUrl, lessonData?.s3_key]);

  // テキストファイルの処理（PDF、TXT、MD、RTFすべてに対応）
  useEffect(() => {
    console.log('TextSection useEffect - 実行開始');
    console.log('TextSection - 受け取ったlessonData:', lessonData);
    console.log('TextSection - lessonData.file_type:', lessonData?.file_type);
    console.log('TextSection - lessonData.s3_key:', lessonData?.s3_key);
    console.log('TextSection - pdfTextContent:', pdfTextContent);
    console.log('TextSection - textContent:', textContent);
    
    // レッスンデータが存在しない場合は処理をスキップ
    if (!lessonData || !lessonData.s3_key) {
      console.log('レッスンデータまたはS3キーが存在しません');
      return;
    }
    
    // S3キーの詳細なデバッグ情報
    console.log('S3キーの詳細:', {
      s3_key: lessonData.s3_key,
      keyType: typeof lessonData.s3_key,
      keyLength: lessonData.s3_key.length,
      isEmpty: lessonData.s3_key.trim() === '',
      containsSpaces: lessonData.s3_key.includes(' '),
      containsSpecialChars: /[<>:"|?*]/.test(lessonData.s3_key)
    });
    
    // セッションストレージの状態を確認
    const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
    console.log('セッションストレージ状態:', {
      hasStoredContext,
      lessonId: lessonData.id,
      s3Key: lessonData.s3_key
    });
    
    // 既存のコンテキストがある場合は、親コンポーネントに完了状態を通知
    if (hasStoredContext) {
      const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
      console.log('保存済みコンテキスト情報:', storedContext.metadata);
      
      if (onTextContentUpdate) {
        console.log('既存コンテキストを親コンポーネントに通知:', { contextLength: storedContext.context.length });
        onTextContentUpdate(storedContext.context);
      }
      
      // 処理済みのS3キーを記録
      processedS3KeyRef.current = lessonData.s3_key;
      
      return; // 既存のコンテキストがある場合は処理をスキップ
    }
    
    console.log('TextSection useEffect - 条件チェック:', {
      fileType: lessonData?.file_type,
      s3Key: lessonData?.s3_key,
      pdfTextContent: pdfTextContent,
      textContent: textContent,
      hasS3Key: !!lessonData?.s3_key,
      shouldExtractPdf: lessonData?.file_type === 'pdf' && lessonData?.s3_key && !pdfTextContent,
      shouldSaveText: (lessonData?.file_type === 'txt' || lessonData?.file_type === 'md' || lessonData?.file_type === 'application/rtf') && textContent
    });
    
    // PDFファイルの場合はテキスト抽出を実行
    if (lessonData?.file_type === 'pdf' && lessonData?.s3_key && !pdfTextContent) {
      console.log('PDFテキスト抽出を開始します:', lessonData.s3_key);
      extractPdfText(lessonData.s3_key);
    }
    // TXT、MD、RTFファイルの場合は既存のtextContentをセッションストレージに保存
    else if ((lessonData?.file_type === 'txt' || lessonData?.file_type === 'md' || lessonData?.file_type === 'text/markdown' || lessonData?.file_type === 'application/rtf') && textContent) {
      console.log('テキストファイルのコンテキストをセッションストレージに保存:', {
        fileType: lessonData.file_type,
        textLength: textContent.length,
        s3Key: lessonData.s3_key
      });
      
      const normalizedText = textContent.trim();
      const isErrorContent = !normalizedText || TEXT_ERROR_KEYWORDS.some(keyword => normalizedText.includes(keyword));
      
      if (isErrorContent) {
        console.warn('テキストコンテンツがエラー状態のため、セッションストレージへの保存をスキップします');
        if (onTextContentUpdate) {
          onTextContentUpdate(textContent);
        }
        processedS3KeyRef.current = lessonData.s3_key;
        return;
      }
      
      // セッションストレージにコンテキストを保存
      const saveSuccess = SessionStorageManager.saveContext(
        lessonData.id,
        lessonData.s3_key,
        textContent,
        {
          fileType: lessonData.file_type,
          lessonTitle: lessonData.title,
          processingTime: 0 // テキストファイルは即座に利用可能
        }
      );
      
      if (saveSuccess) {
        console.log('テキストファイルのコンテキストをセッションストレージに保存完了');
        // 親コンポーネントにテキスト内容を通知
        if (onTextContentUpdate) {
          onTextContentUpdate(textContent);
        }
        // 処理済みのS3キーを記録
        processedS3KeyRef.current = lessonData.s3_key;
      } else {
        console.error('テキストファイルのコンテキスト保存に失敗');
      }
    } else {
      console.log('テキスト処理の条件が満たされていません');
    }
   }, [lessonData, textContent]); // textContentを依存配列に追加

  // コンポーネントのアンマウント時に処理をクリーンアップ
  useEffect(() => {
    return () => {
      // タイムアウトタイマーをクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // 進行中の処理をキャンセル
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // PDFからテキストを抽出
  const extractPdfText = async (s3Key, retryCount = 0) => {
    if (!s3Key) {
      console.error('extractPdfText: s3Keyが提供されていません');
      setPdfProcessingError('S3キーが提供されていません');
      return;
    }
    
    // セッションストレージから既存のコンテキストを確認
    const existingContext = SessionStorageManager.getContext(lessonData?.id, s3Key, lessonData?.file_type);
    if (existingContext) {
      console.log('セッションストレージから既存のコンテキストを使用:', {
        contextLength: existingContext.context.length,
        savedAt: existingContext.metadata.savedAt
      });
      
      setPdfTextContent(existingContext.context);
      processedS3KeyRef.current = s3Key;
      
      if (onTextContentUpdate) {
        onTextContentUpdate(existingContext.context);
      }
      
           return; // 既存のコンテキストがある場合は処理をスキップ
   }
    
    console.log('extractPdfText: 開始', {
      s3Key,
      lessonId: lessonData?.id,
      lessonTitle: lessonData?.title,
      retryCount
    });
    
    // 既に処理中の場合は新しい処理を開始しない
    if (isPdfProcessing) {
      console.log('既にPDF処理が進行中です。新しい処理を開始しません。');
      return;
    }
    
    setIsPdfProcessing(true);
    setPdfProcessingError(null);
    
    // 新しいAbortControllerを作成
    abortControllerRef.current = new AbortController();
    
    try {
      console.log(`PDFテキスト抽出開始 (試行回数: ${retryCount + 1})`, { 
        s3Key,
        lessonId: lessonData?.id,
        lessonTitle: lessonData?.title
      });
      
      // タイムアウト処理を設定（5分に短縮）
      timeoutRef.current = setTimeout(() => {
        console.warn('PDFテキスト抽出がタイムアウトしました');
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        const timeoutMessage = 'PDFテキスト抽出がタイムアウトしました。ファイルサイズが大きすぎる可能性があります。';
        setPdfProcessingError(timeoutMessage);
        setIsPdfProcessing(false);
        // タイムアウト時も親コンポーネントに通知
        if (onTextContentUpdate) {
          onTextContentUpdate(`エラー: ${timeoutMessage}`);
        }
      }, 5 * 60 * 1000); // 5分に短縮
      
      // PDFテキスト抽出APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/learning/extract-pdf-text`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
        },
        body: JSON.stringify({
          s3Key: s3Key,
          lessonId: lessonData?.id
        }),
        signal: abortControllerRef.current.signal
      });

      // タイムアウトタイマーをクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }

      if (response.ok) {
        const data = await response.json();
        console.log('PDFテキスト抽出API応答:', data);
        
        if (data.success && data.textContent) {
          setPdfTextContent(data.textContent);
          // 処理済みのS3キーを記録
          processedS3KeyRef.current = s3Key;
          
          // セッションストレージにコンテキストを保存
          const saveSuccess = SessionStorageManager.saveContext(
            lessonData?.id,
            s3Key,
            data.textContent,
            {
              fileType: lessonData?.file_type,
              lessonTitle: lessonData?.title,
              processingTime: data.processingTime || 0
            }
          );
          
          if (saveSuccess) {
            console.log('コンテキストをセッションストレージに保存完了');
          }
          
          // 親コンポーネントにテキスト内容を通知
          if (onTextContentUpdate) {
            onTextContentUpdate(data.textContent);
          }
          console.log('PDFテキスト抽出成功:', { textLength: data.textContent.length });
        } else {
          console.warn('PDFテキスト抽出失敗:', data.message);
          const errorMessage = `テキスト抽出に失敗しました: ${data.message}`;
          setPdfProcessingError(errorMessage);
          setPdfTextContent(errorMessage);
          // エラー時も親コンポーネントに通知
          if (onTextContentUpdate) {
            onTextContentUpdate(errorMessage);
          }
        }
      } else {
        const errorMessage = `PDFテキスト抽出API呼び出し失敗: ${response.status}`;
        console.error(errorMessage);
        
        // エラーレスポンスの詳細を確認
        try {
          const errorData = await response.json();
          console.error('エラー詳細:', errorData);
          
          // S3キーが存在しない場合の詳細なエラーメッセージ
          if (errorData.message?.includes('does not exist')) {
            const detailedError = `PDFファイルが見つかりません。S3キー: ${s3Key}`;
            console.error(detailedError);
            setPdfProcessingError(detailedError);
            setPdfTextContent(detailedError);
            // エラー時も親コンポーネントに通知
            if (onTextContentUpdate) {
              onTextContentUpdate(detailedError);
            }
          } else {
            const errorMsg = `テキスト抽出に失敗しました: ${errorData.message || '不明なエラー'}`;
            setPdfProcessingError(errorMsg);
            setPdfTextContent(errorMsg);
            // エラー時も親コンポーネントに通知
            if (onTextContentUpdate) {
              onTextContentUpdate(errorMsg);
            }
          }
                  } catch (parseError) {
            console.error('エラーレスポンスの解析に失敗:', parseError);
            const errorMsg = `テキスト抽出に失敗しました (HTTP ${response.status})`;
            setPdfProcessingError(errorMsg);
            setPdfTextContent(errorMsg);
            // エラー時も親コンポーネントに通知
            if (onTextContentUpdate) {
              onTextContentUpdate(errorMsg);
            }
          }
        
        // リトライロジック（最大3回）
        if (retryCount < 2 && response.status >= 500) {
          console.log(`${retryCount + 1}回目のリトライを実行します...`);
          setTimeout(() => {
            extractPdfText(s3Key, retryCount + 1);
          }, 2000 * (retryCount + 1)); // 指数バックオフ
          return;
        }
      }
    } catch (error) {
      // タイムアウトタイマーをクリア
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      
      // AbortErrorの場合は処理を中断
      if (error.name === 'AbortError') {
        console.log('PDFテキスト抽出がキャンセルされました');
        setPdfProcessingError('PDFテキスト抽出がキャンセルされました');
        return;
      }
      
      console.error('PDFテキスト抽出エラー:', error);
      
      // リトライロジック（ネットワークエラーの場合）
      if (retryCount < 2 && (error.name === 'TypeError' || error.message.includes('Failed to fetch'))) {
        console.log(`${retryCount + 1}回目のリトライを実行します...`);
        setTimeout(() => {
          extractPdfText(s3Key, retryCount + 1);
        }, 2000 * (retryCount + 1));
        return;
      }
      
              const errorMessage = `テキスト抽出中にエラーが発生しました: ${error.message}`;
        setPdfProcessingError(errorMessage);
        setPdfTextContent(errorMessage);
        // エラー時も親コンポーネントに通知
        if (onTextContentUpdate) {
          onTextContentUpdate(errorMessage);
        }
    } finally {
      setIsPdfProcessing(false);
      // AbortControllerをクリア
      abortControllerRef.current = null;
    }
  };

  // 処理をキャンセル
  const cancelPdfProcessing = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      console.log('PDFテキスト抽出をキャンセルしました');
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsPdfProcessing(false);
    setPdfProcessingError(null);
  };

  // RTFタグを除去してプレーンテキストに変換する関数
  const stripRtfTags = (rtfText) => {
    if (!rtfText) return '';
    
    // RTFタグを除去（基本的なRTFタグのみ）
    return rtfText
      .replace(/\\[a-z]+\d*\s?/g, '') // RTFコマンドを除去
      .replace(/[{}]/g, '') // 中括弧を除去
      .replace(/\\\s/g, ' ') // エスケープされたスペースを通常のスペースに
      .replace(/\s+/g, ' ') // 連続するスペースを1つに
      .trim();
  };

  // 表示するテキスト内容を決定
  const displayTextContent = () => {
    if (lessonData?.file_type === 'pdf') {
      if (pdfProcessingError) {
        return `エラー: ${pdfProcessingError}`;
      }
      if (isPdfProcessing) {
        return 'PDFファイルの処理中...';
      }
      return pdfTextContent || 'PDFファイルの読み込み中...';
    }
    
    // RTFファイルの場合はタグを除去
    if (lessonData?.file_type === 'application/rtf' || lessonData?.s3_key?.toLowerCase().endsWith('.rtf')) {
      return stripRtfTags(textContent) || 'テキスト内容がありません';
    }
    
    return textContent || 'テキスト内容がありません';
  };

  // テキスト内容の長さを取得（AIアシスタント用）
  const getTextLength = () => {
    const content = displayTextContent();
    return content ? content.length : 0;
  };

  if (textLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <span className="text-2xl">📄</span>
          <h3 className="text-xl font-bold text-gray-800">テキスト内容</h3>
        </div>
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-blue-600 font-medium">テキストを読み込み中...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-2xl">📄</span>
        <h3 className="text-xl font-bold text-gray-800">テキスト内容</h3>
        {lessonData?.file_type === 'pdf' && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            PDF
          </span>
        )}
                 {/* PDF処理中のキャンセルボタン */}
         {lessonData?.file_type === 'pdf' && isPdfProcessing && (
           <button
             onClick={cancelPdfProcessing}
             className="px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
             title="処理をキャンセル"
           >
             キャンセル
           </button>
         )}
         

      </div>
      
      {/* エラーメッセージ表示 */}
      {pdfProcessingError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2">
            <span className="text-red-500">⚠️</span>
            <p className="text-red-700 text-sm">{pdfProcessingError}</p>
          </div>
                     <button
             onClick={() => {
               setPdfProcessingError(null);
               if (lessonData?.s3_key) {
                 extractPdfText(lessonData.s3_key);
               }
             }}
             className="mt-2 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
           >
             再試行
           </button>
        </div>
      )}
      
      {/* テキスト内容表示 */}
      <div 
        ref={textContainerRef}
        className="h-[85vh] overflow-y-auto custom-scrollbar border border-gray-200 rounded-lg p-2 bg-gray-50"
      >
        {lessonData?.file_type === 'pdf' ? (
          <div className="h-full">
            {/* PDFをiframeで表示 */}
            <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden relative">
              {!(lessonData.pdfUrl || pdfViewerUrl) && !pdfViewerError && (
                <div className="absolute inset-0 flex items-center justify-center text-gray-500 bg-white">
                  PDFを読み込み中...
                </div>
              )}
              <iframe
                src={lessonData.pdfUrl || pdfViewerUrl || undefined}
                title="PDF Viewer"
                className="w-full h-full"
                frameBorder="0"
                allow="fullscreen"
                onError={() => {
                  console.error('PDF iframe 読み込みエラー');
                  setPdfViewerError('PDFの表示に失敗しました');
                }}
              />
              {/* エラー時のフォールバック */}
              <div className={`absolute inset-0 bg-gray-100 flex items-center justify-center ${pdfViewerError ? '' : 'hidden'}`}>
                <div className="text-center">
                  <p className="text-gray-600 mb-3">PDFの表示に失敗しました</p>
                  <div className="space-y-2">
                    <button 
                      onClick={() => pdfViewerUrl && window.open(lessonData.pdfUrl || pdfViewerUrl, '_blank')}
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 mr-2"
                    >
                      新しいタブで開く
                    </button>
                    <button 
                      onClick={() => window.location.reload()}
                      className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600"
                    >
                      再読み込み
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mt-2">
                    S3キー: {lessonData.s3_key}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none">
            {/* MDファイルの場合はMarkdownとしてレンダリング */}
            {lessonData?.file_type === 'md' || lessonData?.file_type === 'text/markdown' || lessonData?.s3_key?.toLowerCase().endsWith('.md') ? (
              <MarkdownRenderer 
                content={displayTextContent()}
                showToc={false}
              />
            ) : (
              /* RTFファイルやその他のテキストファイルはプレーンテキストとして表示 */
              <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                {displayTextContent()}
              </div>
            )}
          </div>
        )}
      </div>

      {/* テキスト情報 */}
      {(lessonData?.file_type === 'pdf' && pdfTextContent) || 
       (lessonData?.file_type === 'txt' && textContent) ||
       (lessonData?.file_type === 'md' && textContent) ||
       (lessonData?.file_type === 'text/markdown' && textContent) ||
       (lessonData?.file_type === 'application/rtf' && textContent) ||
       (lessonData?.file_type === 'text/plain' && textContent) ? (
        <div className="mt-3 text-xs text-gray-500">
          <span className="text-blue-600">
            ✓ AIアシスタントで利用可能
          </span>
          {lessonData?.file_type === 'txt' && (
            <span className="ml-2 text-blue-600">
              📄 テキスト形式
            </span>
          )}
          {lessonData?.file_type === 'md' && (
            <span className="ml-2 text-green-600">
              📝 Markdown形式
            </span>
          )}
          {lessonData?.file_type === 'application/rtf' && (
            <span className="ml-2 text-orange-600">
              📄 RTF形式
            </span>
          )}
          {lessonData?.file_type === 'text/plain' && (
            <span className="ml-2 text-gray-600">
              📄 プレーンテキスト形式
            </span>
          )}
        </div>
      ) : null}
    </div>
  );
};

export default TextSection;
