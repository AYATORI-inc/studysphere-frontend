import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { useAuth } from './contexts/AuthContext';

const StudentVoiceCareView = ({
  studentId,
  studentName,
  refreshSignal = 0,
  heading = '💬 指導員からの声かけ',
  description = '指導員からのメッセージを確認できます',
}) => {
  const { currentUser } = useAuth();
  const [voiceMessages, setVoiceMessages] = useState([]);
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [replyMessage, setReplyMessage] = useState('');
  const [newPrivateMessage, setNewPrivateMessage] = useState('');
  const [showNewMessageModal, setShowNewMessageModal] = useState(false);
  const [showInstructorSelection, setShowInstructorSelection] = useState(false);
  const [instructors, setInstructors] = useState([]);
  const [selectedInstructor, setSelectedInstructor] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingInstructors, setLoadingInstructors] = useState(false);

  useEffect(() => {
    // アナウンスメッセージと1対1メッセージを統合して取得
    loadVoiceMessages();
  }, [studentId, refreshSignal]);

  const loadVoiceMessages = async () => {
    try {
      setLoading(true);
      
      // アナウンスメッセージと個人メッセージを並行して取得
      const [announcementsResponse, conversationsResponse] = await Promise.all([
        apiGet('/api/announcements/user?page=1&limit=10'),
        apiGet('/api/messages/conversations')
      ]);

      const allMessages = [];

      // 個人メッセージを処理（送信先別にまとめる）
      if (conversationsResponse.success && conversationsResponse.data) {
        for (const conversation of conversationsResponse.data) {
          try {
            const messagesResponse = await apiGet(`/api/messages/conversation/${conversation.other_user_id}`);
            if (messagesResponse.success && messagesResponse.data && messagesResponse.data.length > 0) {
              // 会話の全メッセージを取得
              const messages = messagesResponse.data;
              const latestMessage = messages[messages.length - 1];
              
              // 送信者と受信者を区別
              const isFromStudent = latestMessage.sender_id === currentUser.id;
              
              // 相手からの返信数を計算
              const replyCount = messages.filter(msg => msg.sender_id !== currentUser.id).length;
              
              // 最新メッセージの送信者名を取得
              const senderName = isFromStudent ? currentUser.name : conversation.other_user_name;
              
              allMessages.push({
                id: `conversation_${conversation.other_user_id}`,
                type: 'conversation',
                title: `${conversation.other_user_name}指導員との会話`,
                message: latestMessage.message,
                sentDate: new Date(latestMessage.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
                instructorName: conversation.other_user_name, // 指導員名（送信先）
                senderName: senderName, // 実際の送信者名
                hasReplied: latestMessage.is_read,
                myReply: '',
                replyDate: latestMessage.read_at ? new Date(latestMessage.read_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '',
                canReply: true,
                fromStudent: isFromStudent,
                conversationId: conversation.other_user_id,
                messageCount: messages.length,
                replyCount: replyCount, // 相手からの返信数
                allMessages: messages // 会話の全メッセージを保存
              });
            }
          } catch (error) {
            console.error('個人メッセージ取得エラー:', error);
          }
        }
      }

      // アナウンスメッセージを処理
      if (announcementsResponse.success && announcementsResponse.data.announcements) {
        const announcements = announcementsResponse.data.announcements.map(announcement => ({
            id: `announce_${announcement.id}`,
            type: 'announcement',
            title: announcement.title,
            message: announcement.message,
            sentDate: new Date(announcement.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }),
            instructorName: announcement.created_by_name || '指導員',
            hasReplied: announcement.is_read,
            myReply: '',
            replyDate: announcement.read_at ? new Date(announcement.read_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '',
            canReply: true
          }));
        allMessages.push(...announcements);
      }

      // アナウンスメッセージを常に上位に表示するソート
      allMessages.sort((a, b) => {
        // アナウンスメッセージを優先
        if (a.type === 'announcement' && b.type !== 'announcement') {
          return -1; // aを上位に
        }
        if (a.type !== 'announcement' && b.type === 'announcement') {
          return 1; // bを上位に
        }
        // 同じタイプの場合は送信日時順（新しい順）
        return new Date(b.sentDate) - new Date(a.sentDate);
      });
      setVoiceMessages(allMessages);

    } catch (error) {
      console.error('メッセージ取得エラー:', error);
      setVoiceMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const openMessageModal = (message) => {
    setSelectedMessage(message);
    setShowMessageModal(true);
  };

  const sendReply = async () => {
    if (replyMessage.trim() && selectedMessage) {
      try {
        if (selectedMessage.type === 'announcement') {
          // アナウンスの既読処理
          await apiPut(`/api/announcements/user/${selectedMessage.id.replace('announce_', '')}/read`);
        } else if (selectedMessage.type === 'conversation') {
          // 会話への返信
          await apiPost('/api/messages/send', {
            receiver_id: selectedMessage.conversationId,
            message: replyMessage.trim()
          });
        }
        
        // メッセージ一覧を再読み込み
        await loadVoiceMessages();
        setReplyMessage('');
        setShowMessageModal(false);
      } catch (error) {
        console.error('返信処理エラー:', error);
        alert('返信の送信に失敗しました。');
      }
    }
  };

  const loadInstructors = async () => {
    try {
      setLoadingInstructors(true);
      const response = await apiGet('/api/messages/instructors');
      if (response.success) {
        setInstructors(response.data.instructors);
        setSelectedInstructor(null);
      } else {
        alert('指導員リストの取得に失敗しました。');
      }
    } catch (error) {
      console.error('指導員リスト取得エラー:', error);
      alert('指導員リストの取得に失敗しました。');
    } finally {
      setLoadingInstructors(false);
    }
  };

  const handleInstructorConsultation = () => {
    setShowInstructorSelection(true);
    loadInstructors();
  };

  const sendNewPrivateMessage = async () => {
    if (newPrivateMessage.trim() && selectedInstructor) {
      try {
        await apiPost('/api/messages/send', {
          receiver_id: selectedInstructor.id,
          message: newPrivateMessage.trim()
        });
        
        // メッセージ一覧を再読み込み
        await loadVoiceMessages();
        setNewPrivateMessage('');
        setShowNewMessageModal(false);
        setShowInstructorSelection(false);
        setSelectedInstructor(null);
      } catch (error) {
        console.error('メッセージ送信エラー:', error);
        alert('メッセージの送信に失敗しました。');
      }
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-xl p-6 border border-gray-100 mb-6">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h3 className="text-2xl font-bold text-gray-800 mb-2">
            {heading}
          </h3>
          <p className="text-gray-600">{description}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={handleInstructorConsultation}
            className="px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-600 text-white rounded-xl font-semibold shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200"
          >
            ✉️ 指導員に相談
          </button>
        </div>
      </div>

      {/* メッセージ一覧 */}
      <div className="space-y-4 max-h-96 overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            <p>メッセージを読み込み中...</p>
          </div>
        ) : voiceMessages.length > 0 ? (
          voiceMessages.map(message => (
            <div key={message.id} className={`rounded-xl p-4 border transition-all duration-200 hover:shadow-md ${
              message.type === 'announcement' 
                ? 'bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200' 
                : message.type === 'conversation'
                ? 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
                : message.fromStudent
                ? 'bg-gradient-to-br from-green-50 to-green-100 border-green-200'
                : 'bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200'
            }`}>
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      message.type === 'announcement'
                        ? 'bg-blue-200 text-blue-800'
                        : message.type === 'conversation'
                        ? 'bg-purple-200 text-purple-800'
                        : message.fromStudent
                        ? 'bg-green-200 text-green-800'
                        : 'bg-purple-200 text-purple-800'
                    }`}>
                      {message.type === 'announcement' ? '📢 アナウンス' : 
                       message.type === 'conversation' ? '💬 個人メッセージ' :
                       message.fromStudent ? '📤 送信済み' : '💬 個人メッセージ'}
                    </span>
                    {message.type === 'conversation' && message.messageCount > 0 && (
                      <span className="text-xs px-2 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">
                        {message.messageCount}通
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full bg-green-200 text-green-800 font-medium ${
                      message.hasReplied && message.type !== 'conversation' ? '' : 'hidden'
                    }`}>
                      ✅ 返信済み
                    </span>
                  </div>
                  <h4 className="font-semibold text-gray-800 mb-1">{message.title}</h4>
                  <p className="text-gray-700 text-sm mb-2 line-clamp-2">{message.message}</p>
                </div>
              </div>
              
              <div className="flex justify-between items-center">
                <div className="text-sm text-gray-600">
                  <div>{message.type === 'conversation' ? (message.senderName === currentUser.name ? 'あなた' : message.senderName) : message.instructorName}</div>
                  <div>{message.sentDate}</div>
                </div>
                <button
                  onClick={() => openMessageModal(message)}
                  className={`px-4 py-2 rounded-lg font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all duration-200 ${
                    message.type === 'announcement'
                      ? 'bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white'
                      : message.type === 'conversation'
                      ? 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                      : message.fromStudent
                      ? 'bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white'
                      : 'bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700 text-white'
                  }`}
                >
                  詳細を見る
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="text-center py-8 text-gray-500">
            <p>メッセージはありません</p>
          </div>
        )}
      </div>
      <p className="mt-4 text-sm text-gray-500">
        わからないことは、AI、担当指導員、外部専門指導員の順で相談できます。
      </p>

      {/* メッセージ詳細モーダル */}
      {showMessageModal && selectedMessage && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-800">{selectedMessage.title}</h3>
              <button
                onClick={() => setShowMessageModal(false)}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {/* 会話タイプの場合は会話全体を表示 */}
            {selectedMessage.type === 'conversation' && selectedMessage.allMessages ? (
              <div className="space-y-4 mb-4 max-h-80 overflow-y-auto pr-2">
                <div className="text-sm text-gray-600 mb-3">
                  {selectedMessage.messageCount}通のメッセージ
                </div>
                {selectedMessage.allMessages.map((msg, index) => (
                  <div key={msg.id} className={`p-3 rounded-lg ${
                    msg.sender_id === currentUser.id 
                      ? 'bg-blue-50 border-l-4 border-blue-500 ml-8' 
                      : 'bg-gray-50 border-l-4 border-gray-400 mr-8'
                  }`}>
                    <div className="flex justify-between items-start mb-1">
                      <span className={`text-xs font-medium ${
                        msg.sender_id === currentUser.id ? 'text-blue-700' : 'text-gray-700'
                      }`}>
                        {msg.sender_id === currentUser.id ? 'あなた' : selectedMessage.instructorName}
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(msg.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                      </span>
                    </div>
                    <p className="text-gray-800 text-sm">{msg.message}</p>
                  </div>
                ))}
              </div>
            ) : (
              /* 通常のメッセージ表示 */
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <p className="text-gray-800 mb-2">{selectedMessage.message}</p>
                <div className="text-sm text-gray-600">
                  <div>送信者: {selectedMessage.instructorName}</div>
                  <div>送信日時: {selectedMessage.sentDate}</div>
                </div>
              </div>
            )}

            {/* 自分の返信表示 */}
            <div className={`mb-4 p-4 bg-blue-50 rounded-lg border-l-4 border-blue-500 ${
              selectedMessage.hasReplied && selectedMessage.type !== 'conversation' ? '' : 'hidden'
            }`}>
              <div className="flex justify-between items-start mb-1">
                <span className="font-medium text-blue-700">あなたの返信</span>
                <span className="text-xs text-gray-500">{selectedMessage.replyDate}</span>
              </div>
              <p className="text-gray-800 text-sm">{selectedMessage.myReply}</p>
            </div>

            {/* 返信エリア */}
            {selectedMessage.type === 'conversation' && (
              <div className="border-t pt-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">返信する:</label>
                <div className="flex gap-3">
                  <textarea
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    placeholder="返信を入力..."
                    className="flex-1 p-3 border border-gray-300 rounded-lg resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <button 
                    onClick={sendReply}
                    disabled={!replyMessage.trim()}
                    className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition-colors self-end"
                  >
                    返信
                  </button>
                </div>
              </div>
            )}

            <div className={`border-t pt-4 ${
              !selectedMessage.hasReplied && !selectedMessage.fromStudent && selectedMessage.type !== 'conversation' ? '' : 'hidden'
            }`}>
              <label className="block text-sm font-medium text-gray-700 mb-2">返信する:</label>
              <div className="flex gap-3">
                <textarea
                  value={replyMessage}
                  onChange={(e) => setReplyMessage(e.target.value)}
                  placeholder="返信を入力..."
                  className="flex-1 p-3 border border-gray-300 rounded-lg resize-none h-20 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button 
                  onClick={sendReply}
                  disabled={!replyMessage.trim()}
                  className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg transition-colors self-end"
                >
                  返信
                </button>
              </div>
            </div>

            <div className={`border-t pt-4 text-center text-gray-500 text-sm ${
              selectedMessage.fromStudent && selectedMessage.type !== 'conversation' ? '' : 'hidden'
            }`}>
              送信したメッセージです。指導員からの返信をお待ちしています。
            </div>
          </div>
        </div>
      )}

      {/* 指導員選択モーダル */}
      {showInstructorSelection && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-800">指導員を選択してください</h3>
              <button
                onClick={() => {
                  setShowInstructorSelection(false);
                  setSelectedInstructor(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {loadingInstructors ? (
              <div className="text-center py-8 text-gray-500">
                <p>指導員リストを読み込み中...</p>
              </div>
            ) : (
              <div className="space-y-3 mb-6">
                {instructors.map(instructor => (
                    <div
                      key={instructor.id}
                      onClick={() => setSelectedInstructor(instructor)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all duration-200 ${
                        selectedInstructor?.id === instructor.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`w-3 h-3 rounded-full ${
                            selectedInstructor?.id === instructor.id ? 'bg-blue-500' : 'bg-gray-300'
                          }`}></div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-gray-800">{instructor.name}</span>
                              {instructor.is_assigned === 1 ? (
                                <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full font-medium">
                                  🎯 担当指導員
                                </span>
                              ) : (
                                <span style={{ display: 'none' }}></span>
                              )}
                            </div>
                            <div className="text-sm text-gray-600">
                              {instructor.satellite_name && `${instructor.satellite_name} `}
                              {instructor.company_name && `${instructor.company_name}`}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                ))}
              </div>
            )}
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowInstructorSelection(false);
                  setSelectedInstructor(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (selectedInstructor) {
                    setShowInstructorSelection(false);
                    setShowNewMessageModal(true);
                  }
                }}
                disabled={!selectedInstructor}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg transition-colors"
              >
                選択して相談
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 新規メッセージモーダル */}
      {showNewMessageModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-gray-800">
                {selectedInstructor ? `${selectedInstructor.name} 指導員に相談` : '指導員に相談'}
              </h3>
              <button
                onClick={() => {
                  setShowNewMessageModal(false);
                  setSelectedInstructor(null);
                }}
                className="text-gray-500 hover:text-gray-700 text-2xl"
              >
                ×
              </button>
            </div>
            
            {selectedInstructor && (
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-800">
                  <strong>送信先:</strong> {selectedInstructor.name} 指導員
                  {selectedInstructor.is_assigned && (
                    <span className="ml-2 px-2 py-1 text-xs bg-green-100 text-green-800 rounded-full">
                      🎯 担当指導員
                    </span>
                  )}
                </div>
              </div>
            )}
            
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">相談内容:</label>
              <textarea
                value={newPrivateMessage}
                onChange={(e) => setNewPrivateMessage(e.target.value)}
                placeholder="相談したいことを入力してください..."
                className="w-full p-3 border border-gray-300 rounded-lg resize-none h-32 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => {
                  setShowNewMessageModal(false);
                  setSelectedInstructor(null);
                }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
              >
                キャンセル
              </button>
              <button
                onClick={sendNewPrivateMessage}
                disabled={!newPrivateMessage.trim() || !selectedInstructor}
                className="bg-blue-500 hover:bg-blue-600 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg transition-colors"
              >
                送信
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentVoiceCareView; 