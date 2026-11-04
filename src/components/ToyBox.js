import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';

const ToyBox = () => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleToyBoxClick = () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // SSOアウトバウンドページを別タブで開く
      const ssoDispatchUrl = `${window.location.origin}/sso-dispatch?target=toybox_prod`;
      window.open(ssoDispatchUrl, '_blank');
      
      // 別タブで開いたので、ローディング状態をリセット
      setTimeout(() => {
        setIsLoading(false);
      }, 500);
    } catch (error) {
      console.error('TOYBOXページへの遷移エラー:', error);
      setError(error.message || 'TOYBOXページへの遷移に失敗しました。');
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center">
        <div className="mb-8">
          <div className="flex justify-center mb-4">
            <img 
              src="/images/toybox/TOYBOX.png" 
              alt="TOYBOX" 
              className="h-16 object-contain"
            />
          </div>
          <p className="text-lg text-gray-600 mb-6">
            便利なツールや機能を提供するTOYBOXへアクセスできます
          </p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-pink-50 rounded-2xl p-8 shadow-lg mb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              TOYBOXについて
            </h2>
            <div className="text-left space-y-4 text-gray-700">
              <p>
                • 様々な便利なツールや機能を利用できます
              </p>
              <p>
                • 学習をサポートする機能が充実しています
              </p>
              <p>
                • いつでもアクセスしてご利用いただけます
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              利用方法
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  1
                </div>
                <p className="text-gray-700">TOYBOXを開く</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  2
                </div>
                <p className="text-gray-700">ツールを選択</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-purple-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  3
                </div>
                <p className="text-gray-700">機能を利用</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleToyBoxClick}
            disabled={isLoading}
            className={`w-full max-w-md mx-auto px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
              isLoading
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-purple-500 to-pink-600 text-white hover:from-purple-600 hover:to-pink-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                読み込み中...
              </div>
            ) : (
              <div className="flex items-center justify-center gap-2">
                <img 
                  src="/images/toybox/TOYBOX.png" 
                  alt="TOYBOX" 
                  className="h-5 w-auto object-contain"
                />
                <span>TOYBOXを開く</span>
              </div>
            )}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="text-red-700 font-medium mb-2">エラー</div>
              <div className="text-red-600 text-sm">{error}</div>
            </div>
          )}
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-start">
            <div className="text-yellow-600 text-xl mr-3">⚠️</div>
            <div className="text-yellow-800">
              <p className="font-semibold mb-1">ご注意</p>
              <p className="text-sm">
                TOYBOXは外部システムです。アクセスすると新しいタブが開きます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ToyBox;
