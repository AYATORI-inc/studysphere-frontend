import React, { useState, useEffect } from 'react';
import { getUserHealthData, getUserWorkPlan, updateUserDailyReport } from '../utils/userInputApi';
import { getSatelliteInstructors } from '../utils/api';
import { getCurrentUser } from '../utils/userContext';
import { API_BASE_URL } from '../config/apiConfig';

/**
 * 日次支援記録モーダル
 * (様式)在宅における就労支援記録（評価）.txt に基づく
 * 1日1データで、支援内容に時系列で複数回の支援を記録
 */
const DailySupportRecordModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  student,
  date = new Date().toISOString().split('T')[0],
  aiAssist 
}) => {
  const [record, setRecord] = useState({
    startTime: '',
    endTime: '',
    breakStartTime: '',
    breakEndTime: '',
    supportMethod: '電話',
    supportMethodOther: '',
    workContent: '',
    supportContent: '',
    healthStatus: '',
    responder: '',
    remarks: ''
  });

  const [healthData, setHealthData] = useState(null);
  const [workPlan, setWorkPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [instructors, setInstructors] = useState([]);
  const [workNote, setWorkNote] = useState('');
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestingSupport, setAiSuggestingSupport] = useState(false);
  const [aiSuggestingAdvice, setAiSuggestingAdvice] = useState(false);
  const [supportPlan, setSupportPlan] = useState(null);

  useEffect(() => {
    if (isOpen && student) {
      // モーダルが開かれた時に初期状態をリセット
      setRecord({
        startTime: '',
        endTime: '',
        breakStartTime: '',
        breakEndTime: '',
        supportMethod: '電話',
        supportMethodOther: '',
        workContent: '',
        supportContent: '',
        healthStatus: '',
        responder: '',
        remarks: ''
      });
      fetchUserData();
      fetchInstructors();
      fetchSupportPlan();
    }
  }, [isOpen, student, date]);

  const fetchInstructors = async () => {
    try {
      const currentUser = getCurrentUser();
      const satelliteId = currentUser?.satellite_id || currentUser?.location?.id;
      
      if (satelliteId) {
        const response = await getSatelliteInstructors(satelliteId);
        if (response.success && response.data) {
          setInstructors(response.data);
        }
      }
    } catch (error) {
      console.error('指導員リスト取得エラー:', error);
    }
  };

  const fetchSupportPlan = async () => {
    try {
      const token = localStorage.getItem('accessToken');
      const response = await fetch(`${API_BASE_URL}/api/support-plans/user/${student.id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data) {
          setSupportPlan(data.data);
        }
      }
    } catch (error) {
      console.error('個別計画書取得エラー:', error);
    }
  };

  const fetchUserData = async () => {
    if (!student) return;

    setLoading(true);
    setError(null);

    try {
      const [healthResult, workResult] = await Promise.all([
        getUserHealthData(student.id, date),
        getUserWorkPlan(student.id, date)
      ]);

      if (healthResult.success) {
        setHealthData(healthResult.data);
        if (healthResult.data) {
          setRecord(prev => ({
            ...prev,
            startTime: healthResult.data.mark_start ? new Date(healthResult.data.mark_start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '',
            endTime: healthResult.data.mark_end ? new Date(healthResult.data.mark_end).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '',
            breakStartTime: healthResult.data.mark_lunch_start ? new Date(healthResult.data.mark_lunch_start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '',
            breakEndTime: healthResult.data.mark_lunch_end ? new Date(healthResult.data.mark_lunch_end).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : ''
          }));
        }
      }

      if (workResult.success) {
        setWorkPlan(workResult.data);
        if (workResult.data) {
          setRecord(prev => ({
            ...prev,
            workContent: workResult.data.work_result || '',
            supportContent: workResult.data.support_content || '',
            healthStatus: workResult.data.advice || '',
            supportMethod: workResult.data.support_method || prev.supportMethod,
            supportMethodOther: workResult.data.support_method_note || '',
            responder: workResult.data.recorder_name || '',
            remarks: workResult.data.daily_report || ''
          }));
          setWorkNote(workResult.data.work_note || '');
        }
      }
    } catch (error) {
      console.error('データ取得エラー:', error);
      setError('データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  // 支援方法の選択肢
  const supportMethods = ['訪問', '電話', 'その他'];

  // 記録を更新
  const updateRecord = (field, value) => {
    setRecord(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // AI提案機能（作業内容）
  const handleAISuggestWork = async () => {
    if (!workNote || workNote.trim() === '') {
      alert('作業記録がありません。AI提案を生成できません。');
      return;
    }

    setAiSuggesting(true);
    try {
      const token = localStorage.getItem('accessToken');

      const response = await fetch(`${API_BASE_URL}/api/ai/suggest-work-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ work_note: workNote })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.suggestion) {
        updateRecord('workContent', data.suggestion);
        alert('AI提案を生成しました。');
      }
    } catch (error) {
      console.error('AI提案エラー:', error);
      alert(`AI提案の生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setAiSuggesting(false);
    }
  };

  // AI提案機能（支援内容）
  const handleAISuggestSupport = async () => {
    if (!record.startTime || !record.endTime || !record.supportMethod) {
      alert('開始時刻、終了時刻、支援方法を入力してください。');
      return;
    }

    setAiSuggestingSupport(true);
    try {
      const token = localStorage.getItem('accessToken');

      const supportPlanText = supportPlan ? 
        `【短期目標】${supportPlan.short_term_goal || '未設定'}\n【長期目標】${supportPlan.long_term_goal || '未設定'}\n【課題】${supportPlan.issues || '未設定'}` : 
        '記録なし';

      const response = await fetch(`${API_BASE_URL}/api/ai/suggest-support-content`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          start_time: record.startTime,
          end_time: record.endTime,
          support_method: record.supportMethod,
          work_result: record.workContent || '',
          daily_report: record.remarks || '',
          support_plan: supportPlanText
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.suggestion) {
        updateRecord('supportContent', data.suggestion);
        alert('支援内容のAI提案を生成しました。');
      }
    } catch (error) {
      console.error('支援内容AI提案エラー:', error);
      alert(`AI提案の生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setAiSuggestingSupport(false);
    }
  };

  // AI提案機能（心身の状況・助言）
  const handleAISuggestAdvice = async () => {
    if (!healthData?.condition || !record.remarks) {
      alert('体調と日報を入力してください。');
      return;
    }

    setAiSuggestingAdvice(true);
    try {
      const token = localStorage.getItem('accessToken');

      const response = await fetch(`${API_BASE_URL}/api/ai/suggest-advice`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          temperature: healthData.temperature || '',
          condition: healthData.condition,
          sleep_hours: healthData.sleep_hours || '',
          daily_report: record.remarks,
          start_time: record.startTime,
          end_time: record.endTime
        })
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      if (data.success && data.suggestion) {
        updateRecord('healthStatus', data.suggestion);
        alert('心身の状況・助言内容のAI提案を生成しました。');
      }
    } catch (error) {
      console.error('心身の状況・助言内容AI提案エラー:', error);
      alert(`AI提案の生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setAiSuggestingAdvice(false);
    }
  };

  // 保存
  const handleSave = async () => {
    try {
      // 日次記録IDを取得
      let reportId = null;
      
      if (healthData && healthData.id) {
        reportId = healthData.id;
      } else if (workPlan && workPlan.id) {
        reportId = workPlan.id;
      }
      
      if (!reportId) {
        alert('日次記録が見つかりません。データを再読み込みしてください。');
        return;
      }

      // 時間フィールドをUTCのMySQL形式に変換するヘルパー関数
      const convertTimeToMySQLDateTimeUTC = (timeStr) => {
        if (!timeStr || timeStr.trim() === '') return null;
        // date propは YYYY-MM-DD 形式で来るので、それと時間を結合（日本時間として解釈）
        // 日本時間（+09:00）として解釈
        // new Date()に+09:00を付与すると、内部的にUTCに変換される
        const jstDateTimeString = `${date}T${timeStr}:00+09:00`;
        const dateObj = new Date(jstDateTimeString);
        
        if (isNaN(dateObj.getTime())) {
          return null;
        }
        
        // Dateオブジェクトは既にUTC時刻として管理されているので、
        // getUTC*メソッドで直接UTCの値を取得できる
        // 追加で9時間引く必要はない（既にUTCになっている）
        const year = dateObj.getUTCFullYear();
        const month = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getUTCDate()).padStart(2, '0');
        const hours = String(dateObj.getUTCHours()).padStart(2, '0');
        const minutes = String(dateObj.getUTCMinutes()).padStart(2, '0');
        const seconds = String(dateObj.getUTCSeconds()).padStart(2, '0');
        
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
      };

      // 時間フィールドが空文字列や空白の場合はnullに変換するヘルパー関数
      const normalizeTimeField = (timeValue) => {
        if (!timeValue || (typeof timeValue === 'string' && timeValue.trim() === '')) {
          return null;
        }
        return convertTimeToMySQLDateTimeUTC(timeValue);
      };

      // データを送信（UTC変換）
      const result = await updateUserDailyReport(reportId, {
        mark_start: normalizeTimeField(record.startTime),
        mark_end: normalizeTimeField(record.endTime),
        mark_lunch_start: normalizeTimeField(record.breakStartTime),
        mark_lunch_end: normalizeTimeField(record.breakEndTime),
        support_method: record.supportMethod,
        support_method_note: record.supportMethodOther,
        work_result: record.workContent,
        support_content: record.supportContent,
        advice: record.healthStatus,
        recorder_name: record.responder,
        daily_report: record.remarks
      });
      
      if (result.success) {
        alert('在宅就労支援記録を保存しました');
        onClose();
      } else {
        alert(`保存に失敗しました: ${result.message}`);
      }
    } catch (error) {
      console.error('保存エラー:', error);
      alert('保存中にエラーが発生しました');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* ヘッダー */}
        <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white p-6">
          <h2 className="text-2xl font-bold mb-2">📝 在宅における就労支援記録</h2>
          <div className="text-green-100 text-sm space-y-1">
            <p>対象者名: <span className="font-semibold text-white">{student?.name || '未設定'}</span></p>
            <p>受給者証番号: <span className="font-semibold text-white">{student?.recipientNumber || '未設定'}</span></p>
            <p>実施日: <span className="font-semibold text-white">{new Date(date).toLocaleDateString('ja-JP')}</span></p>
          </div>
        </div>

        {/* コンテンツ */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {/* 注意事項 */}
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <p className="text-sm text-yellow-800">
                <span className="font-semibold">※ 支援内容は1日2回以上の連絡・支援を時系列で記録してください</span>
                <br />
                <span className="text-xs mt-1 block">例：9:00 作業開始確認、12:00 進捗確認、15:00 助言、16:00 終了確認</span>
              </p>
            </div>

            {/* 基本情報 */}
            <div className="border border-gray-200 rounded-xl p-6 bg-gray-50">
              <h3 className="text-lg font-bold text-gray-800 mb-4">基本情報</h3>

              <div className="space-y-4">
                {/* 実施時間 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      実施時間（開始）
                    </label>
                    <input
                      type="time"
                      value={record.startTime}
                      onChange={(e) => updateRecord('startTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      実施時間（終了）
                    </label>
                    <input
                      type="time"
                      value={record.endTime}
                      onChange={(e) => updateRecord('endTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 昼休憩時間 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      昼休憩開始
                    </label>
                    <input
                      type="time"
                      value={record.breakStartTime}
                      onChange={(e) => updateRecord('breakStartTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      昼休憩終了
                    </label>
                    <input
                      type="time"
                      value={record.breakEndTime}
                      onChange={(e) => updateRecord('breakEndTime', e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 支援方法 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    支援方法 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-3">
                    {supportMethods.map(method => (
                      <label key={method} className="flex items-center">
                        <input
                          type="radio"
                          name="supportMethod"
                          value={method}
                          checked={record.supportMethod === method}
                          onChange={(e) => updateRecord('supportMethod', e.target.value)}
                          className="w-4 h-4 text-green-600 border-gray-300 focus:ring-green-500"
                        />
                        <span className="ml-2 text-sm text-gray-700">{method}</span>
                      </label>
                    ))}
                  </div>
                  {record.supportMethod === 'その他' && (
                    <input
                      type="text"
                      value={record.supportMethodOther}
                      onChange={(e) => updateRecord('supportMethodOther', e.target.value)}
                      placeholder="支援方法の詳細を入力"
                      className="mt-2 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 作業・訓練内容 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  作業・訓練内容 <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAISuggestWork();
                  }}
                  disabled={aiSuggesting || !workNote}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {aiSuggesting ? '🤖 生成中...' : '🤖 AI提案'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">実施した作業や訓練の内容を記録してください</p>
              <textarea
                value={record.workContent}
                onChange={(e) => updateRecord('workContent', e.target.value)}
                rows="4"
                placeholder="例：&#10;・ビーズ等を使ったアクセサリー作り（前回終えられなかった分も含む）&#10;・上記終了後、細かい作業の訓練のためのプログラム（簡単な手芸作品の作成）を実施"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono text-sm"
              />
            </div>

            {/* 支援内容（1日2回以上） */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  支援内容（1日2回以上） <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAISuggestSupport();
                  }}
                  disabled={aiSuggestingSupport || !record.startTime || !record.endTime || !record.supportMethod}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {aiSuggestingSupport ? '🤖 生成中...' : '🤖 AI提案'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">
                時系列で複数回（2回以上）の支援・連絡内容を記録してください
              </p>
              <textarea
                value={record.supportContent}
                onChange={(e) => updateRecord('supportContent', e.target.value)}
                rows="10"
                placeholder="例：&#10;・9:00　利用者から作業開始の電話あり。前回作成予定の個数が終わらなかったのは、集中力が続かなかったことが原因のようであり、30分ごとに少し休憩をはさむなどしてリフレッシュの時間を設けることを提案。今日は、前回の残り分を含め、30個の作成を目標とする。（母親へも報告）&#10;・12:00　利用者へ電話。午前中の作業進捗を確認。目標の半分（15個）を作成済み。13:00まで昼休みを取り、13:00から再開することを確認。&#10;・13:00　利用者から電話あり、作業が慣れてきたので、目標の30個が終わったら、残りの時間で、作業能率をさらにアップさせるため、細かな作業の訓練プログラムをやりたいとの提案があり、了承する。&#10;・15:20　30個の作成が終了したとの報告。成果物の画像をLINEで送信してもらい、丁寧に仕上がっていることを確認。残りの時間で、先週渡した訓練プログラム（見本どおりに刺繍する訓練）を実施。&#10;・16:00　利用者へ電話。訓練プログラムの成果物をLINEで確認。次回の作業内容の確認と、目標個数を10個増やすことを確認する。就寝までの生活リズムも崩さないよう助言する。&#10;・全体をとおして、前回より作業能率が上がっており、次回以降もこの状態を維持できるよう助言していきたい。"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono text-sm"
              />
            </div>

            {/* 対象者の心身の状況及びそれに対する助言の内容 */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">
                  対象者の心身の状況及びそれに対する助言の内容 <span className="text-red-500">*</span>
                </label>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    handleAISuggestAdvice();
                  }}
                  disabled={aiSuggestingAdvice || !healthData?.condition || !record.remarks}
                  className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs hover:bg-blue-200 disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed transition-all duration-200"
                >
                  {aiSuggestingAdvice ? '🤖 生成中...' : '🤖 AI提案'}
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-2">時系列で体調確認と助言内容を記録してください</p>
              <textarea
                value={record.healthStatus}
                onChange={(e) => updateRecord('healthStatus', e.target.value)}
                rows="6"
                placeholder="例：&#10;・9:00　体温36.2℃、睡眠時間6時間と確認。体調も良好な様子。いつもどおりストレッチを行うことを助言。&#10;・16:00　いつも以上に作業を頑張ったせいか、軽い頭痛を感じるとのこと。ペースを考え、適宜休憩をとりながら、メリハリをつけて作業することを助言。また、生活リズムを保つために、夜更かしをせず、起床時間を守ることを助言。"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent resize-none font-mono text-sm"
              />
            </div>

            {/* 対応・記録者 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                対応・記録者 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  list="instructor-list"
                  value={record.responder}
                  onChange={(e) => updateRecord('responder', e.target.value)}
                  placeholder="指導員リストから選択または手入力"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                />
                <datalist id="instructor-list">
                  {instructors.map(instructor => (
                    <option key={instructor.id} value={instructor.name} />
                  ))}
                </datalist>
              </div>
              <p className="mt-1 text-xs text-gray-500">指導員リストから選択、または直接入力できます</p>
            </div>

            {/* 備考 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                備考
              </label>
              <textarea
                value={record.remarks}
                onChange={(e) => updateRecord('remarks', e.target.value)}
                placeholder="支援に関する特記事項や注意点を入力してください"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent h-24 resize-none"
              />
            </div>
          </div>
        </div>

        {/* フッター */}
        <div className="border-t border-gray-200 p-6 bg-gray-50">
          <div className="flex justify-end gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition-all duration-200"
            >
              キャンセル
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-all duration-200"
            >
              💾 保存
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DailySupportRecordModal;
