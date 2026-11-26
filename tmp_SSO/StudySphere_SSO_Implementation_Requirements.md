# StudySphere SSO Hub構想 - 実装要件一覧

## 概要

本ドキュメントは、StudySphere SSO Hub構想を実現するために、StudySphere側で実装が必要な機能を網羅的にまとめたものです。既存の一時パスワード認証システムを基盤として、より汎用的で安全なSSO（Single Sign-On）システムへ拡張するための要件を定義します。

---

## 1. データベーススキーマ追加

### 1.1 SSOチケット管理テーブル

**テーブル名:** `sso_tickets`

**用途:** ワンタイムチケット（Artifact）の生成・検証・有効期限管理

```sql
CREATE TABLE `sso_tickets` (
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'チケットID',
    `ticket` VARCHAR(128) NOT NULL UNIQUE COMMENT 'チケット文字列（art-{random}形式）',
    `user_id` INT NOT NULL COMMENT 'ユーザーID（user_accounts.id）',
    `source_system` VARCHAR(100) DEFAULT NULL COMMENT '遷移元システム識別子',
    `target_system` VARCHAR(100) NOT NULL COMMENT '遷移先システム識別子',
    `context` VARCHAR(255) DEFAULT NULL COMMENT '生成コンテキスト（menu_click, transit, etc.）',
    `used` BOOLEAN NOT NULL DEFAULT FALSE COMMENT '使用済みフラグ',
    `used_at` DATETIME DEFAULT NULL COMMENT '使用日時',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時（日本時間）',
    `expires_at` DATETIME NOT NULL COMMENT '有効期限（日本時間、通常は30-60秒後）',
    `ip_address` VARCHAR(45) DEFAULT NULL COMMENT '生成元IPアドレス',
    `user_agent` TEXT DEFAULT NULL COMMENT '生成元User-Agent',
    INDEX `idx_ticket` (`ticket`),
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_target_system` (`target_system`),
    INDEX `idx_expires_at` (`expires_at`),
    INDEX `idx_used` (`used`),
    FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='SSOワンタイムチケット管理テーブル';
```

### 1.2 信頼システム管理テーブル

**テーブル名:** `sso_trusted_systems`

**用途:** SSO連携を許可するシステム（Allowlist）の管理

```sql
CREATE TABLE `sso_trusted_systems` (
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'システムID',
    `system_key` VARCHAR(100) NOT NULL UNIQUE COMMENT 'システム識別子（system_a, system_b, support_app等）',
    `system_name` VARCHAR(255) NOT NULL COMMENT 'システム表示名',
    `base_url` VARCHAR(512) NOT NULL COMMENT 'ベースURL（リダイレクト先検証用）',
    `landing_path` VARCHAR(255) DEFAULT '/landing' COMMENT 'ランディングパス',
    `description` TEXT DEFAULT NULL COMMENT 'システム説明',
    `enabled` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '有効フラグ',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '作成日時（日本時間）',
    `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新日時（日本時間）',
    `created_by` INT DEFAULT NULL COMMENT '作成者ID',
    `updated_by` INT DEFAULT NULL COMMENT '更新者ID',
    INDEX `idx_system_key` (`system_key`),
    INDEX `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='SSO連携信頼システム管理テーブル';
```

### 1.3 SSO監査ログテーブル

**テーブル名:** `sso_audit_logs`

**用途:** SSO遷移の監査ログ（誰が、どこから、どこへ移動したか）

```sql
CREATE TABLE `sso_audit_logs` (
    `id` INT AUTO_INCREMENT PRIMARY KEY COMMENT 'ログID',
    `user_id` INT NOT NULL COMMENT 'ユーザーID',
    `ticket_id` INT DEFAULT NULL COMMENT 'チケットID（sso_tickets.id）',
    `source_system` VARCHAR(100) DEFAULT NULL COMMENT '遷移元システム',
    `target_system` VARCHAR(100) NOT NULL COMMENT '遷移先システム',
    `action` VARCHAR(50) NOT NULL COMMENT 'アクション種別（generate, verify, dispatch, failed）',
    `ip_address` VARCHAR(45) DEFAULT NULL COMMENT 'IPアドレス',
    `user_agent` TEXT DEFAULT NULL COMMENT 'User-Agent',
    `success` BOOLEAN NOT NULL DEFAULT TRUE COMMENT '成功フラグ',
    `error_message` TEXT DEFAULT NULL COMMENT 'エラーメッセージ',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '実行日時（日本時間）',
    INDEX `idx_user_id` (`user_id`),
    INDEX `idx_ticket_id` (`ticket_id`),
    INDEX `idx_source_system` (`source_system`),
    INDEX `idx_target_system` (`target_system`),
    INDEX `idx_action` (`action`),
    INDEX `idx_created_at` (`created_at`),
    FOREIGN KEY (`user_id`) REFERENCES `user_accounts`(`id`) ON DELETE CASCADE,
    FOREIGN KEY (`ticket_id`) REFERENCES `sso_tickets`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci 
COMMENT='SSO監査ログテーブル';
```

---

## 2. バックエンドAPI実装

### 2.1 チケット生成API

**エンドポイント:** `POST /api/sso/ticket/generate`

**認証:** JWT認証必須（内部システムからの呼び出しのみ）

**用途:** 
- Outbound: StudySphereから他システムへ遷移する際のチケット生成
- Transit: システム間遷移時のチケット交換

**リクエストボディ:**
```json
{
  "target_system": "system_b",
  "context": "menu_click",
  "source_system": "studysphere"  // 省略可（自動判定）
}
```

**レスポンス（成功）:**
```json
{
  "success": true,
  "data": {
    "ticket": "art-abc123xyz789-random",
    "expires_in": 30,
    "expires_at": "2024-01-01T12:00:30+09:00"
  }
}
```

**実装要件:**
- JWT認証ミドルウェアでユーザー情報を取得
- `target_system` が `sso_trusted_systems` に登録されているか検証
- ランダムなチケット文字列を生成（`art-{32文字のランダム文字列}`）
- 有効期限は30秒〜60秒（設定可能）
- `sso_tickets` テーブルに保存
- `sso_audit_logs` に生成ログを記録

### 2.2 チケット検証API

**エンドポイント:** `POST /api/sso/ticket/verify`

**認証:** パブリック（信頼システムからの呼び出し）

**用途:** 
- Inbound: 外部システムからStudySphereへの遷移時
- Transit/Outbound: 遷移先システムでのチケット検証

**リクエストボディ:**
```json
{
  "ticket": "art-abc123xyz789-random"
}
```

**レスポンス（成功）:**
```json
{
  "valid": true,
  "data": {
    "user_id": 101,
    "username": "user_name",
    "name": "ユーザー名",
    "role": 1,
    "source_system": "system_a",
    "target_system": "system_b"
  }
}
```

**レスポンス（失敗）:**
```json
{
  "valid": false,
  "error": "INVALID_TICKET" | "EXPIRED_TICKET" | "ALREADY_USED"
}
```

**実装要件:**
- チケットの存在確認
- 有効期限チェック
- 使用済みチェック（`used = true` の場合は拒否）
- 検証成功時に `used = true`, `used_at = NOW()` に更新
- `sso_audit_logs` に検証ログを記録（成功・失敗ともに）

### 2.3 信頼システム管理API（管理者用）

**エンドポイント群:**
- `GET /api/sso/systems` - 信頼システム一覧取得
- `POST /api/sso/systems` - 信頼システム追加
- `PUT /api/sso/systems/:id` - 信頼システム更新
- `DELETE /api/sso/systems/:id` - 信頼システム削除（論理削除）

**認証:** 管理者ロール必須（ロール5以上）

**実装要件:**
- CRUD操作の実装
- `base_url` の正規化（末尾のスラッシュ統一など）
- URL形式のバリデーション
- 削除時は `enabled = false` に更新（物理削除しない）

### 2.4 SSO監査ログ取得API（管理者用）

**エンドポイント:** `GET /api/sso/audit-logs`

**認証:** 管理者ロール必須（ロール5以上）

**クエリパラメータ:**
- `user_id` - ユーザーIDでフィルタ
- `source_system` - 遷移元システムでフィルタ
- `target_system` - 遷移先システムでフィルタ
- `action` - アクション種別でフィルタ
- `start_date` - 開始日時
- `end_date` - 終了日時
- `page` - ページ番号（デフォルト: 1）
- `limit` - 1ページあたりの件数（デフォルト: 50）

**実装要件:**
- ページネーション対応
- フィルタリング機能
- ソート機能（デフォルト: `created_at DESC`）

---

## 3. フロントエンド実装

### 3.1 SSO Dispatcher（ルーティングコンポーネント）

**ファイル:** `studysphere-frontend/src/pages/SSODispatcherPage.js`

**ルート:** `/sso-dispatch`

**用途:** 
- クエリパラメータから遷移元・遷移先を判断
- チケット検証・生成・リダイレクトを実行

**クエリパラメータ:**
- `target` - 遷移先システム（必須）
- `ticket` - 遷移元からのチケット（Inbound/Transit時）
- `source` - 遷移元システム（省略可）

**処理フロー:**
1. ログインセッション確認
   - 未ログインの場合 → ログインページへリダイレクト（`return_url` パラメータ付き）
2. 遷移元チケット検証（`ticket` パラメータがある場合）
   - `/api/sso/ticket/verify` を呼び出し
   - 検証失敗 → エラーページ表示
3. 遷移先システムの検証
   - `target` が信頼システムリストに存在するか確認
   - 存在しない → エラーページ表示
4. 遷移先用チケット生成
   - `/api/sso/ticket/generate` を呼び出し
   - `target_system` と `source_system` を指定
5. リダイレクト実行
   - `{base_url}/{landing_path}?ticket={generated_ticket}` へリダイレクト

**実装要件:**
- React Router を使用
- ローディング状態の表示
- エラーハンドリング（ネットワークエラー、検証失敗等）
- ログイン未完了時のリダイレクト先URL保持

### 3.2 AutoLoginPageの拡張（既存機能の統合）

**ファイル:** `studysphere-frontend/src/pages/AutoLoginPage.js`

**変更内容:**
- 既存の `loginCode` + `tempPassword` 方式を維持
- 新たに `ticket` パラメータ方式に対応
- クエリパラメータの優先順位: `ticket` > `loginCode` + `tempPassword`

**処理フロー（ticket方式）:**
1. クエリパラメータから `ticket` を取得
2. `/api/sso/ticket/verify` を呼び出し
3. 検証成功 → JWTトークン発行（既存の認証フロー）
4. ダッシュボードへリダイレクト

### 3.3 システム遷移リンクコンポーネント

**ファイル:** `studysphere-frontend/src/components/SSOLink.js`

**用途:** StudySphere内のメニューから他システムへ遷移するためのリンクコンポーネント

**Props:**
```javascript
{
  targetSystem: 'system_b',
  children: 'システムBへ移動',
  className: 'custom-class'
}
```

**実装要件:**
- クリック時に `/sso-dispatch?target={targetSystem}` へ遷移
- ローディング状態の表示
- エラーハンドリング

### 3.4 管理者画面：信頼システム管理UI

**ファイル群:**
- `studysphere-frontend/src/pages/admin/SSOTrustedSystems.js` - 一覧・追加・編集画面
- `studysphere-frontend/src/components/admin/SSOSystemForm.js` - システム登録フォーム

**機能要件:**
- 信頼システムの一覧表示
- 新規システム追加フォーム
- システム編集・無効化機能
- ベースURLのバリデーション
- システム識別子の重複チェック

---

## 4. バックエンド実装詳細

### 4.1 SSO Controller の作成

**ファイル:** `studysphere-backend/backend/scripts/ssoController.js`

**主要メソッド:**
- `generateTicket(userId, targetSystem, sourceSystem, context)` - チケット生成
- `verifyTicket(ticket)` - チケット検証
- `getTrustedSystem(systemKey)` - 信頼システム取得
- `logAudit(userId, ticketId, sourceSystem, targetSystem, action, success, errorMessage)` - 監査ログ記録
- `cleanupExpiredTickets()` - 期限切れチケットのクリーンアップ（バッチ処理）

**実装要件:**
- チケット文字列の生成（crypto.randomBytes を使用）
- 有効期限の計算（設定ファイルまたは環境変数から取得）
- トランザクション管理（チケット生成とログ記録）
- エラーハンドリング

### 4.2 SSO Routes の作成

**ファイル:** `studysphere-backend/backend/routes/ssoRoutes.js`

**ルート定義:**
```javascript
// チケット生成（認証必須）
router.post('/ticket/generate', authenticateToken, generateTicket);

// チケット検証（パブリック）
router.post('/ticket/verify', verifyTicket);

// 信頼システム管理（管理者のみ）
router.get('/systems', authenticateToken, requireRole(5), getTrustedSystems);
router.post('/systems', authenticateToken, requireRole(5), createTrustedSystem);
router.put('/systems/:id', authenticateToken, requireRole(5), updateTrustedSystem);
router.delete('/systems/:id', authenticateToken, requireRole(5), deleteTrustedSystem);

// 監査ログ取得（管理者のみ）
router.get('/audit-logs', authenticateToken, requireRole(5), getAuditLogs);
```

### 4.3 ミドルウェア: 信頼システム検証

**ファイル:** `studysphere-backend/backend/middleware/ssoValidation.js`

**機能:**
- リクエストボディの `target_system` が信頼システムリストに存在するか検証
- 存在しない場合、403エラーを返す
- オープンリダイレクト脆弱性の防止

### 4.4 バッチ処理: 期限切れチケットクリーンアップ

**ファイル:** `studysphere-backend/backend/scripts/ssoCleanupJob.js`

**機能:**
- 定期的に期限切れチケットを削除
- 使用済みチケットの一定期間後の削除
- CronジョブまたはNode-cronで実装

**実行頻度:** 1時間毎または1日1回

---

## 5. セキュリティ実装

### 5.1 Artifact Binding（チケット方式）

**実装要件:**
- URLには永続的なトークン（JWT等）を含めない
- チケットは30秒〜60秒で自動失効
- チケットは一度使用したら即座に無効化（`used = true`）
- チケット文字列は推測不可能なランダム文字列（32文字以上）

### 5.2 Allowlist（許可リスト）管理

**実装要件:**
- `sso_trusted_systems` テーブルで管理
- Dispatcherがリダイレクトできるのは登録済みシステムのみ
- `base_url` のドメイン検証
- ワイルドカードや相対パスの使用を禁止

### 5.3 レート制限

**実装要件:**
- チケット生成API: ユーザーあたり1分間に10回まで
- チケット検証API: IPアドレスあたり1分間に100回まで
- express-rate-limit を使用

### 5.4 監査ログ

**実装要件:**
- すべてのSSOアクション（生成・検証・ディスパッチ）を記録
- ログには以下を含める:
  - ユーザーID
  - チケットID
  - 遷移元・遷移先システム
  - IPアドレス
  - User-Agent
  - 成功/失敗
  - エラーメッセージ（失敗時）

---

## 6. 設定・環境変数

### 6.1 環境変数追加

```bash
# SSOチケット設定
SSO_TICKET_EXPIRY_SECONDS=30  # チケット有効期限（秒）
SSO_TICKET_LENGTH=32          # チケット文字列の長さ

# SSO監査ログ設定
SSO_AUDIT_LOG_RETENTION_DAYS=90  # ログ保持期間（日）

# レート制限設定
SSO_RATE_LIMIT_GENERATE_WINDOW_MS=60000  # チケット生成レート制限ウィンドウ（ミリ秒）
SSO_RATE_LIMIT_GENERATE_MAX=10           # チケット生成最大回数
SSO_RATE_LIMIT_VERIFY_WINDOW_MS=60000    # チケット検証レート制限ウィンドウ（ミリ秒）
SSO_RATE_LIMIT_VERIFY_MAX=100            # チケット検証最大回数
```

### 6.2 デフォルト信頼システムの初期データ

**マイグレーションファイル:** `studysphere-backend/db/migrations/insert_default_sso_systems.sql`

```sql
INSERT INTO `sso_trusted_systems` 
  (`system_key`, `system_name`, `base_url`, `landing_path`, `description`, `enabled`)
VALUES
  ('support_app', 'サポートアプリ', 'http://localhost:5050', '/landing', 'StudySphereサポートアプリ', TRUE),
  ('studysphere', 'StudySphere', 'https://studysphere.example.com', '/auto-login', 'StudySphere本体（自己参照用）', TRUE);
```

---

## 7. 既存システムとの統合

### 7.1 一時パスワード認証との共存

**方針:**
- 既存の `loginCode` + `tempPassword` 方式は維持
- 新しい `ticket` 方式を並行運用
- `AutoLoginPage` で両方式に対応

### 7.2 サポートアプリとの連携拡張

**変更内容:**
- サポートアプリからの遷移時、一時パスワード方式からチケット方式へ移行を検討
- または、一時パスワード方式をラッパーとして、内部でチケット方式を使用

### 7.3 既存の認証フローとの統合

**方針:**
- JWTトークン発行は既存の `authController` を使用
- チケット検証成功後、既存のログイン処理を呼び出す
- `AuthContext` との互換性を維持

---

## 8. テスト要件

### 8.1 ユニットテスト

- チケット生成ロジック
- チケット検証ロジック
- 有効期限チェック
- 使用済みチェック
- 信頼システム検証

### 8.2 統合テスト

- Outbound遷移フロー（StudySphere → 他システム）
- Inbound遷移フロー（他システム → StudySphere）
- Transit遷移フロー（他システムA → StudySphere → 他システムB）
- エラーケース（無効チケット、期限切れ、未登録システム等）

### 8.3 E2Eテスト

- ブラウザでの実際の遷移フロー
- ログイン未完了時のリダイレクト
- 複数システム間の遷移

---

## 9. ドキュメント要件

### 9.1 API仕様書の更新

- SSO APIエンドポイントの追加
- リクエスト/レスポンス形式の明記
- エラーレスポンスの定義

### 9.2 開発者向けガイド

- 新規システムの登録方法
- SSO連携の実装方法
- トラブルシューティング

### 9.3 運用手順書

- 信頼システムの追加・削除手順
- 監査ログの確認方法
- 障害時の対応手順

---

## 10. マイグレーション計画

### 10.1 段階的ロールアウト

**フェーズ1: 基盤構築**
1. データベーステーブル作成
2. バックエンドAPI実装
3. ユニットテスト・統合テスト

**フェーズ2: フロントエンド実装**
1. SSO Dispatcher実装
2. AutoLoginPage拡張
3. 管理者画面実装

**フェーズ3: 既存システム統合**
1. サポートアプリとの連携テスト
2. 既存認証フローとの統合確認

**フェーズ4: 本番展開**
1. ステージング環境での検証
2. 本番環境へのデプロイ
3. モニタリング・監視設定

### 10.2 ロールバック計画

- データベースマイグレーションのロールバックSQL
- 機能フラグによる段階的無効化
- 既存の一時パスワード方式へのフォールバック

---

## 11. パフォーマンス考慮事項

### 11.1 データベース最適化

- チケット検索のインデックス最適化
- 期限切れチケットの定期クリーンアップ
- 監査ログのパーティショニング検討（大量データ時）

### 11.2 キャッシュ戦略

- 信頼システムリストのキャッシュ（Redis推奨）
- チケット生成・検証の頻度が高い場合は、インメモリキャッシュを検討

### 11.3 非同期処理

- 監査ログ記録は非同期処理（キューイング）を検討
- チケット生成時のログ記録を非ブロッキング化

---

## 12. 監視・アラート

### 12.1 監視指標

- チケット生成・検証の成功率
- チケット検証失敗率（異常値検知）
- SSO遷移の完了率
- 監査ログの記録状況

### 12.2 アラート設定

- チケット検証失敗率が一定値を超えた場合
- 期限切れチケットの使用試行が多発した場合
- 未登録システムへのリダイレクト試行が検出された場合

---

## まとめ

StudySphere SSO Hub構想を実現するためには、上記の機能実装が必要です。特に重要なのは：

1. **セキュリティ**: Artifact Binding、Allowlist管理、監査ログ
2. **拡張性**: 信頼システムの動的管理、設定可能な有効期限
3. **互換性**: 既存システムとの共存、段階的移行

これらの実装により、StudySphereを認証のハブとして機能させ、複数システム間でのシームレスなSSO遷移を実現できます。

