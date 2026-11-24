import React, { useState, useEffect } from 'react';
import { useAuth } from './contexts/AuthContext';
import { printCertificate } from '../utils/certificatePrint';
import { API_BASE_URL } from '../config/apiConfig';
import { fetchStudentCourses, fetchStudentLessons } from '../utils/studentApi';
import LessonNumberBadge from './student/LessonNumberBadge';

const latestCertificate = (current, next) => {
  if (!current) return next;
  const currentTime = new Date(current.examDate || 0).getTime();
  const nextTime = new Date(next.examDate || 0).getTime();
  return nextTime >= currentTime ? next : current;
};

const buildCurricula = (courses, lessonGroups, certificates, { includeExtras = true } = {}) => {
  const certificatesByLesson = new Map();
  certificates.forEach((certificate) => {
    const lessonId = Number(certificate.lessonId);
    certificatesByLesson.set(
      lessonId,
      latestCertificate(certificatesByLesson.get(lessonId), certificate)
    );
  });

  const curricula = courses.map((course, index) => {
    const lessons = [...(lessonGroups[index] || [])].sort((left, right) => {
      const orderDiff = Number(left.order_index || 0) - Number(right.order_index || 0);
      if (orderDiff !== 0) return orderDiff;
      return Number(left.id) - Number(right.id);
    });
    const items = lessons.map((lesson, lessonIndex) => ({
      id: lesson.id,
      number: lessonIndex + 1,
      title: lesson.title,
      certificate: certificatesByLesson.get(Number(lesson.id)) || null,
    }));
    const earned = items.filter((item) => item.certificate).length;
    return {
      id: course.id,
      title: course.title,
      description: course.description || '',
      category: course.category || '',
      progress: Number(course.progress_percentage || 0),
      lessons: items,
      earned,
      total: items.length,
      complete: items.length > 0 && earned === items.length,
    };
  });

  if (!includeExtras) return curricula;

  const knownCourseIds = new Set(curricula.map((course) => Number(course.id)));
  const extras = new Map();
  certificates.forEach((certificate) => {
    const courseId = Number(certificate.courseId);
    if (knownCourseIds.has(courseId)) return;
    if (!extras.has(courseId)) {
      extras.set(courseId, {
        id: courseId,
        title: certificate.courseTitle || 'カリキュラム',
        lessons: [],
      });
    }
    const bucket = extras.get(courseId);
    if (bucket.lessons.some((lesson) => Number(lesson.id) === Number(certificate.lessonId))) return;
    bucket.lessons.push({
      id: certificate.lessonId,
      number: bucket.lessons.length + 1,
      title: certificate.lessonTitle,
      certificate,
    });
  });
  extras.forEach((course) => {
    curricula.push({
      ...course,
      earned: course.lessons.length,
      total: course.lessons.length,
      complete: course.lessons.length > 0,
    });
  });

  return curricula;
};

const CurriculumCard = ({ curriculum, onView, showDescription, className }) => (
  <article className={className}>
    <div className="flex items-start justify-between gap-3">
      <h3 className="font-semibold text-gray-800 leading-snug">{curriculum.title}</h3>
      {curriculum.complete && (
        <span className="certificate-complete shrink-0 px-2.5 py-1 rounded-full text-xs font-bold">
          完了
        </span>
      )}
    </div>
    {showDescription && (curriculum.description || '').trim() !== '' && (
      <p className="mt-2 text-sm text-gray-600 leading-relaxed line-clamp-3 whitespace-pre-line">
        {(curriculum.description || '').trim()}
      </p>
    )}
    <p className="mt-2 text-sm text-gray-500">
      このカリキュラムでは <span className="font-semibold text-gray-800">{curriculum.earned}個</span> 取得
      <span className="ml-2">全{curriculum.total}レッスン</span>
    </p>
    <div className="mt-3 flex flex-wrap items-end gap-1.5">
      {curriculum.lessons.map((lesson) => (
        <LessonNumberBadge
          key={lesson.id}
          number={lesson.number}
          earned={Boolean(lesson.certificate)}
          label={
            lesson.certificate
              ? `レッスン${lesson.number} ${lesson.title} 修了証を確認`
              : `レッスン${lesson.number} ${lesson.title} 未取得`
          }
          onClick={() => onView(lesson.certificate)}
        />
      ))}
    </div>
  </article>
);

const CertificateList = ({ embedded = false, variant = 'all', courseId = null }) => {
  const { currentUser } = useAuth();
  const [curricula, setCurricula] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedCertificate, setSelectedCertificate] = useState(null);
  const [showModal, setShowModal] = useState(false);

  useEffect(() => {
    const fetchCertificates = async () => {
      if (!currentUser?.id || (variant === 'current' && !courseId)) {
        setCurricula([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const [coursesResponse, certificateResponse] = await Promise.all([
          fetchStudentCourses(),
          fetch(`${API_BASE_URL}/api/learning/certificates/${currentUser.id}`, {
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json'
            }
          })
        ]);

        if (!certificateResponse.ok) {
          setError('修了証の取得に失敗しました');
          return;
        }

        const certificateData = await certificateResponse.json();
        if (!certificateData.success) {
          setError(certificateData.message || '修了証の取得に失敗しました');
          return;
        }

        const enrolled = coursesResponse?.success ? (coursesResponse.data || []) : [];
        const courses = variant === 'current'
          ? enrolled.filter((course) => Number(course.id) === Number(courseId))
          : enrolled;
        const lessonGroups = await Promise.all(courses.map(async (course) => {
          try {
            const lessonResponse = await fetchStudentLessons(course.id);
            return lessonResponse?.success ? (lessonResponse.data || []) : [];
          } catch (lessonError) {
            console.error('レッスン一覧取得エラー:', lessonError);
            return [];
          }
        }));

        setCurricula(buildCurricula(courses, lessonGroups, certificateData.data || [], {
          includeExtras: variant !== 'current',
        }));
      } catch (fetchError) {
        console.error('修了証取得エラー:', fetchError);
        setError('修了証の取得中にエラーが発生しました');
      } finally {
        setLoading(false);
      }
    };

    fetchCertificates();
  }, [currentUser?.id, variant, courseId]);

  const handleViewCertificate = (certificate) => {
    setSelectedCertificate(certificate);
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedCertificate(null);
  };

  const Panel = ({ children }) => {
    if (embedded) {
      return <div>{children}</div>;
    }
    return (
      <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
        {children}
      </div>
    );
  };

  const Title = () => {
    if (embedded) return null;
    return <h3 className="text-xl font-bold text-gray-800 mb-6">🏆 修了証の確認</h3>;
  };

  if (loading) {
    if (variant === 'current') {
      return (
        <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">現在受講中</h2>
          <p className="text-gray-500">読み込み中...</p>
        </section>
      );
    }
    return (
      <Panel>
        <Title />
        <div className="flex items-center justify-center py-8">
          <div className="text-blue-600 text-lg">読み込み中...</div>
        </div>
      </Panel>
    );
  }

  if (error) {
    if (variant === 'current') {
      return (
        <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          <h2 className="text-2xl font-bold text-gray-800 mb-4">現在受講中</h2>
          <p className="text-red-600">{error}</p>
        </section>
      );
    }
    return (
      <Panel>
        <Title />
        <div className="text-center py-8">
          <div className="text-red-600 text-lg mb-4">{error}</div>
          <button 
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            再試行
          </button>
        </div>
      </Panel>
    );
  }

  const currentCurriculum = curricula[0];

  const cards = curricula.map((curriculum) => (
    <CurriculumCard
      key={curriculum.id}
      curriculum={curriculum}
      onView={handleViewCertificate}
      showDescription={false}
      className="rounded-xl border border-gray-200 p-4"
    />
  ));

  const list = variant === 'current' ? (
    <section className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">現在受講中</h2>
      {currentCurriculum ? (
        <>
          <p className="text-xl font-semibold text-gray-800">{currentCurriculum.title}</p>
          {(currentCurriculum.description || '').trim() !== '' && (
            <p className="mt-2 text-sm text-gray-600 leading-relaxed whitespace-pre-line">
              {(currentCurriculum.description || '').trim()}
            </p>
          )}
          <p className="mt-3 text-sm text-gray-800">
            {currentCurriculum.earned}個取得
            <span className="ml-3">全{currentCurriculum.total}レッスン</span>
          </p>
          <div className="mt-3 flex flex-wrap items-end gap-1.5">
            {currentCurriculum.lessons.map((lesson) => (
              <LessonNumberBadge
                key={lesson.id}
                number={lesson.number}
                earned={Boolean(lesson.certificate)}
                label={
                  lesson.certificate
                    ? `レッスン${lesson.number} ${lesson.title} 修了証を確認`
                    : `レッスン${lesson.number} ${lesson.title} 未取得`
                }
                onClick={() => handleViewCertificate(lesson.certificate)}
              />
            ))}
          </div>
        </>
      ) : (
        <p className="text-gray-500">現在受講中のコースはありません。</p>
      )}
    </section>
  ) : (
    <Panel>
      <Title />
      {curricula.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p className="text-lg mb-2">まだ修了証がありません</p>
          <p className="text-sm">レッスンを完了して修了証を獲得しましょう。</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{cards}</div>
      )}
    </Panel>
  );

  return (
    <>
      {list}

      {/* 修了証詳細モーダル */}
      {showModal && selectedCertificate && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[80] p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-y-auto">
            <div className="p-8">
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-3xl font-bold text-gray-800">合格証明書</h2>
                <button 
                  onClick={closeModal}
                  className="text-gray-500 hover:text-gray-700 text-3xl font-bold"
                >
                  ×
                </button>
              </div>
              
              {/* 証明書本体 */}
              <div className="certificate-paper bg-white rounded-2xl shadow-2xl p-8 border-8 border-gradient-to-r from-blue-500 to-cyan-600 relative overflow-hidden">
                {/* 装飾的な背景要素 */}
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute top-4 left-4 w-16 h-16 border-4 border-blue-200 rounded-full"></div>
                  <div className="absolute top-4 right-4 w-16 h-16 border-4 border-cyan-200 rounded-full"></div>
                  <div className="absolute bottom-4 left-4 w-16 h-16 border-4 border-blue-200 rounded-full"></div>
                  <div className="absolute bottom-4 right-4 w-16 h-16 border-4 border-cyan-200 rounded-full"></div>
                </div>

                {/* 証明書内容 */}
                <div className="relative z-10">
                  {/* ヘッダー部分 */}
                  <div className="text-center mb-8">
                    <div className="flex items-center justify-center gap-6 mb-6">
                      <div className="w-20 h-20 bg-gradient-to-r from-blue-500 to-cyan-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                        {selectedCertificate.officeName ? selectedCertificate.officeName.charAt(0) : 'S'}
                      </div>
                      <div className="text-left">
                        <h3 className="text-2xl font-bold text-gray-800">{selectedCertificate.officeName}</h3>
                        <p className="text-gray-600">{selectedCertificate.companyName}</p>
                        <p className="text-sm text-gray-500">
                          {selectedCertificate.officeAddress || ''}
                          {selectedCertificate.officePhone && (
                            <>
                              <br />
                              TEL: {selectedCertificate.officePhone}
                            </>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* メインタイトル */}
                  <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-cyan-600 bg-clip-text text-transparent mb-2">
                      修了証明書
                    </h1>
                    <p className="text-gray-600 text-lg">Certificate of Completion</p>
                  </div>

                  {/* 証明書本文 */}
                  <div className="mb-12">
                    <p className="text-lg text-gray-700 text-center mb-8 leading-relaxed">
                      この証明書は、下記の方が
                      <span className="font-bold text-blue-600 mx-2">{selectedCertificate.lessonTitle}</span>
                      の学習を修了したことを証明します。
                    </p>

                    <div className="bg-gray-50 rounded-xl p-6 mb-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">氏名</span>
                          <span className="text-gray-800">{selectedCertificate.studentName}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">利用者ID</span>
                          <span className="text-gray-800">{selectedCertificate.studentId}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">修了日</span>
                          <span className="text-gray-800">{selectedCertificate.completionDate}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">テスト結果</span>
                          <span className="text-blue-600 font-bold">{selectedCertificate.score}点</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">正答率</span>
                          <span className="text-green-600 font-bold">{selectedCertificate.percentage}%</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="font-semibold text-gray-700">証明書ID</span>
                          <span className="text-gray-600 font-mono text-sm">{selectedCertificate.certificateId}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-center">
                      <p className="text-gray-600 mb-4">
                        {selectedCertificate.completionDate}
                      </p>
                      <div className="flex items-center justify-center gap-8">
                        {selectedCertificate.instructorName && (
                          <div className="text-center">
                            <div className="w-24 h-16 border-b-2 border-gray-400 mb-2"></div>
                            <p className="text-sm text-gray-600">指導員</p>
                            <p className="text-sm font-semibold text-gray-800">{selectedCertificate.instructorName}</p>
                          </div>
                        )}
                        {selectedCertificate.managerNames && selectedCertificate.managerNames.length > 0 && (
                          <div className="text-center">
                            <div className="w-24 h-16 border-b-2 border-gray-400 mb-2"></div>
                            <p className="text-sm text-gray-600">拠点管理者</p>
                            <div className="text-sm font-semibold text-gray-800">
                              {selectedCertificate.managerNames.map((name, index) => (
                                <div key={index}>{name}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 mt-8">
                <button 
                  onClick={closeModal}
                  className="flex-1 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white rounded-lg font-medium transition-colors"
                >
                  閉じる
                </button>
                <button 
                  onClick={() => {
                    // A4サイズ1枚に最適化された印刷機能
                    printCertificate(selectedCertificate);
                  }}
                  className="flex-1 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium transition-colors"
                >
                  🖨️ 印刷
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default CertificateList;
