import React, { useState, useEffect, useRef } from 'react';
import SanitizedInput from '../SanitizedInput';
import { SANITIZE_OPTIONS } from '../../utils/sanitizeUtils';
import { convertMarkdownToHTML } from '../../utils/markdownUtils';

const ChatSection = ({
  chatMessages,
  chatInput,
  onChatInputChange,
  onSendMessage,
  currentLessonData,
  currentSectionText, // 現在のセクションのテキスト内容
  isAILoading, // AI応答の読み込み状態
  isAIEnabled = true, // AI機能が有効かどうか
  showAIError = false // 準備中エラー（PDF処理失敗など）を表示するか
}) => {
  const [isTyping, setIsTyping] = useState(false);
  const chatContainerRef = useRef(null);

  // 新しいメッセージが追加された際に自動スクロール
  useEffect(() => {
    if (chatContainerRef.current && chatMessages.length > 0) {
      // flex-col-reverseを使用しているため、スクロール位置を0に設定
      chatContainerRef.current.scrollTop = 0;
    }
  }, [chatMessages]);

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 h-full flex flex-col overflow-hidden">
      <div className="flex items-center gap-3 mb-4 workspace-widget-handle cursor-move select-none">
        <span className="text-2xl">🤖</span>
        <h3 className="text-xl font-bold text-gray-800">AIアシスタント</h3>
        {!isAIEnabled && (
          <span className="px-2 py-1 bg-yellow-100 text-yellow-800 text-xs rounded-full border border-yellow-200">
            準備中
          </span>
        )}
      </div>
      
      {/* AI機能の状態表示 */}
      {!isAIEnabled && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-center gap-2 text-yellow-700 text-sm">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-yellow-500"></div>
            <span>PDFファイルのコンテキスト化を処理中です。AIサポート機能は準備完了までお待ちください。</span>
          </div>
        </div>
      )}
      
      {/* AI機能エラー状態表示（PDF処理失敗など実際にエラーが発生した場合のみ） */}
      {showAIError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
          <div className="flex items-center gap-2 text-red-700 text-sm">
            <span className="text-red-500">⚠️</span>
            <span>AIサポート機能の準備中にエラーが発生しました。ページを再読み込みしてください。</span>
          </div>
        </div>
      )}
      
      {/* チャットメッセージ表示エリア */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto mb-4 space-y-3 custom-scrollbar flex flex-col-reverse pr-1">
        {/* AI入力中インジケーター */}
        {isAILoading && (
          <div className="flex justify-start">
            <div className="bg-green-100 text-gray-800 border border-green-200 px-4 py-2 rounded-lg">
              <div className="flex items-center gap-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce"></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0.1s'}}></div>
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-bounce" style={{animationDelay: '0.2s'}}></div>
                </div>
                <span className="text-sm">AIが回答を生成中...</span>
              </div>
            </div>
          </div>
        )}
        
        {/* チャットメッセージ（逆順で表示） */}
        {chatMessages.slice().reverse().map(message => (
          <div key={message.id} className={`flex ${message.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`${message.sender === 'user' 
              ? 'max-w-xs bg-blue-500 text-white' 
              : message.sender === 'ai'
              ? 'max-w-md bg-green-100 text-gray-800 border border-green-200'
              : 'max-w-xs bg-gray-100 text-gray-800'
            } px-4 py-2 rounded-lg`}>
              {message.sender === 'ai' ? (
                <div 
                  className="text-sm"
                  dangerouslySetInnerHTML={{ 
                    __html: convertMarkdownToHTML(message.text) 
                  }}
                />
              ) : (
                <p className="text-sm whitespace-pre-wrap">{message.text}</p>
              )}
              <p className="text-xs opacity-70 mt-1">{message.timestamp}</p>
            </div>
          </div>
        ))}
      </div>
      
      {/* チャット入力フォーム */}
      <div className="space-y-3 pt-2">
        <SanitizedInput
          type="textarea"
          value={chatInput}
          onChange={onChatInputChange}
          onKeyPress={(e) => {
            // Shift+Enterで改行、Enterのみで送信
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              onSendMessage();
            }
          }}
          placeholder={isAIEnabled ? "学習内容について質問してください..." : "AI機能の準備が完了するまでお待ちください..."}
          sanitizeMode={SANITIZE_OPTIONS.FULL}
          debounceMs={300}
          rows={4}
          className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:border-transparent text-base resize-y ${
            isAIEnabled 
              ? 'border-gray-300 focus:ring-green-500' 
              : 'border-gray-200 bg-gray-50 text-gray-500'
          }`}
          disabled={isAILoading || !isAIEnabled}
        />
        <div className="flex justify-center">
          <button 
            onClick={onSendMessage}
            disabled={isAILoading || !chatInput.trim() || !isAIEnabled}
            className={`px-8 py-3 rounded-lg font-medium transition-all duration-200 ${
              isAIEnabled
                ? 'bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isAILoading ? '送信中...' : !isAIEnabled ? '準備中...' : '送信'}
          </button>
        </div>
      </div>
      
      {/* AI機能の説明 */}
      {isAIEnabled && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-green-700 text-xs">
            💡 AIアシスタントが利用可能です。学習内容について質問してください。
          </p>
        </div>
      )}
    </div>
  );
};

export default ChatSection;
