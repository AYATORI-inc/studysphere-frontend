import React, { useState } from 'react';
import { API_BASE_URL } from '../config/apiConfig';

/**
 * 適職診断管理画面へのボタンコンポーネント
 * SSOチケットを生成して適職診断システムにリダイレクトします
 */
const CareerAssessmentButton = ({ currentUser }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleCareerAssessmentClick = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      // アクセストークンを取得
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
          context: 'career_assessment_admin'
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
      
      // 適職診断管理画面を新しいタブで開く
      window.open(careerAssessmentUrl, '_blank');
      
    } catch (error) {
      console.error('適職診断管理画面への遷移エラー:', error);
      setError(error.message || '適職診断管理画面への遷移に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleCareerAssessmentClick}
        disabled={isLoading}
        className={`w-full px-6 py-4 rounded-xl font-semibold text-lg transition-all duration-200 ${
          isLoading
            ? 'bg-gray-400 text-gray-200 cursor-not-allowed'
            : 'bg-gradient-to-r from-green-500 to-emerald-600 text-white hover:from-green-600 hover:to-emerald-700 shadow-lg hover:shadow-xl transform hover:-translate-y-1'
        }`}
      >
        {isLoading ? (
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
            読み込み中...
          </div>
        ) : (
          '🎯 適職診断管理画面を開く'
        )}
      </button>

      {error && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <div className="text-red-700 font-medium mb-2">エラー</div>
          <div className="text-red-600 text-sm">{error}</div>
        </div>
      )}
    </div>
  );
};

export default CareerAssessmentButton;

