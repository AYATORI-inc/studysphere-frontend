import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from './contexts/AuthContext';

const AdminHeader = ({ user }) => {
  const { logout } = useAuth();

  // JWTトークンをデコードする関数
  const decodeJWT = (token) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (error) {
      console.error('JWTデコードエラー:', error);
      return null;
    }
  };

  // ロール番号からロール名を取得する関数
  const getRoleName = (roleId) => {
    const roleMap = {
      4: '指導員',
      5: '拠点管理者',
      9: 'アドミンユーザ',
      10: 'マスターユーザ'
    };
    
    // 文字列の場合は数値に変換
    const numericRoleId = parseInt(roleId, 10);
    const roleName = roleMap[numericRoleId] || '管理者'; // デフォルトは管理者
    
    return roleName;
  };

  // ユーザーの実際のロール番号を取得
  const getActualRoleId = () => {
    // まずJWTトークンからロール情報を取得
    const accessToken = localStorage.getItem('accessToken');
    if (accessToken) {
      const decodedToken = decodeJWT(accessToken);
      if (decodedToken && decodedToken.role) {
        return decodedToken.role;
      }
    }
    
    // JWTから取得できない場合は、ユーザーオブジェクトのroleを試行
    return user?.role;
  };

  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      logout();
    }
  };

  // ユーザーのロール名を取得
  const actualRoleId = getActualRoleId();
  const userRoleName = getRoleName(actualRoleId);

  return (
    <header className="bg-gradient-to-r from-red-500 to-red-400 text-white py-4 shadow-lg">
      <div className="max-w-7xl mx-auto px-5 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <Link
            to="/admin/dashboard"
            className="text-2xl font-bold text-white m-0 leading-none hover:opacity-80"
          >
            Study Sphere
          </Link>
        </div>
        <div className="flex items-center gap-4">
          <span className="font-medium text-white">{user.name}</span>
          <button 
            className="bg-white bg-opacity-10 text-white border-2 border-white border-opacity-30 px-4 py-2 rounded-md cursor-pointer transition-all duration-200 hover:bg-opacity-20 hover:border-opacity-50"
            onClick={handleLogout}
          >
            ログアウト
          </button>
        </div>
      </div>
    </header>
  );
};

export default AdminHeader; 