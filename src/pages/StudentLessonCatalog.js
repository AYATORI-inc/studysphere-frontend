import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchStudentCourses, fetchStudentLessons } from '../utils/studentApi';
import { API_BASE_URL } from '../config/apiConfig';

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

const sortLessons = (lessons) => [...(Array.isArray(lessons) ? lessons : [])].sort((left, right) => {
  const orderDiff = Number(left.order_index || 0) - Number(right.order_index || 0);
  if (orderDiff !== 0) return orderDiff;
  return Number(left.id) - Number(right.id);
});

const youtubeThumbnailUrl = (url) => {
  if (!url) return '';
  const match = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  return match ? `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg` : '';
};

const firstThumbnail = (sections) => {
  const list = [...(sections || [])].sort(
    (left, right) => Number(left.link_order || 0) - Number(right.link_order || 0)
  );
  const section = list.find((item) => item.youtube_url || item.thumbnail_url);
  if (!section) return '';
  return section.thumbnail_url || youtubeThumbnailUrl(section.youtube_url);
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

const indexCourse = async (course) => {
  const lessonResponse = await fetchStudentLessons(course.id);
  const lessons = sortLessons(lessonResponse?.success ? lessonResponse.data : []);
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

  return {
    ...course,
    searchText,
    video: { thumbnailUrl: firstThumbnail(sectionGroups[0]) },
  };
};

const StudentLessonCatalog = () => {
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetchStudentCourses();
        const enrolled = response?.success ? (response.data || []) : [];
        const indexed = await mapPool(enrolled, 2, async (course) => {
          try {
            return await indexCourse(course);
          } catch (indexError) {
            console.error('カリキュラムの検索用データ取得に失敗しました:', indexError);
            return {
              ...course,
              searchText: [course.title, course.description].filter(Boolean).join('\n').toLowerCase(),
              video: null,
            };
          }
        });
        if (cancelled) return;
        setCourses(indexed);
      } catch (loadError) {
        console.error('カリキュラム一覧の取得に失敗しました:', loadError);
        if (!cancelled) setError('カリキュラム一覧を読み込めませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const needle = query.trim().toLowerCase();
  const visible = needle
    ? courses.filter((course) => (course.searchText || '').includes(needle))
    : courses;

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl shadow-xl p-5 border border-gray-100">
        <label htmlFor="curriculum-search" className="block text-sm font-medium text-gray-700">
          カリキュラム、レッスン、セクションで探す
        </label>
        <input
          id="curriculum-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="名前や説明を入力"
          className="mt-2 w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-gray-800"
        />
      </section>

      {loading && <p className="text-gray-500">読み込み中...</p>}
      {!loading && error && <p className="text-red-600">{error}</p>}
      {!loading && !error && needle && visible.length === 0 && (
        <p className="text-gray-500">一致するカリキュラムはありません。</p>
      )}
      {!loading && !error && !needle && visible.length === 0 && (
        <p className="text-gray-500">表示できるカリキュラムはありません。</p>
      )}
      {!loading && !error && visible.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visible.map((course) => {
            const progress = Math.round(Number(course.progress_percentage || 0));
            return (
              <Link
                key={course.id}
                to={`/student/curriculum/${course.id}`}
                className="block bg-white rounded-2xl shadow-xl p-5 border border-gray-100 hover:border-gray-300"
              >
                {course.video?.thumbnailUrl && (
                  <img
                    src={course.video.thumbnailUrl}
                    alt=""
                    className="float-left mr-4 mb-3 w-1/2 aspect-video object-cover rounded-xl bg-gray-100"
                    onError={(event) => {
                      event.currentTarget.remove();
                    }}
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
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default StudentLessonCatalog;
