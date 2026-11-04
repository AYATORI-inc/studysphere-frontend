import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentUserSatelliteId } from '../../utils/locationUtils';
import { API_BASE_URL } from '../../config/apiConfig';
import CourseHeader from '../student/CourseHeader';
import CourseSelector from '../student/CourseSelector';
import LessonTable from '../student/LessonTable';

const buildPreviewLearningUrl = ({ courseId, lessonId, previewSatelliteId }) => {
  const params = new URLSearchParams();
  params.set('course', String(courseId));
  params.set('lesson', String(lessonId));
  params.set('preview', '1');
  params.set('previewSatelliteId', String(previewSatelliteId));
  return `/student/enhanced-learning?${params.toString()}`;
};

const DisabledFeatureCallout = () => (
  <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-left">
    <div className="font-semibold text-yellow-800 mb-2">この画面は「利用者視点のプレビュー」です</div>
    <ul className="list-disc pl-5 text-sm text-yellow-800 space-y-1">
      <li>テスト（提出/採点/結果表示） ※問題画面の閲覧は可能</li>
      <li>提出物（アップロード/削除）</li>
      <li>適職診断 / TOYBOX へのリンク</li>
    </ul>
    <div className="mt-2 text-xs text-yellow-700">上記はプレビューでは実行できません（閲覧・導線確認のみ）。</div>
  </div>
);

const SatelliteCourseDashboardPreview = ({ satelliteId, onOpenLessons }) => {
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/api/user-courses/satellite/${satelliteId}/available-courses`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) {
          throw new Error(data.message || `コース取得に失敗しました (${res.status})`);
        }
        if (!cancelled) {
          setCourses(Array.isArray(data.data) ? data.data : []);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'データの取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [satelliteId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">データを読み込み中...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-xl font-semibold mb-2">エラー</div>
          <div className="text-gray-700">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー（利用者ダッシュボードに合わせる） */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
          <h2 className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-2">
            ダッシュボード
          </h2>
          <p className="text-lg text-gray-600">おかえりなさい、閲覧用ユーザさん！学習を続けましょう。</p>
          <p className="text-sm text-gray-500 mt-1">（プレビュー：拠点で許可されたカリキュラムを全件閲覧）</p>
        </div>

        {/* 声かけ（実利用者依存のためプレースホルダ） */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-8 border border-gray-100">
          <h3 className="text-xl font-bold text-gray-800 mb-3">🗣️ 声かけ</h3>
          <div className="text-sm text-gray-600">
            プレビューでは利用者個別の声かけ内容は表示できません（導線・レイアウト確認のみ）。
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 受講可能なコース（拠点許可） */}
          <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-6">📚 受講可能コース</h3>
            <div className="space-y-4">
              {courses.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p className="text-lg mb-2">受講可能なコースがありません</p>
                  <p className="text-sm">管理者にお問い合わせください</p>
                </div>
              ) : (
                courses.map((course) => {
                  const totalLessons = Number(course.total_lessons || course.lesson_count || 0);
                  const completedLessons = Number(course.completed_lessons || 0);
                  const progress = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;
                  return (
                    <div key={course.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-lg transition-all duration-200">
                      <div className="flex items-center justify-between mb-3">
                        <h4 className="font-semibold text-gray-800">{course.title}</h4>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-medium">
                            {course.category || '未分類'}
                          </span>
                        </div>
                      </div>

                      {course.description && (
                        <div className="text-sm text-gray-600 mb-4 line-clamp-2">
                          {course.description}
                        </div>
                      )}

                      <div className="mb-4">
                        <div className="flex justify-between text-sm text-gray-600 mb-2">
                          <span>進捗: {progress}%</span>
                          <span>{completedLessons}/{totalLessons} レッスン完了</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="h-2 rounded-full transition-all duration-300 bg-gradient-to-r from-blue-400 to-cyan-600"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <button
                          className="flex-1 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-all duration-200"
                          onClick={() => onOpenLessons(course.id)}
                        >
                          詳細を見る
                        </button>
                        <button
                          className="flex-1 px-4 py-2 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-lg font-medium transition-all duration-200"
                          onClick={async () => {
                            try {
                              const resp = await fetch(`${API_BASE_URL}/api/courses/${course.id}`, {
                                headers: {
                                  'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
                                  'Content-Type': 'application/json'
                                }
                              });
                              const json = await resp.json().catch(() => ({}));
                              const lessons = Array.isArray(json?.data?.lessons) ? json.data.lessons : [];
                              const activeLessons = lessons.filter(l => l.status === 'active' || l.status === undefined);
                              const firstLesson = activeLessons[0];
                              if (!resp.ok || !json.success || !firstLesson?.id) {
                                throw new Error(json.message || 'レッスン情報が取得できませんでした');
                              }
                              navigate(buildPreviewLearningUrl({ courseId: course.id, lessonId: firstLesson.id, previewSatelliteId: satelliteId }));
                            } catch (e) {
                              alert(`学習画面の表示に失敗しました: ${e.message || e}`);
                            }
                          }}
                        >
                          学習開始
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* 修了証（実利用者依存のためプレースホルダ） */}
          <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
            <h3 className="text-xl font-bold text-gray-800 mb-3">🏅 修了証</h3>
            <div className="text-sm text-gray-600">
              プレビューでは利用者個別の修了証一覧は表示できません（導線・レイアウト確認のみ）。
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

const SatelliteLessonListPreview = ({ satelliteId, selectedCourseId, onSelectCourseId }) => {
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [lessons, setLessons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const normalizedCourses = useMemo(() => courses, [courses]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`${API_BASE_URL}/api/user-courses/satellite/${satelliteId}/available-courses`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || `コース取得に失敗しました (${res.status})`);

        if (cancelled) return;
        const raw = Array.isArray(data.data) ? data.data : [];
        setCourses(raw);

        if (raw.length === 0) {
          setSelectedCourse(null);
          setLessons([]);
          return;
        }

        const initial = selectedCourseId
          ? raw.find((c) => c.id === selectedCourseId) || raw[0]
          : raw[0];
        setSelectedCourse(initial);
        onSelectCourseId?.(initial.id);
      } catch (e) {
        if (!cancelled) setError(e.message || 'データ取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [satelliteId]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedCourse?.id) return;
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE_URL}/api/courses/${selectedCourse.id}`, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
            'Content-Type': 'application/json'
          }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.message || `レッスン取得に失敗しました (${res.status})`);

        if (!cancelled) {
          const rawLessons = Array.isArray(data.data?.lessons) ? data.data.lessons : [];
          const activeLessons = rawLessons
            .filter(l => l.status === 'active' || l.status === undefined)
            .map(l => ({
              ...l,
              progress_status: 'not_started',
              assignment_submitted: false,
              assignment_submitted_at: null
            }));
          setLessons(activeLessons);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'レッスン取得に失敗しました');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selectedCourse?.id]);

  if (loading && normalizedCourses.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 p-6">
      {/* エラーメッセージ */}
      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg">
          <div className="font-semibold mb-1">エラーが発生しました</div>
          <div>{error}</div>
        </div>
      )}

      <CourseHeader course={selectedCourse} />

      {normalizedCourses.length > 0 && (
        <CourseSelector
          courses={normalizedCourses}
          selectedCourse={selectedCourse}
          onCourseSelect={(course) => {
            setSelectedCourse(course);
            onSelectCourseId?.(course.id);
          }}
        />
      )}

      {selectedCourse && (
        <LessonTable
          lessons={lessons}
          testResults={{}}
          currentLessonId={null}
          isPreview
          onStartLesson={(lesson) => {
            navigate(buildPreviewLearningUrl({ courseId: lesson.course_id, lessonId: lesson.id, previewSatelliteId: satelliteId }));
          }}
          onViewExamResults={() => {
            alert('プレビューでは「試験結果一覧」は利用できません。');
          }}
          onSubmitAssignment={() => {
            alert('プレビューでは「課題提出」は利用できません。');
          }}
        />
      )}

      {normalizedCourses.length === 0 && !loading && (
        <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="text-gray-500 text-lg mb-4">受講可能なコースがありません</div>
        </div>
      )}
    </div>
  );
};

const LearningPreviewPanel = () => {
  const { currentUser } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedCourseId, setSelectedCourseId] = useState(null);

  const currentSatelliteId = useMemo(() => getCurrentUserSatelliteId(currentUser), [currentUser]);

  if (!currentUser) {
    return <div>Loading...</div>;
  }

  if (!currentSatelliteId) {
    return (
      <div className="p-8 bg-white rounded-lg shadow-lg text-center text-gray-600">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">🎓 学習画面プレビュー</h2>
        <div className="text-red-700">拠点が選択されていません。右上の拠点切替から拠点を選択してください。</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white rounded-lg shadow-lg p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-4">🎓 学習画面プレビュー</h2>
        <DisabledFeatureCallout />
      </div>

      <div className="mt-6">
        {/* 利用者ダッシュボード風のナビ */}
        <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-bold text-white">Study Sphere</h1>
                  <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">
                    利用者
                  </span>
                </div>
              </div>

              <div className="flex flex-col md:flex-row items-center gap-4">
                <div className="flex items-center gap-3">
                  <span className="font-medium text-white">
                    閲覧用ユーザさん
                    <span className="text-blue-100 text-sm ml-2">（担当：未設定）</span>
                  </span>
                  <button
                    className="px-4 py-2 bg-gray-200 text-gray-500 border border-gray-300 rounded-lg font-medium cursor-not-allowed"
                    disabled
                    title="プレビューではログアウトできません"
                  >
                    🚪 ログアウト（無効）
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex flex-wrap gap-3">
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'dashboard'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
                onClick={() => setActiveTab('dashboard')}
              >
                📊 ダッシュボード
              </button>
              <button
                className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                  activeTab === 'lessons'
                    ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-blue-700'
                }`}
                onClick={() => setActiveTab('lessons')}
              >
                📚 レッスン一覧
              </button>
              <button
                className="px-4 py-2 rounded-lg font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
                title="プレビューでは利用できません"
                disabled
              >
                🎯 適職診断（無効）
              </button>
              <button
                className="px-4 py-2 rounded-lg font-medium text-gray-400 bg-gray-50 cursor-not-allowed"
                title="プレビューでは利用できません"
                disabled
              >
                TOYBOX（無効）
              </button>
            </div>
          </div>
        </div>

        <main className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
          {activeTab === 'dashboard' && (
            <div className="bg-white rounded-2xl shadow-xl p-0 overflow-hidden">
              <SatelliteCourseDashboardPreview
                satelliteId={currentSatelliteId}
                onOpenLessons={(courseId) => {
                  setSelectedCourseId(courseId);
                  setActiveTab('lessons');
                }}
              />
            </div>
          )}

          {activeTab === 'lessons' && (
            <div className="bg-white rounded-2xl shadow-xl p-0 overflow-hidden">
              <SatelliteLessonListPreview
                satelliteId={currentSatelliteId}
                selectedCourseId={selectedCourseId}
                onSelectCourseId={setSelectedCourseId}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default LearningPreviewPanel;

