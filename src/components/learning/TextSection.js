import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import MarkdownRenderer from './MarkdownRenderer';
import { SessionStorageManager } from '../../utils/sessionStorage';
import { API_BASE_URL } from '../../config/apiConfig';

const TextSection = ({
  lessonData,
  textContent,
  textContentS3Key,
  textLoading,
  textContainerRef,
  onTextContentUpdate, // テキスト内容更新のコールバック
  sectionData, // セクションデータ
  currentSection, // 現在のセクションインデックス
  isLastSection, // 最後のセクションか（最後なら「次のセクションへ」→「レッスン総合テスト」に表示変更）
  onSectionTestClick, // 10問テストに挑戦のナビゲーション
  onNextSectionClick // 次のセクション／レッスン総合テストのナビゲーション
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
  // ファイルタイプとS3キーを保持（再レンダリング時に失われないようにする）
  const fileTypeRef = useRef(null);
  const s3KeyRef = useRef(null);

  // 現在表示すべき「アクティブなテキストキー/タイプ」を決定
  // セクションがある場合はそのセクションを最優先（= ドロップダウンと本文を一致させる）
  const getActiveTextMeta = () => {
    const section = Array.isArray(sectionData) ? sectionData[currentSection] : null;
    let activeS3Key = section?.text_file_key || lessonData?.s3_key || s3KeyRef.current || null;
    const activeFileType = section?.file_type || lessonData?.file_type || fileTypeRef.current || null;
    // `text_file_key` がファイル名だけで来るケースがあるため、lessonData.s3_key で解決できる場合は補正する
    // 例: "C2-11-1...md" → "lessons/.../C2-11-1...md"
    try {
      const looksLikeFullPath = typeof activeS3Key === 'string' && activeS3Key.includes('/');
      if (!looksLikeFullPath && typeof activeS3Key === 'string' && lessonData?.s3_key) {
        const extractFileName = (key) => {
          const parts = String(key || '').split('/');
          return (parts[parts.length - 1] || '').trim().toLowerCase();
        };
        const a = extractFileName(activeS3Key);
        const b = extractFileName(lessonData.s3_key);
        if (a && b && a === b) {
          activeS3Key = lessonData.s3_key;
        }
      }
    } catch (_) {
      // no-op
    }
    return { section, activeS3Key, activeFileType };
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

  // file_typeがPDFかどうかを判定する関数
  const isPdfFile = (fileType, s3Key) => {
    if (!fileType && !s3Key) return false;
    const lowerFileType = fileType?.toLowerCase() || '';
    const lowerS3Key = s3Key?.toLowerCase() || '';
    
    // MD、TXT、RTFファイルの場合はPDFではない
    if (lowerFileType === 'text/markdown' || lowerFileType === 'md' || 
        lowerFileType === 'text/plain' || lowerFileType === 'txt' ||
        lowerFileType === 'application/rtf' || lowerFileType === 'rtf') {
      console.log('isPdfFile: テキストファイルとして判定（PDFではない）', {
        fileType: lowerFileType,
        s3Key: lowerS3Key
      });
      return false;
    }
    
    // PDF判定
    const isPdf = lowerFileType === 'pdf' || 
                  lowerFileType === 'application/pdf' ||
                  lowerS3Key.endsWith('.pdf');
    
    console.log('isPdfFile: PDF判定結果', {
      fileType: lowerFileType,
      s3Key: lowerS3Key,
      isPdf: isPdf
    });
    
    return isPdf;
  };

  // テキストファイルの処理（PDF、TXT、MD、RTFすべてに対応）
  useEffect(() => {
    console.log('TextSection useEffect - 実行開始');
    console.log('TextSection - 受け取ったlessonData:', lessonData);
    console.log('TextSection - lessonData.file_type:', lessonData?.file_type);
    console.log('TextSection - lessonData.s3_key:', lessonData?.s3_key);
    console.log('TextSection - pdfTextContent:', pdfTextContent);
    console.log('TextSection - textContent:', textContent);
    console.log('TextSection - sectionData:', sectionData);
    console.log('TextSection - sectionData type:', typeof sectionData);
    console.log('TextSection - sectionData isArray:', Array.isArray(sectionData));
    console.log('TextSection - sectionData length:', Array.isArray(sectionData) ? sectionData.length : 'N/A');
    console.log('TextSection - currentSection:', currentSection);
    
    // file_typeとs3_keyをrefに保存（再レンダリング時に失われないようにする）
    if (lessonData?.file_type) {
      fileTypeRef.current = lessonData.file_type;
      console.log('✅ file_typeをrefに保存:', lessonData.file_type);
    }
    if (lessonData?.s3_key) {
      s3KeyRef.current = lessonData.s3_key;
      console.log('✅ s3_keyをrefに保存:', lessonData.s3_key);
    }
    
    // セクションデータの確認を最初に行う
    // 複数のテキストを持たない学習画面では、セクションにtext_file_keyが存在しない場合がある
    
    // セクションデータがnullの場合（まだ読み込まれていない）は、セクションデータが読み込まれるまで待つ
    if (sectionData === null || sectionData === undefined) {
      console.log('⚠️ セクションデータがまだ読み込まれていません。セクションデータの読み込みを待ちます');
      return;
    }
    
    // セクションデータが空配列の場合（複数のテキストを持たない学習画面）
    // この場合、lessonData.s3_keyがあっても処理をスキップする
    // ただし、既存のtextContentが存在する場合は上書きしない
    if (Array.isArray(sectionData) && sectionData.length === 0) {
      console.log('⚠️ セクションデータが空です。テキストファイルの読み込みをスキップします（複数のテキストを持たない学習画面）', {
        sectionDataLength: sectionData.length,
        lessonDataS3Key: lessonData?.s3_key,
        lessonDataFileType: lessonData?.file_type,
        hasExistingTextContent: !!(textContent && textContent.length > 0),
        hasStoredContext: lessonData?.s3_key ? SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type) : false
      });
      
      // 既存のtextContentが存在する場合
      if (textContent && textContent.length > 0) {
        console.log('✅ 既存のtextContentが存在するため、空で上書きしません:', {
          textContentLength: textContent.length
        });
        // PDFレッスンの場合は親に通知して「完了」状態にしないとAI・テストがロックされたままになる
        const isPdfWithContent = isPdfFile(lessonData?.file_type, lessonData?.s3_key);
        if (isPdfWithContent && lessonData?.s3_key && onTextContentUpdate) {
          const isError = textContent.startsWith('エラー:') || textContent.startsWith('PDFファイルが見つかりません') || textContent.startsWith('テキスト抽出に失敗');
          if (!isError) {
            onTextContentUpdate(textContent, { s3Key: lessonData.s3_key, fileType: lessonData.file_type });
          }
        }
        return; // 既存のtextContentを保持するため、何もしない
      }
      
      // セッションストレージにコンテキストが存在する場合は、それを使用
      if (lessonData?.s3_key && lessonData?.id) {
        const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
        if (hasStoredContext) {
          const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
          console.log('✅ セッションストレージから既存のコンテキストを使用します:', {
            contextLength: storedContext.context.length
          });
          if (onTextContentUpdate) {
            onTextContentUpdate(storedContext.context, { s3Key: lessonData.s3_key, fileType: lessonData.file_type });
          }
          return; // セッションストレージから取得したコンテキストを使用
        }
      }
      
      // 既存のtextContentもセッションストレージのコンテキストも存在しない場合
      // PDFの場合は lessonData.s3_key でテキスト抽出を実行（セクションデータが空でもPDFは読み込む）
      const isPdfWhenEmpty = isPdfFile(lessonData?.file_type, lessonData?.s3_key);
      if (isPdfWhenEmpty && lessonData?.s3_key && !pdfTextContent && processedS3KeyRef.current !== lessonData.s3_key) {
        console.log('セクションデータが空ですがPDFのためテキスト抽出を開始します:', { s3Key: lessonData.s3_key });
        extractPdfText(lessonData.s3_key);
        return;
      }
      if (onTextContentUpdate) {
        console.log('⚠️ 既存のtextContentもセッションストレージのコンテキストも存在しないため、空を通知します');
        onTextContentUpdate('');
      }
      return;
    }
    
    // セクションデータが存在する場合、現在のセクションにtext_file_keyが存在するか確認
    if (Array.isArray(sectionData) && sectionData.length > 0) {
      const currentSectionData = sectionData[currentSection];
      if (currentSectionData && !currentSectionData.text_file_key) {
        console.log('⚠️ 現在のセクションにtext_file_keyが存在しません。セクション固有テキストは無いので、レッスン本体テキストへフォールバックします:', {
          currentSection,
          sectionTitle: currentSectionData.section_title,
          hasTextFileKey: !!currentSectionData.text_file_key
        });
        // ここで return すると「テキストがありません」になりやすいので return しない
        // （後段で lessonData.s3_key を使って読み込み/表示する）
      }
      
      // 複数テキストが存在するかどうかを判定
      const multipleTexts = hasMultipleTexts(sectionData);
      
      // セクションデータが存在する場合、セクションのtext_file_keyとlessonData.s3_keyが一致するか確認
      // ただし、複数テキストが存在する場合は、このチェックをスキップ（セクション切り替え時に常に読み込む）
      // セクションのtext_file_keyはファイル名のみ、lessonData.s3_keyは完全パスの可能性がある
      if (!multipleTexts && currentSectionData && currentSectionData.text_file_key && lessonData?.s3_key) {
        const sectionTextFileKey = currentSectionData.text_file_key;
        const lessonS3Key = lessonData.s3_key;
        
        // ファイル名を抽出して比較
        const extractFileName = (key) => {
          if (!key) return '';
          const parts = key.split('/');
          return parts[parts.length - 1].trim().toLowerCase();
        };
        
        const sectionFileName = extractFileName(sectionTextFileKey);
        const lessonFileName = extractFileName(lessonS3Key);
        
        // 以前は「ファイル名が一致しない場合はスキップ」していたが、
        // セクションは lesson_text_video_links / lesson_text_files の結合で構成されるため
        // `lessonData.s3_key` と一致しないのが正常ケース（= セクション固有テキスト）になり得る。
        // そのため、ここではスキップせず後段の activeS3Key を使った読み込みに任せる。
        if (sectionFileName !== lessonFileName) {
          console.log('ℹ️ セクションのtext_file_keyとlessonData.s3_keyが一致しません。セクション固有テキストとして扱い、読み込みを継続します:', {
            sectionTextFileKey,
            lessonS3Key,
            sectionFileName,
            lessonFileName,
            currentSection
          });
        }
      }
      
      // 複数テキストが存在する場合のログ
      if (multipleTexts) {
        console.log('複数テキストが存在するため、ファイル名一致チェックをスキップします:', {
          currentSection,
          sectionTextFileKey: currentSectionData?.text_file_key,
          lessonS3Key: lessonData?.s3_key
        });
      }
      
      // すべてのセクションにtext_file_keyがない場合もスキップ
      const hasAnyTextFileKey = sectionData.some(section => section.text_file_key);
      if (!hasAnyTextFileKey) {
        console.log('⚠️ すべてのセクションにtext_file_keyが存在しません。セクション固有テキストは無いので、レッスン本体テキストへフォールバックします');
        // ここで return すると「テキストがありません」になりやすいので return しない
      }
    }
    
    // レッスンデータが存在しない場合は処理をスキップ
    // ただし、既存のtextContentが存在する場合は、それを保持するため処理を続行
    if (!lessonData) {
      console.log('⚠️ レッスンデータが存在しません');
      return;
    }
    
    // lessonData.s3_keyが存在しない場合でも、既存のtextContentが存在する場合は保持する
    if (!lessonData.s3_key) {
      console.log('⚠️ レッスンデータのS3キーが存在しません', {
        hasExistingTextContent: !!(textContent && textContent.length > 0),
        lessonId: lessonData.id
      });
      
      // 既存のtextContentが存在する場合は、それを保持するため処理を続行しない
      if (textContent && textContent.length > 0) {
        console.log('✅ 既存のtextContentが存在するため、それを保持します:', {
          textContentLength: textContent.length
        });
        return; // 既存のtextContentを保持するため、何もしない
      }
      
      // セッションストレージからコンテキストを確認（lessonIdのみで検索）
      // 注意: これは最後の手段であり、s3_keyがない場合は正確に一致しない可能性がある
      if (lessonData.id) {
        // セッションストレージから、このレッスンIDに関連するコンテキストを検索
        // ただし、s3_keyがない場合は正確に一致しない可能性があるため、慎重に処理
        console.log('⚠️ S3キーがないため、セッションストレージからのコンテキスト取得はスキップします');
      }
      
      return;
    }
    
    // セクションデータが空配列の場合、lessonData.s3_keyがあっても処理をスキップ（二重チェック）
    // これは、セクションデータが空配列に設定される前に処理が実行される可能性があるため
    // ただし、既存のtextContentが存在する場合は上書きしない
    if (Array.isArray(sectionData) && sectionData.length === 0) {
      console.log('⚠️ セクションデータが空です（二重チェック）。テキストファイルの読み込みをスキップします', {
        hasExistingTextContent: !!(textContent && textContent.length > 0),
        hasStoredContext: lessonData?.s3_key ? SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type) : false
      });
      
      // 既存のtextContentが存在する場合は、空で上書きしない
      if (textContent && textContent.length > 0) {
        console.log('✅ 既存のtextContentが存在するため、空で上書きしません（二重チェック）:', {
          textContentLength: textContent.length
        });
        // PDFレッスンの場合は親に通知して「完了」状態にする
        const isPdfWithContent2 = isPdfFile(lessonData?.file_type, lessonData?.s3_key);
        if (isPdfWithContent2 && lessonData?.s3_key && onTextContentUpdate) {
          const isError2 = textContent.startsWith('エラー:') || textContent.startsWith('PDFファイルが見つかりません') || textContent.startsWith('テキスト抽出に失敗');
          if (!isError2) {
            onTextContentUpdate(textContent, { s3Key: lessonData.s3_key, fileType: lessonData.file_type });
          }
        }
        return; // 既存のtextContentを保持するため、何もしない
      }
      
      // セッションストレージにコンテキストが存在する場合は、それを使用
      if (lessonData?.s3_key && lessonData?.id) {
        const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
        if (hasStoredContext) {
          const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
          console.log('✅ セッションストレージから既存のコンテキストを使用します（二重チェック）:', {
            contextLength: storedContext.context.length
          });
          if (onTextContentUpdate) {
            onTextContentUpdate(storedContext.context, { s3Key: lessonData.s3_key, fileType: lessonData.file_type });
          }
          return; // セッションストレージから取得したコンテキストを使用
        }
      }
      
      // 既存のtextContentもセッションストレージのコンテキストも存在しない場合
      // PDFの場合は lessonData.s3_key でテキスト抽出を実行（二重チェック）
      const isPdfWhenEmpty2 = isPdfFile(lessonData?.file_type, lessonData?.s3_key);
      if (isPdfWhenEmpty2 && lessonData?.s3_key && !pdfTextContent && processedS3KeyRef.current !== lessonData.s3_key) {
        console.log('セクションデータが空ですがPDFのためテキスト抽出を開始します（二重チェック）:', { s3Key: lessonData.s3_key });
        extractPdfText(lessonData.s3_key);
        return;
      }
      if (onTextContentUpdate) {
        console.log('⚠️ 既存のtextContentもセッションストレージのコンテキストも存在しないため、空を通知します（二重チェック）');
        onTextContentUpdate('');
      }
      return;
    }
    
    // セクションの text_file_key / file_type を最優先に、今回表示すべきキーを決定
    const { activeS3Key, activeFileType } = getActiveTextMeta();
    const s3KeyToUse = activeS3Key || lessonData?.s3_key;
    const fileTypeToUse = activeFileType || lessonData?.file_type;

    // PDF判定（アクティブキー/タイプで判定）
    const isPdf = isPdfFile(fileTypeToUse, s3KeyToUse);
    console.log('TextSection - PDF判定結果:', {
      fileType: fileTypeToUse,
      fileTypeType: typeof fileTypeToUse,
      s3Key: s3KeyToUse,
      s3KeyEndsWithMd: s3KeyToUse?.toLowerCase().endsWith('.md'),
      s3KeyEndsWithPdf: s3KeyToUse?.toLowerCase().endsWith('.pdf'),
      isPdf: isPdf,
      lessonData: {
        id: lessonData.id,
        title: lessonData.title,
        file_type: fileTypeToUse,
        s3_key: s3KeyToUse
      }
    });
    
    // S3キーの詳細なデバッグ情報
    console.log('S3キーの詳細:', {
      s3_key: s3KeyToUse,
      keyType: typeof s3KeyToUse,
      keyLength: s3KeyToUse?.length,
      isEmpty: typeof s3KeyToUse === 'string' ? s3KeyToUse.trim() === '' : false,
      containsSpaces: typeof s3KeyToUse === 'string' ? s3KeyToUse.includes(' ') : false,
      containsSpecialChars: typeof s3KeyToUse === 'string' ? /[<>:"|?*]/.test(s3KeyToUse) : false
    });
    
    // セッションストレージの状態を確認
    const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, s3KeyToUse, fileTypeToUse);
    console.log('セッションストレージ状態:', {
      hasStoredContext,
      lessonId: lessonData.id,
      s3Key: s3KeyToUse
    });
    
    // 既存のコンテキストがある場合は、親コンポーネントに完了状態を通知
    if (hasStoredContext) {
      const { activeS3Key, activeFileType } = getActiveTextMeta();
      const s3KeyToUse = activeS3Key || lessonData?.s3_key;
      const fileTypeToUse = activeFileType || lessonData?.file_type;

      const storedContext = SessionStorageManager.getContext(lessonData.id, s3KeyToUse, fileTypeToUse);
      console.log('保存済みコンテキスト情報:', storedContext.metadata);
      
      if (onTextContentUpdate) {
        console.log('既存コンテキストを親コンポーネントに通知:', { contextLength: storedContext.context.length });
        onTextContentUpdate(storedContext.context, { s3Key: s3KeyToUse, fileType: fileTypeToUse });
      }
      
      // 処理済みのS3キーを記録
      processedS3KeyRef.current = s3KeyToUse;
      
      return; // 既存のコンテキストがある場合は処理をスキップ
    }
    
    // PDFファイルの場合はテキスト抽出を実行
    // ただし、既に処理済みのS3キーの場合は再実行しない
    // アクティブなキーに対して処理を進める
    const { activeS3Key: activeS3Key2, activeFileType: activeFileType2 } = getActiveTextMeta();
    const s3KeyToUse2 = activeS3Key2 || lessonData?.s3_key;
    const fileTypeToUse2 = activeFileType2 || lessonData?.file_type;

    if (isPdf && s3KeyToUse2 && !pdfTextContent && processedS3KeyRef.current !== s3KeyToUse2) {
      console.log('PDFテキスト抽出を開始します:', {
        s3Key: s3KeyToUse2,
        fileType: fileTypeToUse2,
        isPdf: isPdf,
        processedS3Key: processedS3KeyRef.current
      });
      extractPdfText(s3KeyToUse2);
    } else if (isPdf && s3KeyToUse2 && processedS3KeyRef.current === s3KeyToUse2) {
      console.log('PDF処理は既に完了しています。再実行しません:', {
        s3Key: s3KeyToUse2,
        processedS3Key: processedS3KeyRef.current
      });
    } else if (isPdf && s3KeyToUse2 && pdfTextContent) {
      console.log('PDFテキストは既に取得済みです。再取得しません:', {
        s3Key: s3KeyToUse2,
        pdfTextContentLength: pdfTextContent.length
      });
    }
    // TXT、MD、RTFファイルの場合（PDF以外のテキストファイル）
    else if (!isPdf && (fileTypeToUse2 === 'txt' || fileTypeToUse2 === 'md' || fileTypeToUse2 === 'text/markdown' || fileTypeToUse2 === 'text/plain' || fileTypeToUse2 === 'application/rtf')) {
      // textContent が「現在の lessonData.s3_key に対応している」場合のみ保存する
      // （セクション切替/復帰の瞬間に旧本文が残るレースで誤キャッシュされるのを防ぐ）
      const isTextMatchingCurrentKey = !!(textContentS3Key && s3KeyToUse2 && String(textContentS3Key) === String(s3KeyToUse2));

      // textContentが存在し、かつキーが一致する場合はセッションストレージに保存
      if (textContent && textContent.length > 0 && isTextMatchingCurrentKey) {
        console.log('テキストファイルのコンテキストをセッションストレージに保存:', {
          fileType: fileTypeToUse2,
          textLength: textContent.length,
          s3Key: s3KeyToUse2,
          textContentS3Key
        });
        
        // セッションストレージにコンテキストを保存
        const saveSuccess = SessionStorageManager.saveContext(
          lessonData.id,
          s3KeyToUse2,
          textContent,
          {
            fileType: fileTypeToUse2,
            lessonTitle: lessonData.title,
            processingTime: 0 // テキストファイルは即座に利用可能
          }
        );
        
        if (saveSuccess) {
          console.log('テキストファイルのコンテキストをセッションストレージに保存完了');
          // 親コンポーネントにテキスト内容を通知（メタ情報も付与）
          if (onTextContentUpdate) {
            onTextContentUpdate(textContent, { s3Key: s3KeyToUse2, fileType: fileTypeToUse2 });
          }
          // 処理済みのS3キーを記録
          processedS3KeyRef.current = s3KeyToUse2;
        } else {
          console.error('テキストファイルのコンテキスト保存に失敗');
        }
        // textContentが存在する場合は、テキストファイルの読み込みをスキップ
        return;
      } 
      // textContent があるがキーが不一致の場合は、誤表示・誤キャッシュを防ぐため利用せず、再取得へ回す
      else if (textContent && textContent.length > 0 && !isTextMatchingCurrentKey) {
        console.warn('⚠️ textContent のキーが現在の s3_key と一致しないため、保存/利用をスキップして再取得します', {
          currentS3Key: s3KeyToUse2,
          textContentS3Key,
          textLength: textContent.length
        });
        // このまま次の分岐（APIから読み込み）へ流す
      }
      // textContentが空で、s3_keyが変更された場合は、APIからテキストファイルを読み込む
      if (s3KeyToUse2 && processedS3KeyRef.current !== s3KeyToUse2) {
        // セクションデータが空配列の場合、テキストファイルの読み込みをスキップ（最終チェック）
        // ただし、既存のtextContentが存在する場合は上書きしない
        if (Array.isArray(sectionData) && sectionData.length === 0) {
          console.log('⚠️ セクションデータが空です（最終チェック）。テキストファイルの読み込みをスキップします', {
            hasExistingTextContent: !!(textContent && textContent.length > 0),
            hasStoredContext: lessonData?.s3_key ? SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type) : false
          });
          
          // 既存のtextContentが存在する場合は、空で上書きしない
          if (textContent && textContent.length > 0) {
            console.log('✅ 既存のtextContentが存在するため、空で上書きしません（最終チェック）:', {
              textContentLength: textContent.length
            });
            return; // 既存のtextContentを保持するため、何もしない
          }
          
          // セッションストレージにコンテキストが存在する場合は、それを使用
          if (lessonData?.s3_key && lessonData?.id) {
            const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
            if (hasStoredContext) {
              const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
              console.log('✅ セッションストレージから既存のコンテキストを使用します（最終チェック）:', {
                contextLength: storedContext.context.length
              });
              if (onTextContentUpdate) {
                onTextContentUpdate(storedContext.context);
              }
              return; // セッションストレージから取得したコンテキストを使用
            }
          }
          
          // 既存のtextContentもセッションストレージのコンテキストも存在しない場合のみ、空を通知
          if (onTextContentUpdate) {
            console.log('⚠️ 既存のtextContentもセッションストレージのコンテキストも存在しないため、空を通知します（最終チェック）');
            onTextContentUpdate('');
          }
          return;
        }
        
        // 複数テキストが存在するかどうかを判定
        const multipleTexts = hasMultipleTexts(sectionData);
        
        // セクションデータが存在する場合、セクションのtext_file_keyとlessonData.s3_keyが一致するか確認
        // ただし、複数テキストが存在する場合は、このチェックをスキップ（セクション切り替え時に常に読み込む）
        if (!multipleTexts && Array.isArray(sectionData) && sectionData.length > 0) {
          const currentSectionData = sectionData[currentSection];
          if (currentSectionData && currentSectionData.text_file_key && lessonData?.s3_key) {
            const sectionTextFileKey = currentSectionData.text_file_key;
            const lessonS3Key = lessonData.s3_key;
            
            // ファイル名を抽出して比較
            const extractFileName = (key) => {
              if (!key) return '';
              const parts = key.split('/');
              return parts[parts.length - 1].trim().toLowerCase();
            };
            
            const sectionFileName = extractFileName(sectionTextFileKey);
            const lessonFileName = extractFileName(lessonS3Key);
            
            // 最終チェックでもスキップしない（上の理由と同じ）
            if (sectionFileName !== lessonFileName) {
              console.log('ℹ️ セクションのtext_file_keyとlessonData.s3_keyが一致しません（最終チェック）。読み込みを継続します:', {
                sectionTextFileKey,
                lessonS3Key,
                sectionFileName,
                lessonFileName,
                currentSection
              });
            }
          }
        }
        
        // 複数テキストが存在する場合のログ（最終チェック）
        if (multipleTexts) {
          console.log('複数テキストが存在するため、ファイル名一致チェックをスキップします（最終チェック）:', {
            currentSection,
            sectionTextFileKey: sectionData?.[currentSection]?.text_file_key,
            lessonS3Key: lessonData?.s3_key
          });
        }
        
        console.log('テキストファイルをAPIから読み込みます:', {
          s3Key: lessonData.s3_key,
          fileType: lessonData.file_type,
          sectionDataLength: sectionData?.length,
          hasSectionData: !!sectionData,
          hasTextContent: !!textContent,
          textContentLength: textContent?.length || 0
        });
        
        // テキストファイルを読み込む
        fetchTextFile(s3KeyToUse2, fileTypeToUse2);
      }
    } else {
      console.log('テキスト処理の条件が満たされていません:', {
        isPdf: isPdf,
        fileType: fileTypeToUse2,
        s3Key: s3KeyToUse2,
        hasTextContent: !!textContent,
        hasPdfTextContent: !!pdfTextContent
      });
    }
  }, [lessonData, textContent, textContentS3Key, pdfTextContent, sectionData, currentSection]); // textContentS3Keyを追加（誤キャッシュ防止）

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

  // テキストファイルを読み込む
  const fetchTextFile = async (s3Key, fileType) => {
    if (!s3Key) {
      console.error('fetchTextFile: s3Keyが提供されていません');
      return;
    }
    
    // セクションデータが空配列の場合、テキストファイルの読み込みをスキップ（関数内チェック）
    // ただし、既存のtextContentが存在する場合は上書きしない
    if (Array.isArray(sectionData) && sectionData.length === 0) {
      console.log('⚠️ fetchTextFile: セクションデータが空です。テキストファイルの読み込みをスキップします', {
        hasExistingTextContent: !!(textContent && textContent.length > 0),
        hasStoredContext: lessonData?.s3_key ? SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type) : false
      });
      
      // 既存のtextContentが存在する場合は、空で上書きしない
      if (textContent && textContent.length > 0) {
        console.log('✅ fetchTextFile: 既存のtextContentが存在するため、空で上書きしません:', {
          textContentLength: textContent.length
        });
        return; // 既存のtextContentを保持するため、何もしない
      }
      
      // セッションストレージにコンテキストが存在する場合は、それを使用
      if (lessonData?.s3_key && lessonData?.id) {
        const hasStoredContext = SessionStorageManager.hasContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
        if (hasStoredContext) {
          const storedContext = SessionStorageManager.getContext(lessonData.id, lessonData.s3_key, lessonData.file_type);
          console.log('✅ fetchTextFile: セッションストレージから既存のコンテキストを使用します:', {
            contextLength: storedContext.context.length
          });
          if (onTextContentUpdate) {
            onTextContentUpdate(storedContext.context);
          }
          return; // セッションストレージから取得したコンテキストを使用
        }
      }
      
      // 既存のtextContentもセッションストレージのコンテキストも存在しない場合のみ、空を通知
      if (onTextContentUpdate) {
        console.log('⚠️ fetchTextFile: 既存のtextContentもセッションストレージのコンテキストも存在しないため、空を通知します');
        onTextContentUpdate('');
      }
      return;
    }
    
    console.log('fetchTextFile: 開始', {
      s3Key,
      fileType,
      lessonId: lessonData?.id,
      sectionDataLength: sectionData?.length,
      hasSectionData: !!sectionData
    });
    
    try {
      // テキスト抽出APIを使用してテキストファイルを読み込む
      // クエリパラメータとして送信することで、CORSエラーを回避（日本語を含む長いパスの問題を解決）
      const response = await fetch(`${API_BASE_URL}/api/test/learning/extract-text?s3Key=${encodeURIComponent(s3Key)}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data && data.data.text) {
          const fileContent = data.data.text;
          
          console.log('テキストファイル読み込み成功:', {
            s3Key,
            fileType,
            contentLength: fileContent.length
          });
          
          // セッションストレージにコンテキストを保存
          const saveSuccess = SessionStorageManager.saveContext(
            lessonData?.id,
            s3Key,
            fileContent,
            {
              fileType: fileType,
              lessonTitle: lessonData?.title,
              processingTime: 0
            }
          );
          
          if (saveSuccess) {
            console.log('テキストファイルのコンテキストをセッションストレージに保存完了');
          }
          
          // 親コンポーネントにテキスト内容を通知（これによりtextLoadingがfalseになる）
          if (onTextContentUpdate) {
            onTextContentUpdate(fileContent, { s3Key, fileType });
          }
          
          // 処理済みのS3キーを記録
          processedS3KeyRef.current = s3Key;
        } else {
          console.error('テキストファイル読み込み失敗:', data.message);
          // エラー時も親コンポーネントに通知（textLoadingをfalseにするため）
          if (onTextContentUpdate) {
            onTextContentUpdate(`エラー: テキストファイルの読み込みに失敗しました: ${data.message || '不明なエラー'}`);
          }
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('テキストファイル読み込みAPIエラー:', response.status, errorData);
        
        // 404エラー（ファイルが見つからない）の場合は、空のコンテンツを通知
        // 複数のテキストを持たない学習画面では、テキストファイルが存在しないことが正常な状態である可能性がある
        if (response.status === 404) {
          console.log('テキストファイルが見つかりませんでした（404）。これは正常な状態である可能性があります:', {
            s3Key,
            fileType,
            lessonId: lessonData?.id
          });
          // エラー時も親コンポーネントに通知（textLoadingをfalseにするため）
          if (onTextContentUpdate) {
            onTextContentUpdate(''); // 空のコンテンツを通知
          }
        } else {
          // その他のエラーの場合はエラーメッセージを表示
          if (onTextContentUpdate) {
            onTextContentUpdate(`エラー: テキストファイルの読み込みに失敗しました (HTTP ${response.status})`);
          }
        }
      }
    } catch (error) {
      console.error('テキストファイル読み込みエラー:', error);
      
      // ネットワークエラーやCORSエラーの場合も適切に処理
      if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
        console.warn('テキストファイルの読み込みに失敗しました（ネットワークエラーまたはCORSエラー）:', {
          s3Key,
          fileType,
          error: error.message
        });
        // エラー時も親コンポーネントに通知（textLoadingをfalseにするため）
        if (onTextContentUpdate) {
          onTextContentUpdate(''); // 空のコンテンツを通知（エラーメッセージを表示しない）
        }
      } else {
        // その他のエラーの場合はエラーメッセージを表示
        if (onTextContentUpdate) {
          onTextContentUpdate(`エラー: テキストファイルの読み込み中にエラーが発生しました: ${error.message}`);
        }
      }
    }
  };

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
        onTextContentUpdate(existingContext.context, { s3Key, fileType: lessonData?.file_type });
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
          onTextContentUpdate(`エラー: ${timeoutMessage}`, { s3Key, fileType: lessonData?.file_type });
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
            onTextContentUpdate(data.textContent, { s3Key, fileType: lessonData?.file_type });
          }
          console.log('PDFテキスト抽出成功:', { textLength: data.textContent.length });
        } else {
          console.warn('PDFテキスト抽出失敗:', data.message);
          const errorMessage = `テキスト抽出に失敗しました: ${data.message}`;
          setPdfProcessingError(errorMessage);
          setPdfTextContent(errorMessage);
          // エラー時も親コンポーネントに通知
          if (onTextContentUpdate) {
            onTextContentUpdate(errorMessage, { s3Key, fileType: lessonData?.file_type });
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
              onTextContentUpdate(detailedError, { s3Key, fileType: lessonData?.file_type });
            }
          } else {
            const errorMsg = `テキスト抽出に失敗しました: ${errorData.message || '不明なエラー'}`;
            setPdfProcessingError(errorMsg);
            setPdfTextContent(errorMsg);
            // エラー時も親コンポーネントに通知
            if (onTextContentUpdate) {
              onTextContentUpdate(errorMsg, { s3Key, fileType: lessonData?.file_type });
            }
          }
                  } catch (parseError) {
            console.error('エラーレスポンスの解析に失敗:', parseError);
            const errorMsg = `テキスト抽出に失敗しました (HTTP ${response.status})`;
            setPdfProcessingError(errorMsg);
            setPdfTextContent(errorMsg);
            // エラー時も親コンポーネントに通知
            if (onTextContentUpdate) {
              onTextContentUpdate(errorMsg, { s3Key, fileType: lessonData?.file_type });
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
          onTextContentUpdate(errorMessage, { s3Key, fileType: lessonData?.file_type });
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
    // 再レンダリング時にlessonDataがnullになる可能性があるため、refからも取得
    const { activeS3Key, activeFileType } = getActiveTextMeta();
    const currentFileType = activeFileType || lessonData?.file_type || fileTypeRef.current;
    const currentS3Key = activeS3Key || lessonData?.s3_key || s3KeyRef.current;
    
    const isPdf = isPdfFile(currentFileType, currentS3Key);
    if (isPdf) {
      if (pdfProcessingError) {
        return `エラー: ${pdfProcessingError}`;
      }
      if (isPdfProcessing) {
        return 'PDFファイルの処理中...';
      }
      return pdfTextContent || 'PDFファイルの読み込み中...';
    }
    
    // RTFファイルの場合はタグを除去
    if (currentFileType === 'application/rtf' || (currentS3Key && currentS3Key.toLowerCase().endsWith('.rtf'))) {
      return stripRtfTags(textContent) || 'テキスト内容がありません';
    }
    
    // textContentが空の場合、セッションストレージから取得を試みる
    if (!textContent || textContent.length === 0) {
      if (lessonData?.id && currentS3Key && currentFileType) {
        const storedContext = SessionStorageManager.getContext(lessonData.id, currentS3Key, currentFileType);
        if (storedContext && storedContext.context) {
          console.log('✅ displayTextContent: セッションストレージからコンテンツを取得:', {
            contextLength: storedContext.context.length
          });
          return storedContext.context;
        }
      }
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
      <div className="bg-white rounded-2xl shadow-xl p-6 h-full min-w-0 flex flex-col overflow-hidden">
        <div className="flex items-center gap-3 mb-4 workspace-widget-handle cursor-move select-none">
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
    <div className="bg-white rounded-2xl shadow-xl p-6 h-full min-w-0 flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4 flex-none workspace-widget-handle cursor-move select-none">
        <span className="text-2xl">📄</span>
        <h3 className="text-xl font-bold text-gray-800">テキスト内容</h3>
        {(() => {
          const { activeS3Key, activeFileType } = getActiveTextMeta();
          return isPdfFile(activeFileType || lessonData?.file_type, activeS3Key || lessonData?.s3_key);
        })() && (
          <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs rounded-full">
            PDF
          </span>
        )}
                 {/* PDF処理中のキャンセルボタン */}
         {(() => {
           const { activeS3Key, activeFileType } = getActiveTextMeta();
           return isPdfFile(activeFileType || lessonData?.file_type, activeS3Key || lessonData?.s3_key);
         })() && isPdfProcessing && (
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
                const { activeS3Key } = getActiveTextMeta();
                const retryKey = activeS3Key || lessonData?.s3_key;
                if (retryKey) extractPdfText(retryKey);
             }}
             className="mt-2 px-3 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600 transition-colors"
           >
             再試行
           </button>
        </div>
      )}
      
      {/* テキスト内容表示（min-w-0 でリサイズ時に幅に追従） */}
      <div 
        ref={textContainerRef}
        className="flex-1 min-w-0 w-full min-h-0 overflow-y-auto custom-scrollbar border border-gray-200 rounded-lg p-2 bg-gray-50"
      >
        {(() => {
          const { activeS3Key, activeFileType } = getActiveTextMeta();
          return isPdfFile(activeFileType || lessonData?.file_type, activeS3Key || lessonData?.s3_key);
        })() ? (
          <div className="h-full">
            {/* PDFをiframeで表示 */}
            <div className="w-full h-full border border-gray-300 rounded-lg overflow-hidden relative">
              <iframe
                src={`${API_BASE_URL}/api/learning/pdf-viewer?key=${encodeURIComponent(getActiveTextMeta().activeS3Key || lessonData?.s3_key || '')}`}
                title="PDF Viewer"
                className="w-full h-full"
                frameBorder="0"
                allow="fullscreen"
                onError={(e) => {
                  console.error('PDF iframe 読み込みエラー:', e);
                  document.getElementById('pdf-error-fallback').classList.remove('hidden');
                }}
                onLoad={() => {
                  console.log('PDF iframe 読み込み完了');
                  document.getElementById('pdf-error-fallback').classList.add('hidden');
                }}
              />
              {/* エラー時のフォールバック */}
              <div className="absolute inset-0 bg-gray-100 flex items-center justify-center" id="pdf-error-fallback">
                <div className="text-center">
                  <p className="text-gray-600 mb-3">PDFの表示に失敗しました</p>
                  <div className="space-y-2">
                    <button 
                      onClick={() => window.open(`${API_BASE_URL}/api/learning/pdf-viewer?key=${encodeURIComponent(getActiveTextMeta().activeS3Key || lessonData?.s3_key || '')}`, '_blank')}
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
                    S3キー: {getActiveTextMeta().activeS3Key || lessonData?.s3_key}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="prose prose-sm max-w-none w-full min-w-0">
            {/* MDファイルの場合はMarkdownとしてレンダリング */}
            {/* 再レンダリング時にlessonData.file_typeやlessonData.s3_keyがnullになる可能性があるため、refからも判定 */}
            {(() => {
              const rawContent = displayTextContent();
              // 現在のfile_typeとs3_keyを取得（lessonDataから、またはrefから）
              const currentFileType = lessonData?.file_type || fileTypeRef.current;
              const currentS3Key = lessonData?.s3_key || s3KeyRef.current;
              
              // 内容に見出し(#)や太字(**)があればMarkdownとして扱う（file_typeが誤っていても表示を救う）
              const looksLikeMarkdown = rawContent && (
                /(^|\n)#{1,6}\s/m.test(rawContent) ||
                /\*\*[^*]+\*\*/.test(rawContent)
              );
              const isMarkdown = 
                currentFileType === 'md' || 
                currentFileType === 'text/markdown' || 
                (currentS3Key && currentS3Key.toLowerCase().endsWith('.md')) ||
                looksLikeMarkdown;
              
              console.log('Markdown判定:', {
                currentFileType,
                currentS3Key,
                isMarkdown,
                looksLikeMarkdown,
                lessonDataFileType: lessonData?.file_type,
                lessonDataS3Key: lessonData?.s3_key,
                refFileType: fileTypeRef.current,
                refS3Key: s3KeyRef.current
              });
              
              return isMarkdown ? (
                <MarkdownRenderer 
                  content={rawContent}
                  showToc={false}
                  scrollContainerRef={textContainerRef}
                />
              ) : (
                /* RTFファイルやその他のテキストファイルはプレーンテキストとして表示 */
                <div className="whitespace-pre-wrap text-gray-700 leading-relaxed">
                  {rawContent}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* テキスト末尾ボタン（10問テストに挑戦・次のセクションへ／レッスン総合テスト） */}
      {onSectionTestClick && onNextSectionClick && (
        <div className="mt-4 flex flex-wrap gap-3 w-full min-w-0">
          <button
            type="button"
            onClick={onSectionTestClick}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            10問テストに挑戦
          </button>
          <button
            type="button"
            onClick={onNextSectionClick}
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white rounded-lg font-medium transition-colors shadow-sm"
          >
            {isLastSection ? 'レッスンまとめテスト' : '次のセクションへ'}
          </button>
        </div>
      )}

      {/* テキスト情報 */}
      {(isPdfFile(lessonData?.file_type, lessonData?.s3_key) && pdfTextContent) || 
       (lessonData?.file_type === 'txt' && textContent) ||
       (lessonData?.file_type === 'md' && textContent) ||
       (lessonData?.file_type === 'text/markdown' && textContent) ||
       (lessonData?.file_type === 'application/rtf' && textContent) ||
       (lessonData?.file_type === 'text/plain' && textContent) ? (
        <div className="mt-3 text-xs text-gray-500 w-full min-w-0">
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
