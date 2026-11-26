import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminCurriculumLayout from './AdminCurriculumLayout';
import LessonSectionFacts, { VideoDraftFields } from './LessonSectionFacts';
import { buildSections, isYoutubeUrl } from './lessonSections';
import { apiCall, apiDelete, apiDownloadBinary, apiGet, apiPost, apiPut } from '../../utils/api';

const allowedExtensions = ['pdf', 'md', 'txt', 'rtf'];
const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';
const emptyVideo = { title: '', description: '', url: '', duration: '' };

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

const AdminLessonDetailPage = () => {
  const { courseId, lessonId } = useParams();
  const [course, setCourse] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showDeletes, setShowDeletes] = useState(false);
  const [deletingKey, setDeletingKey] = useState('');
  const [downloadingKey, setDownloadingKey] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [lessonForm, setLessonForm] = useState({ title: '', description: '', duration: '', orderIndex: '0', hasAssignment: false });
  const [savingLesson, setSavingLesson] = useState(false);
  const [lessonMessage, setLessonMessage] = useState('');
  const [sectionOpen, setSectionOpen] = useState(false);
  const [newFile, setNewFile] = useState(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [newVideo, setNewVideo] = useState(emptyVideo);
  const [addingSection, setAddingSection] = useState(false);
  const [sectionMessage, setSectionMessage] = useState('');
  const [sectionEdit, setSectionEdit] = useState(null);
  const [sectionDraft, setSectionDraft] = useState(emptyVideo);
  const [savingSectionEdit, setSavingSectionEdit] = useState(false);
  const [sectionEditMessage, setSectionEditMessage] = useState('');

  const load = useCallback(async () => {
    const [coursePayload, lessonPayload, textPayload, linkPayload, videoPayload] = await Promise.all([
      apiGet(`/api/courses/${courseId}`),
      apiGet(`/api/lessons/${lessonId}`),
      apiGet(`/api/lesson-text-files/lesson/${lessonId}`),
      apiGet(`/api/lesson-text-video-links/lesson/${lessonId}?includeNoVideo=true`),
      apiGet(`/api/lesson-videos/lesson/${lessonId}`),
    ]);
    const foundCourse = asObject(coursePayload);
    const foundLesson = asObject(lessonPayload);
    if (!foundLesson || String(foundLesson.course_id) !== String(courseId)) {
      throw new Error('レッスンが見つかりません。');
    }
    setCourse(foundCourse);
    setLesson(foundLesson);
    setSections(buildSections(foundLesson, asList(textPayload), asList(linkPayload), asList(videoPayload)));
  }, [courseId, lessonId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError('');
        await load();
      } catch (loadError) {
        if (cancelled) return;
        console.error('レッスン確認の取得に失敗:', loadError);
        setCourse(null);
        setLesson(null);
        setSections([]);
        setError(loadError?.message || 'レッスン情報を取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const showNotice = (message, isError) => {
    setNotice(message);
    setNoticeIsError(isError);
  };

  const openEdit = () => {
    setLessonForm({
      title: lesson.title || '',
      description: lesson.description || '',
      duration: lesson.duration || '',
      orderIndex: String(lesson.order_index || 0),
      hasAssignment: Boolean(lesson.has_assignment),
    });
    setLessonMessage('');
    setEditOpen(true);
  };

  const saveLesson = async (event) => {
    event.preventDefault();
    const title = lessonForm.title.trim();
    if (!title) {
      setLessonMessage('レッスン名を入力してください。');
      return;
    }
    const order = Number(lessonForm.orderIndex);
    if (!Number.isInteger(order) || order < 0) {
      setLessonMessage('表示順序は0以上の整数です。');
      return;
    }

    const body = new FormData();
    body.append('title', title);
    body.append('description', lessonForm.description.trim());
    body.append('duration', lessonForm.duration.trim() || '120分');
    body.append('order_index', String(order));
    body.append('has_assignment', lessonForm.hasAssignment ? 'true' : 'false');
    body.append('update_file', 'false');
    body.append('remove_file', 'false');

    try {
      setSavingLesson(true);
      const result = await apiCall(`/api/lessons/${lessonId}`, { method: 'PUT', body });
      if (result?.success === false) throw new Error(result.message || 'レッスンの保存に失敗しました。');
      await load();
      setEditOpen(false);
      showNotice('レッスン情報を保存しました。', false);
    } catch (saveError) {
      console.error('レッスン情報の保存に失敗:', saveError);
      setLessonMessage(saveError?.message || 'レッスンの保存に失敗しました。');
    } finally {
      setSavingLesson(false);
    }
  };

  const videoInputError = (draft) => {
    const title = draft.title.trim();
    const description = draft.description.trim();
    const url = draft.url.trim();
    const duration = draft.duration.trim();
    if (!url && !title && !description && !duration) return '';
    if (!url) return 'URLを入力してください。動画の情報だけではセクションを作れません。';
    if (!isYoutubeUrl(url)) return 'YouTubeのURLは youtube.com/watch?v= または youtu.be/ の形式です。';
    if (!title) return '動画名称を入力してください。';
    return '';
  };

  const openSectionEdit = (section) => {
    setSectionEdit(section);
    setSectionDraft({
      title: section.videoTitle || '',
      description: section.videoDescription || '',
      url: section.youtubeUrl || '',
      duration: section.videoDuration || '',
    });
    setSectionEditMessage('');
  };

  const saveSectionEdit = async (event) => {
    event.preventDefault();
    const videoError = videoInputError(sectionDraft);
    if (videoError) {
      setSectionEditMessage(videoError);
      return;
    }
    const url = sectionDraft.url.trim();
    const order = Number.isInteger(sectionEdit.order) && sectionEdit.order >= 0 ? sectionEdit.order : 0;

    try {
      setSavingSectionEdit(true);
      setSectionEditMessage('');
      if (!url && sectionEdit.videoId) {
        if (sectionEdit.linkId) {
          const linkResult = await apiDelete(`/api/lesson-text-video-links/${sectionEdit.linkId}`);
          if (linkResult?.success === false) throw new Error(linkResult.message || '動画の紐づけを外せませんでした。');
        }
        const videoResult = await apiDelete(`/api/lesson-videos/${sectionEdit.videoId}`);
        if (videoResult?.success === false) throw new Error(videoResult.message || '動画を外せませんでした。');
      } else if (url && sectionEdit.videoId) {
        const result = await apiPut(`/api/lesson-videos/${sectionEdit.videoId}`, {
          title: sectionDraft.title.trim(),
          description: sectionDraft.description.trim(),
          youtube_url: url,
          order_index: order,
          duration: sectionDraft.duration.trim(),
        });
        if (result?.success === false) throw new Error(result.message || '動画の保存に失敗しました。');
      } else if (url) {
        if (!sectionEdit.key) throw new Error('テキストファイルの場所が分からないため、動画を付けられません。');
        const videoResult = await apiPost('/api/lesson-videos', {
          lesson_id: Number(lessonId),
          title: sectionDraft.title.trim(),
          description: sectionDraft.description.trim(),
          youtube_url: url,
          order_index: order,
          duration: sectionDraft.duration.trim(),
        });
        const videoId = videoResult?.data?.id;
        if (!videoId) throw new Error('動画を作成できませんでした。');
        try {
          const linkResult = await apiPost('/api/lesson-text-video-links', {
            lesson_id: Number(lessonId),
            text_file_key: sectionEdit.key,
            video_id: videoId,
            link_order: order,
          });
          if (linkResult?.success === false) throw new Error(linkResult.message || '動画の紐づけに失敗しました。');
        } catch (linkError) {
          await apiDelete(`/api/lesson-videos/${videoId}`).catch(() => null);
          throw linkError;
        }
      }
      setSectionEdit(null);
      await load();
      showNotice('セクションを保存しました。', false);
    } catch (saveError) {
      console.error('セクションの保存に失敗:', saveError);
      setSectionEditMessage(saveError?.message || 'セクションの保存に失敗しました。');
    } finally {
      setSavingSectionEdit(false);
    }
  };

  const closeSection = () => {
    setSectionOpen(false);
    setNewFile(null);
    setNewVideo(emptyVideo);
    setSectionMessage('');
    setFileInputKey((value) => value + 1);
  };

  const addSection = async (event) => {
    event.preventDefault();
    if (!newFile) {
      setSectionMessage('テキストファイルを選択してください。動画だけではセクションを作れません。');
      return;
    }
    const videoError = videoInputError(newVideo);
    if (videoError) {
      setSectionMessage(videoError);
      return;
    }
    const extension = newFile.name.split('.').pop().toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      setSectionMessage('ファイル形式は PDF、MD、TXT、RTF のいずれかです。');
      return;
    }
    if (newFile.size > 50 * 1024 * 1024) {
      setSectionMessage('ファイルサイズは50MB以下にしてください。');
      return;
    }

    const body = new FormData();
    body.append('lessonId', String(lessonId));
    body.append('file', newFile);
    body.append('fileName', newFile.name);
    body.append('order', String(sections.length));

    let videoId = null;
    try {
      setAddingSection(true);
      setSectionMessage('');
      const fileResult = await apiCall('/api/lesson-text-files', {
        method: 'POST',
        body,
        timeoutMs: 120000,
      });
      if (fileResult?.success === false) throw new Error(fileResult.message || 'テキストの追加に失敗しました。');
      const fileKey = fileResult?.data?.s3_key;
      if (newVideo.url.trim()) {
        if (!fileKey) throw new Error('追加したテキストの場所が分かりません。');
        const videoResult = await apiPost('/api/lesson-videos', {
          lesson_id: Number(lessonId),
          title: newVideo.title.trim(),
          description: newVideo.description.trim(),
          youtube_url: newVideo.url.trim(),
          order_index: sections.length,
          duration: newVideo.duration.trim(),
        });
        videoId = videoResult?.data?.id;
        if (!videoId) throw new Error('動画を作成できませんでした。');
        const linkResult = await apiPost('/api/lesson-text-video-links', {
          lesson_id: Number(lessonId),
          text_file_key: fileKey,
          video_id: videoId,
          link_order: sections.length,
        });
        if (linkResult?.success === false) throw new Error(linkResult.message || '動画の紐づけに失敗しました。');
      }
      closeSection();
      await load();
      showNotice('セクションを追加しました。', false);
    } catch (addError) {
      if (videoId) {
        await apiDelete(`/api/lesson-videos/${videoId}`).catch(() => null);
      }
      console.error('セクションの追加に失敗:', addError);
      setSectionMessage(addError?.message || 'セクションの追加に失敗しました。');
    } finally {
      setAddingSection(false);
    }
  };

  const downloadSectionFile = async (section) => {
    if (!section.key) return;
    try {
      setDownloadingKey(section.key);
      const blob = await apiDownloadBinary('/api/lessons/download-file', {
        method: 'POST',
        body: JSON.stringify({ fileKey: section.key }),
        headers: { 'Content-Type': 'application/json' },
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = section.fileName || 'downloaded-file';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (downloadError) {
      console.error('セクションファイルのダウンロードに失敗:', downloadError);
      showNotice(downloadError?.message || 'ファイルのダウンロードに失敗しました。', true);
    } finally {
      setDownloadingKey('');
    }
  };

  const deleteSection = async (section, index) => {
    const label = section.fileName || `セクション${index + 1}`;
    const fileNote = section.source === 'link' ? '' : '\nテキストファイルも削除されます。';
    const videoNote = section.videoId ? '\n付いている動画も削除されます。' : '';
    if (!window.confirm(`「${label}」のセクションを削除しますか？\nこの操作は取り消せません。${fileNote}${videoNote}`)) return;

    try {
      setDeletingKey(section.key);
      if (section.linkId) {
        const linkResult = await apiDelete(`/api/lesson-text-video-links/${section.linkId}`);
        if (linkResult?.success === false) throw new Error(linkResult.message || '動画の紐づけを削除できませんでした。');
      }
      if (section.videoId) {
        const videoResult = await apiDelete(`/api/lesson-videos/${section.videoId}`);
        if (videoResult?.success === false) throw new Error(videoResult.message || '動画を削除できませんでした。');
      }
      if (section.source === 'text' && section.textFileId) {
        const fileResult = await apiDelete(`/api/lesson-text-files/${section.textFileId}`);
        if (fileResult?.success === false) throw new Error(fileResult.message || 'テキストファイルを削除できませんでした。');
      } else if (section.source === 'main') {
        const body = new FormData();
        body.append('title', lesson.title || '');
        body.append('description', lesson.description || '');
        body.append('duration', lesson.duration || '120分');
        body.append('order_index', String(lesson.order_index || 0));
        body.append('course_id', String(lesson.course_id));
        body.append('has_assignment', lesson.has_assignment ? 'true' : 'false');
        body.append('update_file', 'true');
        body.append('remove_file', 'true');
        const lessonResult = await apiCall(`/api/lessons/${lessonId}`, { method: 'PUT', body });
        if (lessonResult?.success === false) throw new Error(lessonResult.message || 'テキストファイルを削除できませんでした。');
      }
      setNoticeIsError(false);
      setNotice('セクションを削除しました。');
      await load();
    } catch (deleteError) {
      console.error('セクションの削除に失敗:', deleteError);
      setNoticeIsError(true);
      setNotice(deleteError?.message || 'セクションの削除に失敗しました。');
    } finally {
      setDeletingKey('');
    }
  };

  return (
    <AdminCurriculumLayout>
      <p>
        <Link to={`/admin/courses/${courseId}`} className="text-sm text-sky-800 underline underline-offset-4">
          コース確認に戻る
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">{lesson?.title || 'レッスン情報'}</h1>
      {notice && <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>}

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && lesson && (
        <div className="mt-6 max-w-5xl space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <h2 className="text-xl font-bold text-gray-900">コース</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">コース名</dt><dd className="text-gray-900">{course?.title || lesson.course_title || '-'}</dd></div>
              <div><dt className="text-gray-500">カテゴリ</dt><dd className="text-gray-900">{course?.category || '-'}</dd></div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">レッスン情報</h2>
              <button
                type="button"
                onClick={openEdit}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                編集
              </button>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">レッスン名</dt><dd className="text-gray-900">{lesson.title || '-'}</dd></div>
              <div><dt className="text-gray-500">所要時間</dt><dd className="text-gray-900">{lesson.duration || '-'}</dd></div>
              <div><dt className="text-gray-500">表示順序</dt><dd className="text-gray-900">{lesson.order_index || 0}</dd></div>
              <div><dt className="text-gray-500">課題</dt><dd className="text-gray-900">{lesson.has_assignment ? 'あり' : 'なし'}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">説明</dt>
                <dd className="whitespace-pre-wrap text-gray-900">{lesson.description || '説明なし'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-gray-900">セクション一覧</h2>
              <div className="flex flex-wrap items-center gap-4">
                <button
                  type="button"
                  onClick={() => {
                    setNewFile(null);
                    setNewVideo(emptyVideo);
                    setSectionMessage('');
                    setFileInputKey((value) => value + 1);
                    setSectionOpen(true);
                  }}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  セクション追加
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
            <p className="mt-2 text-sm text-gray-600">1つのセクションは、テキスト1つと動画1つです。動画が無いセクションもあります。サムネイルはYouTubeのURLから表示します。</p>
            {sections.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">セクションはありません。</p>
            ) : (
              <ol className="mt-4 space-y-4">
                {sections.map((section, index) => (
                  <li key={`${section.key}-${index}`} className="rounded-xl border border-sky-200 bg-white px-5 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-sky-800">セクション{index + 1}</p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => openSectionEdit(section)}
                          className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700"
                        >
                          編集
                        </button>
                        {showDeletes && (
                          <button
                            type="button"
                            onClick={() => deleteSection(section, index)}
                            disabled={deletingKey === section.key}
                            className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            削除
                          </button>
                        )}
                      </div>
                    </div>
                    <LessonSectionFacts
                      section={section}
                      onDownload={downloadSectionFile}
                      downloading={downloadingKey === section.key}
                    />
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      )}

      {editOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">レッスン情報の編集</h2>
              <button type="button" onClick={() => setEditOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveLesson}>
              <Field label="レッスン名" required>
                <input className={fieldClass} value={lessonForm.title} onChange={(event) => setLessonForm((prev) => ({ ...prev, title: event.target.value }))} />
              </Field>
              <Field label="説明">
                <textarea className={fieldClass} rows={4} value={lessonForm.description} onChange={(event) => setLessonForm((prev) => ({ ...prev, description: event.target.value }))} />
              </Field>
              <Field label="所要時間" hint="空欄のときは120分になります。">
                <input className={fieldClass} value={lessonForm.duration} onChange={(event) => setLessonForm((prev) => ({ ...prev, duration: event.target.value }))} />
              </Field>
              <Field label="表示順序" required>
                <input className={fieldClass} type="number" min="0" step="1" value={lessonForm.orderIndex} onChange={(event) => setLessonForm((prev) => ({ ...prev, orderIndex: event.target.value }))} />
              </Field>
              <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
                <input
                  type="checkbox"
                  checked={lessonForm.hasAssignment}
                  onChange={(event) => setLessonForm((prev) => ({ ...prev, hasAssignment: event.target.checked }))}
                  className="h-4 w-4 rounded border-gray-300 text-sky-600"
                />
                課題あり
              </label>
              {lessonMessage && <p className="text-sm text-red-700">{lessonMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={savingLesson} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {savingLesson ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sectionEdit && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">セクションの編集</h2>
              <button type="button" onClick={() => setSectionEdit(null)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveSectionEdit}>
              <p className="text-sm text-gray-600">ファイル名称: {sectionEdit.fileName || '名称未設定'}</p>
              <VideoDraftFields value={sectionDraft} onChange={(field, value) => setSectionDraft((prev) => ({ ...prev, [field]: value }))} />
              <p className="text-xs text-gray-500">URLを空にすると、テキストだけ残して動画を外します。</p>
              {sectionEditMessage && <p className="text-sm text-red-700">{sectionEditMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setSectionEdit(null)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={savingSectionEdit} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {savingSectionEdit ? '保存中...' : '保存'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {sectionOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">セクション追加</h2>
              <button type="button" onClick={closeSection} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={addSection}>
              <Field label="ファイル名称" required hint="PDF、MD、TXT、RTF。動画だけでは追加できません。">
                <input
                  key={fileInputKey}
                  className={fieldClass}
                  type="file"
                  accept=".pdf,.md,.txt,.rtf"
                  onChange={(event) => {
                    setNewFile(event.target.files?.[0] || null);
                    setSectionMessage('');
                  }}
                />
                {newFile && <p className="mt-2 break-all text-sm text-gray-700">{newFile.name}</p>}
              </Field>
              <VideoDraftFields value={newVideo} onChange={(field, value) => setNewVideo((prev) => ({ ...prev, [field]: value }))} />
              {sectionMessage && <p className="text-sm text-red-700">{sectionMessage}</p>}
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={closeSection} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={addingSection} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {addingSection ? '追加中...' : '追加'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminCurriculumLayout>
  );
};

export default AdminLessonDetailPage;
