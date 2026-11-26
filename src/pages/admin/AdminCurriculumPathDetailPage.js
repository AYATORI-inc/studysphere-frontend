import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import { apiDelete, apiGet, apiPut } from '../../utils/api';

const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const statusLabel = {
  active: '公開中',
  inactive: '非公開',
  draft: '下書き',
};

const Field = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-gray-700">
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
  </label>
);

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const asObject = (payload) => {
  const value = payload?.data && !Array.isArray(payload.data) ? payload.data : payload;
  if (!value || Array.isArray(value) || !value.id) return null;
  return value;
};

const courseRows = (path, catalog) => {
  const items = Array.isArray(path?.courses) ? path.courses : [];
  return items
    .map((item) => {
      const courseId = item.course_id || item.courseId || item.id;
      const course = catalog.get(String(courseId));
      return {
        id: courseId,
        title: item.course_title || item.title || course?.title || '名称未設定',
        category: item.course_category || item.category || course?.category || '-',
        lessonCount: item.lesson_count ?? course?.lesson_count ?? '-',
        order: Number(item.order_index ?? item.order ?? 0),
      };
    })
    .sort((left, right) => {
      const order = left.order - right.order;
      if (order !== 0) return order;
      return left.title.localeCompare(right.title, 'ja');
    });
};

const payloadCourses = (items) => (Array.isArray(items) ? items : []).map((item) => ({
  courseId: Number(item.course_id || item.courseId || item.id),
  order: Number(item.order_index ?? item.order ?? 1),
  isRequired: item.is_required !== false && item.is_required !== 0 && item.isRequired !== false,
  estimatedDuration: item.estimated_duration || item.estimatedDuration || '3ヶ月',
}));

const AdminCurriculumPathDetailPage = () => {
  const { pathId } = useParams();
  const navigate = useNavigate();
  const [path, setPath] = useState(null);
  const [courses, setCourses] = useState([]);
  const [allCourses, setAllCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ name: '', targetAudience: '', duration: '', status: 'draft', description: '' });
  const [editMessage, setEditMessage] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addForm, setAddForm] = useState({ courseId: '', order: '1' });
  const [addMessage, setAddMessage] = useState('');
  const [savingAdd, setSavingAdd] = useState(false);
  const [showPathDelete, setShowPathDelete] = useState(false);
  const [showCourseDeletes, setShowCourseDeletes] = useState(false);
  const [actingKey, setActingKey] = useState('');

  const load = useCallback(async () => {
    const [pathPayload, coursePayload] = await Promise.all([
      apiGet(`/api/curriculum-paths/${pathId}`),
      apiGet('/api/courses'),
    ]);
    const found = asObject(pathPayload);
    if (!found) throw new Error('カリキュラムパスが見つかりません。');
    const list = asList(coursePayload);
    const catalog = new Map(list.map((course) => [String(course.id), course]));
    setPath(found);
    setAllCourses(list);
    setCourses(courseRows(found, catalog));
  }, [pathId]);

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (loadError) {
        if (cancelled) return;
        console.error('カリキュラムパス詳細の取得に失敗:', loadError);
        setPath(null);
        setCourses([]);
        setError(loadError?.message || 'カリキュラムパスを取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const openEdit = () => {
    setEditForm({
      name: path.name || '',
      targetAudience: path.target_audience || '',
      duration: path.duration || '',
      status: statusLabel[path.status] ? path.status : 'draft',
      description: path.description || '',
    });
    setEditMessage('');
    setEditOpen(true);
  };

  const saveBasics = async (event) => {
    event.preventDefault();
    const name = editForm.name.trim();
    if (!name) {
      setEditMessage('パス名を入力してください。');
      return;
    }

    try {
      setSavingEdit(true);
      const result = await apiPut(`/api/curriculum-paths/${path.id}`, {
        name,
        description: editForm.description.trim(),
        target_audience: editForm.targetAudience.trim(),
        duration: editForm.duration.trim(),
        status: editForm.status,
        courses: payloadCourses(path.courses),
      });
      if (result?.success === false) throw new Error(result.message || '基本情報の保存に失敗しました。');
      setEditOpen(false);
      setNoticeIsError(false);
      setNotice('基本情報を保存しました。');
      await load();
    } catch (saveError) {
      console.error('カリキュラムパス基本情報の保存に失敗:', saveError);
      setEditMessage(saveError?.message || '基本情報の保存に失敗しました。');
    } finally {
      setSavingEdit(false);
    }
  };

  const openAdd = () => {
    const nextOrder = courses.reduce((max, course) => Math.max(max, Number(course.order) || 0), 0) + 1;
    setAddForm({ courseId: '', order: String(nextOrder) });
    setAddMessage('');
    setAddOpen(true);
  };

  const addCourse = async (event) => {
    event.preventDefault();
    const courseId = Number(addForm.courseId);
    if (!courseId) {
      setAddMessage('コースを選んでください。');
      return;
    }
    const order = Number(addForm.order);
    if (!Number.isInteger(order) || order < 1) {
      setAddMessage('表示順序は1以上の整数です。');
      return;
    }
    const already = (path.courses || []).some((item) => String(item.course_id || item.courseId) === String(courseId));
    if (already) {
      setAddMessage('そのコースはすでに入っています。');
      return;
    }

    try {
      setSavingAdd(true);
      const result = await apiPut(`/api/curriculum-paths/${path.id}`, {
        name: path.name || '',
        description: path.description || '',
        target_audience: path.target_audience || '',
        duration: path.duration || '',
        status: path.status || 'draft',
        courses: [
          ...payloadCourses(path.courses),
          { courseId, order, isRequired: true, estimatedDuration: '3ヶ月' },
        ],
      });
      if (result?.success === false) throw new Error(result.message || 'コースの追加に失敗しました。');
      setAddOpen(false);
      setNoticeIsError(false);
      setNotice('コースを追加しました。');
      await load();
    } catch (addError) {
      console.error('カリキュラムパスへのコース追加に失敗:', addError);
      setAddMessage(addError?.message || 'コースの追加に失敗しました。');
    } finally {
      setSavingAdd(false);
    }
  };

  const coursesForSave = (rows) => rows.map((row, index) => {
    const source = (path?.courses || []).find((item) => String(item.course_id || item.courseId) === String(row.id));
    return {
      courseId: Number(row.id),
      order: index + 1,
      isRequired: source ? source.is_required !== false && source.is_required !== 0 && source.isRequired !== false : true,
      estimatedDuration: source?.estimated_duration || source?.estimatedDuration || '3ヶ月',
    };
  });

  const saveCourseList = async (rows, message) => {
    const result = await apiPut(`/api/curriculum-paths/${path.id}`, {
      name: path.name || '',
      description: path.description || '',
      target_audience: path.target_audience || '',
      duration: path.duration || '',
      status: path.status || 'draft',
      courses: coursesForSave(rows),
    });
    if (result?.success === false) throw new Error(result.message || 'コース一覧の保存に失敗しました。');
    setNoticeIsError(false);
    setNotice(message);
    await load();
  };

  const moveCourse = async (index, direction) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= courses.length) return;
    const next = [...courses];
    const [moved] = next.splice(index, 1);
    next.splice(nextIndex, 0, moved);
    try {
      setActingKey(`move-${moved.id}`);
      setNotice('');
      await saveCourseList(next, 'コースの並びを保存しました。');
    } catch (moveError) {
      console.error('カリキュラムパスの並び替えに失敗:', moveError);
      setNoticeIsError(true);
      setNotice(moveError?.message || 'コースの並びを保存できませんでした。');
    } finally {
      setActingKey('');
    }
  };

  const removeCourse = async (course) => {
    if (!window.confirm(`「${course.title}」をこのカリキュラムパスから外しますか？`)) return;
    try {
      setActingKey(`remove-${course.id}`);
      setNotice('');
      await saveCourseList(courses.filter((item) => String(item.id) !== String(course.id)), 'コースを外しました。');
    } catch (removeError) {
      console.error('カリキュラムパスからのコース削除に失敗:', removeError);
      setNoticeIsError(true);
      setNotice(removeError?.message || 'コースを外せませんでした。');
    } finally {
      setActingKey('');
    }
  };

  const deletePath = async () => {
    if (!window.confirm(`「${path.name || 'このカリキュラムパス'}」を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      setActingKey('delete-path');
      setNotice('');
      const result = await apiDelete(`/api/curriculum-paths/${path.id}`);
      if (result?.success === false) throw new Error(result.message || 'カリキュラムパスの削除に失敗しました。');
      navigate('/admin/curriculum-paths');
    } catch (deleteError) {
      console.error('カリキュラムパスの削除に失敗:', deleteError);
      setNoticeIsError(true);
      setNotice(deleteError?.message || 'カリキュラムパスの削除に失敗しました。');
      setActingKey('');
    }
  };

  const usedCourseIds = new Set((path?.courses || []).map((item) => String(item.course_id || item.courseId || item.id)));
  const availableCourses = [...allCourses]
    .filter((course) => !usedCourseIds.has(String(course.id)))
    .sort((left, right) => {
      const order = Number(left.order_index || 0) - Number(right.order_index || 0);
      if (order !== 0) return order;
      return (left.title || '').localeCompare(right.title || '', 'ja');
    });

  return (
    <AdminCurriculumLayout>
      <p>
        <Link to="/admin/curriculum-paths" className="text-sm text-sky-800 underline underline-offset-4">
          カリキュラムパス一覧に戻る
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">{path?.name || 'カリキュラムパス'}</h1>
      {notice && <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>}

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && path && (
        <div className="mt-6 max-w-5xl space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">カリキュラムパス基本情報</h2>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  編集
                </button>
                {showPathDelete && (
                  <button
                    type="button"
                    onClick={deletePath}
                    disabled={actingKey !== ''}
                    className="rounded-lg border border-red-200 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                  >
                    削除
                  </button>
                )}
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={showPathDelete}
                    onChange={(event) => setShowPathDelete(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600"
                  />
                  削除ボタンの表示
                </label>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">パス名</dt><dd className="text-gray-900">{path.name || '-'}</dd></div>
              <div><dt className="text-gray-500">状態</dt><dd className="text-gray-900">{statusLabel[path.status] || path.status || '-'}</dd></div>
              <div><dt className="text-gray-500">対象者</dt><dd className="text-gray-900">{path.target_audience || '-'}</dd></div>
              <div><dt className="text-gray-500">期間</dt><dd className="text-gray-900">{path.duration || '-'}</dd></div>
              <div><dt className="text-gray-500">コース数</dt><dd className="text-gray-900">{courses.length}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">説明</dt>
                <dd className="whitespace-pre-wrap text-gray-900">{path.description || '説明なし'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">コース一覧</h2>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={openAdd}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  コース追加
                </button>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={showCourseDeletes}
                    onChange={(event) => setShowCourseDeletes(event.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-sky-600"
                  />
                  削除ボタンの表示
                </label>
              </div>
            </div>
            {courses.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">コースはありません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">コース名</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">カテゴリ</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">レッスン数</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">表示順序</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course, index) => (
                      <tr key={`${course.id}-${course.order}`}>
                        <td className="border-b border-sky-100 px-4 py-3">
                          <Link
                            to={`/admin/courses/${course.id}`}
                            className="font-semibold text-sky-800 underline underline-offset-4"
                          >
                            {course.title}
                          </Link>
                        </td>
                        <td className={`whitespace-nowrap border-b border-sky-100 px-4 py-3 ${course.category === '必修科目' ? 'font-medium text-red-700' : 'text-gray-700'}`}>
                          {course.category}
                        </td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{course.lessonCount}</td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{index + 1}</td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => moveCourse(index, -1)}
                              disabled={index === 0 || actingKey !== ''}
                              className="rounded-lg border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40"
                            >
                              上へ
                            </button>
                            <button
                              type="button"
                              onClick={() => moveCourse(index, 1)}
                              disabled={index === courses.length - 1 || actingKey !== ''}
                              className="rounded-lg border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-40"
                            >
                              下へ
                            </button>
                            {showCourseDeletes && (
                              <button
                                type="button"
                                onClick={() => removeCourse(course)}
                                disabled={actingKey !== ''}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                外す
                              </button>
                            )}
                          </div>
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
              <h2 className="text-2xl font-bold text-gray-900">基本情報の編集</h2>
              <button type="button" onClick={() => setEditOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveBasics}>
              <Field label="パス名" required>
                <input className={fieldClass} value={editForm.name} onChange={(event) => setEditForm((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="状態" required>
                <select className={fieldClass} value={editForm.status} onChange={(event) => setEditForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="draft">下書き</option>
                  <option value="active">公開中</option>
                  <option value="inactive">非公開</option>
                </select>
              </Field>
              <Field label="対象者">
                <textarea className={fieldClass} rows={3} value={editForm.targetAudience} onChange={(event) => setEditForm((prev) => ({ ...prev, targetAudience: event.target.value }))} />
              </Field>
              <Field label="期間">
                <input className={fieldClass} value={editForm.duration} placeholder="例：12ヶ月" onChange={(event) => setEditForm((prev) => ({ ...prev, duration: event.target.value }))} />
              </Field>
              <Field label="説明">
                <textarea className={fieldClass} rows={4} value={editForm.description} onChange={(event) => setEditForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              {editMessage && <p className="text-sm text-red-700">{editMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={savingEdit} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {savingEdit ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">コース追加</h2>
              <button type="button" onClick={() => setAddOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={addCourse}>
              <Field label="コース" required>
                <select className={fieldClass} value={addForm.courseId} onChange={(event) => setAddForm((prev) => ({ ...prev, courseId: event.target.value }))}>
                  <option value="">コースを選択</option>
                  {availableCourses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="表示順序" required>
                <input className={fieldClass} type="number" min="1" step="1" value={addForm.order} onChange={(event) => setAddForm((prev) => ({ ...prev, order: event.target.value }))} />
              </Field>
              {availableCourses.length === 0 && <p className="text-sm text-gray-600">追加できるコースはありません。</p>}
              {addMessage && <p className="text-sm text-red-700">{addMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setAddOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={savingAdd || availableCourses.length === 0} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {savingAdd ? '追加中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminCurriculumLayout>
  );
};

export default AdminCurriculumPathDetailPage;
