import React, { useState, useEffect } from 'react';
import { apiGet, apiPost, apiPut } from '../utils/api';
import { formatDatabaseTime } from '../utils/dateUtils';
import { useAuth } from './contexts/AuthContext';
import { sanitizeInput } from '../utils/sanitizeUtils';
import { getCurrentUser } from '../utils/userContext';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';

const PersonalMessageList = ({ refreshSignal }) => {
    const { currentUser: user } = useAuth();
    const [conversations, setConversations] = useState([]);
    const [selectedConversation, setSelectedConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [newMessage, setNewMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    // 会話一覧を取得
    const fetchConversations = async () => {
        try {
            setLoading(true);
            const response = await apiGet('/api/messages/conversations');
            if (response.success && response.data) {
                // データが配列でない場合は空配列を設定
                const conversationsData = Array.isArray(response.data) ? response.data : [];
                setConversations(conversationsData);
            } else {
                setConversations([]);
            }
        } catch (error) {
            console.error('会話一覧取得エラー:', error);
            setConversations([]);
        } finally {
            setLoading(false);
        }
    };

    // 未読メッセージ数を取得
    const fetchUnreadCount = async () => {
        try {
            const response = await apiGet('/api/messages/unread-count');
            if (response.success) {
                setUnreadCount(response.data.unread_count);
            }
        } catch (error) {
            console.error('未読メッセージ数取得エラー:', error);
        }
    };

    // 特定ユーザーとのメッセージ履歴を取得
    const fetchMessages = async (otherUserId) => {
        try {
            setLoading(true);
            const response = await apiGet(`/api/messages/conversation/${otherUserId}`);
            if (response.success && response.data) {
                // データが配列でない場合は空配列を設定
                const messagesData = Array.isArray(response.data) ? response.data : [];
                setMessages(messagesData);
            } else {
                setMessages([]);
            }
        } catch (error) {
            console.error('メッセージ履歴取得エラー:', error);
            setMessages([]);
        } finally {
            setLoading(false);
        }
    };

    // メッセージ送信
    const sendMessage = async (e) => {
        e.preventDefault();
        if (!newMessage.trim() || !selectedConversation || !user) return;

        try {
            // 現在選択中の拠点IDを取得
            const currentUser = getCurrentUser();
            const currentSatelliteId = getCurrentUserSatelliteId(currentUser);
            
            const requestData = {
                receiver_id: selectedConversation.other_user_id,
                message: sanitizeInput(newMessage.trim())
            };
            
            // 現在選択中の拠点IDがある場合は追加
            if (currentSatelliteId) {
                requestData.satellite_id = currentSatelliteId;
            }
            
            const response = await apiPost('/api/messages/send', requestData);

            if (response.success) {
                setNewMessage('');
                // メッセージ履歴を再取得
                fetchMessages(selectedConversation.other_user_id);
                // 会話一覧を更新
                fetchConversations();
                // 未読数を更新
                fetchUnreadCount();
            }
        } catch (error) {
            console.error('メッセージ送信エラー:', error);
        }
    };

    // 会話を選択
    const selectConversation = (conversation) => {
        setSelectedConversation(conversation);
        fetchMessages(conversation.other_user_id);
    };

    useEffect(() => {
        if (user) {
            fetchConversations();
            fetchUnreadCount();
        }
    }, [user]);

    useEffect(() => {
        if (!user) return;

        fetchConversations();
        fetchUnreadCount();

        if (selectedConversation?.other_user_id) {
            fetchMessages(selectedConversation.other_user_id);
        }
    }, [refreshSignal]);

    // 日時フォーマット（DBに保存されている時間をそのまま表示）
    const formatDateTime = (dateString) => {
        return formatDatabaseTime(dateString, {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // 日時フォーマット（詳細）
    const formatDateTimeDetail = (dateString) => {
        return formatDatabaseTime(dateString, {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    // デバッグ用ログ
    console.log('PersonalMessageList - user object:', user);
    console.log('PersonalMessageList - user type:', typeof user);
    console.log('PersonalMessageList - user keys:', user ? Object.keys(user) : 'user is null/undefined');

    // userが存在しない場合はローディング表示
    if (!user) {
        return (
            <div className="space-y-4">
                <div className="text-center text-gray-500 text-sm py-4">
                    ユーザー情報を読み込み中...
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {unreadCount > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <span className="text-blue-800 text-sm">
                        📬 未読メッセージ {unreadCount}件
                    </span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* 会話一覧 */}
                <div className="lg:col-span-1">
                    <div className="bg-gray-50 rounded-lg p-4">
                        <h3 className="font-semibold text-gray-800 mb-3">会話一覧</h3>
                        <div className="max-h-64 overflow-y-auto space-y-2">
                            {loading ? (
                                <div className="text-center text-gray-500 text-sm">読み込み中...</div>
                            ) : conversations.length === 0 ? (
                                <div className="text-center text-gray-500 text-sm">
                                    メッセージはありません
                                </div>
                            ) : (
                                conversations.filter(conversation => conversation && conversation.other_user_id).map(conversation => (
                                    <div
                                        key={conversation.other_user_id}
                                        className={`p-3 rounded-lg cursor-pointer transition-colors ${
                                            selectedConversation?.other_user_id === conversation.other_user_id
                                                ? 'bg-blue-100 border border-blue-300'
                                                : 'bg-white hover:bg-gray-100'
                                        }`}
                                        onClick={() => selectConversation(conversation)}
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <p className="font-medium text-sm text-gray-800">
                                                    {conversation.other_user_name}
                                                </p>
                                                <p className="text-xs text-gray-500">
                                                    {conversation.other_user_role === 4 ? '指導員' : '利用者'}
                                                </p>
                                                <p className="text-xs text-gray-400">
                                                    {formatDateTime(conversation.last_message_at)}
                                                </p>
                                            </div>
                                            {conversation.unread_count > 0 && (
                                                <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full">
                                                    {conversation.unread_count}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* メッセージ表示エリア */}
                <div className="lg:col-span-2">
                    {selectedConversation ? (
                        <div className="bg-gray-50 rounded-lg h-80 flex flex-col">
                            {/* ヘッダー */}
                            <div className="p-3 border-b bg-white rounded-t-lg">
                                <h4 className="font-semibold text-gray-800">
                                    {selectedConversation.other_user_name}
                                    <span className="text-sm text-gray-500 ml-2">
                                        ({selectedConversation.other_user_role === 4 ? '指導員' : '利用者'})
                                    </span>
                                </h4>
                            </div>

                            {/* メッセージ一覧 */}
                            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                                {loading ? (
                                    <div className="text-center text-gray-500 text-sm">読み込み中...</div>
                                ) : messages.length === 0 ? (
                                    <div className="text-center text-gray-500 text-sm">
                                        メッセージがありません
                                    </div>
                                ) : (
                                    messages.filter(message => message && message.id).map(message => (
                                        <div
                                            key={message.id}
                                            className={`flex ${
                                                message.sender_id === user?.id ? 'justify-end' : 'justify-start'
                                            }`}
                                        >
                                            <div
                                                className={`max-w-xs px-3 py-2 rounded-lg text-sm ${
                                                    message.sender_id === user?.id
                                                        ? 'bg-blue-500 text-white'
                                                        : 'bg-white text-gray-800 border'
                                                }`}
                                            >
                                                <p>{message.message}</p>
                                                <p
                                                    className={`text-xs mt-1 ${
                                                        message.sender_id === user?.id
                                                            ? 'text-blue-100'
                                                            : 'text-gray-500'
                                                    }`}
                                                >
                                                    {formatDateTimeDetail(message.created_at)}
                                                </p>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>

                            {/* メッセージ送信フォーム */}
                            <form onSubmit={sendMessage} className="p-3 border-t bg-white rounded-b-lg">
                                <div className="flex space-x-2">
                                    <input
                                        type="text"
                                        value={newMessage}
                                        onChange={(e) => setNewMessage(e.target.value)}
                                        placeholder="メッセージを入力..."
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                                    />
                                    <button
                                        type="submit"
                                        disabled={!newMessage.trim()}
                                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                                    >
                                        送信
                                    </button>
                                </div>
                            </form>
                        </div>
                    ) : (
                        <div className="bg-gray-50 rounded-lg h-80 flex items-center justify-center">
                            <div className="text-center text-gray-500">
                                <p className="text-sm">会話を選択してください</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PersonalMessageList;
