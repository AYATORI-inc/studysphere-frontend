import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';
import { useAuth } from './contexts/AuthContext';
import { sanitizeInput } from '../utils/sanitizeUtils';
import UserFilter from './UserFilter';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';
import { getCurrentUser } from '../utils/userContext';

const AnnouncementCreator = () => {
    const { currentUser: user } = useAuth();
    const [title, setTitle] = useState('');
    const [message, setMessage] = useState('');
    const [selectedUsers, setSelectedUsers] = useState([]);
    const [availableUsers, setAvailableUsers] = useState([]);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showUserSelector, setShowUserSelector] = useState(false);

    // 利用者一覧を取得（高度なフィルター用）
    const handleUsersLoad = (users) => {
        setAvailableUsers(users);
    };

    // アナウンス送信
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!title.trim() || !message.trim() || selectedUsers.length === 0) {
            alert('タイトル、メッセージ、受信者をすべて入力してください。');
            return;
        }

        try {
            setSubmitting(true);
            
            // 現在選択中の拠点IDを取得
            const currentUser = getCurrentUser();
            const currentSatelliteId = getCurrentUserSatelliteId(currentUser);
            
            const requestData = {
                title: sanitizeInput(title.trim()),
                message: sanitizeInput(message.trim()),
                recipient_ids: selectedUsers.map(user => user.id)
            };
            
            // 現在選択中の拠点IDがある場合は追加
            if (currentSatelliteId) {
                requestData.satellite_id = currentSatelliteId;
            }
            
            const response = await apiPost('/api/announcements/admin/create', requestData);

            if (response.success) {
                alert('アナウンスを送信しました。');
                // フォームをリセット
                setTitle('');
                setMessage('');
                setSelectedUsers([]);
            } else {
                alert('アナウンスの送信に失敗しました。');
            }
        } catch (error) {
            console.error('アナウンス送信エラー:', error);
            alert('アナウンスの送信に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    // ユーザー選択/解除
    const toggleUserSelection = (user) => {
        setSelectedUsers(prev => {
            const isSelected = prev.some(selected => selected.id === user.id);
            if (isSelected) {
                return prev.filter(selected => selected.id !== user.id);
            } else {
                return [...prev, user];
            }
        });
    };

    // 全選択/全解除
    const toggleAllUsers = () => {
        if (selectedUsers.length === availableUsers.length) {
            setSelectedUsers([]);
        } else {
            setSelectedUsers([...availableUsers]);
        }
    };

    // フィルター変更ハンドラー
    const handleFilterChange = (filters) => {
        // フィルター変更時の処理はUserFilterコンポーネント内で自動処理される
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* タイトル */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        タイトル
                    </label>
                    <input
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="アナウンスのタイトルを入力"
                        maxLength={255}
                    />
                </div>

                {/* メッセージ */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        メッセージ
                    </label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="アナウンスの内容を入力"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                        ※アナウンスメッセージは送信当日のみ表示されます
                    </p>
                </div>

                {/* 受信者選択 */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700 required-asterisk">
                            受信者選択
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowUserSelector(!showUserSelector)}
                            className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                        >
                            {showUserSelector ? '閉じる' : '受信者を選択'}
                        </button>
                    </div>

                    {selectedUsers.length > 0 && (
                        <div className="mb-3 p-3 bg-blue-50 rounded-lg">
                            <p className="text-sm text-blue-800 mb-2">
                                選択済み: {selectedUsers.length}名
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {selectedUsers.map(user => (
                                    <span
                                        key={user.id}
                                        className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded-full text-xs"
                                    >
                                        {user.name}
                                        <button
                                            type="button"
                                            onClick={() => toggleUserSelection(user)}
                                            className="ml-1 text-blue-600 hover:text-blue-800"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}

                    {showUserSelector && (
                        <div className="border border-gray-300 rounded-lg p-3">
                            {/* フィルター */}
                            <div className="mb-3 p-3 border border-gray-300 rounded-lg bg-gray-50">
                                <UserFilter
                                    onFilterChange={handleFilterChange}
                                    onUsersLoad={handleUsersLoad}
                                    apiEndpoint="/api/announcements/admin/users"
                                    showInstructorFilter={user?.role === 4}
                                    showTagFilter={true}
                                    showNameFilter={true}
                                />
                            </div>

                            {/* 全選択ボタン */}
                            <div className="mb-3">
                                <button
                                    type="button"
                                    onClick={toggleAllUsers}
                                    className="px-3 py-1 bg-gray-500 text-white rounded-lg hover:bg-gray-600 text-sm"
                                >
                                    {selectedUsers.length === availableUsers.length ? '全解除' : '全選択'}
                                </button>
                            </div>

                            {/* 利用者一覧 */}
                            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg">
                                {loading ? (
                                    <div className="p-3 text-center text-gray-500 text-sm">読み込み中...</div>
                                ) : availableUsers.length === 0 ? (
                                    <div className="p-3 text-center text-gray-500 text-sm">
                                        利用者が見つかりません
                                    </div>
                                ) : (
                                    <div className="divide-y divide-gray-200">
                                        {availableUsers.map(user => (
                                            <div
                                                key={user.id}
                                                className={`p-2 cursor-pointer hover:bg-gray-50 text-sm ${
                                                    selectedUsers.some(selected => selected.id === user.id)
                                                        ? 'bg-blue-50'
                                                        : user.is_my_assigned
                                                        ? 'bg-green-50'
                                                        : ''
                                                }`}
                                                onClick={() => toggleUserSelection(user)}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex-1">
                                                        <p className="font-medium">
                                                            {user.name}
                                                            {Boolean(user.is_my_assigned) && ' ★'}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            利用者
                                                            {user.company_name && ` | ${user.company_name}`}
                                                            {user.satellite_name && ` | ${user.satellite_name}`}
                                                            {user.instructor_name && ` | 担当: ${user.instructor_name}`}
                                                        </p>
                                                        {user.tags && (
                                                            <div className="flex flex-wrap gap-1 mt-1">
                                                                {(typeof user.tags === 'string' ? user.tags.split(',') : user.tags)
                                                                    .slice(0, 3)
                                                                    .map((tag, index) => (
                                                                    <span key={index} className="px-1 py-0.5 bg-gray-200 text-xs rounded">
                                                                        {tag.trim()}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedUsers.some(selected => selected.id === user.id)}
                                                        onChange={(e) => {
                                                            e.stopPropagation();
                                                            toggleUserSelection(user);
                                                        }}
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded ml-2"
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                {/* 送信ボタン */}
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => {
                            setTitle('');
                            setMessage('');
                            setSelectedUsers([]);
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                        リセット
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || !title.trim() || !message.trim() || selectedUsers.length === 0}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                    >
                        {submitting ? '送信中...' : 'アナウンス送信'}
                    </button>
                </div>
            </form>
        </div>
    );
};

export default AnnouncementCreator;
