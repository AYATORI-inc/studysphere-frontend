import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import { apiCall, apiDelete, apiGet, apiPut } from '../../utils/api';

const allowedExtensions = ['pdf', 'md', 'txt', 'rtf'];
const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const asCourse = (payload) => {
  const course = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  if (!course || Array.isArray(course) || !course.id) return null;
  return course;
};

const sortLessons = (items) => [...items].sort((left, right) => {
  const order = (Number(left.order_index) || 0) - (Number(right.order_index) || 0);
  if (order !== 0) return order;
  return (left.title || '').localeCompare(right.title || '', 'ja');
});

const nextOrder = (items) => {
  if (items.length === 0) return 0;
  return Math.max(...items.map((lesson) => Number(lesson.order_index) || 0)) + 1;
};

const emptyForm = (order) => ({
  title: '',
  description: '',
  duration: '120分',
  orderIndex: String(order),
});

const Field = ({ label, required, hint, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-gray-700">
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
  </label>
);

const AdminCourseDetailPage = () => {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [course, setCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [showDeletes, setShowDeletes] = useState(false);
  const [showCourseDelete, setShowCourseDelete] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm(0));
  const [file, setFile] = useState(null);
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [courseForm, setCourseForm] = useState({ title: '', description: '', category: '選択科目', orderIndex: '0' });
  const [courseMessage, setCourseMessage] = useState('');
  const [savingCourse, setSavingCourse] = useState(false);

  const load = async () => {
    const [coursePayload, lessonPayload] = await Promise.all([
      apiGet(`/api/courses/${courseId}`),
      apiGet(`/api/lessons?courseId=${encodeURIComponent(courseId)}`),
    ]);
    const found = asCourse(coursePayload);
    if (!found) throw new Error('コースが見つかりません。');
    setCourse(found);
    setLessons(sortLessons(asList(lessonPayload)));
    return sortLessons(asList(lessonPayload));
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (loadError) {
        if (cancelled) return;
        console.error('コース確認の取得に失敗:', loadError);
        setCourse(null);
        setLessons([]);
        setError(loadError?.message || 'コース情報を取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [courseId]);

  const openEdit = () => {
    setCourseForm({
      title: course.title || '',
      description: course.description || '',
      category: course.category === '必修科目' ? '必修科目' : '選択科目',
      orderIndex: String(course.order_index || 0),
    });
    setCourseMessage('');
    setEditOpen(true);
  };

  const saveCourse = async (event) => {
    event.preventDefault();
    const title = courseForm.title.trim();
    if (!title) {
      setCourseMessage('コース名を入力してください。');
      return;
    }
    const order = Number(courseForm.orderIndex);
    if (!Number.isInteger(order) || order < 0) {
      setCourseMessage('表示順序は0以上の整数です。');
      return;
    }

    try {
      setSavingCourse(true);
      const result = await apiPut(`/api/courses/${courseId}`, {
        title,
        description: courseForm.description.trim(),
        category: courseForm.category,
        order_index: order,
      });
      if (result?.success === false) throw new Error(result.message || 'コースの保存に失敗しました。');
      setEditOpen(false);
      setNoticeIsError(false);
      setNotice('コース基本情報を保存しました。');
      await load();
    } catch (saveError) {
      console.error('コース基本情報の保存に失敗:', saveError);
      setCourseMessage(saveError?.message || 'コースの保存に失敗しました。');
    } finally {
      setSavingCourse(false);
    }
  };

  const openCreate = () => {
    setForm(emptyForm(nextOrder(lessons)));
    setFile(null);
    setFormMessage('');
    setCreateOpen(true);
  };

  const closeCreate = () => {
    if (saving) return;
    setCreateOpen(false);
  };

  const createLesson = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) {
      setFormMessage('レッスン名を入力してください。');
      return;
    }
    if (!file) {
      setFormMessage('コアになるテキストファイルを選択してください。PDF、MD、TXT、RTFです。');
      return;
    }
    const extension = file.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setFormMessage('ファイル形式は PDF、MD、TXT、RTF のいずれかです。');
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setFormMessage('ファイルサイズは50MB以下にしてください。');
      return;
    }
    const order = Number(form.orderIndex);
    if (!Number.isInteger(order) || order < 0) {
      setFormMessage('表示順序は0以上の整数です。');
      return;
    }

    const body = new FormData();
    body.append('course_id', String(courseId));
    body.append('title', title);
    body.append('description', form.description.trim());
    body.append('duration', form.duration.trim() || '120分');
    body.append('order_index', String(order));
    body.append('file', file);
    body.append('fileName', file.name);

    try {
      setSaving(true);
      setFormMessage('');
      const result = await apiCall('/api/lessons', {
        method: 'POST',
        body,
        timeoutMs: 120000,
      });
      if (result?.success === false) {
        throw new Error(result.message || 'レッスンの作成に失敗しました。');
      }
      setCreateOpen(false);
      setNoticeIsError(false);
      setNotice('レッスンを追加しました。');
      await load();
    } catch (createError) {
      console.error('レッスンの作成に失敗:', createError);
      setFormMessage(createError?.message || 'レッスンの作成に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  const deleteCourse = async () => {
    if (!window.confirm(`「${course?.title || 'このコース'}」を削除しますか？\nこの操作は取り消せません。\n関連するレッスンも削除されます。`)) return;

    try {
      setDeletingCourse(true);
      const result = await apiDelete(`/api/courses/${courseId}`);
      if (result?.success === false) {
        throw new Error(result.message || 'コースの削除に失敗しました。');
      }
      navigate('/admin/courses');
    } catch (deleteError) {
      console.error('コースの削除に失敗:', deleteError);
      setNoticeIsError(true);
      setNotice(deleteError?.message || 'コースの削除に失敗しました。');
      setDeletingCourse(false);
    }
  };

  const deleteLesson = async (lesson) => {
    const fileNote = lesson.s3_key || lesson.has_file
      ? '\nストレージ上のテキストファイルも削除されます。'
      : '';
    if (!window.confirm(`「${lesson.title || 'このレッスン'}」を削除しますか？\nこの操作は取り消せません。${fileNote}`)) return;

    try {
      setDeletingId(String(lesson.id));
      const result = await apiDelete(`/api/lessons/${lesson.id}`);
      if (result?.success === false) {
        throw new Error(result.message || 'レッスンの削除に失敗しました。');
      }
      setNoticeIsError(false);
      setNotice('レッスンを削除しました。');
      await load();
    } catch (deleteError) {
      console.error('レッスンの削除に失敗:', deleteError);
      setNoticeIsError(true);
      setNotice(deleteError?.message || 'レッスンの削除に失敗しました。');
    } finally {
      setDeletingId('');
    }
  };

  return (
    <AdminCurriculumLayout>
      <p>
        <Link to="/admin/courses" className="text-sm text-sky-800 underline underline-offset-4">
          コース一覧に戻る
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">{course?.title || 'コース情報'}</h1>
      {notice && <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>}

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && course && (
        <div className="mt-6 max-w-5xl space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">コース基本情報</h2>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  編集
                </button>
                {showCourseDelete && (
                  <button
                    type="button"
                    onClick={deleteCourse}
                    disabled={deletingCourse}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    削除
                  </button>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={showCourseDelete}
                    onChange={(event) => setShowCourseDelete(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600"
                  />
                  削除ボタンの表示
                </label>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">コース名</dt><dd className="text-gray-900">{course.title || '-'}</dd></div>
              <div>
                <dt className="text-gray-500">カテゴリ</dt>
                <dd className={course.category === '必修科目' ? 'font-medium text-red-700' : 'text-gray-900'}>
                  {course.category || '-'}
                </dd>
              </div>
              <div><dt className="text-gray-500">レッスン数</dt><dd className="text-gray-900">{lessons.length}</dd></div>
              <div><dt className="text-gray-500">表示順序</dt><dd className="text-gray-900">{course.order_index || 0}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">説明</dt>
                <dd className="whitespace-pre-wrap text-gray-900">{course.description || '説明なし'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">レッスン一覧</h2>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  レッスン追加
                </button>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={showDeletes}
                    onChange={(event) => setShowDeletes(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600"
                  />
                  削除ボタンの表示
                </label>
              </div>
            </div>
            {lessons.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">レッスンはありません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">レッスン名</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">説明</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">所要時間</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">課題</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">ファイル</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">表示順序</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lessons.map((lesson) => (
                      <tr key={lesson.id}>
                        <td className="border-b border-sky-100 px-4 py-3">
                          <Link
                            to={`/admin/courses/${courseId}/lessons/${lesson.id}`}
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
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                          {lesson.has_file || lesson.s3_key ? 'あり' : 'なし'}
                        </td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{lesson.order_index || 0}</td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3">
                          {showDeletes && (
                            <button
                              type="button"
                              onClick={() => deleteLesson(lesson)}
                              disabled={deletingId === String(lesson.id)}
                              className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                            >
                              削除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">コース基本情報の編集</h2>
              <button type="button" onClick={() => setEditOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveCourse}>
              <Field label="コース名" required>
                <input className={fieldClass} value={courseForm.title} onChange={(event) => setCourseForm((prev) => ({ ...prev, title: event.target.value }))} />
              </Field>
              <Field label="カテゴリ" required>
                <select className={fieldClass} value={courseForm.category} onChange={(event) => setCourseForm((prev) => ({ ...prev, category: event.target.value }))}>
                  <option value="選択科目">選択科目</option>
                  <option value="必修科目">必修科目</option>
                </select>
              </Field>
              <Field label="表示順序" required>
                <input className={fieldClass} type="number" min="0" step="1" value={courseForm.orderIndex} onChange={(event) => setCourseForm((prev) => ({ ...prev, orderIndex: event.target.value }))} />
              </Field>
              <Field label="説明">
                <textarea className={fieldClass} rows={4} value={courseForm.description} onChange={(event) => setCourseForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              {courseMessage && <p className="text-sm text-red-700">{courseMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={savingCourse} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {savingCourse ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">レッスン追加</h2>
              <button type="button" onClick={closeCreate} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={createLesson}>
              <div>
                <p className="text-sm font-semibold text-gray-700">コース</p>
                <p className="mt-1 text-gray-900">{course?.title || '-'}</p>
              </div>
              <Field label="レッスン名" required>
                <input
                  className={fieldClass}
                  value={form.title}
                  onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
                />
              </Field>
              <Field label="説明">
                <textarea
                  className={fieldClass}
                  rows={4}
                  value={form.description}
                  onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))}
                />
              </Field>
              <Field label="所要時間" hint="空欄のときは120分になります。">
                <input
                  className={fieldClass}
                  value={form.duration}
                  onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))}
                />
              </Field>
              <Field label="表示順序" required>
                <input
                  className={fieldClass}
                  type="number"
                  min="0"
                  step="1"
                  value={form.orderIndex}
                  onChange={(event) => setForm((prev) => ({ ...prev, orderIndex: event.target.value }))}
                />
              </Field>
              <Field label="テキストファイル" required hint="PDF、MD、TXT、RTF。コアになる1ファイルです。">
                <input
                  className={fieldClass}
                  type="file"
                  accept=".pdf,.md,.txt,.rtf"
                  onChange={(event) => {
                    setFile(event.target.files?.[0] || null);
                    setFormMessage('');
                  }}
                />
              </Field>
              {formMessage && <p className="text-sm text-red-700">{formMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeCreate} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
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

export default AdminCourseDetailPage;
