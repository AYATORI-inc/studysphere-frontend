import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';
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

const parseExpiry = (value) => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (invalidExpiryValues.has(text)) return null;
  const parsed = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
};

const daysUntilExpiry = (date) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiryDay = new Date(date);
  expiryDay.setHours(0, 0, 0, 0);
  return Math.round((expiryDay.getTime() - today.getTime()) / 86400000);
};

const managerIdList = (value) => {
  if (Array.isArray(value)) {
    return value.filter((id) => id !== null && id !== undefined && id !== '');
  }
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text || text === 'null' || text === '[]') return [];
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.filter((id) => id !== null && id !== undefined && id !== '') : [];
    } catch (parseError) {
      return [];
    }
  }
  return [];
};

const expiresWithin30Days = (office) => {
  if (!office.expiryDate) return false;
  const days = daysUntilExpiry(office.expiryDate);
  return days >= 0 && days <= 30;
};

const formatExpiry = (date) => {
  if (!date) {
    return { label: '期限なし', expired: false, days: null };
  }
  const days = daysUntilExpiry(date);
  return {
    label: date.toLocaleDateString('ja-JP'),
    expired: days < 0,
    days,
  };
};

const AdminOfficesPage = () => {
  const [offices, setOffices] = useState([]);
  const [query, setQuery] = useState('');
  const [officeType, setOfficeType] = useState('all');
  const [within30Days, setWithin30Days] = useState(false);
  const [noManagerOnly, setNoManagerOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);
        setError('');
        const [satellitePayload, companyPayload] = await Promise.all([
          apiGet('/api/satellites'),
          apiGet('/api/companies'),
        ]);
        if (cancelled) return;

        const companies = asList(companyPayload);
        const companyNameById = new Map(
          companies.map((company) => [company.id, company.name || '組織名なし'])
        );
        const nextOffices = asList(satellitePayload).map((office) => ({
          ...office,
          organizationName: companyNameById.get(office.company_id) || '組織名なし',
          typeName: office.office_type_name || (office.office_type_id ? String(office.office_type_id) : ''),
          expiryDate: parseExpiry(office.token_expiry_at),
          hasManager: managerIdList(office.manager_ids).length > 0,
        }));
        setOffices(nextOffices);
      } catch (loadError) {
        if (cancelled) return;
        console.error('事業所一覧の取得に失敗:', loadError);
        setError('事業所一覧を取得できませんでした。');
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

  const officeTypes = useMemo(() => {
    const names = offices.map((office) => office.typeName).filter(Boolean);
    return Array.from(new Set(names)).sort((left, right) => left.localeCompare(right, 'ja'));
  }, [offices]);

  const attention = useMemo(() => {
    const organizationNames = new Set();
    let noManagerCount = 0;
    offices.forEach((office) => {
      if (expiresWithin30Days(office)) {
        organizationNames.add(office.organizationName || '組織名なし');
      }
      if (!office.hasManager) noManagerCount += 1;
    });
    return {
      expiringOrganizations: organizationNames.size,
      noManagerCount,
    };
  }, [offices]);

  const visibleOffices = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const now = Date.now();
    return offices
      .filter((office) => {
        if (needle) {
          const haystack = [office.name, office.typeName, office.organizationName]
            .filter(Boolean)
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        if (officeType !== 'all' && office.typeName !== officeType) return false;
        if (within30Days && !expiresWithin30Days(office)) return false;
        if (noManagerOnly && office.hasManager) return false;
        return true;
      })
      .sort((left, right) => {
        if (!left.expiryDate && !right.expiryDate) {
          return (left.name || '').localeCompare(right.name || '', 'ja');
        }
        if (!left.expiryDate) return 1;
        if (!right.expiryDate) return -1;
        const distance = Math.abs(left.expiryDate.getTime() - now) - Math.abs(right.expiryDate.getTime() - now);
        if (distance !== 0) return distance;
        return left.expiryDate.getTime() - right.expiryDate.getTime();
      });
  }, [offices, query, officeType, within30Days, noManagerOnly]);

  return (
    <AdminOfficeLayout>
      <h1 className="text-3xl font-bold text-gray-900">事業所管理</h1>
      <p className="mt-2 text-gray-600">事業所名、事業所タイプ、組織名で探せます。</p>

      {!loading && !error && (attention.expiringOrganizations > 0 || attention.noManagerCount > 0) && (
        <div className="mt-4 space-y-2">
          {attention.expiringOrganizations > 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              有効期限30日以内の組織が{attention.expiringOrganizations}件あります。
            </p>
          )}
          {attention.noManagerCount > 0 && (
            <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
              責任者不在の事業所が{attention.noManagerCount}件あります。
            </p>
          )}
        </div>
      )}

      <div className="mt-6 flex flex-col gap-3 lg:flex-row">
        <label className="block flex-1">
          <span className="sr-only">事業所を探す</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="事業所名、事業所タイプ、組織名で探す"
            className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
          />
        </label>
        <label className="block lg:w-64">
          <span className="sr-only">事業所タイプ</span>
          <select
            value={officeType}
            onChange={(event) => setOfficeType(event.target.value)}
            className="w-full rounded-xl border border-sky-200 bg-white px-4 py-3 text-gray-900 outline-none focus:border-sky-400"
          >
            <option value="all">すべての事業所タイプ</option>
            {officeTypes.map((type) => (
              <option key={type} value={type}>{type}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:gap-6">
        <label className="flex w-fit items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={within30Days}
            onChange={(event) => setWithin30Days(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-sky-600"
          />
          有効期限30日以内
        </label>
        <label className="flex w-fit items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={noManagerOnly}
            onChange={(event) => setNoManagerOnly(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-sky-600"
          />
          責任者不在
        </label>
      </div>

      {loading && <p className="mt-6 text-gray-600">読み込み中...</p>}
      {!loading && error && <p className="mt-6 text-red-700">{error}</p>}

      {!loading && !error && (
        <>
          <p className="mt-4 text-sm text-gray-600">{visibleOffices.length}件　有効期限の近い順</p>
          {visibleOffices.length === 0 ? (
            <p className="mt-6 text-gray-600">該当する事業所はありません。</p>
          ) : (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visibleOffices.map((office) => {
                const expiry = formatExpiry(office.expiryDate);
                const userCount = `${office.current_users || 0} / ${office.max_users || 0}人`;
                return (
                  <Link
                    key={office.id}
                    to={`/admin/locations/${office.id}`}
                    className="relative block overflow-hidden rounded-sm border border-[#e4d7a8] bg-[#fffdf6] shadow-[3px_4px_0_rgba(90,70,20,0.08)] hover:border-[#d9c98a]"
                  >
                    <div className="h-3 bg-[#f6e7b2]" />
                    <div className="pointer-events-none absolute bottom-0 left-8 top-3 w-px bg-red-300/80" />
                    <div className="px-4 pl-12 text-sm">
                      <h2 className="flex h-9 items-center truncate border-b border-[#d9c98a] font-serif text-lg font-bold text-gray-900">
                        {office.name || '名称未設定'}
                      </h2>
                      <dl>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">事業所タイプ</dt>
                          <dd className="truncate text-gray-800">{office.typeName || '-'}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">組織名</dt>
                          <dd className="truncate text-gray-800">{office.organizationName}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">利用者数</dt>
                          <dd className="text-gray-800">{userCount}</dd>
                        </div>
                        <div className="flex h-9 items-center gap-3 border-b border-[#eadcab]">
                          <dt className="w-24 shrink-0 text-gray-500">有効期限</dt>
                          <dd className={expiry.expired ? 'font-medium text-red-700' : 'text-gray-800'}>
                            {expiry.label}
                            {expiry.expired ? '（期限切れ）' : ''}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </AdminOfficeLayout>
  );
};

export default AdminOfficesPage;
