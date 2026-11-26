# StudySphere SSO連携API 詳細仕様書

## 目次

1. [概要](#1-概要)
2. [アーキテクチャ](#2-アーキテクチャ)
3. [データベーススキーマ](#3-データベーススキーマ)
4. [認証方式](#4-認証方式)
5. [APIエンドポイント詳細](#5-apiエンドポイント詳細)
6. [エラーハンドリング](#6-エラーハンドリング)
7. [セキュリティ要件](#7-セキュリティ要件)
8. [使用例とフロー](#8-使用例とフロー)
9. [環境変数と設定](#9-環境変数と設定)
10. [トラブルシューティング](#10-トラブルシューティング)

---

## 1. 概要

### 1.1 目的

本ドキュメントは、StudySphereと外部システム間でSSO（Single Sign-On）連携を実現するためのAPI仕様書です。StudySphereを認証ハブとして機能させ、複数のシステム間でシームレスな認証遷移を可能にします。

### 1.2 基本情報

- **ベースURL**: `http://localhost:5050` (開発環境)
- **APIプレフィックス**: `/api/sso`
- **認証方式**: JWT (JSON Web Token) / パブリックアクセス
- **データベース**: MySQL 8.0
- **タイムゾーン**: 日本時間 (Asia/Tokyo)

### 1.3 主要機能

1. **ワンタイムチケット生成**: ユーザー認証情報を含む一時的なチケットを生成
2. **チケット検証**: 外部システムから受け取ったチケットを検証し、ユーザー情報を返却
3. **信頼システム管理**: SSO連携を許可するシステムの登録・管理
4. **監査ログ**: すべてのSSO操作を記録・追跡

### 1.4 対応フロー

- **Outbound**: StudySphere → 外部システム
- **Inbound**: 外部システム → StudySphere
- **Transit**: 外部システムA → StudySphere → 外部システムB

---

## 2. アーキテクチャ

### 2.1 システム構成

```
┌─────────────┐         ┌──────────────┐         ┌─────────────┐
│ 外部システムA │ ────→ │ StudySphere  │ ────→ │ 外部システムB │
│  (Sender)   │         │  (SSO Hub)   │         │  (Receiver)  │
└─────────────┘         └──────────────┘         └─────────────┘
     │                          │                          │
     │ 1. チケット生成要求      │                          │
     │ ←───────────────────────│                          │
     │ 2. チケット取得          │                          │
     │                          │                          │
     │ 3. リダイレクト          │                          │
     │ ──────────────────────────────────────────────────→│
     │                          │                          │
     │                          │ 4. チケット検証要求      │
     │                          │ ←───────────────────────│
     │                          │ 5. ユーザー情報返却      │
     │                          │ ────────────────────────→│
```

### 2.2 チケット方式（Artifact Binding）

- **形式**: `art-{32文字のランダム16進数文字列}`
- **例**: `art-abc123def456789012345678901234567890`
- **有効期限**: デフォルト30秒（環境変数で設定可能）
- **使用回数**: 1回のみ（使用後は即座に無効化）

### 2.3 データフロー

1. **チケット生成**: 認証済みユーザーが外部システムへの遷移を要求
2. **チケット保存**: データベースにチケット情報を保存（有効期限付き）
3. **リダイレクト**: チケットをクエリパラメータに付与して外部システムへリダイレクト
4. **チケット検証**: 外部システムがチケットを検証APIに送信
5. **ユーザー情報返却**: 検証成功時、ユーザー情報を返却
6. **チケット無効化**: 使用済みフラグを立て、再使用を防止

---

## 3. データベーススキーマ

### 3.1 sso_tickets テーブル

SSOワンタイムチケット管理テーブル

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | チケットID |
| ticket | VARCHAR(128) | NOT NULL, UNIQUE | チケット文字列（art-{random}形式） |
| user_id | INT | NOT NULL, FOREIGN KEY | ユーザーID（user_accounts.id） |
| source_system | VARCHAR(100) | NULL | 遷移元システム識別子 |
| target_system | VARCHAR(100) | NOT NULL | 遷移先システム識別子 |
| context | VARCHAR(255) | NULL | 生成コンテキスト（menu_click, transit等） |
| used | BOOLEAN | NOT NULL, DEFAULT FALSE | 使用済みフラグ |
| used_at | DATETIME | NULL | 使用日時 |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 作成日時（日本時間） |
| expires_at | DATETIME | NOT NULL | 有効期限（日本時間、通常は30-60秒後） |
| ip_address | VARCHAR(45) | NULL | 生成元IPアドレス |
| user_agent | TEXT | NULL | 生成元User-Agent |

**インデックス**:
- `idx_ticket` (ticket)
- `idx_user_id` (user_id)
- `idx_target_system` (target_system)
- `idx_expires_at` (expires_at)
- `idx_used` (used)

### 3.2 sso_trusted_systems テーブル

SSO連携信頼システム管理テーブル

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | システムID |
| system_key | VARCHAR(100) | NOT NULL, UNIQUE | システム識別子（toybox_prod, support_app等） |
| system_name | VARCHAR(255) | NOT NULL | システム表示名 |
| base_url | VARCHAR(512) | NOT NULL | ベースURL（リダイレクト先検証用） |
| landing_path | VARCHAR(255) | DEFAULT '/landing' | ランディングパス |
| description | TEXT | NULL | システム説明 |
| enabled | BOOLEAN | NOT NULL, DEFAULT TRUE | 有効フラグ |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 作成日時（日本時間） |
| updated_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP | 更新日時（日本時間） |
| created_by | INT | NULL | 作成者ID |
| updated_by | INT | NULL | 更新者ID |

**インデックス**:
- `idx_system_key` (system_key)
- `idx_enabled` (enabled)

### 3.3 sso_audit_logs テーブル

SSO監査ログテーブル

| カラム名 | 型 | 制約 | 説明 |
|---------|-----|------|------|
| id | INT | PRIMARY KEY, AUTO_INCREMENT | ログID |
| user_id | INT | NOT NULL, FOREIGN KEY | ユーザーID |
| ticket_id | INT | NULL, FOREIGN KEY | チケットID（sso_tickets.id） |
| source_system | VARCHAR(100) | NULL | 遷移元システム |
| target_system | VARCHAR(100) | NOT NULL | 遷移先システム |
| action | VARCHAR(50) | NOT NULL | アクション種別（generate, verify等） |
| ip_address | VARCHAR(45) | NULL | IPアドレス |
| user_agent | TEXT | NULL | User-Agent |
| success | BOOLEAN | NOT NULL, DEFAULT TRUE | 成功フラグ |
| error_message | TEXT | NULL | エラーメッセージ |
| created_at | DATETIME | NOT NULL, DEFAULT CURRENT_TIMESTAMP | 実行日時（日本時間） |

**インデックス**:
- `idx_user_id` (user_id)
- `idx_ticket_id` (ticket_id)
- `idx_source_system` (source_system)
- `idx_target_system` (target_system)
- `idx_action` (action)
- `idx_created_at` (created_at)

---

## 4. 認証方式

### 4.1 JWT認証（チケット生成API）

**対象エンドポイント**: `POST /api/sso/ticket/generate`

**認証方法**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
```

**トークン形式**:
- JWT (JSON Web Token)
- ヘッダー: `Authorization: Bearer {token}`

**トークン検証**:
- トークンの有効性チェック
- 有効期限チェック
- ユーザー情報の抽出（`req.user`）

### 4.2 パブリックアクセス（チケット検証API）

**対象エンドポイント**: `POST /api/sso/ticket/verify`

**認証**: 不要（パブリックアクセス）

**セキュリティ**:
- チケット自体が認証情報として機能
- 有効期限と使用済みチェックで保護

### 4.3 管理者認証（管理API）

**対象エンドポイント**:
- `GET /api/sso/systems`
- `POST /api/sso/systems`
- `PUT /api/sso/systems/:id`
- `DELETE /api/sso/systems/:id`
- `GET /api/sso/audit-logs`

**認証要件**:
- JWT認証必須
- ロール9以上（管理者権限）必須

---

## 5. APIエンドポイント詳細

### 5.1 チケット生成API

**エンドポイント**: `POST /api/sso/ticket/generate`

**認証**: JWT認証必須

**用途**: 
- StudySphereから外部システムへ遷移する際のチケット生成
- 外部システム間の遷移（Transit）時のチケット生成

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json
```

**リクエストボディ**:
```json
{
  "target_system": "toybox_prod",
  "source_system": "studysphere",
  "context": "menu_click"
}
```

**パラメータ説明**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| target_system | string | 必須 | 遷移先システム識別子（sso_trusted_systems.system_key） |
| source_system | string | 任意 | 遷移元システム識別子（デフォルト: "studysphere"） |
| context | string | 任意 | 生成コンテキスト（menu_click, transit等、デフォルト: "menu_click"） |

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "data": {
    "ticket": "art-abc123def456789012345678901234567890",
    "expires_in": 30,
    "expires_at": "2024-01-01T12:00:30+09:00"
  }
}
```

**レスポンスフィールド説明**:

| フィールド | 型 | 説明 |
|----------|-----|------|
| success | boolean | リクエスト成功フラグ |
| data.ticket | string | 生成されたチケット文字列（art-{random}形式） |
| data.expires_in | number | 有効期限（秒） |
| data.expires_at | string | 有効期限（ISO 8601形式、日本時間） |

**レスポンス（エラー）**:

**ステータスコード**: `400 Bad Request`

```json
{
  "success": false,
  "message": "target_systemは必須です"
}
```

**ステータスコード**: `401 Unauthorized`

```json
{
  "success": false,
  "message": "アクセストークンが提供されていません"
}
```

**ステータスコード**: `403 Forbidden`

```json
{
  "success": false,
  "message": "無効なトークンです"
}
```

**ステータスコード**: `500 Internal Server Error`

```json
{
  "success": false,
  "message": "信頼システムが見つかりません: toybox_prod"
}
```

**実装詳細**:
1. JWT認証ミドルウェアでユーザー情報を取得
2. `target_system` が `sso_trusted_systems` に登録されているか検証
3. ランダムなチケット文字列を生成（`art-{32文字のランダム16進数}`）
4. 有効期限を計算（現在時刻 + `SSO_TICKET_EXPIRY_SECONDS`秒）
5. `sso_tickets` テーブルに保存
6. `sso_audit_logs` に生成ログを記録
7. チケット情報を返却

---

### 5.2 チケット検証API

**エンドポイント**: `POST /api/sso/ticket/verify`

**認証**: 不要（パブリックアクセス）

**用途**: 
- 外部システムからStudySphereへの遷移時（Inbound）
- 外部システム間の遷移時（Transit/Outbound）

**リクエストヘッダー**:
```
Content-Type: application/json
```

**リクエストボディ**:
```json
{
  "ticket": "art-abc123def456789012345678901234567890"
}
```

**パラメータ説明**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| ticket | string | 必須 | 検証するチケット文字列 |

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "valid": true,
  "data": {
    "user_id": 101,
    "username": "user_name",
    "name": "ユーザー名",
    "role": 1,
    "company_id": 5,
    "company_name": "株式会社サンプル",
    "locationNames": ["本社", "支社A"],
    "expiresAt": "2024-12-31T23:59:59+09:00",
    "source_system": "studysphere",
    "target_system": "toybox_prod"
  }
}
```

**レスポンスフィールド説明**:

| フィールド | 型 | 説明 |
|----------|-----|------|
| valid | boolean | チケット有効性フラグ |
| data.user_id | number | StudySphere上のユーザーID |
| data.username | string | ユーザー名（login_code） |
| data.name | string | ユーザー表示名 |
| data.role | number | ユーザーロール（1: 利用者, 4: 指導員, 5: 管理者, 9: アドミン, 10: マスターユーザー） |
| data.company_id | number | 企業ID（NULLの場合はシステム管理者） |
| data.company_name | string | 企業名 |
| data.locationNames | array | 拠点名の配列 |
| data.expiresAt | string | トークン有効期限（ISO 8601形式、日本時間、NULLの場合は無期限） |
| data.source_system | string | 遷移元システム識別子 |
| data.target_system | string | 遷移先システム識別子 |

**レスポンス（エラー）**:

**ステータスコード**: `200 OK`（検証失敗時も200を返す）

```json
{
  "valid": false,
  "error": "INVALID_TICKET"
}
```

**エラーコード一覧**:

| エラーコード | 説明 |
|------------|------|
| INVALID_TICKET | チケットが存在しない |
| EXPIRED_TICKET | チケットの有効期限が切れている |
| ALREADY_USED | チケットが既に使用済み |
| USER_NOT_FOUND | チケットに紐づくユーザーが見つからない |

**ステータスコード**: `400 Bad Request`

```json
{
  "valid": false,
  "error": "INVALID_TICKET",
  "message": "チケットが提供されていません"
}
```

**ステータスコード**: `500 Internal Server Error`

```json
{
  "valid": false,
  "error": "VERIFICATION_ERROR",
  "message": "チケット検証に失敗しました"
}
```

**実装詳細**:
1. チケットの存在確認（`sso_tickets` テーブル）
2. 有効期限チェック（現在時刻と `expires_at` を比較）
3. 使用済みチェック（`used = true` の場合は拒否）
4. 検証成功時に `used = true`, `used_at = NOW()` に更新
5. ユーザー情報を取得（`user_accounts` テーブル）
6. 企業情報・拠点情報を取得
7. `sso_audit_logs` に検証ログを記録（成功・失敗ともに）
8. ユーザー情報を返却

---

### 5.3 信頼システム一覧取得API

**エンドポイント**: `GET /api/sso/systems`

**認証**: JWT認証 + 管理者権限（ロール9以上）必須

**用途**: 登録されている信頼システムの一覧を取得

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
```

**クエリパラメータ**: なし

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "system_key": "toybox_prod",
      "system_name": "ToyBox本番環境",
      "base_url": "https://toybox.example.com",
      "landing_path": "/sso/callback",
      "description": "ToyBox本番環境へのSSO連携",
      "enabled": true,
      "created_at": "2024-01-01T00:00:00+09:00",
      "updated_at": "2024-01-01T00:00:00+09:00",
      "created_by": 1,
      "updated_by": 1
    }
  ]
}
```

**レスポンス（エラー）**:

**ステータスコード**: `401 Unauthorized`

```json
{
  "success": false,
  "message": "アクセストークンが提供されていません"
}
```

**ステータスコード**: `403 Forbidden`

```json
{
  "success": false,
  "message": "管理者権限が必要です"
}
```

---

### 5.4 信頼システム追加API

**エンドポイント**: `POST /api/sso/systems`

**認証**: JWT認証 + 管理者権限（ロール9以上）必須

**用途**: 新しい信頼システムを登録

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json
```

**リクエストボディ**:
```json
{
  "system_key": "toybox_prod",
  "system_name": "ToyBox本番環境",
  "base_url": "https://toybox.example.com",
  "landing_path": "/sso/callback",
  "description": "ToyBox本番環境へのSSO連携"
}
```

**パラメータ説明**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| system_key | string | 必須 | システム識別子（ユニーク、英数字とアンダースコアのみ） |
| system_name | string | 必須 | システム表示名 |
| base_url | string | 必須 | ベースURL（有効なURL形式、末尾のスラッシュは自動削除） |
| landing_path | string | 任意 | ランディングパス（デフォルト: "/landing"） |
| description | string | 任意 | システム説明 |

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 1,
    "system_key": "toybox_prod",
    "system_name": "ToyBox本番環境",
    "base_url": "https://toybox.example.com",
    "landing_path": "/sso/callback",
    "description": "ToyBox本番環境へのSSO連携",
    "enabled": true,
    "created_at": "2024-01-01T00:00:00+09:00",
    "updated_at": "2024-01-01T00:00:00+09:00",
    "created_by": 1,
    "updated_by": null
  }
}
```

**レスポンス（エラー）**:

**ステータスコード**: `400 Bad Request`

```json
{
  "success": false,
  "message": "system_key, system_name, base_urlは必須です"
}
```

```json
{
  "success": false,
  "message": "base_urlは有効なURL形式である必要があります"
}
```

```json
{
  "success": false,
  "message": "system_keyが既に存在します"
}
```

**実装詳細**:
1. 必須パラメータのバリデーション
2. URL形式のバリデーション
3. `base_url` の正規化（末尾のスラッシュを削除）
4. `system_key` の重複チェック
5. `sso_trusted_systems` テーブルに挿入
6. 作成されたレコードを返却

---

### 5.5 信頼システム更新API

**エンドポイント**: `PUT /api/sso/systems/:id`

**認証**: JWT認証 + 管理者権限（ロール9以上）必須

**用途**: 既存の信頼システム情報を更新

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json
```

**パスパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | number | 必須 | システムID |

**リクエストボディ**:
```json
{
  "system_key": "toybox_prod",
  "system_name": "ToyBox本番環境（更新）",
  "base_url": "https://toybox.example.com",
  "landing_path": "/sso/callback",
  "description": "更新された説明",
  "enabled": true
}
```

**パラメータ説明**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| system_key | string | 任意 | システム識別子 |
| system_name | string | 任意 | システム表示名 |
| base_url | string | 任意 | ベースURL |
| landing_path | string | 任意 | ランディングパス |
| description | string | 任意 | システム説明 |
| enabled | boolean | 任意 | 有効フラグ |

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "data": {
    "id": 1,
    "system_key": "toybox_prod",
    "system_name": "ToyBox本番環境（更新）",
    "base_url": "https://toybox.example.com",
    "landing_path": "/sso/callback",
    "description": "更新された説明",
    "enabled": true,
    "created_at": "2024-01-01T00:00:00+09:00",
    "updated_at": "2024-01-01T12:00:00+09:00",
    "created_by": 1,
    "updated_by": 1
  }
}
```

**レスポンス（エラー）**:

**ステータスコード**: `404 Not Found`

```json
{
  "success": false,
  "message": "信頼システムが見つかりません"
}
```

**ステータスコード**: `400 Bad Request`

```json
{
  "success": false,
  "message": "更新するフィールドが指定されていません"
}
```

---

### 5.6 信頼システム削除API

**エンドポイント**: `DELETE /api/sso/systems/:id`

**認証**: JWT認証 + 管理者権限（ロール9以上）必須

**用途**: 信頼システムを無効化（論理削除）

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
```

**パスパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| id | number | 必須 | システムID |

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "message": "信頼システムを無効化しました"
}
```

**レスポンス（エラー）**:

**ステータスコード**: `404 Not Found`

```json
{
  "success": false,
  "message": "信頼システムが見つかりません"
}
```

**実装詳細**:
- 物理削除ではなく、`enabled = false` に更新（論理削除）
- 既存のチケットやログは保持される

---

### 5.7 監査ログ取得API

**エンドポイント**: `GET /api/sso/audit-logs`

**認証**: JWT認証 + 管理者権限（ロール9以上）必須

**用途**: SSO操作の監査ログを取得

**リクエストヘッダー**:
```
Authorization: Bearer {JWT_ACCESS_TOKEN}
```

**クエリパラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| user_id | number | 任意 | ユーザーIDでフィルタ |
| source_system | string | 任意 | 遷移元システムでフィルタ |
| target_system | string | 任意 | 遷移先システムでフィルタ |
| action | string | 任意 | アクション種別でフィルタ（generate, verify等） |
| start_date | string | 任意 | 開始日時（YYYY-MM-DD HH:mm:ss形式、日本時間） |
| end_date | string | 任意 | 終了日時（YYYY-MM-DD HH:mm:ss形式、日本時間） |
| page | number | 任意 | ページ番号（デフォルト: 1） |
| limit | number | 任意 | 1ページあたりの件数（デフォルト: 50） |

**リクエスト例**:
```
GET /api/sso/audit-logs?user_id=101&action=verify&page=1&limit=50
```

**レスポンス（成功）**:

**ステータスコード**: `200 OK`

```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "user_id": 101,
      "ticket_id": 1,
      "source_system": "studysphere",
      "target_system": "toybox_prod",
      "action": "generate",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0...",
      "success": true,
      "error_message": null,
      "created_at": "2024-01-01T12:00:00+09:00",
      "username": "user_name",
      "user_name": "ユーザー名"
    }
  ],
  "pagination": {
    "total": 100,
    "page": 1,
    "limit": 50,
    "totalPages": 2
  }
}
```

**レスポンスフィールド説明**:

| フィールド | 型 | 説明 |
|----------|-----|------|
| success | boolean | リクエスト成功フラグ |
| data | array | 監査ログの配列 |
| data[].id | number | ログID |
| data[].user_id | number | ユーザーID |
| data[].ticket_id | number | チケットID |
| data[].source_system | string | 遷移元システム |
| data[].target_system | string | 遷移先システム |
| data[].action | string | アクション種別 |
| data[].ip_address | string | IPアドレス |
| data[].user_agent | string | User-Agent |
| data[].success | boolean | 成功フラグ |
| data[].error_message | string | エラーメッセージ（失敗時） |
| data[].created_at | string | 実行日時（ISO 8601形式、日本時間） |
| data[].username | string | ユーザー名（JOIN結果） |
| data[].user_name | string | ユーザー表示名（JOIN結果） |
| pagination.total | number | 総件数 |
| pagination.page | number | 現在のページ番号 |
| pagination.limit | number | 1ページあたりの件数 |
| pagination.totalPages | number | 総ページ数 |

**デフォルト動作**:
- `start_date` と `end_date` が指定されていない場合、過去1ヶ月分のログを取得
- ソート順: `created_at DESC`（新しい順）

---

## 6. エラーハンドリング

### 6.1 HTTPステータスコード

| ステータスコード | 説明 | 使用例 |
|----------------|------|--------|
| 200 | 成功 | チケット検証成功、一覧取得成功 |
| 400 | バリデーションエラー | 必須パラメータ不足、URL形式不正 |
| 401 | 認証エラー | トークン未提供、トークン無効 |
| 403 | 権限エラー | 管理者権限不足 |
| 404 | リソース不存在 | 信頼システムが見つからない |
| 500 | サーバーエラー | データベースエラー、予期しないエラー |

### 6.2 エラーレスポンス形式

**標準エラーレスポンス**:
```json
{
  "success": false,
  "message": "エラーメッセージ"
}
```

**チケット検証エラー**:
```json
{
  "valid": false,
  "error": "ERROR_CODE",
  "message": "エラーメッセージ（オプション）"
}
```

### 6.3 エラーコード一覧

| エラーコード | HTTPステータス | 説明 |
|------------|---------------|------|
| INVALID_TICKET | 200 | チケットが存在しない |
| EXPIRED_TICKET | 200 | チケットの有効期限が切れている |
| ALREADY_USED | 200 | チケットが既に使用済み |
| USER_NOT_FOUND | 200 | チケットに紐づくユーザーが見つからない |
| VERIFICATION_ERROR | 500 | チケット検証処理中にエラーが発生 |

---

## 7. セキュリティ要件

### 7.1 Artifact Binding（チケット方式）

- **ワンタイム使用**: チケットは1回のみ使用可能
- **短い有効期限**: デフォルト30秒（環境変数で設定可能）
- **推測不可能**: 32文字のランダム16進数文字列を使用
- **即座無効化**: 使用後は即座に `used = true` に更新

### 7.2 Allowlist（許可リスト）管理

- **信頼システム登録**: `sso_trusted_systems` テーブルで管理
- **URL検証**: `base_url` のドメイン検証
- **ワイルドカード禁止**: 相対パスやワイルドカードの使用を禁止
- **有効フラグ**: `enabled = false` のシステムへのリダイレクトを禁止

### 7.3 認証・認可

- **JWT認証**: チケット生成APIはJWT認証必須
- **管理者権限**: 管理APIはロール9以上必須
- **トークン検証**: 有効期限と署名の検証

### 7.4 監査ログ

- **全操作記録**: すべてのSSO操作を記録
- **IPアドレス記録**: リクエスト元IPアドレスを記録
- **User-Agent記録**: リクエスト元User-Agentを記録
- **成功・失敗記録**: 成功・失敗の両方を記録

### 7.5 データ保護

- **トランザクション**: チケット生成・検証はトランザクション内で実行
- **外部キー制約**: データ整合性を保証
- **論理削除**: 信頼システムは物理削除せず論理削除

---

## 8. 使用例とフロー

### 8.1 Outboundフロー（StudySphere → 外部システム）

**シナリオ**: StudySphereのメニューから外部システム（ToyBox）へ遷移

**ステップ1: チケット生成**

```http
POST /api/sso/ticket/generate
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json

{
  "target_system": "toybox_prod",
  "source_system": "studysphere",
  "context": "menu_click"
}
```

**レスポンス**:
```json
{
  "success": true,
  "data": {
    "ticket": "art-abc123def456789012345678901234567890",
    "expires_in": 30,
    "expires_at": "2024-01-01T12:00:30+09:00"
  }
}
```

**ステップ2: リダイレクト**

```
https://toybox.example.com/sso/callback?ticket=art-abc123def456789012345678901234567890
```

**ステップ3: チケット検証（ToyBox側）**

```http
POST https://studysphere.example.com/api/sso/ticket/verify
Content-Type: application/json

{
  "ticket": "art-abc123def456789012345678901234567890"
}
```

**レスポンス**:
```json
{
  "valid": true,
  "data": {
    "user_id": 101,
    "username": "user_name",
    "name": "ユーザー名",
    "role": 1,
    "company_id": 5,
    "company_name": "株式会社サンプル",
    "locationNames": ["本社", "支社A"],
    "expiresAt": "2024-12-31T23:59:59+09:00",
    "source_system": "studysphere",
    "target_system": "toybox_prod"
  }
}
```

**ステップ4: セッション確立（ToyBox側）**

- `data.user_id` または `data.username` を元にToyBox内のユーザーアカウントを特定
- 該当ユーザーとしてログイン処理（Cookie発行など）を実行
- ToyBoxのトップページ等へリダイレクト

---

### 8.2 Inboundフロー（外部システム → StudySphere）

**シナリオ**: 外部システム（ToyBox）からStudySphereへ遷移

**ステップ1: チケット生成（ToyBox側）**

```http
POST https://studysphere.example.com/api/sso/ticket/generate
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json

{
  "target_system": "studysphere",
  "source_system": "toybox_prod"
}
```

**ステップ2: リダイレクト（ToyBox側）**

```
https://studysphere.example.com/auto-login?ticket=art-xyz987654321098765432109876543210
```

**ステップ3: チケット検証（StudySphere側）**

StudySphereの `AutoLoginPage` が自動的にチケットを検証し、ログイン処理を実行

---

### 8.3 Transitフロー（外部システムA → StudySphere → 外部システムB）

**シナリオ**: 外部システムAから外部システムBへ、StudySphereを経由して遷移

**ステップ1: チケット生成（システムA側）**

```http
POST https://studysphere.example.com/api/sso/ticket/generate
Authorization: Bearer {JWT_ACCESS_TOKEN}
Content-Type: application/json

{
  "target_system": "system_b",
  "source_system": "system_a"
}
```

**ステップ2: StudySphere経由リダイレクト（システムA側）**

```
https://studysphere.example.com/sso-dispatch?target=system_b&ticket=art-...
```

**ステップ3: StudySphere側の処理**

1. チケット検証
2. システムB用の新しいチケット生成
3. システムBへリダイレクト

**ステップ4: チケット検証（システムB側）**

システムBがチケットを検証し、ユーザー情報を取得

---

## 9. 環境変数と設定

### 9.1 環境変数

| 環境変数名 | 型 | デフォルト値 | 説明 |
|-----------|-----|------------|------|
| SSO_TICKET_EXPIRY_SECONDS | number | 30 | チケット有効期限（秒） |
| SSO_TICKET_LENGTH | number | 32 | チケット文字列の長さ（バイト数、16進数変換後は64文字） |

### 9.2 設定例

**.env ファイル**:
```bash
# SSOチケット設定
SSO_TICKET_EXPIRY_SECONDS=30
SSO_TICKET_LENGTH=32
```

### 9.3 チケット生成ロジック

```javascript
// チケット形式: art-{32バイトのランダム文字列を16進数変換}
// 例: art-abc123def456789012345678901234567890abcdef1234567890abcdef123456
const randomBytes = crypto.randomBytes(32); // 32バイト
const randomString = randomBytes.toString('hex'); // 64文字の16進数文字列
const ticket = `art-${randomString}`; // art-プレフィックス付き
```

---

## 10. トラブルシューティング

### 10.1 よくある問題と解決方法

#### 問題1: チケット生成APIで「信頼システムが見つかりません」エラー

**原因**: `target_system` が `sso_trusted_systems` テーブルに登録されていない、または `enabled = false`

**解決方法**:
1. 管理者画面で信頼システムが登録されているか確認
2. `enabled = true` になっているか確認
3. `system_key` のスペルミスを確認

#### 問題2: チケット検証APIで「EXPIRED_TICKET」エラー

**原因**: チケットの有効期限（デフォルト30秒）が切れている

**解決方法**:
1. チケット生成後、30秒以内に検証APIを呼び出す
2. 必要に応じて `SSO_TICKET_EXPIRY_SECONDS` を延長（セキュリティリスクに注意）

#### 問題3: チケット検証APIで「ALREADY_USED」エラー

**原因**: チケットが既に使用済み（リロードや再送信など）

**解決方法**:
1. チケットは1回のみ使用可能であることを理解
2. リロード時の再検証を避ける（フロントエンドで制御）
3. 検証成功後は別の方法でセッションを維持

#### 問題4: 認証エラー（401 Unauthorized）

**原因**: JWTトークンが無効、または有効期限切れ

**解決方法**:
1. トークンが正しく送信されているか確認（`Authorization: Bearer {token}`）
2. トークンの有効期限を確認
3. 必要に応じてリフレッシュトークンで新しいアクセストークンを取得

#### 問題5: 権限エラー（403 Forbidden）

**原因**: 管理者権限（ロール9以上）が不足

**解決方法**:
1. ユーザーのロールを確認
2. 管理者権限を持つユーザーでログイン

### 10.2 ログ確認

**監査ログの確認**:
```
GET /api/sso/audit-logs?action=verify&success=false&page=1&limit=50
```

**データベース直接確認**:
```sql
-- 最近のチケット生成ログ
SELECT * FROM sso_audit_logs 
WHERE action = 'generate' 
ORDER BY created_at DESC 
LIMIT 10;

-- 最近の検証失敗ログ
SELECT * FROM sso_audit_logs 
WHERE action = 'verify' AND success = FALSE 
ORDER BY created_at DESC 
LIMIT 10;

-- 有効な信頼システム一覧
SELECT * FROM sso_trusted_systems 
WHERE enabled = TRUE;
```

### 10.3 パフォーマンス最適化

**期限切れチケットのクリーンアップ**:
```javascript
// 定期的に期限切れチケットを削除
DELETE FROM sso_tickets WHERE expires_at < NOW();
```

**インデックスの確認**:
- `sso_tickets.ticket` にインデックスが存在するか確認
- `sso_tickets.expires_at` にインデックスが存在するか確認

---

## 11. 付録

### 11.1 リクエスト/レスポンス例（cURL）

**チケット生成**:
```bash
curl -X POST https://studysphere.example.com/api/sso/ticket/generate \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
  -H "Content-Type: application/json" \
  -d '{
    "target_system": "toybox_prod",
    "source_system": "studysphere",
    "context": "menu_click"
  }'
```

**チケット検証**:
```bash
curl -X POST https://studysphere.example.com/api/sso/ticket/verify \
  -H "Content-Type: application/json" \
  -d '{
    "ticket": "art-abc123def456789012345678901234567890"
  }'
```

### 11.2 データベースマイグレーション

**テーブル作成SQL**:
```sql
-- sso_tickets テーブル
CREATE TABLE IF NOT EXISTS `sso_tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `ticket` VARCHAR(128) NOT NULL UNIQUE,
    `user_id` INT NOT NULL,
    `source_system` VARCHAR(100) DEFAULT NULL,
    `target_system` VARCHAR(100) NOT NULL,
    `context` VARCHAR(255) DEFAULT NULL,
    `used` BOOLEAN NOT NULL DEFAULT FALSE,
    `used_at` DATETIME DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `expires_at` DATETIME NOT NULL,
    `ip_address` VARCHAR(45) DEFAULT NULL,
    `user_agent` TEXT DEFAULT NULL,
    INDEX `idx_ticket` (`ticket`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_target_system` (`target_system`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_used` (`used`),
    FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sso_trusted_systems テーブル
CREATE TABLE IF NOT EXISTS `sso_trusted_systems` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `system_key` VARCHAR(100) NOT NULL UNIQUE,
    `system_name` VARCHAR(255) NOT NULL,
    `base_url` VARCHAR(512) NOT NULL,
    `landing_path` VARCHAR(255) DEFAULT '/landing',
    `description` TEXT DEFAULT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT TRUE,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    `created_by` INT DEFAULT NULL,
    `updated_by` INT DEFAULT NULL,
    INDEX `idx_system_key` (`system_key`),
    INDEX `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- sso_audit_logs テーブル
CREATE TABLE IF NOT EXISTS `sso_audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY,
    `user_id` INT NOT NULL,
    `ticket_id` INT DEFAULT NULL,
    `source_system` VARCHAR(100) DEFAULT NULL,
    `target_system` VARCHAR(100) NOT NULL,
    `action` VARCHAR(50) NOT NULL,
    `ip_address` VARCHAR(45) DEFAULT NULL,
    `user_agent` TEXT DEFAULT NULL,
    `success` BOOLEAN NOT NULL DEFAULT TRUE,
    `error_message` TEXT DEFAULT NULL,
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_ticket_id` (`ticket_id`),
    INDEX `idx_source_system` (`source_system`),
    INDEX `idx_target_system` (`target_system`),
    INDEX `idx_action` (`action`),
    INDEX `idx_created_at` (`created_at`),
    FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`ticket_id`) REFERENCES `sso_tickets`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 11.3 バージョン情報

- **APIバージョン**: 1.0.0
- **最終更新日**: 2024年
- **実装言語**: Node.js / Express.js
- **データベース**: MySQL 8.0

---

## 12. 変更履歴

| 日付 | バージョン | 変更内容 |
|------|-----------|---------|
| 2024-XX-XX | 1.0.0 | 初版リリース |

---

**本仕様書に関するお問い合わせ**: StudySphere開発チーム

