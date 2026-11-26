import { getCurrentJapanTime, formatJapanDate } from './dateUtils';
import {
  apiGet,
  getPendingApprovals,
  getPendingSubmissions,
  getSatelliteHomeSupportUsersWithDailyRecords,
  getSatelliteEvaluationStatus,
  getSatelliteSupportPlanStatus,
} from './api';

const parseJapanDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return value;

  const stringValue = String(value).trim();
  if (!stringValue) return null;

  const parsed = new Date(`${stringValue}T00:00:00+09:00`);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  const fallback = new Date(stringValue);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
};

const calculateDaysSince = (targetDateValue, now) => {
  const targetDate = parseJapanDate(targetDateValue);
  if (!targetDate) return null;

  const days = Math.floor((now.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));
  return days < 0 ? 0 : days;
};

export const groupHomeSupportUsers = (records) => {
  const userMap = new Map();

  (records || []).forEach((record) => {
    const userId = record.id;
    if (!userMap.has(userId)) {
      userMap.set(userId, {
        id: record.id,
        name: record.name,
        dailyRecords: [],
      });
    }

    if (record.daily_record_id) {
      userMap.get(userId).dailyRecords.push({
        date: record.record_date ? formatJapanDate(record.record_date) : null,
        markEnd: record.mark_end,
        recorderName: record.recorder_name,
      });
    }
  });

  userMap.forEach((userEntry) => {
    userEntry.dailyRecords.sort((a, b) => {
      const dateA = a.date ? new Date(a.date) : null;
      const dateB = b.date ? new Date(b.date) : null;
      if (dateA && dateB) return dateB - dateA;
      if (dateA) return -1;
      if (dateB) return 1;
      return 0;
    });
  });

  return Array.from(userMap.values());
};

export const buildRecordAlerts = ({ evaluationUsers, students, now }) => {
  const dailyRecord = [];
  const weeklyRecord = [];
  const monthlyRecord = [];

  (evaluationUsers || []).forEach((user) => {
    if (user.dailyStatus === '未完了') {
      const userData = students.find((student) => student.id === user.id);
      if (userData && userData.dailyRecords && userData.dailyRecords.length > 0) {
        const latestRecord = userData.dailyRecords[0];
        if (latestRecord.markEnd && !latestRecord.recorderName) {
          dailyRecord.push({
            userId: user.id,
            userName: user.name,
            date: latestRecord.date,
          });
        }
      }
    }

    if (user.weeklyStatus === '未完了') {
      const userData = students.find((student) => student.id === user.id);

      const getOldestPendingDailyRecordDate = () => {
        if (!userData || !Array.isArray(userData.dailyRecords) || userData.dailyRecords.length === 0) {
          return null;
        }

        const lastWeeklyReference = user.lastWeeklyPeriodEnd || user.lastWeeklyRecordDate;
        const lastWeeklyDate = parseJapanDate(lastWeeklyReference);
        const sortedDailyRecords = [...userData.dailyRecords].sort((a, b) => {
          const dateA = parseJapanDate(a.date);
          const dateB = parseJapanDate(b.date);
          if (dateA && dateB) return dateB - dateA;
          if (dateA) return -1;
          if (dateB) return 1;
          return 0;
        });
        const pendingRecords = sortedDailyRecords.filter((record) => {
          const recordDate = parseJapanDate(record.date);
          if (!recordDate) return false;
          if (!lastWeeklyDate) return true;
          return recordDate > lastWeeklyDate;
        });

        if (pendingRecords.length === 0) return null;
        return pendingRecords[pendingRecords.length - 1]?.date || null;
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
      const daysSinceRecord = calculateDaysSince(referenceDate, now);

      if (daysSinceRecord !== null && daysSinceRecord >= 7) {
        weeklyRecord.push({
          userId: user.id,
          userName: user.name,
          daysAgo: daysSinceRecord,
        });
      }
    }

    if (user.monthlyStatus === '未完了') {
      const userData = students.find((student) => student.id === user.id);
      if (userData && userData.dailyRecords && userData.dailyRecords.length > 0) {
        const latestRecord = userData.dailyRecords[0];
        const recordDate = new Date(latestRecord.date);
        const recordMonth = recordDate.getMonth();
        const recordYear = recordDate.getFullYear();
        if (now.getFullYear() > recordYear || (now.getFullYear() === recordYear && now.getMonth() > recordMonth)) {
          monthlyRecord.push({
            userId: user.id,
            userName: user.name,
            recordDate: latestRecord.date,
          });
        }
      }
    }
  });

  return { dailyRecord, weeklyRecord, monthlyRecord };
};

export const buildSupportPlanAlerts = (plans, now = new Date()) => {
  const supportPlan = [];

  (plans || []).forEach((plan) => {
    if (plan.status === 'no_record') {
      supportPlan.push({
        userId: plan.user_id,
        userName: plan.user_name,
        status: 'no_record',
        message: `${plan.user_name}さんの個別支援計画がありません`,
      });
      return;
    }

    if (plan.status === 'no_goal_date' || !plan.goal_date || plan.goal_date === '') {
      supportPlan.push({
        userId: plan.user_id,
        userName: plan.user_name,
        status: 'no_goal_date',
        message: '個別支援計画の目標達成予定日を設定してください',
      });
      return;
    }

    if (plan.status === 'has_goal_date' && plan.goal_date) {
      const goalDate = new Date(plan.goal_date);
      const oneMonthBefore = new Date(goalDate);
      oneMonthBefore.setMonth(oneMonthBefore.getMonth() - 1);
      if (now >= oneMonthBefore) {
        supportPlan.push({
          userId: plan.user_id,
          userName: plan.user_name,
          status: 'update_needed',
          goalDate: plan.goal_date,
          daysUntilGoal: Math.ceil((goalDate - now) / (1000 * 60 * 60 * 24)),
          message: '個別支援計画を更新してください',
        });
      }
    }
  });

  return supportPlan;
};

const countList = (response) => (response?.success && Array.isArray(response.data) ? response.data.length : 0);

export const emptyDashboardWarnings = {
  approvals: 0,
  submissions: 0,
  unreadMessages: 0,
  dailyRecord: 0,
  weeklyRecord: 0,
  monthlyRecord: 0,
  supportPlan: 0,
};

export const loadDashboardWarnings = async (satelliteId) => {
  if (!satelliteId) return emptyDashboardWarnings;

  const [approvals, submissions, messages, users, evaluation, plans] = await Promise.allSettled([
    getPendingApprovals(satelliteId),
    getPendingSubmissions(satelliteId),
    apiGet('/api/messages/unread-count'),
    getSatelliteHomeSupportUsersWithDailyRecords(satelliteId, null, null),
    getSatelliteEvaluationStatus(satelliteId),
    getSatelliteSupportPlanStatus(satelliteId),
  ]);

  const fulfilled = (result) => (result.status === 'fulfilled' ? result.value : null);
  const userResponse = fulfilled(users);
  const evaluationResponse = fulfilled(evaluation);
  const planResponse = fulfilled(plans);
  const messageResponse = fulfilled(messages);
  const students = userResponse?.success ? groupHomeSupportUsers(userResponse.data) : [];
  const recordAlerts = evaluationResponse?.success
    ? buildRecordAlerts({
      evaluationUsers: evaluationResponse.data,
      students,
      now: getCurrentJapanTime(),
    })
    : { dailyRecord: [], weeklyRecord: [], monthlyRecord: [] };
  const supportPlan = planResponse?.success ? buildSupportPlanAlerts(planResponse.data) : [];

  return {
    approvals: countList(fulfilled(approvals)),
    submissions: countList(fulfilled(submissions)),
    unreadMessages: messageResponse?.success ? (messageResponse.data?.unread_count || 0) : 0,
    dailyRecord: recordAlerts.dailyRecord.length,
    weeklyRecord: recordAlerts.weeklyRecord.length,
    monthlyRecord: recordAlerts.monthlyRecord.length,
    supportPlan: supportPlan.length,
  };
};
