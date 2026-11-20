import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import InstructorHeader from '../components/InstructorHeader';
import { apiCall } from '../utils/api';
import { convertTimeToMySQLDateTime, combineDateAndTime, combineDateAndTimeUTC } from '../utils/dateUtils';
import { downloadHomeSupportExcel } from '../utils/homeSupportRecordExcel';

const HomeSupportRecordsPage = () => {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(currentUser);
  
  // 日付をYYYY-MM-DD形式の文字列に変換（ローカルタイムゾーンで）
  const formatDateToLocalString = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 日付範囲の初期値（今月の1日から今日まで）
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  
  const [startDate, setStartDate] = useState(formatDateToLocalString(firstDayOfMonth));
  const [endDate, setEndDate] = useState(formatDateToLocalString(today));
  const [dailyReports, setDailyReports] = useState([]);
  const [weeklyReports, setWeeklyReports] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [excelDownloading, setExcelDownloading] = useState(false);
  const [editingDailyReport, setEditingDailyReport] = useState(null);
  const [editingWeeklyReport, setEditingWeeklyReport] = useState(null);
  const [dailyEditForm, setDailyEditForm] = useState({});
  const [weeklyEditForm, setWeeklyEditForm] = useState({});
  // ページネーション用のstate（フロントエンドで管理）
  const [currentPage, setCurrentPage] = useState(1);
  const [allDailyReports, setAllDailyReports] = useState([]); // 全件の日報
  const [allWeeklyReports, setAllWeeklyReports] = useState([]); // 全件の週報
  const itemsPerPage = 20; // 1ページあたりの件数

  // 拠点情報を復元
  useEffect(() => {
    if (currentUser) {
      const savedSatellite = sessionStorage.getItem('selectedSatellite');
      if (savedSatellite) {
        try {
          const satellite = JSON.parse(savedSatellite);
          setLocalUser({
            ...currentUser,
            satellite_id: satellite.id,
            satellite_name: satellite.name,
            company_id: satellite.company_id,
            company_name: satellite.company_name
          });
        } catch (e) {
          console.error('拠点情報のパースエラー:', e);
          setLocalUser(currentUser);
        }
      } else {
        setLocalUser(currentUser);
      }
    }
  }, [currentUser]);

  // 拠点変更ハンドラー
  const handleLocationChange = (newLocation) => {
    console.log('拠点情報が変更されました:', newLocation);
    
    // 拠点情報をsessionStorageに保存
    sessionStorage.setItem('selectedSatellite', JSON.stringify(newLocation));
    
    // ユーザー情報を更新
    const updatedUser = {
      ...localUser,
      satellite_id: newLocation.id,
      satellite_name: newLocation.name,
      company_id: newLocation.company_id,
      company_name: newLocation.company_name
    };
    
    setLocalUser(updatedUser);
    
    // 拠点切り替えイベントを発火
    window.dispatchEvent(new CustomEvent('satelliteChanged', {
      detail: { satellite: newLocation }
    }));
  };

  // 利用者情報を取得
  useEffect(() => {
    const fetchUser = async () => {
      if (!userId) return;
      
      try {
        console.log('利用者情報を取得中: ユーザーID', userId);
        const response = await apiCall(`/api/users/${userId}`, { method: 'GET' });
        console.log('利用者情報取得レスポンス:', response);
        
        if (response.success && response.data) {
          setUser(response.data);
          console.log('利用者情報を設定しました:', response.data);
        } else {
          console.error('利用者情報の取得に失敗しました:', response);
          // エラーメッセージをより詳細に表示
          alert('利用者情報の取得に失敗しました: ' + (response.message || 'エラーが発生しました'));
        }
      } catch (error) {
        console.error('利用者情報取得エラー:', error);
        // エラーのステータスコードに応じて詳細なメッセージを表示
        if (error.status === 403) {
          alert('この利用者情報へのアクセス権限がありません。\n同じ拠点に所属しているか、担当指導員である必要があります。');
        } else if (error.status === 404) {
          alert('利用者が見つかりません。');
        } else {
          alert('利用者情報の取得中にエラーが発生しました: ' + (error.message || '不明なエラー'));
        }
      }
    };

    fetchUser();
  }, [userId]);

  // 記録を検索（全件取得）
  const searchRecords = async () => {
    if (!userId) return;
    
    setLoading(true);
    try {
      // デバッグ: リクエストパラメータを確認
      console.log('🔍 日報取得リクエスト:', {
        userId,
        userIdType: typeof userId,
        startDate,
        endDate,
        url: `/api/remote-support/daily-reports?userId=${userId}&startDate=${startDate}&endDate=${endDate}&limit=0`
      });
      
      // 日報を全件取得（limit=0で全件取得を指定）
      const dailyResponse = await apiCall(
        `/api/remote-support/daily-reports?userId=${userId}&startDate=${startDate}&endDate=${endDate}&limit=0`,
        { method: 'GET' }
      );
      
      console.log('📥 日報APIレスポンス:', {
        success: dailyResponse.success,
        hasData: !!dailyResponse.data,
        reportsCount: dailyResponse.data?.reports?.length || 0
      });
      
      if (dailyResponse.success && dailyResponse.data) {
        const reports = dailyResponse.data.reports || [];
        console.log('日報取得成功:', {
          count: reports.length,
          startDate,
          endDate,
          userId,
          reports: reports.map(r => ({ id: r.id, date: r.date, user_id: r.user_id }))
        });
        // ID: 7と8が含まれているか確認
        const targetIds = [7, 8];
        const foundTargets = reports.filter(r => targetIds.includes(r.id));
        if (foundTargets.length > 0) {
          console.log('✅ 対象レコード（ID: 7, 8）が見つかりました:', foundTargets.map(r => ({ id: r.id, date: r.date, user_id: r.user_id })));
        } else {
          console.warn('⚠️ 対象レコード（ID: 7, 8）が見つかりませんでした');
        }
        setAllDailyReports(reports);
      } else {
        console.error('日報取得エラー:', dailyResponse.message);
        setAllDailyReports([]);
      }

      // 週次評価を全件取得
      const weeklyResponse = await apiCall(
        `/api/weekly-evaluations/user/${userId}?periodStart=${startDate}&periodEnd=${endDate}`,
        { method: 'GET' }
      );
      
      if (weeklyResponse.success && weeklyResponse.data) {
        const weeklyReports = weeklyResponse.data || [];
        console.log('週報取得成功:', {
          count: weeklyReports.length,
          startDate,
          endDate,
          userId,
          reports: weeklyReports.map(r => ({ id: r.id, date: r.date, user_id: r.user_id }))
        });
        setAllWeeklyReports(weeklyReports);
      } else {
        console.error('週次評価取得エラー:', weeklyResponse.message);
        setAllWeeklyReports([]);
      }
    } catch (error) {
      console.error('記録取得エラー:', error);
      alert('記録の取得に失敗しました: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (userId && startDate && endDate) {
      setCurrentPage(1); // 日付範囲が変更されたら1ページ目に戻す
      searchRecords();
    }
  }, [userId, startDate, endDate]);

  // ページ変更ハンドラー
  const handlePageChange = (newPage) => {
    setCurrentPage(newPage);
    // ページトップにスクロール
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // 日報の編集を開始
  const startEditDailyReport = (report) => {
    setEditingDailyReport(report.id);
    
    // 時間フィールドをHH:MM形式に変換
    const formatTimeForInput = (datetime) => {
      if (!datetime) return '';
      const date = new Date(datetime);
      return date.toTimeString().slice(0, 5);
    };

    // 日報の日付をYYYY-MM-DD形式に変換
    const formatDateForInput = (dateValue) => {
      if (!dateValue) return '';
      const date = new Date(dateValue);
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    // work_result/workResultが存在し、task_content/workContentが空の場合はwork_resultをtask_contentにコピー
    const taskContent = report.task_content || report.workContent || report.work_result || report.workResult || '';
    const workResult = report.work_result || report.workResult || '';
    
    setDailyEditForm({
      temperature: report.temperature || '',
      condition: report.condition || '',
      condition_note: report.condition_note || '',
      work_note: report.work_note || '',
      work_result: workResult,
      daily_report: report.daily_report || report.dailyReport || '',
      support_method: report.support_method || report.supportMethod || '',
      support_method_note: report.support_method_note || report.supportMethodNote || '',
      task_content: taskContent,
      support_content: report.support_content || report.supportContent || '',
      advice: report.advice || '',
      instructor_comment: report.instructor_comment || report.instructorComment || '',
      recorder_name: report.recorder_name || report.recorderName || '',
      report_date: formatDateForInput(report.date), // 日報の日付を保存
      mark_start: formatTimeForInput(report.mark_start),
      mark_lunch_start: formatTimeForInput(report.mark_lunch_start),
      mark_lunch_end: formatTimeForInput(report.mark_lunch_end),
      mark_end: formatTimeForInput(report.mark_end)
    });
  };

  // 週報の編集を開始
  const startEditWeeklyReport = (report) => {
    setEditingWeeklyReport(report.id);
    
    // 日付をYYYY-MM-DD形式に変換
    const formatDateForInput = (dateValue) => {
      if (!dateValue) return '';
      try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch (e) {
        console.error('日付変換エラー:', e, dateValue);
        // 既にYYYY-MM-DD形式の場合はそのまま返す
        if (typeof dateValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
          return dateValue;
        }
        return '';
      }
    };
    
    setWeeklyEditForm({
      date: formatDateForInput(report.date),
      prev_eval_date: formatDateForInput(report.prev_eval_date),
      period_start: formatDateForInput(report.period_start),
      period_end: formatDateForInput(report.period_end),
      evaluation_method: report.evaluation_method || '通所',
      method_other: report.method_other || '',
      evaluation_content: report.evaluation_content || '',
      recorder_name: report.recorder_name || '',
      confirm_name: report.confirm_name || ''
    });
  };

  // 日報を保存
  const saveDailyReport = async (reportId) => {
    try {
      const normalizedForm = { ...dailyEditForm };
      
      // 日報の日付を取得（report_dateがなければdailyReportsから検索）
      let reportDate = normalizedForm.report_date;
      if (!reportDate) {
        const report = dailyReports.find(r => r.id === reportId);
        if (report && report.date) {
          const date = new Date(report.date);
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          reportDate = `${year}-${month}-${day}`;
        }
      }
      
      // 時間フィールドをMySQL形式に変換（日報の日付を使用、UTCに変換）
      if (normalizedForm.mark_start && normalizedForm.mark_start.trim() !== '') {
        if (reportDate) {
          normalizedForm.mark_start = combineDateAndTimeUTC(reportDate, normalizedForm.mark_start);
        } else {
          // フォールバック: 今日の日付を使用
          const today = new Date().toISOString().split('T')[0];
          normalizedForm.mark_start = combineDateAndTimeUTC(today, normalizedForm.mark_start);
        }
      } else {
        normalizedForm.mark_start = null;
      }
      
      if (normalizedForm.mark_lunch_start && normalizedForm.mark_lunch_start.trim() !== '') {
        if (reportDate) {
          normalizedForm.mark_lunch_start = combineDateAndTimeUTC(reportDate, normalizedForm.mark_lunch_start);
        } else {
          const today = new Date().toISOString().split('T')[0];
          normalizedForm.mark_lunch_start = combineDateAndTimeUTC(today, normalizedForm.mark_lunch_start);
        }
      } else {
        normalizedForm.mark_lunch_start = null;
      }
      
      if (normalizedForm.mark_lunch_end && normalizedForm.mark_lunch_end.trim() !== '') {
        if (reportDate) {
          normalizedForm.mark_lunch_end = combineDateAndTimeUTC(reportDate, normalizedForm.mark_lunch_end);
        } else {
          const today = new Date().toISOString().split('T')[0];
          normalizedForm.mark_lunch_end = combineDateAndTimeUTC(today, normalizedForm.mark_lunch_end);
        }
      } else {
        normalizedForm.mark_lunch_end = null;
      }
      
      if (normalizedForm.mark_end && normalizedForm.mark_end.trim() !== '') {
        if (reportDate) {
          normalizedForm.mark_end = combineDateAndTimeUTC(reportDate, normalizedForm.mark_end);
        } else {
          const today = new Date().toISOString().split('T')[0];
          normalizedForm.mark_end = combineDateAndTimeUTC(today, normalizedForm.mark_end);
        }
      } else {
        normalizedForm.mark_end = null;
      }
      
      // report_dateは送信しない（バックエンドで使用しない）
      delete normalizedForm.report_date;

      if (Object.prototype.hasOwnProperty.call(normalizedForm, 'instructor_comment')) {
        const commentValue = normalizedForm.instructor_comment;
        if (commentValue === null) {
          normalizedForm.instructor_comment = null;
        } else if (commentValue === undefined || commentValue === '') {
          normalizedForm.instructor_comment = '';
        } else if (typeof commentValue === 'object') {
          try {
            normalizedForm.instructor_comment = JSON.stringify(commentValue);
          } catch (error) {
            console.error('instructor_commentのJSON変換に失敗しました:', error);
            normalizedForm.instructor_comment = '';
          }
        } else {
          normalizedForm.instructor_comment = String(commentValue);
        }
      }

      const response = await apiCall(`/api/remote-support/daily-reports/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify(normalizedForm)
      });

      if (response.success) {
        alert('日報を更新しました。');
        setEditingDailyReport(null);
        searchRecords(); // 再読み込み
      } else {
        alert('更新に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('日報更新エラー:', error);
      alert('更新中にエラーが発生しました: ' + error.message);
    }
  };

  // 週報を保存
  const saveWeeklyReport = async (reportId) => {
    try {
      const backendData = {
        date: weeklyEditForm.date,
        prev_eval_date: weeklyEditForm.prev_eval_date || null,
        period_start: weeklyEditForm.period_start || null,
        period_end: weeklyEditForm.period_end || null,
        evaluation_method: weeklyEditForm.evaluation_method === 'その他' ? 'その他' : weeklyEditForm.evaluation_method,
        method_other: weeklyEditForm.evaluation_method === 'その他' ? weeklyEditForm.method_other : null,
        evaluation_content: weeklyEditForm.evaluation_content,
        recorder_name: weeklyEditForm.recorder_name,
        confirm_name: weeklyEditForm.confirm_name || null
      };

      const response = await apiCall(`/api/weekly-evaluations/${reportId}`, {
        method: 'PUT',
        body: JSON.stringify(backendData)
      });

      if (response.success) {
        alert('週次評価を更新しました。');
        setEditingWeeklyReport(null);
        searchRecords(); // 再読み込み
      } else {
        alert('更新に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('週次評価更新エラー:', error);
      alert('更新中にエラーが発生しました: ' + error.message);
    }
  };

  // 日報を削除
  const deleteDailyReport = async (reportId) => {
    if (!reportId) {
      alert('削除する日報が特定できません。');
      return;
    }

    const confirmMessage = 'この日次支援記録を削除しますか？\nこの操作は取り消せません。';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await apiCall(`/api/remote-support/daily-reports/${reportId}`, {
        method: 'DELETE'
      });

      if (response.success) {
        if (editingDailyReport === reportId || editingWeeklyReport === reportId) {
          cancelEdit();
        }
        alert('日次支援記録を削除しました。');
        await searchRecords();
      } else {
        alert('削除に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('日報削除エラー:', error);
      alert('削除中にエラーが発生しました: ' + error.message);
    }
  };

  // 週報を削除
  const deleteWeeklyReport = async (reportId) => {
    if (!reportId) {
      alert('削除する週次評価が特定できません。');
      return;
    }

    const confirmMessage = 'この週次評価を削除しますか？\nこの操作は取り消せません。';
    if (!window.confirm(confirmMessage)) {
      return;
    }

    try {
      const response = await apiCall(`/api/weekly-evaluations/${reportId}`, {
        method: 'DELETE'
      });

      if (response.success) {
        if (editingWeeklyReport === reportId || editingDailyReport === reportId) {
          cancelEdit();
        }
        alert('週次評価を削除しました。');
        await searchRecords();
      } else {
        alert('削除に失敗しました: ' + (response.message || 'エラーが発生しました'));
      }
    } catch (error) {
      console.error('週報削除エラー:', error);
      alert('削除中にエラーが発生しました: ' + error.message);
    }
  };

  // 編集をキャンセル
  const cancelEdit = () => {
    setEditingDailyReport(null);
    setEditingWeeklyReport(null);
    setDailyEditForm({});
    setWeeklyEditForm({});
  };

  const handleDownloadExcel = async () => {
    if (!user) {
      alert('利用者情報が取得できません。');
      return;
    }

    if (allRecords.length === 0) {
      alert('ダウンロードする記録がありません。');
      return;
    }

    setExcelDownloading(true);
    try {
      await downloadHomeSupportExcel({
        user,
        records: allRecords,
        fileName: `在宅支援記録_${user.name}_${startDate}_${endDate}.xlsx`,
      });
      alert('Excelファイルのダウンロードが完了しました。');
    } catch (error) {
      console.error('Excelダウンロードエラー:', error);
      alert('Excelファイルのダウンロードに失敗しました: ' + error.message);
    } finally {
      setExcelDownloading(false);
    }
  };
  if (!user && !loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-xl text-gray-600">利用者が見つかりません</p>
          <button
            onClick={() => navigate('/instructor/home-support')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            在宅支援ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  // 記録を日付順にソート（日報と週報を統合）
  // 評価日を基準にソート（昇順：古い日付から新しい日付へ）
  // 評価日が同じ場合、週報を日報より前に配置（評価日が10/30なら、10/31の日報の前に来る）
  const allRecords = [
    ...allDailyReports.map(r => {
      const sortDate = new Date(r.date);
      // デバッグ: 日付パース結果を確認
      if (r.id === 7 || r.id === 8) {
        console.log('日報レコード日付パース:', {
          id: r.id,
          user_id: r.user_id,
          originalDate: r.date,
          dateType: typeof r.date,
          sortDate: sortDate,
          sortDateISO: sortDate.toISOString(),
          sortDateLocal: sortDate.toLocaleDateString('ja-JP'),
          isValid: !isNaN(sortDate.getTime())
        });
      }
      return { ...r, type: 'daily', sortDate };
    }),
    ...allWeeklyReports.map(r => {
      const dateStr = r.date || r.period_end || r.created_at;
      const sortDate = new Date(dateStr);
      return { 
        ...r, 
        type: 'weekly', 
        // 評価日（date）を基準にソート
        sortDate
      };
    })
  ].filter(r => {
    // 無効な日付のレコードを除外
    const isValid = !isNaN(r.sortDate.getTime());
    if (!isValid) {
      console.warn('無効な日付のレコードを除外:', { id: r.id, type: r.type, date: r.date });
    }
    if (r.id === 7 || r.id === 8) {
      console.log('フィルタ後のレコード:', {
        id: r.id,
        type: r.type,
        date: r.date,
        sortDate: r.sortDate,
        isValid
      });
    }
    return isValid;
  }).sort((a, b) => {
    // 日付を比較（昇順：古い日付から新しい日付へ）
    const dateDiff = a.sortDate.getTime() - b.sortDate.getTime();
    
    // 日付が同じ場合、週報を日報より前に配置（評価日が同じなら週報が前）
    if (dateDiff === 0) {
      if (a.type === 'weekly' && b.type === 'daily') return -1; // 週報が前
      if (a.type === 'daily' && b.type === 'weekly') return 1;  // 日報が後
    }
    
    return dateDiff;
  });

  // ページネーション計算
  const totalRecords = allRecords.length;
  const totalPages = Math.ceil(totalRecords / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedRecords = allRecords.slice(startIndex, endIndex);
  
  // デバッグ: 全レコードの日付を確認
  if (allDailyReports.length > 0 || allWeeklyReports.length > 0) {
    const targetIds = [7, 8];
    const foundInAllRecords = allRecords.filter(r => targetIds.includes(r.id));
    console.log('allRecords計算結果:', {
      totalRecords,
      totalPages,
      currentPage,
      startIndex,
      endIndex,
      allDailyReportsCount: allDailyReports.length,
      allWeeklyReportsCount: allWeeklyReports.length,
      allRecordsDates: allRecords.map(r => ({ id: r.id, type: r.type, date: r.date, sortDate: r.sortDate.toISOString().split('T')[0] })),
      targetRecordsInAllRecords: foundInAllRecords.length > 0 ? foundInAllRecords.map(r => ({ id: r.id, date: r.date, sortDate: r.sortDate.toISOString().split('T')[0] })) : '見つかりませんでした'
    });
    if (foundInAllRecords.length === 0) {
      console.warn('⚠️ allRecordsにID: 7, 8が含まれていません');
      // allDailyReportsに含まれているか確認
      const foundInDaily = allDailyReports.filter(r => targetIds.includes(r.id));
      console.log('allDailyReports内の確認:', foundInDaily.length > 0 ? foundInDaily.map(r => ({ id: r.id, date: r.date })) : '見つかりませんでした');
    }
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {/* 印刷時は非表示 */}
      <div className="print:hidden">
        <InstructorHeader
          user={localUser || currentUser}
          onLocationChange={handleLocationChange}
        />
      </div>

      <div className="flex-1 p-8">
        {/* 検索・印刷エリア（印刷時は非表示） */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 print:hidden">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-800 mb-2">🔍 在宅支援記録確認</h1>
            <p className="text-lg text-gray-600">日次支援記録と週次評価を統合して確認・編集できます</p>
          </div>

          {/* 利用者情報 */}
          {user && (
            <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-6 border border-indigo-200">
              <div className="flex items-center gap-4">
                <div className="bg-white rounded-full w-12 h-12 flex items-center justify-center shadow-md">
                  <span className="text-2xl">👤</span>
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-800">{user.name}</h2>
                  <p className="text-sm text-gray-600">
                    受給者証番号: {user.recipient_number || ''}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 日付範囲選択 */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">開始日</label>
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">終了日</label>
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div className="flex items-end justify-end">
              <button 
                onClick={handleDownloadExcel}
                disabled={loading || excelDownloading}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                {excelDownloading ? '⏳ データ処理中...' : '📥 Excelダウンロード'}
              </button>
            </div>
          </div>

          {/* クイック日付選択 */}
          <div className="flex gap-2">
            <button
              onClick={() => {
                const today = new Date();
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                setStartDate(formatDateToLocalString(weekAgo));
                setEndDate(formatDateToLocalString(today));
              }}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              過去1週間
            </button>
            <button
              onClick={() => {
                const today = new Date();
                const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
                setStartDate(formatDateToLocalString(firstDay));
                setEndDate(formatDateToLocalString(today));
              }}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              今月
            </button>
            <button
              onClick={() => {
                const today = new Date();
                const lastMonthStart = new Date(today.getFullYear(), today.getMonth() - 1, 1);
                const lastMonthEnd = new Date(today.getFullYear(), today.getMonth(), 0);
                setStartDate(formatDateToLocalString(lastMonthStart));
                setEndDate(formatDateToLocalString(lastMonthEnd));
              }}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              先月
            </button>
          </div>
        </div>

        {/* 印刷用ヘッダー（画面上は非表示） */}
        {user && (
          <div className="hidden print:block mb-6">
            <div className="text-center mb-4">
              <h1 className="text-2xl font-bold text-gray-800">在宅における就労支援記録</h1>
              <p className="text-sm text-gray-600 mt-2">
                期間: {new Date(startDate).toLocaleDateString('ja-JP')} ～ {new Date(endDate).toLocaleDateString('ja-JP')}
              </p>
            </div>
            <div className="border-2 border-gray-800 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="font-semibold">利用者名:</span> {user.name}
                </div>
                <div>
                  <span className="font-semibold">受給者証番号:</span> {user.recipient_number || ''}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 記録一覧 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 print:shadow-none print:rounded-none">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-gray-300 border-t-indigo-600"></div>
              <p className="mt-4 text-gray-600">記録を読み込んでいます...</p>
            </div>
          ) : allRecords.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-xl text-gray-600">記録が見つかりません</p>
              <p className="text-sm text-gray-500 mt-2">期間を変更して再度検索してください</p>
            </div>
          ) : (
            <div className="space-y-6">
              {paginatedRecords.map((record) => (
                <div 
                  key={`${record.type}-${record.id}`} 
                  className="border-2 border-gray-300 rounded-lg p-6 print:break-inside-avoid print:page-break-inside-avoid"
                >
                  {record.type === 'daily' ? (
                    // 日次支援記録
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-gray-300">
                        <div className="flex items-center gap-3">
                          <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-semibold">
                            📝 日次支援記録
                          </span>
                          <span className="text-lg font-bold text-gray-800">
                            {new Date(record.date).toLocaleDateString('ja-JP', {
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric',
                              weekday: 'short'
                            })}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">記録者: {record.recorder_name || '-'}</span>
                          {editingDailyReport === record.id ? (
                            <>
                              <button
                                onClick={() => saveDailyReport(record.id)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                              >
                                保存
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                              >
                                キャンセル
                              </button>
                            </>
                          ) : (
                          <>
                            <button
                              onClick={() => startEditDailyReport(record)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 print:hidden"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => deleteDailyReport(record.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 print:hidden"
                            >
                              削除
                            </button>
                          </>
                          )}
                        </div>
                      </div>

                      {editingDailyReport === record.id ? (
                        // 編集モード
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">開始時間</label>
                              <input
                                type="time"
                                value={dailyEditForm.mark_start || ''}
                                onChange={(e) => setDailyEditForm({ ...dailyEditForm, mark_start: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">終了時間</label>
                              <input
                                type="time"
                                value={dailyEditForm.mark_end || ''}
                                onChange={(e) => setDailyEditForm({ ...dailyEditForm, mark_end: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">支援方法</label>
                            <select
                              value={dailyEditForm.support_method || ''}
                              onChange={(e) => setDailyEditForm({ ...dailyEditForm, support_method: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            >
                              <option value="">選択してください</option>
                              <option value="訪問">訪問</option>
                              <option value="電話">電話</option>
                              <option value="その他">その他</option>
                            </select>
                            {dailyEditForm.support_method === 'その他' && (
                              <input
                                type="text"
                                value={dailyEditForm.support_method_note || ''}
                                onChange={(e) => setDailyEditForm({ ...dailyEditForm, support_method_note: e.target.value })}
                                placeholder="支援方法を入力"
                                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            )}
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">作業・訓練内容</label>
                            <textarea
                              value={dailyEditForm.task_content || ''}
                              onChange={(e) => setDailyEditForm({ ...dailyEditForm, task_content: e.target.value })}
                              rows="4"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">支援内容</label>
                            <textarea
                              value={dailyEditForm.support_content || ''}
                              onChange={(e) => setDailyEditForm({ ...dailyEditForm, support_content: e.target.value })}
                              rows="6"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">健康状態・助言</label>
                            <textarea
                              value={dailyEditForm.advice || ''}
                              onChange={(e) => setDailyEditForm({ ...dailyEditForm, advice: e.target.value })}
                              rows="4"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">記録者</label>
                            <input
                              type="text"
                              value={dailyEditForm.recorder_name || ''}
                              onChange={(e) => setDailyEditForm({ ...dailyEditForm, recorder_name: e.target.value })}
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              placeholder="記録者名を入力"
                            />
                          </div>
                        </div>
                      ) : (
                        // 表示モード
                        <>
                          {/* 基本情報 */}
                          <div className="mb-4 bg-blue-50 rounded-lg p-3 border border-blue-200">
                            <div className="grid grid-cols-3 gap-3 text-sm">
                              <div>
                                <span className="text-gray-600">実施時間:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.mark_start 
                                    ? `${new Date(record.mark_start).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })} 〜 ${record.mark_end ? new Date(record.mark_end).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' }) : '-'}`
                                    : '-'
                                  }
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">支援方法:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.support_method || '-'}
                                  {record.support_method === 'その他' && record.support_method_note && ` (${record.support_method_note})`}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">対応者:</span>
                                <span className="ml-2 font-semibold text-gray-800">{record.recorder_name || '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded text-sm">作業・訓練内容</span>
                              </h4>
                              <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-700">
                                {record.task_content || record.workContent || record.work_result || record.workResult || '-'}
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded text-sm">支援内容（1日2回以上）</span>
                              </h4>
                              <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-700">
                                {record.support_content || '-'}
                              </div>
                            </div>

                            <div>
                              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-sm">対象者の心身の状況及びそれに対する助言の内容</span>
                              </h4>
                              <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-700">
                                {record.advice || '-'}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    // 週次評価
                    <div>
                      <div className="flex items-center justify-between mb-4 pb-3 border-b-2 border-gray-300">
                        <div className="flex items-center gap-3">
                          <span className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-semibold">
                            📊 週次評価
                          </span>
                          <span className="text-lg font-bold text-gray-800">
                            {record.period_start && record.period_end
                              ? `${new Date(record.period_start).toLocaleDateString('ja-JP')} 〜 ${new Date(record.period_end).toLocaleDateString('ja-JP')}`
                              : new Date(record.date).toLocaleDateString('ja-JP')
                            }
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-gray-600">記録者: {record.recorder_name || '-'}</span>
                          {editingWeeklyReport === record.id ? (
                            <>
                              <button
                                onClick={() => saveWeeklyReport(record.id)}
                                className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700"
                              >
                                保存
                              </button>
                              <button
                                onClick={cancelEdit}
                                className="px-3 py-1 bg-gray-400 text-white rounded text-sm hover:bg-gray-500"
                              >
                                キャンセル
                              </button>
                            </>
                          ) : (
                          <>
                            <button
                              onClick={() => startEditWeeklyReport(record)}
                              className="px-3 py-1 bg-indigo-600 text-white rounded text-sm hover:bg-indigo-700 print:hidden"
                            >
                              編集
                            </button>
                            <button
                              onClick={() => deleteWeeklyReport(record.id)}
                              className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-700 print:hidden"
                            >
                              削除
                            </button>
                          </>
                          )}
                        </div>
                      </div>

                      {editingWeeklyReport === record.id ? (
                        // 編集モード
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">評価日</label>
                              <input
                                type="date"
                                value={weeklyEditForm.date || ''}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, date: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">期間（開始）</label>
                              <input
                                type="date"
                                value={weeklyEditForm.period_start || ''}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, period_start: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">期間（終了）</label>
                              <input
                                type="date"
                                value={weeklyEditForm.period_end || ''}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, period_end: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">評価方法</label>
                              <select
                                value={weeklyEditForm.evaluation_method || '通所'}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, evaluation_method: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              >
                                <option value="通所">通所</option>
                                <option value="訪問">訪問</option>
                                <option value="その他">その他</option>
                              </select>
                              {weeklyEditForm.evaluation_method === 'その他' && (
                                <input
                                  type="text"
                                  value={weeklyEditForm.method_other || ''}
                                  onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, method_other: e.target.value })}
                                  placeholder="評価方法を入力"
                                  className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg"
                                />
                              )}
                            </div>
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">評価内容</label>
                            <textarea
                              value={weeklyEditForm.evaluation_content || ''}
                              onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, evaluation_content: e.target.value })}
                              rows="8"
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                            />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">記録者</label>
                              <input
                                type="text"
                                value={weeklyEditForm.recorder_name || ''}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, recorder_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-gray-700 mb-1">確認者</label>
                              <input
                                type="text"
                                value={weeklyEditForm.confirm_name || ''}
                                onChange={(e) => setWeeklyEditForm({ ...weeklyEditForm, confirm_name: e.target.value })}
                                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                              />
                            </div>
                          </div>
                        </div>
                      ) : (
                        // 表示モード
                        <>
                          {/* 基本情報 */}
                          <div className="mb-4 bg-blue-50 rounded-lg p-3 border border-blue-200">
                            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                              <div>
                                <span className="text-gray-600">評価日:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.date ? new Date(record.date).toLocaleDateString('ja-JP') : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">期間（開始）:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.period_start ? new Date(record.period_start).toLocaleDateString('ja-JP') : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">期間（終了）:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.period_end ? new Date(record.period_end).toLocaleDateString('ja-JP') : '-'}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">実施方法:</span>
                                <span className="ml-2 font-semibold text-gray-800">
                                  {record.evaluation_method || '-'}
                                  {record.evaluation_method === 'その他' && record.method_other && ` (${record.method_other})`}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">記録者:</span>
                                <span className="ml-2 font-semibold text-gray-800">{record.recorder_name || '-'}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">確認者:</span>
                                <span className="ml-2 font-semibold text-gray-800">{record.confirm_name || '-'}</span>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-4">
                            <div>
                              <h4 className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-sm">評価内容</span>
                              </h4>
                              <div className="bg-gray-50 rounded-lg p-3 whitespace-pre-wrap text-sm text-gray-700">
                                {record.evaluation_content || '-'}
                              </div>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* ページネーション */}
          {!loading && totalRecords > 0 && (
            <div className="mt-6 flex items-center justify-center gap-2 print:hidden">
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg font-medium ${
                  currentPage === 1
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                前へ
              </button>
              
              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter(page => {
                    // 現在のページ周辺と最初・最後のページを表示
                    return (
                      page === 1 ||
                      page === totalPages ||
                      (page >= currentPage - 2 && page <= currentPage + 2)
                    );
                  })
                  .map((page, index, array) => {
                    // 前のページとの間に「...」を挿入
                    const prevPage = array[index - 1];
                    const showEllipsis = prevPage && page - prevPage > 1;
                    
                    return (
                      <React.Fragment key={page}>
                        {showEllipsis && (
                          <span className="px-2 text-gray-500">...</span>
                        )}
                        <button
                          onClick={() => handlePageChange(page)}
                          className={`px-4 py-2 rounded-lg font-medium ${
                            currentPage === page
                              ? 'bg-indigo-600 text-white'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                          }`}
                        >
                          {page}
                        </button>
                      </React.Fragment>
                    );
                  })}
              </div>
              
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg font-medium ${
                  currentPage === totalPages
                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700'
                }`}
              >
                次へ
              </button>
              
              <span className="ml-4 text-sm text-gray-600">
                {totalRecords}件中 {startIndex + 1}〜{Math.min(endIndex, totalRecords)}件を表示
              </span>
            </div>
          )}
        </div>

        {/* 印刷時のフッター */}
        <div className="hidden print:block mt-6 text-center text-sm text-gray-600">
          <p>発行日: {new Date().toLocaleDateString('ja-JP')}</p>
        </div>
      </div>
    </div>
  );
};

export default HomeSupportRecordsPage;
