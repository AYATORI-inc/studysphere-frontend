import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStudentGuard } from '../utils/hooks/useAuthGuard';
import { useAuth } from '../components/contexts/AuthContext';
import { fetchStudentCourses, fetchStudentLessons } from '../utils/studentApi';
import { API_BASE_URL } from '../config/apiConfig';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  'Content-Type': 'application/json',
});

const formatJapanDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const fileNameOf = (key) => {
  if (!key) return '';
  const parts = String(key).split('/');
  return parts[parts.length - 1].trim().toLowerCase();
};

const sectionLabel = (section) => {
  const title = String(section.section_title || section.video_title || '').trim();
  if (title) return title;
  const file = String(section.text_file_key || '').split('/').pop() || '';
  return file.replace(/\.md$/i, '').trim();
};

const lessonStatus = (lesson) => {
  const status = lesson.progress_status || lesson.status || 'not_started';
  if (status === 'completed') {
    return { id: 'completed', label: '受講済', className: 'bg-green-100 text-green-800' };
  }
  if (status === 'in_progress') {
    return { id: 'in_progress', label: '受講中', className: 'bg-white text-gray-800' };
  }
  return { id: 'not_started', label: '未受講', className: 'bg-white text-gray-600' };
};

const assignmentLabel = (lesson) => {
  const hasAssignment = lesson.has_assignment === 1 || lesson.has_assignment === true;
  if (!hasAssignment) return '';
  const approved = lesson.assignment_approved === 1
    || lesson.assignment_approved === true
    || lesson.instructor_approved === 1
    || lesson.instructor_approved === true;
  if (approved) return '課題 承認済';
  const submitted = lesson.assignment_submitted === 1 || lesson.assignment_submitted === true;
  if (submitted) return '課題 提出済';
  if (lesson.assignment_submitted_at) return '課題 再提出';
  return '課題 未提出';
};

const actionLabel = (statusId, isResume) => {
  if (statusId === 'completed') return 'もう一度見る';
  if (statusId === 'in_progress' || isResume) return '続きを受講';
  return '受講する';
};

const StudentCurriculumPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const { currentUser } = useStudentGuard();
  const { logout } = useAuth();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [resumeLessonId, setResumeLessonId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingLessonId, setOpeningLessonId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentUser?.id || !courseId) return;
      try {
        setLoading(true);
        setError(null);
        const [coursesResponse, lessonsResponse, currentResponse] = await Promise.all([
          fetchStudentCourses(),
          fetchStudentLessons(courseId),
          fetch(
            `${API_BASE_URL}/api/learning/current-lesson?courseId=${courseId}`,
            { headers: authHeaders() }
          ),
        ]);
        const enrolled = coursesResponse?.success ? (coursesResponse.data || []) : [];
        const found = enrolled.find((item) => Number(item.id) === Number(courseId)) || null;
        let resume = null;
        if (currentResponse.ok) {
          const currentData = await currentResponse.json();
          const rows = Array.isArray(currentData.data) ? currentData.data : [];
          resume = rows.find((item) => Number(item.course_id) === Number(courseId)) || rows[0] || null;
        }
        const resumeFile = fileNameOf(resume?.last_viewed_section_text_key);
        const lessonList = [...(lessonsResponse?.success ? (lessonsResponse.data || []) : [])].sort((left, right) => {
          const orderDiff = Number(left.order_index || 0) - Number(right.order_index || 0);
          if (orderDiff !== 0) return orderDiff;
          return Number(left.id) - Number(right.id);
        });
        const withSections = await Promise.all(lessonList.map(async (lesson, index) => {
          const status = lessonStatus(lesson);
          try {
            const response = await fetch(
              `${API_BASE_URL}/api/lesson-text-video-links/lesson/${lesson.id}`,
              { headers: authHeaders() }
            );
            const data = response.ok ? await response.json() : { data: [] };
            const sections = [...(data.data || [])]
              .sort((left, right) => Number(left.link_order || 0) - Number(right.link_order || 0))
              .map((section, sectionIndex) => ({
                id: section.id ?? `${lesson.id}-${sectionIndex}`,
                label: sectionLabel(section),
                isResume: Boolean(
                  resumeFile
                  && Number(lesson.id) === Number(resume?.lesson_id)
                  && fileNameOf(section.text_file_key) === resumeFile
                ),
              }))
              .filter((section) => section.label);
            return {
              ...lesson,
              number: index + 1,
              progressStatus: status.id,
              statusLabel: status.label,
              statusClassName: status.className,
              sections,
            };
          } catch (sectionError) {
            console.error('セクション名の取得に失敗しました:', sectionError);
            return {
              ...lesson,
              number: index + 1,
              progressStatus: status.id,
              statusLabel: status.label,
              statusClassName: status.className,
              sections: [],
            };
          }
        }));
        if (cancelled) return;
        setCourse(found);
        setLessons(withSections);
        setResumeLessonId(resume?.lesson_id ?? null);
      } catch (loadError) {
        console.error('カリキュラム詳細の取得に失敗しました:', loadError);
        if (!cancelled) setError('カリキュラムを読み込めませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, courseId]);

  const openLesson = async (lesson) => {
    setOpeningLessonId(lesson.id);
    try {
      if (lesson.progressStatus !== 'completed' && currentUser?.id) {
        await fetch(`${API_BASE_URL}/api/learning/progress/lesson`, {
          method: 'PUT',
          headers: authHeaders(),
          body: JSON.stringify({
            userId: parseInt(currentUser.id, 10),
            lessonId: parseInt(lesson.id, 10),
            status: 'in_progress',
          }),
        });
      }
    } catch (updateError) {
      console.warn('進捗の更新に失敗しました（遷移は継続）:', updateError);
    }
    navigate(`/student/enhanced-learning?course=${courseId}&lesson=${lesson.id}`);
  };

  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      localStorage.removeItem('autoLoginCode');
      localStorage.removeItem('tempPassword');
      localStorage.removeItem('loginCode');
      localStorage.removeItem('temp_password');
      localStorage.removeItem('autoLoginUser');
      localStorage.removeItem('autoLoginTarget');
      logout();
    }
  };

  const completedCount = lessons.filter((lesson) => lesson.progressStatus === 'completed').length;
  const inProgressCount = lessons.filter((lesson) => lesson.progressStatus === 'in_progress').length;
  const notStartedCount = lessons.filter((lesson) => lesson.progressStatus === 'not_started').length;
  const progressPercent = course ? Math.round(Number(course.progress_percentage || 0)) : 0;

  if (!currentUser) {
    return (
      <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">認証中...</div>
      </div>
    );
  }

  return (
    <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex flex-col">
      <div className="student-chrome bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                <Link to="/student/dashboard" className="hover:underline" title="ダッシュボードへ戻る">
                  Study Sphere
                </Link>
              </h1>
              <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">利用者</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg font-medium text-white bg-white/15 hover:bg-white/25 transition-colors"
                onClick={() => navigate('/student/account')}
                title="アカウント情報"
              >
                {currentUser.name}さん
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg font-medium text-white bg-white/15 hover:bg-white/25 transition-colors"
                onClick={handleLogout}
                title="ログアウト"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="student-nav bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200"
              onClick={() => navigate('/student/dashboard')}
            >
              📊 ダッシュボード
            </button>
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg"
              onClick={() => navigate('/student/dashboard', { state: { tab: 'lessons' } })}
            >
              📚 レッスン一覧
            </button>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          {loading && <p className="text-gray-500">読み込み中...</p>}
          {!loading && error && <p className="text-red-600">{error}</p>}
          {!loading && !error && !course && (
            <p className="text-gray-500">このカリキュラムは見られません。</p>
          )}
          {!loading && !error && course && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-bold text-gray-800">{course.title}</h2>
                {course.category && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600 whitespace-nowrap">
                    {course.category}
                  </span>
                )}
              </div>
              {course.description && course.description.trim() !== '' && (
                <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                  {course.description.trim()}
                </p>
              )}
              <p className="mt-4 text-sm text-gray-600">
                <span>受講済 {completedCount}</span>
                <span className="ml-3">受講中 {inProgressCount}</span>
                <span className="ml-3">未受講 {notStartedCount}</span>
                <span className="ml-3">全{lessons.length}レッスン</span>
                <span className="ml-3">進捗 {progressPercent}%</span>
              </p>
              {lessons.length === 0 ? (
                <p className="mt-6 text-sm text-gray-500">レッスンはありません。</p>
              ) : (
                <ol className="mt-6 space-y-4">
                  {lessons.map((lesson) => {
                    const isResume = Number(lesson.id) === Number(resumeLessonId);
                    const details = [
                      lesson.duration ? `所要時間 ${lesson.duration}` : '',
                      assignmentLabel(lesson),
                      Number(lesson.test_score) > 0 ? `テスト ${lesson.test_score}点` : '',
                      lesson.last_accessed_at
                        ? `最後に開いた日 ${formatJapanDate(lesson.last_accessed_at)}`
                        : '',
                    ].filter(Boolean);
                    return (
                      <li key={lesson.id} className="rounded-xl border border-gray-200 bg-gray-100 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="font-semibold text-gray-800">
                                {lesson.number}. {lesson.title}
                              </h3>
                              <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${lesson.statusClassName}`}>
                                {lesson.statusLabel}
                              </span>
                              {isResume && (
                                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white text-gray-800">
                                  前回の続き
                                </span>
                              )}
                            </div>
                            {lesson.description && String(lesson.description).trim() !== '' && (
                              <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                                {String(lesson.description).trim()}
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            className="shrink-0 self-start px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium disabled:opacity-60"
                            disabled={openingLessonId === lesson.id}
                            onClick={() => openLesson(lesson)}
                          >
                            {openingLessonId === lesson.id
                              ? '移動しています...'
                              : actionLabel(lesson.progressStatus, isResume)}
                          </button>
                        </div>
                        {details.length > 0 && (
                          <p className="mt-3 flex flex-wrap gap-4 text-sm text-gray-800">
                            {details.map((item) => (
                              <span key={item}>{item}</span>
                            ))}
                          </p>
                        )}
                        {lesson.sections.length > 0 ? (
                          <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-gray-800 marker:text-gray-400">
                            {lesson.sections.map((section) => (
                              <li key={section.id} className="rounded-lg bg-white px-3 py-2">
                                <span>{section.label}</span>
                                {section.isResume && (
                                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-800">
                                    前回の位置
                                  </span>
                                )}
                              </li>
                            ))}
                          </ol>
                        ) : (
                          <p className="mt-3 ml-4 text-sm text-gray-500 sm:ml-8">セクションはありません。</p>
                        )}
                      </li>
                    );
                  })}
                </ol>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
};

export default StudentCurriculumPage;
