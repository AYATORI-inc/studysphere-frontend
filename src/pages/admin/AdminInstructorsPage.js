import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
import { apiGet } from '../../utils/api';

const asList = (payload) => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.data)) return payload.data;
  return [];
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

const officeNamesFor = (user, officeNameById) => {
  if (Array.isArray(user?.satellite_details) && user.satellite_details.some((satellite) => satellite?.name)) {
    return user.satellite_details.map((satellite) => satellite.name).filter(Boolean);
  }
  return satelliteIdList(user).map((id) => officeNameById.get(String(id))).filter(Boolean);
};

const AdminInstructorsPage = () => {
  const [companies, setCompanies] = useState([]);
  const [offices, setOffices] = useState([]);
  const [users, setUsers] = useState([]);
  const [query, setQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [companyPayload, satellitePayload, userPayload] = await Promise.all([
          apiGet('/api/companies'),
          apiGet('/api/satellites'),
          apiGet('/api/users'),
        ]);
        if (cancelled) return;
        setCompanies(asList(companyPayload));
        setOffices(asList(satellitePayload));
        setUsers(asList(userPayload));
      } catch (loadError) {
        if (cancelled) return;
        console.error('指導員一覧の取得に失敗:', loadError);
        setError('指導員一覧を取得できませんでした。');
        setCompanies([]);
        setOffices([]);
        setUsers([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    const officeNameById = new Map(offices.map((office) => [String(office.id), office.name || '名称未設定']));
    const officeIdsByCompany = new Map();
    offices.forEach((office) => {
      const key = String(office.company_id);
      if (!officeIdsByCompany.has(key)) officeIdsByCompany.set(key, new Set());
      officeIdsByCompany.get(key).add(String(office.id));
    });

    const instructors = users.filter((user) => {
      const role = Number(user.role);
      return !Number.isNaN(role) && role >= 4 && role <= 8;
    });

    return companies
      .map((company) => {
        const companyId = String(company.id);
        const officeIds = officeIdsByCompany.get(companyId) || new Set();
        const companyInstructors = instructors
          .filter((user) => {
            if (String(user.company_id) === companyId) return true;
            return satelliteIdList(user).some((id) => officeIds.has(String(id)));
          })
          .map((user) => ({
            id: user.id,
            name: user.name || '名称未設定',
            username: user.username || '-',
            email: user.email || '-',
            offices: officeNamesFor(user, officeNameById),
            active: Number(user.status) === 1,
          }))
          .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
        return {
          id: company.id,
          name: company.name || '名称未設定',
          instructors: companyInstructors,
        };
      })
      .filter((group) => group.instructors.length > 0)
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  }, [companies, offices, users]);

  const visibleGroups = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja');
    return groups.flatMap((group) => {
      let instructors = showInactive
        ? group.instructors
        : group.instructors.filter((instructor) => instructor.active);
      if (keyword && !(group.name || '').toLocaleLowerCase('ja').includes(keyword)) {
        instructors = instructors.filter((instructor) => (
          (instructor.name || '').toLocaleLowerCase('ja').includes(keyword)
        ));
      }
      if (instructors.length === 0) return [];
      return [{ ...group, instructors }];
    });
  }, [groups, query, showInactive]);

  const instructorCount = visibleGroups.reduce((sum, group) => sum + group.instructors.length, 0);

  return (
    <AdminOfficeLayout>
      <h1 className="text-3xl font-bold text-gray-900">指導員管理</h1>
      <p className="mt-2 text-gray-600">企業と、その企業に属する指導員を並べています。</p>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <div className="mt-4 flex flex-wrap items-center gap-4">
            <label className="block min-w-[16rem] max-w-md flex-1">
              <span className="sr-only">企業名、指導員名で探す</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="企業名、指導員名で探す"
                className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              論理削除済のユーザーも表示する
            </label>
          </div>
          <p className="mt-4 text-sm text-gray-600">企業 {visibleGroups.length}社　指導員 {instructorCount}名</p>
          {groups.length === 0 ? (
            <p className="mt-6 text-gray-600">指導員のいる企業はありません。</p>
          ) : visibleGroups.length === 0 ? (
            <p className="mt-6 text-gray-600">該当する企業・指導員はありません。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-sky-100 bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-sky-50 text-left text-sky-900">
                  <tr>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">企業名</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">指導員名</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">ユーザID</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">メール</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">所属事業所</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group, groupIndex) => (
                    group.instructors.map((instructor, instructorIndex) => (
                      <tr
                        key={`${group.id}-${instructor.id}`}
                        className={groupIndex % 2 === 0 ? 'bg-white' : 'bg-sky-50/40'}
                      >
                        {instructorIndex === 0 && (
                          <td
                            rowSpan={group.instructors.length}
                            className="border-b border-sky-100 px-4 py-3 align-top font-semibold text-gray-900"
                          >
                            <Link
                              to={`/admin/companies/${group.id}/setup`}
                              className="text-sky-800 underline underline-offset-4 hover:text-sky-950"
                            >
                              {group.name}
                            </Link>
                          </td>
                        )}
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-800">
                          <Link
                            to={`/admin/instructors/${instructor.id}`}
                            className="text-sky-800 underline underline-offset-4 hover:text-sky-950"
                          >
                            {instructor.name}
                          </Link>
                          {!instructor.active && (
                            <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-800">論理削除済</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.username}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">{instructor.email}</td>
                        <td className="border-b border-sky-100 px-4 py-3 text-gray-700">
                          {instructor.offices.length > 0 ? instructor.offices.join('、') : '未設定'}
                        </td>
                      </tr>
                    ))
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </AdminOfficeLayout>
  );
};

export default AdminInstructorsPage;
