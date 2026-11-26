import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import { apiGet, apiPost } from '../../utils/api';

const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const Field = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-gray-700">
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
  </label>
);

const emptyForm = (order) => ({
  title: '',
  description: '',
  category: '選択科目',
  orderIndex: String(order),
});

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const AdminCoursesPage = () => {
  const [courses, setCourses] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm(0));
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const payload = await apiGet('/api/courses');
    setCourses(asList(payload));
  }, []);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (loadError) {
        if (cancelled) return;
        console.error('コース一覧の取得に失敗:', loadError);
        setError('コース一覧を取得できませんでした。');
        setCourses([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const nextOrder = () => {
    if (courses.length === 0) return 0;
    return Math.max(...courses.map((course) => Number(course.order_index) || 0)) + 1;
  };

  const openCreate = () => {
    setForm(emptyForm(nextOrder()));
    setFormMessage('');
    setCreateOpen(true);
  };

  const createCourse = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormMessage('コース名を入力してください。');
      return;
    }
    const order = Number(form.orderIndex);
    if (!Number.isInteger(order) || order < 0) {
      setFormMessage('表示順序は0以上の整数です。');
      return;
    }

    try {
      setSaving(true);
      const result = await apiPost('/api/courses', {
        title,
        description: form.description.trim(),
        category: form.category,
        order_index: order,
      });
      if (result?.success === false) throw new Error(result.message || 'コースの作成に失敗しました。');
      setCreateOpen(false);
      setNoticeIsError(false);
      setNotice('コースを作成しました。');
      await load();
    } catch (createError) {
      console.error('コースの作成に失敗:', createError);
      setFormMessage(createError?.message || 'コースの作成に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const visibleCourses = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja');
    const matched = keyword
      ? courses.filter((course) => {
        const title = (course.title || '').toLocaleLowerCase('ja');
        const description = (course.description || '').toLocaleLowerCase('ja');
        const category = (course.category || '').toLocaleLowerCase('ja');
        return title.includes(keyword) || description.includes(keyword) || category.includes(keyword);
      })
      : courses;

    return [...matched].sort((left, right) => {
      const order = (Number(left.order_index) || 0) - (Number(right.order_index) || 0);
      if (order !== 0) return order;
      return (left.title || '').localeCompare(right.title || '', 'ja');
    });
  }, [courses, query]);

  return (
    <AdminCurriculumLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">コース管理</h1>
          <p className="mt-2 text-gray-600">コース名、説明、カテゴリで探せます。</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          新規コース作成
        </button>
      </div>
      {notice && <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>}

      <label className="mt-6 block max-w-md">
        <span className="sr-only">コースを探す</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="コース名、説明、カテゴリで探す"
          className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
        />
      </label>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mt-4 text-sm text-gray-600">{visibleCourses.length}件　表示順</p>
          {courses.length === 0 ? (
            <p className="mt-6 text-gray-600">コースはありません。</p>
          ) : visibleCourses.length === 0 ? (
            <p className="mt-6 text-gray-600">該当するコースはありません。</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleCourses.map((course) => (
                <Link
                  key={course.id}
                  to={`/admin/courses/${course.id}`}
                  className="relative block overflow-hidden rounded-sm border border-[#e4d7a8] bg-[#fffdf6] shadow-[3px_4px_0_rgba(90,70,20,0.08)] hover:border-[#d9c98a]"
                >
                  <div className="h-3 bg-[#f6e7b2]" />
                  <div className="pointer-events-none absolute bottom-0 left-8 top-3 w-px bg-red-300/80" />
                  <div className="px-4 pb-4 pl-12 text-sm">
                    <h2 className="flex min-h-9 items-center border-b border-[#d9c98a] py-2 font-serif text-lg font-bold text-gray-900">
                      {course.title || '名称未設定'}
                    </h2>
                    <dl>
                      <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                        <dt className="w-24 shrink-0 text-gray-500">カテゴリ</dt>
                        <dd className={course.category === '必修科目' ? 'font-medium text-red-700' : 'text-gray-800'}>
                          {course.category || '-'}
                        </dd>
                      </div>
                      <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                        <dt className="w-24 shrink-0 text-gray-500">レッスン数</dt>
                        <dd className="text-gray-800">{course.lesson_count || 0}</dd>
                      </div>
                      <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                        <dt className="w-24 shrink-0 text-gray-500">表示順序</dt>
                        <dd className="text-gray-800">{course.order_index || 0}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 line-clamp-3 text-gray-700">
                      {course.description || '説明なし'}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">新規コース作成</h2>
              <button type="button" onClick={() => setCreateOpen(false)} disabled={saving} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={createCourse}>
              <Field label="コース名" required>
                <input className={fieldClass} value={form.title} onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))} />
              </Field>
              <Field label="カテゴリ" required>
                <select className={fieldClass} value={form.category} onChange={(event) => setForm((prev) => ({ ...prev, category: event.target.value }))}>
                  <option value="選択科目">選択科目</option>
                  <option value="必修科目">必修科目</option>
                </select>
              </Field>
              <Field label="表示順序" required>
                <input className={fieldClass} type="number" min="0" step="1" value={form.orderIndex} onChange={(event) => setForm((prev) => ({ ...prev, orderIndex: event.target.value }))} />
              </Field>
              <Field label="説明">
                <textarea className={fieldClass} rows={4} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              {formMessage && <p className="text-sm text-red-700">{formMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setCreateOpen(false)} disabled={saving} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={saving} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {saving ? '作成中...' : '作成'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminCurriculumLayout>
  );
};

export default AdminCoursesPage;
