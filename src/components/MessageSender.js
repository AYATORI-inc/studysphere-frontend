import React, { useState, useEffect } from 'react';
import { apiGet, apiPost } from '../utils/api';
import { useAuth } from './contexts/AuthContext';
import UserFilter from './UserFilter';
import { sanitizeInput } from '../utils/sanitizeUtils';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';
import { getCurrentUser } from '../utils/userContext';

const MessageSender = () => {
    const { currentUser: user } = useAuth();
    const [students, setStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [message, setMessage] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [showFilter, setShowFilter] = useState(false);

    // 利用者一覧を取得（フィルター機能はUserFilterコンポーネントで処理）
    const handleUsersLoad = (users) => {
        setStudents(users);
    };

    // メッセージ送信
    const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!selectedStudent || !message.trim()) {
            alert('利用者とメッセージを入力してください。');
            return;
        }

        try {
            setSubmitting(true);
            
            // 現在選択中の拠点IDを取得
            const currentUser = getCurrentUser();
            const currentSatelliteId = getCurrentUserSatelliteId(currentUser);
            
            console.log('メッセージ送信 - デバッグ情報:', {
                currentUser,
                currentSatelliteId,
                selectedStudent: selectedStudent.id
            });
            
            const requestData = {
                receiver_id: selectedStudent.id,
                message: sanitizeInput(message.trim())
            };
            
            // 現在選択中の拠点IDがある場合は追加
            if (currentSatelliteId) {
                requestData.satellite_id = currentSatelliteId;
                console.log('メッセージ送信 - satellite_idを追加:', currentSatelliteId);
            } else {
                console.warn('メッセージ送信 - satellite_idが取得できませんでした');
            }
            
            console.log('メッセージ送信 - リクエストデータ:', requestData);
            
            const response = await apiPost('/api/messages/send', requestData);

            if (response.success) {
                alert('メッセージを送信しました。');
                setMessage('');
                setSelectedStudent(null);
            } else {
                alert('メッセージの送信に失敗しました。');
            }
        } catch (error) {
            console.error('メッセージ送信エラー:', error);
            alert('メッセージの送信に失敗しました。');
        } finally {
            setSubmitting(false);
        }
    };

    // フィルター変更ハンドラー（現在は使用しないが、将来の拡張用）
    const handleFilterChange = (filters) => {
        // フィルター変更時の処理はUserFilterコンポーネント内で自動処理される
    };

    return (
        <div className="space-y-4">
            <form onSubmit={handleSubmit} className="space-y-4">
                {/* 利用者選択 */}
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-sm font-medium text-gray-700 required-asterisk">
                            送信先利用者
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowFilter(!showFilter)}
                            className="px-3 py-1 bg-blue-500 text-white rounded-lg hover:bg-blue-600 text-sm"
                        >
                            {showFilter ? 'フィルターを閉じる' : 'フィルター'}
                        </button>
                    </div>

                    {/* フィルター */}
                    <div
                        className={`mb-3 p-3 border border-gray-300 rounded-lg bg-gray-50 ${
                            showFilter ? '' : 'hidden'
                        }`}
                    >
                        <UserFilter
                            onFilterChange={handleFilterChange}
                            onUsersLoad={handleUsersLoad}
                            apiEndpoint="/api/messages/students"
                            showInstructorFilter={true}
                            showTagFilter={true}
                            showNameFilter={true}
                        />
                    </div>

                    <select
                        value={selectedStudent?.id || ''}
                        onChange={(e) => {
                            const studentId = parseInt(e.target.value);
                            const student = students.find(s => s.id === studentId);
                            setSelectedStudent(student || null);
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                    >
                        <option value="">利用者を選択してください</option>
                        {students.map(student => (
                            <option key={student.id} value={student.id}>
                                {student.name}
                                {Boolean(student.is_my_assigned) && ' ★'}
                                {student.satellite_name && ` (${student.satellite_name})`}
                                {student.company_name && ` - ${student.company_name}`}
                                {student.instructor_name && ` [担当: ${student.instructor_name}]`}
                            </option>
                        ))}
                    </select>
                </div>

                {/* 選択された利用者の情報表示 */}
                {selectedStudent && (
                    <div className="p-3 bg-blue-50 rounded-lg">
                        <h4 className="font-medium text-blue-800 mb-2 text-sm">送信先情報</h4>
                        <div className="text-sm text-blue-700">
                            <p><strong>名前:</strong> {selectedStudent.name}</p>
                            {selectedStudent.email && (
                                <p><strong>メール:</strong> {selectedStudent.email}</p>
                            )}
                            <p><strong>ログインコード:</strong> {selectedStudent.login_code}</p>
                            {selectedStudent.satellite_name && (
                                <p><strong>拠点:</strong> {selectedStudent.satellite_name}</p>
                            )}
                            {selectedStudent.company_name && (
                                <p><strong>企業:</strong> {selectedStudent.company_name}</p>
                            )}
                            {selectedStudent.instructor_name && (
                                <p><strong>担当指導員:</strong> {selectedStudent.instructor_name}</p>
                            )}
                            {selectedStudent.tags && (
                                <p><strong>タグ:</strong> {typeof selectedStudent.tags === 'string' ? selectedStudent.tags : selectedStudent.tags.join(', ')}</p>
                            )}
                        </div>
                    </div>
                )}

                {/* メッセージ入力 */}
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2 required-asterisk">
                        メッセージ
                    </label>
                    <textarea
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        rows={4}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        placeholder="メッセージを入力してください"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                        ※ メッセージは60日間保存されます
                    </p>
                </div>

                {/* 送信ボタン */}
                <div className="flex justify-end space-x-3">
                    <button
                        type="button"
                        onClick={() => {
                            setMessage('');
                            setSelectedStudent(null);
                        }}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm"
                    >
                        リセット
                    </button>
                    <button
                        type="submit"
                        disabled={submitting || !selectedStudent || !message.trim()}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm"
                    >
                        {submitting ? '送信中...' : 'メッセージ送信'}
                    </button>
                </div>
            </form>

            {/* 利用者一覧（参考用） */}
            {students.length > 0 && (
                <div className="mt-4">
                    <h4 className="text-sm font-medium mb-2 text-gray-700">
                        利用者一覧 ({students.length}名)
                    </h4>
                    <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto">
                        {students.map(student => (
                            <div
                                key={student.id}
                                className={`p-2 border rounded-lg cursor-pointer transition-colors text-sm ${
                                    selectedStudent?.id === student.id
                                        ? 'border-blue-500 bg-blue-50'
                                        : student.is_my_assigned
                                        ? 'border-green-300 bg-green-50'
                                        : 'border-gray-200 hover:bg-gray-50'
                                }`}
                                onClick={() => setSelectedStudent(student)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex-1">
                                        <p className="font-medium">
                                            {student.name}
                                            {Boolean(student.is_my_assigned) && ' ★'}
                                        </p>
                                        <p className="text-xs text-gray-500">
                                            {student.satellite_name && `${student.satellite_name} | `}
                                            {student.company_name}
                                            {student.instructor_name && ` | 担当: ${student.instructor_name}`}
                                        </p>
                                    </div>
                                    {student.tags && (
                                        <div className="flex flex-wrap gap-1 ml-2">
                                            {(typeof student.tags === 'string' ? student.tags.split(',') : student.tags)
                                                .slice(0, 2)
                                                .map((tag, index) => (
                                                <span key={index} className="px-1 py-0.5 bg-gray-200 text-xs rounded">
                                                    {tag.trim()}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};

export default MessageSender;
