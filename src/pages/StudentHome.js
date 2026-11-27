import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/contexts/AuthContext';
import StudentVoiceCareView from '../components/StudentVoiceCareView';
import CertificateList from '../components/CertificateList';
import { fetchStudentCourses } from '../utils/studentApi';
import { API_BASE_URL } from '../config/apiConfig';

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

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  'Content-Type': 'application/json',
});

const pickResumeLesson = (lessons) => {
  if (!Array.isArray(lessons) || lessons.length === 0) return null;
  return [...lessons].sort((left, right) => {
    const leftTime = new Date(left.last_accessed_at || 0).getTime();
    const rightTime = new Date(right.last_accessed_at || 0).getTime();
    return rightTime - leftTime;
  })[0];
};

const fileNameOf = (key) => {
  if (!key) return '';
  const parts = String(key).split('/');
  return parts[parts.length - 1].trim().toLowerCase();
};

const youtubeThumbnailUrl = (url) => {
  if (!url) return '';
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (!match) return '';
  return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`;
};

const pickResumeVideo = (sections, textKey) => {
  const list = [...(sections || [])].sort(
    (left, right) => Number(left.link_order || 0) - Number(right.link_order || 0)
  );
  const targetName = fileNameOf(textKey);
  const matched = targetName
    ? list.find((section) => fileNameOf(section.text_file_key) === targetName && section.youtube_url)
    : null;
  const section = matched || list.find((item) => item.youtube_url);
  if (!section) return null;
  const thumbnailUrl = section.thumbnail_url || youtubeThumbnailUrl(section.youtube_url);
  if (!thumbnailUrl) return null;
  return {
    thumbnailUrl,
    title: section.video_title || section.section_title || '',
  };
};

const isCourseRecordComplete = (course) => {
  if (Number(course.progress_percentage || 0) >= 100) return true;
  if (course.completion_date) return true;
  const status = String(course.status || course.enrollment_status || '').toLowerCase();
  if (status === 'completed') return true;
  const total = Number(course.total_lessons || 0);
  const completed = Number(course.completed_lessons || 0);
  return total > 0 && completed >= total;
};

const isLessonComplete = (lesson) => (lesson?.status || lesson?.progress_status) === 'completed';

const sortCourseLessons = (lessons) => [...(lessons || [])].sort((left, right) => {
  const orderDiff = Number(left.order_index || 0) - Number(right.order_index || 0);
  if (orderDiff !== 0) return orderDiff;
  return Number(left.id) - Number(right.id);
});

const loadCourseVideo = async (course) => {
  const lessonResponse = await fetch(
    `${API_BASE_URL}/api/student/lessons?courseId=${course.id}`,
    { headers: authHeaders() }
  );
  const lessonData = lessonResponse.ok ? await lessonResponse.json() : { data: [] };
  const lessons = sortCourseLessons(lessonData.data);
  const openLessons = lessons.filter((lesson) => !isLessonComplete(lesson));
  if (lessons.length > 0 && openLessons.length === 0) {
    return { complete: true, video: null };
  }

  let lessonId = null;
  let textKey = null;
  const currentResponse = await fetch(
    `${API_BASE_URL}/api/learning/current-lesson?courseId=${course.id}`,
    { headers: authHeaders() }
  );
  if (currentResponse.ok) {
    const currentData = await currentResponse.json();
    const current = pickResumeLesson((currentData.data || []).filter((item) => !isLessonComplete(item)));
    if (current?.lesson_id) {
      lessonId = current.lesson_id;
      textKey = current.last_viewed_section_text_key;
    }
  }

  if (!lessonId) {
    const visited = openLessons
      .filter((lesson) => lesson.last_accessed_at)
      .sort((left, right) => new Date(right.last_accessed_at) - new Date(left.last_accessed_at));
    const target = visited[0] || openLessons[0];
    if (!target) return { complete: true, video: null };
    lessonId = target.id;
  }

  const videoResponse = await fetch(
    `${API_BASE_URL}/api/lesson-text-video-links/lesson/${lessonId}`,
    { headers: authHeaders() }
  );
  if (!videoResponse.ok) return { complete: false, video: null };
  const videoData = await videoResponse.json();
  return {
    complete: false,
    video: pickResumeVideo(videoData.data, textKey),
  };
};

const recommendCourses = (courses, resumeCourseId) => {
  return (courses || [])
    .filter((course) => Number(course.id) !== Number(resumeCourseId))
    .filter((course) => !isCourseRecordComplete(course))
    .sort((left, right) => {
      const leftRequired = left.category === '必修科目' ? 0 : 1;
      const rightRequired = right.category === '必修科目' ? 0 : 1;
      if (leftRequired !== rightRequired) return leftRequired - rightRequired;
      return Number(right.progress_percentage || 0) - Number(left.progress_percentage || 0);
    })
    .slice(0, 4);
};

const StudentHome = ({ messageRefreshSignal = 0, onOpenLessons }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [resumeLesson, setResumeLesson] = useState(null);
  const [resumeVideo, setResumeVideo] = useState(null);
  const [recommendedCourses, setRecommendedCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openingCourseId, setOpeningCourseId] = useState(null);
  const [badgeCount, setBadgeCount] = useState(null);

  useEffect(() => {
    const loadHome = async () => {
      if (!currentUser?.id) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);
        setBadgeCount(null);
        const [coursesResponse, currentLessonResponse, certificateResponse] = await Promise.all([
          fetchStudentCourses(),
          fetch(`${API_BASE_URL}/api/learning/current-lesson`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/api/learning/certificates/${currentUser.id}`, { headers: authHeaders() }),
        ]);

        try {
          if (certificateResponse.ok) {
            const certificateData = await certificateResponse.json();
            if (certificateData.success && Array.isArray(certificateData.data)) {
              setBadgeCount(certificateData.data.length);
            }
          }
        } catch (certificateError) {
          console.error('修了証件数の取得に失敗しました:', certificateError);
        }

        const enrolled = coursesResponse?.success ? (coursesResponse.data || []) : [];
        let lesson = null;

        if (currentLessonResponse.ok) {
          const currentLessonData = await currentLessonResponse.json();
          lesson = pickResumeLesson(currentLessonData.data);
          setResumeLesson(lesson);
          if (lesson?.lesson_id) {
            try {
              const videoResponse = await fetch(
                `${API_BASE_URL}/api/lesson-text-video-links/lesson/${lesson.lesson_id}`,
                { headers: authHeaders() }
              );
              if (videoResponse.ok) {
                const videoData = await videoResponse.json();
                setResumeVideo(pickResumeVideo(videoData.data, lesson.last_viewed_section_text_key));
              } else {
                setResumeVideo(null);
              }
            } catch (videoError) {
              console.error('動画サムネイルの取得に失敗しました:', videoError);
              setResumeVideo(null);
            }
          } else {
            setResumeVideo(null);
          }
        } else {
          setResumeLesson(null);
          setResumeVideo(null);
        }

        const ranked = recommendCourses(enrolled, lesson?.course_id);
        const decorated = await Promise.all(ranked.map(async (course) => {
          try {
            return { course, ...(await loadCourseVideo(course)) };
          } catch (videoError) {
            console.error('おすすめコースのサムネイル取得に失敗しました:', videoError);
            return { course, complete: false, video: null };
          }
        }));
        setRecommendedCourses(
          decorated
            .filter((item) => !item.complete)
            .slice(0, 4)
            .map((item) => ({ ...item.course, video: item.video }))
        );
      } catch (loadError) {
        console.error('ダッシュボードの取得に失敗しました:', loadError);
        setError('学習情報を読み込めませんでした。');
      } finally {
        setLoading(false);
      }
    };

    loadHome();
  }, [currentUser?.id]);

  const rememberLesson = async (lessonId) => {
    try {
      await fetch(`${API_BASE_URL}/api/learning/progress/lesson`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify({
          userId: parseInt(currentUser.id, 10),
          lessonId: parseInt(lessonId, 10),
          status: 'in_progress',
          forceUpdate: true,
        }),
      });
    } catch (updateError) {
      console.warn('最終アクセス日時の更新に失敗しました（遷移は継続）:', updateError);
    }
  };

  const openLesson = async (courseId, lessonId) => {
    await rememberLesson(lessonId);
    navigate(`/student/enhanced-learning?course=${courseId}&lesson=${lessonId}`);
  };

  const openCourse = async (courseId) => {
    setOpeningCourseId(courseId);
    try {
      const currentLessonResponse = await fetch(
        `${API_BASE_URL}/api/learning/current-lesson?courseId=${courseId}`,
        { headers: authHeaders() }
      );
      if (currentLessonResponse.ok) {
        const currentLessonData = await currentLessonResponse.json();
        const currentLesson = pickResumeLesson(
          (currentLessonData.data || []).filter((item) => !isLessonComplete(item))
        );
        if (currentLesson?.lesson_id) {
          await openLesson(courseId, currentLesson.lesson_id);
          return;
        }
      }

      const progressResponse = await fetch(
        `${API_BASE_URL}/api/learning/progress/${currentUser.id}`,
        { headers: authHeaders() }
      );
      if (progressResponse.ok) {
        const progressData = await progressResponse.json();
        const targetCourse = (progressData.data || []).find(
          (course) => Number(course.course_id) === Number(courseId)
        );
        const lesson = targetCourse?.lessons?.find((item) => item.status !== 'completed')
          || targetCourse?.lessons?.[0];
        if (lesson?.id) {
          await openLesson(courseId, lesson.id);
          return;
        }
      }

      if (onOpenLessons) onOpenLessons(courseId);
    } catch (openError) {
      console.error('学習開始エラー:', openError);
      if (onOpenLessons) onOpenLessons(courseId);
    } finally {
      setOpeningCourseId(null);
    }
  };

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <section className="md:col-span-2 bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-2xl font-bold text-gray-800">前回の続きから学習</h2>
            {!loading && !error && resumeLesson && (
              <button
                type="button"
                className="px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
                onClick={() => openLesson(resumeLesson.course_id, resumeLesson.lesson_id)}
              >
                続きから学習
              </button>
            )}
          </div>
          <div className="mt-4 grid grid-cols-1 items-center gap-4 sm:grid-cols-2">
            {resumeVideo?.thumbnailUrl && (
              <img
                src={resumeVideo.thumbnailUrl}
                alt={resumeVideo.title || resumeLesson.lesson_title}
                className="w-40 justify-self-center aspect-video object-cover rounded-xl bg-gray-100"
                onError={() => setResumeVideo(null)}
              />
            )}
            <div>
              {loading && <p className="text-gray-500">読み込み中...</p>}
              {!loading && error && <p className="text-red-600">{error}</p>}
              {!loading && !error && resumeLesson && (
                <>
                  <p className="text-sm text-gray-500">{resumeLesson.course_title}</p>
                  <p className="mt-1 text-xl font-semibold text-gray-800">{resumeLesson.lesson_title}</p>
                  {resumeLesson.last_accessed_at && (
                    <p className="mt-2 text-sm text-gray-500">
                      最後に開いた日: {formatJapanDate(resumeLesson.last_accessed_at)}
                    </p>
                  )}
                </>
              )}
              {!loading && !error && !resumeLesson && (
                <p className="text-gray-500">まだ続きから始められる学習はありません。</p>
              )}
            </div>
          </div>
        </section>

        <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100 flex flex-col">
          <h2 className="text-2xl font-bold text-gray-800">現在の取得バッジ</h2>
          <p className="mt-4 text-sm text-gray-500">修了証</p>
          {loading && <p className="mt-2 text-gray-500">読み込み中...</p>}
          {!loading && badgeCount === null && (
            <p className="mt-2 text-red-600">修了証の件数を取得できませんでした。</p>
          )}
          {!loading && badgeCount !== null && (
            <p className="mt-2 text-4xl font-bold text-gray-800">
              {badgeCount}
              <span className="ml-1 text-lg font-medium text-gray-600">個</span>
            </p>
          )}
          <button
            type="button"
            className="mt-auto self-end px-5 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium"
            onClick={() => navigate('/student/account')}
          >
            マイページ
          </button>
        </section>
      </div>

      <StudentVoiceCareView
        studentId={currentUser?.id}
        studentName={currentUser?.name}
        refreshSignal={messageRefreshSignal}
        heading="メッセージ"
        description="指導員からの連絡と、あなたの相談です。"
      />

      {resumeLesson?.course_id && (
        <CertificateList variant="current" courseId={resumeLesson.course_id} />
      )}

      <section>
        <h2 className="text-2xl font-bold text-gray-800 mb-4">おすすめ受講コース</h2>
        {loading && <p className="text-gray-500">読み込み中...</p>}
        {!loading && !error && recommendedCourses.length === 0 && (
          <p className="text-gray-500">いまおすすめできるコースはありません。</p>
        )}
        {!loading && recommendedCourses.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {recommendedCourses.map((course) => {
              const progress = Math.round(Number(course.progress_percentage || 0));
              return (
                <article key={course.id} className="bg-white rounded-2xl shadow-xl p-5 border border-gray-100">
                  {course.video?.thumbnailUrl && (
                    <img
                      src={course.video.thumbnailUrl}
                      alt={course.video.title || course.title}
                      className="float-left mr-4 mb-3 w-1/2 aspect-video object-cover rounded-xl bg-gray-100"
                      onError={() => setRecommendedCourses((current) => current.map((item) => (
                        item.id === course.id ? { ...item, video: null } : item
                      )))}
                    />
                  )}
                  <h3 className="font-semibold text-gray-800 leading-snug">
                    {course.title}
                    {course.category && (
                      <span className="ml-2 inline-block whitespace-nowrap text-xs font-normal text-gray-500">{course.category}</span>
                    )}
                  </h3>
                  {course.description && course.description.trim() !== '' && (
                    <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3 whitespace-pre-line">
                      {course.description.trim()}
                    </p>
                  )}
                  <div className="clear-both" />
                  <p className="mt-3 text-sm text-gray-500">
                    {course.completed_lessons || 0}/{course.total_lessons || 0} レッスン
                    <span className="ml-2">{progress}%</span>
                  </p>
                  <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-blue-500"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium disabled:opacity-60"
                      disabled={openingCourseId === course.id}
                      onClick={() => openCourse(course.id)}
                    >
                      学習する
                    </button>
                    <button
                      type="button"
                      className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700"
                      onClick={() => navigate(`/student/curriculum/${course.id}`)}
                    >
                      一覧
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default StudentHome;
