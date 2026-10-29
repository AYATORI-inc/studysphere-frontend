import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { apiCall } from '../utils/api';
import { getSupportPlanByUserId } from '../utils/api';
import MonthlyReportPrintModal from '../components/modals/MonthlyReportPrintModal';
import ExcelJS from 'exceljs';

/**
 * 達成度評価作成画面（在宅における就労達成度評価シート）
 * 左側上：個別支援計画
 * 左側下：今月の評価(週次)一覧
 * 右側：達成度評価フォーム
 */
const MonthlyEvaluationPage = () => {
  const navigate = useNavigate();
  const { studentId } = useParams();
  const [searchParams] = useSearchParams();
  const { currentUser } = useInstructorGuard();
  
  // 戻る際に拠点情報を保存する関数
  const saveLocationAndNavigate = () => {
    if (currentUser) {
      const savedSatellite = sessionStorage.getItem('selectedSatellite');
      if (savedSatellite) {
        // 既存の拠点情報をそのまま保持
        const satellite = JSON.parse(savedSatellite);
        sessionStorage.setItem('selectedSatellite', JSON.stringify(satellite));
      } else if (currentUser.satellite_id) {
        // ユーザー情報から拠点情報を保存
        const currentLocation = {
          id: currentUser.satellite_id,
          name: currentUser.satellite_name,
          company_id: currentUser.company_id,
          company_name: currentUser.company_name
        };
        sessionStorage.setItem('selectedSatellite', JSON.stringify(currentLocation));
      }
    }
    navigate('/instructor/home-support');
  };
  
  // 期間の状態管理
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [prevEvalDate, setPrevEvalDate] = useState('');
  
  // 生徒情報
  const [student, setStudent] = useState(null);
  
  // 個別支援計画
  const [supportPlan, setSupportPlan] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(true);
  
  // 週次評価一覧
  const [weeklyEvaluations, setWeeklyEvaluations] = useState([]);
  const [expandedWeekly, setExpandedWeekly] = useState({});
  
  // 達成度評価フォーム
  const [evaluationData, setEvaluationData] = useState({
    startTime: '',
    endTime: '',
    method: '通所',
    methodOther: '',
    trainingGoal: '',
    workContent: '',
    achievement: '',
    issues: '',
    improvementPlan: '',
    healthNotes: '',
    otherNotes: '',
    continuityValidity: '',
    evaluator: '',
    studentSignature: ''
  });
  
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingField, setGeneratingField] = useState(null); // 現在生成中のフィールド
  const [isLoading, setIsLoading] = useState(true);
  
  // 指導員リスト
  const [instructors, setInstructors] = useState([]);

  // 印刷モーダルの状態
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // 利用者情報を取得
  useEffect(() => {
    const fetchStudentInfo = async () => {
      if (!studentId) return;
      
      try {
        const response = await apiCall(`/api/users/${studentId}`, { method: 'GET' });
        if (response.success && response.data) {
          const userData = response.data;
          setStudent({
            id: userData.id,
            name: userData.name,
            recipientNumber: userData.recipient_number || '',
            instructorName: userData.instructor_name || '',
            satellite_id: (() => {
              if (!userData.satellite_ids) return null;
              if (Array.isArray(userData.satellite_ids)) return userData.satellite_ids[0];
              if (typeof userData.satellite_ids === 'string') {
                try {
                  const parsed = JSON.parse(userData.satellite_ids);
                  return Array.isArray(parsed) ? parsed[0] : parsed;
                } catch (error) {
                  console.error('satellite_idsパースエラー:', error);
                  return null;
                }
              }
              return userData.satellite_ids;
            })()
          });

          // 拠点IDがある場合、指導員リストを取得
          const satelliteId = (() => {
            if (!userData.satellite_ids) return null;
            if (Array.isArray(userData.satellite_ids)) return userData.satellite_ids[0];
            if (typeof userData.satellite_ids === 'string') {
              try {
                const parsed = JSON.parse(userData.satellite_ids);
                return Array.isArray(parsed) ? parsed[0] : parsed;
              } catch (error) {
                console.error('satellite_idsパースエラー:', error);
                return null;
              }
            }
            return userData.satellite_ids;
          })();
          if (satelliteId) {
            try {
              const instructorResponse = await apiCall(`/api/users/satellite/${satelliteId}/weekly-evaluation-instructors`, {
                method: 'GET'
              });
              if (instructorResponse.success && instructorResponse.data) {
                setInstructors(instructorResponse.data);
              }
            } catch (error) {
              console.error('指導員リスト取得エラー:', error);
            }
          }

          // 前回評価日を取得
          try {
            const prevEvalResponse = await apiCall(`/api/monthly-evaluations/user/${studentId}/latest`, {
              method: 'GET'
            });
            if (prevEvalResponse.success && prevEvalResponse.data?.date) {
              setPrevEvalDate(prevEvalResponse.data.date);
            }
          } catch (error) {
            console.error('前回評価日取得エラー:', error);
          }
        }
      } catch (error) {
        console.error('利用者情報取得エラー:', error);
        alert('利用者情報の取得に失敗しました。');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudentInfo();
  }, [studentId]);

  useEffect(() => {
    // URLパラメータから期間を取得、なければ昨日の1カ月前〜昨日を設定
    const start = searchParams.get('start');
    const end = searchParams.get('end');
    
    if (start && end) {
      setPeriodStart(start);
      setPeriodEnd(end);
    } else {
      // 昨日の1カ月前〜昨日を設定
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);
      
      const oneMonthAgo = new Date(yesterday);
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      
      setPeriodStart(oneMonthAgo.toISOString().split('T')[0]);
      setPeriodEnd(yesterday.toISOString().split('T')[0]);
    }
  }, [searchParams]);

  useEffect(() => {
    if (periodStart && periodEnd && studentId) {
      fetchSupportPlan();
      fetchWeeklyEvaluations();
    }
  }, [periodStart, periodEnd, studentId]);

  // 個別支援計画を取得
  const fetchSupportPlan = async () => {
    if (!studentId) return;
    
    try {
      const response = await getSupportPlanByUserId(studentId);
      if (response.success && response.data) {
        const plan = response.data;
        // needsとsupport_contentは改行区切りの文字列の可能性があるため、配列に変換
        const needsArray = plan.needs ? (Array.isArray(plan.needs) ? plan.needs : plan.needs.split('\n').filter(n => n.trim())) : [];
        const supportContentArray = plan.support_content ? (Array.isArray(plan.support_content) ? plan.support_content : plan.support_content.split('\n').filter(c => c.trim())) : [];
        
        setSupportPlan({
          longTermGoal: plan.long_term_goal || '',
          shortTermGoal: plan.short_term_goal || '',
          needs: needsArray,
          supportContent: supportContentArray,
          targetDate: plan.goal_date ? new Date(plan.goal_date).toLocaleDateString('ja-JP') : ''
        });
      } else {
        // 個別支援計画が見つからない場合の処理
        setSupportPlan({
          longTermGoal: '',
          shortTermGoal: '',
          needs: [],
          supportContent: [],
          targetDate: ''
        });
      }
    } catch (error) {
      console.error('個別支援計画取得エラー:', error);
      setSupportPlan({
        longTermGoal: '',
        shortTermGoal: '',
        needs: [],
        supportContent: [],
        targetDate: ''
      });
    }
  };

  // 週次評価一覧を取得
  const fetchWeeklyEvaluations = async () => {
    if (!studentId || !periodStart || !periodEnd) return;
    
    try {
      const response = await apiCall(`/api/weekly-evaluations/user/${studentId}?periodStart=${periodStart}&periodEnd=${periodEnd}`, {
        method: 'GET'
      });
      
      if (response.success && response.data) {
        // バックエンドのデータ形式をフロントエンドの表示形式に変換
        const weeklyData = response.data.map(weekly => ({
          id: weekly.id,
          period: `${weekly.period_start} 〜 ${weekly.period_end}`,
          evalDate: weekly.date,
          method: weekly.evaluation_method === 'その他' && weekly.method_other ? weekly.method_other : weekly.evaluation_method,
          content: weekly.evaluation_content || '',
          recorder: weekly.recorder_name || ''
        }));
        
        setWeeklyEvaluations(weeklyData);
        
        // デフォルトで最初の評価を展開
        if (weeklyData.length > 0) {
          setExpandedWeekly({ [weeklyData[0].id]: true });
        }
      } else {
        setWeeklyEvaluations([]);
      }
    } catch (error) {
      console.error('週次評価取得エラー:', error);
      setWeeklyEvaluations([]);
    }
  };

  // 週次評価の展開/折りたたみ
  const toggleWeekly = (weeklyId) => {
    setExpandedWeekly(prev => ({
      ...prev,
      [weeklyId]: !prev[weeklyId]
    }));
  };

  // 全て展開/折りたたみ
  const toggleAllWeekly = (expand) => {
    const newState = {};
    weeklyEvaluations.forEach(weekly => {
      newState[weekly.id] = expand;
    });
    setExpandedWeekly(newState);
  };

  // フォーム更新
  const updateEvaluation = (field, value) => {
    setEvaluationData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // AIで評価案を生成（段階的に各項目を生成）
  const generateEvaluationWithAI = async () => {
    if (!studentId || !supportPlan) {
      alert('利用者情報または個別支援計画が取得できません。');
      return;
    }
    
    setIsGenerating(true);
    setGeneratingField(null);
    
    try {
      // 1. 訓練目標を生成（個別支援計画の短期目標に基づく）
      setGeneratingField('訓練目標');
      const goalResponse = await apiCall('/api/monthly-evaluation-ai/generate-goal', {
        method: 'POST',
        body: JSON.stringify({ user_id: studentId })
      });
      
      if (goalResponse.success && goalResponse.data?.goal) {
        setEvaluationData(prev => ({
          ...prev,
          trainingGoal: goalResponse.data.goal
        }));
      }
      
      // 2. 取組内容を生成（対象期間中の週報を基に）
      setGeneratingField('取り組み内容');
      const workResponse = await apiCall('/api/monthly-evaluation-ai/generate-effort', {
        method: 'POST',
        body: JSON.stringify({
          user_id: studentId,
          period_start: periodStart,
          period_end: periodEnd
        })
      });
      
      if (workResponse.success && workResponse.data?.effort) {
        setEvaluationData(prev => ({
          ...prev,
          workContent: workResponse.data.effort
        }));
      }
      
      // 3. 訓練目標に対する達成度を生成（訓練目標と取組内容を比較）
      setGeneratingField('訓練目標に対する達成度');
      const achievementResponse = await apiCall('/api/monthly-evaluation-ai/generate-achievement', {
        method: 'POST',
        body: JSON.stringify({
          goal: goalResponse.success ? goalResponse.data?.goal : '',
          effort: workResponse.success ? workResponse.data?.effort : ''
        })
      });
      
      if (achievementResponse.success && achievementResponse.data?.achievement) {
        setEvaluationData(prev => ({
          ...prev,
          achievement: achievementResponse.data.achievement
        }));
      }
      
      // 4. 課題を生成（訓練目標と達成度を比較）
      setGeneratingField('課題');
      const issueResponse = await apiCall('/api/monthly-evaluation-ai/generate-issues', {
        method: 'POST',
        body: JSON.stringify({
          goal: goalResponse.success ? goalResponse.data?.goal : '',
          achievement: achievementResponse.success ? achievementResponse.data?.achievement : ''
        })
      });
      
      if (issueResponse.success && issueResponse.data?.issues) {
        setEvaluationData(prev => ({
          ...prev,
          issues: issueResponse.data.issues
        }));
      }
      
      // 5. 今後における課題の改善方針を生成（課題と個別支援計画書から）
      setGeneratingField('今後における課題の改善方針');
      const improvementResponse = await apiCall('/api/monthly-evaluation-ai/generate-improvement', {
        method: 'POST',
        body: JSON.stringify({
          user_id: studentId,
          issues: issueResponse.success ? issueResponse.data?.issues : ''
        })
      });
      
      if (improvementResponse.success && improvementResponse.data?.improvement) {
        setEvaluationData(prev => ({
          ...prev,
          improvementPlan: improvementResponse.data.improvement
        }));
      }
      
      // 6. 健康・体調面での留意事項を生成（対象期間中の週報を基に）
      setGeneratingField('健康・体調面での留意事項');
      const healthResponse = await apiCall('/api/monthly-evaluation-ai/generate-health', {
        method: 'POST',
        body: JSON.stringify({
          user_id: studentId,
          period_start: periodStart,
          period_end: periodEnd
        })
      });
      
      if (healthResponse.success && healthResponse.data?.health) {
        setEvaluationData(prev => ({
          ...prev,
          healthNotes: healthResponse.data.health
        }));
      }
      
      // 7. 在宅就労継続の妥当性を生成（個別支援計画書と訓練目標～その他特記事項の内容を総合的に勘案）
      setGeneratingField('在宅就労継続の妥当性');
      const validityResponse = await apiCall('/api/monthly-evaluation-ai/generate-appropriateness', {
        method: 'POST',
        body: JSON.stringify({
          user_id: studentId,
          goal: goalResponse.success ? goalResponse.data?.goal : '',
          effort: workResponse.success ? workResponse.data?.effort : '',
          achievement: achievementResponse.success ? achievementResponse.data?.achievement : '',
          issues: issueResponse.success ? issueResponse.data?.issues : '',
          improvement: improvementResponse.success ? improvementResponse.data?.improvement : '',
          health: healthResponse.success ? healthResponse.data?.health : '',
          other_notes: evaluationData.otherNotes || ''
        })
      });
      
      if (validityResponse.success && validityResponse.data?.appropriateness) {
        setEvaluationData(prev => ({
          ...prev,
          continuityValidity: validityResponse.data.appropriateness
        }));
      }
      
      alert('評価案の生成が完了しました。');
    } catch (error) {
      console.error('AI評価案生成エラー:', error);
      alert(`AI評価案の生成中にエラーが発生しました: ${error.message}`);
    } finally {
      setIsGenerating(false);
      setGeneratingField(null);
    }
  };

  // 保存
  const handleSave = async () => {
    if (!student?.id) {
      alert('利用者情報が取得できません。');
      return;
    }

    if (!evaluationData.trainingGoal.trim() || !evaluationData.workContent.trim()) {
      alert('訓練目標と取組内容は必須項目です。');
      return;
    }

    if (!periodStart || !periodEnd) {
      alert('対象期間の開始日と終了日を入力してください。');
      return;
    }

    if (new Date(periodStart) > new Date(periodEnd)) {
      alert('対象期間の開始日は終了日以前に設定してください。');
      return;
    }

    setIsLoading(true);
    try {
      // evaluation_methodの値を検証（ENUM値に一致させる）
      // データベースのENUM値: '通所', '訪問', 'その他'
      // 文字列に変換して空白を削除し、厳密に比較
      const methodValue = String(evaluationData.method || '').trim();
      let evaluationMethod = '通所'; // デフォルト値
      
      if (methodValue === '通所' || methodValue === '訪問' || methodValue === 'その他') {
        evaluationMethod = methodValue;
      } else {
        console.warn(`無効なevaluation_method値: "${methodValue}" (型: ${typeof evaluationData.method})。デフォルト値「通所」を使用します。`);
        console.log('evaluationData全体:', evaluationData);
        // デフォルト値を使用
        evaluationMethod = '通所';
      }
      
      // デバッグ用: 送信されるevaluation_methodの値を確認
      console.log(`送信されるevaluation_method: "${evaluationMethod}" (型: ${typeof evaluationMethod})`);

      // user_idの検証と型変換
      const userId = parseInt(student.id, 10);
      if (!userId || isNaN(userId)) {
        alert('利用者IDが無効です。');
        setIsLoading(false);
        return;
      }

      const backendData = {
        date: new Date().toISOString().split('T')[0],
        mark_start: evaluationData.startTime ? `${new Date().toISOString().split('T')[0]} ${evaluationData.startTime}:00` : null,
        mark_end: evaluationData.endTime ? `${new Date().toISOString().split('T')[0]} ${evaluationData.endTime}:00` : null,
        evaluation_method: evaluationMethod, // 検証済みの値を使用
        method_other: methodValue === 'その他' ? (evaluationData.methodOther || null) : null,
        goal: evaluationData.trainingGoal || null,
        effort: evaluationData.workContent || null,
        achievement: evaluationData.achievement || null,
        issues: evaluationData.issues || null,
        improvement: evaluationData.improvementPlan || null,
        health: evaluationData.healthNotes || null,
        others: evaluationData.otherNotes || null,
        appropriateness: evaluationData.continuityValidity || null,
        evaluator_name: evaluationData.evaluator || null,
        prev_evaluation_date: prevEvalDate || null,
        recipient_number: student.recipientNumber || null,
        user_name: student.name || null,
        user_id: userId, // 数値型に変換
        period_start: periodStart,
        period_end: periodEnd
      };

      // 送信データをログ出力（デバッグ用）
      console.log('送信データ:', JSON.stringify(backendData, null, 2));
      console.log('user_idの型:', typeof backendData.user_id, '値:', backendData.user_id);

      const response = await apiCall('/api/monthly-evaluations', {
        method: 'POST',
        body: JSON.stringify(backendData)
      });

      if (response.success) {
        alert('達成度評価を保存しました。');
        saveLocationAndNavigate();
      } else {
        // より詳細なエラーメッセージを表示
        const errorDetails = response.message || 'エラーが発生しました';
        console.error('保存エラー詳細 (response):', JSON.stringify(response, null, 2));
        alert('保存に失敗しました: ' + errorDetails);
      }
    } catch (error) {
      console.error('保存エラー:', error);
      console.error('エラーオブジェクト全体:', error);
      console.error('error.response:', error.response);
      console.error('error.response?.data:', error.response?.data);
      // より詳細なエラーメッセージを表示
      const errorMessage = error.response?.data?.message || error.message || '不明なエラーが発生しました';
      console.error('表示されるエラーメッセージ:', errorMessage);
      alert('保存中にエラーが発生しました: ' + errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Excelダウンロード処理（同時に保存も実行）
  const handleDownloadExcel = async () => {
    if (!student?.id) {
      alert('利用者情報が取得できません。');
      return;
    }

    // バリデーション
    if (!evaluationData.trainingGoal.trim() || !evaluationData.workContent.trim()) {
      alert('訓練目標と取組内容は必須項目です。');
      return;
    }

    if (!periodStart || !periodEnd) {
      alert('対象期間の開始日と終了日を入力してください。');
      return;
    }

    if (new Date(periodStart) > new Date(periodEnd)) {
      alert('対象期間の開始日は終了日以前に設定してください。');
      return;
    }

    // 保存処理を先に実行（完了を待つ）
    setIsLoading(true);
    try {
      // evaluation_methodの値を検証（ENUM値に一致させる）
      // データベースのENUM値: '通所', '訪問', 'その他'
      // 文字列に変換して空白を削除し、厳密に比較
      const methodValue = String(evaluationData.method || '').trim();
      let evaluationMethod = '通所'; // デフォルト値
      
      if (methodValue === '通所' || methodValue === '訪問' || methodValue === 'その他') {
        evaluationMethod = methodValue;
      } else {
        console.warn(`無効なevaluation_method値: "${methodValue}" (型: ${typeof evaluationData.method})。デフォルト値「通所」を使用します。`);
        console.log('evaluationData全体:', evaluationData);
        // デフォルト値を使用
        evaluationMethod = '通所';
      }
      
      // デバッグ用: 送信されるevaluation_methodの値を確認
      console.log(`送信されるevaluation_method: "${evaluationMethod}" (型: ${typeof evaluationMethod})`);

      // user_idの検証
      if (!student?.id || isNaN(student.id)) {
        throw new Error('利用者IDが無効です。');
      }

      const backendData = {
        date: new Date().toISOString().split('T')[0],
        mark_start: evaluationData.startTime ? `${new Date().toISOString().split('T')[0]} ${evaluationData.startTime}:00` : null,
        mark_end: evaluationData.endTime ? `${new Date().toISOString().split('T')[0]} ${evaluationData.endTime}:00` : null,
        evaluation_method: evaluationMethod, // 検証済みの値を使用
        method_other: methodValue === 'その他' ? (evaluationData.methodOther || null) : null,
        goal: evaluationData.trainingGoal || null,
        effort: evaluationData.workContent || null,
        achievement: evaluationData.achievement || null,
        issues: evaluationData.issues || null,
        improvement: evaluationData.improvementPlan || null,
        health: evaluationData.healthNotes || null,
        others: evaluationData.otherNotes || null,
        appropriateness: evaluationData.continuityValidity || null,
        evaluator_name: evaluationData.evaluator || null,
        prev_evaluation_date: prevEvalDate || null,
        recipient_number: student.recipientNumber || null,
        user_name: student.name || null,
        user_id: parseInt(student.id, 10), // 数値型に変換
        period_start: periodStart,
        period_end: periodEnd
      };

      // 送信データをログ出力（デバッグ用）
      console.log('送信データ:', JSON.stringify(backendData, null, 2));
      console.log('user_idの型:', typeof backendData.user_id, '値:', backendData.user_id);

      const response = await apiCall('/api/monthly-evaluations', {
        method: 'POST',
        body: JSON.stringify(backendData)
      });

      if (response.success) {
        console.log('達成度評価を保存しました。');
        // Excelダウンロードのために画面遷移はしない
      } else {
        // より詳細なエラーメッセージを表示
        const errorDetails = response.message || 'エラーが発生しました';
        console.error('保存エラー詳細 (response):', JSON.stringify(response, null, 2));
        alert(`保存に失敗しましたが、Excelダウンロードを続行します: ${errorDetails}`);
      }
    } catch (error) {
      console.error('保存処理エラー:', error);
      console.error('エラースタック:', error.stack);
      console.error('エラーオブジェクト全体:', error);
      console.error('error.response:', error.response);
      console.error('error.response?.data:', error.response?.data);
      // より詳細なエラーメッセージを表示
      const errorMessage = error.response?.data?.message || error.message || '不明なエラーが発生しました';
      console.error('表示されるエラーメッセージ:', errorMessage);
      alert(`保存中にエラーが発生しましたが、Excelダウンロードを続行します: ${errorMessage}`);
    } finally {
      setIsLoading(false);
    }

    // 保存処理完了後、Excelダウンロード処理を実行

    try {
      // テンプレートファイルを読み込む
      const templatePath = '/doc/reports/monthly_report_template.xlsx';
      const response = await fetch(templatePath);
      if (!response.ok) {
        throw new Error('テンプレートファイルの読み込みに失敗しました');
      }
      
      // テンプレートのバイナリデータを取得
      const templateArrayBuffer = await response.arrayBuffer();
      
      // ExcelJSでテンプレートを読み込み
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(templateArrayBuffer);
      
      // 最初のシートを取得
      const worksheet = workbook.getWorksheet(1) || workbook.worksheets[0];
      
      // 日付フォーマット関数（和暦）
      const convertToWareki = (westernYear, month = 1, day = 1) => {
        const reiwaStartDate = new Date(2019, 4, 1);
        const targetDate = new Date(westernYear, month - 1, day);
        
        if (targetDate < reiwaStartDate) {
          const heiseiStartDate = new Date(1989, 0, 8);
          if (targetDate >= heiseiStartDate) {
            const heiseiYear = westernYear - 1988;
            return { era: '平成', year: heiseiYear, month, day };
          }
          return { era: '昭和', year: westernYear - 1925, month, day };
        }
        
        const reiwaYear = westernYear - 2018;
        return { era: '令和', year: reiwaYear, month, day };
      };

      const formatDateParts = (dateStr) => {
        if (!dateStr) return { era: '令和', year: '', month: '', day: '' };
        const date = new Date(dateStr);
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        return convertToWareki(year, month, day);
      };

      const formatTime = (timeStr) => {
        if (!timeStr) return '';
        return timeStr;
      };

      const updateCell = (cellAddress, value) => {
        if (!cellAddress) return;
        try {
          const cell = worksheet.getCell(cellAddress);
          cell.value = value || '';
        } catch (e) {
          console.warn(`セル ${cellAddress} の更新に失敗:`, e);
        }
      };

      const today = new Date().toISOString().split('T')[0];
      const dateParts = formatDateParts(today);
      
      // X1セルに現在の月を入力、V1セルに和暦の年を入力
      updateCell('X1', dateParts.month);
      updateCell('V1', dateParts.year);
      
      // 対象者名 (D4セル)
      if (student?.name) {
        updateCell('D4', student.name);
      }

      // 受給者証番号 (Q4セル)
      if (student?.recipientNumber) {
        updateCell('Q4', student.recipientNumber);
      }
      
      // 実施日（行6）
      updateCell('D6', dateParts.year); // 令和の年のみ（数字）
      updateCell('I6', dateParts.month); // 記録月
      updateCell('L6', dateParts.day); // 記録日
      
      // 実施時間 (Q6に開始、V6に終了)
      if (evaluationData.startTime) {
        updateCell('Q6', formatTime(evaluationData.startTime));
      }
      if (evaluationData.endTime) {
        updateCell('V6', formatTime(evaluationData.endTime));
      }

      // 実施方法（evaluation_methodの値を確認）
      const methodValue = String(evaluationData.method || '').trim();
      if (methodValue === '通所') {
        updateCell('D7', '✓');
      } else if (methodValue === '訪問') {
        updateCell('F7', '✓');
      } else if (methodValue === 'その他') {
        updateCell('H7', '✓');
        if (evaluationData.methodOther) {
          updateCell('K7', evaluationData.methodOther);
        }
      }

      // その他の項目
      if (evaluationData.trainingGoal) {
        updateCell('D9', evaluationData.trainingGoal);
      }
      if (evaluationData.workContent) {
        updateCell('D12', evaluationData.workContent);
      }
      if (evaluationData.achievement) {
        updateCell('D15', evaluationData.achievement);
      }
      if (evaluationData.issues) {
        updateCell('D19', evaluationData.issues);
      }
      if (evaluationData.improvementPlan) {
        updateCell('D22', evaluationData.improvementPlan);
      }
      if (evaluationData.healthNotes) {
        updateCell('D25', evaluationData.healthNotes);
      }
      if (evaluationData.otherNotes) {
        updateCell('D28', evaluationData.otherNotes);
      }
      if (evaluationData.continuityValidity) {
        updateCell('D31', evaluationData.continuityValidity);
      }
      if (evaluationData.evaluator) {
        updateCell('D34', evaluationData.evaluator);
      }
      if (evaluationData.studentSignature) {
        updateCell('Q36', evaluationData.studentSignature);
      }
      
      // 前回の達成度評価日
      if (prevEvalDate) {
        const prevDateParts = formatDateParts(prevEvalDate);
        updateCell('S34', prevDateParts.year);
        updateCell('V34', prevDateParts.month);
        updateCell('X34', prevDateParts.day);
      }
      
      // Excelファイルをダウンロード
      const excelBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `在宅支援達成度評価_${student?.name || '未設定'}_${new Date().toISOString().split('T')[0]}.xlsx`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Excelダウンロードエラー:', error);
      alert('Excelファイルのダウンロードに失敗しました: ' + error.message);
    }
  };

  // 日付フォーマット
  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('ja-JP', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric'
    });
  };

  // 期間フォーマット
  const formatPeriod = (start, end) => {
    if (!start || !end) return '';
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.getFullYear()}年${startDate.getMonth() + 1}月${startDate.getDate()}日 〜 ${endDate.getFullYear()}年${endDate.getMonth() + 1}月${endDate.getDate()}日`;
  };

  if (isLoading || !student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center">
        <div className="text-purple-600 text-xl font-semibold">読み込み中...</div>
      </div>
    );
  }

  // 個別支援計画がない場合でも表示を続行
  const displaySupportPlan = supportPlan || {
    longTermGoal: '',
    shortTermGoal: '',
    needs: [],
    supportContent: [],
    targetDate: ''
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-700 text-white shadow-lg">
        <div className="max-w-full mx-auto px-6 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button 
                className="px-4 py-2 bg-white bg-opacity-10 border border-white border-opacity-30 rounded-lg hover:bg-opacity-20 transition-all duration-200 font-medium"
                onClick={saveLocationAndNavigate}
              >
                ← 在宅支援管理に戻る
              </button>
              <div>
                <h1 className="text-3xl font-bold mb-1">📈 達成度評価作成</h1>
                <p className="text-purple-100 text-sm">在宅における就労達成度評価シート</p>
              </div>
            </div>
          </div>
          
          {/* 期間設定 */}
          <div className="mt-6 bg-white bg-opacity-10 rounded-xl p-4 border border-white border-opacity-20">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <div className="text-sm">
                  <span className="text-purple-200">対象者:</span>
                  <span className="ml-2 font-semibold text-white">{student.name}</span>
                  <span className="ml-3 text-purple-200">受給者証番号:</span>
                  <span className="ml-2 font-semibold text-white">{student.recipientNumber}</span>
                </div>
                <div className="text-sm">
                  <span className="text-purple-200">前回評価日:</span>
                  <span className="ml-2 font-semibold text-white">{prevEvalDate ? formatDate(prevEvalDate) : 'なし'}</span>
                </div>
              </div>
              <div>
                <label className="block text-purple-200 text-sm mb-2">📅 対象期間を設定</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="date"
                      value={periodStart}
                      onChange={(e) => setPeriodStart(e.target.value)}
                      className="w-full px-3 py-2 bg-white bg-opacity-90 text-gray-800 rounded-lg border-2 border-purple-300 focus:ring-2 focus:ring-white focus:border-white font-semibold"
                    />
                    <p className="text-xs text-purple-100 mt-1">開始日</p>
                  </div>
                  <div>
                    <input
                      type="date"
                      value={periodEnd}
                      onChange={(e) => setPeriodEnd(e.target.value)}
                      className="w-full px-3 py-2 bg-white bg-opacity-90 text-gray-800 rounded-lg border-2 border-purple-300 focus:ring-2 focus:ring-white focus:border-white font-semibold"
                    />
                    <p className="text-xs text-purple-100 mt-1">終了日</p>
                  </div>
                </div>
                <p className="text-xs text-purple-100 mt-2">
                  現在の期間: {formatPeriod(periodStart, periodEnd)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* メインコンテンツ */}
      <div className="max-w-full mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* 左側：個別支援計画 + 週次評価一覧 */}
          <div className="lg:col-span-1 space-y-6">
            {/* 個別支援計画 */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <button
                onClick={() => setExpandedPlan(!expandedPlan)}
                className="w-full flex items-center justify-between mb-4"
              >
                <h2 className="text-xl font-bold text-gray-800">📋 個別支援計画</h2>
                <span className="text-gray-400">
                  {expandedPlan ? '▼' : '▶'}
                </span>
              </button>

              {expandedPlan && (
                <div className="space-y-4 text-sm">
                  <div>
                    <div className="font-semibold text-gray-700 mb-1">長期目標</div>
                    <div className="text-gray-600 bg-amber-50 p-3 rounded border-l-4 border-amber-400">
                      {displaySupportPlan.longTermGoal || '未設定'}
                    </div>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-gray-700 mb-1">短期目標</div>
                    <div className="text-gray-600 bg-blue-50 p-3 rounded border-l-4 border-blue-400">
                      {displaySupportPlan.shortTermGoal || '未設定'}
                    </div>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-gray-700 mb-1">本人のニーズ</div>
                    <div className="text-gray-600 bg-green-50 p-3 rounded space-y-1">
                      {displaySupportPlan.needs.length > 0 ? (
                        displaySupportPlan.needs.map((need, index) => (
                          <div key={index}>・{need}</div>
                        ))
                      ) : (
                        <div>未設定</div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-gray-700 mb-1">個別支援内容</div>
                    <div className="text-gray-600 bg-purple-50 p-3 rounded space-y-2">
                      {displaySupportPlan.supportContent.length > 0 ? (
                        displaySupportPlan.supportContent.map((content, index) => (
                          <div key={index}>・{content}</div>
                        ))
                      ) : (
                        <div>未設定</div>
                      )}
                    </div>
                  </div>
                  
                  <div>
                    <div className="font-semibold text-gray-700 mb-1">目標達成時期</div>
                    <div className="text-gray-600 bg-gray-50 p-3 rounded font-semibold">
                      {displaySupportPlan.targetDate || '未設定'}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* 週次評価一覧 */}
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-800">📊 今月の評価(週次)</h2>
                <div className="flex gap-2">
                  <button
                    onClick={() => toggleAllWeekly(true)}
                    className="text-xs px-2 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition-all duration-200"
                  >
                    全て展開
                  </button>
                  <button
                    onClick={() => toggleAllWeekly(false)}
                    className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition-all duration-200"
                  >
                    折りたたむ
                  </button>
                </div>
              </div>

              <div className="space-y-3 max-h-[500px] overflow-y-auto">
                {                  weeklyEvaluations.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    この月の評価(週次)がありません
                  </div>
                ) : (
                  weeklyEvaluations.map((weekly) => (
                    <div key={weekly.id} className="border border-gray-200 rounded-lg overflow-hidden">
                      <button
                        onClick={() => toggleWeekly(weekly.id)}
                        className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-all duration-200 flex items-center justify-between"
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-lg">
                            {expandedWeekly[weekly.id] ? '📂' : '📁'}
                          </span>
                          <div className="text-left">
                            <div className="font-semibold text-gray-800 text-sm">
                              {weekly.period}
                            </div>
                            <div className="text-xs text-gray-500">
                              評価日: {formatDate(weekly.evalDate)} ({weekly.method})
                            </div>
                          </div>
                        </div>
                        <span className="text-gray-400">
                          {expandedWeekly[weekly.id] ? '▼' : '▶'}
                        </span>
                      </button>
                      
                      {expandedWeekly[weekly.id] && (
                        <div className="p-4 bg-white space-y-3 text-sm">
                          <div>
                            <div className="font-semibold text-gray-700 mb-1">評価内容</div>
                            <div className="text-gray-600 whitespace-pre-line bg-gray-50 p-2 rounded">
                              {weekly.content}
                            </div>
                          </div>
                          
                          <div className="text-xs text-gray-500 border-t pt-2">
                            記録者: {weekly.recorder}
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 右側：達成度評価フォーム */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-800">📝 達成度評価フォーム</h2>
                <button
                  onClick={generateEvaluationWithAI}
                  disabled={isGenerating || !studentId}
                  className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 flex items-center gap-2 ${
                    isGenerating || !studentId
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-gradient-to-r from-purple-500 to-pink-500 text-white hover:from-purple-600 hover:to-pink-600 shadow-lg hover:shadow-xl'
                  }`}
                >
                  {isGenerating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {generatingField ? `${generatingField}を生成中...` : '生成中...'}
                    </>
                  ) : (
                    <>
                      ✨ 計画と実績を照らして評価案を生成
                    </>
                  )}
                </button>
              </div>

              <div className="space-y-6">
                {/* 実施時間 */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">実施時間（開始）</label>
                    <input
                      type="time"
                      value={evaluationData.startTime}
                      onChange={(e) => updateEvaluation('startTime', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">実施時間（終了）</label>
                    <input
                      type="time"
                      value={evaluationData.endTime}
                      onChange={(e) => updateEvaluation('endTime', e.target.value)}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* 実施方法 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    実施方法 <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-4">
                    {['通所', '訪問', 'その他'].map(method => (
                      <label key={method} className="flex items-center">
                        <input
                          type="radio"
                          name="method"
                          value={method}
                          checked={evaluationData.method === method}
                          onChange={(e) => updateEvaluation('method', e.target.value)}
                          className="mr-2 text-purple-600 focus:ring-purple-500"
                        />
                        {method}
                      </label>
                    ))}
                  </div>
                  {evaluationData.method === 'その他' && (
                    <input
                      type="text"
                      value={evaluationData.methodOther}
                      onChange={(e) => updateEvaluation('methodOther', e.target.value)}
                      placeholder="実施方法の詳細を入力"
                      className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  )}
                </div>

                {/* 訓練目標 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    訓練目標 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 在宅就労による支援効果を達成するために掲げた、当該月の具体的な目標を記載</p>
                  <textarea
                    value={evaluationData.trainingGoal}
                    onChange={(e) => updateEvaluation('trainingGoal', e.target.value)}
                    rows={3}
                    placeholder="個別支援計画の短期目標に基づいた、今月の具体的な目標を記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 取組内容 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    取組内容 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 上記目標を達成するために行った、作業内容や支援内容を記載</p>
                  <textarea
                    value={evaluationData.workContent}
                    onChange={(e) => updateEvaluation('workContent', e.target.value)}
                    rows={4}
                    placeholder="週次評価を参考に、今月行った具体的な作業内容や支援内容を記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 訓練目標に対する達成度 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    訓練目標に対する達成度 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 上記目標に対し、達成できたこと、できなかったことを具体的に記載</p>
                  <textarea
                    value={evaluationData.achievement}
                    onChange={(e) => updateEvaluation('achievement', e.target.value)}
                    rows={4}
                    placeholder="訓練目標に対する達成度を具体的に記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 課題 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    課題 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 達成できなかった内容を分析し、課題を抽出</p>
                  <textarea
                    value={evaluationData.issues}
                    onChange={(e) => updateEvaluation('issues', e.target.value)}
                    rows={3}
                    placeholder="達成できなかった内容を分析し、課題を抽出..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 今後における課題の改善方針 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    今後における課題の改善方針 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 上記課題を克服するための、来月以降の目標設定の方向性や作業内容及び支援内容を記載</p>
                  <textarea
                    value={evaluationData.improvementPlan}
                    onChange={(e) => updateEvaluation('improvementPlan', e.target.value)}
                    rows={4}
                    placeholder="課題克服のための来月以降の方針を記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 健康・体調面での留意事項 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    健康・体調面での留意事項 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 在宅就労の継続の妥当性を判断するうえで考慮すべき事項を記載</p>
                  <textarea
                    value={evaluationData.healthNotes}
                    onChange={(e) => updateEvaluation('healthNotes', e.target.value)}
                    rows={3}
                    placeholder="健康・体調面での留意事項を記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* その他特記事項 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    その他特記事項
                  </label>
                  <textarea
                    value={evaluationData.otherNotes}
                    onChange={(e) => updateEvaluation('otherNotes', e.target.value)}
                    rows={3}
                    placeholder="その他、特記すべき事項があれば記載..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 在宅就労継続の妥当性 */}
                <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    在宅就労継続の妥当性 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-2">※ 上記記載事項を総合的に勘案し、今後も在宅就労による支援効果が見込まれるかを慎重に検討し判断</p>
                  <textarea
                    value={evaluationData.continuityValidity}
                    onChange={(e) => updateEvaluation('continuityValidity', e.target.value)}
                    rows={4}
                    placeholder="個別支援計画と実績を照らし合わせて、在宅就労継続の妥当性を判断..."
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none font-mono text-sm"
                  />
                </div>

                {/* 評価実施者 */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    評価実施者 <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      list="evaluator-list"
                      value={evaluationData.evaluator}
                      onChange={(e) => updateEvaluation('evaluator', e.target.value)}
                      placeholder="リストから選択または手入力"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <datalist id="evaluator-list">
                      {instructors.map(instructor => (
                        <option key={instructor.id} value={instructor.name} />
                      ))}
                    </datalist>
                    <div className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-1 text-xs text-gray-500">指導員リストから選択、または直接入力できます</p>
                </div>

                {/* 対象者署名（確認欄） */}
                <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    対象者署名（確認欄）
                  </label>
                  <p className="text-xs text-gray-600 mb-3">上記内容を確認し、評価実施者と共有しました。</p>
                  <input
                    type="text"
                    value={evaluationData.studentSignature}
                    onChange={(e) => updateEvaluation('studentSignature', e.target.value)}
                    placeholder="対象者名を入力してください"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* ボタン - 1:1:1のバランスで配置 */}
              <div className="mt-8 flex gap-4">
                <button
                  onClick={saveLocationAndNavigate}
                  className="flex-1 px-6 py-3 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-all duration-200"
                >
                  キャンセル
                </button>
                <button
                  onClick={handleSave}
                  disabled={isLoading}
                  className={`flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {isLoading ? '💾 保存中...' : '💾 保存'}
                </button>
                <button
                  onClick={handleDownloadExcel}
                  disabled={isLoading}
                  className={`flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 ${
                    isLoading ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  📥 Excelダウンロード
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 印刷モーダル */}
      <MonthlyReportPrintModal
        isOpen={isPrintModalOpen}
        onClose={() => setIsPrintModalOpen(false)}
        evaluationData={evaluationData}
        student={student}
        periodStart={periodStart}
        periodEnd={periodEnd}
      />
    </div>
  );
};

export default MonthlyEvaluationPage;

