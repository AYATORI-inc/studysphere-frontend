import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../config/apiConfig';

// 解説APIの同時実行数（多すぎるとサーバー負荷と 500 エラーが増えるため、少数に抑える）
const FEEDBACK_CONCURRENCY = 3;

// 配列の各要素に対して fn を実行する。同時に動かす数は limit まで
const runWithConcurrency = async (items, limit, fn) => {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const current = items[cursor];
      cursor += 1;
      await fn(current);
    }
  });
  await Promise.all(workers);
};

const TestResultPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const isPreview = new URLSearchParams(window.location.search).get('preview') === '1' || location.state?.isPreview === true;
  const [resultData, setResultData] = useState(null);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [nextLesson, setNextLesson] = useState(null);
  const [nextSection, setNextSection] = useState(null);
  // 解説の作成進捗（n/m 表示用）
  const [feedbackProgress, setFeedbackProgress] = useState({ done: 0, total: 0 });

  // サンプル模範解答（実際のシステムでは、DBから取得する）
  const sampleAnswers = {
    1: "学習した内容の要点をまとめて説明してください。具体的なポイントや重要な概念について述べてください。",
    2: "実際の業務での活用方法について、具体的な例を挙げて説明してください。",
    3: "学習中に疑問に思った点や、さらに深く学びたい内容について述べてください。"
  };

  const sampleFeedback = {
    1: "基本的な理解はできていますが、より具体的な例を挙げると理解度が高まります。",
    2: "実践的な視点がよく表現されています。さらに具体的な応用例を考えてみましょう。",
    3: "学習意欲が感じられます。疑問点を解決することで、より深い理解につながります。"
  };

  // 不正解の問題の解説を、同時実行数を制限して先に並列取得する（1件ずつ待つと遅いため）
  const prefetchFeedbacks = async (questions, answers) => {
    const targets = [];
    questions.forEach((question, index) => {
      const userAnswerIndex = answers[question.id];
      if (userAnswerIndex !== undefined && userAnswerIndex !== question.correctAnswer) {
        targets.push({ index, question, userAnswerIndex });
      }
    });
    const feedbackByIndex = {};
    setFeedbackProgress({ done: 0, total: targets.length });
    await runWithConcurrency(targets, FEEDBACK_CONCURRENCY, async (item) => {
      feedbackByIndex[item.index] = await generateDynamicFeedback(item.question, item.userAnswerIndex, item.question.correctAnswer);
      setFeedbackProgress(prev => ({ ...prev, done: prev.done + 1 }));
    });
    return feedbackByIndex;
  };

  // 動的フィードバック生成関数
  const generateDynamicFeedback = async (question, userAnswerIndex, correctAnswerIndex) => {
    try {
      const userAnswer = question.options[userAnswerIndex];
      const correctAnswer = question.options[correctAnswerIndex];
      
      const response = await fetch(`${API_BASE_URL}/api/test/learning/generate-feedback`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: question.question,
          userAnswer: userAnswer,
          correctAnswer: correctAnswer,
          allOptions: question.options
        })
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          return { text: result.feedback, isFallback: false };
        }
      }
    } catch (error) {
      console.error('フィードバック生成エラー:', error);
    }
    
    // フォールバック: 学習者向けの解説型フィードバック（API未使用時）
    const userAnswerText = question.options[userAnswerIndex];
    const correctAnswerText = question.options[correctAnswerIndex];
    const questionSummary = question.question.length > 60
      ? question.question.substring(0, 60) + "…"
      : question.question;

    // 「正解への道標」と、次に正答できるような具体的な復習のポイントを表示
    const q = question.question;
    let pathBlock;
    let reviewBlock;
    if (/順番|順序|手順|ステップ|流れ|ステップ\d/.test(q)) {
      pathBlock = `この問題では「正しい順序」や「最初のステップ」が問われています。あなたの選択「${userAnswerText}」は、プロセスの中では別の段階に当たるため、設問で求められている「最初にやるべきこと」とは異なります。正解「${correctAnswerText}」がなぜ最初のステップなのかを、手順の流れで押さえると正解に近づけます。`;
      reviewBlock = `「最初のステップ」「正しい順序」とあれば、正解は手順の最初に来る「${correctAnswerText}」。「${userAnswerText}」は別の段階なので誤りです。教材で手順の流れと各段階の役割を確認し、なぜ「${correctAnswerText}」が最初なのかを押さえておくと、同種問題で正解できます。`;
    } else if (/定義|意味|とは/.test(q)) {
      pathBlock = `この問題では用語の意味・定義が問われています。あなたの選択「${userAnswerText}」は、正解「${correctAnswerText}」とは別の概念や用法を指しているため、この設問の問いには当てはまりません。正解の用語がこの問題の文脈でどう定義されているかを押さえると正解への道標が見えます。`;
      reviewBlock = `この設問で問われている用語の定義に対応するのは「${correctAnswerText}」です。「${userAnswerText}」は別の概念なので誤り。同種問題では、問いの用語の「定義・意味」にぴったり当てはまる選択肢を選ぶと正解できます。教材で「${correctAnswerText}」と「${userAnswerText}」の違いを一文で言えるようにまとめておきましょう。`;
    } else if (/含まない|含まれない|適切でない/.test(q)) {
      pathBlock = `この問題は「当てはまらないもの」を選ぶ設問です。あなたの選択「${userAnswerText}」は条件に当てはまってしまうため誤りです。正解「${correctAnswerText}」がなぜ条件に当てはまらないかを、設問の条件と照らして押さえると正解への道標が分かります。`;
      reviewBlock = `「当てはまらない」「含まれない」とあれば、条件に当てはまるものを除いた残りが正解。あなたの選択「${userAnswerText}」は条件に当てはまるため誤りで、正解は「${correctAnswerText}」です。設問の条件を一文で言い換え、どれが当てはまらないかを判別できるようにしておくと次回正解できます。`;
    } else if (/暗号化|HTTPS|HTTP/.test(q) && /HTTPS/.test(correctAnswerText) && /HTTP/.test(userAnswerText)) {
      pathBlock = `この問題では「暗号化された通信」が問われています。あなたの選択「${userAnswerText}」は暗号化されていない通信のプロトコルであるため誤りです。正解「${correctAnswerText}」は通信を暗号化するプロトコルなので、設問の条件に当てはまります。`;
      reviewBlock = `設問に「暗号化された通信」とあれば正解は「${correctAnswerText}」です。HTTPは暗号化されていないため誤り。逆に、暗号化されていない通信を聞かれればHTTPが正解になります。この区別（暗号化＝HTTPS、非暗号化＝HTTP）を押さえれば同種問題で正解できます。`;
    } else if (/目的|正しいもの|どれですか/.test(q)) {
      pathBlock = `この問題では「${questionSummary}」が問われています。あなたの選択「${userAnswerText}」は、この問いが求めている内容（正解「${correctAnswerText}」が表すポイント）とは別の観点や役割にあたるため、設問の条件に合いません。問いのキーワードに対して、正解が「主な目的・正しい説明」としてどう当てはまるかを押さえると正解への道標が見えます。`;
      reviewBlock = `この設問で問われているキーワード（問いの中心）に対応する正しい説明は「${correctAnswerText}」です。「${userAnswerText}」は別の観点や副次的な効果なので誤り。次回同じような「目的は？」「正しいものは？」という問いでは、問いのキーワードに直接対応している選択肢「${correctAnswerText}」を選ぶと正解できます。`;
    } else {
      pathBlock = `この問題では「${questionSummary}」が問われています。あなたの選択「${userAnswerText}」は、この問いが求めている内容（正解「${correctAnswerText}」がカバーしているポイント）とは異なるため、設問の条件に合いません。正解がこの設問の問いに対してどう答えているかを押さえると正解への道標が分かります。`;
      reviewBlock = `この設問（「${questionSummary}」）で正解となるのは「${correctAnswerText}」です。「${userAnswerText}」は問いが求めている内容とずれているため誤り。次回同じような問い方では、問いの中心に直接答えている選択肢「${correctAnswerText}」を選ぶと正解できます。教材の該当テーマで、正解と誤答の違いを一文で言えるようにまとめておきましょう。`;
    }

    const text = `この問題では「${questionSummary}」について問われています。\n\n` +
      `正解は「${correctAnswerText}」です。\n\n` +
      `【正解への道標】\n` +
      pathBlock + "\n\n" +
      `【復習のポイント】\n` +
      reviewBlock + "\n\n" +
      `この機会に押さえ直して、次回に活かしましょう。`;
    return { text, isFallback: true };
  };

  useEffect(() => {
    const processTestResults = async () => {
      if (isPreview) {
        setLoading(false);
        setError('プレビューでは採点結果は表示できません（提出/採点/結果表示は無効です）。');
        return;
      }
      if (location.state) {
        // LessonListから渡されるテスト結果データの場合
        if (location.state.testResult) {
          const { testResult, lessonTitle, courseTitle } = location.state;
          console.log('TestResultPage: LessonListからのテスト結果データ:', testResult);
          
          // 実際のテスト結果詳細データを取得
          try {
            const response = await fetch(`${API_BASE_URL}/api/test/learning/test-results/${testResult.lessonId}`, {
              headers: {
                'Authorization': `Bearer ${localStorage.getItem('accessToken')}`
              }
            });
            
            if (response.ok) {
              const detailedResult = await response.json();
              console.log('TestResultPage: 詳細テスト結果データ:', detailedResult);
              
              if (detailedResult.success && detailedResult.data) {
                const detailData = detailedResult.data;
                
                // 詳細データから問題別結果を生成
                const questionsToUse = detailData.shuffledQuestions || detailData.testData?.questions || [];
                const answers = detailData.answers || {};
                
                const feedbackByIndex = await prefetchFeedbacks(questionsToUse, answers);
                const results = [];
                for (let index = 0; index < questionsToUse.length; index++) {
                  const question = questionsToUse[index];
                  const userAnswerIndex = answers[question.id];
                  const userAnswer = userAnswerIndex !== undefined ?
                    `${userAnswerIndex + 1}. ${question.options[userAnswerIndex]}` :
                    "未回答";
                  const correctAnswer = `${question.correctAnswer + 1}. ${question.options[question.correctAnswer]}`;
                  const isCorrect = userAnswerIndex === question.correctAnswer;

                  let feedback = "";
                  if (isCorrect) {
                    feedback = "正解です！よく理解できています。";
                  } else if (userAnswerIndex !== undefined) {
                    feedback = feedbackByIndex[index]?.text ?? '';
                  } else {
                    feedback = "未回答です。学習内容を確認して再受験してください。";
                  }

                  results.push({
                    questionId: index + 1,
                    question: question.question,
                    userAnswer,
                    correctAnswer,
                    feedback,
                    feedbackIsFallback: feedbackByIndex[index]?.isFallback === true,
                    isCorrect,
                    score: isCorrect ? 1 : 0
                  });
                }
                
                // スコアの整合性を確認
                const calculatedScore = results.filter(r => r.isCorrect).length;
                const finalScore = calculatedScore || testResult.score || 0;
                
                const result = {
                  testType: testResult.testType || 'lesson',
                  lessonId: testResult.lessonId || 0,
                  sectionIndex: testResult.sectionIndex || null,
                  lessonTitle: lessonTitle || 'レッスン名不明',
                  sectionTitle: testResult.sectionTitle || '',
                  score: finalScore,
                  correctAnswers: finalScore,
                  totalQuestions: testResult.totalQuestions || 0,
                  passed: testResult.passed || false,
                  percentage: testResult.totalQuestions > 0 ? Math.round((finalScore / testResult.totalQuestions) * 100) : 0,
                  grade: testResult.passed ? "合格" : "不合格",
                  gradeEmoji: testResult.passed ? "🎉" : "📘",
                  submittedAt: testResult.submittedAt || new Date().toISOString(),
                  testData: { questions: questionsToUse },
                  answers: answers,
                  results: results
                };
                
                setResultData(result);
                setLoading(false);
                return;
              }
            }
          } catch (error) {
            console.error('TestResultPage: 詳細テスト結果取得エラー:', error);
          }
          
          // フォールバック: 基本データのみで表示
          const result = {
            testType: testResult.testType || 'lesson',
            lessonId: testResult.lessonId || 0,
            sectionIndex: testResult.sectionIndex || null,
            lessonTitle: lessonTitle || 'レッスン名不明',
            sectionTitle: testResult.sectionTitle || '',
            score: testResult.score || 0,
            correctAnswers: testResult.score || 0,
            totalQuestions: testResult.totalQuestions || 0,
            passed: testResult.passed || false,
            percentage: testResult.totalQuestions > 0 ? Math.round((testResult.score / testResult.totalQuestions) * 100) : 0,
            grade: testResult.passed ? "合格" : "不合格",
            gradeEmoji: testResult.passed ? "🎉" : "📘",
            submittedAt: testResult.submittedAt || new Date().toISOString(),
            testData: { questions: [] },
            answers: {},
            results: []
          };
          
          setResultData(result);
          setLoading(false);
          return;
        }
        
        // 従来のテスト結果データの場合
        const { 
          testType, 
          lessonId, 
          sectionIndex, 
          lessonTitle, 
          sectionTitle, 
          answers, 
          testData, 
          shuffledQuestions,
          score, 
          totalQuestions,
          examResultId,
          s3Key
        } = location.state;
        
        console.log('TestResultPage: テスト完了直後のデータ:', {
          testType,
          lessonId,
          sectionIndex,
          lessonTitle,
          sectionTitle,
          hasAnswers: !!answers,
          answersCount: answers ? Object.keys(answers).length : 0,
          hasTestData: !!testData,
          testDataQuestionsCount: testData?.questions?.length || 0,
          hasShuffledQuestions: !!shuffledQuestions,
          shuffledQuestionsCount: shuffledQuestions?.length || 0,
          score,
          totalQuestions,
          examResultId,
          s3Key,
          locationState: location.state
        });
      
      // 正答数を計算（シャッフルされた問題データを使用して結果表示の整合性を保つ）
      const questionsToUse = shuffledQuestions && shuffledQuestions.length > 0 ? shuffledQuestions : testData.questions;
      const correctAnswers = score || 0;
      const total = totalQuestions || questionsToUse.length;
      const percentage = Math.round((correctAnswers / total) * 100);
      
      // 合格判定（レッスンテスト: 30問中29問以上、セクションテスト: 10問中9問以上）
      const passed = testType === 'lesson' 
        ? correctAnswers >= 29  // レッスンテスト: 30問中29問以上
        : correctAnswers >= (total - 1);  // セクションテスト: 全問正解または1問誤答まで
      
      // テスト結果データを生成
      const result = {
        testType,
        lessonId,
        sectionIndex,
        lessonTitle,
        sectionTitle,
        testData: {
          ...testData,
          questions: questionsToUse
        },
        answers,
        correctAnswers,
        totalQuestions: total,
        score: correctAnswers,
        percentage,
        passed,
        grade: passed ? "合格" : "不合格",
        gradeEmoji: passed ? "🎉" : "📘",
        examResultId,
        s3Key,
        results: []
      };

      // 不正解の解説を先に並列取得してから、問題の順番どおりに結果を組み立てる
      const feedbackByIndex = await prefetchFeedbacks(questionsToUse, answers);

      // 各問題の結果を生成（シャッフルされた問題データを使用）
      console.log('TestResultPage: 問題別結果生成開始', {
        questionsCount: questionsToUse.length,
        answersCount: Object.keys(answers).length,
        answers: answers
      });
      
      for (let index = 0; index < questionsToUse.length; index++) {
        const question = questionsToUse[index];
        const userAnswerIndex = answers[question.id];
        const userAnswer = userAnswerIndex !== undefined ? 
          `${userAnswerIndex + 1}. ${question.options[userAnswerIndex]}` : 
          "未回答";
        const correctAnswer = `${question.correctAnswer + 1}. ${question.options[question.correctAnswer]}`;
        const isCorrect = userAnswerIndex === question.correctAnswer;
        
        console.log(`TestResultPage: 問題${index + 1} (ID: ${question.id})`, {
          userAnswerIndex,
          correctAnswerIndex: question.correctAnswer,
          isCorrect,
          userAnswer,
          correctAnswer
        });
        
        let feedback = "";
        if (isCorrect) {
          feedback = "正解です！よく理解できています。";
        } else if (userAnswerIndex !== undefined) {
          // 不正解の場合は先に取得済みの解説を使う
          feedback = feedbackByIndex[index]?.text ?? '';
        } else {
          feedback = "未回答です。学習内容を確認して再受験してください。";
        }

        result.results.push({
          questionId: result.results.length + 1, // 順序番号を使用
          question: question.question,
          userAnswer,
          correctAnswer,
          feedback,
          feedbackIsFallback: feedbackByIndex[index]?.isFallback === true,
          isCorrect,
          score: isCorrect ? 1 : 0
        });
      }
      
      console.log('TestResultPage: 問題別結果生成完了', {
        totalResults: result.results.length,
        correctResults: result.results.filter(r => r.isCorrect).length,
        incorrectResults: result.results.filter(r => !r.isCorrect).length,
        results: result.results.map(r => ({ questionId: r.questionId, isCorrect: r.isCorrect }))
      });
      
      // スコアの整合性を確認
      const calculatedCorrectAnswers = result.results.filter(r => r.isCorrect).length;
      console.log('TestResultPage: スコア整合性チェック', {
        originalScore: result.score,
        calculatedScore: calculatedCorrectAnswers,
        totalQuestions: result.totalQuestions,
        isConsistent: result.score === calculatedCorrectAnswers
      });
      
      // スコアが不一致の場合は再計算
      if (result.score !== calculatedCorrectAnswers) {
        console.warn('TestResultPage: スコア不一致を検出、再計算します', {
          original: result.score,
          calculated: calculatedCorrectAnswers
        });
        result.score = calculatedCorrectAnswers;
        result.correctAnswers = calculatedCorrectAnswers;
        result.percentage = Math.round((calculatedCorrectAnswers / result.totalQuestions) * 100);
      }

        setResultData(result);
        setLoading(false);
      } else {
        // データがない場合はダッシュボードに戻る
        navigate('/student/dashboard');
      }
    };

    processTestResults();
  }, [location.state, navigate, isPreview]);

  // レッスンまとめテスト（30問）合格時のみ「次のレッスン」を取得
  useEffect(() => {
    if (!resultData || resultData.testType !== 'lesson' || !resultData.passed) {
      setNextLesson(null);
      return;
    }
    const lessonId = resultData.lessonId || resultData.lessonNumber;
    if (!lessonId) return;
    const abort = new AbortController();
    const fetchNext = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/learning/next-lesson/${lessonId}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
          signal: abort.signal
        });
        if (res.ok) {
          const json = await res.json();
          setNextLesson(json.success && json.data ? json.data : null);
        } else {
          setNextLesson(null);
        }
      } catch (e) {
        if (e.name !== 'AbortError') setNextLesson(null);
      }
    };
    fetchNext();
    return () => abort.abort();
  }, [resultData]);

  // セクションまとめテスト（10問）合格時のみ「次のセクション」を取得
  useEffect(() => {
    if (!resultData || resultData.testType !== 'section' || !resultData.passed) {
      setNextSection(null);
      return;
    }
    const lessonId = resultData.lessonId || resultData.lessonNumber;
    const sectionIndex = resultData.sectionIndex ?? 0;
    if (!lessonId) return;
    const abort = new AbortController();
    const fetchNext = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/learning/next-section/${lessonId}/${sectionIndex}`, {
          headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` },
          signal: abort.signal
        });
        if (res.ok) {
          const json = await res.json();
          setNextSection(json.success && json.data ? json.data : null);
        } else {
          setNextSection(null);
        }
      } catch (e) {
        if (e.name !== 'AbortError') setNextSection(null);
      }
    };
    fetchNext();
    return () => abort.abort();
  }, [resultData]);

  // テスト結果をDBに保存（必要に応じて）
  useEffect(() => {
    if (resultData) {
      const saveTestResult = async () => {
        try {
          const lessonId = resultData.lessonId || resultData.lessonNumber;
          
          // 既にexamResultIdが存在する場合は再提出をスキップ
          if (resultData.examResultId) {
            console.log('既にテスト結果が保存済みのため、再提出をスキップします:', resultData.examResultId);
            return;
          }
          
          // デバッグログ
          console.log('TestResultPage再提出データ:', {
            lessonId,
            sectionIndex: resultData.sectionIndex,
            hasAnswers: !!resultData.answers,
            hasTestData: !!resultData.testData,
            hasShuffledQuestions: !!resultData.shuffledQuestions,
            answersCount: Object.keys(resultData.answers || {}).length,
            testDataQuestions: resultData.testData?.questions?.length,
            shuffledQuestionsLength: resultData.shuffledQuestions?.length,
            examResultId: resultData.examResultId
          });
          
          // テスト結果を保存（既にテスト提出時に保存済みの場合は不要）
          const response = await fetch(`${API_BASE_URL}/api/learning/test/submit`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              lessonId: parseInt(lessonId),
              sectionIndex: resultData.sectionIndex || 0,
              testType: 'section',
              answers: resultData.answers,
              testData: resultData.testData,
              shuffledQuestions: resultData.shuffledQuestions,
              score: resultData.score,
              totalQuestions: resultData.totalQuestions
            })
          });

          if (response.ok) {
            console.log('テスト結果が保存されました');
          }
        } catch (error) {
          console.error('テスト結果保存エラー:', error);
          // エラーが発生しても結果表示は継続
        }
      };

      saveTestResult();
    }
  }, [resultData]);

  const handleRetakeTest = () => {
    if (resultData.testType === 'section') {
      // セクションテストのキャッシュをクリア
      const sectionCacheKey = `test_data_${resultData.lessonId}_${resultData.sectionIndex}`;
      sessionStorage.removeItem(sectionCacheKey);
      console.log('再試験: セクションテストのキャッシュをクリア:', sectionCacheKey);
      navigate(`/student/section-test?lesson=${resultData.lessonId}&section=${resultData.sectionIndex}`);
    } else {
      // レッスンテストのキャッシュをクリア
      const lessonCacheKey = `test_data_lesson_${resultData.lessonId}`;
      sessionStorage.removeItem(lessonCacheKey);
      console.log('再試験: レッスンテストのキャッシュをクリア:', lessonCacheKey);
      navigate(`/student/lesson-test?lesson=${resultData.lessonId}`);
    }
  };

  const handleGoToCertificate = () => {
    if (resultData.passed) {
      // 現在のユーザーIDを取得
      const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{}');
      const userId = currentUser.user_id || currentUser.id;
      
      if (!userId) {
        alert('ユーザー情報が取得できません。再度ログインしてください。');
        return;
      }

      navigate('/student/certificate', {
        state: {
          userId: userId,
          lessonId: resultData.lessonId,
          lessonTitle: resultData.lessonTitle,
          sectionTitle: resultData.sectionTitle,
          testType: resultData.testType,
          score: resultData.score,
          totalQuestions: resultData.totalQuestions,
          examResultId: resultData.examResultId // 試験結果IDも渡す
        }
      });
    } else {
      alert('合格していないため、修了証は発行できません。再受験してください。');
    }
  };

  const handleBackToDashboard = () => {
    navigate('/student/dashboard');
  };

  const handleBackToLearning = async () => {
    const lessonId = resultData?.lessonId ?? resultData?.lessonNumber;
    if (!lessonId) {
      navigate('/student/dashboard');
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/api/learning/lesson/${lessonId}/course`, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('accessToken')}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success || data.courseId == null) {
        alert('学習画面への遷移情報を取得できませんでした。ダッシュボードに戻ります。');
        navigate('/student/dashboard');
        return;
      }
      const params = new URLSearchParams({ course: String(data.courseId), lesson: String(lessonId) });
      if (resultData.testType === 'section' && resultData.sectionIndex != null) {
        params.set('section', String(resultData.sectionIndex));
      }
      navigate(`/student/enhanced-learning?${params.toString()}`);
    } catch (err) {
      console.error('学習画面への遷移エラー:', err);
      alert('学習画面への遷移に失敗しました。ダッシュボードに戻ります。');
      navigate('/student/dashboard');
    }
  };

  const handleGoToNextLesson = () => {
    if (!nextLesson || nextLesson.courseId == null || nextLesson.id == null) return;
    const hasAssignment = nextLesson.hasAssignment === true;
    const assignmentSubmitted = nextLesson.assignmentSubmitted === true;
    if (hasAssignment && !assignmentSubmitted) {
      alert('提出物が未提出です');
      const currentLessonId = resultData?.lessonId ?? resultData?.lessonNumber;
      if (currentLessonId != null) {
        navigate(`/student/enhanced-learning?course=${nextLesson.courseId}&lesson=${currentLessonId}`);
      }
      return;
    }
    navigate(`/student/enhanced-learning?course=${nextLesson.courseId}&lesson=${nextLesson.id}`);
  };

  const handleGoToNextSection = () => {
    if (!nextSection || nextSection.courseId == null) return;
    const lessonId = resultData?.lessonId ?? resultData?.lessonNumber;
    const nextIdx = nextSection.nextSectionIndex;
    if (lessonId == null || nextIdx == null) return;
    navigate(`/student/enhanced-learning?course=${nextSection.courseId}&lesson=${lessonId}&section=${nextIdx}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">
            {feedbackProgress.total > 0
              ? `解説を作成中 ${feedbackProgress.done}/${feedbackProgress.total}`
              : 'テスト結果を処理中...'}
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">エラーが発生しました</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700"
          >
            ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  if (!resultData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">テスト結果が見つかりません</p>
          <button
            onClick={() => navigate('/student/dashboard')}
            className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 mt-4"
          >
            ダッシュボードに戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50">
      {/* ヘッダー */}
      <div className="bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                className="px-4 py-2 bg-white bg-opacity-10 border border-white border-opacity-30 rounded-lg hover:bg-opacity-20 transition-all duration-200 font-medium"
                onClick={handleBackToDashboard}
              >
                ← ダッシュボードに戻る
              </button>
              <div>
                <h1 className="text-2xl font-bold">テスト結果</h1>
                <span className="text-blue-100 text-sm">
                  {resultData.lessonTitle}
                  {resultData.sectionTitle && ` - ${resultData.sectionTitle}`}
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-3xl">{resultData.gradeEmoji}</span>
                <span className="text-lg font-semibold">{resultData.grade}</span>
              </div>
              <div className="text-sm">
                正答数：{resultData.correctAnswers} / {resultData.totalQuestions}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 結果詳細 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-8 mb-8">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-gray-800 mb-6">
              出題範囲：{resultData.lessonTitle}
              {resultData.sectionTitle && ` - ${resultData.sectionTitle}`}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="bg-blue-50 rounded-xl p-6">
                <div className="text-3xl font-bold text-blue-600 mb-2">{resultData.correctAnswers}</div>
                <div className="text-blue-800 font-medium">正答数</div>
              </div>
              <div className="bg-gray-50 rounded-xl p-6">
                <div className="text-3xl font-bold text-gray-600 mb-2">{resultData.totalQuestions}</div>
                <div className="text-gray-800 font-medium">総問題数</div>
              </div>
              <div className="bg-cyan-50 rounded-xl p-6">
                <div className="text-3xl font-bold text-cyan-600 mb-2">
                  {Math.round((resultData.correctAnswers / resultData.totalQuestions) * 100)}%
                </div>
                <div className="text-cyan-800 font-medium">正答率</div>
              </div>
            </div>
          </div>


          {/* 問題別結果 */}
          <div>
            <h3 className="text-xl font-bold text-gray-800 mb-6">問題別結果</h3>
            <div className="flex flex-wrap gap-2 mb-8">
              {resultData.results.map((result, index) => {
                console.log(`TestResultPage: 問題${index + 1}の色分け`, {
                  questionId: result.questionId,
                  isCorrect: result.isCorrect,
                  currentQuestion: currentQuestion,
                  index: index
                });
                
                return (
                  <button
                    key={result.questionId}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-200 ${
                      currentQuestion === index
                        ? 'bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg'
                        : result.isCorrect
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                    }`}
                    onClick={() => setCurrentQuestion(index)}
                  >
                    Q{index + 1}
                  </button>
                );
              })}
            </div>

            <div className="border border-gray-200 rounded-xl p-6">
              {resultData.results[currentQuestion] && (
                <div>
                  <div className="flex items-start gap-4 mb-6">
                    <span className="flex-shrink-0 w-8 h-8 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-full flex items-center justify-center font-bold text-sm">
                      {currentQuestion + 1}
                    </span>
                    <span className="text-lg font-medium text-gray-800 leading-relaxed">
                      {resultData.results[currentQuestion].question}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <h4 className="font-semibold text-red-800 mb-3">あなたの解答</h4>
                      <div className="text-red-700 bg-white rounded-lg p-3 min-h-[100px]">
                        {resultData.results[currentQuestion].userAnswer || "回答がありません"}
                      </div>
                    </div>
                    
                    <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                      <h4 className="font-semibold text-green-800 mb-3">模範解答</h4>
                      <div className="text-green-700 bg-white rounded-lg p-3 min-h-[100px]">
                        {resultData.results[currentQuestion].correctAnswer}
                      </div>
                    </div>
                  </div>

                  <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <span className="text-yellow-600">💡</span>
                      <h4 className="font-semibold text-yellow-800">フィードバック</h4>
                    </div>
                    <p className="text-yellow-700 whitespace-pre-line">{resultData.results[currentQuestion].feedback}</p>
                    {resultData.results[currentQuestion].feedbackIsFallback && (
                      <p className="mt-2 text-xs text-gray-500">※ AI解説を取得できなかったため、定型の解説を表示しています。</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* アクションボタン */}
        <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap">
          {!resultData.passed && (
            <button
              className="px-8 py-4 bg-gradient-to-r from-orange-500 to-orange-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
              onClick={handleRetakeTest}
            >
              🔄 再受験する
            </button>
          )}
          {resultData.passed && resultData.testType === 'section' && nextSection && (
            <button
              className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
              onClick={handleGoToNextSection}
            >
              次のセクションへ →
            </button>
          )}
          {resultData.passed && resultData.testType === 'lesson' && (
            <>
              {nextLesson && (
                <button
                  className="px-8 py-4 bg-gradient-to-r from-indigo-500 to-indigo-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                  onClick={handleGoToNextLesson}
                >
                  次のレッスンへ →
                </button>
              )}
              <button
                className="px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
                onClick={handleGoToCertificate}
              >
                🏆 修了証を確認
              </button>
            </>
          )}
          {resultData.lessonId != null && (
            <button
              className="px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
              onClick={handleBackToLearning}
            >
              📖 学習画面に戻る
            </button>
          )}
          <button
            className="px-8 py-4 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl font-semibold hover:shadow-lg transform hover:-translate-y-0.5 transition-all duration-200"
            onClick={handleBackToDashboard}
          >
            📊 ダッシュボードに戻る
          </button>
        </div>
      </div>
    </div>
  );
};

export default TestResultPage; 