import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import { apiGet } from '../../utils/api';

const coursesPerPage = 2;

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const byOrderThenTitle = (left, right, titleKey) => {
  const order = (Number(left.order_index) || 0) - (Number(right.order_index) || 0);
  if (order !== 0) return order;
  return (left[titleKey] || '').localeCompare(right[titleKey] || '', 'ja');
};

const AdminLessonsPage = () => {
  const [courses, setCourses] = useState([]);
  const [lessons, setLessons] = useState([]);
  const [query, setQuery] = useState('');
  const [pageIndex, setPageIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [coursePayload, lessonPayload] = await Promise.all([
          apiGet('/api/courses'),
          apiGet('/api/lessons'),
        ]);
        if (cancelled) return;
        setCourses(asList(coursePayload));
        setLessons(asList(lessonPayload));
      } catch (loadError) {
        if (cancelled) return;
        console.error('レッスン一覧の取得に失敗:', loadError);
        setError('レッスン一覧を取得できませんでした。');
        setCourses([]);
        setLessons([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const lessonsByCourse = new Map();
    lessons.forEach((lesson) => {
      const key = String(lesson.course_id ?? '');
      if (!key) return;
      if (!lessonsByCourse.has(key)) lessonsByCourse.set(key, []);
      lessonsByCourse.get(key).push(lesson);
    });

    return courses
      .map((course) => ({
        id: course.id,
        title: course.title || '名称未設定',
        lessons: [...(lessonsByCourse.get(String(course.id)) || [])].sort((left, right) => (
          byOrderThenTitle(left, right, 'title')
        )),
      }))
      .sort((left, right) => byOrderThenTitle(left, right, 'title'));
  }, [courses, lessons]);

  const visibleGroups = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja');
    if (!keyword) return groups;
    return groups.flatMap((group) => {
      if ((group.title || '').toLocaleLowerCase('ja').includes(keyword)) return [group];
      const matchedLessons = group.lessons.filter((lesson) => {
        const title = (lesson.title || '').toLocaleLowerCase('ja');
        const description = (lesson.description || '').toLocaleLowerCase('ja');
        return title.includes(keyword) || description.includes(keyword);
      });
      if (matchedLessons.length === 0) return [];
      return [{ ...group, lessons: matchedLessons }];
    });
  }, [groups, query]);

  const lessonCount = visibleGroups.reduce((sum, group) => sum + group.lessons.length, 0);
  const pageCount = Math.max(1, Math.ceil(visibleGroups.length / coursesPerPage));
  const safePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageStart = safePageIndex * coursesPerPage;
  const pageGroups = visibleGroups.slice(pageStart, pageStart + coursesPerPage);

  return (
    <AdminCurriculumLayout>
      <h1 className="text-3xl font-bold text-gray-900">レッスン管理</h1>
      <p className="mt-2 text-gray-600">コースと、そのコースのレッスンを並べています。レッスンがまだ無いコースも出します。</p>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <label className="mt-4 block max-w-md">
            <span className="sr-only">コース名、レッスン名、説明で探す</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(0);
              }}
              placeholder="コース名、レッスン名、説明で探す"
              className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
            />
          </label>
          <p className="mt-4 text-sm text-gray-600">コース {visibleGroups.length}件　レッスン {lessonCount}件</p>
          {groups.length === 0 ? (
            <p className="mt-6 text-gray-600">コースはありません。</p>
          ) : visibleGroups.length === 0 ? (
            <p className="mt-6 text-gray-600">該当するコース・レッスンはありません。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-sky-100 bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-sky-50 text-left text-sky-900">
                  <tr>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">コース名</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">レッスン名</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">説明</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">所要時間</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">課題</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">表示順序</th>
                  </tr>
                </thead>
                <tbody>
                  {pageGroups.map((group, groupIndex) => {
                    const rows = group.lessons.length > 0 ? group.lessons : [null];
                    return rows.map((lesson, lessonIndex) => (
                      <tr
                        key={lesson ? `${group.id}-${lesson.id}` : `${group.id}-none`}
                        className={groupIndex % 2 === 0 ? 'bg-white' : 'bg-sky-50/40'}
                      >
                        {lessonIndex === 0 && (
                          <td
                            rowSpan={rows.length}
                            className="border-b border-sky-100 px-4 py-3 align-top font-semibold text-gray-900"
                          >
                            <Link
                              to={`/admin/courses/${group.id}`}
                              className="text-sky-800 underline underline-offset-4"
                            >
                              {group.title}
                            </Link>
                          </td>
                        )}
                        {lesson ? (
                          <>
                            <td className="border-b border-sky-100 px-4 py-3">
                              <Link
                                to={`/admin/courses/${group.id}/lessons/${lesson.id}`}
                                className="font-semibold text-sky-800 underline underline-offset-4"
                              >
                                {lesson.title || '名称未設定'}
                              </Link>
                            </td>
                            <td className="max-w-xs border-b border-sky-100 px-4 py-3 text-gray-700">
                              <span className="line-clamp-2">{lesson.description || '-'}</span>
                            </td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{lesson.duration || '-'}</td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                              {lesson.has_assignment ? 'あり' : 'なし'}
                            </td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{lesson.order_index || 0}</td>
                          </>
                        ) : (
                          <>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">レッスンなし</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                          </>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
          {visibleGroups.length > coursesPerPage && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <p className="text-gray-600">
                コース {pageStart + 1}〜{Math.min(pageStart + coursesPerPage, visibleGroups.length)}件目 / {visibleGroups.length}件
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setPageIndex(safePageIndex - 1)}
                  disabled={safePageIndex === 0}
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 font-semibold text-sky-800 disabled:opacity-40"
                >
                  前へ
                </button>
                {Array.from({ length: pageCount }, (_, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => setPageIndex(index)}
                    className={`rounded-lg px-3 py-2 font-semibold ${
                      index === safePageIndex
                        ? 'bg-sky-600 text-white'
                        : 'border border-sky-200 bg-white text-sky-800'
                    }`}
                  >
                    {index + 1}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPageIndex(safePageIndex + 1)}
                  disabled={safePageIndex >= pageCount - 1}
                  className="rounded-lg border border-sky-200 bg-white px-3 py-2 font-semibold text-sky-800 disabled:opacity-40"
                >
                  次へ
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </AdminCurriculumLayout>
  );
};

export default AdminLessonsPage;
