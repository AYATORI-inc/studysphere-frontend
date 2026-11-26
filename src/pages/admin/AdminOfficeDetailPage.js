import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
import { useAuth } from '../../components/contexts/AuthContext';
import { apiGet, apiPost, apiPut, reauthenticateForSatellite } from '../../utils/api';
import { isExpired } from '../../utils/dateUtils';

const invalidExpiryValues = new Set([
  '',
  '0000-00-00 00:00:00',
  '0000-00-00',
  'null',
  'undefined',
  'NULL',
  'None',
]);

const contractLabels = {
  '30days': '30日コース',
  '90days': '90日コース',
  '1year': '1年コース',
};

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
};

const asOffice = (payload) => {
  if (payload?.data && !Array.isArray(payload.data) && payload.data.id) return payload.data;
  if (payload?.id) return payload;
  return null;
};

const errorText = (error, fallback) => {
  const details = error?.response?.data?.errors;
  if (Array.isArray(details) && details.length > 0) {
    return details.map((item) => item.msg || item.message).filter(Boolean).join('、');
  }
  return error?.message || fallback;
};

const parseExpiry = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (invalidExpiryValues.has(text)) return null;
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const formatExpiry = (value) => {
  const parsed = parseExpiry(value);
  if (!parsed) return '期限なし';
  return parsed.toLocaleDateString('ja-JP');
};

const formatTempExpiry = (value) => {
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return parsed.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Tokyo',
  });
};

const expiryPresets = [
  { days: 30, label: '+30日', amount: '30日' },
  { days: 90, label: '+90日', amount: '90日' },
  { days: 365, label: '+1年', amount: '1年' },
];

const idList = (payload) => asList(payload).map((item) => Number(item?.id ?? item)).filter((id) => !Number.isNaN(id));

const fieldClass = 'w-full rounded-lg border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400';

const Field = ({ label, required, children }) => (
  <label className="block">
    <span className="mb-2 block text-sm font-semibold text-gray-700">
      {label}
      {required && <span className="ml-1 text-red-600">*</span>}
    </span>
    {children}
  </label>
);

const AdminOfficeDetailPage = () => {
  const { officeId } = useParams();
  const navigate = useNavigate();
  const { currentUser, updateAuthForSatellite } = useAuth();
  const [office, setOffice] = useState(null);
  const [courses, setCourses] = useState([]);
  const [disabledCourseIds, setDisabledCourseIds] = useState([]);
  const [instructors, setInstructors] = useState([]);
  const [users, setUsers] = useState([]);
  const [paths, setPaths] = useState([]);
  const [officeTypes, setOfficeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState('');
  const [notice, setNotice] = useState('');
  const [noticeIsError, setNoticeIsError] = useState(false);

  const [basicOpen, setBasicOpen] = useState(false);
  const [basicForm, setBasicForm] = useState(null);
  const [basicMessage, setBasicMessage] = useState('');
  const [basicSaving, setBasicSaving] = useState(false);

  const [courseOpen, setCourseOpen] = useState(false);
  const [selectedCourseIds, setSelectedCourseIds] = useState([]);
  const [courseMessage, setCourseMessage] = useState('');
  const [courseSaving, setCourseSaving] = useState(false);
  const [expirySaving, setExpirySaving] = useState(false);
  const [staffOpening, setStaffOpening] = useState(false);
  const [issuingUserId, setIssuingUserId] = useState('');

  const load = async () => {
    const [officePayload, coursePayload, disabledPayload, instructorPayload, userPayload, typePayload, pathPayload] = await Promise.all([
      apiGet(`/api/satellites/${officeId}`),
      apiGet('/api/courses'),
      apiGet(`/api/satellites/${officeId}/disabled-courses`),
      apiGet(`/api/satellites/${officeId}/instructors`),
      apiGet(`/api/satellites/${officeId}/users`),
      apiGet('/api/office-types'),
      apiGet('/api/curriculum-paths'),
    ]);
    const found = asOffice(officePayload);
    if (!found) {
      throw new Error('事業所が見つかりません。');
    }
    setOffice(found);
    setCourses(asList(coursePayload).filter((course) => course && (course.status === undefined || course.status === 'active')));
    setDisabledCourseIds(idList(disabledPayload));
    setInstructors(asList(instructorPayload));
    setUsers(asList(userPayload).filter((user) => {
      const role = Number(user.role);
      return !Number.isNaN(role) && role >= 1 && role <= 3;
    }));
    setOfficeTypes(asList(typePayload).filter((item) => item?.type));
    setPaths(asList(pathPayload).filter((path) => path && path.status !== 'deleted'));
  };

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setPageError('');
        await load();
      } catch (loadError) {
        if (!cancelled) setPageError(errorText(loadError, '事業所情報を取得できませんでした。'));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [officeId]);

  const availableCourses = useMemo(
    () => courses.filter((course) => !disabledCourseIds.includes(Number(course.id))),
    [courses, disabledCourseIds]
  );

  const pathCanBeUsed = (path) => {
    if (path.status !== 'active') return false;
    const courseIds = (Array.isArray(path.courses) ? path.courses : [])
      .map((course) => Number(course.course_id || course.courseId))
      .filter((id) => !Number.isNaN(id));
    return !courseIds.some((id) => disabledCourseIds.includes(id));
  };

  const pathState = (path) => {
    if (path.status === 'draft') return { label: '下書き', className: 'text-gray-500' };
    if (path.status === 'inactive') return { label: '非公開', className: 'text-gray-500' };
    if (!pathCanBeUsed(path)) return { label: '無効', className: 'text-gray-500' };
    return { label: '利用できる', className: 'text-green-700' };
  };

  const issueToday = async (user) => {
    try {
      setIssuingUserId(String(user.id));
      setNotice('');
      const result = await apiPost(`/api/users/${user.id}/issue-temp-password`, {});
      if (result?.success === false || !result?.data?.tempPassword) {
        throw new Error(result?.message || '本日有効の発行に失敗しました。');
      }
      setUsers((prev) => prev.map((item) => (
        String(item.id) === String(user.id)
          ? {
            ...item,
            temp_password: result.data.tempPassword,
            expires_at: result.data.expires_at || result.data.expiresAt,
            is_used: 0,
          }
          : item
      )));
      setNoticeIsError(false);
      setNotice(`${user.name || '利用者'}を本日有効にしました。`);
    } catch (issueError) {
      setNoticeIsError(true);
      setNotice(errorText(issueError, '本日有効の発行に失敗しました。'));
    } finally {
      setIssuingUserId('');
    }
  };

  const openBasic = () => {
    setBasicForm({
      name: office.name || '',
      officeType: office.office_type_name || office.office_type_id || '',
      address: office.address || '',
      phone: office.phone || '',
      contractType: office.contract_type || '30days',
      maxUsers: String(office.max_users || 10),
    });
    setBasicMessage('');
    setBasicOpen(true);
  };

  const saveBasic = async (event) => {
    event.preventDefault();
    if (!basicForm.name.trim() || !basicForm.officeType || !basicForm.contractType || !basicForm.maxUsers) {
      setBasicMessage('事業所名、事業所タイプ、契約コース、利用者上限数を入力してください。');
      return;
    }
    const maxUsers = Number(basicForm.maxUsers);
    if (!Number.isInteger(maxUsers) || maxUsers < 1 || maxUsers > 10000) {
      setBasicMessage('利用者上限数は1から10000の整数です。');
      return;
    }
    try {
      setBasicSaving(true);
      setBasicMessage('');
      const result = await apiPut(`/api/satellites/${officeId}`, {
        name: basicForm.name.trim(),
        address: basicForm.address.trim() || null,
        phone: basicForm.phone.trim() || null,
        office_type_id: basicForm.officeType,
        contract_type: basicForm.contractType,
        max_users: maxUsers,
      });
      if (result?.success === false) throw new Error(result.message || '保存に失敗しました。');
      await load();
      setBasicOpen(false);
      setNoticeIsError(false);
      setNotice('基本情報を保存しました。');
    } catch (saveError) {
      setBasicMessage(errorText(saveError, '保存に失敗しました。'));
    } finally {
      setBasicSaving(false);
    }
  };

  const openCourses = () => {
    setSelectedCourseIds(courses.filter((course) => !disabledCourseIds.includes(Number(course.id))).map((course) => Number(course.id)));
    setCourseMessage('');
    setCourseOpen(true);
  };

  const saveCourses = async (event) => {
    event.preventDefault();
    try {
      setCourseSaving(true);
      setCourseMessage('');
      const disabledIds = courses
        .map((course) => Number(course.id))
        .filter((id) => !selectedCourseIds.includes(id));
      const result = await apiPut(`/api/satellites/${officeId}/disabled-courses`, {
        disabled_course_ids: disabledIds,
      });
      if (result?.success === false) throw new Error(result.message || 'コース設定の保存に失敗しました。');
      setDisabledCourseIds(disabledIds);
      setCourseOpen(false);
      setNoticeIsError(false);
      setNotice('利用できるコースを保存しました。');
    } catch (saveError) {
      setCourseMessage(errorText(saveError, 'コース設定の保存に失敗しました。'));
    } finally {
      setCourseSaving(false);
    }
  };

  const extendExpiry = async (preset) => {
    const current = parseExpiry(office?.token_expiry_at);
    const now = new Date();
    const base = current && current.getTime() > now.getTime() ? current : now;
    const next = new Date(base.getTime() + preset.days * 24 * 60 * 60 * 1000);
    const nextLabel = next.toLocaleDateString('ja-JP');
    const fromLabel = current && current.getTime() > now.getTime() ? '今の有効期限' : '今日';
    if (!window.confirm(`有効期限に${preset.amount}を足します。${fromLabel}から数えて ${nextLabel} になります。`)) {
      return;
    }
    try {
      setExpirySaving(true);
      setNotice('');
      const result = await apiPut(`/api/satellites/${officeId}`, {
        token_expiry_at: next.toISOString(),
      });
      if (result?.success === false) throw new Error(result.message || '有効期限の更新に失敗しました。');
      await load();
      setNoticeIsError(false);
      setNotice(`有効期限を ${nextLabel} に更新しました。`);
    } catch (saveError) {
      setNoticeIsError(true);
      setNotice(errorText(saveError, '有効期限の更新に失敗しました。'));
    } finally {
      setExpirySaving(false);
    }
  };

  const openStaffDashboard = async () => {
    try {
      setStaffOpening(true);
      setNotice('');
      const result = await reauthenticateForSatellite(office.id);
      if (!result?.success || !result.data?.access_token || !result.data?.refresh_token) {
        throw new Error(result?.message || 'スタッフ画面への切り替えに失敗しました。');
      }
      const nextUser = result.data.user || {};
      updateAuthForSatellite({
        ...(currentUser || {}),
        id: currentUser?.id || nextUser.id,
        name: currentUser?.name || nextUser.name,
        role: nextUser.role ?? currentUser?.role,
        company_id: nextUser.company_id,
        company_name: nextUser.company_name,
        satellite_id: nextUser.satellite_id || office.id,
        satellite_name: nextUser.satellite_name || office.name,
        satellite_ids: [nextUser.satellite_id || office.id],
      }, result.data.access_token, result.data.refresh_token);
      sessionStorage.setItem('selectedSatellite', JSON.stringify({
        id: office.id,
        name: office.name,
        company_id: office.company_id || nextUser.company_id,
        company_name: office.company_name || nextUser.company_name,
      }));
      sessionStorage.removeItem('instructorDashboardSelection');
      navigate('/instructor/dashboard');
    } catch (openError) {
      setNoticeIsError(true);
      setNotice(errorText(openError, 'スタッフ画面への切り替えに失敗しました。'));
      setStaffOpening(false);
    }
  };

  const managers = instructors.filter((instructor) => instructor.is_manager).map((instructor) => instructor.name);

  return (
    <AdminOfficeLayout>
      <p>
        <Link to="/admin/locations" className="text-sm text-sky-800 underline underline-offset-4">
          事業所一覧に戻る
        </Link>
      </p>
      <div className="mt-3 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="min-w-0 text-3xl font-bold text-gray-900">{office?.name || '事業所情報'}</h1>
        {office && (
          <button
            type="button"
            onClick={openStaffDashboard}
            disabled={staffOpening}
            className="shrink-0 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {staffOpening ? '移動中...' : 'スタッフダッシュボードへ'}
          </button>
        )}
      </div>
      {office && (
        <p className="mt-2 text-right text-xs leading-5 text-gray-500">
          この事業所のスタッフ画面を確認できます。
        </p>
      )}
      {notice && (
        <p className={`mt-3 text-sm ${noticeIsError ? 'text-red-700' : 'text-green-700'}`}>{notice}</p>
      )}
      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && pageError && <p className="mt-6 text-red-700">{pageError}</p>}

      {!loading && !pageError && office && (
        <div className="mt-6 space-y-6">
          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">基本的な情報</h2>
              <button
                type="button"
                onClick={openBasic}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                編集
              </button>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-gray-500">事業所名</dt><dd className="text-gray-900">{office.name || '-'}</dd></div>
              <div><dt className="text-gray-500">事業所タイプ</dt><dd className="text-gray-900">{office.office_type_name || office.office_type_id || '-'}</dd></div>
              <div><dt className="text-gray-500">企業名</dt><dd className="text-gray-900">{office.company_name || '-'}</dd></div>
              <div><dt className="text-gray-500">契約コース</dt><dd className="text-gray-900">{contractLabels[office.contract_type] || office.contract_type || '-'}</dd></div>
              <div><dt className="text-gray-500">住所</dt><dd className="text-gray-900">{office.address || '-'}</dd></div>
              <div><dt className="text-gray-500">電話番号</dt><dd className="text-gray-900">{office.phone || '-'}</dd></div>
              <div className="sm:col-span-2"><dt className="text-gray-500">事業所トークン</dt><dd className="font-mono tracking-wide text-gray-900">{office.token || '未発行'}</dd></div>
              <div><dt className="text-gray-500">利用者数</dt><dd className="text-gray-900">{office.current_users || users.length || 0} / {office.max_users || 0}人</dd></div>
              <div><dt className="text-gray-500">責任者</dt><dd className="break-words text-gray-900">{managers.length > 0 ? managers.join('、') : '未設定'}</dd></div>
              <div className="sm:col-span-2">
                <dt className="text-gray-500">有効期限</dt>
                <dd className="mt-1">
                  <span className="text-base font-semibold text-gray-900">{formatExpiry(office.token_expiry_at)}</span>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {expiryPresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() => extendExpiry(preset)}
                        disabled={expirySaving}
                        className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {preset.label}
                      </button>
                    ))}
                    {expirySaving && <span className="text-sm text-gray-500">更新中...</span>}
                  </div>
                </dd>
                <p className="mt-1 text-xs text-gray-500">今の有効期限に足します。期限が切れているときと、期限がないときは今日から足します。</p>
              </div>
            </dl>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <h2 className="text-xl font-bold text-gray-900">カリキュラムパス</h2>
            <p className="mt-2 text-sm text-gray-600">
              利用できるカリキュラムパス {paths.filter(pathCanBeUsed).length}件 / 全{paths.length}件
            </p>
            {paths.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">カリキュラムパスはありません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">パス名</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">コース数</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">期間</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paths.map((path) => {
                      const state = pathState(path);
                      const courseCount = Number.isFinite(Number(path.total_courses))
                        ? Number(path.total_courses)
                        : (Array.isArray(path.courses) ? path.courses.length : 0);
                      return (
                        <tr key={path.id}>
                          <td className="border-b border-sky-100 px-4 py-3">
                            <Link
                              to={`/admin/curriculum-paths/${path.id}`}
                              className="font-semibold text-sky-800 underline underline-offset-4"
                            >
                              {path.name || '名称未設定'}
                            </Link>
                          </td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{courseCount}</td>
                          <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{path.duration || '-'}</td>
                          <td className={`whitespace-nowrap border-b border-sky-100 px-4 py-3 ${state.className}`}>{state.label}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <p className="mt-3 text-xs text-gray-500">公開中で、中のコースがこの事業所で無効になっていないパスを利用できます。</p>
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">コースの情報</h2>
              <button
                type="button"
                onClick={openCourses}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
              >
                編集
              </button>
            </div>
            <p className="mt-2 text-sm text-gray-600">利用できるコース {availableCourses.length}件 / 全{courses.length}件</p>
            {courses.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">コースはありません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">コース名</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">カテゴリ</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">状態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {courses.map((course) => {
                      const enabled = !disabledCourseIds.includes(Number(course.id));
                      return (
                        <tr key={course.id}>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{course.title || course.name || '名称未設定'}</td>
                          <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{course.category || '-'}</td>
                          <td className={`whitespace-nowrap border-b border-sky-100 px-4 py-3 ${enabled ? 'text-green-700' : 'text-gray-500'}`}>
                            {enabled ? '利用できる' : '無効'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-xl font-bold text-gray-900">指導員一覧</h2>
              {office.company_id && (
                <Link
                  to={`/admin/companies/${office.company_id}/setup`}
                  className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white hover:bg-sky-700"
                >
                  指導員追加
                </Link>
              )}
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
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">専門分野</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">責任者</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructors.map((instructor) => (
                      <tr key={instructor.id}>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{instructor.name || '-'}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.username || '-'}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.specialization || '-'}</td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                          {instructor.is_manager ? '責任者' : '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-sky-100 bg-white p-5">
            <h2 className="text-xl font-bold text-gray-900">利用者一覧</h2>
            {users.length === 0 ? (
              <p className="mt-4 text-sm text-gray-600">利用者はいません。</p>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full border-collapse text-sm">
                  <thead className="bg-sky-50 text-left text-sky-900">
                    <tr>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">利用者名</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">利用者トークン</th>
                      <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">本日有効</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">メールアドレス</th>
                      <th className="border-b border-sky-100 px-4 py-3 font-semibold">担当指導員</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((user) => (
                      <tr key={user.id}>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{user.name || '-'}</td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-mono text-gray-800">{user.login_code || '未設定'}</td>
                        <td className="border-b border-sky-100 px-4 py-3">
                          {user.temp_password ? (
                            <div className="space-y-1">
                              <div className="break-all font-mono text-xs font-semibold text-sky-800">{user.temp_password}</div>
                              <div className={user.expires_at && !isExpired(user.expires_at) ? 'text-xs text-green-700' : 'text-xs text-red-700'}>
                                {user.expires_at && !isExpired(user.expires_at) ? '有効' : '期限切れ'}
                              </div>
                              {user.expires_at && <div className="text-xs text-gray-500">{formatTempExpiry(user.expires_at)}</div>}
                              <button
                                type="button"
                                onClick={() => issueToday(user)}
                                disabled={issuingUserId !== ''}
                                className="rounded bg-amber-600 px-2 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
                              >
                                {issuingUserId === String(user.id) ? '発行中...' : '再発行'}
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-1">
                              <div className="text-xs text-gray-400">無効</div>
                              <button
                                type="button"
                                onClick={() => issueToday(user)}
                                disabled={issuingUserId !== ''}
                                className="rounded bg-sky-600 px-2 py-1 text-xs font-semibold text-white hover:bg-sky-700 disabled:opacity-50"
                              >
                                {issuingUserId === String(user.id) ? '発行中...' : '有効化'}
                              </button>
                            </div>
                          )}
                        </td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{user.email || '-'}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{user.instructor_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {basicOpen && basicForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">基本情報の編集</h2>
              <button type="button" onClick={() => setBasicOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form className="space-y-4" onSubmit={saveBasic}>
              <Field label="事業所名" required>
                <input className={fieldClass} value={basicForm.name} onChange={(event) => setBasicForm((prev) => ({ ...prev, name: event.target.value }))} />
              </Field>
              <Field label="事業所タイプ" required>
                <select className={fieldClass} value={basicForm.officeType} onChange={(event) => setBasicForm((prev) => ({ ...prev, officeType: event.target.value }))}>
                  <option value="">選択してください</option>
                  {officeTypes.map((type) => <option key={type.id} value={type.type}>{type.type}</option>)}
                </select>
              </Field>
              <Field label="住所">
                <input className={fieldClass} value={basicForm.address} onChange={(event) => setBasicForm((prev) => ({ ...prev, address: event.target.value }))} />
              </Field>
              <Field label="電話番号">
                <input
                  className={fieldClass}
                  value={basicForm.phone}
                  onChange={(event) => setBasicForm((prev) => ({ ...prev, phone: event.target.value.replace(/[^0-9-]/g, '') }))}
                />
              </Field>
              <Field label="契約コース" required>
                <select className={fieldClass} value={basicForm.contractType} onChange={(event) => setBasicForm((prev) => ({ ...prev, contractType: event.target.value }))}>
                  <option value="30days">30日コース</option>
                  <option value="90days">90日コース</option>
                  <option value="1year">1年コース</option>
                </select>
              </Field>
              <Field label="利用者上限数" required>
                <input type="number" min="1" max="10000" className={fieldClass} value={basicForm.maxUsers} onChange={(event) => setBasicForm((prev) => ({ ...prev, maxUsers: event.target.value }))} />
              </Field>
              {basicMessage && <p className="text-sm text-red-700">{basicMessage}</p>}
              <div className="flex gap-3">
                <button type="button" onClick={() => setBasicOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={basicSaving} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {courseOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">利用できるコース</h2>
              <button type="button" onClick={() => setCourseOpen(false)} className="text-2xl font-bold text-gray-500" aria-label="閉じる">×</button>
            </div>
            <form onSubmit={saveCourses}>
              <div className="max-h-80 space-y-2 overflow-y-auto rounded-lg border border-sky-200 p-3">
                {courses.map((course) => (
                  <label key={course.id} className="flex items-center gap-2 text-sm text-gray-800">
                    <input
                      type="checkbox"
                      checked={selectedCourseIds.includes(Number(course.id))}
                      onChange={(event) => setSelectedCourseIds((prev) => (
                        event.target.checked
                          ? [...prev, Number(course.id)]
                          : prev.filter((id) => id !== Number(course.id))
                      ))}
                    />
                    {course.title || course.name || '名称未設定'}
                  </label>
                ))}
              </div>
              {courseMessage && <p className="mt-3 text-sm text-red-700">{courseMessage}</p>}
              <div className="mt-4 flex gap-3">
                <button type="button" onClick={() => setCourseOpen(false)} className="flex-1 rounded-lg bg-gray-100 px-4 py-3 font-semibold text-gray-700">キャンセル</button>
                <button type="submit" disabled={courseSaving} className="flex-1 rounded-lg bg-sky-600 px-4 py-3 font-semibold text-white disabled:opacity-50">保存</button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </AdminOfficeLayout>
  );
};

export default AdminOfficeDetailPage;
