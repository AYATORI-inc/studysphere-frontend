import React, { useState, useEffect } from 'react';
import SanitizedInput from '../SanitizedInput';
import { useAuth } from '../contexts/AuthContext';
import ModalErrorDisplay from '../common/ModalErrorDisplay';
import { API_BASE_URL } from '../../config/apiConfig';

const StudentAdder = ({ onStudentAdded, instructors }) => {
  const { currentUser } = useAuth();
  const [showAddForm, setShowAddForm] = useState(false);
  const [bulkInputMode, setBulkInputMode] = useState(false);
  const [newStudent, setNewStudent] = useState({
    name: '',
    email: '',
    instructor_id: '',
    tags: []
  });
  const [tagsInput, setTagsInput] = useState('');
  const [bulkInputText, setBulkInputText] = useState('');
  const [bulkInstructorId, setBulkInstructorId] = useState('');
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [modalError, setModalError] = useState(null);

  // 個別入力の処理
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setNewStudent(prev => ({
      ...prev,
      [name]: value
    }));
  };

  // タグの変更を処理
  const handleTagChange = (e) => {
    console.log('タグ入力値:', e.target.value);
    console.log('カンマの位置:', e.target.value.indexOf(','));
    setTagsInput(e.target.value);
  };

  // 企業一覧を取得
  const fetchCompanies = async () => {
    setLoadingCompanies(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/companies`);
      if (response.ok) {
        const data = await response.json();
        setCompanies(data);
      } else {
        console.error('企業一覧の取得に失敗しました');
      }
    } catch (error) {
      console.error('企業一覧取得エラー:', error);
    } finally {
      setLoadingCompanies(false);
    }
  };

  // 企業一覧を初期化時に取得
  useEffect(() => {
    fetchCompanies();
  }, []);

  // 個別利用者追加
  const handleAddStudent = async (e) => {
    e.preventDefault();
    
    // selectedSatelliteからcompany_idとsatellite_idを取得
    let companyId = currentUser?.company_id || 1;
    let satelliteId = null;
    try {
      const selectedSatellite = sessionStorage.getItem('selectedSatellite');
      if (selectedSatellite) {
        const satelliteData = JSON.parse(selectedSatellite);
        if (satelliteData.company_id) {
          companyId = satelliteData.company_id;
        }
        if (satelliteData.id) {
          satelliteId = satelliteData.id;
        }
      }
    } catch (error) {
      console.error('selectedSatelliteの読み込みエラー:', error);
    }
    
    // タグ文字列を配列に変換
    const tags = tagsInput.split(',').map(tag => tag.trim()).filter(tag => tag);
    
    const studentData = {
      name: newStudent.name,
      email: newStudent.email,
      instructor_id: newStudent.instructor_id || null,
      company_id: companyId,
      satellite_id: satelliteId,
      tags: tags
    };

    try {
      const response = await fetch(`${API_BASE_URL}/api/users/create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(studentData)
      });

      if (response.ok) {
        alert('利用者が追加されました');
        setShowAddForm(false);
        setModalError(null);
        setNewStudent({
          name: '',
          email: '',
          instructor_id: '',
          tags: []
        });
        setTagsInput('');
        onStudentAdded(); // 親コンポーネントに更新を通知
      } else {
        const errorData = await response.json();
        setModalError(`利用者追加に失敗しました: ${errorData.message}`);
      }
    } catch (error) {
      console.error('利用者追加エラー:', error);
      setModalError('利用者追加に失敗しました');
    }
  };

  // 一括利用者追加
  const handleBulkAddStudents = async () => {
    if (!bulkInputText.trim()) {
      alert('利用者情報を入力してください');
      return;
    }

    const lines = bulkInputText.trim().split('\n').filter(line => line.trim());
    const students = [];
    const invalidLines = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const parts = line.split(',').map(item => item.trim());
      
      if (parts.length < 1) {
        invalidLines.push(`行${i + 1}: 利用者名を入力してください`);
        continue;
      }
      
      const name = parts[0];
      const email = parts[1] || ''; // 2番目の要素がない場合は空文字列
      
      if (!name || name.trim() === '') {
        invalidLines.push(`行${i + 1}: 利用者名は必須です`);
        continue;
      }
      
      // メールアドレスが指定されている場合のみ形式チェック
      if (email && email.trim() !== '') {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email.trim())) {
          invalidLines.push(`行${i + 1}: 有効なメールアドレス形式ではありません: ${email}`);
          continue;
        }
      }
      
      // selectedSatelliteからcompany_idとsatellite_idを取得
      let companyId = currentUser?.company_id || 1;
      let satelliteId = null;
      try {
        const selectedSatellite = sessionStorage.getItem('selectedSatellite');
        console.log('=== selectedSatellite デバッグ ===');
        console.log('selectedSatellite (raw):', selectedSatellite);
        
        if (selectedSatellite) {
          const satelliteData = JSON.parse(selectedSatellite);
          console.log('selectedSatellite (parsed):', satelliteData);
          
          if (satelliteData.company_id) {
            companyId = satelliteData.company_id;
            console.log('selectedSatelliteから取得したcompany_id:', companyId);
          } else {
            console.log('selectedSatelliteにcompany_idがありません');
          }
          
          if (satelliteData.id) {
            satelliteId = satelliteData.id;
            console.log('selectedSatelliteから取得したsatellite_id:', satelliteId);
          } else {
            console.log('selectedSatelliteにidがありません');
          }
        } else {
          console.log('selectedSatelliteが存在しません');
        }
        
        console.log('最終的なcompany_id:', companyId);
        console.log('最終的なsatellite_id:', satelliteId);
      } catch (error) {
        console.error('selectedSatelliteの読み込みエラー:', error);
      }

      students.push({
        name,
        email: email && email.trim() !== '' ? email : null,
        instructor_id: bulkInstructorId || null,
        company_id: companyId,
        satellite_id: satelliteId,
        tags: []
      });
    }

    if (invalidLines.length > 0) {
      alert(`以下の行に問題があります:\n${invalidLines.join('\n')}`);
      return;
    }

    if (students.length === 0) {
      alert('有効な利用者情報が見つかりませんでした');
      return;
    }

    try {
      console.log('=== 一括利用者追加リクエスト ===');
      console.log('API URL:', `${API_BASE_URL}/api/users/bulk-create`);
      console.log('送信データ:', { users: students });
             console.log('送信データの詳細:');
       students.forEach((student, index) => {
         console.log(`利用者${index + 1}:`, {
           name: student.name,
           email: student.email,
           instructor_id: student.instructor_id,
           company_id: student.company_id,
           satellite_id: student.satellite_id,
           tags: student.tags
         });
       });
      
      const response = await fetch(`${API_BASE_URL}/api/users/bulk-create`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ users: students })
      });
      
      console.log('レスポンスステータス:', response.status);
      console.log('レスポンスOK:', response.ok);

      if (response.ok) {
        alert(`${students.length}名の利用者が追加されました`);
        setShowAddForm(false);
        setModalError(null);
        setBulkInputText('');
        setBulkInstructorId('');
        onStudentAdded(); // 親コンポーネントに更新を通知
      } else {
        const errorData = await response.json();
        console.log('エラーレスポンス:', errorData);
        
        let errorMessage = `一括追加に失敗しました: ${errorData.message}`;
        
        if (errorData.errors && Array.isArray(errorData.errors)) {
          errorMessage += '\n\n詳細:\n' + errorData.errors.join('\n');
        }
        
        if (errorData.successCount > 0) {
          errorMessage += `\n\n成功: ${errorData.successCount}件`;
        }
        
        setModalError(errorMessage);
      }
    } catch (error) {
      console.error('一括追加エラー:', error);
      setModalError('一括追加に失敗しました');
    }
  };

  return {
    showAddForm,
    setShowAddForm,
    bulkInputMode,
    setBulkInputMode,
    newStudent,
    setNewStudent,
    tagsInput,
    setTagsInput,
    bulkInputText,
    setBulkInputText,
    bulkInstructorId,
    setBulkInstructorId,
    companies,
    loadingCompanies,
    currentUser,
    modalError,
    setModalError,
    handleInputChange,
    handleTagChange,
    handleAddStudent,
    handleBulkAddStudents
  };
};

export default StudentAdder;
