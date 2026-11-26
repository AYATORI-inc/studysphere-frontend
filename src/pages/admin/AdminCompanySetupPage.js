import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
import { apiDelete, apiGet, apiPost, apiPut } from '../../utils/api';

const invalidExpiryValues = new Set([
  '',
  '0000-00-00 00:00:00',
  '0000-00-00',
  'null',
  'undefined',
  'NULL',
  'None',
]);

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const errorText = (error, fallback) => {
  const details = error?.response?.data?.errors;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((item) => item.msg || item.message).filter(Boolean).join('、');
  }
  return error?.message || fallback;
};

const formatExpiry = (value) => {
  if (value === null || value === undefined) return '期限なし';
  const text = String(value).trim();
  if (invalidExpiryValues.has(text)) return '期限なし';
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '期限なし';
  return parsed.toLocaleDateString('ja-JP');
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

const createLoginCode = () => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const part = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  return `${part()}-${part()}-${part()}`;
};

const emptyInstructorForm = {
  name: '',
  username: '',
  email: '',
  department: '',
  password: '',
  officeIds: [],
  managerOfficeIds: [],
};

const emptyOfficeForm = {
  name: '',
  officeType: '',
  address: '',
  phone: '',
  contractType: '30days',
  maxUsers: '10',
};

const satelliteIdList = (user) => {
  if (Array.isArray(user?.satellite_details)) {
    return user.satellite_details.map((satellite) => satellite.id).filter((id) => id !== null && id !== undefined);
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

const buildCompanyPeople = (companyId, satellitePayload, userPayload) => {
  const users = asList(userPayload);
  const nameById = {};
  users.forEach((user) => {
    if (user?.id !== undefined && user?.name) nameById[String(user.id)] = user.name;
  });
  const offices = asList(satellitePayload)
    .filter((office) => String(office.company_id) === String(companyId))
    .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'ja'));
  const officeIds = new Set(offices.map((office) => String(office.id)));
  const officeNameById = new Map(offices.map((office) => [String(office.id), office.name || '名称未設定']));
  const instructors = users
    .filter((user) => {
      const role = Number(user.role);
      if (Number.isNaN(role) || role < 4 || role > 8) return false;
      if (String(user.company_id) === String(companyId)) return true;
      return satelliteIdList(user).some((id) => officeIds.has(String(id)));
    })
    .map((user) => {
      const names = Array.isArray(user.satellite_details)
        ? user.satellite_details.map((satellite) => satellite.name).filter(Boolean)
        : satelliteIdList(user).map((id) => officeNameById.get(String(id))).filter(Boolean);
      return {
        id: user.id,
        name: user.name || '名称未設定',
        username: user.username || '-',
        email: user.email || '-',
        offices: names,
      };
    })
    .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  const memberCount = users.filter((user) => String(user.company_id) === String(companyId)).length;
  return { nameById, offices, instructors, memberCount };
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

const AdminCompanySetupPage = () => {
  const { companyId } = useParams();
  const navigate = useNavigate();
  const isNew = !companyId;
  const [companyForm, setCompanyForm] = useState({ name: '', address: '', phone: '' });
  const [companyDraft, setCompanyDraft] = useState({ name: '', address: '', phone: '' });
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyToken, setCompanyToken] = useState('');
  const [offices, setOffices] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [userNames, setUserNames] = useState({});
  const [officeTypes, setOfficeTypes] = useState([]);
  const [officeOpen, setOfficeOpen] = useState(false);
  const [officeForm, setOfficeForm] = useState(emptyOfficeForm);
  const [officeMessage, setOfficeMessage] = useState('');
  const [officeMessageIsError, setOfficeMessageIsError] = useState(false);
  const [officeSaving, setOfficeSaving] = useState(false);
  const [instructorOpen, setInstructorOpen] = useState(false);
  const [instructorForm, setInstructorForm] = useState(emptyInstructorForm);
  const [instructorMessage, setInstructorMessage] = useState('');
  const [instructorMessageIsError, setInstructorMessageIsError] = useState(false);
  const [instructorSaving, setInstructorSaving] = useState(false);
  const [usernameState, setUsernameState] = useState({ checking: false, valid: null, message: '', suggestions: [] });
  const [loading, setLoading] = useState(!isNew);
  const [pageError, setPageError] = useState('');
  const [message, setMessage] = useState('');
  const [messageIsError, setMessageIsError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showDeletes, setShowDeletes] = useState(false);
  const [memberCount, setMemberCount] = useState(0);
  const [deletingKey, setDeletingKey] = useState('');

  useEffect(() => {
    if (isNew) return undefined;
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setPageError('');
        const [companyPayload, satellitePayload, userPayload, typePayload] = await Promise.all([
          apiGet('/api/companies'),
          apiGet('/api/satellites'),
          apiGet('/api/users'),
          apiGet('/api/office-types'),
        ]);
        if (cancelled) return;
        setOfficeTypes(asList(typePayload).filter((item) => item?.type));
        const found = asList(companyPayload).find((item) => String(item.id) === String(companyId));
        if (!found) {
          setPageError('企業が見つかりません。');
          return;
        }
        const people = buildCompanyPeople(companyId, satellitePayload, userPayload);
        setUserNames(people.nameById);
        setCompanyForm({
          name: found.name || '',
          address: found.address || '',
          phone: found.phone || '',
        });
        setCompanyToken(found.token || '');
        setOffices(people.offices);
        setInstructors(people.instructors);
        setMemberCount(people.memberCount);
      } catch (loadError) {
        if (!cancelled) setPageError(errorText(loadError, '読み込みに失敗しました。'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [companyId, isNew]);

  const officeRows = useMemo(() => offices.map((office) => {
    const managerNames = managerIdList(office.manager_ids)
      .map((id) => userNames[String(id)])
      .filter(Boolean);
    return {
      id: office.id,
      name: office.name || '名称未設定',
      typeName: office.office_type_name || office.office_type_id || '-',
      users: `${office.current_users || 0} / ${office.max_users || 0}人`,
      expiry: formatExpiry(office.token_expiry_at),
      managers: managerNames.length > 0 ? managerNames.join('、') : '未設定',
    };
  }), [offices, userNames]);

  const openOfficeModal = () => {
    setOfficeForm(emptyOfficeForm);
    setOfficeMessage('');
    setOfficeMessageIsError(false);
    setOfficeOpen(true);
  };

  const saveOffice = async (event) => {
    event.preventDefault();
    if (!officeForm.name.trim() || !officeForm.officeType || !officeForm.contractType || !officeForm.maxUsers) {
      setOfficeMessageIsError(true);
      setOfficeMessage('事業所名、事業所タイプ、契約コース、利用者上限数を入力してください。');
      return;
    }
    const maxUsers = Number(officeForm.maxUsers);
    if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 10000) {
      setOfficeMessageIsError(true);
      setOfficeMessage('利用者上限数は1から10000の整数です。');
      return;
    }
    try {
      setOfficeSaving(true);
      setOfficeMessage('');
      const result = await apiPost('/api/satellites', {
        company_id: companyId,
        name: officeForm.name.trim(),
        address: officeForm.address.trim() || null,
        phone: officeForm.phone.trim() || null,
        office_type_id: officeForm.officeType,
        contract_type: officeForm.contractType,
        max_users: maxUsers,
      });
      if (result?.success === false) {
        throw new Error(result.message || '事業所の作成に失敗しました。');
      }
      const satellitePayload = await apiGet('/api/satellites');
      setOffices(asList(satellitePayload)
        .filter((office) => String(office.company_id) === String(companyId))
        .sort((left, right) => (left.name || '').localeCompare(right.name || '', 'ja')));
      const token = result?.data?.token;
      const expiry = result?.data?.token_expiry_at;
      setOfficeMessageIsError(false);
      setOfficeMessage(token
        ? `事業所を追加しました。トークン ${token}${expiry ? `、有効期限 ${formatExpiry(expiry)}` : ''}。`
        : '事業所を追加しました。');
      setOfficeForm(emptyOfficeForm);
    } catch (saveError) {
      setOfficeMessageIsError(true);
      setOfficeMessage(errorText(saveError, '事業所の作成に失敗しました。'));
    } finally {
      setOfficeSaving(false);
    }
  };

  const refreshPeople = async () => {
    const [satellitePayload, userPayload] = await Promise.all([
      apiGet('/api/satellites'),
      apiGet('/api/users'),
    ]);
    const people = buildCompanyPeople(companyId, satellitePayload, userPayload);
    setUserNames(people.nameById);
    setOffices(people.offices);
    setInstructors(people.instructors);
    setMemberCount(people.memberCount);
  };

  useEffect(() => {
    if (!instructorOpen) return undefined;
    const username = instructorForm.username.trim();
    if (!/^[a-zA-Z0-9_/.-]+$/.test(username)) {
      setUsernameState({
        checking: false,
        valid: username ? false : null,
        message: username ? '半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使えます。' : '',
        suggestions: [],
      });
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setUsernameState((prev) => ({ ...prev, checking: true }));
      try {
        const response = await apiGet(`/api/username/check/${encodeURIComponent(username)}`);
        if (cancelled) return;
        let suggestions = [];
        if (response?.success && response.available === false) {
          const suggestionResponse = await apiGet(`/api/username/suggestions/${encodeURIComponent(username)}`);
          suggestions = suggestionResponse?.suggestions || [];
        }
        if (cancelled) return;
        setUsernameState({
          checking: false,
          valid: Boolean(response?.available),
          message: response?.message || '',
          suggestions,
        });
      } catch {
        if (!cancelled) {
          setUsernameState({
            checking: false,
            valid: false,
            message: 'ユーザIDの確認に失敗しました。',
            suggestions: [],
          });
        }
      }
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [instructorForm.username, instructorOpen]);

  const sameId = (left, right) => String(left) === String(right);

  const deleteCompany = async () => {
    if (memberCount > 0) return;
    const officeNote = offices.length > 0
      ? '\n事業所が残っています。サーバーは事業所の有無を見ていないため、一緒に削除されることがあります。'
      : '';
    if (!window.confirm(`「${companyForm.name}」を削除しますか？\nこの操作は取り消せません。${officeNote}`)) return;
    try {
      setDeletingKey('company');
      const result = await apiDelete(`/api/companies/${companyId}`);
      if (result?.success === false) {
        throw new Error(result.message || '企業の削除に失敗しました。');
      }
      navigate('/admin/companies');
    } catch (deleteError) {
      setMessageIsError(true);
      setMessage(errorText(deleteError, '企業の削除に失敗しました。'));
    } finally {
      setDeletingKey('');
    }
  };

  const deleteOffice = async (office) => {
    if (!window.confirm(`「${office.name}」を削除しますか？\nこの操作は取り消せません。\n所属ユーザーがいる場合は削除できません。`)) return;
    try {
      setDeletingKey(`office-${office.id}`);
      const result = await apiDelete(`/api/satellites/${office.id}`);
      if (result?.success === false) {
        throw new Error(result.message || '事業所の削除に失敗しました。');
      }
      await refreshPeople();
      setMessageIsError(false);
      setMessage('事業所を削除しました。');
    } catch (deleteError) {
      setMessageIsError(true);
      setMessage(errorText(deleteError, '事業所の削除に失敗しました。'));
    } finally {
      setDeletingKey('');
    }
  };

  const deleteInstructor = async (instructor) => {
    if (!window.confirm(`指導員「${instructor.name}」を削除しますか？\nこの操作は取り消せません。`)) return;
    try {
      setDeletingKey(`instructor-${instructor.id}`);
      const result = await apiDelete(`/api/users/${instructor.id}`);
      if (result?.success === false) {
        throw new Error(result.message || '指導員の削除に失敗しました。');
      }
      for (const office of offices) {
        const current = managerIdList(office.manager_ids);
        if (!current.some((id) => sameId(id, instructor.id))) continue;
        const nextManagers = current.filter((id) => !sameId(id, instructor.id));
        await apiPut(`/api/satellites/${office.id}/managers`, { manager_ids: nextManagers });
      }
      await refreshPeople();
      setMessageIsError(false);
      setMessage('指導員を削除しました。');
    } catch (deleteError) {
      setMessageIsError(true);
      setMessage(errorText(deleteError, '指導員の削除に失敗しました。'));
    } finally {
      setDeletingKey('');
    }
  };

  const openInstructorModal = () => {
    setInstructorForm(emptyInstructorForm);
    setInstructorMessage('');
    setInstructorMessageIsError(false);
    setUsernameState({ checking: false, valid: null, message: '', suggestions: [] });
    setInstructorOpen(true);
  };

  const saveInstructor = async (event) => {
    event.preventDefault();
    if (!instructorForm.name.trim()) {
      setInstructorMessageIsError(true);
      setInstructorMessage('指導員名を入力してください。');
      return;
    }
    if (!/^[a-zA-Z0-9_/.-]+$/.test(instructorForm.username)) {
      setInstructorMessageIsError(true);
      setInstructorMessage('ユーザIDは半角英数字、アンダースコア、ハイフン、スラッシュ、ドットのみ使えます。');
      return;
    }
    if (usernameState.checking || usernameState.valid !== true) {
      setInstructorMessageIsError(true);
      setInstructorMessage(usernameState.valid === false ? 'このユーザIDは使えません。' : 'ユーザIDを確認しています。');
      return;
    }
    if (!instructorForm.email.trim() || !instructorForm.department.trim()) {
      setInstructorMessageIsError(true);
      setInstructorMessage('メールアドレスと専門分野を入力してください。');
      return;
    }
    if (offices.length === 0 || instructorForm.officeIds.length === 0) {
      setInstructorMessageIsError(true);
      setInstructorMessage(offices.length === 0
        ? '先に事業所を作成してください。'
        : '所属する事業所を1つ以上選んでください。');
      return;
    }
    if (instructorForm.password.length < 6) {
      setInstructorMessageIsError(true);
      setInstructorMessage('初期パスワードは6文字以上です。');
      return;
    }
    try {
      setInstructorSaving(true);
      setInstructorMessage('');
      const result = await apiPost('/api/users/create', {
        name: instructorForm.name.trim(),
        username: instructorForm.username.trim(),
        password: instructorForm.password,
        role: 4,
        status: 1,
        login_code: createLoginCode(),
        company_id: Number(companyId),
        satellite_ids: instructorForm.officeIds,
        email: instructorForm.email.trim(),
      });
      if (result?.success === false) {
        throw new Error(result.message || '指導員の追加に失敗しました。');
      }
      const userId = result?.data?.id;
      if (instructorForm.department.trim() && userId) {
        await apiPost(`/api/instructors/${userId}/specializations`, {
          specializations: [instructorForm.department.trim()],
        });
      }
      for (const officeId of instructorForm.managerOfficeIds) {
        const office = offices.find((item) => sameId(item.id, officeId));
        const current = managerIdList(office?.manager_ids);
        const nextManagers = current.some((id) => sameId(id, userId)) ? current : [...current, userId];
        await apiPut(`/api/satellites/${officeId}/managers`, { manager_ids: nextManagers });
      }
      await refreshPeople();
      setInstructorForm(emptyInstructorForm);
      setUsernameState({ checking: false, valid: null, message: '', suggestions: [] });
      setInstructorMessageIsError(false);
      setInstructorMessage('指導員を追加しました。');
    } catch (saveError) {
      setInstructorMessageIsError(true);
      setInstructorMessage(errorText(saveError, '指導員の追加に失敗しました。'));
    } finally {
      setInstructorSaving(false);
    }
  };

  const openCompanyEdit = () => {
    setCompanyDraft({
      name: companyForm.name,
      address: companyForm.address,
      phone: companyForm.phone,
    });
    setMessage('');
    setMessageIsError(false);
    setCompanyOpen(true);
  };

  const saveCompany = async (event, source) => {
    event.preventDefault();
    const form = source || companyForm;
    if (!form.name.trim()) {
      setMessageIsError(true);
      setMessage('企業名を入力してください。');
      return;
    }
    const payload = {
      name: form.name.trim(),
      address: form.address.trim() || (isNew ? null : ''),
      phone: form.phone.trim() || (isNew ? null : ''),
    };
    try {
      setSaving(true);
      setMessage('');
      const result = isNew
        ? await apiPost('/api/companies', payload)
        : await apiPut(`/api/companies/${companyId}`, payload);
      if (result?.success === false) {
        throw new Error(result.message || '企業の保存に失敗しました。');
      }
      if (isNew) {
        const createdId = result?.data?.id || result?.id;
        if (createdId) {
          navigate(`/admin/companies/${createdId}/setup`);
          return;
        }
      }
      setCompanyForm({
        name: payload.name,
        address: form.address.trim(),
        phone: form.phone.trim(),
      });
      setCompanyOpen(false);
      setMessageIsError(false);
      setMessage(isNew ? '企業を作成しました。' : '企業情報を保存しました。');
    } catch (saveError) {
      setMessageIsError(true);
      setMessage(errorText(saveError, '企業の保存に失敗しました。'));
    } finally {
      setSaving(false);
    }
  };

  const updatePhone = (value) => {
    setCompanyForm((prev) => ({ ...prev, phone: value.replace(/[^0-9-]/g, '') }));
  };

  return (
    <AdminOfficeLayout>
      <h1 className="text-3xl font-bold text-gray-900">{isNew ? '新規企業追加' : (companyForm.name || '企業情報編集')}</h1>
      <p className="mt-3">
        <Link to="/admin/companies" className="text-sm text-sky-800 underline underline-offset-4">
          企業一覧に戻る
        </Link>
      </p>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && pageError && <p className="mt-6 text-red-700">{pageError}</p>}

      {!loading && !pageError && !isNew && (
        <label className="mt-6 flex w-fit items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={showDeletes}
            onChange={(event) => setShowDeletes(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-sky-600"
          />
          削除ボタンの表示
        </label>
      )}

      {!loading && !pageError && (
        <div className={`max-w-4xl space-y-6 ${isNew ? 'mt-6' : 'mt-4'}`}>
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            {isNew ? (
              <>
                <h2 className="text-xl font-bold text-gray-900">企業</h2>
                <form className="mt-4 space-y-4" onSubmit={saveCompany}>
                  <Field label="企業名" required>
                    <input
                      className={fieldClass}
                      value={companyForm.name}
                      onChange={(event) => setCompanyForm((prev) => ({ ...prev, name: event.target.value }))}
                    />
                  </Field>
                  <Field label="住所">
                    <input
                      className={fieldClass}
                      value={companyForm.address}
                      onChange={(event) => setCompanyForm((prev) => ({ ...prev, address: event.target.value }))}
                    />
                  </Field>
                  <Field label="電話番号" hint="数字とハイフンのみ">
                    <input
                      className={fieldClass}
                      value={companyForm.phone}
                      placeholder="03-1234-5678"
                      onChange={(event) => updatePhone(event.target.value)}
                    />
                  </Field>
                  {message && (
                    <p className={`text-sm ${messageIsError ? 'text-red-700' : 'text-green-700'}`}>{message}</p>
                  )}
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-lg bg-sky-600 px-6 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                  >
                    企業を追加
                  </button>
                </form>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="text-xl font-bold text-gray-900">企業情報</h2>
                  <button
                    type="button"
                    onClick={openCompanyEdit}
                    className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                  >
                    編集
                  </button>
                </div>
                <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  <div><dt className="text-gray-500">企業名</dt><dd className="text-gray-900">{companyForm.name || '-'}</dd></div>
                  <div><dt className="text-gray-500">電話番号</dt><dd className="text-gray-900">{companyForm.phone || '-'}</dd></div>
                  <div className="sm:col-span-2"><dt className="text-gray-500">住所</dt><dd className="text-gray-900">{companyForm.address || '-'}</dd></div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">企業トークン</dt>
                    <dd className="font-mono tracking-wide text-gray-900">{companyToken || '未発行'}</dd>
                  </div>
                </dl>
                {message && !companyOpen && (
                  <p className={`mt-4 text-sm ${messageIsError ? 'text-red-700' : 'text-green-700'}`}>{message}</p>
                )}
                {showDeletes && (
                  <div className="mt-4 border-t border-sky-100 pt-4">
                    <button
                      type="button"
                      onClick={deleteCompany}
                      disabled={memberCount > 0 || deletingKey === 'company'}
                      className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      企業を削除
                    </button>
                    <p className="mt-2 text-xs text-gray-500">
                      {memberCount > 0
                        ? '所属ユーザーがいるため削除できません。指導員だけでなく利用者も対象です。'
                        : '所属ユーザーがいないときに削除できます。'}
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          {!isNew && (
            <section className="rounded-2xl border border-sky-100 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-gray-900">事業所リスト</h2>
                <button
                  type="button"
                  onClick={openOfficeModal}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  事業所追加
                </button>
              </div>
              {officeRows.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">事業所はありません。</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-sky-50 text-left text-sky-900">
                      <tr>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">事業所名</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">事業所タイプ</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">利用者数</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">有効期限</th>
                        <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">責任者</th>
                        {showDeletes && <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {officeRows.map((office) => (
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
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{office.users}</td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{office.expiry}</td>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{office.managers}</td>
                          {showDeletes && (
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3">
                              <button
                                type="button"
                                onClick={() => deleteOffice(office)}
                                disabled={deletingKey === `office-${office.id}`}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                削除
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {!isNew && (
            <section className="rounded-2xl border border-sky-100 bg-white p-5">
              <div className="flex items-center justify-between gap-4">
                <h2 className="text-xl font-bold text-gray-900">指導員リスト</h2>
                <button
                  type="button"
                  onClick={openInstructorModal}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  指導員追加
                </button>
              </div>
              {instructors.length === 0 ? (
                <p className="mt-4 text-sm text-gray-600">指導員はいません。</p>
              ) : (
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full border-collapse text-sm">
                    <thead className="bg-sky-50 text-left text-sky-900">
                      <tr>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">指導員名</th>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">ユーザID</th>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">メールアドレス</th>
                        <th className="border-b border-sky-100 px-4 py-3 font-semibold">所属事業所</th>
                        {showDeletes && <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">操作</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {instructors.map((instructor) => (
                        <tr key={instructor.id}>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{instructor.name}</td>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.username}</td>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.email}</td>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-700">
                            {instructor.offices.length > 0 ? instructor.offices.join('、') : '-'}
                          </td>
                          {showDeletes && (
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3">
                              <button
                                type="button"
                                onClick={() => deleteInstructor(instructor)}
                                disabled={deletingKey === `instructor-${instructor.id}`}
                                className="rounded-lg border border-red-200 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                              >
                                削除
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {companyOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">企業情報の編集</h2>
              <button
                type="button"
                onClick={() => setCompanyOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={(event) => saveCompany(event, companyDraft)}>
              <Field label="企業名" required>
                <input
                  className={fieldClass}
                  value={companyDraft.name}
                  onChange={(event) => setCompanyDraft((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="住所">
                <input
                  className={fieldClass}
                  value={companyDraft.address}
                  onChange={(event) => setCompanyDraft((prev) => ({ ...prev, address: event.target.value }))}
                />
              </Field>
              <Field label="電話番号" hint="数字とハイフンのみ">
                <input
                  className={fieldClass}
                  value={companyDraft.phone}
                  placeholder="03-1234-5678"
                  onChange={(event) => setCompanyDraft((prev) => ({ ...prev, phone: event.target.value.replace(/[^0-9-]/g, '') }))}
                />
              </Field>
              {message && (
                <p className={`text-sm ${messageIsError ? 'text-red-700' : 'text-green-700'}`}>{message}</p>
              )}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setCompanyOpen(false)}
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

      {officeOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">事業所追加</h2>
              <button
                type="button"
                onClick={() => setOfficeOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={saveOffice}>
              <Field label="事業所名" required>
                <input
                  className={fieldClass}
                  value={officeForm.name}
                  onChange={(event) => setOfficeForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="事業所タイプ" required>
                <select
                  className={fieldClass}
                  value={officeForm.officeType}
                  onChange={(event) => setOfficeForm((prev) => ({ ...prev, officeType: event.target.value }))}
                >
                  <option value="">選択してください</option>
                  {officeTypes.map((type) => (
                    <option key={type.id} value={type.type}>{type.type}</option>
                  ))}
                </select>
              </Field>
              <Field label="住所">
                <input
                  className={fieldClass}
                  value={officeForm.address}
                  onChange={(event) => setOfficeForm((prev) => ({ ...prev, address: event.target.value }))}
                />
              </Field>
              <Field label="電話番号" hint="数字とハイフンのみ">
                <input
                  className={fieldClass}
                  value={officeForm.phone}
                  placeholder="03-1234-5678"
                  onChange={(event) => setOfficeForm((prev) => ({
                    ...prev,
                    phone: event.target.value.replace(/[^0-9-]/g, ''),
                  }))}
                />
              </Field>
              <Field label="契約コース" required>
                <select
                  className={fieldClass}
                  value={officeForm.contractType}
                  onChange={(event) => setOfficeForm((prev) => ({ ...prev, contractType: event.target.value }))}
                >
                  <option value="30days">30日コース</option>
                  <option value="90days">90日コース</option>
                  <option value="1year">1年コース</option>
                </select>
              </Field>
              <Field label="利用者上限数" required hint="1から10000">
                <input
                  type="number"
                  min="1"
                  max="10000"
                  className={fieldClass}
                  value={officeForm.maxUsers}
                  onChange={(event) => setOfficeForm((prev) => ({ ...prev, maxUsers: event.target.value }))}
                />
              </Field>
              {officeMessage && (
                <p className={`text-sm ${officeMessageIsError ? 'text-red-700' : 'text-green-700'}`}>{officeMessage}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setOfficeOpen(false)}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={officeSaving}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                >
                  追加
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {instructorOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">指導員追加</h2>
              <button
                type="button"
                onClick={() => setInstructorOpen(false)}
                className="text-2xl font-bold text-gray-500 hover:text-gray-700"
                aria-label="閉じる"
              >
                ×
              </button>
            </div>
            <form className="space-y-4" onSubmit={saveInstructor}>
              <Field label="指導員名" required>
                <input
                  className={fieldClass}
                  value={instructorForm.name}
                  onChange={(event) => setInstructorForm((prev) => ({ ...prev, name: event.target.value }))}
                />
              </Field>
              <Field label="ユーザID" required hint="半角英数字、アンダースコア、ハイフン、スラッシュ、ドット">
                <input
                  className={fieldClass}
                  value={instructorForm.username}
                  placeholder="instructor001"
                  onChange={(event) => setInstructorForm((prev) => ({ ...prev, username: event.target.value }))}
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
                        className="rounded-full bg-sky-100 px-3 py-1 text-xs text-sky-800"
                        onClick={() => setInstructorForm((prev) => ({ ...prev, username: suggestion }))}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </span>
                )}
              </Field>
              <Field label="メールアドレス" required>
                <input
                  type="email"
                  className={fieldClass}
                  value={instructorForm.email}
                  onChange={(event) => setInstructorForm((prev) => ({ ...prev, email: event.target.value }))}
                />
              </Field>
              <Field label="専門分野" required>
                <input
                  className={fieldClass}
                  value={instructorForm.department}
                  onChange={(event) => setInstructorForm((prev) => ({ ...prev, department: event.target.value }))}
                />
              </Field>
              <fieldset>
                <legend className="mb-2 text-sm font-semibold text-gray-700">
                  所属する事業所 <span className="text-red-600">*</span>
                </legend>
                <p className="mb-2 text-xs text-gray-500">各拠点には必ず責任者が必要です。</p>
                {offices.length === 0 ? (
                  <p className="text-sm text-gray-600">先に事業所を作成してください。</p>
                ) : (
                  <div className="space-y-2 rounded-lg border border-sky-200 p-3">
                    {offices.map((office) => {
                      const selected = instructorForm.officeIds.some((id) => sameId(id, office.id));
                      return (
                        <div key={office.id}>
                          <label className="flex items-center gap-2 text-sm text-gray-800">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => setInstructorForm((prev) => ({
                                ...prev,
                                officeIds: event.target.checked
                                  ? [...prev.officeIds, office.id]
                                  : prev.officeIds.filter((id) => !sameId(id, office.id)),
                                managerOfficeIds: event.target.checked
                                  ? prev.managerOfficeIds
                                  : prev.managerOfficeIds.filter((id) => !sameId(id, office.id)),
                              }))}
                            />
                            {office.name || '名称未設定'}
                          </label>
                          {selected && (
                            <label className="ml-6 mt-1 flex items-center gap-2 text-sm text-gray-600">
                              <input
                                type="checkbox"
                                checked={instructorForm.managerOfficeIds.some((id) => sameId(id, office.id))}
                                onChange={(event) => setInstructorForm((prev) => ({
                                  ...prev,
                                  managerOfficeIds: event.target.checked
                                    ? [...prev.managerOfficeIds, office.id]
                                    : prev.managerOfficeIds.filter((id) => !sameId(id, office.id)),
                                }))}
                              />
                              この拠点の責任者にする
                            </label>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </fieldset>
              <Field label="初期パスワード" required hint="6文字以上">
                <input
                  type="password"
                  className={fieldClass}
                  value={instructorForm.password}
                  onChange={(event) => setInstructorForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </Field>
              {instructorMessage && (
                <p className={`text-sm ${instructorMessageIsError ? 'text-red-700' : 'text-green-700'}`}>{instructorMessage}</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setInstructorOpen(false)}
                  className="flex-1 rounded-lg border border-gray-200 bg-gray-100 px-4 py-3 font-semibold text-gray-700 hover:bg-gray-200"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={instructorSaving}
                  className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
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

export default AdminCompanySetupPage;
