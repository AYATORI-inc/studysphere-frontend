import React, { useState } from 'react';
import { useAuth } from './contexts/AuthContext';
import { API_BASE_URL } from '../config/apiConfig';

const CareerAssessment = () => {
  const { currentUser } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCareerAssessmentClick = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // 利用者のアクセストークンを取得
      const accessToken = localStorage.getItem('accessToken');
      
      if (!accessToken) {
        setError('認証トークンが見つかりません。再度ログインしてください。');
        setIsLoading(false);
        return;
      }

      // SSOチケット生成APIを呼び出し
      const response = await fetch(`${API_BASE_URL}/api/sso/ticket/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          target_system: 'findjob',
          source_system: 'studysphere',
          context: 'career_assessment'
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || 'SSOチケットの生成に失敗しました');
      }

      const result = await response.json();
      
      if (!result.success || !result.data?.ticket) {
        throw new Error('SSOチケットの生成に失敗しました');
      }

      // 生成されたチケットを使ってfindjobのauto-loginページにリダイレクト
      const ticket = result.data.ticket;
      const careerAssessmentUrl = `https://findjob.myou-kou.com/auto-login?ticket=${encodeURIComponent(ticket)}`;
      
      // 新しいタブで適職診断ページを開く
      window.open(careerAssessmentUrl, '_blank');
      
    } catch (error) {
      console.error('適職診断ページへの遷移エラー:', error);
      setError(error.message || '適職診断ページへの遷移に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="text-center">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-4">
            🎯 適職診断
          </h1>
          <p className="text-lg text-gray-600 mb-6">
            あなたの適性に合った職業を見つけましょう
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-2xl p-8 shadow-lg mb-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold text-gray-800 mb-4">
              適職診断について
            </h2>
            <div className="text-left space-y-4 text-gray-700">
              <p>
                • あなたの性格、興味、価値観を分析して最適な職業を提案します
              </p>
              <p>
                • 質問に答えるだけで、あなたに合った職業分野を診断できます
              </p>
              <p>
                • 診断結果は今後のキャリア選択の参考にご活用ください
              </p>
            </div>
          </div>

          <div className="bg-white rounded-xl p-6 shadow-md mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-3">
              診断の流れ
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  1
                </div>
                <p className="text-gray-700">質問に回答</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  2
                </div>
                <p className="text-gray-700">適性を分析</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 bg-blue-500 text-white rounded-full flex items-center justify-center mx-auto mb-2 text-lg font-bold">
                  3
                </div>
                <p className="text-gray-700">結果を確認</p>
              </div>
            </div>
          </div>

          <button
            onClick={handleCareerAssessmentClick}
            disabled={isLoading}
            className={`w-full max-w-md mx-auto px-8 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
              isLoading
                ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white hover:from-blue-600 hover:to-cyan-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
            }`}
          >
            {isLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                読み込み中...
              </div>
            ) : (
              '🎯 適職診断を開始する'
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
                適職診断は外部サイトで行われます。診断を開始すると新しいタブが開きます。
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CareerAssessment;
