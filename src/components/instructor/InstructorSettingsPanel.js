import React, { useEffect, useState } from 'react';
import SanitizedInput from '../SanitizedInput';
import { SANITIZE_OPTIONS } from '../../utils/sanitizeUtils';
import { API_BASE_URL } from '../../config/apiConfig';
import {
  getInstructorSpecializations,
  addInstructorSpecialization,
  updateInstructorSpecialization,
  deleteInstructorSpecialization,
  updateUser,
} from '../../utils/api';

const InstructorSettingsPanel = ({ user, onUserUpdated }) => {
  const [displayUser, setDisplayUser] = useState(user);
  const [showPasswordChangeForm, setShowPasswordChangeForm] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [passwordErrors, setPasswordErrors] = useState({});
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [specializations, setSpecializations] = useState([]);
  const [isEditingAccount, setIsEditingAccount] = useState(false);
  const [isUpdatingAccount, setIsUpdatingAccount] = useState(false);
  const [accountForm, setAccountForm] = useState({
    name: '',
    email: '',
    specializations: [],
  });

  useEffect(() => {
    setDisplayUser(user);
  }, [user]);

  const applyUserUpdate = (patch) => {
    const updatedUser = { ...displayUser, ...patch };
    setDisplayUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    if (onUserUpdated) onUserUpdated(patch);
  };

  const loadSpecializations = async () => {
    if (!user?.id) return;
    try {
      const response = await getInstructorSpecializations(user.id);
      if (response.success) {
        setSpecializations(response.data || []);
      }
    } catch (error) {
      console.error('専門分野の取得に失敗:', error);
    }
  };

  useEffect(() => {
    loadSpecializations();
  }, [user?.id]);

  const handleStartAccountEdit = () => {
    setAccountForm({
      name: displayUser?.name || '',
      email: displayUser?.email || '',
      specializations: [...specializations],
    });
    setIsEditingAccount(true);
  };

  const updateSpecializations = async (newSpecializations) => {
    const currentResponse = await getInstructorSpecializations(user.id);
    const currentSpecs = currentResponse.success ? currentResponse.data : [];
    const specsToDelete = currentSpecs.filter((current) => (
      !newSpecializations.some((newSpec) => newSpec.id === current.id)
    ));

    for (const spec of specsToDelete) {
      await deleteInstructorSpecialization(user.id, spec.id);
    }

    for (const spec of newSpecializations) {
      if (spec.id) {
        await updateInstructorSpecialization(user.id, spec.id, spec.specialization);
      } else {
        await addInstructorSpecialization(user.id, spec.specialization);
      }
    }
  };

  const handleAccountUpdate = async (event) => {
    event.preventDefault();
    if (!accountForm.name.trim()) {
      alert('名前は必須です。');
      return;
    }

    setIsUpdatingAccount(true);
    try {
      const response = await updateUser(user.id, {
        name: accountForm.name.trim(),
        email: accountForm.email.trim() || null,
      });

      if (!response.success) {
        alert(`アカウント情報の更新に失敗しました: ${response.message}`);
        return;
      }

      await updateSpecializations(accountForm.specializations);
      applyUserUpdate({
        name: accountForm.name.trim(),
        email: accountForm.email.trim() || null,
      });
      await loadSpecializations();
      setIsEditingAccount(false);
      alert('アカウント情報が更新されました。');
    } catch (error) {
      console.error('アカウント情報の更新に失敗:', error);
      alert('アカウント情報の更新に失敗しました。');
    } finally {
      setIsUpdatingAccount(false);
    }
  };

  const handleAddSpecializationInEdit = () => {
    if (!accountForm.newSpecialization || !accountForm.newSpecialization.trim()) return;
    setAccountForm((prev) => ({
      ...prev,
      specializations: [...prev.specializations, { specialization: prev.newSpecialization.trim() }],
      newSpecialization: '',
    }));
  };

  const handleRemoveSpecializationInEdit = (index) => {
    setAccountForm((prev) => ({
      ...prev,
      specializations: prev.specializations.filter((_, itemIndex) => itemIndex !== index),
    }));
  };

  const handlePasswordChange = async (currentPassword, newPassword) => {
    const token = localStorage.getItem('accessToken');
    const response = await fetch(`${API_BASE_URL}/api/users/${user.id}/change-password`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'パスワード変更に失敗しました');
    }
    alert('パスワードが正常に変更されました。');
    setShowPasswordChangeForm(false);
    applyUserUpdate({ passwordResetRequired: false });
  };

  const handlePasswordFormChange = (event) => {
    const { name, value } = event.target;
    setPasswordForm((prev) => ({ ...prev, [name]: value }));
    if (passwordErrors[name]) {
      setPasswordErrors((prev) => ({ ...prev, [name]: '' }));
    }
  };

  const validatePassword = (password) => {
    const errors = [];
    if (password.length < 8) errors.push('8文字以上で入力してください');
    if (!/[A-Z]/.test(password)) errors.push('大文字を含めてください');
    if (!/[a-z]/.test(password)) errors.push('小文字を含めてください');
    if (!/[0-9]/.test(password)) errors.push('数字を含めてください');
    return errors;
  };

  const handlePasswordFormSubmit = async (event) => {
    event.preventDefault();
    setPasswordErrors({});
    setIsChangingPassword(true);

    const errors = {};
    if (!passwordForm.currentPassword) {
      errors.currentPassword = '現在のパスワードを入力してください';
    }
    if (!passwordForm.newPassword) {
      errors.newPassword = '新しいパスワードを入力してください';
    } else {
      const passwordValidation = validatePassword(passwordForm.newPassword);
      if (passwordValidation.length > 0) {
        errors.newPassword = passwordValidation.join(', ');
      }
    }
    if (!passwordForm.confirmPassword) {
      errors.confirmPassword = 'パスワードの確認を入力してください';
    } else if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      errors.confirmPassword = 'パスワードが一致しません';
    }

    if (Object.keys(errors).length > 0) {
      setPasswordErrors(errors);
      setIsChangingPassword(false);
      return;
    }

    try {
      await handlePasswordChange(passwordForm.currentPassword, passwordForm.newPassword);
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setPasswordErrors({});
      setShowPasswordChangeForm(false);
    } catch (error) {
      console.error('パスワード変更に失敗:', error);
      alert(`パスワード変更に失敗しました: ${error.message}`);
    } finally {
      setIsChangingPassword(false);
    }
  };

  if (!displayUser) return null;

  return (
    <div className="rounded-lg bg-white p-8 shadow-lg">
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">個人設定</h2>
        <p className="text-lg text-gray-600">アカウント情報とセキュリティ設定を管理できます。</p>
      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-800">🏷️ アカウント情報</h3>
            <button
              type="button"
              onClick={isEditingAccount ? () => setIsEditingAccount(false) : handleStartAccountEdit}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white hover:bg-indigo-700"
            >
              {isEditingAccount ? 'キャンセル' : '編集'}
            </button>
          </div>

          {!isEditingAccount ? (
            <div className="grid grid-cols-2 gap-3 text-gray-700">
              <div>
                <span className="font-medium">個人トークン:</span>
                <span>{displayUser.login_code || displayUser.id || '未設定'}</span>
              </div>
              <div>
                <span className="font-medium">名前:</span>
                <span>{displayUser.name}</span>
              </div>
              <div>
                <span className="font-medium">メールアドレス:</span>
                <span>{displayUser.email}</span>
              </div>
              <div>
                <span className="font-medium">最終ログイン:</span>
                <span>{new Date().toLocaleDateString()}</span>
              </div>
              <div className="col-span-2">
                <span className="font-medium">専門分野:</span>
                <div className="mt-2">
                  {specializations.length > 0 ? (
                    <div className="space-y-1">
                      {specializations.map((spec) => (
                        <div key={spec.id} className="rounded border border-gray-200 bg-white p-2">
                          <span className="text-gray-700">{spec.specialization}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">専門分野が設定されていません</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleAccountUpdate} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  名前 <span className="text-red-500">*</span>
                </label>
                <SanitizedInput
                  type="text"
                  value={accountForm.name}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, name: event.target.value }))}
                  sanitizeMode={SANITIZE_OPTIONS.TEXT}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">メールアドレス</label>
                <SanitizedInput
                  type="email"
                  value={accountForm.email}
                  onChange={(event) => setAccountForm((prev) => ({ ...prev, email: event.target.value }))}
                  sanitizeMode={SANITIZE_OPTIONS.TEXT}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">専門分野</label>
                <div className="space-y-2">
                  {accountForm.specializations.map((spec, index) => (
                    <div key={spec.id || index} className="flex items-center gap-2">
                      <SanitizedInput
                        type="text"
                        value={spec.specialization}
                        onChange={(event) => {
                          const nextSpecs = [...accountForm.specializations];
                          nextSpecs[index].specialization = event.target.value;
                          setAccountForm((prev) => ({ ...prev, specializations: nextSpecs }));
                        }}
                        sanitizeMode={SANITIZE_OPTIONS.TEXT}
                        className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveSpecializationInEdit(index)}
                        className="rounded-md bg-red-600 px-3 py-2 text-white hover:bg-red-700"
                      >
                        削除
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <SanitizedInput
                      type="text"
                      value={accountForm.newSpecialization || ''}
                      onChange={(event) => setAccountForm((prev) => ({ ...prev, newSpecialization: event.target.value }))}
                      placeholder="新しい専門分野を入力"
                      sanitizeMode={SANITIZE_OPTIONS.TEXT}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={handleAddSpecializationInEdit}
                      disabled={!accountForm.newSpecialization || !accountForm.newSpecialization.trim()}
                      className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      追加
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={isUpdatingAccount}
                  className="rounded-md bg-indigo-600 px-4 py-2 text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isUpdatingAccount ? '更新中...' : '更新'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditingAccount(false)}
                  className="rounded-md bg-gray-300 px-4 py-2 text-gray-800 hover:bg-gray-400"
                >
                  キャンセル
                </button>
              </div>
            </form>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-semibold text-gray-800">🔐 パスワード変更</h3>
            {displayUser.passwordResetRequired && (
              <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                <span>⚠️</span>
                パスワードの変更が必要です
              </div>
            )}
          </div>

          {!showPasswordChangeForm ? (
            <div className="mb-4 text-gray-700">
              <p>指導員は自身のパスワードをいつでも変更できます。</p>
              <button
                type="button"
                className="mt-4 rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors duration-300 hover:bg-indigo-700"
                onClick={() => setShowPasswordChangeForm(true)}
              >
                パスワードを変更する
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h4 className="mb-4 text-lg font-medium text-gray-800">パスワード変更</h4>
              <form onSubmit={handlePasswordFormSubmit} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    現在のパスワード <span className="text-red-500">*</span>
                  </label>
                  <SanitizedInput
                    type="password"
                    name="currentPassword"
                    value={passwordForm.currentPassword}
                    onChange={handlePasswordFormChange}
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.currentPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                  />
                  {passwordErrors.currentPassword && (
                    <p className="mt-1 text-sm text-red-500">{passwordErrors.currentPassword}</p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    新しいパスワード <span className="text-red-500">*</span>
                  </label>
                  <SanitizedInput
                    type="password"
                    name="newPassword"
                    value={passwordForm.newPassword}
                    onChange={handlePasswordFormChange}
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.newPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                  />
                  {passwordErrors.newPassword && (
                    <p className="mt-1 text-sm text-red-500">{passwordErrors.newPassword}</p>
                  )}
                  <p className="mt-1 text-sm text-gray-500">パスワード要件: 8文字以上、大文字・小文字・数字を含む</p>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-gray-700">
                    新しいパスワード（確認） <span className="text-red-500">*</span>
                  </label>
                  <SanitizedInput
                    type="password"
                    name="confirmPassword"
                    value={passwordForm.confirmPassword}
                    onChange={handlePasswordFormChange}
                    sanitizeMode={SANITIZE_OPTIONS.NONE}
                    className={`w-full rounded-md border px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 ${passwordErrors.confirmPassword ? 'border-red-500 focus:ring-red-500' : 'border-gray-300'}`}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="mt-1 text-sm text-red-500">{passwordErrors.confirmPassword}</p>
                  )}
                </div>
                <div className="flex gap-3 pt-4">
                  <button
                    type="submit"
                    disabled={isChangingPassword}
                    className="rounded-md bg-indigo-600 px-4 py-2 text-white transition-colors duration-300 hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isChangingPassword ? '変更中...' : 'パスワードを変更'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowPasswordChangeForm(false)}
                    className="rounded-md bg-gray-300 px-4 py-2 text-gray-800 transition-colors duration-300 hover:bg-gray-400"
                  >
                    キャンセル
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>

        <div className="rounded-lg border border-gray-200 bg-gray-50 p-6">
          <h3 className="mb-4 text-xl font-semibold text-gray-800">🛡️ セキュリティ情報</h3>
          <div className="text-gray-700">
            <h4 className="mb-3 text-lg font-medium text-gray-800">パスワードセキュリティのヒント:</h4>
            <ul className="list-disc space-y-2 pl-5">
              <li>定期的にパスワードを変更してください</li>
              <li>他のサービスと同じパスワードを使用しないでください</li>
              <li>パスワードを他人と共有しないでください</li>
              <li>セッション終了時は必ずログアウトしてください</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InstructorSettingsPanel;
