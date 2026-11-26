import React from 'react';

const AdminSsoGuidePage = () => (
  <article className="mx-auto max-w-3xl px-6 py-8 text-sm leading-7 text-gray-800">
    <h1 className="text-3xl font-bold text-gray-900">SSO実装手順</h1>
    <p className="mt-3 text-gray-600">
      この資料はStudySphereのSSO概要を記載しています。詳細は別ドキュメントを参照してください。
    </p>

    <h2 className="mt-8 text-xl font-bold text-gray-900">1. この画面の役割</h2>
    <p className="mt-3">
      SSO管理は、StudySphereの管理者が連携先を登録し、遷移の記録を見る画面です。利用者のログイン画面ではありません。操作できるのはロール9以上の管理者です。
    </p>
    <p className="mt-3">
      信頼システム管理では、SSOを許す相手だけを登録します。入れる項目は、システム識別子、表示名、ベースURL、着地パスです。識別子は英数字とアンダースコアだけを使い、あとからAPIの target_system と source_system にそのまま書きます。ベースURLは https で始め、末尾のスラッシュは付けません。着地パスは、相手システムがチケット付きで利用者を受け取るパスです。例は /sso/callback です。無効化しても行は消えません。有効フラグを切るだけで、無効な相手へはチケットを発行しません。
    </p>
    <p className="mt-3">
      監査ログには、チケットの発行、検証、リダイレクト、失敗が残ります。開いた直後は過去1か月です。つながらないときは、ここを先に見ます。期限切れは EXPIRED_TICKET、同じチケットの再利用は ALREADY_USED です。識別子の綴り違いや無効な相手は、発行の時点で失敗します。
    </p>

    <h2 className="mt-8 text-xl font-bold text-gray-900">2. StudySphereのバックエンド</h2>
    <p className="mt-3">
      StudySphereは認証のハブです。ブラウザのURLにログインパスワードやJWTは載せず、一度だけ使える短いチケットを渡します。チケットは art- で始まる文字列です。有効期限は30秒、使えるのは1回です。検証に成功した瞬間に使用済みになり、再読み込みでもう一度検証すると失敗します。
    </p>
    <p className="mt-3">
      APIのベースURLは https://studysphere-backend.ayatori-inc.co.jp です。画面のURLは https://studysphere.ayatori-inc.co.jp です。
    </p>
    <p className="mt-3">
      発行は2通りです。StudySphereにログイン済みの利用者を外へ出すときは、POST /api/sso/ticket/generate を使います。Authorization にその利用者のJWTを付け、body に target_system、source_system、context を渡します。相手は信頼システムに登録され、有効である必要があります。
    </p>
    <p className="mt-3">
      相手システムからStudySphereへ送り出すときは、相手のサーバが POST /api/sso/ticket/generate-by-logincode を呼びます。認証ヘッダは不要です。body は login_code、target_system、source_system です。StudySphereへ戻すときは target_system を studysphere にします。この場合、信頼システムとしての登録確認は行いません。login_code はサーバだけで扱い、ブラウザのJavaScriptには出しません。ステータスが論理削除済の利用者は発行できません。
    </p>
    <p className="mt-3">
      受け取り側は POST /api/sso/ticket/verify に ticket だけを送ります。認証は不要です。成功時は valid が true で、data に user_id、username、name、role、company_id、company_name、locationNames、source_system、target_system が入ります。username の中身はログインコードです。失敗してもHTTPは200で、valid が false になり、error は INVALID_TICKET、EXPIRED_TICKET、ALREADY_USED、USER_NOT_FOUND のいずれかです。発行に成功したときは ticket、expires_in（秒）、expires_at が返ります。expires_in は通常30です。この秒数以内に、ブラウザを着地URLへ送ってください。
    </p>

    <h2 className="mt-8 text-xl font-bold text-gray-900">3. 新しいシステムとSSOするとき</h2>
    <p className="mt-3">
      先にStudySphereへ、システム識別子、表示名、https のベースURL、着地パスを伝えます。StudySphereの管理者は、信頼システム管理の「新規追加」で登録し、有効にします。通信はすべてHTTPSにします。相手システム側で用意するものは、着地ページ、サーバからの verify、自システムのセッション作成の3つです。利用者の対応は user_id か username（ログインコード）のどちらかを、自システムのアカウントに保存しておき、検証結果と突き合わせます。StudySphereのパスワードは受け取りません。
    </p>
    <p className="mt-3">
      StudySphereから相手へ渡すとき、StudySphereはチケットを発行し、ブラウザを「ベースURL＋着地パス＋ ?ticket=...」へ送ります。相手の着地ページは ticket を受け取り、自システムのサーバから verify を呼びます。ブラウザから直接 verify を呼ばないでください。返った username で自システムの利用者を特定し、自前のセッションを作ってから画面を開きます。同じチケットは二度検証しません。
    </p>
    <p className="mt-3">
      相手からStudySphereへ渡すとき、相手のサーバが generate-by-logincode を呼び、30秒以内にブラウザを https://studysphere.ayatori-inc.co.jp/sso-login?ticket=... へ送ります。StudySphereがチケットを検証し、ログインしてダッシュボードを開きます。利用者（ロール1）をStudySphereへ入れるには、有効な一時パスワードが発行済みである必要があります。無いときは NO_TEMP_PASSWORD になり、ログインできません。ログインコードが空の利用者も入れません。
    </p>
    <p className="mt-3">
      相手から、StudySphereを経由して別の連携先へ渡すときは、generate-by-logincode の target_system にその連携先の識別子を指定します。リダイレクト先は /sso-login ではなく、https://studysphere.ayatori-inc.co.jp/sso-dispatch?target=識別子&ticket=... です。StudySphereが受け取ったチケットを検証し、連携先用の新しいチケットを発行して、その着地URLへ送ります。連携先は、上と同じ verify で受け取ります。
    </p>
    <p className="mt-3">
      確認は監査ログで行います。generate のあとに verify が成功していればつながっています。EXPIRED_TICKET は30秒を超えています。ALREADY_USED は再読み込みか二重送信です。信頼システムが見つからない場合は、識別子の綴りと有効フラグを見ます。
    </p>
  </article>
);

export default AdminSsoGuidePage;
