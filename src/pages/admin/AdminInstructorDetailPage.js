import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
import { apiGet, apiPost, apiPut } from '../../utils/api';

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const satelliteIds = (user) => {
  if (Array.isArray(user?.satellite_details) && user.satellite_details.length > 0) {
    return user.satellite_details.map((office) => office?.id).filter((id) => id !== null && id !== undefined);
  }
  const raw = user?.satellite_ids;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  if (raw === null || raw === undefined || raw === '') return [];
  return [raw];
};

const officeNames = (user) => {
  if (Array.isArray(user?.satellite_details)) {
    return user.satellite_details.map((office) => office?.name).filter(Boolean);
  }
  return [];
};

const managerIdList = (value) => {
  if (value === null || value === undefined || value === '') return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [];
    }
  }
  return [value];
};

const errorText = (error, fallback) => {
  const details = error?.response?.data?.errors;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((item) => item.msg || item.message).filter(Boolean).join('、');
  }
  return error?.message || fallback;
};

const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const Field = ({ label, required, children, hint }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-gray-700">
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
    {hint && <span className="mt-1 block text-xs text-gray-500">{hint}</span>}
  </label>
);

const AdminInstructorDetailPage = () => {
  const { instructorId } = useParams();
  const [instructor, setInstructor] = useState(null);
  const [students, setStudents] = useState([]);
  const [specializations, setSpecializations] = useState([]);
  const [offices, setOffices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState(null);
  const [editMessage, setEditMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addOfficeIds, setAddOfficeIds] = useState([]);
  const [addMessage, setAddMessage] = useState('');
  const [addSaving, setAddSaving] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState('');
  const [tempPassword, setTempPassword] = useState('');
  const [tempOpen, setTempOpen] = useState(false);
  const [copyMessage, setCopyMessage] = useState('');
  const [actingKey, setActingKey] = useState('');
  const [usernameState, setUsernameState] = useState({ checking: false, valid: true, message: '', suggestions: [] });

  const applyLoaded = useCallback((userPayload, companyPayload, satellitePayload, specPayload) => {
    const users = asList(userPayload);
    const found = users.find((user) => String(user.id) === String(instructorId));
    const role = Number(found?.role);
    if (!found || Number.isNaN(role) || role < 4 || role > 8) {
      setPageError('指導員が見つかりません。');
      setInstructor(null);
      setStudents([]);
      setSpecializations([]);
      setOffices([]);
      return;
    }
    const company = asList(companyPayload).find((item) => String(item.id) === String(found.company_id));
    setInstructor({
      ...found,
      companyName: company?.name || found.satellite_details?.[0]?.company_name || '-',
      offices: officeNames(found),
    });
    const officeIds = new Set(satelliteIds(found).map((id) => String(id)));
    setStudents(users
      .filter((user) => {
        const userRole = Number(user.role);
        if (Number.isNaN(userRole) || userRole < 1 || userRole > 3) return false;
        return satelliteIds(user).some((id) => officeIds.has(String(id)));
      })
      .map((user) => ({
        id: user.id,
        name: user.name || '名称未設定',
        email: user.email || '-',
        offices: officeNames(user),
        instructorName: user.instructor_name || '未設定',
        mine: String(user.instructor_id) === String(instructorId),
      }))
      .sort((left, right) => {
        if (left.mine !== right.mine) return left.mine ? -1 : 1;
        return left.name.localeCompare(right.name, 'ja');
      }));
    setSpecializations(asList(specPayload).map((item) => item.specialization).filter(Boolean));
    const currentOfficeIds = new Set(satelliteIds(found).map((id) => String(id)));
    setOffices(asList(satellitePayload)
      .filter((office) => String(office.company_id) === String(found.company_id) || currentOfficeIds.has(String(office.id)))
      .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'ja')));
  }, [instructorId]);

  const reloadDetail = useCallback(async () => {
    const [userPayload, companyPayload, satellitePayload, specPayload] = await Promise.all([
      apiGet('/api/users'),
      apiGet('/api/companies'),
      apiGet('/api/satellites'),
      apiGet(`/api/users/${instructorId}/specializations`).catch(() => ({ data: [] })),
    ]);
    applyLoaded(userPayload, companyPayload, satellitePayload, specPayload);
  }, [applyLoaded, instructorId]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setPageError('');
        const [userPayload, companyPayload, satellitePayload, specPayload] = await Promise.all([
          apiGet('/api/users'),
          apiGet('/api/companies'),
          apiGet('/api/satellites'),
          apiGet(`/api/users/${instructorId}/specializations`).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        applyLoaded(userPayload, companyPayload, satellitePayload, specPayload);
      } catch (loadError) {
        if (!cancelled) setPageError(loadError?.message || '指導員情報を取得できませんでした。');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [applyLoaded, instructorId]);

  useEffect(() => {
    if (!editOpen || !draft) return undefined;
    const username = draft.username.trim();
    if (!username || username === (instructor?.username || '')) {
      setUsernameState({ checking: false, valid: true, message: '', suggestions: [] });
      return undefined;
    }
    if (!/^[a-zA-Z0-9_/.-]+$/.test(username)) {
      setUsernameState({
        checking: false,
        valid: false,
        message: '半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使えます。',
        suggestions: [],
      });
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setUsernameState((prev) => ({ ...prev, checking: true }));
      try {
        const result = await apiGet(`/api/username/check/${encodeURIComponent(username)}`);
        if (cancelled) return;
        let suggestions = [];
        if (result?.available === false) {
          const suggestionResult = await apiGet(`/api/username/suggestions/${encodeURIComponent(username)}`).catch(() => null);
          suggestions = Array.isArray(suggestionResult?.suggestions) ? suggestionResult.suggestions : [];
        }
        setUsernameState({
          checking: false,
          valid: result?.available === true,
          message: result?.message || '',
          suggestions,
        });
      } catch (checkError) {
        if (!cancelled) {
          setUsernameState({
            checking: false,
            valid: false,
            message: errorText(checkError, 'ユーザIDを確認できませんでした。'),
            suggestions: [],
          });
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [draft, editOpen, instructor?.username]);

  const openEdit = () => {
    setDraft({
      name: instructor.name || '',
      username: instructor.username || '',
      email: instructor.email || '',
      specialization: specializations.join('、'),
    });
    setEditMessage('');
    setUsernameState({ checking: false, valid: true, message: '', suggestions: [] });
    setEditOpen(true);
  };

  const saveEdit = async (event) => {
    event.preventDefault();
    if (!draft.name.trim() || !draft.username.trim() || !draft.email.trim()) {
      setEditMessage('指導員名、ユーザID、メールを入力してください。');
      return;
    }
    if (!/^[a-zA-Z0-9_/.-]+$/.test(draft.username.trim())) {
      setEditMessage('ユーザIDは半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使えます。');
      return;
    }
    if (usernameState.checking || usernameState.valid !== true) {
      setEditMessage(usernameState.valid === false ? 'このユーザIDは使えません。' : 'ユーザIDを確認しています。');
      return;
    }
    const specialization = draft.specialization
      .split(/[、,]/)
      .map((item) => item.trim())
      .filter(Boolean)
      .join(',');
    try {
      setSaving(true);
      setEditMessage('');
      const result = await apiPut(`/api/users/${instructorId}`, {
        name: draft.name.trim(),
        username: draft.username.trim(),
        email: draft.email.trim(),
        specialization,
      });
      if (result?.success === false) throw new Error(result.message || '保存に失敗しました。');
      setEditOpen(false);
      await reloadDetail();
      setNoticeIsError(false);
      setNotice('指導員情報を保存しました。');
    } catch (saveError) {
      setEditMessage(errorText(saveError, '保存に失敗しました。'));
    } finally {
      setSaving(false);
    }
  };

  const changeManager = async (office) => {
    const makeManager = !office.manager;
    const confirmed = window.confirm(makeManager
      ? `「${office.name}」の責任者にしますか？`
      : `「${office.name}」の責任者を解除しますか？`);
    if (!confirmed) return;
    try {
      setActingKey(`manager-${office.id}`);
      setNotice('');
      const mine = Number(instructorId);
      const currentIds = (office.managerIds || []).filter((id) => !Number.isNaN(Number(id))).map((id) => Number(id));
      const nextIds = makeManager
        ? Array.from(new Set([...currentIds, mine]))
        : currentIds.filter((id) => id !== mine);
      // 本番の管理者更新は、送った配列で責任者を置き換える。削除APIは既存の責任者を外さない。
      const result = await apiPut(`/api/satellites/${office.id}/managers`, { manager_ids: nextIds });
      if (result?.success === false) throw new Error(result.message || '責任者の更新に失敗しました。');
      await reloadDetail();
      setNoticeIsError(false);
      setNotice(makeManager ? `「${office.name}」の責任者にしました。` : `「${office.name}」の責任者を解除しました。`);
    } catch (changeError) {
      setNoticeIsError(true);
      setNotice(errorText(changeError, '責任者の更新に失敗しました。'));
    } finally {
      setActingKey('');
    }
  };

  const passwordResetRequired = Number(instructor?.password_reset_required) === 1;

  const runPasswordAction = async (action) => {
    try {
      setPasswordBusy(action);
      setNotice('');
      const result = await apiPost(`/api/users/${instructorId}/reset-password`, { action });
      if (result?.success === false) throw new Error(result.message || 'パスワードの更新に失敗しました。');
      if (action === 'issue_temp_password') {
        const issued = result?.data?.tempPassword || '';
        if (!issued) throw new Error('一時パスワードを取得できませんでした。');
        setTempPassword(issued);
        setCopyMessage('');
        setPasswordOpen(false);
        setTempOpen(true);
      }
      await reloadDetail();
      if (action === 'require_password_change') {
        setPasswordOpen(false);
        setNoticeIsError(false);
        setNotice('次回ログイン時のパスワード変更を要求しました。現在のパスワードはそのまま使えます。');
      }
    } catch (passwordError) {
      setNoticeIsError(true);
      setNotice(errorText(passwordError, 'パスワードの更新に失敗しました。'));
    } finally {
      setPasswordBusy('');
    }
  };

  const copyTempPassword = async () => {
    try {
      await navigator.clipboard.writeText(tempPassword);
      setCopyMessage('コピーしました。');
    } catch {
      setCopyMessage('コピーできませんでした。表示されているパスワードを選んでコピーしてください。');
    }
  };

  const openAddOffice = () => {
    setAddOfficeIds([]);
    setAddMessage('');
    setAddOpen(true);
  };

  const saveAddOffice = async (event) => {
    event.preventDefault();
    if (addOfficeIds.length === 0) {
      setAddMessage('追加する事業所を1つ以上選んでください。');
      return;
    }
    try {
      setAddSaving(true);
      setAddMessage('');
      const nextIds = Array.from(new Set([
        ...satelliteIds(instructor).map((id) => Number(id)),
        ...addOfficeIds.map((id) => Number(id)),
      ]));
      const result = await apiPut(`/api/users/${instructorId}`, { satellite_ids: nextIds });
      if (result?.success === false) throw new Error(result.message || '拠点の追加に失敗しました。');
      setAddOpen(false);
      await reloadDetail();
      setNoticeIsError(false);
      setNotice('拠点を追加しました。');
    } catch (addError) {
      setAddMessage(errorText(addError, '拠点の追加に失敗しました。'));
    } finally {
      setAddSaving(false);
    }
  };

  const restoreActive = async () => {
    if (!window.confirm('事業所が削除したユーザーです。本当にアクティブに戻しますか？')) return;
    try {
      setActingKey('restore');
      setNotice('');
      const result = await apiPut(`/api/users/${instructorId}`, { status: 1 });
      if (result?.success === false) throw new Error(result.message || 'アクティブへの復帰に失敗しました。');
      await reloadDetail();
      setNoticeIsError(false);
      setNotice('アクティブに戻しました。');
    } catch (restoreError) {
      setNoticeIsError(true);
      setNotice(errorText(restoreError, 'アクティブへの復帰に失敗しました。'));
    } finally {
      setActingKey('');
    }
  };

  const leaveOffice = async (office) => {
    if (office.manager) {
      setNoticeIsError(true);
      setNotice('責任者のあいだは所属を解除できません。先に責任者を解除してください。');
      return;
    }
    if (!window.confirm(`「${office.name}」への所属を解除しますか？`)) return;
    try {
      setActingKey(`leave-${office.id}`);
      setNotice('');
      const nextIds = satelliteIds(instructor)
        .map((id) => Number(id))
        .filter((id) => String(id) !== String(office.id));
      const result = await apiPut(`/api/users/${instructorId}`, { satellite_ids: nextIds });
      if (result?.success === false) throw new Error(result.message || '所属の解除に失敗しました。');
      await reloadDetail();
      setNoticeIsError(false);
      setNotice(`「${office.name}」への所属を解除しました。`);
    } catch (leaveError) {
      setNoticeIsError(true);
      setNotice(errorText(leaveError, '所属の解除に失敗しました。'));
    } finally {
      setActingKey('');
    }
  };

  const memberOffices = instructor
    ? satelliteIds(instructor)
      .map((id) => String(id))
      .map((id) => {
        const office = offices.find((item) => String(item.id) === id);
        const detail = Array.isArray(instructor.satellite_details)
          ? instructor.satellite_details.find((item) => String(item?.id) === id)
          : null;
        return {
          id,
          name: office?.name || detail?.name || '名称未設定',
          typeName: office?.office_type_name || detail?.office_type_name || office?.office_type_id || '-',
          managerIds: managerIdList(office?.manager_ids).map((managerId) => Number(managerId)).filter((managerId) => !Number.isNaN(managerId)),
          manager: managerIdList(office?.manager_ids).some((managerId) => String(managerId) === String(instructorId)),
        };
      })
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'))
    : [];

  const memberOfficeIds = new Set(memberOffices.map((office) => String(office.id)));
  const availableOffices = instructor
    ? offices
      .filter((office) => String(office.company_id) === String(instructor.company_id) && !memberOfficeIds.has(String(office.id)))
      .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'ja'))
    : [];

  return (
    <AdminOfficeLayout>
      <p>
        <Link to="/admin/instructors" className="text-sm text-sky-800 underline underline-offset-4">
          指導員一覧に戻る
        </Link>
      </p>
      <h1 className="mt-3 text-3xl font-bold text-gray-900">{instructor?.name || '指導員情報'}</h1>
      {notice && (
        <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>
      )}

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && pageError && <p className="mt-6 text-red-700">{pageError}</p>}

      {!loading && !pageError && instructor && (
        <div className="mt-6 max-w-5xl space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">指導員基本情報</h2>
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasswordOpen(true)}
                  className="rounded-lg border border-sky-200 px-4 py-2 text-sm font-semibold text-sky-800 hover:bg-sky-50"
                >
                  パスワード管理
                </button>
                <button
                  type="button"
                  onClick={openEdit}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  編集
                </button>
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">指導員名</dt><dd className="text-gray-900">{instructor.name || '-'}</dd></div>
              <div><dt className="text-gray-500">ユーザID</dt><dd className="text-gray-900">{instructor.username || '-'}</dd></div>
              <div><dt className="text-gray-500">メール</dt><dd className="text-gray-900">{instructor.email || '-'}</dd></div>
              <div><dt className="text-gray-500">企業名</dt><dd className="text-gray-900">{instructor.companyName}</dd></div>
              <div>
                <dt className="text-gray-500">ステータス</dt>
                <dd className="mt-1 flex flex-wrap items-center gap-2">
                  {Number(instructor.status) === 1 ? (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">アクティブ</span>
                  ) : (
                    <>
                      <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">論理削除済</span>
                      <button
                        type="button"
                        onClick={restoreActive}
                        disabled={actingKey !== ''}
                        className="rounded-lg bg-sky-600 px-3 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                      >
                        アクティブに戻す
                      </button>
                    </>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500">パスワード</dt>
                <dd className="mt-1">
                  {passwordResetRequired ? (
                    <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-800">変更要求</span>
                  ) : (
                    <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">正常</span>
                  )}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">専門分野</dt>
                <dd className="text-gray-900">{specializations.length > 0 ? specializations.join('、') : '未設定'}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">所属事業所一覧</h2>
              <button
                type="button"
                onClick={openAddOffice}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                拠点追加
              </button>
            </div>
            {memberOffices.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">所属している事業所はありません。</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-600">{memberOffices.length}拠点</p>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-sky-50 text-left text-sky-900">
                      <tr>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">事業所名</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">事業所タイプ</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">責任者</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {memberOffices.map((office) => (
                        <tr key={office.id}>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-800">
                            <Link
                              to={`/admin/locations/${office.id}`}
                              className="text-sky-800 underline underline-offset-4 hover:text-sky-950"
                            >
                              {office.name}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{office.typeName}</td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                            {office.manager ? '責任者' : '-'}
                          </td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => changeManager(office)}
                                disabled={actingKey !== ''}
                                className="rounded-lg border border-sky-200 px-3 py-1 text-xs font-semibold text-sky-800 hover:bg-sky-50 disabled:opacity-50"
                              >
                                {office.manager ? '責任者を解除' : '責任者にする'}
                              </button>
                              <button
                                type="button"
                                onClick={() => leaveOffice(office)}
                                disabled={office.manager || actingKey !== ''}
                                title={office.manager ? '責任者を解除してから所属を解除できます。' : undefined}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                所属を解除
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <h2 className="text-xl font-bold text-gray-900">利用者一覧</h2>
            <p className="mt-2 text-sm text-gray-600">
              自分の担当 {students.filter((student) => student.mine).length}名 / 全{students.length}名
            </p>
            {students.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">所属している事業所の利用者はいません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">利用者名</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">メール</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">所属事業所</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">担当指導員</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => (
                      <tr key={student.id} className={student.mine ? 'bg-sky-50/70' : undefined}>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{student.name}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{student.email}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">
                          {student.offices.length > 0 ? student.offices.join('、') : '未設定'}
                        </td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{student.instructorName}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {editOpen && draft && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">指導員情報の編集</h2>
              <button
                type="button"
                onClick={() => setEditOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={saveEdit}>
              <Field label="指導員名" required>
                <input
                  className={fieldClass}
                  value={draft.name}
                  onChange={(event) => setDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="ユーザID" required hint="半角英数字、アンダースコア、ハイフン、スラッシュ、ドット">
                <input
                  className={fieldClass}
                  value={draft.username}
                  onChange={(event) => setDraft((prev) => ({ ...prev, username: event.target.value }))}
                />
                {usernameState.checking && <span className="mt-1 block text-xs text-gray-500">確認中...</span>}
                {usernameState.message && (
                  <span className={`mt-1 block text-xs ${usernameState.valid ? 'text-green-700' : 'text-red-700'}`}>
                    {usernameState.message}
                  </span>
                )}
                {usernameState.suggestions.length > 0 && (
                  <span className="mt-2 flex flex-wrap gap-2">
                    {usernameState.suggestions.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        onClick={() => setDraft((prev) => ({ ...prev, username: suggestion }))}
                        className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800"
                      >
                        {suggestion}
                      </button>
                    ))}
                  </span>
                )}
              </Field>
              <Field label="メール" required>
                <input
                  type="email"
                  className={fieldClass}
                  value={draft.email}
                  onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
                />
              </Field>
              <div>
                <span className="mb-2 block text-sm font-semibold text-gray-700">企業名</span>
                <p className="text-sm text-gray-900">{instructor.companyName}</p>
              </div>
              <Field label="専門分野" hint="複数あるときは、読点かカンマで区切ります。">
                <input
                  className={fieldClass}
                  value={draft.specialization}
                  onChange={(event) => setDraft((prev) => ({ ...prev, specialization: event.target.value }))}
                />
              </Field>
              {editMessage && <p className="text-sm text-red-700">{editMessage}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setEditOpen(false)}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {passwordOpen && instructor && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">パスワード管理</h2>
              <button
                type="button"
                onClick={() => setPasswordOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg bg-sky-50 p-5">
                <h3 className="text-lg font-semibold text-gray-900">一時パスワード発行</h3>
                <p className="mt-2 text-sm text-gray-600">新しい一時パスワードを発行します。指導員は次回ログイン時に新しいパスワードを設定する必要があります。</p>
                <button
                  type="button"
                  onClick={() => runPasswordAction('issue_temp_password')}
                  disabled={passwordBusy !== ''}
                  className="mt-4 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  一時パスワードを発行
                </button>
              </div>
              <div className="rounded-lg bg-amber-50 p-5">
                <h3 className="text-lg font-semibold text-gray-900">パスワード変更要求</h3>
                <p className="mt-2 text-sm text-gray-600">次回ログイン時のパスワード変更を要求します。現在のパスワードは無効になりません。</p>
                <button
                  type="button"
                  onClick={() => runPasswordAction('require_password_change')}
                  disabled={passwordBusy !== ''}
                  className="mt-4 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                >
                  パスワード変更を要求
                </button>
              </div>
            </div>
            <p className="mt-4 rounded-lg bg-sky-50 px-4 py-3 text-sm text-sky-900">
              パスワードリセット要求: {passwordResetRequired ? 'あり' : 'なし'}
            </p>
          </div>
        </div>
      )}

      {tempOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl">
            <h2 className="text-center text-2xl font-bold text-gray-900">一時パスワード発行完了</h2>
            <p className="mt-3 text-center text-sm text-gray-600">
              {instructor?.name || '指導員'} の一時パスワードを発行しました。
            </p>
            <label className="mt-5 block text-sm font-semibold text-gray-700">
              一時パスワード
              <input
                type="text"
                readOnly
                value={tempPassword}
                className="mt-2 w-full rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-center font-mono text-lg text-gray-900"
              />
            </label>
            {copyMessage && <p className="mt-2 text-center text-sm text-sky-800">{copyMessage}</p>}
            <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              このパスワードは一度だけ表示されます。指導員に安全に伝えてください。
            </p>
            <div className="mt-5 flex gap-3">
              <button
                type="button"
                onClick={copyTempPassword}
                className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700"
              >
                コピー
              </button>
              <button
                type="button"
                onClick={() => {
                  setTempOpen(false);
                  setTempPassword('');
                  setCopyMessage('');
                }}
                className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">拠点追加</h2>
              <button
                type="button"
                onClick={() => setAddOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={saveAddOffice}>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-700">追加する事業所</legend>
                <div className="max-h-60 space-y-2 overflow-y-auto rounded-lg border border-sky-200 p-3">
                  {availableOffices.length === 0 ? (
                    <p className="text-sm text-gray-600">追加できる事業所はありません。</p>
                  ) : availableOffices.map((office) => (
                    <label key={office.id} className="flex items-center gap-2 text-sm text-gray-800">
                      <input
                        type="checkbox"
                        checked={addOfficeIds.includes(String(office.id))}
                        onChange={(event) => setAddOfficeIds((prev) => (
                          event.target.checked
                            ? [...prev, String(office.id)]
                            : prev.filter((id) => id !== String(office.id))
                        ))}
                      />
                      {office.name || '名称未設定'}
                    </label>
                  ))}
                </div>
              </fieldset>
              {addMessage && <p className="text-sm text-red-700">{addMessage}</p>}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setAddOpen(false)}
                  className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={addSaving || availableOffices.length === 0}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50"
                >
                  追加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AdminOfficeLayout>
  );
};

export default AdminInstructorDetailPage;
