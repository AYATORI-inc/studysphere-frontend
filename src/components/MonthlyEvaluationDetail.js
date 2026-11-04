import React, { useState, useEffect } from 'react';
import { apiCall } from '../utils/api';
import { normalizeSatelliteId, getCurrentUserSatelliteId } from '../utils/locationUtils';
import { getCurrentUser } from '../utils/userContext';

const MonthlyEvaluationDetail = ({ student, report, onSave, onEdit, onDelete, onDownloadPDF }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGenerating, setIsGenerating] = useState({});
  const [instructorList, setInstructorList] = useState([]);

  const normalizeDateValue = (value) => {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (value instanceof Date) return value.toISOString().split('T')[0];
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().split('T')[0];
    }
    return '';
  };

  const computeDefaultPeriod = (baseDate) => {
    if (!baseDate) return { start: '', end: '' };
    const dateObj = new Date(baseDate);
    if (Number.isNaN(dateObj.getTime())) return { start: '', end: '' };
    const start = new Date(dateObj.getFullYear(), dateObj.getMonth(), 1);
    const end = new Date(dateObj.getFullYear(), dateObj.getMonth() + 1, 0);
    return {
      start: start.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0]
    };
  };

  // バックエンドデータをフロントエンド形式に変換
  const convertBackendToFrontend = (data) => {
    if (!data) return null;
    const defaultPeriod = computeDefaultPeriod(data.date);
    return {
      evalDate: data.date || new Date().toISOString().split('T')[0],
      prevEvalDate: data.prev_evaluation_date || '',
      method: data.evaluation_method || '通所',
      otherMethod: data.method_other || '',
      goal: data.goal || '',
      work: data.effort || '',
      achievement: data.achievement || '',
      issue: data.issues || '',
      improve: data.improvement || '',
      health: data.health || '',
      note: data.others || '',
      validity: data.appropriateness || '',
      instructor: data.evaluator_name || '',
      periodStart: normalizeDateValue(data.period_start) || defaultPeriod.start,
      periodEnd: normalizeDateValue(data.period_end) || defaultPeriod.end
    };
  };

  // フロントエンドデータをバックエンド形式に変換
  const convertFrontendToBackend = (data) => {
    return {
      date: data.evalDate,
      mark_start: null, // MonthlyEvaluationDetailには時刻フィールドがないためnull
      mark_end: null,
      evaluation_method: data.method === 'その他' ? 'その他' : data.method,
      method_other: data.method === 'その他' ? data.otherMethod : null,
      goal: data.goal || null,
      effort: data.work || null,
      achievement: data.achievement || null,
      issues: data.issue || null,
      improvement: data.improve || null,
      health: data.health || null,
      others: data.note || null,
      appropriateness: data.validity || null,
      evaluator_name: data.instructor || null,
      prev_evaluation_date: data.prevEvalDate || null,
      recipient_number: student?.recipientNumber || null,
      user_name: student?.name || null,
      period_start: data.periodStart || null,
      period_end: data.periodEnd || null
    };
  };

  const [formData, setFormData] = useState(() => {
    const converted = convertBackendToFrontend(report);
    return {
      evalDate: converted?.evalDate || report?.evalDate || new Date().toISOString().split('T')[0],
      prevEvalDate: converted?.prevEvalDate || report?.prevEvalDate || '',
      method: converted?.method || report?.method || '通所',
      otherMethod: converted?.otherMethod || report?.otherMethod || '',
      goal: converted?.goal || report?.goal || '',
      work: converted?.work || report?.work || '',
      achievement: converted?.achievement || report?.achievement || '',
      issue: converted?.issue || report?.issue || '',
      improve: converted?.improve || report?.improve || '',
      health: converted?.health || report?.health || '',
      note: converted?.note || report?.note || '',
      validity: converted?.validity || report?.validity || '',
      instructor: converted?.instructor || report?.instructor || student?.instructorName || '',
      periodStart: converted?.periodStart || report?.periodStart || '',
      periodEnd: converted?.periodEnd || report?.periodEnd || ''
    };
  });

  // 指導員リストを取得
  useEffect(() => {
    const fetchInstructors = async () => {
      let satelliteId = normalizeSatelliteId(student?.satellite_id ?? student?.location?.id);
      if (!satelliteId) {
        const savedSatellite = sessionStorage.getItem('selectedSatellite');
        if (savedSatellite) {
          try {
            const parsed = JSON.parse(savedSatellite);
            satelliteId = normalizeSatelliteId(parsed?.id);
          } catch (error) {
            console.error('selectedSatelliteのパースエラー:', error);
          }
        }
      }

      if (!satelliteId) return;

      try {
        const response = await apiCall(`/api/users/satellite/${satelliteId}/weekly-evaluation-instructors`, {
          method: 'GET'
        });
        
        if (response.success && response.data) {
          setInstructorList(response.data);
          // デフォルトの指導員が設定されていない場合、最初の指導員を設定
          setFormData(prev => {
            if (!prev.instructor && response.data.length > 0) {
              return { ...prev, instructor: response.data[0].name };
            }
            return prev;
          });
        }
      } catch (error) {
        console.error('指導員リスト取得エラー:', error);
      }
    };

    fetchInstructors();
  }, [student?.satellite_id, student?.location?.id]);

  // 前回評価日を取得
  useEffect(() => {
    const fetchPrevEvalDate = async () => {
      if (!student?.id || report?.id) return; // 既存のレコードの場合はスキップ
      
      try {
        const response = await apiCall(`/api/monthly-evaluations/user/${student.id}/latest`, {
          method: 'GET'
        });
        
        if (response.success && response.data?.date) {
          setFormData(prev => ({ ...prev, prevEvalDate: response.data.date }));
        }
      } catch (error) {
        console.error('前回評価日取得エラー:', error);
      }
    };

    if (!isEditing && !report?.id) {
      fetchPrevEvalDate();
    }
  }, [student?.id, report?.id]);

  const handleSave = async () => {
    if (!formData.goal.trim() || !formData.work.trim()) {
      alert('訓練目標と取組内容は必須項目です。');
      return;
    }

    if (!student?.id) {
      alert('利用者情報が取得できません。');
      return;
    }

    setIsLoading(true);
    try {
      const backendData = convertFrontendToBackend(formData);

      if (!backendData.period_start || !backendData.period_end) {
        const defaults = computeDefaultPeriod(formData.evalDate || new Date().toISOString().split('T')[0]);
        backendData.period_start = backendData.period_start || defaults.start;
        backendData.period_end = backendData.period_end || defaults.end;
      }

      // 現在選択中の拠点IDを取得
      const currentUser = getCurrentUser();
      const currentSatelliteId = getCurrentUserSatelliteId(currentUser);
      
      // 拠点IDをリクエストに含める
      const requestData = report?.id 
        ? backendData
        : {
            ...backendData,
            user_id: student.id
          };
      
      // 現在選択中の拠点IDがある場合は追加
      if (currentSatelliteId) {
        requestData.satellite_id = currentSatelliteId;
      }

      let response;
      if (report?.id) {
        // 更新
        response = await apiCall(`/api/monthly-evaluations/${report.id}`, {
          method: 'PUT',
          body: JSON.stringify(requestData)
        });
      } else {
        // 作成
        response = await apiCall('/api/monthly-evaluations', {
          method: 'POST',
          body: JSON.stringify(requestData)
        });
      }

      if (response.success) {
        alert(report?.id ? '達成度評価を更新しました。' : '達成度評価を保存しました。');
        setIsEditing(false);
        setFormData(prev => ({
          ...prev,
          periodStart: backendData.period_start,
          periodEnd: backendData.period_end
        }));
        // 親コンポーネントのコールバックを呼び出し
        if (onSave) {
          onSave({
            ...formData,
            id: report?.id || response.data?.id,
            method: formData.method === 'その他' ? formData.otherMethod : formData.method,
            periodStart: backendData.period_start,
            periodEnd: backendData.period_end
          });
        }
      } else {
        alert('保存に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('保存エラー:', error);
      let errorMessage = '保存中にエラーが発生しました: ' + error.message;
      
      // エラーレスポンスにデバッグ情報がある場合は表示
      if (error.response?.data) {
        const errorData = error.response.data;
        errorMessage = errorData.message || errorMessage;
        
        if (errorData.debug) {
          console.error('保存エラー詳細（デバッグ情報）:', errorData.debug);
          errorMessage += `\n\nデバッグ情報:\n利用者拠点ID: ${JSON.stringify(errorData.debug.user_satellite_ids)}\n指導員拠点ID: ${JSON.stringify(errorData.debug.instructor_satellite_ids)}\n選択中拠点ID: ${errorData.debug.selected_satellite_id} (ステータス: ${error.status || 400})`;
        }
      }
      
      alert(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    const converted = convertBackendToFrontend(report);
    setFormData({
      evalDate: converted?.evalDate || report?.evalDate || new Date().toISOString().split('T')[0],
      prevEvalDate: converted?.prevEvalDate || report?.prevEvalDate || '',
      method: converted?.method || report?.method || '通所',
      otherMethod: converted?.otherMethod || report?.otherMethod || '',
      goal: converted?.goal || report?.goal || '',
      work: converted?.work || report?.work || '',
      achievement: converted?.achievement || report?.achievement || '',
      issue: converted?.issue || report?.issue || '',
      improve: converted?.improve || report?.improve || '',
      health: converted?.health || report?.health || '',
      note: converted?.note || report?.note || '',
      validity: converted?.validity || report?.validity || '',
      instructor: converted?.instructor || report?.instructor || student?.instructorName || '',
      periodStart: converted?.periodStart || report?.periodStart || '',
      periodEnd: converted?.periodEnd || report?.periodEnd || ''
    });
  };

  const handleDelete = async () => {
    if (!window.confirm('この達成度評価を削除しますか？')) {
      return;
    }

    if (!report?.id) {
      alert('削除する評価が見つかりません。');
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiCall(`/api/monthly-evaluations/${report.id}`, {
        method: 'DELETE'
      });

      if (response.success) {
        alert('達成度評価を削除しました。');
        // 親コンポーネントのコールバックを呼び出し
        if (onDelete) {
          onDelete(report.id);
        }
      } else {
        alert('削除に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('削除エラー:', error);
      alert('削除中にエラーが発生しました: ' + error.message);
    } finally {
      setIsLoading(false);
    }
  };

  // AIアシスト機能
  const handleAiAssist = async (field) => {
    if (!student?.id) {
      alert('利用者情報が取得できません。');
      return;
    }

    setIsGenerating(prev => ({ ...prev, [field]: true }));
    try {
      let endpoint = '';
      let requestBody = { user_id: student.id };

      // フィールドごとのエンドポイントとパラメータを設定
      switch (field) {
        case 'goal':
          endpoint = '/api/monthly-evaluation-ai/generate-goal';
          break;
        case 'work':
          // 取組内容は期間が必要な場合があるが、ここではユーザーIDのみで実行
          endpoint = '/api/monthly-evaluation-ai/generate-effort';
          // 期間は評価実施日から1か月前として計算
          const today = new Date(formData.evalDate || new Date());
          const periodStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
          const periodEnd = new Date(today.getFullYear(), today.getMonth(), 0);
          requestBody.period_start = periodStart.toISOString().split('T')[0];
          requestBody.period_end = periodEnd.toISOString().split('T')[0];
          break;
        case 'achievement':
          endpoint = '/api/monthly-evaluation-ai/generate-achievement';
          requestBody.goal = formData.goal;
          requestBody.effort = formData.work;
          break;
        case 'issue':
          endpoint = '/api/monthly-evaluation-ai/generate-issues';
          requestBody.goal = formData.goal;
          requestBody.achievement = formData.achievement;
          break;
        case 'improve':
          endpoint = '/api/monthly-evaluation-ai/generate-improvement';
          requestBody.issues = formData.issue;
          const today2 = new Date(formData.evalDate || new Date());
          const periodStart2 = new Date(today2.getFullYear(), today2.getMonth() - 1, 1);
          const periodEnd2 = new Date(today2.getFullYear(), today2.getMonth(), 0);
          requestBody.period_start = periodStart2.toISOString().split('T')[0];
          requestBody.period_end = periodEnd2.toISOString().split('T')[0];
          break;
        case 'health':
          endpoint = '/api/monthly-evaluation-ai/generate-health';
          const today3 = new Date(formData.evalDate || new Date());
          const periodStart3 = new Date(today3.getFullYear(), today3.getMonth() - 1, 1);
          const periodEnd3 = new Date(today3.getFullYear(), today3.getMonth(), 0);
          requestBody.period_start = periodStart3.toISOString().split('T')[0];
          requestBody.period_end = periodEnd3.toISOString().split('T')[0];
          break;
        case 'validity':
          endpoint = '/api/monthly-evaluation-ai/generate-appropriateness';
          requestBody.goal = formData.goal;
          requestBody.effort = formData.work;
          requestBody.achievement = formData.achievement;
          requestBody.issues = formData.issue;
          requestBody.improvement = formData.improve;
          requestBody.health = formData.health;
          break;
        default:
          return;
      }

      const response = await apiCall(endpoint, {
        method: 'POST',
        body: JSON.stringify(requestBody)
      });

      if (response.success && response.data) {
        // フィールド名のマッピング
        const fieldMap = {
          'goal': 'goal',
          'work': 'effort',
          'achievement': 'achievement',
          'issue': 'issues',
          'improve': 'improvement',
          'health': 'health',
          'validity': 'appropriateness'
        };
        
        const backendField = fieldMap[field];
        if (backendField && response.data[backendField]) {
          const frontendFieldMap = {
            'goal': 'goal',
            'effort': 'work',
            'achievement': 'achievement',
            'issues': 'issue',
            'improvement': 'improve',
            'health': 'health',
            'appropriateness': 'validity'
          };
          setFormData(prev => ({ ...prev, [frontendFieldMap[backendField]]: response.data[backendField] }));
        }
      } else {
        alert('AI提案の生成に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('AI提案エラー:', error);
      alert('AI提案の生成中にエラーが発生しました: ' + error.message);
    } finally {
      setIsGenerating(prev => ({ ...prev, [field]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-50 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-2xl font-bold text-gray-800">📈 達成度評価（在宅における就労達成度評価シート）</h3>
            <div className="flex gap-2">
              {!isEditing ? (
                <>
                  <button 
                    className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={() => setIsEditing(true)}
                    disabled={isLoading}
                  >
                    ✏️ 編集
                  </button>
                  <button 
                    className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleDelete}
                    disabled={isLoading || !report?.id}
                  >
                    🗑️ 削除
                  </button>
                  <button 
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200"
                    onClick={() => onDownloadPDF && onDownloadPDF(report)}
                    title="PDFでダウンロード"
                  >
                    📄 PDF
                  </button>
                </>
              ) : (
                <>
                  <button 
                    className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleSave}
                    disabled={isLoading}
                  >
                    {isLoading ? '💾 保存中...' : '💾 保存'}
                  </button>
                  <button 
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    onClick={handleCancel}
                    disabled={isLoading}
                  >
                    キャンセル
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="space-y-6">
            {isEditing ? (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">評価実施日</label>
                    <input 
                      type="date" 
                      value={formData.evalDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, evalDate: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">前回の達成度評価日</label>
                    <input 
                      type="date" 
                      value={formData.prevEvalDate}
                      onChange={(e) => setFormData(prev => ({ ...prev, prevEvalDate: e.target.value }))}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">実施方法</label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input 
                        type="radio" 
                        name="method" 
                        value="通所" 
                        checked={formData.method === '通所'} 
                        onChange={() => setFormData(prev => ({ ...prev, method: '通所' }))} 
                        className="mr-2 text-green-600 focus:ring-green-500"
                      />
                      通所
                    </label>
                    <label className="flex items-center">
                      <input 
                        type="radio" 
                        name="method" 
                        value="訪問" 
                        checked={formData.method === '訪問'} 
                        onChange={() => setFormData(prev => ({ ...prev, method: '訪問' }))} 
                        className="mr-2 text-green-600 focus:ring-green-500"
                      />
                      訪問
                    </label>
                    <label className="flex items-center">
                      <input 
                        type="radio" 
                        name="method" 
                        value="その他" 
                        checked={formData.method === 'その他'} 
                        onChange={() => setFormData(prev => ({ ...prev, method: 'その他' }))} 
                        className="mr-2 text-green-600 focus:ring-green-500"
                      />
                      その他
                    </label>
                  </div>
                  {formData.method === 'その他' && (
                    <input 
                      type="text" 
                      value={formData.otherMethod} 
                      onChange={(e) => setFormData(prev => ({ ...prev, otherMethod: e.target.value }))} 
                      placeholder="方法を入力" 
                      className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    訓練目標 *
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('goal')}
                      disabled={isGenerating.goal || !student?.id}
                    >
                      {isGenerating.goal ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.goal} 
                    onChange={(e) => setFormData(prev => ({ ...prev, goal: e.target.value }))} 
                    rows={3} 
                    placeholder="訓練目標を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    取組内容 *
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('work')}
                      disabled={isGenerating.work || !student?.id}
                    >
                      {isGenerating.work ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.work} 
                    onChange={(e) => setFormData(prev => ({ ...prev, work: e.target.value }))} 
                    rows={3} 
                    placeholder="取組内容を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    訓練目標に対する達成度
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('achievement')}
                      disabled={isGenerating.achievement || !student?.id || !formData.goal || !formData.work}
                    >
                      {isGenerating.achievement ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.achievement} 
                    onChange={(e) => setFormData(prev => ({ ...prev, achievement: e.target.value }))} 
                    rows={3} 
                    placeholder="達成度を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    課題
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('issue')}
                      disabled={isGenerating.issue || !student?.id || !formData.goal || !formData.achievement}
                    >
                      {isGenerating.issue ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.issue} 
                    onChange={(e) => setFormData(prev => ({ ...prev, issue: e.target.value }))} 
                    rows={3} 
                    placeholder="課題を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    今後の課題改善方針
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('improve')}
                      disabled={isGenerating.improve || !student?.id || !formData.issue}
                    >
                      {isGenerating.improve ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.improve} 
                    onChange={(e) => setFormData(prev => ({ ...prev, improve: e.target.value }))} 
                    rows={3} 
                    placeholder="改善方針を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    健康・体調面での留意事項
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('health')}
                      disabled={isGenerating.health || !student?.id}
                    >
                      {isGenerating.health ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.health} 
                    onChange={(e) => setFormData(prev => ({ ...prev, health: e.target.value }))} 
                    rows={3} 
                    placeholder="健康・体調面での留意事項を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    その他特記事項
                  </label>
                  <textarea 
                    value={formData.note} 
                    onChange={(e) => setFormData(prev => ({ ...prev, note: e.target.value }))} 
                    rows={3} 
                    placeholder="特記事項を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    在宅就労継続の妥当性
                    <button 
                      type="button" 
                      className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() => handleAiAssist('validity')}
                      disabled={isGenerating.validity || !student?.id || !formData.goal || !formData.work || !formData.achievement}
                    >
                      {isGenerating.validity ? '🤖 生成中...' : '🤖 AI'}
                    </button>
                  </label>
                  <textarea 
                    value={formData.validity} 
                    onChange={(e) => setFormData(prev => ({ ...prev, validity: e.target.value }))} 
                    rows={3} 
                    placeholder="妥当性を入力" 
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">評価実施者</label>
                  <select 
                    value={formData.instructor} 
                    onChange={(e) => setFormData(prev => ({ ...prev, instructor: e.target.value }))}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                  >
                    {instructorList.length > 0 ? (
                      instructorList.map(instructor => (
                        <option key={instructor.id || instructor.name} value={instructor.name}>
                          {instructor.name}
                        </option>
                      ))
                    ) : (
                      <option value="">指導員が見つかりません</option>
                    )}
                  </select>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">評価実施日:</span>
                    <span className="text-gray-800">{report?.evalDate || report?.date || '未設定'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">前回の達成度評価日:</span>
                    <span className="text-gray-800">{report?.prevEvalDate || report?.prev_evaluation_date || 'なし'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">実施方法:</span>
                    <span className="text-gray-800">
                      {report?.method || report?.evaluation_method || '未設定'}
                      {report?.method_other && `（${report.method_other}）`}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-700">評価実施者:</span>
                    <span className="text-gray-800">{report?.instructor || report?.evaluator_name || '未設定'}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block font-medium text-gray-700 mb-2">訓練目標:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.goal || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">取組内容:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.work || report?.effort || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">訓練目標に対する達成度:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.achievement || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">課題:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.issue || report?.issues || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">今後の課題改善方針:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.improve || report?.improvement || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">健康・体調面での留意事項:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.health || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">その他特記事項:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.note || report?.others || '未入力'}
                    </div>
                  </div>

                  <div>
                    <label className="block font-medium text-gray-700 mb-2">在宅就労継続の妥当性:</label>
                    <div className="p-4 bg-gray-50 rounded-lg whitespace-pre-wrap">
                      {report?.validity || report?.appropriateness || '未入力'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MonthlyEvaluationDetail; 