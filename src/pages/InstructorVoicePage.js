import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import InstructorHeader from '../components/InstructorHeader';
import AnnouncementCreator from '../components/AnnouncementCreator';
import AnnouncementList from '../components/AnnouncementList';
import MessageSender from '../components/MessageSender';
import PersonalMessageList from '../components/PersonalMessageList';
import { useInstructorGuard } from '../utils/hooks/useAuthGuard';

const InstructorVoicePage = () => {
  const { currentUser } = useInstructorGuard();
  const [localUser, setLocalUser] = useState(null);

  useEffect(() => {
    if (!currentUser) return;
    const savedSatellite = sessionStorage.getItem('selectedSatellite');
    let locationToUse = null;
    if (savedSatellite) {
      try {
        const parsed = JSON.parse(savedSatellite);
        if (parsed?.id) locationToUse = parsed;
      } catch (parseError) {
        console.error('声かけ: 拠点情報のパースエラー:', parseError);
      }
    }
    if (!locationToUse && currentUser.satellite_id) {
      locationToUse = {
        id: currentUser.satellite_id,
        name: currentUser.satellite_name,
        company_id: currentUser.company_id,
        company_name: currentUser.company_name,
      };
    }
    if (locationToUse) {
      sessionStorage.setItem('selectedSatellite', JSON.stringify(locationToUse));
    }
    setLocalUser({
      ...currentUser,
      location: locationToUse || currentUser.location,
      satellite_id: locationToUse?.id || currentUser.satellite_id,
      satellite_name: locationToUse?.name || currentUser.satellite_name,
      company_id: locationToUse?.company_id || currentUser.company_id,
      company_name: locationToUse?.company_name || currentUser.company_name,
    });
  }, [currentUser]);

  const handleLocationChange = (newLocation) => {
    sessionStorage.setItem('selectedSatellite', JSON.stringify(newLocation));
    const updatedUser = {
      ...localUser,
      satellite_id: newLocation.id,
      satellite_name: newLocation.name,
      company_id: newLocation.company_id,
      company_name: newLocation.company_name,
      location: newLocation,
    };
    setLocalUser(updatedUser);
    localStorage.setItem('currentUser', JSON.stringify(updatedUser));
    window.dispatchEvent(new CustomEvent('satelliteChanged', {
      detail: { newLocation },
    }));
  };

  if (!currentUser || !localUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <InstructorHeader user={localUser} onLocationChange={handleLocationChange} />
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium text-indigo-700">学習</p>
            <h1 className="mt-1 text-3xl font-bold text-gray-900">声かけ</h1>
            <p className="mt-2 text-gray-600">
              同じ内容を複数人へ伝えるアナウンスと、1人との会話を分けています。
            </p>
          </div>
          <Link
            to="/instructor/dashboard"
            className="text-sm text-indigo-700 hover:text-indigo-900"
          >
            ダッシュボードに戻る
          </Link>
        </div>

        <div key={localUser.satellite_id || 'none'} className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">アナウンス</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              選んだ複数人へ、同じタイトルと本文を送ります。返信は来ません。利用者の画面には、送った当日だけ出ます。
            </p>
            <div className="mt-5">
              <AnnouncementCreator />
            </div>
            <div className="mt-6 border-t border-gray-200 pt-6">
              <AnnouncementList />
            </div>
          </section>

          <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
            <h2 className="text-xl font-bold text-gray-900">1対1</h2>
            <p className="mt-2 text-sm leading-6 text-gray-600">
              送れる相手は1人です。下の一覧は、その1人を選ぶためのリストです。本文だけを送り、会話として続きます。メッセージは60日残ります。
            </p>
            <div className="mt-5">
              <MessageSender />
            </div>
          </section>
        </div>

        <section className="mt-6 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="text-xl font-bold text-gray-900">1対1の続き</h2>
          <p className="mt-2 text-sm leading-6 text-gray-600">
            利用者からの返信も、ここで返します。アナウンスはここには出ません。
          </p>
          <div className="mt-5">
            <PersonalMessageList />
          </div>
        </section>
      </main>
    </div>
  );
};

export default InstructorVoicePage;
