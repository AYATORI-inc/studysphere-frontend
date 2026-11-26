import React, { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useStudentGuard } from '../utils/hooks/useAuthGuard';
import { useAuth } from '../components/contexts/AuthContext';
import { apiGet } from '../utils/api';
import { COLOR_MODES, readColorMode, writeColorMode } from '../utils/studentColorMode';
import CertificateList from '../components/CertificateList';

const ColorModePicker = ({ colorMode, onChange }) => {
  const listRef = useRef(null);
  const selected = COLOR_MODES.find((mode) => mode.id === colorMode) || COLOR_MODES[0];

  const moveSelection = (step) => {
    const index = COLOR_MODES.findIndex((mode) => mode.id === selected.id);
    const next = COLOR_MODES[index + step];
    if (next) onChange(next.id);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-4 items-start">
      <div
        ref={listRef}
        className="rounded-xl border border-gray-200 overflow-hidden"
        role="listbox"
        aria-label="カラーモード"
        aria-activedescendant={`color-mode-${selected.id}`}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            moveSelection(1);
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            moveSelection(-1);
          }
        }}
      >
        {COLOR_MODES.map((mode) => {
          const isSelected = mode.id === selected.id;
          return (
            <div
              key={mode.id}
              id={`color-mode-${mode.id}`}
              role="option"
              aria-selected={isSelected}
              onClick={() => {
                onChange(mode.id);
                listRef.current?.focus();
              }}
              className={`student-mode-option cursor-pointer px-4 py-3 border-b border-gray-200 last:border-b-0 ${
                isSelected ? 'is-selected' : ''
              }`}
            >
              <span className="block text-xs text-gray-500">{mode.group}</span>
              <span className="block font-semibold text-gray-800">{mode.name}</span>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-gray-200 p-4">
        <p className="font-semibold text-gray-800">{selected.group} / {selected.name}</p>
        <p className="mt-1 text-sm text-gray-500">{selected.description}</p>
        <div
          className="mt-4 h-12 rounded-lg border border-gray-200"
          style={{
            backgroundColor: selected.preview.color || 'transparent',
            backgroundImage: selected.preview.image || 'none',
          }}
          aria-hidden="true"
        />
        <p className="mt-1 text-xs text-gray-500">
          {selected.preview.image ? 'グラデーションの使いどころ' : '単色の使いどころ'}: {selected.preview.label}
        </p>
        <ul className="mt-4 space-y-3">
          {selected.swatches.map((item) => (
            <li key={`${selected.id}-${item.role}`} className="flex items-center gap-3">
              <span
                className="h-10 w-10 shrink-0 rounded-md border border-gray-300"
                style={{ background: item.color }}
                aria-hidden="true"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-800">{item.role}</span>
                <span className="block text-xs text-gray-500">{item.hex}</span>
                <span className="block text-xs text-gray-500">RGB {item.rgb}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

const StudentAccountPage = () => {
  const navigate = useNavigate();
  const { currentUser } = useStudentGuard();
  const { logout } = useAuth();
  const [profile, setProfile] = useState(null);
  const [profileState, setProfileState] = useState('loading');
  const [colorMode, setColorMode] = useState(readColorMode);

  useEffect(() => {
    let cancelled = false;

    const loadProfile = async () => {
      if (!currentUser?.id) {
        setProfileState('error');
        return;
      }

      setProfileState('loading');
      try {
        const response = await apiGet(`/api/users/${currentUser.id}`);
        if (cancelled) return;
        if (response?.success && response.data) {
          setProfile(response.data);
          setProfileState('ready');
          return;
        }
        setProfileState('error');
      } catch (error) {
        if (!cancelled) {
          setProfileState('error');
        }
      }
    };

    loadProfile();
    return () => {
      cancelled = true;
    };
  }, [currentUser?.id]);

  const handleLogout = () => {
    if (window.confirm('ログアウトしますか？')) {
      localStorage.removeItem('autoLoginCode');
      localStorage.removeItem('tempPassword');
      localStorage.removeItem('loginCode');
      localStorage.removeItem('temp_password');
      localStorage.removeItem('autoLoginUser');
      localStorage.removeItem('autoLoginTarget');
      logout();
    }
  };

  const handleColorMode = (mode) => {
    setColorMode(writeColorMode(mode));
  };

  if (!currentUser) {
    return (
      <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
        <div className="text-blue-600 text-xl font-semibold">認証中...</div>
      </div>
    );
  }

  const userName = profile?.name || currentUser.name || '未設定';
  const organizationName = profile?.company_name
    || profile?.companyName
    || profile?.satellite_name
    || profile?.satelliteName
    || '';
  const instructorLabel = currentUser.instructorName && currentUser.instructorName.trim() !== ''
    ? `${currentUser.instructorName}指導員`
    : '未設定';
  const currentMode = COLOR_MODES.find((mode) => mode.id === colorMode) || COLOR_MODES[0];

  return (
    <div className="student-shell min-h-screen bg-gradient-to-br from-blue-50 to-cyan-50 flex flex-col">
      <div className="student-chrome bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-white">
                <Link to="/student/dashboard" className="hover:underline" title="ダッシュボードへ戻る">
                  Study Sphere
                </Link>
              </h1>
              <span className="px-3 py-1 bg-white bg-opacity-20 rounded-full text-sm font-semibold">
                利用者
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-medium text-white">{currentUser.name}さん</span>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg font-medium text-white bg-white/15 hover:bg-white/25 transition-colors"
                onClick={handleLogout}
                title="ログアウト"
              >
                ログアウト
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="student-nav bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              className="px-4 py-2 rounded-lg font-medium text-gray-600 hover:bg-blue-50 hover:text-blue-700 transition-all duration-200"
              onClick={() => navigate('/student/dashboard')}
            >
              📊 ダッシュボード
            </button>
            <span className="px-4 py-2 rounded-lg font-medium bg-gradient-to-r from-blue-500 to-cyan-600 text-white shadow-lg">
              アカウント情報
            </span>
          </div>
        </div>
      </div>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-white rounded-2xl shadow-xl p-6 sm:p-8">
          <h2 className="text-3xl font-bold text-gray-800">アカウント情報</h2>

          <dl className="mt-8 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <dt className="text-sm text-gray-500">ユーザー名</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-800">{userName}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <dt className="text-sm text-gray-500">担当指導員</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-800">{instructorLabel}</dd>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
              <dt className="text-sm text-gray-500">組織名</dt>
              <dd className="mt-1 text-lg font-semibold text-gray-800">
                {profileState === 'loading' && '読み込み中'}
                {profileState === 'error' && '取得できませんでした'}
                {profileState === 'ready' && (organizationName || '未設定')}
              </dd>
            </div>
          </dl>

          <section className="mt-8">
            <details className="group rounded-xl border border-gray-200 [&:not([open])>:not(summary)]:hidden">
              <summary className="cursor-pointer list-none px-4 py-3 flex items-center justify-between gap-4 [&::-webkit-details-marker]:hidden">
                <span className="text-lg font-bold text-gray-800">
                  カラーモード
                  <span className="ml-3 text-sm font-medium text-gray-500">
                    {currentMode.group} / {currentMode.name}
                  </span>
                </span>
                <span aria-hidden="true" className="text-sm text-gray-500 group-open:hidden">開く</span>
                <span aria-hidden="true" className="hidden text-sm text-gray-500 group-open:inline">閉じる</span>
              </summary>
              <div className="px-4 pb-4">
                <p className="text-sm text-gray-500 mb-4">
                  このブラウザに保存します。サーバーには保存しません。
                </p>
                <ColorModePicker colorMode={colorMode} onChange={handleColorMode} />
              </div>
            </details>
          </section>

          <section className="mt-8">
            <h3 className="text-lg font-bold text-gray-800 mb-4">修了証の確認</h3>
            <CertificateList embedded />
          </section>
        </div>
      </main>
    </div>
  );
};

export default StudentAccountPage;
