  // セッションストレージ管理用のユーティリティ
  export const SessionStorageManager = {
    // このプロジェクト専用のキー接頭辞（他機能のsessionStorageキーと衝突させない）
    _KEY_PREFIX: 'studysphere_ctx',

    // 文字列を短い固定長にするための簡易ハッシュ（衝突しづらいが暗号用途ではない）
    _hashString: (input) => {
      if (!input) return '0';
      // djb2 variant
      let hash = 5381;
      for (let i = 0; i < input.length; i++) {
        hash = ((hash << 5) + hash) ^ input.charCodeAt(i);
      }
      // unsigned 32bit hex
      return (hash >>> 0).toString(16);
    },

    // エラーハンドリング用のヘルパー関数
    _safeExecute: (operation, fallback) => {
      try {
        return operation();
      } catch (error) {
        console.error('SessionStorageManager エラー:', error);
        return fallback;
      }
    },
  // キー生成
  generateKey: (lessonId, s3Key, fileType = null) => {
    try {
      const safeS3Key = s3Key || 'unknown';

      // ファイルタイプに応じてカテゴリを決定（キーの一部）
      let type = 'context';
      const ft = (fileType || '').toLowerCase();
      if (ft === 'pdf' || ft === 'application/pdf') {
        type = 'pdf';
      } else if (ft === 'md' || ft === 'text/markdown') {
        type = 'md';
      } else if (ft === 'txt' || ft === 'text/plain') {
        type = 'txt';
      } else if (ft === 'application/rtf' || ft === 'rtf') {
        type = 'rtf';
      }

      // 以前はファイル名のみでキー生成しており、同名ファイルの衝突で
      // 別セクションの内容が誤って表示される可能性があったため、
      // S3キー全体のハッシュをキーに含めて衝突を避ける。
      const s3Hash = SessionStorageManager._hashString(safeS3Key);
      const fileName = safeS3Key.split('/').pop() || 'unknown';
      const encodedFileName = encodeURIComponent(fileName);

      // `::` 区切りで lessonId の抽出が安全にできる形式にする
      return `${SessionStorageManager._KEY_PREFIX}::${type}::${lessonId}::${s3Hash}::${encodedFileName}`;
    } catch (error) {
      console.error('キー生成エラー:', error);
      // フォールバック: タイムスタンプベースのキー生成
      const fallbackKey = `${SessionStorageManager._KEY_PREFIX}::context::${lessonId}::fallback::${Date.now()}`;
      return fallbackKey;
    }
  },
  
  // コンテキスト保存
  saveContext: (lessonId, s3Key, context, metadata = {}) => {
    const key = SessionStorageManager.generateKey(lessonId, s3Key, metadata.fileType);
    
    // デバッグ情報を追加
    console.log('SessionStorageManager.saveContext - キー生成:', {
      lessonId,
      s3Key,
      generatedKey: key,
      keyLength: key.length
    });
    
    const data = {
      context,
      metadata: {
        ...metadata,
        savedAt: new Date().toISOString(),
        lessonId,
        s3Key,
        contextSize: context.length
      }
    };
    
    try {
      // セッションストレージの容量制限をチェック（5MB制限）
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 5 * 1024 * 1024) {
        console.warn('コンテキストが大きすぎます（5MB制限）:', dataSize);
        // コンテキストを切り詰める
        data.context = data.context.substring(0, 2 * 1024 * 1024); // 2MBに制限
        data.metadata.truncated = true;
      }
      
      sessionStorage.setItem(key, JSON.stringify(data));
      console.log('コンテキストをセッションストレージに保存:', { 
        key, 
        contextLength: data.context.length,
        dataSize: JSON.stringify(data).length
      });
      return true;
    } catch (error) {
      console.error('セッションストレージ保存エラー:', error);
      return false;
    }
  },
  
  // コンテキスト取得
  getContext: (lessonId, s3Key, fileType = null) => {
    const key = SessionStorageManager.generateKey(lessonId, s3Key, fileType);
    
    // デバッグ情報を追加
    console.log('SessionStorageManager.getContext - キー生成:', {
      lessonId,
      s3Key,
      generatedKey: key
    });
    
    try {
      const data = sessionStorage.getItem(key);
      if (data) {
        const parsed = JSON.parse(data);
        console.log('セッションストレージからコンテキスト取得:', { key, contextLength: parsed.context.length });
        return parsed;
      }
      return null;
    } catch (error) {
      console.error('セッションストレージ取得エラー:', error);
      return null;
    }
  },
  
  // コンテキスト存在確認
  hasContext: (lessonId, s3Key, fileType = null) => {
    const key = SessionStorageManager.generateKey(lessonId, s3Key, fileType);
    
    // デバッグ情報を追加
    console.log('SessionStorageManager.hasContext - キー生成:', {
      lessonId,
      s3Key,
      generatedKey: key,
      exists: sessionStorage.getItem(key) !== null
    });
    
    return sessionStorage.getItem(key) !== null;
  },
  
  // 特定のレッスンのコンテキストをクリア
  clearLessonContext: (lessonId) => {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      // 旧形式キー（pdf_context_...）と新形式キー（studysphere_ctx::...）の両方に対応
      if (key.startsWith(`pdf_context_${lessonId}_`) ||
          key.startsWith(`md_context_${lessonId}_`) ||
          key.startsWith(`txt_context_${lessonId}_`) ||
          key.startsWith(`context_${lessonId}_`)) {
        sessionStorage.removeItem(key);
        console.log('レッスンコンテキストをクリア(旧形式):', key);
        return;
      }

      if (key.startsWith(`${SessionStorageManager._KEY_PREFIX}::`)) {
        const parts = key.split('::');
        // parts: [prefix, type, lessonId, hash, filename]
        if (parts.length >= 3 && String(parts[2]) === String(lessonId)) {
        sessionStorage.removeItem(key);
          console.log('レッスンコンテキストをクリア:', key);
        }
      }
    });
  },
  
  // 全コンテキストをクリア
  clearAllContexts: () => {
    const keys = Object.keys(sessionStorage);
    keys.forEach(key => {
      if (
        key.startsWith('pdf_context_') ||
        key.startsWith('md_context_') ||
        key.startsWith('txt_context_') ||
        key.startsWith('context_') ||
        key.startsWith(`${SessionStorageManager._KEY_PREFIX}::`)
      ) {
        sessionStorage.removeItem(key);
      }
    });
    console.log('全コンテキストをクリア');
  },
  
  // 最後に開いたセクションの保存（レッスンごと・ユーザーごと・学習再開用）
  LAST_SECTION_KEY_PREFIX: 'studysphere:lastSection:',

  getLastSectionKey: (userId, lessonId) =>
    `${SessionStorageManager.LAST_SECTION_KEY_PREFIX}user:${userId}:lesson:${lessonId}`,

  saveLastSection: (userId, lessonId, sectionIndex, textKey = null) => {
    try {
      const key = SessionStorageManager.getLastSectionKey(userId, lessonId);
      const value = { index: sectionIndex, textKey: textKey || null };
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      console.warn('最後に開いたセクションのローカル保存に失敗しました:', e);
      return false;
    }
  },

  getLastSection: (userId, lessonId) => {
    try {
      const key = SessionStorageManager.getLastSectionKey(userId, lessonId);
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const value = JSON.parse(raw);
      if (typeof value?.index !== 'number') return null;
      return { index: value.index, textKey: value.textKey || null };
    } catch (e) {
      return null;
    }
  },

  // 保存されているコンテキストの一覧を取得
  getStoredContexts: () => {
    const contexts = [];
    const keys = Object.keys(sessionStorage);
    
    keys.forEach(key => {
      if (
        key.startsWith('pdf_context_') ||
        key.startsWith('md_context_') ||
        key.startsWith('txt_context_') ||
        key.startsWith('context_') ||
        key.startsWith(`${SessionStorageManager._KEY_PREFIX}::`)
      ) {
        try {
          const data = JSON.parse(sessionStorage.getItem(key));
          contexts.push({
            key,
            ...data.metadata,
            contextLength: data.context.length
          });
        } catch (error) {
          console.error('コンテキスト解析エラー:', error);
        }
      }
    });
    
    return contexts;
  }
};
