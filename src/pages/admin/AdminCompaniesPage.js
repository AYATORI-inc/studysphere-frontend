import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
import OfficeTypeManagement from './OfficeTypeManagement';
import { apiGet } from '../../utils/api';

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

const formatExpiry = (value) => {
  if (value === null || value === undefined) return '期限なし';
  const text = String(value).trim();
  if (invalidExpiryValues.has(text)) return '期限なし';
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return '期限なし';
  return parsed.toLocaleDateString('ja-JP');
};

const AdminCompaniesPage = () => {
  const [companies, setCompanies] = useState([]);
  const [offices, setOffices] = useState([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [companyPayload, satellitePayload] = await Promise.all([
          apiGet('/api/companies'),
          apiGet('/api/satellites'),
        ]);
        if (cancelled) return;
        setCompanies(asList(companyPayload));
        setOffices(asList(satellitePayload));
      } catch (loadError) {
        if (cancelled) return;
        console.error('企業一覧の取得に失敗:', loadError);
        setError('企業一覧を取得できませんでした。');
        setCompanies([]);
        setOffices([]);
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
    const officesByCompany = new Map();

    offices.forEach((office) => {
      const key = String(office.company_id ?? '');
      if (!key) return;
      if (!officesByCompany.has(key)) officesByCompany.set(key, []);
      officesByCompany.get(key).push(office);
    });

    return companies
      .map((company) => ({
        id: company.id,
        name: company.name || '名称未設定',
        offices: [...(officesByCompany.get(String(company.id)) || [])].sort((left, right) => (
          (left.name || '').localeCompare(right.name || '', 'ja')
        )),
      }))
      .sort((left, right) => left.name.localeCompare(right.name, 'ja'));
  }, [companies, offices]);

  const visibleGroups = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('ja');
    if (!keyword) return groups;
    return groups.flatMap((group) => {
      if ((group.name || '').toLocaleLowerCase('ja').includes(keyword)) return [group];
      const matchedOffices = group.offices.filter((office) => (
        (office.name || '').toLocaleLowerCase('ja').includes(keyword)
      ));
      if (matchedOffices.length === 0) return [];
      return [{ ...group, offices: matchedOffices }];
    });
  }, [groups, query]);

  const officeCount = visibleGroups.reduce((sum, group) => sum + group.offices.length, 0);

  return (
    <AdminOfficeLayout>
      <h1 className="text-3xl font-bold text-gray-900">企業管理</h1>
      <p className="mt-2 text-gray-600">企業と、その企業に属する事業所を並べています。</p>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <label className="mt-4 block max-w-md">
            <span className="sr-only">企業名、事業所名で探す</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="企業名、事業所名で探す"
              className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
            />
          </label>
          <p className="mt-4 text-sm text-gray-600">企業 {visibleGroups.length}社　事業所 {officeCount}件</p>
          {groups.length === 0 ? (
            <p className="mt-6 text-gray-600">企業はありません。</p>
          ) : visibleGroups.length === 0 ? (
            <p className="mt-6 text-gray-600">該当する企業・事業所はありません。</p>
          ) : (
            <div className="mt-4 overflow-x-auto rounded-xl border border-sky-100 bg-white">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-sky-50 text-left text-sky-900">
                  <tr>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">企業名</th>
                    <th className="border-b border-sky-100 px-4 py-3 font-semibold">事業所名</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">事業所タイプ</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">利用者数</th>
                    <th className="whitespace-nowrap border-b border-sky-100 px-4 py-3 font-semibold">有効期限</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleGroups.map((group, groupIndex) => {
                    const rows = group.offices.length > 0 ? group.offices : [null];
                    return rows.map((office, officeIndex) => (
                      <tr
                        key={office ? `${group.id}-${office.id}` : `${group.id}-none`}
                        className={groupIndex % 2 === 0 ? 'bg-white' : 'bg-sky-50/40'}
                      >
                        {officeIndex === 0 && (
                          <td
                            rowSpan={rows.length}
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
                        {office ? (
                          <>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-800">{office.name || '名称未設定'}</td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                              {office.office_type_name || office.office_type_id || '-'}
                            </td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                              {office.current_users || 0} / {office.max_users || 0}人
                            </td>
                            <td className="whitespace-nowrap border-b border-sky-100 px-4 py-3 text-gray-700">
                              {formatExpiry(office.token_expiry_at)}
                            </td>
                          </>
                        ) : (
                          <>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">事業所なし</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                            <td className="border-b border-sky-100 px-4 py-3 text-gray-500">-</td>
                          </>
                        )}
                      </tr>
                    ));
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-8">
            <Link
              to="/admin/companies/new"
              className="inline-block rounded-lg bg-sky-600 px-6 py-3 font-medium text-white hover:bg-sky-700"
            >
              新規企業追加
            </Link>
          </div>
          <OfficeTypeManagement />
        </>
      )}
    </AdminOfficeLayout>
  );
};

export default AdminCompaniesPage;
