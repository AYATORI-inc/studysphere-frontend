import React from 'react';

const FileUploadSection = ({ 
  uploadedFiles, 
  onFileDelete, 
  className = ''
}) => {
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    
    // データベースから取得した日本時間の値をそのまま表示
    // 例: "2025-09-08 13:52:16" -> "2025/09/08 13:52:16"
    // 例: "2025-09-08T13:52:16.000Z" -> "2025/09/08 13:52:16"
    // タイムゾーン変換を避けるため、文字列として直接フォーマット
    let formatted = dateString
      .replace(/-/g, '/')           // ハイフンをスラッシュに変換
      .replace('T', ' ')            // Tをスペースに変換
      .replace(/\.\d{3}Z?$/, '')    // .000Z または .000 を削除
      .replace(/\s+/g, ' ');        // 複数のスペースを1つに統一
    
    return formatted;
  };
  return (
    <div className={`bg-white rounded-2xl shadow-xl p-6 h-full flex flex-col overflow-hidden ${className}`}>
      <div className="flex items-center gap-3 mb-4 workspace-widget-handle cursor-move select-none">
        <span className="text-2xl">📁</span>
        <h3 className="text-xl font-bold text-gray-800">提出物確認</h3>
        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
          {uploadedFiles.length}件
        </span>
      </div>
      
      <div className="flex-1 overflow-y-auto space-y-3 custom-scrollbar pr-1">
        {uploadedFiles.map(file => (
          <div key={file.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-blue-600">📦</span>
                <p className="text-sm font-medium text-gray-800 truncate">
                  {file.name}
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500">
                <span>アップロード: {file.uploadDate}</span>
                {file.instructorApproved ? (
                  <span className="text-green-600 font-mono text-xs bg-green-50 px-2 py-1 rounded">
                    承認済
                  </span>
                ) : file.s3Key ? (
                  <span className="text-blue-600 font-mono text-xs bg-blue-50 px-2 py-1 rounded">
                    ストレージ保存済
                  </span>
                ) : null}
              </div>
            </div>
            {!file.instructorApproved && (
              <button 
                onClick={() => onFileDelete(file.id)}
                className="ml-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg text-sm font-medium transition-colors hover:bg-red-100"
                title="ファイルを削除"
              >
                削除
              </button>
            )}
          </div>
        ))}
        {uploadedFiles.length === 0 && (
          <div className="flex flex-col items-center justify-center text-center py-8 text-gray-500 border border-dashed border-gray-200 rounded-lg bg-gray-50">
            <div className="text-gray-400 text-4xl mb-2">📁</div>
            <p className="text-sm">アップロードされたファイルはありません</p>
            <p className="text-gray-400 text-xs mt-1">ZIPファイルをアップロードしてください</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default FileUploadSection;
