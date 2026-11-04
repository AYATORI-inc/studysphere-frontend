import React, { useState, useEffect } from 'react';
import { apiGet } from '../utils/api';
import { getCurrentUserSatelliteId } from '../utils/locationUtils';
import { useAuth } from './contexts/AuthContext';

const UserFilter = ({ 
    onFilterChange, 
    onUsersLoad, 
    apiEndpoint, 
    showInstructorFilter = true,
    showTagFilter = true,
    showNameFilter = true,
    className = ""
}) => {
    const { currentUser } = useAuth();
    const [filters, setFilters] = useState({
        instructor_filter: 'all',
        name_filter: '',
        tag_filter: ''
    });
    const [loading, setLoading] = useState(false);
    const [users, setUsers] = useState([]);
    const [availableInstructors, setAvailableInstructors] = useState([]);
    const [selectedInstructors, setSelectedInstructors] = useState([]);

    // 指導員一覧を取得
    const fetchInstructors = async () => {
        try {
            // APIエンドポイントに応じて指導員一覧取得先を変更
            const instructorEndpoint = apiEndpoint.includes('/announcements/') 
                ? '/api/announcements/admin/instructors-for-filter'
                : '/api/messages/instructors-for-filter';
            
            // 現在選択中の拠点IDを取得して追加
            let currentSatelliteId = getCurrentUserSatelliteId(currentUser);
            
            // 拠点IDが取得できない場合、セッションストレージから直接取得を試みる
            if (!currentSatelliteId) {
                try {
                    const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
                    if (sessionSelectedSatellite) {
                        const satelliteData = JSON.parse(sessionSelectedSatellite);
                        if (satelliteData && satelliteData.id) {
                            currentSatelliteId = parseInt(satelliteData.id);
                            console.log('UserFilter: セッションストレージから拠点IDを取得:', currentSatelliteId);
                        }
                    }
                } catch (error) {
                    console.error('UserFilter: セッションストレージからの拠点ID取得エラー:', error);
                }
            }
            
            // まだ取得できていない場合、ユーザーの所属拠点から最初の拠点を使用
            if (!currentSatelliteId && currentUser && currentUser.satellite_ids) {
                try {
                    let satelliteIds = currentUser.satellite_ids;
                    if (typeof satelliteIds === 'string') {
                        satelliteIds = JSON.parse(satelliteIds);
                    }
                    if (Array.isArray(satelliteIds) && satelliteIds.length > 0) {
                        currentSatelliteId = parseInt(satelliteIds[0]);
                        console.log('UserFilter: ユーザーの所属拠点から最初の拠点IDを使用:', currentSatelliteId);
                    }
                } catch (error) {
                    console.error('UserFilter: ユーザーの所属拠点からの取得エラー:', error);
                }
            }
            
            const queryParams = new URLSearchParams();
            if (currentSatelliteId) {
                queryParams.append('satellite_id', currentSatelliteId);
            }
            
            const url = queryParams.toString() ? `${instructorEndpoint}?${queryParams.toString()}` : instructorEndpoint;
            const response = await apiGet(url);
            if (response.success) {
                setAvailableInstructors(response.data);
            }
        } catch (error) {
            console.error('指導員一覧取得エラー:', error);
            setAvailableInstructors([]);
        }
    };

    // 利用者一覧を取得
    const fetchUsers = async () => {
        try {
            setLoading(true);
            const queryParams = new URLSearchParams();
            
            // 現在選択中の拠点IDを取得して追加
            let currentSatelliteId = getCurrentUserSatelliteId(currentUser);
            
            // 拠点IDが取得できない場合、セッションストレージから直接取得を試みる
            if (!currentSatelliteId) {
                try {
                    const sessionSelectedSatellite = sessionStorage.getItem('selectedSatellite');
                    if (sessionSelectedSatellite) {
                        const satelliteData = JSON.parse(sessionSelectedSatellite);
                        if (satelliteData && satelliteData.id) {
                            currentSatelliteId = parseInt(satelliteData.id);
                            console.log('UserFilter: セッションストレージから拠点IDを取得:', currentSatelliteId);
                        }
                    }
                } catch (error) {
                    console.error('UserFilter: セッションストレージからの拠点ID取得エラー:', error);
                }
            }
            
            // まだ取得できていない場合、ユーザーの所属拠点から最初の拠点を使用
            if (!currentSatelliteId && currentUser && currentUser.satellite_ids) {
                try {
                    let satelliteIds = currentUser.satellite_ids;
                    if (typeof satelliteIds === 'string') {
                        satelliteIds = JSON.parse(satelliteIds);
                    }
                    if (Array.isArray(satelliteIds) && satelliteIds.length > 0) {
                        currentSatelliteId = parseInt(satelliteIds[0]);
                        console.log('UserFilter: ユーザーの所属拠点から最初の拠点IDを使用:', currentSatelliteId);
                    }
                } catch (error) {
                    console.error('UserFilter: ユーザーの所属拠点からの取得エラー:', error);
                }
            }
            
            if (currentSatelliteId) {
                queryParams.append('satellite_id', currentSatelliteId);
            }
            
            if (filters.instructor_filter !== 'all') {
                queryParams.append('instructor_filter', filters.instructor_filter);
                
                // 特定の指導員が選択されている場合
                if (filters.instructor_filter === 'specific' && selectedInstructors.length > 0) {
                    queryParams.append('instructor_ids', selectedInstructors.map(i => i.id).join(','));
                }
            }
            if (filters.name_filter) {
                queryParams.append('name_filter', filters.name_filter);
            }
            if (filters.tag_filter) {
                queryParams.append('tag_filter', filters.tag_filter);
            }

            const response = await apiGet(`${apiEndpoint}?${queryParams.toString()}`);
            if (response.success) {
                setUsers(response.data);
                onUsersLoad && onUsersLoad(response.data);
            }
        } catch (error) {
            console.error('利用者一覧取得エラー:', error);
            setUsers([]);
            onUsersLoad && onUsersLoad([]);
        } finally {
            setLoading(false);
        }
    };

    // 指導員選択/解除
    const toggleInstructorSelection = (instructor) => {
        setSelectedInstructors(prev => {
            const isSelected = prev.some(selected => selected.id === instructor.id);
            if (isSelected) {
                return prev.filter(selected => selected.id !== instructor.id);
            } else {
                return [...prev, instructor];
            }
        });
    };

    // フィルター変更ハンドラー
    const handleFilterChange = (key, value) => {
        const newFilters = { ...filters, [key]: value };
        setFilters(newFilters);
        onFilterChange && onFilterChange(newFilters);
        
        // 指導員フィルターが変更された場合は選択をリセット
        if (key === 'instructor_filter' && value !== 'specific') {
            setSelectedInstructors([]);
        }
    };

    // フィルターリセット
    const resetFilters = () => {
        const resetFilters = {
            instructor_filter: 'all',
            name_filter: '',
            tag_filter: ''
        };
        setFilters(resetFilters);
        setSelectedInstructors([]);
        onFilterChange && onFilterChange(resetFilters);
    };

    useEffect(() => {
        if (showInstructorFilter) {
            fetchInstructors();
        }
    }, [showInstructorFilter, currentUser]);

    useEffect(() => {
        fetchUsers();
    }, [filters, selectedInstructors, apiEndpoint, currentUser]);

    return (
        <div className={`space-y-3 ${className}`}>
            <div className="flex justify-between items-center">
                <h4 className="text-sm font-medium text-gray-700">フィルター</h4>
                <button
                    type="button"
                    onClick={resetFilters}
                    className="text-xs text-blue-600 hover:text-blue-800"
                >
                    リセット
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {/* 担当指導員フィルター */}
                {showInstructorFilter && (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            担当指導員
                        </label>
                        <select
                            value={filters.instructor_filter}
                            onChange={(e) => handleFilterChange('instructor_filter', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                        >
                            <option value="all">すべて</option>
                            <option value="my">自分の担当</option>
                            <option value="other">他指導員の担当</option>
                            <option value="specific">特定の指導員の担当</option>
                            <option value="none">担当なし</option>
                        </select>
                    </div>
                )}

                {/* 名前フィルター */}
                {showNameFilter && (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            名前検索
                        </label>
                        <input
                            type="text"
                            value={filters.name_filter}
                            onChange={(e) => handleFilterChange('name_filter', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="名前で検索"
                        />
                    </div>
                )}

                {/* タグフィルター */}
                {showTagFilter && (
                    <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">
                            タグ検索
                        </label>
                        <input
                            type="text"
                            value={filters.tag_filter}
                            onChange={(e) => handleFilterChange('tag_filter', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
                            placeholder="タグで検索"
                        />
                    </div>
                )}
            </div>

            {/* 特定の指導員選択 */}
            {showInstructorFilter && filters.instructor_filter === 'specific' && (
                <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                        選択する指導員
                    </label>
                    {availableInstructors.length === 0 ? (
                        <p className="text-xs text-gray-500">同じ拠点の指導員がいません</p>
                    ) : (
                        <div className="grid grid-cols-1 gap-1 max-h-32 overflow-y-auto border border-gray-200 rounded-lg p-2">
                            {availableInstructors.map(instructor => (
                                <label key={instructor.id} className="flex items-center space-x-2 text-xs">
                                    <input
                                        type="checkbox"
                                        checked={selectedInstructors.some(selected => selected.id === instructor.id)}
                                        onChange={() => toggleInstructorSelection(instructor)}
                                        className="h-3 w-3 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                    />
                                    <span className="flex-1">
                                        {instructor.name}
                                        {instructor.satellite_name && ` (${instructor.satellite_name})`}
                                    </span>
                                </label>
                            ))}
                        </div>
                    )}
                    {selectedInstructors.length > 0 && (
                        <div className="mt-2 text-xs text-blue-600">
                            選択中: {selectedInstructors.map(i => i.name).join(', ')}
                        </div>
                    )}
                </div>
            )}

            {/* 結果表示 */}
            <div className="text-xs text-gray-600">
                {loading ? (
                    <span>読み込み中...</span>
                ) : (
                    <span>
                        {users.length}名の利用者が見つかりました
                        {users.some(user => user.is_my_assigned) && (
                            <span className="text-blue-600 ml-1">
                                （{users.filter(user => user.is_my_assigned).length}名が自分の担当）
                            </span>
                        )}
                    </span>
                )}
            </div>
        </div>
    );
};

export default UserFilter;
