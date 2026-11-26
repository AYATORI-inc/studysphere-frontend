import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';
import { API_BASE_URL } from '../config/apiConfig';
import StudentLearningPage from './StudentLearningPage';

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  'Content-Type': 'application/json',
});

const sectionLabel = (section) => {
  const title = String(section.section_title || section.video_title || '').trim();
  if (title) return title;
  const file = String(section.text_file_key || '').split('/').pop() || '';
  return file.replace(/\.md$/i, '').trim();
};

const youtubeThumbnailUrl = (url) => {
  if (!url) return '';
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
};

const mapPool = async (items, limit, worker) => {
  const results = new Array(items.length);
  let next = 0;
  const run = async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
};

const activeLessons = (lessons) => (Array.isArray(lessons) ? lessons : [])
  .filter((lesson) => lesson.status === 'active' || lesson.status === undefined)
  .sort((left, right) => Number(left.order || left.order_index || 0) - Number(right.order || right.order_index || 0));

const CourseCards = ({ courses, onOpen }) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
    {courses.map((course) => (
      <button
        key={course.id}
        type="button"
        onClick={() => onOpen(course.id)}
        className="block bg-white rounded-2xl shadow-xl p-5 border border-gray-100 text-left hover:border-gray-300"
      >
        {course.thumbnailUrl && (
          <img
            src={course.thumbnailUrl}
            alt=""
            className="float-left mr-4 mb-3 w-1/2 aspect-video object-cover rounded-xl bg-gray-100"
          />
        )}
        <h3 className="font-semibold text-gray-800 leading-snug">
          {course.title}
          {course.category && (
            <span className="ml-2 inline-block whitespace-nowrap text-xs font-normal text-gray-500">
              {course.category}
            </span>
          )}
        </h3>
        {course.description && String(course.description).trim() !== '' && (
          <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3 whitespace-pre-line">
            {String(course.description).trim()}
          </p>
        )}
        <div className="clear-both" />
        <p className="mt-3 text-sm text-gray-500">
          全{course.total_lessons || course.lesson_count || 0}レッスン
        </p>
      </button>
    ))}
  </div>
);

const InstructorCoursePreviewPage = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser } = useInstructorGuard();
  const satelliteId = useMemo(() => getCurrentUserSatelliteId(currentUser), [currentUser]);
  const view = searchParams.get('view') === 'catalog' ? 'catalog' : 'home';
  const courseId = searchParams.get('course');
  const lessonId = searchParams.get('lesson');
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState('');
  const [courseDetail, setCourseDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!satelliteId) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(
          `${API_BASE_URL}/api/user-courses/satellite/${satelliteId}/available-courses`,
          { headers: authHeaders() }
        );
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) {
          throw new Error(data.message || 'カリキュラムを読み込めませんでした。');
        }
        const listed = (Array.isArray(data.data) ? data.data : []).map((course) => ({
          ...course,
          searchText: [course.title, course.description].filter(Boolean).join('\n').toLowerCase(),
          thumbnailUrl: '',
        }));
        if (cancelled) return;
        setCourses(listed);
        setLoading(false);
        const indexed = await mapPool(listed, 2, async (course) => {
          try {
            const courseResponse = await fetch(`${API_BASE_URL}/api/courses/${course.id}`, { headers: authHeaders() });
            const courseJson = courseResponse.ok ? await courseResponse.json() : {};
            const lessons = activeLessons(courseJson?.data?.lessons);
            const firstLesson = lessons[0];
            let thumbnailUrl = '';
            if (firstLesson?.id) {
              const videoResponse = await fetch(
                `${API_BASE_URL}/api/lesson-text-video-links/lesson/${firstLesson.id}`,
                { headers: authHeaders() }
              );
              if (videoResponse.ok) {
                const videoData = await videoResponse.json();
                const sections = Array.isArray(videoData.data) ? videoData.data : [];
                const first = [...sections].sort(
                  (left, right) => Number(left.link_order || 0) - Number(right.link_order || 0)
                ).find((section) => section.thumbnail_url || section.youtube_url);
                thumbnailUrl = first?.thumbnail_url || youtubeThumbnailUrl(first?.youtube_url);
              }
            }
            const sectionGroups = await mapPool(lessons, 4, async (lesson) => {
              const videoResponse = await fetch(
                `${API_BASE_URL}/api/lesson-text-video-links/lesson/${lesson.id}`,
                { headers: authHeaders() }
              );
              if (!videoResponse.ok) return [];
              const videoData = await videoResponse.json();
              return Array.isArray(videoData.data) ? videoData.data : [];
            });
            const searchText = [
              course.title,
              course.description,
              ...lessons.flatMap((lesson) => [lesson.title, lesson.description]),
              ...sectionGroups.flat().flatMap((section) => [
                section.section_title,
                section.video_title,
                sectionLabel(section),
              ]),
            ].filter(Boolean).join('\n').toLowerCase();
            return { ...course, searchText, thumbnailUrl, total_lessons: course.total_lessons || lessons.length };
          } catch (indexError) {
            console.error('プレビュー用カリキュラムの取得に失敗しました:', indexError);
            return course;
          }
        });
        if (!cancelled) setCourses(indexed);
      } catch (loadError) {
        console.error('プレビュー用カリキュラム一覧の取得に失敗しました:', loadError);
        if (!cancelled) {
          setError('カリキュラムを読み込めませんでした。');
          setLoading(false);
        }
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [satelliteId]);

  useEffect(() => {
    if (!courseId || lessonId) {
      setCourseDetail(null);
      return undefined;
    }
    let cancelled = false;
    const loadCourse = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`${API_BASE_URL}/api/courses/${courseId}`, { headers: authHeaders() });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.success) throw new Error(data.message || 'レッスンを読み込めませんでした。');
        const lessons = activeLessons(data.data?.lessons);
        const withSections = await mapPool(lessons, 4, async (lesson, index) => {
          const videoResponse = await fetch(
            `${API_BASE_URL}/api/lesson-text-video-links/lesson/${lesson.id}`,
            { headers: authHeaders() }
          );
          const videoData = videoResponse.ok ? await videoResponse.json() : { data: [] };
          const sections = [...(videoData.data || [])]
            .sort((left, right) => Number(left.link_order || 0) - Number(right.link_order || 0))
            .map((section, sectionIndex) => ({
              id: section.id ?? `${lesson.id}-${sectionIndex}`,
              label: sectionLabel(section),
            }))
            .filter((section) => section.label);
          return {
            id: lesson.id,
            number: index + 1,
            title: lesson.title,
            description: lesson.description,
            duration: lesson.duration,
            sections,
          };
        });
        if (cancelled) return;
        setCourseDetail({
          id: data.data?.id,
          title: data.data?.title,
          description: data.data?.description,
          category: data.data?.category,
          lessons: withSections,
        });
      } catch (loadError) {
        console.error('プレビュー用レッスンの取得に失敗しました:', loadError);
        if (!cancelled) setError('レッスンを読み込めませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadCourse();
    return () => {
      cancelled = true;
    };
  }, [courseId, lessonId]);

  const openCourse = (id) => {
    const params = new URLSearchParams(searchParams);
    params.set('course', String(id));
    params.delete('lesson');
    params.delete('section');
    setSearchParams(params);
  };

  const openLesson = (id) => {
    const params = new URLSearchParams(searchParams);
    params.set('course', String(courseId));
    params.set('lesson', String(id));
    setSearchParams(params);
  };

  const showView = (nextView) => {
    const params = new URLSearchParams();
    if (nextView === 'catalog') params.set('view', 'catalog');
    setSearchParams(params);
  };

  if (courseId && lessonId) {
    return <StudentLearningPage preview />;
  }

  if (!currentUser) {
    return (
      <div className="student-shell min-h-screen flex items-center justify-center">
        <p className="text-gray-600">読み込み中...</p>
      </div>
    );
  }

  const needle = query.trim().toLowerCase();
  const visibleCourses = needle
    ? courses.filter((course) => (course.searchText || '').includes(needle))
    : courses;

  return (
    <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex flex-col">
      <div className="student-chrome bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                <button type="button" className="hover:underline" onClick={() => showView('home')}>
                  Study Sphere
                </button>
              </h1>
              <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">利用者</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-lg font-medium text-white bg-white/15">閲覧用ユーザーさん</span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg font-medium text-white bg-white/15 hover:bg-white/25 transition-colors"
                onClick={() => navigate('/instructor/dashboard')}
              >
                スタッフ画面へ戻る
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="student-nav bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              className={`px-4 py-2 rounded-lg font-medium ${
                !courseId && view === 'home'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => showView('home')}
            >
              ダッシュボード
            </button>
            <button
              type="button"
              className={`px-4 py-2 rounded-lg font-medium ${
                !courseId && view === 'catalog'
                  ? 'bg-blue-500 text-white'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              onClick={() => showView('catalog')}
            >
              レッスン一覧
            </button>
            <span className="ml-auto text-sm text-gray-500">閲覧用ユーザーの画面です</span>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        {!satelliteId && (
          <p className="text-red-600">拠点が選択されていません。スタッフ画面で拠点を選んでから開いてください。</p>
        )}
        {satelliteId && !courseId && view === 'home' && (
          <div className="space-y-8">
            <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
              <h2 className="text-2xl font-bold text-gray-800">修了証</h2>
              <p className="mt-3 text-sm text-gray-600">
                プレビューでは、個人の修了証は表示しません。利用者の画面では、取得した修了証がここに並びます。
              </p>
            </section>
            <section>
              <h2 className="text-2xl font-bold text-gray-800 mb-4">拠点で使えるカリキュラム</h2>
              {loading && courses.length === 0 && <p className="text-gray-500">読み込み中...</p>}
              {error && <p className="text-red-600">{error}</p>}
              {!error && courses.length === 0 && !loading && (
                <p className="text-gray-500">表示できるカリキュラムはありません。</p>
              )}
              {courses.length > 0 && <CourseCards courses={courses} onOpen={openCourse} />}
            </section>
          </div>
        )}
        {satelliteId && !courseId && view === 'catalog' && (
          <div className="space-y-6">
            <section className="bg-white rounded-2xl shadow-xl p-5 border border-gray-100">
              <label htmlFor="preview-curriculum-search" className="block text-sm font-medium text-gray-700">
                カリキュラム、レッスン、セクションで探す
              </label>
              <input
                id="preview-curriculum-search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="名前や説明を入力"
                className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800"
              />
            </section>
            {loading && courses.length === 0 && <p className="text-gray-500">読み込み中...</p>}
            {error && <p className="text-red-600">{error}</p>}
            {!error && needle && visibleCourses.length === 0 && !loading && (
              <p className="text-gray-500">一致するカリキュラムはありません。</p>
            )}
            {visibleCourses.length > 0 && <CourseCards courses={visibleCourses} onOpen={openCourse} />}
          </div>
        )}
        {satelliteId && courseId && (
          <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <button
              type="button"
              className="text-sm text-gray-600 hover:text-gray-800"
              onClick={() => showView('catalog')}
            >
              レッスン一覧へ戻る
            </button>
            {loading && <p className="mt-4 text-gray-500">読み込み中...</p>}
            {error && <p className="mt-4 text-red-600">{error}</p>}
            {!loading && !error && courseDetail && (
              <>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <h2 className="text-2xl font-bold text-gray-800">{courseDetail.title}</h2>
                  {courseDetail.category && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">
                      {courseDetail.category}
                    </span>
                  )}
                </div>
                {courseDetail.description && (
                  <p className="mt-3 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                    {String(courseDetail.description).trim()}
                  </p>
                )}
                <p className="mt-4 text-sm text-gray-600">全{courseDetail.lessons.length}レッスン</p>
                <ol className="mt-6 space-y-4">
                  {courseDetail.lessons.map((lesson) => (
                    <li key={lesson.id} className="rounded-xl border border-gray-200 bg-gray-100 p-4 sm:p-5">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h3 className="font-semibold text-gray-800">{lesson.number}. {lesson.title}</h3>
                          {lesson.description && String(lesson.description).trim() !== '' && (
                            <p className="mt-2 text-sm text-gray-600 whitespace-pre-line">
                              {String(lesson.description).trim()}
                            </p>
                          )}
                          {lesson.duration && (
                            <p className="mt-3 text-sm text-gray-800">所要時間 {lesson.duration}</p>
                          )}
                        </div>
                        <button
                          type="button"
                          className="shrink-0 self-start px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium"
                          onClick={() => openLesson(lesson.id)}
                        >
                          受講する
                        </button>
                      </div>
                      {lesson.sections.length > 0 ? (
                        <ol className="mt-3 ml-5 list-decimal space-y-2 text-sm text-gray-800">
                          {lesson.sections.map((section) => (
                            <li key={section.id} className="rounded-lg bg-white px-3 py-2">{section.label}</li>
                          ))}
                        </ol>
                      ) : (
                        <p className="mt-3 text-sm text-gray-500">セクションはありません。</p>
                      )}
                    </li>
                  ))}
                </ol>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
};

export default InstructorCoursePreviewPage;
