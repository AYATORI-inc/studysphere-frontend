import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../components/contexts/AuthContext';
import { isAuthRequiredPage } from '../authUtils';

// 認証ガード用のカスタムフック
export const useAuthGuard = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    const pathname = window.location.pathname;
    
    // 認証が必要なページで認証されていない場合
    if (isAuthRequiredPage(pathname) && !isAuthenticated) {
      navigate('/homepage');
      return;
    }

    // 認証済みでログインページにアクセスした場合
    if (isAuthenticated && (pathname === '/homepage' || pathname.startsWith('/student/login'))) {
      if (currentUser) {
        const role = currentUser.role;
        
        // 指導員ダッシュボード選択中は管理者ダッシュボードへのリダイレクトを無効
        const instructorDashboardSelection = sessionStorage.getItem('instructorDashboardSelection');
        if (role >= 9 && instructorDashboardSelection === 'true') {
          console.log('指導員ダッシュボード選択中 - 管理者ダッシュボードへのリダイレクトを無効');
          return;
        }
        
        // 数値のroleに対応
        if (role >= 9) {
          navigate('/admin/dashboard');
        } else if (role >= 4 && role <= 8) {
          navigate('/instructor/dashboard');
        } else if (role >= 1 && role <= 3) {
          navigate('/student/dashboard');
        } else {
          navigate('/homepage');
        }
      }
    }
    
    // 指導員ダッシュボード選択中はすべてのリダイレクトを無効にする
    const instructorDashboardSelection = sessionStorage.getItem('instructorDashboardSelection');
    if (instructorDashboardSelection === 'true') {
      console.log('指導員ダッシュボード選択中 - すべてのリダイレクトを無効');
      return;
    }
    
    // 指導員ダッシュボード選択中はリダイレクトを無効にする
    if (isAuthenticated && currentUser && currentUser.role >= 9) {
      // 企業・拠点選択画面や指導員ダッシュボードへの遷移中は管理者ダッシュボードへのリダイレクトを無効
      if (pathname.startsWith('/instructor/dashboard') ||
          pathname.startsWith('/instructor/old-dashboard') ||
          pathname.includes('company-selection') || 
          pathname.includes('satellite-selection')) {
        console.log('Admin user accessing instructor dashboard or selection pages - allowing access');
        return;
      }
    }
    
    // 認証済みでダッシュボードページにアクセスした場合の処理
    if (isAuthenticated && currentUser) {
      const role = currentUser.role;
      
      // 管理者（ロール9以上）が指導員ダッシュボードにアクセスしている場合は許可
      if (role >= 9 && (pathname.startsWith('/instructor/dashboard') || pathname.startsWith('/instructor/old-dashboard'))) {
        console.log('Admin user accessing instructor dashboard - allowing access');
        return;
      }
      
      // 指導員（ロール4-8）が管理者ダッシュボードにアクセスしている場合はリダイレクト
      if (role >= 4 && role <= 8 && pathname.startsWith('/admin/dashboard')) {
        console.log('Instructor user accessing admin dashboard - redirecting to instructor dashboard');
        navigate('/instructor/dashboard');
        return;
      }
    }
  }, [isAuthenticated, isLoading, currentUser, navigate]);

  return { isAuthenticated, isLoading, currentUser };
};

// 管理者専用ページ用のガード
export const useAdminGuard = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('=== useAdminGuard Debug ===');
    console.log('isLoading:', isLoading);
    console.log('isAuthenticated:', isAuthenticated);
    console.log('currentUser:', currentUser);
    console.log('currentUser.role:', currentUser?.role);
    console.log('currentUser.role type:', typeof currentUser?.role);
    console.log('Pathname:', window.location.pathname);
    console.log('Timestamp:', new Date().toISOString());
    
    // 指導員ダッシュボード選択中はすべてのガード処理をスキップ
    const instructorDashboardSelection = sessionStorage.getItem('instructorDashboardSelection');
    if (instructorDashboardSelection === 'true') {
      console.log('指導員ダッシュボード選択中 - AdminGuard処理をスキップ');
      return;
    }
    
    // ローディング中は何もしない
    if (isLoading) {
      console.log('Still loading, skipping guard check');
      return;
    }

    // 認証されていない場合はホームページにリダイレクト
    if (!isAuthenticated) {
      console.log('Not authenticated, redirecting to homepage');
      console.log('Reason: isAuthenticated is false');
      navigate('/homepage');
      return;
    }

    // ユーザー情報がない場合はホームページにリダイレクト
    if (!currentUser) {
      console.log('No currentUser, redirecting to homepage');
      console.log('Reason: currentUser is null/undefined');
      navigate('/homepage');
      return;
    }

    // ロール6以上（管理者）を許可（一時的に緩和）
    if (currentUser.role < 6) {
      console.log('User role not authorized for admin pages, redirecting to homepage');
      console.log('User role:', currentUser.role, 'Expected: 6+ (admin)');
      console.log('User role type:', typeof currentUser.role);
      console.log('User role comparison:', currentUser.role < 6);
      console.log('Full currentUser object:', currentUser);
      navigate('/homepage');
      return;
    }
    
    console.log('AdminGuard: User authorized');
    console.log('User role:', currentUser.role, 'is authorized for admin pages');
  }, [isAuthenticated, isLoading, currentUser, navigate]);

  return { isAuthenticated, isLoading, currentUser };
};

// 指導員専用ページ用のガード
export const useInstructorGuard = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    console.log('=== useInstructorGuard Debug ===');
    console.log('isLoading:', isLoading);
    console.log('isAuthenticated:', isAuthenticated);
    console.log('currentUser:', currentUser);
    console.log('currentUser.role:', currentUser?.role);
    
    // 指導員ダッシュボード選択中はすべてのガード処理をスキップ
    const instructorDashboardSelection = sessionStorage.getItem('instructorDashboardSelection');
    if (instructorDashboardSelection === 'true') {
      console.log('指導員ダッシュボード選択中 - InstructorGuard処理をスキップ');
      return;
    }
    
    if (isLoading) {
      console.log('Still loading, skipping guard check');
      return;
    }

    if (!isAuthenticated) {
      console.log('Not authenticated, redirecting to homepage');
      navigate('/homepage');
      return;
    }

    // 管理者（ロール9以上）と指導員（ロール4-8）を許可
    if (currentUser && currentUser.role < 4) {
      console.log('User role not authorized for instructor pages, redirecting to homepage');
      console.log('User role:', currentUser.role, 'Expected: 4+ (instructor or admin)');
      navigate('/homepage');
      return;
    }
    
    console.log('InstructorGuard: User authorized');
    console.log('User role:', currentUser.role, 'is authorized for instructor pages');
  }, [isAuthenticated, isLoading, currentUser?.id, navigate]); // currentUser.idのみを依存配列に含める

  return { isAuthenticated, isLoading, currentUser };
};

// 利用者専用ページ用のガード
export const useStudentGuard = () => {
  const { isAuthenticated, isLoading, currentUser } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (isLoading) return;

    if (!isAuthenticated) {
      navigate('/homepage');
      return;
    }

    if (currentUser && (currentUser.role < 1 || currentUser.role > 3)) {
      navigate('/homepage');
      return;
    }
  }, [isAuthenticated, isLoading, currentUser, navigate]);

  return { isAuthenticated, isLoading, currentUser };
}; 