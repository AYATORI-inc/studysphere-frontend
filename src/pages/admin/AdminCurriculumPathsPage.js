import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import { apiGet, apiPost } from '../../utils/api';

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

const emptyForm = () => ({
  name: '',
  description: '',
  targetAudience: '',
  duration: '',
  status: 'draft',
});

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const courseCount = (path) => {
  if (Number.isFinite(Number(path.total_courses))) return Number(path.total_courses);
  return Array.isArray(path.courses) ? path.courses.length : 0;
};

const courseNames = (path) => (Array.isArray(path.courses) ? path.courses : [])
  .map((course) => course.course_title || course.title || '')
  .filter(Boolean);

const AdminCurriculumPathsPage = () => {
  const [paths, setPaths] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState(emptyForm());
  const [formMessage, setFormMessage] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const pathPayload = await apiGet('/api/curriculum-paths');
    setPaths(asList(pathPayload));
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
        console.error('カリキュラムパスの取得に失敗:', loadError);
        setError('カリキュラムパスを取得できませんでした。');
        setPaths([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const visiblePaths = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja');
    const matched = keyword
      ? paths.filter((path) => {
        const text = [
          path.name,
          path.description,
          path.target_audience,
          path.duration,
          ...courseNames(path),
        ].join(' ').toLocaleLowerCase('ja');
        return text.includes(keyword);
      })
      : paths;
    return [...matched].sort((left, right) => (
      (left.name || '').localeCompare(right.name || '', 'ja')
    ));
  }, [paths, query]);

  const openCreate = () => {
    setForm(emptyForm());
    setFormMessage('');
    setCreateOpen(true);
  };

  const createPath = async (event) => {
    event.preventDefault();
    const name = form.name.trim();
    if (!name) {
      setFormMessage('パス名を入力してください。');
      return;
    }

    try {
      setSaving(true);
      const result = await apiPost('/api/curriculum-paths', {
        name,
        description: form.description.trim(),
        target_audience: form.targetAudience.trim(),
        duration: form.duration.trim(),
        status: form.status,
        courses: [],
      });
      if (result?.success === false) throw new Error(result.message || 'カリキュラムパスの作成に失敗しました。');
      setCreateOpen(false);
      setNoticeIsError(false);
      setNotice('カリキュラムパスを作成しました。');
      await load();
    } catch (createError) {
      console.error('カリキュラムパスの作成に失敗:', createError);
      setFormMessage(createError?.message || 'カリキュラムパスの作成に失敗しました。');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCurriculumLayout>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">カリキュラムパス管理</h1>
          <p className="mt-2 text-gray-600">複数のコースをひとつにまとめて、利用者に提供するものです。</p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
        >
          新規作成
        </button>
      </div>
      {notice && <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>}

      <label className="mt-6 block max-w-md">
        <span className="sr-only">カリキュラムパスを探す</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="パス名、説明、対象者、コース名で探す"
          className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
        />
      </label>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mt-4 text-sm text-gray-600">{visiblePaths.length}件</p>
          {paths.length === 0 ? (
            <p className="mt-6 text-gray-600">カリキュラムパスはありません。</p>
          ) : visiblePaths.length === 0 ? (
            <p className="mt-6 text-gray-600">該当するカリキュラムパスはありません。</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visiblePaths.map((path) => {
                const names = courseNames(path);
                return (
                  <Link
                    key={path.id}
                    to={`/admin/curriculum-paths/${path.id}`}
                    className="relative block overflow-hidden rounded-sm border border-[#e4d7a8] bg-[#fffdf6] shadow-[3px_4px_0_rgba(90,70,20,0.08)] hover:border-[#d9c98a]"
                  >
                    <div className="h-3 bg-[#f6e7b2]" />
                    <div className="pointer-events-none absolute bottom-0 left-8 top-3 w-px bg-red-300/80" />
                    <div className="px-4 pb-4 pl-12 text-sm">
                      <h2 className="flex min-h-9 items-center border-b border-[#d9c98a] py-2 font-serif text-lg font-bold text-gray-900">
                        {path.name || '名称未設定'}
                      </h2>
                      <dl>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">状態</dt>
                          <dd className="text-gray-800">{statusLabel[path.status] || path.status || '-'}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">対象者</dt>
                          <dd className="truncate text-gray-800">{path.target_audience || '-'}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">コース数</dt>
                          <dd className="text-gray-800">{courseCount(path)}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">期間</dt>
                          <dd className="text-gray-800">{path.duration || '-'}</dd>
                        </div>
                      </dl>
                      <p className="mt-3 line-clamp-3 text-gray-700">{path.description || '説明なし'}</p>
                      {names.length > 0 && (
                        <p className="mt-2 line-clamp-2 text-gray-600">{names.join(' → ')}</p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">新規カリキュラムパス</h2>
              <button type="button" onClick={() => setCreateOpen(false)} disabled={saving} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={createPath}>
              <Field label="パス名" required>
                <input className={fieldClass} value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="対象者">
                <input className={fieldClass} value={form.targetAudience} onChange={(event) => setForm((prev) => ({ ...prev, targetAudience: event.target.value }))} />
              </Field>
              <Field label="期間">
                <input className={fieldClass} value={form.duration} onChange={(event) => setForm((prev) => ({ ...prev, duration: event.target.value }))} placeholder="例：12ヶ月" />
              </Field>
              <Field label="状態">
                <select className={fieldClass} value={form.status} onChange={(event) => setForm((prev) => ({ ...prev, status: event.target.value }))}>
                  <option value="draft">下書き</option>
                  <option value="active">公開中</option>
                  <option value="inactive">非公開</option>
                </select>
              </Field>
              <Field label="説明">
                <textarea className={fieldClass} rows={3} value={form.description} onChange={(event) => setForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              <p className="text-sm text-gray-600">作成後、コースを追加してください。</p>
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

export default AdminCurriculumPathsPage;
