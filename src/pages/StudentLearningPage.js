import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useStudentGuard } from '../utils/hooks/useAuthGuard';
import { useAuth } from '../components/contexts/AuthContext';
import { fetchStudentCourses, fetchStudentLessons } from '../utils/studentApi';
import { API_BASE_URL } from '../config/apiConfig';
import LessonVideoPlayer from '../components/LessonVideoPlayer';
import MarkdownRenderer from '../components/learning/MarkdownRenderer';
import UploadModal from '../components/learning/UploadModal';
import aiAssistant from '../components/learning/AIAssistantService';
const VIEW_OPTIONS = [
  { id: 'video', label: '動画' },
  { id: 'text', label: '教科書' },
  { id: 'ai', label: 'AI質問' },
  { id: 'split', label: '動画・教科書並べて表示' },
];

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem('accessToken')}`,
  'Content-Type': 'application/json',
});

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

const StudentLearningPage = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currentUser } = useStudentGuard();
  const { logout } = useAuth();
  const courseId = searchParams.get('course');
  const lessonId = searchParams.get('lesson');
  const [course, setCourse] = useState(null);
  const [lesson, setLesson] = useState(null);
  const [sections, setSections] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [sectionsOpen, setSectionsOpen] = useState(true);
  const [viewMode, setViewMode] = useState('video');
  const [textContent, setTextContent] = useState('');
  const [textLoading, setTextLoading] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiMessages, setAiMessages] = useState([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const textScrollRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      if (!currentUser?.id) return;
      if (!courseId || !lessonId) {
        setLoading(false);
        setError('開くレッスンが指定されていません。');
        return;
      }
      try {
        setLoading(true);
        setError(null);
        const [coursesResponse, lessonsResponse, sectionsResponse, currentResponse] = await Promise.all([
          fetchStudentCourses(),
          fetchStudentLessons(courseId),
          fetch(`${API_BASE_URL}/api/lesson-text-video-links/lesson/${lessonId}`, { headers: authHeaders() }),
          fetch(`${API_BASE_URL}/api/learning/current-lesson?courseId=${courseId}`, { headers: authHeaders() }),
        ]);
        const enrolled = coursesResponse?.success ? (coursesResponse.data || []) : [];
        const foundCourse = enrolled.find((item) => Number(item.id) === Number(courseId)) || null;
        const lessonList = lessonsResponse?.success ? (lessonsResponse.data || []) : [];
        const foundLesson = lessonList.find((item) => Number(item.id) === Number(lessonId)) || null;
        const sectionData = sectionsResponse.ok ? await sectionsResponse.json() : { data: [] };
        let resumeFile = '';
        if (currentResponse.ok) {
          const currentData = await currentResponse.json();
          const rows = Array.isArray(currentData.data) ? currentData.data : [];
          const resume = rows.find((item) => Number(item.lesson_id) === Number(lessonId));
          resumeFile = fileNameOf(resume?.last_viewed_section_text_key);
        }
        const nextSections = [...(sectionData.data || [])]
          .sort((left, right) => Number(left.link_order || 0) - Number(right.link_order || 0))
          .map((section, index) => ({
            id: section.id ?? `${lessonId}-${index}`,
            label: sectionLabel(section),
            youtubeUrl: section.youtube_url || '',
            textFileKey: section.text_file_key || '',
            isResume: Boolean(resumeFile && fileNameOf(section.text_file_key) === resumeFile),
          }))
          .filter((section) => section.label);
        const requested = Number(new URLSearchParams(window.location.search).get('section'));
        const resumeIndex = nextSections.findIndex((section) => section.isResume);
        const initialIndex = Number.isInteger(requested) && requested >= 0 && requested < nextSections.length
          ? requested
          : (resumeIndex >= 0 ? resumeIndex : 0);
        if (cancelled) return;
        setCourse(foundCourse);
        setLesson(foundLesson);
        setSections(nextSections);
        setSelectedIndex(initialIndex);
        if (!foundCourse || !foundLesson) setError('このレッスンは見られません。');
      } catch (loadError) {
        console.error('学習画面の取得に失敗しました:', loadError);
        if (!cancelled) setError('学習画面を読み込めませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id, courseId, lessonId]);

  const selectSection = (index) => {
    setSelectedIndex(index);
    const params = new URLSearchParams(searchParams);
    params.set('section', String(index));
    navigate(`/student/enhanced-learning?${params.toString()}`, { replace: true });
  };

  const openSectionTest = (index) => {
    sessionStorage.removeItem(`test_data_${lessonId}_${index}`);
    navigate(`/student/section-test?lesson=${lessonId}&section=${index}`);
  };

  const openLessonTest = () => {
    sessionStorage.removeItem(`test_data_lesson_${lessonId}`);
    navigate(`/student/lesson-test?lesson=${lessonId}`);
  };

  const selectedSection = sections[selectedIndex] || null;

  useEffect(() => {
    if (viewMode === 'video' || !selectedSection?.textFileKey) {
      if (viewMode !== 'video' && selectedSection && !selectedSection.textFileKey) setTextContent('');
      return undefined;
    }
    let cancelled = false;
    const loadText = async () => {
      setTextLoading(true);
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/test/learning/extract-text?s3Key=${encodeURIComponent(selectedSection.textFileKey)}`,
          { headers: authHeaders() }
        );
        const raw = response.ok ? await response.text() : '';
        let content = '';
        const trimmed = raw.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          const data = JSON.parse(trimmed);
          const payload = data?.data;
          content = (typeof payload === 'string' ? payload : '')
            || payload?.text
            || payload?.textContent
            || data?.text
            || '';
        } else {
          content = raw;
        }
        if (!cancelled) setTextContent(content);
      } catch (textError) {
        console.error('教科書の取得に失敗しました:', textError);
        if (!cancelled) setTextContent('');
      } finally {
        if (!cancelled) setTextLoading(false);
      }
    };
    loadText();
    return () => {
      cancelled = true;
    };
  }, [viewMode, selectedSection]);

  const askAi = async () => {
    const question = aiInput.trim();
    if (!question || aiLoading) return;
    setAiInput('');
    setAiMessages((current) => [...current, { role: 'user', text: question }]);
    setAiLoading(true);
    const result = await aiAssistant.askQuestion(
      question,
      textContent || selectedSection?.label || '',
      lesson?.title || ''
    );
    const answer = result.success ? result.answer : (result.fallbackAnswer || '回答を取得できませんでした。');
    setAiMessages((current) => [...current, { role: 'ai', text: answer }]);
    setAiLoading(false);
  };

  const openAssignment = () => {
    if (!lesson?.has_assignment) {
      window.alert('このレッスンに課題はありません。');
      return;
    }
    setShowUpload(true);
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!(file.type.includes('zip') || file.name.toLowerCase().endsWith('.zip'))) {
      window.alert('ZIPファイルのみアップロード可能です');
      return;
    }
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('lessonId', lessonId);
      const response = await fetch(`${API_BASE_URL}/api/learning/upload-assignment`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('accessToken')}` },
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok && data.success) {
        setShowUpload(false);
        window.alert('成果物のアップロードが完了しました。');
      } else {
        window.alert(data.message ? `アップロードに失敗しました: ${data.message}` : 'アップロードに失敗しました。');
      }
    } catch (uploadError) {
      console.error('課題のアップロードに失敗しました:', uploadError);
      window.alert('アップロード中にエラーが発生しました。');
    }
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

  if (!currentUser) {
    return (
      <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">認証中...</div>
      </div>
    );
  }

  return (
    <div className="student-shell flex h-screen flex-col overflow-hidden bg-gradient-to-br from-blue-50 to-cyan-50">
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
          {course?.title && (
            <p className="text-sm text-gray-500">{course.title}</p>
          )}
          {lesson?.title && (
            <h2 className="text-xl font-bold text-gray-800">{lesson.title}</h2>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className={`flex h-full shrink-0 flex-col ${
          sectionsOpen ? 'w-80 border-r border-gray-200 bg-white' : 'pointer-events-none w-12'
        }`}>
          {sectionsOpen && (
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
              {loading && <p className="text-sm text-gray-500">読み込み中...</p>}
              {!loading && error && <p className="text-sm text-red-600">{error}</p>}
              {!loading && !error && (
                <ol className="space-y-3">
                  {sections.map((section, index) => {
                    const selected = index === selectedIndex;
                    return (
                      <li
                        key={section.id}
                        className={`rounded-xl border p-2 ${
                          selected ? 'border-blue-600 bg-gray-100' : 'border-transparent'
                        }`}
                      >
                        <button
                          type="button"
                          className={`flex w-full flex-col items-start gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${
                            selected
                              ? 'bg-blue-500 text-white shadow-sm'
                              : 'border border-gray-200 bg-gray-100 text-gray-800 hover:bg-gray-200'
                          }`}
                          onClick={() => selectSection(index)}
                          aria-current={selected ? 'true' : undefined}
                        >
                          <span className="w-full">{section.label}</span>
                          {(selected || section.isResume) && (
                            <span className="flex flex-wrap gap-2">
                              {selected && (
                                <span className="rounded-full border border-current px-2 py-0.5 text-xs font-semibold">
                                  学習中
                                </span>
                              )}
                              {section.isResume && (
                                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  selected ? 'border border-current' : 'bg-white text-gray-800'
                                }`}>
                                  前回の位置
                                </span>
                              )}
                            </span>
                          )}
                        </button>
                        <button
                          type="button"
                          className={`ml-4 mt-2 inline-flex rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-800 ${
                            selected ? 'bg-white hover:bg-gray-50' : 'bg-gray-100 hover:bg-gray-200'
                          }`}
                          onClick={() => openSectionTest(index)}
                        >
                          テスト
                        </button>
                      </li>
                    );
                  })}
                  {sections.length === 0 && (
                    <li className="text-sm text-gray-500">セクションはありません。</li>
                  )}
                  <li className="border-t border-gray-200 pt-3">
                    <button
                      type="button"
                      className="w-full rounded-lg border border-gray-200 bg-gray-100 px-3 py-2.5 text-left text-sm font-semibold text-gray-800 hover:bg-gray-200"
                      onClick={openLessonTest}
                    >
                      レッスンテスト実施
                    </button>
                  </li>
                </ol>
              )}
            </div>
          )}
          <button
            type="button"
            className="pointer-events-auto mt-auto flex h-12 w-12 shrink-0 items-center justify-center bg-blue-500 text-xl font-bold text-white"
            onClick={() => setSectionsOpen((open) => !open)}
            aria-expanded={sectionsOpen}
            aria-label={sectionsOpen ? 'セクションを閉じる' : 'セクションを表示する'}
          >
            {sectionsOpen ? '<' : '>'}
          </button>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-gray-200 px-4 py-3">
            {VIEW_OPTIONS.map((option) => {
              const active = viewMode === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${
                    active
                      ? 'bg-blue-500 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-800'
                  }`}
                  onClick={() => setViewMode(option.id)}
                  aria-pressed={active}
                >
                  {option.label}
                </button>
              );
            })}
            <button
              type="button"
              className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100"
              onClick={openAssignment}
            >
              課題の提出
            </button>
          </div>
          <div className="min-h-0 flex-1 p-4">
            {(viewMode === 'video' || viewMode === 'split') && (
              <div className={viewMode === 'split' ? 'flex h-full min-h-0 gap-4' : 'h-full'}>
                <div className={viewMode === 'split' ? 'min-h-0 min-w-0 flex-1' : 'h-full'}>
                  {loading ? (
                    <p className="text-sm text-gray-500">読み込み中...</p>
                  ) : selectedSection?.youtubeUrl ? (
                    <LessonVideoPlayer
                      videoUrl={selectedSection.youtubeUrl}
                      title={selectedSection.label}
                      containerClassName="h-full w-full overflow-hidden bg-black"
                    />
                  ) : (
                    <p className="text-sm text-gray-500">このセクションに動画はありません。</p>
                  )}
                </div>
                {viewMode === 'split' && (
                  <div ref={textScrollRef} className="min-h-0 min-w-0 flex-1 overflow-y-auto rounded-xl bg-white p-6 text-gray-800">
                    {textLoading && <p className="text-sm text-gray-500">読み込み中...</p>}
                    {!textLoading && !selectedSection?.textFileKey && (
                      <p className="text-sm text-gray-500">このセクションに教科書はありません。</p>
                    )}
                    {!textLoading && selectedSection?.textFileKey && !textContent && (
                      <p className="text-sm text-gray-500">教科書を表示できませんでした。</p>
                    )}
                    {!textLoading && textContent && (
                      <MarkdownRenderer content={textContent} scrollContainerRef={textScrollRef} />
                    )}
                  </div>
                )}
              </div>
            )}
            {viewMode === 'text' && (
              <div ref={textScrollRef} className="h-full overflow-y-auto rounded-xl bg-white p-6 text-gray-800">
                {textLoading && <p className="text-sm text-gray-500">読み込み中...</p>}
                {!textLoading && !selectedSection?.textFileKey && (
                  <p className="text-sm text-gray-500">このセクションに教科書はありません。</p>
                )}
                {!textLoading && selectedSection?.textFileKey && !textContent && (
                  <p className="text-sm text-gray-500">教科書を表示できませんでした。</p>
                )}
                {!textLoading && textContent && (
                  <MarkdownRenderer content={textContent} scrollContainerRef={textScrollRef} />
                )}
              </div>
            )}
            {viewMode === 'ai' && (
              <div className="flex h-full flex-col rounded-xl bg-white p-4">
                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
                  {aiMessages.length === 0 && (
                    <p className="text-sm text-gray-500">このレッスンについて質問できます。</p>
                  )}
                  {aiMessages.map((message, index) => (
                    <p
                      key={`${message.role}-${index}`}
                      className={`whitespace-pre-wrap text-sm leading-relaxed ${
                        message.role === 'user' ? 'text-gray-800' : 'text-gray-600'
                      }`}
                    >
                      {message.text}
                    </p>
                  ))}
                  {aiLoading && <p className="text-sm text-gray-500">回答を考えています...</p>}
                </div>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    askAi();
                  }}
                >
                  <input
                    type="text"
                    value={aiInput}
                    onChange={(event) => setAiInput(event.target.value)}
                    placeholder="質問を入力"
                    className="min-w-0 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-800"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                    disabled={aiLoading || aiInput.trim() === ''}
                  >
                    送信
                  </button>
                </form>
              </div>
            )}
          </div>
        </section>
      </div>
      <UploadModal
        isOpen={showUpload}
        onClose={() => setShowUpload(false)}
        onFileUpload={handleFileUpload}
      />
    </div>
  );
};

export default StudentLearningPage;
