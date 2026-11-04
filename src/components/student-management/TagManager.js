import React, { useState } from 'react';
import { API_BASE_URL } from '../../config/apiConfig';

const TagManager = ({ students, onStudentsUpdate }) => {
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [tagsToAdd, setTagsToAdd] = useState([]);
  const [selectedStudents, setSelectedStudents] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [customTags, setCustomTags] = useState([
    '優秀', '要フォロー', '積極的', '消極的', '欠席が多い', '質問が多い', '理解度高い', '理解度低い'
  ]);

  // 全てのタグを取得
  const getAllTags = () => {
    const tagSet = new Set();
    students.forEach(student => {
      if (student.tags && Array.isArray(student.tags)) {
        student.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  };

  // フィルタリングされた利用者を取得
  const getFilteredStudents = () => {
    let filtered = students;
    
    // 検索フィルター
    if (searchTerm) {
      filtered = filtered.filter(student =>
        student.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        student.login_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (student.instructor_name && student.instructor_name.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    }
    
    // タグフィルター
    if (selectedTags.length > 0) {
      filtered = filtered.filter(student =>
        selectedTags.every(tag => student.tags && student.tags.includes(tag))
      );
    }
    
    return filtered;
  };

  // 利用者の選択/選択解除
  const toggleStudentSelection = (studentId) => {
    setSelectedStudents(prev => 
      prev.includes(studentId) 
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  // 全利用者を選択/選択解除
  const toggleAllStudents = () => {
    const filteredStudents = getFilteredStudents();
    if (selectedStudents.length === filteredStudents.length) {
      setSelectedStudents([]);
    } else {
      setSelectedStudents(filteredStudents.map(student => student.id));
    }
  };

  // タグフィルターの選択/解除
  const toggleTagFilter = (tag) => {
    setSelectedTags(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // タグ一括追加
  const handleBulkAddTags = async () => {
    if (selectedStudents.length === 0) {
      alert('利用者を選択してください');
      return;
    }

    if (tagsToAdd.length === 0) {
      alert('追加するタグを選択してください');
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/bulk-add-tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userIds: selectedStudents,
          tags: tagsToAdd
        })
      });

      if (response.ok) {
        alert(`${selectedStudents.length}名の利用者にタグの一括追加が完了しました`);
        setShowTagModal(false);
        setTagsToAdd([]);
        setSelectedStudents([]);
        setSearchTerm('');
        setSelectedTags([]);
        onStudentsUpdate(); // 親コンポーネントに更新を通知
      } else {
        const errorData = await response.json();
        alert(`タグ一括追加に失敗しました: ${errorData.message}`);
      }
    } catch (error) {
      console.error('タグ一括追加エラー:', error);
      alert('タグ一括追加に失敗しました');
    }
  };

  // 新しいタグを追加
  const addNewTag = () => {
    if (newTagName.trim() && !customTags.includes(newTagName.trim())) {
      setCustomTags([...customTags, newTagName.trim()]);
      setTagsToAdd([...tagsToAdd, newTagName.trim()]);
      setNewTagName('');
    }
  };

  // タグの選択/解除
  const toggleTag = (tag) => {
    setTagsToAdd(prev => 
      prev.includes(tag) 
        ? prev.filter(t => t !== tag)
        : [...prev, tag]
    );
  };

  // モーダルをリセット
  const resetModal = () => {
    setShowTagModal(false);
    setTagsToAdd([]);
    setSelectedStudents([]);
    setSearchTerm('');
    setSelectedTags([]);
    setNewTagName('');
  };

  return {
    showTagModal,
    setShowTagModal,
    newTagName,
    setNewTagName,
    tagsToAdd,
    setTagsToAdd,
    customTags,
    setCustomTags,
    selectedStudents,
    setSelectedStudents,
    searchTerm,
    setSearchTerm,
    selectedTags,
    setSelectedTags,
    getAllTags,
    getFilteredStudents,
    toggleStudentSelection,
    toggleAllStudents,
    toggleTagFilter,
    handleBulkAddTags,
    addNewTag,
    toggleTag,
    resetModal
  };
};

export default TagManager;
