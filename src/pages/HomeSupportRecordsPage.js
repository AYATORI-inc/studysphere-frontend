import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import InstructorHeader from '../components/InstructorHeader';
import { apiCall } from '../utils/api';
import { convertTimeToMySQLDateTime, combineDateAndTime, combineDateAndTimeUTC } from '../utils/dateUtils';
import ExcelJS from 'exceljs';

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

  // Excelダウンロード処理（指定期間内の全件をダウンロード）
  const handleDownloadExcel = async () => {
    if (!user) {
      alert('利用者情報が取得できません。');
      return;
    }

    // allRecordsは指定期間（startDate〜endDate）内の日報と週報の全件を含む
    if (allRecords.length === 0) {
      alert('ダウンロードする記録がありません。');
      return;
    }

    // ダウンロード処理開始
    setExcelDownloading(true);

    try {
      // 新しいワークブックを作成
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('在宅支援記録');

      // テンプレートファイルを読み込む
      const titleTemplatePath = '/doc/reports/title_template.xlsx';
      const dailyTemplatePath = '/doc/reports/daily_report_template.xlsx';
      const weeklyTemplatePath = '/doc/reports/weekly_report_template.xlsx';

      // タイトルテンプレートを読み込む
      const titleResponse = await fetch(titleTemplatePath);
      if (!titleResponse.ok) {
        throw new Error('タイトルテンプレートファイルの読み込みに失敗しました');
      }
      const titleWorkbook = new ExcelJS.Workbook();
      await titleWorkbook.xlsx.load(await titleResponse.arrayBuffer());
      const titleSheet = titleWorkbook.getWorksheet(1) || titleWorkbook.worksheets[0];

      // 日次支援記録テンプレートを読み込む
      const dailyResponse = await fetch(dailyTemplatePath);
      if (!dailyResponse.ok) {
        throw new Error('日次支援記録テンプレートファイルの読み込みに失敗しました');
      }
      const dailyWorkbook = new ExcelJS.Workbook();
      await dailyWorkbook.xlsx.load(await dailyResponse.arrayBuffer());
      const dailySheet = dailyWorkbook.getWorksheet(1) || dailyWorkbook.worksheets[0];

      // 週次評価テンプレートを読み込む
      const weeklyResponse = await fetch(weeklyTemplatePath);
      if (!weeklyResponse.ok) {
        throw new Error('週次評価テンプレートファイルの読み込みに失敗しました');
      }
      const weeklyWorkbook = new ExcelJS.Workbook();
      await weeklyWorkbook.xlsx.load(await weeklyResponse.arrayBuffer());
      const weeklySheet = weeklyWorkbook.getWorksheet(1) || weeklyWorkbook.worksheets[0];

      // 列幅をコピーする関数
      const copyColumnWidths = (sourceSheet, targetSheet) => {
        try {
          // ソースシートの全列を走査して列幅をコピー
          // columnCountが利用できない場合は、実際に使用されている列を走査
          const maxCols = sourceSheet.columnCount || 100; // デフォルトで100列までチェック
          
          for (let col = 1; col <= maxCols; col++) {
            try {
              const sourceColumn = sourceSheet.getColumn(col);
              if (sourceColumn && sourceColumn.width) {
                const targetColumn = targetSheet.getColumn(col);
                targetColumn.width = sourceColumn.width;
              }
            } catch (e) {
              // 列が存在しない場合はスキップ
              break;
            }
          }
        } catch (e) {
          console.warn(`列幅のコピーに失敗: ${e.message}`);
        }
      };

      // 行をコピーする関数（列幅とマージセルも含む）
      const copyRow = (sourceSheet, sourceRowNum, targetSheet, targetRowNum) => {
        const sourceRow = sourceSheet.getRow(sourceRowNum);
        const targetRow = targetSheet.getRow(targetRowNum);

        // 行の高さをコピー
        if (sourceRow.height) {
          targetRow.height = sourceRow.height;
        }

        // セルをコピー
        sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const targetCell = targetRow.getCell(colNumber);
          
          // 値のコピー
          if (cell.value !== null && cell.value !== undefined) {
            if (typeof cell.value === 'object' && cell.value.richText) {
              targetCell.value = { richText: cell.value.richText };
            } else {
              targetCell.value = cell.value;
            }
          }

          // スタイルの完全なコピー（罫線を含む）
          if (cell.style) {
            try {
              // ExcelJSのスタイルオブジェクトを直接コピー
              targetCell.style = JSON.parse(JSON.stringify(cell.style));
            } catch (e) {
              // フォールバック: 個別にコピー
              try {
                if (cell.style.font) targetCell.style.font = cell.style.font;
                if (cell.style.alignment) targetCell.style.alignment = cell.style.alignment;
                if (cell.style.border) targetCell.style.border = cell.style.border;
                if (cell.style.fill) targetCell.style.fill = cell.style.fill;
                if (cell.style.numFmt) targetCell.style.numFmt = cell.style.numFmt;
              } catch (e2) {
                console.warn(`スタイルのコピーに失敗: ${e2.message}`);
              }
            }
          }

          // 数式のコピー
          if (cell.formula) {
            targetCell.formula = cell.formula;
          }

          // コメントのコピー
          if (cell.note) {
            targetCell.note = cell.note;
          }
        });
      };

      // マージセルをコピーする関数（完全なコピー）
      const copyMergedCells = (sourceSheet, sourceStartRow, sourceEndRow, targetSheet, targetStartRow) => {
        try {
          const rowDiff = targetStartRow - sourceStartRow;
          
          // 方法1: worksheet.model.mergesから取得
          const modelMerges = sourceSheet.model?.merges || [];
          
          // 方法2: 各行を走査してマージセル情報を収集
          const collectedMerges = [];
          
          for (let row = sourceStartRow; row <= sourceEndRow; row++) {
            const sourceRow = sourceSheet.getRow(row);
            const seenCells = new Set();
            
            sourceRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellKey = `${row}-${colNumber}`;
              if (seenCells.has(cellKey)) return;
              seenCells.add(cellKey);
              
              try {
                // マージセルの情報を取得
                if (cell.isMerged) {
                  const master = cell.master || cell;
                  
                  // マージ範囲を取得（左上から右下まで）
                  let masterRow = master.row;
                  let masterCol = master.col;
                  
                  // マージ範囲を探す
                  let mergeBottom = masterRow;
                  let mergeRight = masterCol;
                  
                  // マージ範囲を探す（適切な範囲に限定）
                  const maxRows = Math.min(sourceEndRow + 10, sourceSheet.rowCount || sourceEndRow + 10);
                  const maxCols = Math.min(30, sourceSheet.columnCount || 30); // 最大30列まで
                  
                  for (let r = masterRow; r <= maxRows; r++) {
                    let foundInRow = false;
                    for (let c = masterCol; c <= maxCols; c++) {
                      try {
                        const testCell = sourceSheet.getRow(r).getCell(c);
                        if (testCell.isMerged && testCell.master && 
                            testCell.master.address === master.address) {
                          mergeBottom = Math.max(mergeBottom, r);
                          mergeRight = Math.max(mergeRight, c);
                          foundInRow = true;
                        }
                      } catch (e) {
                        break; // この列は範囲外
                      }
                    }
                    if (!foundInRow && r > masterRow) {
                      // この行にマージセルが見つからなければ終了
                      break;
                    }
                  }
                  
                  // マージ範囲を記録（重複を避ける）
                  const mergeKey = `${masterRow}-${masterCol}-${mergeBottom}-${mergeRight}`;
                  if (!collectedMerges.find(m => m.key === mergeKey)) {
                    collectedMerges.push({
                      key: mergeKey,
                      top: masterRow,
                      left: masterCol,
                      bottom: mergeBottom,
                      right: mergeRight
                    });
                  }
                }
              } catch (e) {
                // エラーは無視して続行
              }
            });
          }
          
          // すべてのマージセルを結合
          const allMerges = [];
          
          // model.mergesから取得
          if (modelMerges.length > 0) {
            modelMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = sourceSheet.getCell(parts[0]);
                    const endCell = sourceSheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= sourceStartRow && mergeTop <= sourceEndRow) {
                  allMerges.push({ top: mergeTop, left: mergeLeft, bottom: mergeBottom, right: mergeRight });
                }
              } catch (e) {
                // エラーは無視
              }
            });
          }
          
          // 収集したマージセルを追加
          collectedMerges.forEach(merge => {
            if (merge.top >= sourceStartRow && merge.top <= sourceEndRow) {
              allMerges.push({ top: merge.top, left: merge.left, bottom: merge.bottom, right: merge.right });
            }
          });
          
          // マージセルをコピー
          allMerges.forEach((merge, index) => {
            try {
              const newTop = merge.top + rowDiff;
              const newBottom = merge.bottom + rowDiff;
              const newLeft = merge.left;
              const newRight = merge.right;
              
              // マージセルをコピー
              try {
                targetSheet.mergeCells(newTop, newLeft, newBottom, newRight);
                
                // マージセルの罫線を設定（Y列まで）
                if (newRight >= 25) {
                  const topCell = targetSheet.getCell(newTop, newRight);
                  topCell.style = topCell.style || {};
                  topCell.style.border = topCell.style.border || {};
                  topCell.style.border.right = {
                    style: 'thin',
                    color: { argb: 'FF000000' }
                  };
                }
              } catch (mergeError) {
                // 既にマージされている場合はスキップ
                if (!mergeError.message || !mergeError.message.includes('already merged')) {
                  console.warn(`マージセルのコピーに失敗: ${mergeError.message || mergeError}`, {
                    newTop, newLeft, newBottom, newRight,
                    original: merge
                  });
                }
              }
            } catch (e) {
              console.warn(`マージセルの処理に失敗: ${e.message}`, merge);
            }
          });
        } catch (e) {
          console.warn(`マージセルコピー処理エラー: ${e.message}`);
        }
      };

      // セルの値を更新する関数
      const updateCell = (row, col, value) => {
        const cell = worksheet.getCell(row, col);
        cell.value = value || '';
      };

      // 日付を和暦に変換する関数
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

      // 時間をフォーマットする関数
      const formatTime = (datetimeStr) => {
        if (!datetimeStr) return '';
        const date = new Date(datetimeStr);
        return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', hour12: false });
      };

      // 最初に列幅をコピー（タイトルテンプレートから）
      copyColumnWidths(titleSheet, worksheet);

      let currentRow = 1;
      let reportCount = 0; // 現在のページの報告書数（タイトルを含む）

      // 記録を日付順にソート（開始日 > 終了日の順（昇順）、同日の場合は日報 > 週報の順）
      const sortedRecords = [...allRecords].sort((a, b) => {
        // 日報はdate、週報はperiod_end（終了日）を基準にソート
        const dateA = a.type === 'daily' ? new Date(a.date) : new Date(a.period_end || a.date);
        const dateB = b.type === 'daily' ? new Date(b.date) : new Date(b.period_end || b.date);
        
        // 日付を比較（昇順：古い日付から新しい日付へ）
        const dateDiff = dateA.getTime() - dateB.getTime();
        
        // 日付が同じ場合、日報を週報より前に配置
        if (dateDiff === 0) {
          if (a.type === 'daily' && b.type === 'weekly') return -1; // 日報が前
          if (a.type === 'weekly' && b.type === 'daily') return 1;  // 週報が後
        }
        
        return dateDiff;
      });

      for (let i = 0; i < sortedRecords.length; i++) {
        const record = sortedRecords[i];

        // 改ページ処理（タイトル＋報告書2つ＝計3つで改ページ）
        if (reportCount >= 3) {
          // 改ページマーカーを設定
          const prevRow = worksheet.getRow(currentRow - 1);
          if (prevRow) {
            prevRow.pageBreak = true;
          }
          // 空行を追加
          currentRow++;
          reportCount = 0;
        }

          // タイトルをコピー（1～2行目）
          if (reportCount === 0) {
            const titleStartRow = currentRow;
            copyRow(titleSheet, 1, worksheet, currentRow);
            currentRow++;
            copyRow(titleSheet, 2, worksheet, currentRow);
            
            // マージセルをコピー（1～2行目）
            copyMergedCells(titleSheet, 1, 2, worksheet, titleStartRow);
            
            // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
            try {
              const templateMerges = titleSheet.model?.merges || [];
              templateMerges.forEach(merge => {
                try {
                  let mergeTop, mergeLeft, mergeBottom, mergeRight;
                  
                  if (typeof merge === 'string') {
                    const parts = merge.split(':');
                    if (parts.length === 2) {
                      const startCell = titleSheet.getCell(parts[0]);
                      const endCell = titleSheet.getCell(parts[1]);
                      mergeTop = startCell.row;
                      mergeLeft = startCell.col;
                      mergeBottom = endCell.row;
                      mergeRight = endCell.col;
                    } else {
                      return;
                    }
                  } else if (merge.top !== undefined) {
                    mergeTop = merge.top + 1;
                    mergeLeft = merge.left + 1;
                    mergeBottom = merge.bottom + 1;
                    mergeRight = merge.right + 1;
                  } else if (merge.s && merge.e) {
                    mergeTop = merge.s.r + 1;
                    mergeLeft = merge.s.c + 1;
                    mergeBottom = merge.e.r + 1;
                    mergeRight = merge.e.c + 1;
                  } else {
                    return;
                  }
                  
                  if (mergeTop >= 1 && mergeTop <= 2) {
                    const newTop = mergeTop + titleStartRow - 1;
                    const newBottom = mergeBottom + titleStartRow - 1;
                    const newLeft = mergeLeft;
                    const newRight = mergeRight;
                    
                    try {
                      worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                    } catch (e) {
                      // 既にマージされている場合はスキップ
                    }
                  }
                } catch (e) {
                  // エラーは無視
                }
              });
            } catch (e) {
              console.warn('タイトルマージセルの再適用エラー:', e.message);
            }
            
            // 対象者名と受給者証番号を入力（D列とQ列に直接設定）
            // D列に対象者名を設定
            const nameCell = worksheet.getCell(currentRow, 4); // D列
            if (user.name) {
              nameCell.value = user.name;
            }
            
            // Q列に受給者証番号を設定
            const recipientCell = worksheet.getCell(currentRow, 17); // Q列
            if (user.recipient_number) {
              recipientCell.value = user.recipient_number;
            }
            
            currentRow++;
            // 1行空ける
            currentRow++;
            reportCount++;
          }

        // 記録を処理
        if (record.type === 'daily') {
          // 日次支援記録：1～16行目をコピー
          const dailyStartRow = currentRow;
          for (let row = 1; row <= 16; row++) {
            copyRow(dailySheet, row, worksheet, currentRow);
            currentRow++;
          }
          
          // マージセルをコピー（1～16行目）- 行をコピーした後に実行
          copyMergedCells(dailySheet, 1, 16, worksheet, dailyStartRow);
          
          // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
          // テンプレートのマージセル情報を直接確認
          try {
            const templateMerges = dailySheet.model?.merges || [];
            templateMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = dailySheet.getCell(parts[0]);
                    const endCell = dailySheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= 1 && mergeTop <= 16) {
                  const newTop = mergeTop + dailyStartRow - 1;
                  const newBottom = mergeBottom + dailyStartRow - 1;
                  const newLeft = mergeLeft;
                  const newRight = mergeRight;
                  
                  try {
                    worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                  } catch (e) {
                    // 既にマージされている場合はスキップ
                  }
                }
              } catch (e) {
                // エラーは無視
              }
            });
          } catch (e) {
            console.warn('マージセルの再適用エラー:', e.message);
          }
          
          // データを埋め込む（実施日の行を探す）
          const dateParts = formatDateParts(record.date);
          
          // 実施日の行（通常は3行目、または「実施」という文字列がある行）を探す
          for (let row = dailyStartRow; row < dailyStartRow + 16; row++) {
            const rowObj = worksheet.getRow(row);
            let foundDateRow = false;
            
            rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellValue = cell.value?.toString() || '';
              
              // 「実施」という文字列がある行を見つける
              if (cellValue.includes('実施') && !foundDateRow) {
                foundDateRow = true;
                
                // 実施日のセルを探して値を設定
                // D列に和暦（年号＋数字、例：令和6）
                const eraCell = worksheet.getCell(row, 4); // D列
                // 既存の値がある場合は上書きしない（テンプレートの値がある場合）
                if (eraCell.value === null || eraCell.value === '') {
                  eraCell.value = `${dateParts.era}${dateParts.year}`;
                  // 文字サイズを小さくして1行に収める
                  eraCell.style = eraCell.style || {};
                  eraCell.style.font = eraCell.style.font || {};
                  eraCell.style.font.size = 9; // フォントサイズを9ptに設定
                }
                
                // I列に月
                const monthCell = worksheet.getCell(row, 9); // I列
                if (monthCell.value === null || monthCell.value === '') {
                  monthCell.value = dateParts.month;
                }
                
                // L列に日
                const dayCell = worksheet.getCell(row, 12); // L列
                if (dayCell.value === null || dayCell.value === '') {
                  dayCell.value = dateParts.day;
                }
                
                // Q列に始業時間
                if (record.mark_start) {
                  const startTime = formatTime(record.mark_start);
                  const startTimeCell = worksheet.getCell(row, 17); // Q列
                  if (startTimeCell.value === null || startTimeCell.value === '') {
                    startTimeCell.value = startTime;
                  }
                }
                
                // V列に終業時間
                if (record.mark_end) {
                  const endTime = formatTime(record.mark_end);
                  const endTimeCell = worksheet.getCell(row, 22); // V列
                  if (endTimeCell.value === null || endTimeCell.value === '') {
                    endTimeCell.value = endTime;
                  }
                }
              }
              
              // 支援方法の処理（訪問・電話・その他のみ）
              if (cellValue.includes('支援方法')) {
                // support_methodフィールドを確認（DBから取得された値）
                const supportMethod = record.support_method || record.supportMethod;
                
                if (supportMethod) {
                  // 支援方法の選択肢を探して、該当する方法の左隣のセルに✓を入れる
                  // まず「支援方法」の行全体を走査
                  for (let searchCol = colNumber + 1; searchCol <= colNumber + 15; searchCol++) {
                    try {
                      const methodCell = worksheet.getCell(row, searchCol);
                      const methodValue = methodCell.value?.toString() || '';
                      
                      // 訪問の場合
                      if (supportMethod === '訪問' && methodValue.includes('訪問')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        break;
                      }
                      // 電話の場合
                      else if (supportMethod === '電話' && methodValue.includes('電話')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        break;
                      }
                      // その他の場合
                      else if (supportMethod === 'その他' && methodValue.includes('その他')) {
                        const checkCell = worksheet.getCell(row, searchCol - 1);
                        checkCell.value = '✓';
                        const note = record.support_method_note || record.supportMethodNote;
                        if (note) {
                          // その他の詳細を（）内に入力
                          // 「その他」の次のセルに「（詳細内容）」の形式で入力
                          const noteCell = worksheet.getCell(row, searchCol + 1);
                          noteCell.value = `（${note}）`;
                        }
                        break;
                      }
                    } catch (e) {
                      // セルが存在しない場合はスキップ
                      continue;
                    }
                  }
                }
              }
              
              // 作業・訓練内容の処理（D列から開始）
              if ((cellValue.includes('作業') && cellValue.includes('訓練')) || cellValue.includes('作業内容') || cellValue.includes('訓練内容')) {
                const workContent = record.task_content || record.workContent || record.work_result || record.workResult;
                if (workContent) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = workContent;
                    contentCell.font = { ...(contentCell.font || {}), size: 10 };
                  }
                }
              }
              
              // 支援内容の処理（日報テンプレートをコピーした先頭行から4行目のD列に入力）
              // コピーした頭のセル＋4のD列（4行目に日報テンプレートをコピーしたら8行目）
              if (record.support_content) {
                const supportContentRow = dailyStartRow + 4; // 先頭行から5行目（+4で、コピー先が4行目なら8行目）
                if (supportContentRow < dailyStartRow + 16) {
                  // D列のセルを取得
                  let supportContentCell = worksheet.getCell(supportContentRow, 4); // D列
                  
                  // セルがマージセルの一部かどうか確認し、左上のセルを取得
                  try {
                    // マージセルの場合、左上のセルを取得
                    if (supportContentCell.isMerged) {
                      const master = supportContentCell.master;
                      if (master) {
                        supportContentCell = master;
                      }
                    }
                  } catch (e) {
                    // エラーは無視してそのまま使用
                  }
                  
                  supportContentCell.value = record.support_content;
                  supportContentCell.font = { ...(supportContentCell.font || {}), size: 10 };
                }
              }
              
              // 健康状態・助言の処理（D列から開始）
              if (cellValue.includes('健康') || cellValue.includes('助言') || cellValue.includes('心身')) {
                if (record.advice) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = record.advice;
                    contentCell.font = { ...(contentCell.font || {}), size: 10 };
                  }
                }
              }
              
              // 記録者の処理（D列から開始）
              if (cellValue.includes('記録者') || cellValue.includes('対応')) {
                if (record.recorder_name) {
                  // D列（4列目）から開始
                  const contentCell = worksheet.getCell(row, 4); // D列
                  if (contentCell.value === null || contentCell.value === '') {
                    contentCell.value = record.recorder_name;
                  }
                }
              }
            });
          }
          
          // 1行空ける
          currentRow++;
          reportCount++;
        } else if (record.type === 'weekly') {
          // 週次評価：1～15行目をコピー
          const weeklyStartRow = currentRow;
          for (let row = 1; row <= 15; row++) {
            copyRow(weeklySheet, row, worksheet, currentRow);
            currentRow++;
          }
          
          // マージセルをコピー（1～15行目）
          copyMergedCells(weeklySheet, 1, 15, worksheet, weeklyStartRow);
          
          // マージセルが正しくコピーされたか再確認し、必要に応じて再適用
          try {
            const templateMerges = weeklySheet.model?.merges || [];
            templateMerges.forEach(merge => {
              try {
                let mergeTop, mergeLeft, mergeBottom, mergeRight;
                
                if (typeof merge === 'string') {
                  const parts = merge.split(':');
                  if (parts.length === 2) {
                    const startCell = weeklySheet.getCell(parts[0]);
                    const endCell = weeklySheet.getCell(parts[1]);
                    mergeTop = startCell.row;
                    mergeLeft = startCell.col;
                    mergeBottom = endCell.row;
                    mergeRight = endCell.col;
                  } else {
                    return;
                  }
                } else if (merge.top !== undefined) {
                  mergeTop = merge.top + 1;
                  mergeLeft = merge.left + 1;
                  mergeBottom = merge.bottom + 1;
                  mergeRight = merge.right + 1;
                } else if (merge.s && merge.e) {
                  mergeTop = merge.s.r + 1;
                  mergeLeft = merge.s.c + 1;
                  mergeBottom = merge.e.r + 1;
                  mergeRight = merge.e.c + 1;
                } else {
                  return;
                }
                
                if (mergeTop >= 1 && mergeTop <= 15) {
                  const newTop = mergeTop + weeklyStartRow - 1;
                  const newBottom = mergeBottom + weeklyStartRow - 1;
                  const newLeft = mergeLeft;
                  const newRight = mergeRight;
                  
                  try {
                    worksheet.mergeCells(newTop, newLeft, newBottom, newRight);
                  } catch (e) {
                    // 既にマージされている場合はスキップ
                  }
                }
              } catch (e) {
                // エラーは無視
              }
            });
          } catch (e) {
            console.warn('マージセルの再適用エラー:', e.message);
          }
          
                    // データを埋め込む
          const startParts = record.period_start ? formatDateParts(record.period_start) : null;                                                                 
          const endParts = record.period_end ? formatDateParts(record.period_end) : null;
          const dateParts = record.date ? formatDateParts(record.date) : null;
          const prevEvalParts = record.prev_eval_date ? formatDateParts(record.prev_eval_date) : null;

          // テンプレート内の行番号を基準にデータを埋め込む
          // テンプレートは15行なので、テンプレート内の行番号を使用
          // 実施日・前回評価日：テンプレート内の2行目（weeklyStartRow + 1）
          const dateRow = weeklyStartRow + 1;
          
          // 実施日：D列（和暦年号＋年）、I列（月）、L列（日）
          if (dateParts) {
            const eraCell = worksheet.getCell(dateRow, 4); // D列：和暦年号＋年
            eraCell.value = `${dateParts.era}${dateParts.year}`;
            // フォントサイズを10ptに設定
            eraCell.style = eraCell.style || {};
            eraCell.style.font = eraCell.style.font || {};
            eraCell.style.font.size = 10;
            worksheet.getCell(dateRow, 9).value = dateParts.month; // I列：月
            worksheet.getCell(dateRow, 12).value = dateParts.day; // L列：日
          }
          
          // 前回評価日：S列（和暦年号＋年）、V列（月）、X列（日）
          if (prevEvalParts) {
            worksheet.getCell(dateRow, 19).value = `${prevEvalParts.era}${prevEvalParts.year}`; // S列：和暦年号＋年
            worksheet.getCell(dateRow, 22).value = prevEvalParts.month; // V列：月
            worksheet.getCell(dateRow, 24).value = prevEvalParts.day; // X列：日
          }
          
          // 方法：テンプレート内の3行目（weeklyStartRow + 2）
          // 通所：D列、訪問：G列、その他：J列、その他の備考：N列
          const methodRow = weeklyStartRow + 2;
          if (record.evaluation_method) {
            if (record.evaluation_method === '通所') {
              worksheet.getCell(methodRow, 4).value = '✓'; // D列
            } else if (record.evaluation_method === '訪問') {
              worksheet.getCell(methodRow, 7).value = '✓'; // G列
            } else if (record.evaluation_method === 'その他') {
              worksheet.getCell(methodRow, 10).value = '✓'; // J列
              if (record.method_other) {
                // その他の説明はN列
                worksheet.getCell(methodRow, 14).value = record.method_other;
              }
            }
          }
          
          // 対象期間：テンプレート内の4行目（weeklyStartRow + 3）
          // 開始日：D列（和暦年号＋年）、G列（月）、I列（日）
          // 終了日：L列（和暦年号＋年）、O列（月）、Q列（日）
          const periodRow = weeklyStartRow + 3;
          if (startParts) {
            worksheet.getCell(periodRow, 4).value = `${startParts.era}${startParts.year}`; // D列：開始和暦年号＋年
            worksheet.getCell(periodRow, 7).value = startParts.month; // G列：開始月
            worksheet.getCell(periodRow, 9).value = startParts.day; // I列：開始日
          }
          if (endParts) {
            worksheet.getCell(periodRow, 12).value = `${endParts.era}${endParts.year}`; // L列：終了和暦年号＋年
            worksheet.getCell(periodRow, 15).value = endParts.month; // O列：終了月
            worksheet.getCell(periodRow, 17).value = endParts.day; // Q列：終了日
          }
          
          // 評価内容：テンプレート内の6行目（weeklyStartRow + 5）のA列から
          const contentRow = weeklyStartRow + 5;
          if (record.evaluation_content) {
            worksheet.getCell(contentRow, 1).value = record.evaluation_content; // A列
          }
          
          // 記録者・確認者：テンプレート内の17行目（weeklyStartRow + 16）
          // ただし、テンプレートが15行なので、記録者の行を探す
          // テンプレート内で「記録者」という文字列がある行を探す
          for (let row = weeklyStartRow; row < weeklyStartRow + 15; row++) {
            const rowObj = worksheet.getRow(row);
            let foundRecorder = false;
            
            rowObj.eachCell({ includeEmpty: true }, (cell, colNumber) => {
              const cellValue = cell.value?.toString() || '';
              
              if (cellValue.includes('記録者') && !foundRecorder) {
                foundRecorder = true;
                // 記録者名をE列に設定
                if (record.recorder_name) {
                  worksheet.getCell(row, 5).value = record.recorder_name; // E列
                }
                // 確認者名をT列（R列の2列右）に設定（記録者と同じ行のR列）
                if (record.confirm_name) {
                  worksheet.getCell(row, 18).value = record.confirm_name; // R列
                }
              }
            });
            
            if (foundRecorder) break;
          }
          
          // 1行空ける
          currentRow++;
          reportCount++;
        }
      }

      // A4縦型のページ設定
      worksheet.pageSetup = {
        paperSize: 9, // A4
        orientation: 'portrait', // 縦型
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };
      
      // 改行位置をY列（25列目）に設定
      // 列の幅を調整してY列まで表示できるようにする
      for (let col = 1; col <= 25; col++) {
        const column = worksheet.getColumn(col);
        if (!column.width) {
          column.width = 10; // デフォルト幅を設定
        }
      }
      
      // Y列（25列目）の右側に罫線を設定し、結合セル以外のwrapTextを外す
      worksheet.eachRow((row, rowNumber) => {
        const yColumnCell = row.getCell(25); // Y列（25列目）
        if (yColumnCell) {
          // スタイルを確実に設定
          yColumnCell.style = yColumnCell.style || {};
          yColumnCell.style.border = yColumnCell.style.border || {};
          yColumnCell.style.border.right = yColumnCell.style.border.right || {
            style: 'thin',
            color: { argb: 'FF000000' }
          };
          
          // Y列は結合セルの可能性があるので、結合セルの場合はwrapTextを有効にする
          if (yColumnCell.isMerged) {
            yColumnCell.style.alignment = yColumnCell.style.alignment || {};
            yColumnCell.style.alignment.wrapText = true;
          } else {
            yColumnCell.style.alignment = yColumnCell.style.alignment || {};
            yColumnCell.style.alignment.wrapText = false;
          }
        }
        
        // 他のセルも処理（結合セルのみwrapTextを有効にする）
        row.eachCell((cell, colNumber) => {
          cell.style = cell.style || {};
          cell.style.alignment = cell.style.alignment || {};
          
          // 結合セルかどうかを確認
          if (cell.isMerged) {
            // 結合セルの場合はwrapTextを有効にする
            cell.style.alignment.wrapText = true;
          } else {
            // 結合セル以外はwrapTextを無効にする
            cell.style.alignment.wrapText = false;
          }
        });
      });

      // Excelファイルをダウンロード
      const excelBuffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([excelBuffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const fileName = `在宅支援記録_${user.name}_${startDate}_${endDate}.xlsx`;
      link.download = fileName;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      alert('Excelファイルのダウンロードが完了しました。');
    } catch (error) {
      console.error('Excelダウンロードエラー:', error);
      alert('Excelファイルのダウンロードに失敗しました: ' + error.message);
    } finally {
      // ダウンロード処理終了
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
          showBackButton={true}
          backButtonText="評価記録に戻る"
          onBackClick={() => {
            // 戻る前に現在の拠点情報を保存
            if (localUser) {
              const currentLocation = {
                id: localUser.satellite_id,
                name: localUser.satellite_name,
                company_id: localUser.company_id,
                company_name: localUser.company_name
              };
              sessionStorage.setItem('selectedSatellite', JSON.stringify(currentLocation));
            }
            navigate('/instructor/home-support?tab=evaluations');
          }}
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
