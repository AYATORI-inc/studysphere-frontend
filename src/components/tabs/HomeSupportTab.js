import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getCurrentUser } from '../../utils/userContext';
import { getCurrentJapanTime, formatJapanDate } from '../../utils/dateUtils';
import { getSatelliteHomeSupportUsersWithDailyRecords, removeHomeSupportFlag, getSatelliteEvaluationStatus, createOfficeVisitRecord, getSatelliteSupportPlanGoalDates, getSatelliteSupportPlanStatus } from '../../utils/api';
import HomeSupportUserAdditionModal from '../HomeSupportUserAdditionModal';
import DailySupportRecordModal from '../DailySupportRecordModal';
import OfficeVisitModal from '../modals/OfficeVisitModal';
import HomeSupportUserDetailModal from '../modals/HomeSupportUserDetailModal';

const HomeSupportTab = () => {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [showDailySupportRecordModal, setShowDailySupportRecordModal] = useState(false);
  const [showOfficeVisitModal, setShowOfficeVisitModal] = useState(false);
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [selectedStudentForDailyRecord, setSelectedStudentForDailyRecord] = useState(null);
  const [selectedStudentForOfficeVisit, setSelectedStudentForOfficeVisit] = useState(null);
  const [selectedStudentForDetail, setSelectedStudentForDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentSatellite, setCurrentSatellite] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  
  // アラート用の状態
  const [alerts, setAlerts] = useState({
    dailyRecord: [],
    weeklyRecord: [],
    monthlyRecord: [],
    supportPlan: []
  });

  useEffect(() => {
    // 現在のユーザー情報と拠点情報を取得
    const user = getCurrentUser();
    setCurrentUser(user);
    console.log('HomeSupportTab: 現在のユーザー情報:', user);
    
    const selectedSatellite = sessionStorage.getItem('selectedSatellite');
    console.log('HomeSupportTab: sessionStorageの拠点情報:', selectedSatellite);
    
    if (selectedSatellite) {
      try {
        const satelliteData = JSON.parse(selectedSatellite);
        console.log('HomeSupportTab: 保存された拠点情報を復元:', satelliteData);
        setCurrentSatellite(satelliteData);
      } catch (error) {
        console.error('HomeSupportTab: 拠点情報のパースエラー:', error);
        // パースエラーの場合は、ユーザーの拠点情報を使用
        if (user?.satellite_ids && user.satellite_ids.length > 0) {
          setCurrentSatellite({
            id: user.satellite_ids[0],
            name: '現在の拠点'
          });
        }
      }
    } else {
      console.log('HomeSupportTab: sessionStorageに拠点情報がありません');
      // sessionStorageに拠点情報がない場合は、ユーザーの拠点情報を使用
      if (user?.satellite_ids && user.satellite_ids.length > 0) {
        setCurrentSatellite({
          id: user.satellite_ids[0],
          name: '現在の拠点'
        });
      }
    }
  }, []);

  useEffect(() => {
    if (currentSatellite?.id) {
      fetchHomeSupportUsers();
    }
  }, [currentSatellite]);

  // studentsが更新されたら評価状況を取得
  useEffect(() => {
    if (students.length > 0 && currentSatellite?.id) {
      fetchEvaluationStatus();
      fetchSupportPlanAlerts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [students]);

  // 拠点情報の変更を監視し、sessionStorageを更新
  useEffect(() => {
    if (currentSatellite?.id) {
      // 現在のsessionStorageの値を確認
      const storedSatellite = sessionStorage.getItem('selectedSatellite');
      let storedSatelliteData = null;
      
      try {
        if (storedSatellite) {
          storedSatelliteData = JSON.parse(storedSatellite);
        }
      } catch (error) {
        console.error('HomeSupportTab: セッションストレージの拠点情報パースエラー:', error);
      }
      
      // 拠点情報が実際に変更された場合のみ更新
      if (!storedSatelliteData || storedSatelliteData.id !== currentSatellite.id) {
        const selectedSatelliteInfo = {
          id: currentSatellite.id,
          name: currentSatellite.name,
          company_id: currentSatellite.company_id,
          company_name: currentSatellite.company_name
        };
        sessionStorage.setItem('selectedSatellite', JSON.stringify(selectedSatelliteInfo));
        console.log('HomeSupportTab: 拠点情報変更によりセッションストレージを更新:', selectedSatelliteInfo);
      }
    }
  }, [currentSatellite?.id]);

  // 在宅支援利用者追加イベントをリッスン
  useEffect(() => {
    const handleUserAdded = () => {
      fetchHomeSupportUsers();
      fetchEvaluationStatus();
    };

    const handleSatelliteChanged = (event) => {
      console.log('HomeSupportTab: 拠点変更イベントを受信:', event.detail);
      const newLocation = event.detail.newLocation;
      if (newLocation) {
        setCurrentSatellite(newLocation);
      }
    };

    window.addEventListener('homeSupportUserAdded', handleUserAdded);
    window.addEventListener('satelliteChanged', handleSatelliteChanged);
    
    return () => {
      window.removeEventListener('homeSupportUserAdded', handleUserAdded);
      window.removeEventListener('satelliteChanged', handleSatelliteChanged);
    };
  }, []);

  const fetchHomeSupportUsers = async () => {
    try {
      setLoading(true);
      console.log('=== 在宅支援利用者取得開始 ===');
      console.log('拠点ID:', currentSatellite.id);
      console.log('拠点名:', currentSatellite.name);
      console.log('企業ID:', currentSatellite.company_id);
      console.log('企業名:', currentSatellite.company_name);
      
      // 日次記録情報を含む在宅支援利用者を取得
      const response = await getSatelliteHomeSupportUsersWithDailyRecords(currentSatellite.id, null, null);
      
      if (response.success) {
        console.log('APIレスポンス:', response);
        console.log('取得したデータ:', response.data);
        console.log('取得件数:', response.data?.length || 0);
        
        // データをユーザーごとにグループ化
        const userMap = new Map();
        
        response.data.forEach(record => {
          const userId = record.id;
          if (!userMap.has(userId)) {
            const recipientNum = record.recipient_number ?? record.recipientNumber ?? '';
            userMap.set(userId, {
              id: record.id,
              name: record.name,
              instructorName: record.instructor_name || '未設定',
              email: record.login_code || '未設定',
              recipient_number: recipientNum,
              recipientNumber: recipientNum,
              status: 'active', // 在宅支援利用者はアクティブ
              progress: 0,
              tags: ['在宅支援'],
              canStudyAtHome: true,
              isRemoteUser: record.is_remote_user || false,
              companyName: record.company_name || '未設定',
              dailyRecords: []
            });
          }
          
          const userEntry = userMap.get(userId);
          const tagSet = new Set(userEntry.tags || ['在宅支援']);
          
          if (Array.isArray(record.tags)) {
            record.tags.forEach(tag => {
              if (typeof tag === 'string' && tag.trim()) {
                tagSet.add(tag.trim());
              }
            });
          } else if (typeof record.tags === 'string' && record.tags.trim()) {
            tagSet.add(record.tags.trim());
          }
          
          userEntry.tags = Array.from(tagSet);
          
          // 日次記録がある場合のみ追加
          if (record.daily_record_id) {
            const recordDate = record.record_date ? formatJapanDate(record.record_date) : null;
            
            userMap.get(userId).dailyRecords.push({
              id: record.daily_record_id,
              date: recordDate,
              markStart: record.mark_start,
              markLunchStart: record.mark_lunch_start,
              markLunchEnd: record.mark_lunch_end,
              markEnd: record.mark_end,
              temperature: record.temperature,
              conditionNote: record.condition_note,
              workNote: record.work_note,
              workResult: record.work_result,
              dailyReport: record.daily_report,
              supportMethod: record.support_method,
              supportMethodNote: record.support_method_note,
              taskContent: record.task_content,
              supportContent: record.support_content,
              advice: record.advice,
              instructorComment: record.instructor_comment,
              recorderName: record.recorder_name,
              webcamPhotos: record.webcam_photos,
              screenshots: record.screenshots,
              createdAt: record.record_created_at,
              updatedAt: record.record_updated_at
            });
          }
        });

        // 日次記録を新しい順にソート（先頭が最新、末尾が最古）
        userMap.forEach(userEntry => {
          if (Array.isArray(userEntry.dailyRecords)) {
            userEntry.dailyRecords.sort((a, b) => {
              const dateA = a.date ? new Date(a.date) : null;
              const dateB = b.date ? new Date(b.date) : null;

              if (dateA && dateB) return dateB - dateA; // 降順（新しいものが先頭）
              if (dateA) return -1;
              if (dateB) return 1;
              return 0;
            });
          }
        });
        
        const formattedUsers = Array.from(userMap.values());
        
        setStudents(formattedUsers);
        console.log(`在宅支援利用者取得完了: ${formattedUsers.length}件`);
        console.log('フォーマット後のデータ:', formattedUsers);
      } else {
        console.error('在宅支援利用者取得失敗:', response.message);
        setStudents([]);
      }
    } catch (error) {
      console.error('在宅支援利用者取得エラー:', error);
      setStudents([]);
    } finally {
      setLoading(false);
    }
  };

  // !studentsに依存するため、内部でstudentsを使用する
  const fetchEvaluationStatus = React.useCallback(async () => {
    if (!currentSatellite?.id || students.length === 0) return;
    
    try {
      const response = await getSatelliteEvaluationStatus(currentSatellite.id);
      
      if (response.success && response.data) {
        const now = getCurrentJapanTime();
        const dailyRecordAlerts = [];
        const weeklyRecordAlerts = [];
        const monthlyRecordAlerts = [];
        
        const parseJapanDate = (value) => {
          if (!value) return null;
          if (value instanceof Date) return value;
          
          const stringValue = String(value).trim();
          if (!stringValue) return null;
          
          const isoCandidate = `${stringValue}T00:00:00+09:00`;
          const parsed = new Date(isoCandidate);
          if (!Number.isNaN(parsed.getTime())) {
            return parsed;
          }
          
          const fallback = new Date(stringValue);
          return Number.isNaN(fallback.getTime()) ? null : fallback;
        };
        
        const calculateDaysSince = (targetDateValue) => {
          const targetDate = parseJapanDate(targetDateValue);
          if (!targetDate) return null;
          
          const diffMs = now.getTime() - targetDate.getTime();
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          return days < 0 ? 0 : days;
        };
        
        response.data.forEach(user => {
          // 日次記録のアラート（終業時刻があるのにrecorder_nameがない）
          if (user.dailyStatus === '未完了') {
            // 日次記録があるかチェック
            const userData = students.find(s => s.id === user.id);
            console.log('HomeSupportTab: アラートチェック - userId:', user.id, ', userData:', userData);
            if (userData && userData.dailyRecords && userData.dailyRecords.length > 0) {
              // 最新の日次記録を確認
              const latestRecord = userData.dailyRecords[0];
              console.log('HomeSupportTab: 最新記録 - userId:', user.id, ', markEnd:', latestRecord.markEnd, ', recorderName:', latestRecord.recorderName);
              if (latestRecord.markEnd && !latestRecord.recorderName) {
                console.log('HomeSupportTab: アラート追加 - userId:', user.id, ', userName:', user.name);
                dailyRecordAlerts.push({
                  userId: user.id,
                  userName: user.name,
                  date: latestRecord.date
                });
              }
            }
          }
          
          // 週次記録のアラート（最新の週次評価から一定日数以上経過、または週次評価未実施で日次記録が一定日数以上）
          if (user.weeklyStatus === '未完了') {
            const userData = students.find(s => s.id === user.id);
            
            const getOldestPendingDailyRecordDate = () => {
              if (!userData || !Array.isArray(userData.dailyRecords) || userData.dailyRecords.length === 0) {
                return null;
              }

              const lastWeeklyReference = user.lastWeeklyPeriodEnd || user.lastWeeklyRecordDate;
              const lastWeeklyDate = parseJapanDate(lastWeeklyReference);

              const sortedDailyRecords = [...userData.dailyRecords].sort((a, b) => {
                const dateA = parseJapanDate(a.date);
                const dateB = parseJapanDate(b.date);

                if (dateA && dateB) return dateB - dateA; // 新しい順
                if (dateA) return -1;
                if (dateB) return 1;
                return 0;
              });

              const pendingRecords = sortedDailyRecords.filter(record => {
                const recordDate = parseJapanDate(record.date);
                if (!recordDate) return false;
                if (!lastWeeklyDate) return true;
                return recordDate > lastWeeklyDate;
              });

              if (pendingRecords.length === 0) {
                return null;
              }

              const oldestPendingRecord = pendingRecords[pendingRecords.length - 1];
              return oldestPendingRecord?.date || null;
            };

            const oldestPendingDailyRecordDate = getOldestPendingDailyRecordDate();

            const fallbackDailyRecordDate =
              userData?.dailyRecords && userData.dailyRecords.length > 0
                ? userData.dailyRecords[userData.dailyRecords.length - 1].date
                : null;

            const referenceDate =
              oldestPendingDailyRecordDate ||
              user.lastWeeklyPeriodEnd ||
              user.lastWeeklyRecordDate ||
              fallbackDailyRecordDate;
            
            const daysSinceRecord = calculateDaysSince(referenceDate);
            
            if (daysSinceRecord !== null && daysSinceRecord >= 7) {
              weeklyRecordAlerts.push({
                userId: user.id,
                userName: user.name,
                daysAgo: daysSinceRecord
              });
            }
          }
          
          // 達成度評価のアラート（最新の達成度評価の次の月になっている、または最初の記録の次の月になっている）
          if (user.monthlyStatus === '未完了') {
            const userData = students.find(s => s.id === user.id);
            if (userData && userData.dailyRecords && userData.dailyRecords.length > 0) {
              const latestRecord = userData.dailyRecords[0];
              const recordDate = new Date(latestRecord.date);
              const recordMonth = recordDate.getMonth();
              const recordYear = recordDate.getFullYear();
              const currentMonth = now.getMonth();
              const currentYear = now.getFullYear();
              
              // 記録日付の次の月になっているかチェック
              if (currentYear > recordYear || (currentYear === recordYear && currentMonth > recordMonth)) {
                monthlyRecordAlerts.push({
                  userId: user.id,
                  userName: user.name,
                  recordDate: latestRecord.date
                });
              }
            }
          }
        });
        
        setAlerts(prev => ({
          ...prev,
          dailyRecord: dailyRecordAlerts,
          weeklyRecord: weeklyRecordAlerts,
          monthlyRecord: monthlyRecordAlerts
        }));
      }
    } catch (error) {
      console.error('評価状況取得エラー:', error);
    }
  }, [currentSatellite, students]);

  // 個別支援計画のアラートを取得
  const fetchSupportPlanAlerts = React.useCallback(async () => {
    if (!currentSatellite?.id) return;
    
    try {
      const response = await getSatelliteSupportPlanStatus(currentSatellite.id);
      
      console.log('個別支援計画API レスポンス:', response);
      
      if (response && response.success && response.data) {
        console.log('個別支援計画状況データ:', response.data);
        const now = new Date();
        const supportPlanAlerts = [];
        
        response.data.forEach(plan => {
          console.log('個別支援計画チェック:', plan.user_name, 'status:', plan.status, 'goal_date:', plan.goal_date);
          if (plan.status === 'no_record') {
            // 個別支援計画が存在しない場合
            console.log('アラート追加 - 記録なし:', plan.user_name);
            supportPlanAlerts.push({
              userId: plan.user_id,
              userName: plan.user_name,
              status: 'no_record',
              message: `${plan.user_name}さんの個別支援計画がありません`
            });
          } else if (plan.status === 'no_goal_date' || !plan.goal_date || plan.goal_date === '') {
            // 個別支援計画はあるが目標達成予定日が設定されていない場合
            console.log('アラート追加 - 目標日なし:', plan.user_name);
            supportPlanAlerts.push({
              userId: plan.user_id,
              userName: plan.user_name,
              status: 'no_goal_date',
              message: '個別支援計画の目標達成予定日を設定してください'
            });
          } else if (plan.status === 'has_goal_date' && plan.goal_date) {
            // 目標達成予定日が設定されている場合、1カ月前チェック
            const goalDate = new Date(plan.goal_date);
            const oneMonthBefore = new Date(goalDate);
            oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
            
            // 現在の日付が目標日から1カ月前を過ぎているかチェック
            if (now >= oneMonthBefore) {
              const daysUntilGoal = Math.ceil((goalDate - now) / (1000 * 60 * 60 * 24));
              supportPlanAlerts.push({
                userId: plan.user_id,
                userName: plan.user_name,
                status: 'update_needed',
                goalDate: plan.goal_date,
                daysUntilGoal: daysUntilGoal,
                message: '個別支援計画を更新してください'
              });
            }
          }
        });
        
        console.log('個別支援計画アラート設定:', supportPlanAlerts);
        setAlerts(prev => ({
          ...prev,
          supportPlan: supportPlanAlerts
        }));
      } else {
        console.log('個別支援計画API レスポンスが無効:', response);
        // API エラーの場合でも空のアラート配列を設定
        setAlerts(prev => ({
          ...prev,
          supportPlan: []
        }));
      }
    } catch (error) {
      console.error('個別支援計画アラート取得エラー:', error);
      // エラーの場合でも空のアラート配列を設定
      setAlerts(prev => ({
        ...prev,
        supportPlan: []
      }));
    }
  }, [currentSatellite]);

  const getFilteredStudents = () => {
    let filteredStudents = students.filter(s => s.canStudyAtHome);
    if (searchTerm) {
      filteredStudents = filteredStudents.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.instructorName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.companyName.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    if (selectedTags.length > 0) {
      filteredStudents = filteredStudents.filter(student =>
        selectedTags.every(tag => student.tags?.includes(tag))
      );
    }
    if (statusFilter !== 'all') {
      filteredStudents = filteredStudents.filter(student =>
        student.status === statusFilter
      );
    }
    return filteredStudents;
  };

  const getAllTags = () => {
    const allTags = new Set();
    students.forEach(student => {
      student.tags?.forEach(tag => allTags.add(tag));
    });
    return Array.from(allTags).sort();
  };

  const toggleTag = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  const clearFilters = () => {
    setSearchTerm('');
    setSelectedTags([]);
    setStatusFilter('all');
  };

  const startDailySupportRecord = (student) => {
    setSelectedStudentForDailyRecord(student);
    setShowDailySupportRecordModal(true);
  };
  const startOfficeVisit = (student) => {
    setSelectedStudentForOfficeVisit(student);
    setShowOfficeVisitModal(true);
  };
  const startUserDetail = (student) => {
    setSelectedStudentForDetail(student);
    setShowUserDetailModal(true);
  };
  // 編集ページへの遷移時に拠点情報を保存するヘルパー関数
  const navigateWithLocation = (path) => {
    if (currentSatellite) {
      sessionStorage.setItem('selectedSatellite', JSON.stringify(currentSatellite));
    }
    navigate(path);
  };

  const startWeeklyEvaluation = (student) => {
    navigateWithLocation(`/instructor/home-support/weekly-evaluation/${student.id}`);
  };
  const startMonthlyEvaluation = (student) => {
    navigateWithLocation(`/instructor/home-support/monthly-evaluation/${student.id}`);
  };
  const handleAddUsersSuccess = (result) => {
    // 在宅支援利用者が追加された後の処理
    console.log('在宅支援利用者が追加されました:', result);
    // 即座にリストを更新
    fetchHomeSupportUsers();
    fetchEvaluationStatus();
    // 他のコンポーネントにも通知
    window.dispatchEvent(new CustomEvent('homeSupportUserAdded'));
  };

  // 通所記録を保存
  const handleSaveOfficeVisit = async (data) => {
    try {
      // 解除の場合は既にOfficeVisitModal内で処理済みなので、データの再取得のみ行う
      if (data.action === 'remove') {
        alert(`${data.userName}さんの通所記録を解除しました`);
        setShowOfficeVisitModal(false);
        setSelectedStudentForOfficeVisit(null);
        fetchHomeSupportUsers();
        fetchEvaluationStatus();
        return;
      }

      const response = await createOfficeVisitRecord(data.userId, data.visitDate);
      
      if (response.success) {
        alert(`${data.userName}さんの通所記録を設定しました`);
        setShowOfficeVisitModal(false);
        setSelectedStudentForOfficeVisit(null);
        fetchHomeSupportUsers();
        fetchEvaluationStatus();
      } else {
        alert(`通所記録の設定に失敗しました: ${response.message}`);
      }
    } catch (error) {
      console.error('通所記録保存エラー:', error);
      alert('通所記録の設定に失敗しました');
    }
  };

  // 在宅支援解除機能
  const handleRemoveHomeSupport = async (student) => {
    if (!window.confirm(`${student.name}さんの在宅支援を解除しますか？`)) {
      return;
    }

    try {
      const response = await removeHomeSupportFlag(student.id);
      
      if (response.success) {
        // 成功時はリストを再取得
        fetchHomeSupportUsers();
        fetchEvaluationStatus();
        // 他のコンポーネントにも通知
        window.dispatchEvent(new CustomEvent('homeSupportUserRemoved'));
        alert('在宅支援を解除しました');
      } else {
        alert(`在宅支援解除に失敗しました: ${response.message}`);
      }
    } catch (error) {
      console.error('在宅支援解除エラー:', error);
      alert('在宅支援解除に失敗しました');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-indigo-50 p-6">
      {/* ヘッダー部分 */}
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex-1">
            <h2 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-2">
              👥 在宅支援利用者一覧
            </h2>
            <div className="flex items-center gap-2 text-gray-600">
              <span className="text-lg">📍</span>
              <div>
                <p className="font-medium">在宅支援管理</p>
                <p className="text-sm text-gray-500">※同一拠点の他の指導員の利用者も管理できます</p>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 flex items-center gap-2"
              onClick={() => setShowAddModal(true)}
            >
              + 在宅支援利用者を追加
            </button>
          </div>
        </div>
      </div>

      {/* アラートカード */}
      {(alerts.dailyRecord.length > 0 || alerts.weeklyRecord.length > 0 || alerts.monthlyRecord.length > 0 || alerts.supportPlan.length > 0) && (
        <div className="space-y-4 mb-6">
          {/* 日次記録アラート */}
          {alerts.dailyRecord.length > 0 && (
            <div className="bg-gradient-to-r from-orange-50 to-amber-50 border-l-4 border-orange-500 rounded-lg shadow-md p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-semibold text-orange-800 mb-2">日次記録が記載されていません</h3>
                  <div className="space-y-1">
                    {alerts.dailyRecord.map((alert, index) => (
                      <p key={index} className="text-sm text-orange-700">
                        {alert.userName}さんの日次記録が記載されていません（{new Date(alert.date).toLocaleDateString('ja-JP')}）
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 週次記録アラート */}
          {alerts.weeklyRecord.length > 0 && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-l-4 border-yellow-500 rounded-lg shadow-md p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-semibold text-yellow-800 mb-2">週次記録が記載されていません</h3>
                  <div className="space-y-1">
                    {alerts.weeklyRecord.map((alert, index) => (
                      <p key={index} className="text-sm text-yellow-700">
                        {alert.userName}さんの週次記録が記載されていません（{alert.daysAgo}日前）
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 達成度評価アラート */}
          {alerts.monthlyRecord.length > 0 && (
            <div className="bg-gradient-to-r from-red-50 to-pink-50 border-l-4 border-red-500 rounded-lg shadow-md p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-2xl">⚠️</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-semibold text-red-800 mb-2">達成度評価がされていません</h3>
                  <div className="space-y-1">
                    {alerts.monthlyRecord.map((alert, index) => (
                      <p key={index} className="text-sm text-red-700">
                        {alert.userName}さんの達成度評価がされていません（最終記録: {new Date(alert.recordDate).toLocaleDateString('ja-JP')}）
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 個別支援計画アラート */}
          {alerts.supportPlan.length > 0 && (
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-500 rounded-lg shadow-md p-4">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <span className="text-2xl">📋</span>
                </div>
                <div className="ml-3 flex-1">
                  <h3 className="text-lg font-semibold text-blue-800 mb-2">個別支援計画の対応が必要です</h3>
                  <div className="space-y-1">
                    {alerts.supportPlan.map((alert, index) => (
                      <p key={index} className="text-sm text-blue-700">
                        {alert.userName}さん: {alert.message}
                        {alert.goalDate && (
                          <span className="ml-2">
                            （目標達成予定日: {new Date(alert.goalDate).toLocaleDateString('ja-JP')}、残り{alert.daysUntilGoal}日）
                          </span>
                        )}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* フィルター部分 */}
      <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
        <div className="space-y-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <input
                  type="text"
                  placeholder="利用者名、メール、クラス、指導員名で検索..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full px-4 py-3 pl-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
                />
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400">🔍</span>
              </div>
            </div>
            <div className="flex gap-3">
              <select 
                value={statusFilter} 
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all duration-200"
              >
                <option value="all">全てのステータス</option>
                <option value="active">稼働中</option>
                <option value="inactive">停止中</option>
              </select>
              <button 
                className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
                onClick={clearFilters}
              >
                クリア
              </button>
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-3">タグフィルター:</label>
            <div className="flex flex-wrap gap-2">
              {getAllTags().map(tag => (
                <button
                  key={tag}
                  className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 transform hover:scale-105 ${
                    selectedTags.includes(tag) 
                      ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg' 
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  onClick={() => toggleTag(tag)}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 利用者リスト部分 */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        {loading ? (
          <div className="flex justify-center items-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
            <span className="ml-2 text-gray-600">在宅支援利用者を読み込み中...</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gradient-to-r from-green-50 to-emerald-50">
                <tr>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">利用者名</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">タグ</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">状態</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">最新記録</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">記録数</th>
                  <th className="px-6 py-4 text-left text-sm font-semibold text-green-800 border-b border-green-200">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {getFilteredStudents().length === 0 ? (
                  <tr>
                    <td colSpan="6" className="px-6 py-12 text-center text-gray-500">
                      <div className="text-gray-400 text-6xl mb-4">🏠</div>
                      <p className="text-lg font-medium text-gray-600 mb-2">在宅支援利用者がいません</p>
                      <p className="text-gray-500">在宅支援を利用している利用者が登録されていません。</p>
                    </td>
                  </tr>
                ) : (
                  getFilteredStudents().map((student, index) => (
                <tr key={student.id} className={`hover:bg-gradient-to-r hover:from-green-50 hover:to-emerald-50 transition-all duration-200 ${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50'
                }`}>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="font-semibold text-green-600">{student.name}</span>
                      <span className="text-sm text-gray-500">担当: {student.instructorName}</span>
                      {student.isRemoteUser && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1 w-fit">
                          🏠 リモート利用者
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-wrap gap-1">
                      {student.tags?.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                      student.status === 'active' 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {student.status === 'active' ? '稼働中' : '停止中'}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="space-y-2">
                      {student.dailyRecords && student.dailyRecords.length > 0 ? (
                        <div className="text-sm">
                          <div className="font-medium text-gray-900">
                            {new Date(student.dailyRecords[0].date).toLocaleDateString('ja-JP')}
                          </div>
                          <div className="text-gray-600">
                            {student.dailyRecords[0].markStart ? 
                              new Date(student.dailyRecords[0].markStart).toLocaleTimeString('ja-JP', {hour: '2-digit', minute: '2-digit'}) : 
                              '未打刻'
                            }
                          </div>
                          {student.dailyRecords[0].temperature && (
                            <div className="text-xs text-blue-600">
                              🌡️ {student.dailyRecords[0].temperature}°C
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">
                          記録なし
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="text-sm">
                      <span className="font-medium text-gray-900">
                        {student.dailyRecords ? student.dailyRecords.length : 0}件
                      </span>
                      {student.dailyRecords && student.dailyRecords.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          最新: {new Date(student.dailyRecords[0].date).toLocaleDateString('ja-JP')}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      <button
                        className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-lg font-medium transition-all duration-200"
                        onClick={() => startDailySupportRecord(student)}
                      >
                        📝 支援記録
                      </button>
                      <button
                        className="px-3 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                        onClick={() => startOfficeVisit(student)}
                      >
                        🏢 通所
                      </button>
                      <button
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                        onClick={() => startWeeklyEvaluation(student)}
                      >
                        📊 評価(週次)
                      </button>
                      <button
                        className="px-3 py-2 bg-purple-500 hover:bg-purple-600 text-white rounded-lg font-medium transition-all duration-200 text-sm"
                        onClick={() => startMonthlyEvaluation(student)}
                      >
                        📈 達成度評価
                      </button>
                      <button
                        className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium transition-all duration-200"
                        onClick={() => startUserDetail(student)}
                      >
                        👤 利用者詳細
                      </button>
                      <button
                        className="px-3 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-medium hover:bg-red-200 transition-all duration-200"
                        onClick={() => handleRemoveHomeSupport(student)}
                      >
                        解除
                      </button>
                    </div>
                  </td>
                </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 在宅支援利用者追加モーダル */}
      <HomeSupportUserAdditionModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={handleAddUsersSuccess}
      />

      {/* 支援記録モーダル */}
      {showDailySupportRecordModal && selectedStudentForDailyRecord && (
        <DailySupportRecordModal
          isOpen={showDailySupportRecordModal}
          onClose={() => {
            setShowDailySupportRecordModal(false);
            setSelectedStudentForDailyRecord(null);
          }}
          onSave={(data) => {
            console.log('支援記録を保存:', data);
            setShowDailySupportRecordModal(false);
            setSelectedStudentForDailyRecord(null);
            fetchHomeSupportUsers();
            fetchEvaluationStatus();
          }}
          student={{
            id: selectedStudentForDailyRecord.id,
            name: selectedStudentForDailyRecord.name,
            recipientNumber: selectedStudentForDailyRecord.email
          }}
          date={new Date().toISOString().split('T')[0]}
        />
      )}

      {/* 通所記録モーダル */}
      {showOfficeVisitModal && selectedStudentForOfficeVisit && (
        <OfficeVisitModal
          isOpen={showOfficeVisitModal}
          onClose={() => {
            setShowOfficeVisitModal(false);
            setSelectedStudentForOfficeVisit(null);
          }}
          onSave={handleSaveOfficeVisit}
          student={{
            id: selectedStudentForOfficeVisit.id,
            name: selectedStudentForOfficeVisit.name
          }}
        />
      )}

      {/* 利用者詳細モーダル */}
      {showUserDetailModal && selectedStudentForDetail && (
        <HomeSupportUserDetailModal
          isOpen={showUserDetailModal}
          onClose={() => {
            setShowUserDetailModal(false);
            setSelectedStudentForDetail(null);
          }}
          onSave={() => {
            // データを再取得
            fetchHomeSupportUsers();
            fetchEvaluationStatus();
          }}
          student={selectedStudentForDetail}
        />
      )}
    </div>
  );
};

export default HomeSupportTab;

