import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import SanitizedInput from '../components/SanitizedInput';
import SanitizedTextarea from '../components/SanitizedTextarea';
import { SANITIZE_OPTIONS } from '../utils/sanitizeUtils';

const DailyRecordsPage = () => {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const [student, setStudent] = useState(null);
  const [records, setRecords] = useState([]);
  const [showRecordForm, setShowRecordForm] = useState(false);
  const [recordForm, setRecordForm] = useState({
    date: '',
    startTime: '',
    endTime: '',
    supportMethod: '',
    workContent: '',
    supportContent: '',
    healthStatus: ''
  });

  // 利用者データを取得
  useEffect(() => {
    const fetchStudent = () => {
      const mockStudents = [
        { 
          id: 'student001', 
          name: '末吉　元気', 
          email: 'sueyoshi@example.com', 
          class: 'ITリテラシー・AIの基本',
          instructorId: 'instructor001',
          instructorName: '佐藤指導員',
          locationId: 'location001',
          locationName: '東京本校',
          progress: 75,
          lastLogin: '2024-01-15',
          status: 'active',
          loginToken: 'f9Ul-7OlL-OPZE',
          joinDate: '2024-01-01',
          canStudyAtHome: true
        }
      ];

      const foundStudent = mockStudents.find(s => s.id === studentId);
      if (foundStudent) {
        setStudent(foundStudent);
      } else {
        alert('利用者が見つかりません。');
        navigate('/instructor/dashboard');
      }
    };

    fetchStudent();
  }, [studentId, navigate]);

  // 日々の記録データを取得
  useEffect(() => {
    const mockRecords = [
      {
        id: 'record001',
        date: '2024-01-15',
        startTime: '10:00',
        endTime: '16:00',
        supportMethod: '訪問',
        workContent: '・ビーズ等を使ったアクセサリー作り（前回終えられなかった分も含む）\n・上記終了後、細かい作業の訓練のためのプログラム（簡単な手芸作品の作成）を実施',
        supportContent: '・9:00　利用者から作業開始の電話あり。前回作成予定の個数が終わらなかったのは、集中力が続かなかったことが原因のようであり、30分ごとに少し休憩をはさむなどしてリフレッシュの時間を設けることを提案。今日は、前回の残り分を含め、30個の作成を目標とする。（母親へも報告）\n・12:00　利用者へ電話。午前中の作業進捗を確認。目標の半分（15個）を作成済み。13:00まで昼休みを取り、13:00から再開することを確認。',
        healthStatus: '・9:00　体温36.2℃、睡眠時間6時間と確認。体調も良好な様子。いつもどおりストレッチを行うことを助言。\n・16:00　いつも以上に作業を頑張ったせいか、軽い頭痛を感じるとのこと。ペースを考え、適宜休憩をとりながら、メリハリをつけて作業することを助言。',
        recorder: '山田 指導員'
      },
      {
        id: 'record002',
        date: '2024-01-14',
        startTime: '09:30',
        endTime: '15:30',
        supportMethod: '電話',
        workContent: '・ITリテラシー・AIの基本コースの学習\n・Windows 11の基本操作の復習',
        supportContent: '・9:30　利用者から学習開始の連絡。今日はWindows 11の基本操作を復習したいとのこと。\n・12:00　午前中の学習進捗を確認。基本操作は順調に進んでいる。\n・15:00　学習終了の確認。明日は新しい内容に進むことを提案。',
        healthStatus: '・体調は良好。集中力も保たれている。適度な休憩を取るよう助言。',
        recorder: '山田 指導員'
      }
    ];

    setRecords(mockRecords);
  }, []);

  // 新しい記録を追加
  const addRecord = (e) => {
    e.preventDefault();
    
    const newRecord = {
      id: `record${Date.now()}`,
      ...recordForm,
      recorder: '山田 指導員' // 実際は現在ログイン中の指導員名
    };

    setRecords([newRecord, ...records]);
    setRecordForm({
      date: '',
      startTime: '',
      endTime: '',
      supportMethod: '',
      workContent: '',
      supportContent: '',
      healthStatus: ''
    });
    setShowRecordForm(false);
  };

  if (!student) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 flex items-center justify-center">
        <div className="text-indigo-600 text-xl font-semibold">読み込み中...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-purple-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* ヘッダー */}
        <div className="bg-white rounded-2xl shadow-xl p-6 mb-6 border border-gray-100">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div className="flex items-center gap-4">
              <button 
                className="px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white rounded-lg font-medium transition-all duration-200"
                onClick={() => navigate('/instructor/dashboard')}
              >
                ← 戻る
              </button>
              <div>
                <h1 className="text-3xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  📝 日々の就労支援記録
                </h1>
                <div className="mt-2">
                  <h2 className="text-xl font-semibold text-gray-800">{student.name}</h2>
                  <p className="text-gray-600">{student.class} | {student.instructorName} | {student.locationName}</p>
                </div>
              </div>
            </div>
            <button 
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
              onClick={() => setShowRecordForm(true)}
            >
              ＋ 新規記録
            </button>
          </div>
        </div>

        {/* 記録一覧 */}
        <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100">
          {records.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <p className="text-gray-600 mb-4">まだ記録がありません。</p>
              <button 
                className="px-6 py-3 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-lg font-medium transition-all duration-200"
                onClick={() => setShowRecordForm(true)}
              >
                最初の記録を作成
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {records.map(record => (
                <div key={record.id} className="border border-gray-200 rounded-xl p-6 hover:shadow-lg transition-all duration-200">
                  <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-4">
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold text-indigo-600">{record.date}</div>
                        <div className="text-sm text-gray-600">{record.startTime} ～ {record.endTime}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
                        {record.supportMethod}
                      </span>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">作業・訓練内容</h4>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-gray-700 whitespace-pre-line">{record.workContent}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">支援内容（1日2回以上）</h4>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-gray-700 whitespace-pre-line">{record.supportContent}</p>
                      </div>
                    </div>
                    
                    <div>
                      <h4 className="font-semibold text-gray-800 mb-2">対象者の心身の状況及びそれに対する助言の内容</h4>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-gray-700 whitespace-pre-line">{record.healthStatus}</p>
                      </div>
                    </div>
                    
                    <div className="border-t border-gray-200 pt-4">
                      <span className="text-sm text-gray-600">対応・記録者: <span className="font-medium text-gray-800">{record.recorder}</span></span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 記録作成フォーム */}
      {showRecordForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold text-gray-800">日々の就労支援記録作成</h3>
                <button 
                  className="text-gray-400 hover:text-gray-600 text-2xl font-bold w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100 transition-all duration-200"
                  onClick={() => setShowRecordForm(false)}
                >
                  ×
                </button>
              </div>
            </div>
            
            <form onSubmit={addRecord} className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">実施日</label>
                  <SanitizedInput 
                    type="date" 
                    value={recordForm.date}
                    onChange={(e) => setRecordForm({...recordForm, date: e.target.value})}
                    required 
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">開始時間</label>
                  <SanitizedInput 
                    type="time" 
                    value={recordForm.startTime}
                    onChange={(e) => setRecordForm({...recordForm, startTime: e.target.value})}
                    required 
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">終了時間</label>
                  <SanitizedInput 
                    type="time" 
                    value={recordForm.endTime}
                    onChange={(e) => setRecordForm({...recordForm, endTime: e.target.value})}
                    required 
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">支援方法</label>
                <select 
                  value={recordForm.supportMethod}
                  onChange={(e) => setRecordForm({...recordForm, supportMethod: e.target.value})}
                  required
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                >
                  <option value="">選択してください</option>
                  <option value="訪問">訪問</option>
                  <option value="電話">電話</option>
                  <option value="その他">その他</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">作業・訓練内容</label>
                <SanitizedTextarea
                  value={recordForm.workContent}
                  onChange={(e) => setRecordForm({...recordForm, workContent: e.target.value})}
                  placeholder="実施した作業や訓練の内容を記載してください"
                  required
                  rows="4"
                  sanitizeMode={SANITIZE_OPTIONS.FULL}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">支援内容（1日2回以上）</label>
                <SanitizedTextarea
                  value={recordForm.supportContent}
                  onChange={(e) => setRecordForm({...recordForm, supportContent: e.target.value})}
                  placeholder="具体的な支援内容を時間順に記載してください"
                  required
                  rows="6"
                  sanitizeMode={SANITIZE_OPTIONS.FULL}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">対象者の心身の状況及びそれに対する助言の内容</label>
                <SanitizedTextarea
                  value={recordForm.healthStatus}
                  onChange={(e) => setRecordForm({...recordForm, healthStatus: e.target.value})}
                  placeholder="体調や精神状態、それに対する助言を記載してください"
                  required
                  rows="4"
                  sanitizeMode={SANITIZE_OPTIONS.FULL}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>

              <div className="flex gap-4 pt-6 border-t border-gray-200">
                <button 
                  type="button" 
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-all duration-200"
                  onClick={() => setShowRecordForm(false)}
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="flex-1 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
                >
                  記録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DailyRecordsPage; 