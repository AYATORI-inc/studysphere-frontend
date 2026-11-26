import React from 'react';
import { Link } from 'react-router-dom';
import AdminOfficeLayout from './AdminOfficeLayout';

const sections = [
  {
    title: '企業を作る',
    place: '企業管理',
    to: '/admin/companies',
    paragraphs: [
      '最初に企業を作ります。事業所も指導員も企業に属するため、企業がないと先へ進めません。',
      '一覧には、企業と、その企業の事業所が並びます。事業所がまだ無い企業も、企業名だけ出ます。企業名を開くと、その企業の確認画面です。新しい企業だけは、この一覧から入力フォームで追加します。',
      'できた企業の名前、住所、電話番号は、確認画面の「編集」から直します。企業トークンは見るだけです。',
    ],
  },
  {
    title: '事業所を企業の中に作る',
    place: '企業管理',
    to: '/admin/companies',
    paragraphs: [
      '事業所は、企業の確認画面にある事業所リストから追加します。1つの企業に、事業所は複数作れます。事業所管理は、全部の事業所を探して開く場所です。',
      '事業所名を開くと確認画面です。基本的な情報、利用できるコース、指導員、利用者が並びます。基本情報とコースは「編集」から直します。',
      '有効期限の「+30日」「+90日」「+1年」は、期限がまだ先ならその日から、切れているか未設定なら今日から足します。事業所トークンは、基本情報の電話番号の下に表示するだけです。',
      '事業所名の右にある「スタッフダッシュボードへ」で、その拠点のスタッフ画面を同じタブで開きます。ブラウザの戻るで、この管理画面に戻れます。',
    ],
  },
  {
    title: '指導員を置き、拠点と責任者を決める',
    place: '指導員管理',
    to: '/admin/instructors',
    paragraphs: [
      '指導員は企業ごとに並びます。指導員が一人もいない企業は一覧に出ません。企業の確認画面から追加することもできます。',
      '検索は企業名と指導員名です。企業名が一致したときは、その企業の指導員を全員出します。論理削除済の指導員は普段は隠し、「論理削除済のユーザーも表示する」をオンにしたときだけ出します。',
      '指導員名を開くと確認画面です。名前、ユーザID、メール、専門分野は「編集」から直します。企業の付け替えはできません。拠点はこの編集には含めません。',
      '所属事業所は一覧で扱います。「拠点追加」で、同じ企業のまだ所属していない事業所を足します。「責任者にする」「責任者を解除」で、その拠点だけの責任者を切り替えます。「所属を解除」は、責任者のあいだは押せません。先に責任者を外します。',
      '利用者一覧は、指導員が所属する事業所の利用者全員です。自分の担当が上に来ます。',
      '「パスワード管理」では2つできます。一時パスワードを発行すると、今のパスワードは置き換わり、その場で一度だけ表示します。パスワード変更を要求すると、今のパスワードはそのまま使え、次回ログイン時に変更を求めます。',
    ],
  },
];

const AdminSpecificationsPage = () => (
  <AdminOfficeLayout>
    <h1 className="text-3xl font-bold text-gray-900">各種仕様</h1>
    <p className="mt-2 max-w-3xl text-gray-600">
      企業、事業所、指導員の順に用意します。各画面は確認が中心で、変更は「編集」や行のボタンから行います。
    </p>

    <ol className="mt-6 max-w-3xl space-y-4">
      {sections.map((section, index) => (
        <li key={section.title} className="rounded-2xl border border-sky-100 bg-white p-5">
          <p className="text-sm font-semibold text-sky-800">{index + 1}</p>
          <h2 className="mt-1 text-xl font-bold text-gray-900">{section.title}</h2>
          <div className="mt-2 space-y-2 text-sm leading-6 text-gray-700">
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
          <p className="mt-3 text-sm text-gray-600">
            場所は
            <Link to={section.to} className="ml-1 font-medium text-sky-800 underline underline-offset-4">
              {section.place}
            </Link>
            です。
          </p>
        </li>
      ))}
    </ol>

    <section className="mt-4 max-w-3xl rounded-2xl border border-sky-100 bg-white p-5">
      <h2 className="text-xl font-bold text-gray-900">論理削除</h2>
      <p className="mt-2 text-sm leading-6 text-gray-700">
        各事業所のスタッフが指導員を削除すると、論理削除済になります。論理削除済の指導員はログインできません。指導員一覧では隠れ、確認画面のステータスにも「論理削除済」と出ます。確認画面の「アクティブに戻す」で、ログインできる状態に戻せます。
      </p>
    </section>
  </AdminOfficeLayout>
);

export default AdminSpecificationsPage;
