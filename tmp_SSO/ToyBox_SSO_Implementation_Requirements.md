# 📄 ToyBox SSO実装ガイドライン (Integration Guide)
## 1. 概要 (Concept)本ドキュメントは、外部システム「ToyBox」が、統合認証基盤である **StudySphere SSO Hub** と連携するための実装仕様書である。

ToyBoxは以下の役割を担う：

1. **Sender (送り手):** ToyBoxからStudySphereへユーザーを送り出す（SSOログインさせる）。
2. **Receiver (受け手):** StudySphereから送られてきたユーザーを受け入れ、自システムにログインさせる。

## 2. 前提条件 (Prerequisites)実装を開始する前に、StudySphere管理者より以下の情報を取得し、設定すること。

| 項目 | 説明 | 設定例 |
| --- | --- | --- |
| **System Key** | StudySphere内でToyBoxを識別するID | `toybox_prod` |
| **API Endpoint** | StudySphereのAPIベースURL | `https://studysphere.example.com` |
| **Service Token** | API呼び出し用の認証トークン (Bearer Token) | `ey... (JWT or API Key)` |
| **Landing URL** | ToyBox側の着地ページ（StudySphereに登録必須） | `https://toybox.example.com/sso/callback` |

---

## 3. ケースA: ToyBox → StudySphere (Inbound)ユーザーがToyBox内の「StudySphereを開く」ボタンをクリックした際のフロー。

### 3.1 処理フロー1. **[UI]** ユーザーがリンクをクリック。
2. **[Backend]** ToyBoxサーバーがStudySphere APIを叩き、**ワンタイムチケット**を取得。
3. **[Backend]** 取得したチケットをクエリパラメータに付与し、ユーザーをリダイレクト。

### 3.2 実装詳細**Step 1: チケット取得 (Server-to-Server)**

ToyBoxバックエンドから実行する。

* **URL:** `POST {StudySphere_API_URL}/api/sso/ticket/generate`
* **Header:** `Authorization: Bearer {Service_Token}`
* **Body:**
```json
{
  "target_system": "studysphere", 
  "source_system": "toybox_prod"
}

```


* **Response:**
```json
{
  "success": true,
  "data": {
    "ticket": "art-random-string-12345",
    "expires_in": 30
  }
}

```



**Step 2: リダイレクト (Browser)**

取得した `ticket` を使い、30秒以内にユーザーをリダイレクトさせる。

* **URL:** `{StudySphere_Frontend_URL}/auto-login?ticket={ticket}`

---

## 4. ケースB: StudySphere → ToyBox (Outbound)StudySphereのメニューから、ユーザーがToyBoxに遷移してくる際のフロー。

### 4.1 処理フロー1. **[Browser]** ユーザーが `ticket` パラメータ付きでToyBoxのランディングページに着地。
2. **[Backend]** ToyBoxサーバーが `ticket` をStudySphere APIに送り、検証。
3. **[Backend]** 検証OKなら、返却されたユーザー情報（User ID等）を元に、ToyBox側のセッションを確立（ログイン）。

### 4.2 実装詳細**Step 1: 着地ページのハンドリング**

* **受信URL例:** `https://toybox.example.com/sso/callback?ticket=art-xyz-98765`
* フロントエンドは `ticket` を取得し、即座にToyBoxバックエンドへ送信する。

**Step 2: チケット検証 (Server-to-Server)**

ToyBoxバックエンドから実行する。

* **URL:** `POST {StudySphere_API_URL}/api/sso/ticket/verify`
* **Body:**
```json
{
  "ticket": "art-xyz-98765"
}

```


* **Response (Success):**
```json
{
  "valid": true,
  "data": {
    "user_id": 101,          // StudySphere上のユーザーID
    "username": "dan_z",     // ユーザー名
    "source_system": "studysphere"
  }
}

```



**Step 3: セッション確立**

* `valid: true` の場合、`data.user_id` に紐付くToyBox内のユーザーアカウントを特定する。
* 該当ユーザーとしてログイン処理（Cookie発行など）を行う。
* ToyBoxのトップページ等へリダイレクトする。

---

## 5. ケースC: ToyBox → 別システム (Transit via Hub)ToyBoxから、StudySphereを経由して「第三のシステム（System C）」へ遷移する場合。

### 5.1 実装詳細基本は「ケースA」と同じだが、**チケット生成時の宛先（Target）** が異なる。

**Step 1: チケット取得**

* **Body:**
```json
{
  "target_system": "system_c",  // ここに行きたい場所を指定
  "source_system": "toybox_prod"
}

```



**Step 2: リダイレクト**

* **URL:** `{StudySphere_Frontend_URL}/sso-dispatch?target=system_c&ticket={ticket}`
* ※ `/auto-login` ではなく `/sso-dispatch` を使用すること。



---

## 6. セキュリティ・チェックリスト開発・テスト時に以下の項目を確認すること。

* [ ] **HTTPS必須:** API呼び出しおよびリダイレクトはすべてHTTPSで行われているか。
* [ ] **トークン隠蔽:** `Service_Token` はバックエンドにのみ保存し、フロントエンド（JS）には露出していないか。
* [ ] **チケット使い捨て:** チケットは一度 `verify` したら、二度と使えないことを理解しているか（リロード対策が必要）。
* [ ] **エラーハンドリング:** `verify` が失敗した場合（期限切れ等）、ユーザーをログイン画面に適切に誘導しているか。
* [ ] **IP制限:** 可能であれば、API呼び出し元のIPアドレスをStudySphere管理者に伝え、許可リストに入れてもらうこと。

---

ToyBox側のやることはシンプルである。**「チケットをもらって投げる」** か **「チケットを受け取って確認する」**。このキャッチボールさえできれば、どんな複雑なジャム・セッションでもグルーヴを合わせられる。

StudySphere側の `sso_trusted_systems` テーブルへの登録を忘れないようにな。
Good luck!