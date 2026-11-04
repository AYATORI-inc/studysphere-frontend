# StudySphere Backend API 仕様書

## 概要

StudySphere Backend APIは、カリキュラムポータルシステムのバックエンドAPIです。Node.js/Express.js、MySQL、JWT認証を使用して構築されています。

### 基本情報
- **ベースURL**: `http://localhost:5050` (開発環境)
- **認証方式**: JWT (JSON Web Token)
- **データベース**: MySQL 8.0
- **時間管理**: バックエンド（UTC）⇔フロントエンド（JST）変換

### 技術スタック
- **フレームワーク**: Express.js 4.18.2
- **認証**: JWT (jsonwebtoken)
- **データベース**: MySQL2
- **ファイルストレージ**: AWS S3
- **AI機能**: OpenAI GPT-4o
- **PDF処理**: pdf-parse, pdfjs-dist
- **バリデーション**: express-validator

## 認証システム

### ロール体系
- **ロール10**: マスターユーザー（システム管理者）
- **ロール9**: アドミン（管理者）
- **ロール5**: 管理者（拠点管理者）
- **ロール4**: 指導員
- **ロール1**: 利用者

### 認証フロー
1. 管理者ログイン: `/api/login`
2. 指導員ログイン: `/api/instructor-login`
3. トークンリフレッシュ: `/api/refresh`
4. ログアウト: `/api/logout`

## API エンドポイント一覧

### 1. 認証関連 (`/api`)

#### POST `/api/login`
管理者ログイン

**リクエスト:**
```json
{
  "username": "admin001",
  "password": "admin123"
}
```

**レスポンス:**
```json
{
  "success": true,
  "message": "ログインに成功しました",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "user": {
      "userId": 1,
      "userName": "admin001",
      "role": 9
    }
  }
}
```

#### POST `/api/instructor-login`
指導員ログイン（企業・拠点選択）

**リクエスト:**
```json
{
  "username": "instructor001",
  "password": "password123",
  "companyId": 1,
  "satelliteId": 1
}
```

#### POST `/api/refresh`
トークンリフレッシュ

**リクエスト:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### POST `/api/logout`
ログアウト

**リクエスト:**
```json
{
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

#### GET `/api/user-info`
現在のユーザー情報取得

**ヘッダー:**
```
Authorization: Bearer <access_token>
```

### 2. 企業管理 (`/api/companies`)

#### GET `/api/companies`
企業一覧取得

**レスポンス:**
```json
[
  {
    "id": 1,
    "name": "株式会社サンプル",
    "address": "東京都渋谷区...",
    "phone": "03-1234-5678",
    "token": "COMP-0001-0001",
    "token_issued_at": "2024-01-01T00:00:00.000Z",
    "created_at": "2024-01-01T00:00:00.000Z",
    "updated_at": "2024-01-01T00:00:00.000Z"
  }
]
```

#### GET `/api/companies/:id`
企業詳細取得

#### POST `/api/companies`
企業作成

**リクエスト:**
```json
{
  "name": "株式会社新規企業",
  "address": "東京都新宿区...",
  "phone": "03-9876-5432"
}
```

#### PUT `/api/companies/:id`
企業更新

#### DELETE `/api/companies/:id`
企業削除

#### POST `/api/companies/:id/regenerate-token`
企業トークン再生成

### 3. 拠点管理 (`/api/satellites`)

#### GET `/api/satellites`
拠点一覧取得

#### GET `/api/satellites/:id`
拠点詳細取得

#### GET `/api/satellites/by-ids?ids=[1,2,3]`
複数拠点取得

#### POST `/api/satellites`
拠点作成

**リクエスト:**
```json
{
  "company_id": 1,
  "name": "渋谷拠点",
  "address": "東京都渋谷区...",
  "phone": "03-1234-5678",
  "office_type_id": 1,
  "contract_type": "30days",
  "max_users": 50
}
```

#### PUT `/api/satellites/:id`
拠点更新

#### DELETE `/api/satellites/:id`
拠点削除

#### GET `/api/satellites/:id/users`
拠点所属ユーザー一覧取得

#### GET `/api/satellites/:id/instructors`
拠点指導員一覧取得

#### GET `/api/satellites/:id/stats`
拠点統計情報取得

#### GET `/api/satellites/:id/disabled-courses`
無効化コース一覧取得

#### PUT `/api/satellites/:id/disabled-courses`
無効化コース一覧更新

### 4. ユーザー管理 (`/api/users`)

#### GET `/api/users`
利用者一覧取得

#### POST `/api/users/create`
利用者作成

**リクエスト:**
```json
{
  "name": "田中太郎",
  "email": "tanaka@example.com",
  "role": 1,
  "company_id": 1,
  "satellite_ids": [1, 2],
  "is_remote_user": false,
  "recipient_number": "1234567890"
}
```

#### POST `/api/users/bulk-create`
一括利用者追加

**リクエスト:**
```json
{
  "users": [
    {
      "name": "利用者1",
      "email": "user1@example.com",
      "role": 1,
      "company_id": 1,
      "satellite_ids": [1]
    },
    {
      "name": "利用者2",
      "email": "user2@example.com",
      "role": 1,
      "company_id": 1,
      "satellite_ids": [1]
    }
  ]
}
```

#### PUT `/api/users/:userId`
利用者更新

#### DELETE `/api/users/:userId`
利用者削除

#### POST `/api/users/:userId/reset-password`
パスワードリセット

#### POST `/api/users/:userId/change-password`
パスワード変更

**リクエスト:**
```json
{
  "currentPassword": "oldpassword",
  "newPassword": "newpassword"
}
```

#### POST `/api/users/:userId/issue-temp-password`
一時パスワード発行

#### POST `/api/users/verify-temp-password`
一時パスワード検証

**リクエスト:**
```json
{
  "loginCode": "USER-0001-0001",
  "tempPassword": "1234-5678"
}
```

#### GET `/api/users/:userId/satellites`
所属拠点一覧取得

#### POST `/api/users/:userId/satellites`
拠点追加

#### DELETE `/api/users/:userId/satellites/:satelliteId`
拠点削除

#### GET `/api/users/:userId/specializations`
指導員専門分野一覧取得

#### POST `/api/users/:userId/specializations`
専門分野追加

#### PUT `/api/users/:userId/specializations/:specializationId`
専門分野更新

#### DELETE `/api/users/:userId/specializations/:specializationId`
専門分野削除

### 5. 管理者管理 (`/api/admins`)

#### GET `/api/admins`
管理者一覧取得

#### POST `/api/admins`
管理者作成

#### PUT `/api/admins/:adminId`
管理者更新

#### DELETE `/api/admins/:adminId`
管理者削除（論理削除）

#### POST `/api/admins/:adminId/restore`
管理者復元

#### DELETE `/api/admins/:adminId/permanent`
管理者物理削除

### 6. コース管理 (`/api/courses`)

#### GET `/api/courses`
コース一覧取得

#### GET `/api/courses/:id`
コース詳細取得

#### POST `/api/courses`
コース作成

**リクエスト:**
```json
{
  "title": "基礎プログラミング",
  "description": "プログラミングの基礎を学ぶコース",
  "category": "必修科目",
  "order_index": 1,
  "status": "active"
}
```

#### PUT `/api/courses/:id`
コース更新

#### DELETE `/api/courses/:id`
コース削除

#### PUT `/api/courses/order`
コース順序更新

### 7. レッスン管理 (`/api/lessons`)

#### GET `/api/lessons`
レッスン一覧取得

#### GET `/api/lessons/:id`
レッスン詳細取得

#### POST `/api/lessons`
レッスン作成（ファイルアップロード対応）

**リクエスト:**
```
Content-Type: multipart/form-data

{
  "title": "JavaScript基礎",
  "description": "JavaScriptの基本構文を学ぶ",
  "course_id": 1,
  "duration": "60分",
  "has_assignment": true,
  "file": <ファイル>
}
```

#### PUT `/api/lessons/:id`
レッスン更新

#### DELETE `/api/lessons/:id`
レッスン削除

#### GET `/api/lessons/:id/download`
レッスンファイルダウンロード

#### GET `/api/lessons/:id/files`
レッスンファイル一覧取得

### 8. 学習管理 (`/api/learning`)

#### GET `/api/learning/progress/:userId`
ユーザー進捗取得

#### GET `/api/learning/progress/:userId/course/:courseId`
コース進捗取得

#### PUT `/api/learning/progress/lesson`
レッスン進捗更新

#### GET `/api/learning/current-lesson`
現在受講中レッスン取得

#### POST `/api/learning/upload-assignment`
成果物アップロード

**リクエスト:**
```
Content-Type: multipart/form-data

{
  "lessonId": 1,
  "file": <ZIPファイル>
}
```

#### GET `/api/learning/lesson/:lessonId/uploaded-files`
アップロード済みファイル取得

#### DELETE `/api/learning/lesson/:lessonId/uploaded-files/:fileId`
アップロード済みファイル削除

#### GET `/api/learning/lesson/:lessonId/assignment-status`
課題提出状況確認

#### POST `/api/learning/test/submit`
テスト結果提出

#### GET `/api/learning/test/results/:userId`
テスト結果取得

#### POST `/api/learning/approve-completion`
指導員承認

#### GET `/api/learning/lesson/:lessonId/content`
レッスンコンテンツ取得

#### POST `/api/learning/assign-course`
利用者とコースの関連付け

#### GET `/api/learning/certificate/:userId/:lessonId`
合格証明書取得

#### GET `/api/learning/certificates/:userId`
利用者証明書一覧取得

### 9. AI機能 (`/api/ai`)

#### POST `/api/ai/assist`
AIアシスタント

**リクエスト:**
```json
{
  "question": "JavaScriptの変数宣言について教えてください",
  "context": "レッスンのテキスト内容...",
  "lessonTitle": "JavaScript基礎",
  "model": "gpt-4o",
  "maxTokens": 1000,
  "temperature": 0.3,
  "lessonId": 1
}
```

**レスポンス:**
```json
{
  "success": true,
  "answer": "JavaScriptの変数宣言には...",
  "usage": {
    "promptTokens": 500,
    "completionTokens": 200,
    "totalTokens": 700
  }
}
```

#### GET `/api/ai/status`
AI機能状態確認

#### GET `/api/ai/section-text/:lessonId`
セクションテキスト取得

#### GET `/api/ai/pdf-status/:userId`
PDF処理状態確認

### 10. ダッシュボード (`/api/dashboard`)

#### GET `/api/dashboard`
ダッシュボード概要取得

#### GET `/api/dashboard/overview`
システム概要取得

#### GET `/api/dashboard/company/:id`
企業統計取得

#### GET `/api/dashboard/alerts`
アラート一覧取得

### 11. ログ管理 (`/api/logs`)

#### GET `/api/logs`
ログファイル一覧取得

#### GET `/api/logs/:filename`
ログ内容取得

#### GET `/api/logs/:filename/download`
ログファイルダウンロード

#### DELETE `/api/logs/:filename`
ログファイル削除

#### POST `/api/logs/cleanup`
古いログクリーンアップ

#### GET `/api/logs/stats`
ログ統計取得

### 12. 操作ログ (`/api/operation-logs`)

#### GET `/api/operation-logs`
操作ログ一覧取得

#### GET `/api/operation-logs/stats`
操作ログ統計取得

#### GET `/api/operation-logs/export`
操作ログエクスポート

#### DELETE `/api/operation-logs`
操作ログクリア

### 13. 現在受講中レッスン管理 (`/api/current-lesson`)

#### GET `/api/current-lesson`
現在受講中レッスン取得

#### PUT `/api/current-lesson`
現在受講中レッスン更新

#### PUT `/api/current-lesson/:courseId/pause`
現在受講中レッスンの一時停止

#### PUT `/api/current-lesson/:courseId/resume`
現在受講中レッスンの再開

### 14. カリキュラムパス管理 (`/api/curriculum-paths`)

#### GET `/api/curriculum-paths`
カリキュラムパス一覧取得

#### GET `/api/curriculum-paths/available-courses`
利用可能コース一覧取得

#### GET `/api/curriculum-paths/:id`
カリキュラムパス詳細取得

#### POST `/api/curriculum-paths`
カリキュラムパス作成

#### PUT `/api/curriculum-paths/:id`
カリキュラムパス更新

#### DELETE `/api/curriculum-paths/:id`
カリキュラムパス削除

### 15. 指導員専門分野管理 (`/api/instructors`)

#### GET `/api/instructors/:userId/specializations`
指導員専門分野一覧取得

#### POST `/api/instructors/:userId/specializations`
指導員専門分野一括設定

#### DELETE `/api/instructors/:userId/specializations/:specializationId`
指導員専門分野削除

#### POST `/api/instructors/:instructorId/set-manager/:satelliteId`
指導員を拠点管理者に設定

#### POST `/api/instructors/:instructorId/remove-manager/:satelliteId`
指導員の拠点管理者権限を解除

### 16. レッスンテキストファイル管理 (`/api/lesson-text-files`)

#### GET `/api/lesson-text-files/lesson/:lessonId`
レッスンの複数テキストファイル一覧取得

#### POST `/api/lesson-text-files`
複数テキストファイルアップロード

#### DELETE `/api/lesson-text-files/:id`
複数テキストファイル削除

#### PUT `/api/lesson-text-files/:id/order`
複数テキストファイル順序更新

#### PUT `/api/lesson-text-files/lesson/:lessonId/order`
複数テキストファイル一括順序更新

### 17. レッスンテキスト・動画リンク管理 (`/api/lesson-text-video-links`)

#### GET `/api/lesson-text-video-links/lesson/:lessonId`
テキストと動画の紐づけ取得

#### GET `/api/lesson-text-video-links/:id`
テキスト・動画リンク詳細取得

#### POST `/api/lesson-text-video-links`
テキストと動画の紐づけ作成

#### PUT `/api/lesson-text-video-links/:id`
テキスト・動画リンク更新

#### DELETE `/api/lesson-text-video-links/:id`
テキスト・動画リンク削除

#### PUT `/api/lesson-text-video-links/order`
テキスト・動画リンク順序更新

#### POST `/api/lesson-text-video-links/bulk-upsert`
複数紐づけの一括作成・更新

### 18. レッスン動画管理 (`/api/lesson-videos`)

#### GET `/api/lesson-videos/lesson/:lessonId`
レッスン動画一覧取得

#### GET `/api/lesson-videos/:id`
レッスン動画詳細取得

#### POST `/api/lesson-videos`
レッスン動画作成

#### PUT `/api/lesson-videos/:id`
レッスン動画更新

#### DELETE `/api/lesson-videos/:id`
レッスン動画削除

#### PUT `/api/lesson-videos/order`
レッスン動画順序更新

#### POST `/api/lesson-videos/bulk-upsert`
複数動画の一括作成・更新

### 19. 管理者拠点管理 (`/api/managers`)

#### GET `/api/managers/:managerId/satellites`
管理者が管理する拠点一覧取得

### 20. 事業所タイプ管理 (`/api/office-types`)

#### GET `/api/office-types`
事業所タイプ一覧取得

#### POST `/api/office-types`
事業所タイプ作成

#### DELETE `/api/office-types/:id`
事業所タイプ削除

### 21. PDF処理管理 (`/api/pdf`)

#### GET `/api/pdf/health`
PDF処理APIヘルスチェック

#### POST `/api/pdf/upload`
PDFファイルアップロード・処理開始

#### GET `/api/pdf/status/:processId`
PDF処理状態確認

#### GET `/api/pdf/user-status`
ユーザーのPDF処理状態一覧取得

#### GET `/api/pdf/result/:processId`
PDF処理結果取得

#### GET `/api/pdf/stats`
PDF処理統計取得（管理者用）

#### POST `/api/pdf/cancel/:processId`
PDF処理キャンセル

### 22. 個別支援計画管理 (`/api/support-plans`)

#### GET `/api/support-plans`
個別支援計画一覧取得

#### GET `/api/support-plans/user/:userId`
特定ユーザーの個別支援計画取得

#### POST `/api/support-plans`
個別支援計画作成

#### PUT `/api/support-plans/:id`
個別支援計画更新

#### DELETE `/api/support-plans/:id`
個別支援計画削除

#### POST `/api/support-plans/upsert`
個別支援計画作成または更新（upsert）

### 23. 一時パスワード管理 (`/api/temp-passwords`)

#### GET `/api/temp-passwords/instructors`
指導員一覧取得

#### GET `/api/temp-passwords/users`
一時パスワード対象利用者一覧取得

#### GET `/api/temp-passwords/hierarchy`
企業・拠点・担当者の階層構造取得

#### GET `/api/temp-passwords/users-by-hierarchy`
選択された企業・拠点・担当者に基づいて利用者を取得

#### POST `/api/temp-passwords/issue`
一時パスワードを一括発行

#### GET `/api/temp-passwords/list`
一時パスワード一覧取得

#### GET `/api/temp-passwords/status/:login_code`
一時パスワード状態確認（認証不要）

### 24. テスト・学習効果管理 (`/api/test`)

#### GET `/api/test/health`
ヘルスチェック

#### POST `/api/test/courses`
テスト用コース作成

#### GET `/api/test/courses`
テスト用コース一覧取得

#### GET `/api/test/learning/extract-text/:s3Key`
テキスト抽出API（テスト生成用）

#### POST `/api/test/learning/generate-test`
学習効果テスト生成API

#### POST `/api/test/learning/generate-feedback`
フィードバック生成API

#### POST `/api/test/learning/test/submit`
テスト結果提出API（採点機能付き）

#### GET `/api/test/instructor/student/:studentId/lesson-progress`
指導員用：利用者のレッスン進捗とテスト結果を取得

#### POST `/api/test/instructor/student/:studentId/lesson/:lessonId/approve`
指導員用：レッスン完了の承認

#### GET `/api/test/instructor/pending-approvals`
指導員用：未承認の合格テスト結果を取得

#### POST `/api/test/instructor/approve-test`
指導員用：テスト合格承認

### 25. 利用者コース管理 (`/api/user-courses`)

#### GET `/api/user-courses/satellite/:satelliteId/user-courses`
拠点内の利用者のコース関連付け一覧取得

#### GET `/api/user-courses/satellite/:satelliteId/available-courses`
拠点で利用可能なコース一覧取得

#### GET `/api/user-courses/satellite/:satelliteId/available-curriculum-paths`
拠点で利用可能なカリキュラムパス一覧取得

#### POST `/api/user-courses/satellite/:satelliteId/bulk-assign-courses`
利用者にコースを一括追加

#### POST `/api/user-courses/satellite/:satelliteId/bulk-remove-courses`
利用者からコースを一括削除

#### POST `/api/user-courses/satellite/:satelliteId/bulk-assign-curriculum-paths`
利用者にカリキュラムパスを一括追加

### 26. ユーザー名検証 (`/api/username`)

#### GET `/api/username/check/:username`
リアルタイムusername重複チェック

#### POST `/api/username/check-bulk`
複数usernameの一括重複チェック

#### GET `/api/username/suggestions/:baseUsername`
利用可能なusername候補を提案

### 27. 在宅支援管理 (`/api/remote-support`)

#### GET `/api/remote-support/health`
ヘルスチェック

#### POST `/api/remote-support/upload-capture`
画像アップロード（カメラ・スクリーンショット）

#### POST `/api/remote-support/mark-attendance`
勤怠打刻

#### POST `/api/remote-support/login`
ログイン

#### GET `/api/remote-support/check-temp-password/:loginCode`
一時パスワード監視

#### POST `/api/remote-support/auto-login`
自動ログイン

#### POST `/api/remote-support/notify-temp-password`
一時パスワード通知受信

#### GET `/api/remote-support/get-temp-password-notification/:loginCode`
一時パスワード通知取得

#### POST `/api/remote-support/verify-user-code`
スクールモード用：利用者コード検証

#### GET `/api/remote-support/daily-reports`
日報一覧取得

#### GET `/api/remote-support/daily-reports/:id`
日報詳細取得

#### PUT `/api/remote-support/daily-reports/:id`
日報更新

#### POST `/api/remote-support/daily-reports/:id/comments`
日報コメント追加

### 28. アナウンス管理 (`/api/announcements`)

#### GET `/api/announcements/user`
利用者用：アナウンス一覧取得

#### PUT `/api/announcements/user/:announcement_id/read`
利用者用：アナウンスを既読にする

#### PUT `/api/announcements/user/read-all`
利用者用：全アナウンスを既読にする

#### GET `/api/announcements/admin`
管理者用：アナウンス一覧取得

#### GET `/api/announcements/admin/users`
管理者用：利用者一覧取得（アナウンス送信用）

#### GET `/api/announcements/admin/instructors-for-filter`
管理者用：指導員一覧取得（フィルター用）

#### POST `/api/announcements/admin/create`
管理者用：アナウンス作成

#### GET `/api/announcements/admin/:announcement_id`
管理者用：アナウンス詳細取得

### 29. メッセージ管理 (`/api/messages`)

#### POST `/api/messages/send`
個人メッセージ送信

#### GET `/api/messages/conversations`
個人メッセージ一覧取得（送信者・受信者別）

#### GET `/api/messages/conversation/:other_user_id`
特定ユーザーとのメッセージ履歴取得

#### GET `/api/messages/unread-count`
未読メッセージ数取得

#### PUT `/api/messages/read/:message_id`
メッセージ既読更新

#### GET `/api/messages/students`
指導員が担当する利用者一覧取得（メッセージ送信用）

#### GET `/api/messages/instructors`
利用者が所属拠点の指導員一覧取得（メッセージ送信用）

#### GET `/api/messages/instructors-for-filter`
拠点の指導員一覧取得（フィルター用）

### 30. 利用者学習管理 (`/api/student`)

#### GET `/api/student/courses`
利用者のコース一覧取得（認証を柔軟に処理）

#### GET `/api/student/lessons`
利用者のレッスン一覧取得（認証を柔軟に処理）

#### GET `/api/student/lessons/:lessonId/progress`
利用者のレッスン進捗取得（認証を柔軟に処理）

#### PUT `/api/student/lessons/:lessonId/progress`
利用者のレッスン進捗更新（認証を柔軟に処理）

#### GET `/api/student/dashboard`
利用者のダッシュボード情報取得（認証を柔軟に処理）

### 31. 提出物管理 (`/api/submissions`)

#### GET `/api/submissions/instructor/pending-submissions/:satelliteId`
指導員用：拠点内の未承認提出物一覧取得

#### GET `/api/submissions/instructor/student/:studentId/submissions`
指導員用：特定利用者の提出物一覧取得

#### GET `/api/submissions/instructor/download/:submissionId`
指導員用：提出物ダウンロード

#### POST `/api/submissions/instructor/approve-submission`
指導員用：提出物承認

#### GET `/api/submissions/instructor/pending-count/:satelliteId`
指導員用：拠点内の未承認提出物件数取得（アラート用）

### 32. その他のエンドポイント

#### GET `/api/health`
ヘルスチェック

#### GET `/api/cors-test`
CORS設定確認

#### GET `/memory`
メモリ監視

#### GET `/memory/report`
メモリレポート

## データベーススキーマ

### 主要テーブル

#### user_accounts
ユーザー情報テーブル
```sql
CREATE TABLE `user_accounts` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `email` VARCHAR(255) DEFAULT NULL,
  `role` TINYINT NOT NULL,
  `status` TINYINT NOT NULL DEFAULT 1,
  `login_code` CHAR(14) NOT NULL,
  `company_id` INT DEFAULT NULL,
  `satellite_ids` JSON DEFAULT NULL,
  `is_remote_user` BOOLEAN NOT NULL DEFAULT FALSE,
  `recipient_number` VARCHAR(30) DEFAULT NULL,
  `password_reset_required` TINYINT(1) NOT NULL DEFAULT 0,
  `instructor_id` INT DEFAULT NULL
);
```

#### companies
企業情報テーブル
```sql
CREATE TABLE `companies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(255) NOT NULL,
  `address` TEXT DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `token` VARCHAR(14) DEFAULT NULL,
  `token_issued_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### satellites
拠点テーブル
```sql
CREATE TABLE `satellites` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `address` TEXT DEFAULT NULL,
  `phone` VARCHAR(20) DEFAULT NULL,
  `office_type_id` INT DEFAULT NULL,
  `token` VARCHAR(14) DEFAULT NULL,
  `contract_type` ENUM('30days', '90days', '1year') DEFAULT '30days',
  `max_users` INT NOT NULL DEFAULT 10,
  `status` TINYINT NOT NULL DEFAULT 1,
  `manager_ids` JSON DEFAULT NULL,
  `disabled_course_ids` JSON DEFAULT NULL,
  `token_issued_at` DATETIME NOT NULL,
  `token_expiry_at` DATETIME NOT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### courses
コース管理テーブル
```sql
CREATE TABLE `courses` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `category` VARCHAR(100) NOT NULL DEFAULT '選択科目',
  `status` ENUM('active', 'inactive', 'draft') DEFAULT 'active',
  `order_index` INT DEFAULT 0,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### lessons
レッスン管理テーブル
```sql
CREATE TABLE `lessons` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `course_id` INT NOT NULL,
  `title` VARCHAR(255) NOT NULL,
  `description` TEXT,
  `duration` VARCHAR(50),
  `order_index` INT NOT NULL DEFAULT 0,
  `has_assignment` BOOLEAN NOT NULL DEFAULT FALSE,
  `s3_key` VARCHAR(1024),
  `file_type` VARCHAR(50),
  `file_size` BIGINT,
  `status` ENUM('active', 'inactive', 'draft', 'deleted') NOT NULL DEFAULT 'active',
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

#### user_lesson_progress
利用者レッスン進捗テーブル
```sql
CREATE TABLE `user_lesson_progress` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `lesson_id` INT NOT NULL,
  `status` ENUM('not_started', 'in_progress', 'completed') NOT NULL DEFAULT 'not_started',
  `completed_at` DATETIME DEFAULT NULL,
  `test_score` INT DEFAULT NULL,
  `assignment_submitted` BOOLEAN NOT NULL DEFAULT FALSE,
  `assignment_submitted_at` DATETIME DEFAULT NULL,
  `instructor_approved` BOOLEAN NOT NULL DEFAULT FALSE,
  `instructor_approved_at` DATETIME DEFAULT NULL,
  `instructor_id` INT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
```

## エラーハンドリング

### 標準エラーレスポンス
```json
{
  "success": false,
  "message": "エラーメッセージ",
  "error": "エラー詳細",
  "code": "ERROR_CODE"
}
```

### HTTPステータスコード
- **200**: 成功
- **201**: 作成成功
- **400**: バリデーションエラー
- **401**: 認証エラー
- **403**: 権限エラー
- **404**: リソースが見つからない
- **500**: サーバーエラー

## セキュリティ

### CORS設定
- 開発環境: すべてのオリジンを許可
- 本番環境: 特定のオリジンのみ許可

### 認証
- JWT トークンベース認証
- リフレッシュトークンによる自動更新
- ロールベースアクセス制御

### バリデーション
- express-validatorによる入力値検証
- SQLインジェクション対策
- XSS対策

## ファイル管理

### S3統合
- AWS S3を使用したファイルストレージ
- 署名付きURLによる安全なファイルアクセス
- ファイルタイプ制限（PDF、ZIP等）

### サポートファイル形式
- **PDF**: レッスン資料、成果物
- **ZIP**: 成果物アップロード
- **画像**: プロフィール画像、成果物

## 監視・ログ

### ログレベル
- **INFO**: 一般的な情報
- **WARN**: 警告
- **ERROR**: エラー
- **DEBUG**: デバッグ情報

### 監視機能
- メモリ使用量監視
- データベース接続監視
- API レスポンス時間監視

## 開発・デプロイ

### 環境変数
```bash
NODE_ENV=development
PORT=5050
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password
DB_NAME=curriculum-portal
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
AWS_S3_BUCKET=studysphere
OPENAI_API_KEY=your_openai_key
```

### 起動方法
```bash
# 開発環境
npm run dev

# 本番環境
npm start
```

### Docker対応
- Dockerfile.prod
- docker-compose.prod.yml
- 本番環境用の設定ファイル

## 時間管理システム

### 時間変換の仕組み
- **バックエンド**: データベースにはUTCで保存、APIレスポンスはUTCで返却
- **フロントエンド**: バックエンドから受信したUTC時間をJSTに変換して表示
- **フロントエンド→バックエンド**: JST時間を送信、バックエンドでUTC変換してDB保存

### 実装例
```javascript
// フロントエンド → バックエンド（JST送信）
const jstTime = "2024-01-01T15:30:00+09:00";

// バックエンドでUTC変換してDB保存
const utcTime = new Date(jstTime).toISOString(); // "2024-01-01T06:30:00.000Z"

// バックエンド → フロントエンド（UTC返却）
const utcResponse = "2024-01-01T06:30:00.000Z";

// フロントエンドでJST変換して表示
const jstTime = new Date(utcResponse).toLocaleString('ja-JP', {timeZone: 'Asia/Tokyo'});
```

### 時間管理ユーティリティ
- `getCurrentJapanTime()`: 現在の日本時間取得
- `convertUTCToJapanTime()`: UTC→JST変換
- `convertJapanTimeToUTC()`: JST→UTC変換
- `formatMySQLDateTime()`: MySQL DATETIME形式変換
- `isExpired()`: 有効期限チェック（日本時間基準）

## 注意事項

1. **時間管理**: バックエンドはUTC、フロントエンドはJSTで管理
2. **トークン形式**: 14文字のハイフン区切り形式（XXXX-XXXX-XXXX）
3. **ファイルサイズ制限**: アップロードファイルは10MB以下
4. **セッション管理**: JWT トークンの有効期限は24時間
5. **データベース**: 論理削除を基本とし、物理削除は管理者のみ

## API影響分析マトリクス

### 概要

このセクションでは、各APIエンドポイントがフロントエンドのどの画面・機能に影響するかを分析しています。
APIの変更・障害発生時の影響範囲を迅速に特定するための参考資料としてご活用ください。

### 活用シーン

1. **API変更時の影響調査**
   - バックエンドAPIのエンドポイント変更時、どのフロントエンドコンポーネントを修正すべきか特定
   - データ構造変更時の影響範囲の把握

2. **障害発生時の影響範囲特定**
   - 特定APIがダウンした場合、どの画面・機能が使用不可になるかを即座に判断
   - ユーザーへの影響度評価と優先度付け

3. **新機能開発時の参考資料**
   - 既存APIの使用状況を把握し、類似機能の実装時に参考にする
   - API設計時のベストプラクティス確認

4. **バグ修正時のトラブルシューティング**
   - 特定画面のバグ発生時、関連するAPIエンドポイントを迅速に特定
   - API呼び出しの流れを理解し、根本原因を追跡

5. **ローンチ前の最終チェック**
   - 影響度「高」のAPIが正常に動作しているか優先的に確認
   - 基幹機能のテストシナリオ作成時の参考資料

### 統計情報

- **総APIエンドポイント数**: 約200+
- **影響度「高」のAPI**: 約50エンドポイント
- **影響度「中」のAPI**: 約100エンドポイント
- **影響度「低」のAPI**: 約50エンドポイント

### API分類

APIは以下の32カテゴリに分類されています：

1. 認証関連（ログイン・ログアウト・トークン管理）
2. 企業管理（事業所の作成・編集・削除）
3. 拠点管理（拠点の作成・編集・統計情報）
4. ユーザー管理（利用者の作成・編集・削除）
5. 管理者管理（管理者アカウントの管理）
6. コース管理（コースの作成・編集・削除）
7. レッスン管理（レッスンの作成・編集・ファイル管理）
8. 学習管理（進捗追跡・課題提出・テスト結果）
9. AI機能（AIアシスタント・PDF解析）
10. ダッシュボード（統計情報・概要表示）
11. ログ管理（システムログの管理）
12. 操作ログ（監査ログの管理）
13. 現在受講中レッスン管理（学習進捗の追跡）
14. カリキュラムパス管理（学習パスの作成・割り当て）
15. 指導員専門分野管理（指導員の専門分野設定）
16. レッスンテキストファイル管理（複数テキストファイル管理）
17. レッスンテキスト・動画リンク管理（テキストと動画の紐づけ）
18. レッスン動画管理（動画コンテンツの管理）
19. 管理者拠点管理（管理者の拠点管理）
20. 事業所タイプ管理（事業所タイプの管理）
21. PDF処理管理（PDFファイルの処理・解析）
22. 個別支援計画管理（支援計画の作成・管理）
23. 一時パスワード管理（一時パスワードの発行・検証）
24. テスト・学習効果管理（テスト生成・採点・承認）
25. 利用者コース管理（コース割り当て・管理）
26. ユーザー名検証（username重複チェック）
27. 在宅支援管理（在宅利用者の日報・評価）
28. アナウンス管理（通知・アナウンス機能）
29. メッセージ管理（個人メッセージ機能）
30. 利用者学習管理（利用者向け学習機能）
31. 提出物管理（課題提出・承認管理）
32. その他（ヘルスチェック・監視）

### 1. 認証関連API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| POST `/api/login` | ログイン画面（管理者）、全画面の認証状態 | 高 | 管理者ログイン。認証が通らないとシステム全体が使用不可。アクセストークンとリフレッシュトークンの発行処理 |
| POST `/api/instructor-login` | ログイン画面（指導員）、企業・拠点選択ダイアログ | 高 | 指導員ログイン。企業と拠点を選択して認証。指導員がシステムにアクセスするための必須API |
| POST `/api/refresh` | 全画面（トークン自動更新） | 高 | トークンリフレッシュ処理。自動更新が失敗するとユーザーが強制ログアウトされる |
| POST `/api/logout` | ヘッダーのログアウトボタン | 中 | ログアウト処理。失敗してもクライアント側でトークン削除は可能 |
| GET `/api/user-info` | 全画面（ユーザー情報表示）、AuthContext | 高 | 現在ログイン中のユーザー情報取得。ユーザー名、ロール、権限判定に使用 |
| POST `/api/users/verify-temp-password` | 利用者ログイン画面（一時パスワード認証） | 高 | 利用者の一時パスワード検証。利用者がシステムにアクセスするための必須API |

### 2. 企業管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/companies` | 事業所管理画面、企業選択ドロップダウン | 高 | 企業一覧表示。指導員ログイン時の企業選択にも使用 |
| GET `/api/companies/:id` | 企業詳細モーダル、編集フォーム | 中 | 特定企業の詳細情報取得 |
| POST `/api/companies` | 企業作成フォーム | 中 | 新規企業登録処理 |
| PUT `/api/companies/:id` | 企業編集フォーム | 中 | 企業情報更新処理 |
| DELETE `/api/companies/:id` | 企業削除ボタン | 中 | 企業削除処理。関連データの整合性に注意 |
| POST `/api/companies/:id/regenerate-token` | 企業管理画面（トークン再生成ボタン） | 低 | 企業トークンの再生成。既存の利用者ログインには影響しない |

### 3. 拠点管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/satellites` | 事業所（拠点）管理画面、拠点選択ドロップダウン | 高 | 拠点一覧表示。指導員ログイン時の拠点選択にも使用 |
| GET `/api/satellites/:id` | 拠点詳細モーダル、編集フォーム | 中 | 特定拠点の詳細情報取得 |
| GET `/api/satellites/by-ids?ids=[1,2,3]` | 利用者管理画面（所属拠点表示）、指導員情報 | 高 | 複数拠点情報の一括取得。利用者・指導員の所属拠点名表示に使用 |
| POST `/api/satellites` | 拠点作成フォーム | 中 | 新規拠点登録処理。契約タイプ、最大利用者数などの設定 |
| PUT `/api/satellites/:id` | 拠点編集フォーム | 中 | 拠点情報更新処理 |
| DELETE `/api/satellites/:id` | 拠点削除ボタン | 中 | 拠点削除処理。所属ユーザーの処理に注意 |
| GET `/api/satellites/:id/users` | 拠点ダッシュボード（利用者一覧） | 高 | 拠点所属の利用者一覧表示 |
| GET `/api/satellites/:id/instructors` | 拠点管理画面（指導員一覧） | 中 | 拠点所属の指導員一覧表示 |
| GET `/api/satellites/:id/stats` | 拠点ダッシュボード（統計情報） | 中 | 拠点の統計情報（利用者数、進捗率など）表示 |
| GET `/api/satellites/:id/disabled-courses` | 拠点設定画面（無効化コース管理） | 低 | 拠点で無効化されているコース一覧 |
| PUT `/api/satellites/:id/disabled-courses` | 拠点設定画面（無効化コース更新） | 低 | 拠点の無効化コース設定更新 |

### 4. ユーザー管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/users` | 利用者管理画面、利用者一覧テーブル | 高 | 利用者一覧取得。フィルタリング、検索機能の基盤 |
| POST `/api/users/create` | 利用者作成フォーム、利用者追加モーダル | 高 | 新規利用者登録。在宅利用者フラグ、受給者番号などの設定 |
| POST `/api/users/bulk-create` | 一括利用者追加機能 | 中 | 複数利用者の一括登録。CSV/Excel読み込み機能と連携 |
| PUT `/api/users/:userId` | 利用者編集フォーム、プロフィール編集 | 高 | 利用者情報更新。所属拠点、担当指導員の変更も含む |
| DELETE `/api/users/:userId` | 利用者削除ボタン | 中 | 利用者削除（論理削除）。学習履歴との整合性に注意 |
| POST `/api/users/:userId/reset-password` | パスワードリセットボタン | 中 | パスワードリセット機能 |
| POST `/api/users/:userId/change-password` | パスワード変更フォーム | 中 | ユーザー自身によるパスワード変更 |
| POST `/api/users/:userId/issue-temp-password` | 一時パスワード発行ボタン、一時パスワード管理画面 | 高 | 利用者向け一時パスワード発行。有効期限管理が重要 |
| GET `/api/users/:userId/satellites` | 利用者詳細画面（所属拠点一覧） | 中 | 利用者が所属する拠点の一覧表示 |
| POST `/api/users/:userId/satellites` | 利用者編集フォーム（拠点追加） | 中 | 利用者への拠点追加処理 |
| DELETE `/api/users/:userId/satellites/:satelliteId` | 利用者編集フォーム（拠点削除） | 中 | 利用者からの拠点削除処理 |
| GET `/api/users/:userId/specializations` | 指導員管理画面（専門分野一覧） | 低 | 指導員の専門分野表示 |
| POST `/api/users/:userId/specializations` | 指導員編集フォーム（専門分野追加） | 低 | 指導員の専門分野追加 |
| PUT `/api/users/:userId/specializations/:specializationId` | 指導員編集フォーム（専門分野編集） | 低 | 指導員の専門分野更新 |
| DELETE `/api/users/:userId/specializations/:specializationId` | 指導員編集フォーム（専門分野削除） | 低 | 指導員の専門分野削除 |

### 5. 管理者管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/admins` | 管理者管理画面、管理者一覧テーブル | 中 | 管理者アカウント一覧表示 |
| POST `/api/admins` | 管理者作成フォーム | 中 | 新規管理者アカウント作成 |
| PUT `/api/admins/:adminId` | 管理者編集フォーム | 中 | 管理者情報更新 |
| DELETE `/api/admins/:adminId` | 管理者削除ボタン（論理削除） | 中 | 管理者の論理削除処理 |
| POST `/api/admins/:adminId/restore` | 管理者復元ボタン | 低 | 削除された管理者の復元 |
| DELETE `/api/admins/:adminId/permanent` | 管理者完全削除ボタン | 低 | 管理者の物理削除。復元不可 |

### 6. コース管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/courses` | コース管理画面、コース一覧、利用者学習画面 | 高 | コース一覧取得。利用者・指導員・管理者すべての画面で使用 |
| GET `/api/courses/:id` | コース詳細モーダル、コース編集フォーム | 中 | 特定コースの詳細情報取得 |
| POST `/api/courses` | コース作成フォーム | 中 | 新規コース作成 |
| PUT `/api/courses/:id` | コース編集フォーム | 中 | コース情報更新（タイトル、説明、カテゴリ、ステータスなど） |
| DELETE `/api/courses/:id` | コース削除ボタン | 中 | コース削除。関連レッスン、進捗データとの整合性に注意 |
| PUT `/api/courses/order` | コース管理画面（ドラッグ&ドロップ並び替え） | 低 | コースの表示順序変更 |

### 7. レッスン管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/lessons` | レッスン管理画面、レッスン一覧テーブル | 高 | レッスン一覧取得。コース別フィルタリング機能を含む |
| GET `/api/lessons/:id` | レッスン詳細モーダル、レッスン編集フォーム | 中 | 特定レッスンの詳細情報取得 |
| POST `/api/lessons` | レッスン作成フォーム（ファイルアップロード対応） | 高 | 新規レッスン作成。PDF/動画ファイルのアップロード処理。multipart/form-data形式 |
| PUT `/api/lessons/:id` | レッスン編集フォーム | 中 | レッスン情報更新 |
| DELETE `/api/lessons/:id` | レッスン削除ボタン | 中 | レッスン削除。S3ファイルとの同期に注意 |
| GET `/api/lessons/:id/download` | レッスン受講画面（ファイルダウンロードボタン） | 中 | レッスンファイルのダウンロード。署名付きURL生成 |
| GET `/api/lessons/:id/files` | レッスン管理画面（ファイル一覧） | 低 | レッスンに関連するファイル一覧取得 |

### 8. 学習管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/learning/progress/:userId` | 利用者ダッシュボード、学習進捗画面 | 高 | 利用者の全体的な学習進捗取得 |
| GET `/api/learning/progress/:userId/course/:courseId` | コース別進捗詳細画面 | 高 | 特定コースの詳細進捗情報取得 |
| PUT `/api/learning/progress/lesson` | レッスン受講画面（レッスン完了時） | 高 | レッスン進捗の更新・保存。**時間データの扱いに注意（UTC/JST変換）** |
| GET `/api/learning/current-lesson` | 利用者ダッシュボード（学習再開ボタン） | 中 | 現在受講中のレッスン取得 |
| POST `/api/learning/upload-assignment` | レッスン受講画面（成果物アップロード） | 高 | 成果物（ZIPファイル）のアップロード。ファイルサイズ制限に注意 |
| GET `/api/learning/lesson/:lessonId/uploaded-files` | レッスン受講画面（アップロード済みファイル一覧） | 中 | 既にアップロードされた成果物の一覧表示 |
| DELETE `/api/learning/lesson/:lessonId/uploaded-files/:fileId` | レッスン受講画面（ファイル削除ボタン） | 低 | アップロード済みファイルの削除 |
| GET `/api/learning/lesson/:lessonId/assignment-status` | レッスン受講画面（課題提出状況表示） | 中 | 課題の提出状況確認 |
| POST `/api/learning/test/submit` | テスト受験画面（テスト結果送信） | 高 | テスト結果の送信・保存。スコア計算に影響 |
| GET `/api/learning/test/results/:userId` | テスト結果一覧画面、成績画面 | 中 | 利用者のテスト結果履歴取得 |
| POST `/api/learning/approve-completion` | 指導員画面（レッスン承認ボタン） | 高 | 指導員による課題承認処理。修了判定に影響 |
| GET `/api/learning/lesson/:lessonId/content` | レッスン受講画面（コンテンツ表示） | 高 | レッスンのPDF/テキストコンテンツ取得。AI機能のコンテキストにも使用 |
| POST `/api/learning/assign-course` | 利用者管理画面（コース割り当てボタン） | 高 | 利用者へのコース割り当て処理 |
| GET `/api/learning/certificate/:userId/:lessonId` | 合格証明書表示画面 | 中 | 特定レッスンの合格証明書取得・表示 |
| GET `/api/learning/certificates/:userId` | 利用者ダッシュボード（証明書一覧） | 中 | 利用者が取得した証明書の一覧表示 |

### 9. AI機能API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| POST `/api/ai/assist` | レッスン受講画面（AIアシスタントチャット） | 中 | AIによる質問応答機能。OpenAI APIを使用。トークン消費量に注意 |
| GET `/api/ai/status` | レッスン受講画面（AI機能有効化状態確認） | 低 | AI機能の利用可能状態確認 |
| GET `/api/ai/section-text/:lessonId` | AI機能（セクションテキスト取得） | 低 | レッスンのセクションテキスト抽出 |
| GET `/api/ai/pdf-status/:userId` | レッスン受講画面（PDF処理状態表示） | 低 | PDFの解析・処理状態確認 |

### 10. ダッシュボードAPI

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/dashboard` | 各種ダッシュボード画面 | 中 | ダッシュボード概要情報取得 |
| GET `/api/dashboard/overview` | システム概要画面（管理者） | 中 | システム全体の統計情報（総利用者数、進捗率など） |
| GET `/api/dashboard/company/:id` | 企業別ダッシュボード | 中 | 企業別の統計情報表示 |
| GET `/api/dashboard/alerts` | ダッシュボード（アラート通知エリア） | 低 | システムアラート・通知の一覧表示 |

### 11. ログ管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/logs` | ログ管理画面（ログファイル一覧） | 低 | システムログファイルの一覧表示。管理者のみアクセス可能 |
| GET `/api/logs/:filename` | ログ管理画面（ログ内容表示） | 低 | 特定ログファイルの内容表示 |
| GET `/api/logs/:filename/download` | ログ管理画面（ログダウンロードボタン） | 低 | ログファイルのダウンロード |
| DELETE `/api/logs/:filename` | ログ管理画面（ログ削除ボタン） | 低 | ログファイルの削除 |
| POST `/api/logs/cleanup` | ログ管理画面（古いログクリーンアップボタン） | 低 | 古いログの一括削除 |
| GET `/api/logs/stats` | ログ管理画面（ログ統計情報） | 低 | ログの統計情報表示 |

### 12. 操作ログAPI

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/operation-logs` | 管理者管理画面（操作ログ一覧タブ） | 中 | 管理者の操作ログ一覧表示。監査目的 |
| GET `/api/operation-logs/stats` | 管理者管理画面（操作ログ統計） | 低 | 操作ログの統計情報 |
| GET `/api/operation-logs/export` | 管理者管理画面（ログエクスポートボタン） | 低 | 操作ログのCSV/JSONエクスポート |
| DELETE `/api/operation-logs` | 管理者管理画面（ログクリアボタン） | 低 | 操作ログの削除 |

### 13. カリキュラムパス管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/curriculum-paths` | カリキュラムパス管理画面、パス一覧 | 高 | カリキュラムパス一覧取得。コース割り当て機能の基盤 |
| GET `/api/curriculum-paths/:id` | カリキュラムパス詳細モーダル | 中 | 特定パスの詳細情報取得 |
| GET `/api/curriculum-paths/available-courses` | カリキュラムパス作成/編集フォーム | 中 | パスに追加可能なコース一覧取得 |
| POST `/api/curriculum-paths` | カリキュラムパス作成フォーム | 中 | 新規カリキュラムパス作成 |
| PUT `/api/curriculum-paths/:id` | カリキュラムパス編集フォーム | 中 | カリキュラムパス情報更新 |
| DELETE `/api/curriculum-paths/:id` | カリキュラムパス削除ボタン | 中 | カリキュラムパス削除 |
| GET `/api/satellites/:satelliteId/user-courses` | 利用者管理画面（コース割り当て状況） | 高 | 拠点内利用者のコース割り当て状況取得 |
| GET `/api/satellites/:satelliteId/available-courses` | 利用者管理画面（コース割り当てモーダル） | 高 | 拠点で利用可能なコース一覧取得。無効化コース除外 |
| GET `/api/satellites/:satelliteId/available-curriculum-paths` | 利用者管理画面（カリキュラムパス割り当て） | 高 | 拠点で利用可能なカリキュラムパス一覧取得 |
| POST `/api/satellites/:satelliteId/bulk-assign-courses` | 利用者管理画面（コース一括割り当て） | 高 | 複数利用者へのコース一括割り当て |
| POST `/api/satellites/:satelliteId/bulk-remove-courses` | 利用者管理画面（コース一括削除） | 中 | 複数利用者からのコース一括削除 |
| POST `/api/satellites/:satelliteId/bulk-assign-curriculum-paths` | 利用者管理画面（カリキュラムパス一括割り当て） | 高 | 複数利用者へのカリキュラムパス一括割り当て |

### 14. メッセージ・アナウンスAPI

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/announcements/admin` | アナウンス管理画面（管理者・指導員） | 中 | 送信済みアナウンス一覧取得。拠点フィルタリング可能 |
| POST `/api/announcements/admin/create` | アナウンス作成フォーム | 中 | 新規アナウンス作成・送信 |
| GET `/api/announcements/user` | 利用者ダッシュボード（アナウンス一覧） | 中 | 利用者向けアナウンス取得 |
| POST `/api/messages/send` | メッセージ送信フォーム | 中 | 1対1メッセージ送信 |
| GET `/api/messages/conversations` | メッセージ画面（会話一覧） | 中 | ユーザーの会話一覧取得 |
| GET `/api/messages/conversation/:userId` | メッセージ画面（会話詳細） | 中 | 特定ユーザーとの会話履歴取得 |
| GET `/api/messages/unread-count` | ヘッダー（未読メッセージバッジ） | 中 | 未読メッセージ数取得。ポーリング処理で定期取得 |
| PUT `/api/messages/:messageId/read` | メッセージ詳細画面（既読処理） | 低 | メッセージを既読にマーク |

### 15. 在宅支援管理API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/users/satellite/:satelliteId/home-support-users` | 在宅支援利用者追加モーダル | 中 | 在宅支援に追加可能な通所利用者一覧 |
| GET `/api/users/satellite/:satelliteId/home-support-users-list` | 在宅支援管理画面（在宅利用者一覧） | 高 | 拠点の在宅支援対象利用者一覧取得 |
| GET `/api/users/satellite/:satelliteId/home-support-instructors` | 在宅支援利用者追加モーダル | 中 | 在宅支援担当指導員一覧 |
| POST `/api/users/bulk-update-home-support` | 在宅支援利用者追加フォーム | 高 | 在宅支援フラグの一括更新 |
| PUT `/api/users/:userId/remove-home-support` | 在宅支援利用者削除ボタン | 中 | 在宅支援フラグの削除 |
| GET `/api/remote-support/daily-reports` | 在宅支援日報管理画面 | 高 | 利用者の日報一覧取得。日付フィルタリング可能 |
| GET `/api/remote-support/daily-reports/:reportId` | 日報詳細モーダル | 中 | 特定日報の詳細情報取得 |
| PUT `/api/remote-support/daily-reports/:reportId` | 日報編集フォーム | 中 | 日報内容の更新 |
| POST `/api/remote-support/daily-reports/:reportId/comments` | 日報コメント追加フォーム | 中 | 日報へのコメント追加（指導員フィードバック） |
| GET `/api/remote-support/evaluations/weekly` | 週次評価一覧画面 | 中 | 週次評価データ取得 |
| POST `/api/remote-support/evaluations/weekly` | 週次評価入力フォーム | 中 | 週次評価データの作成・保存 |
| GET `/api/remote-support/evaluations/monthly` | 月次評価一覧画面 | 中 | 月次評価データ取得 |
| POST `/api/remote-support/evaluations/monthly` | 月次評価入力フォーム | 中 | 月次評価データの作成・保存 |

### 16. 個別支援計画API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/support-plans` | 個別支援計画一覧画面 | 中 | 全支援計画の一覧取得 |
| GET `/api/support-plans/user/:userId` | 利用者詳細画面（支援計画タブ） | 中 | 特定利用者の支援計画取得 |
| POST `/api/support-plans` | 支援計画作成フォーム | 中 | 新規支援計画作成 |
| PUT `/api/support-plans/:id` | 支援計画編集フォーム | 中 | 支援計画更新 |
| DELETE `/api/support-plans/:id` | 支援計画削除ボタン | 低 | 支援計画削除 |
| POST `/api/support-plans/upsert` | 支援計画作成/更新フォーム | 中 | 支援計画の作成または更新（upsert処理） |

### 17. 利用者・指導員割り当てAPI

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/users/satellite/:satelliteId/instructor-relations` | 利用者管理画面（指導員割り当てビュー） | 高 | 拠点内の利用者と担当指導員の関係一覧取得 |
| GET `/api/users/satellite/:satelliteId/available-instructors` | 利用者編集フォーム（指導員選択ドロップダウン） | 高 | 拠点内の利用可能な指導員一覧取得 |
| PUT `/api/users/:userId/instructor` | 利用者編集フォーム（指導員変更） | 高 | 個別利用者の担当指導員変更 |
| PUT `/api/users/satellite/:satelliteId/bulk-instructor-assignment` | 利用者管理画面（指導員一括割り当て） | 高 | 複数利用者の担当指導員を一括変更 |
| DELETE `/api/users/satellite/:satelliteId/instructors` | 利用者管理画面（指導員一括解除ボタン） | 中 | 拠点内全利用者の担当指導員を一括削除 |

### 18. 一時パスワード管理API（追加）

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/temp-passwords/status/:loginCode` | 利用者ログイン画面（パスワード状態確認） | 中 | 一時パスワードの有効性確認 |
| POST `/api/users/:userId/mark-temp-password-used` | ログアウト処理 | 低 | ログアウト時に一時パスワードを使用済みにマーク |

### 19. テスト・合格承認API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/test/instructor/pending-approvals` | 指導員ダッシュボード（承認待ちリスト） | 中 | 拠点内の承認待ちテスト結果一覧取得 |
| POST `/api/test/instructor/approve` | 指導員画面（テスト承認ボタン） | 高 | テスト結果の承認処理 |
| POST `/api/test/instructor/reject` | 指導員画面（テスト却下ボタン） | 中 | テスト結果の却下処理 |

### 20. コース割り当て管理API（追加）

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/user-courses/satellite/:satelliteId/user-courses` | 利用者管理画面（コース割り当て状況） | 高 | 拠点内全利用者のコース割り当て状況取得 |
| GET `/api/user-courses/satellite/:satelliteId/available-courses` | コース割り当てモーダル | 高 | 拠点で利用可能なコース一覧（無効化コース除外） |
| GET `/api/user-courses/satellite/:satelliteId/available-curriculum-paths` | カリキュラムパス割り当てモーダル | 高 | 拠点で利用可能なカリキュラムパス一覧 |
| POST `/api/user-courses/satellite/:satelliteId/bulk-assign-courses` | コース一括割り当てフォーム | 高 | 複数利用者へのコース一括割り当て |
| POST `/api/user-courses/satellite/:satelliteId/bulk-remove-courses` | コース一括削除フォーム | 中 | 複数利用者からのコース一括削除 |
| POST `/api/user-courses/satellite/:satelliteId/bulk-assign-curriculum-paths` | カリキュラムパス一括割り当てフォーム | 高 | 複数利用者へのカリキュラムパス一括割り当て |

### 21. 拠点切り替え・再認証API

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| POST `/api/reauthenticate-satellite` | ヘッダーの拠点切り替えモーダル | 高 | 拠点変更時の再認証処理。セッションの拠点情報を更新 |

### 22. その他のAPI

| API エンドポイント | フロントエンドの画面/機能/コンポーネント | 影響度 | 備考 |
|-------------------|------------------------------------------|--------|------|
| GET `/api/health` | システム監視、ヘルスチェック処理 | 低 | APIサーバーの稼働状態確認 |
| GET `/api/cors-test` | 開発環境でのCORS設定確認 | 低 | CORS設定の動作確認用エンドポイント |
| GET `/memory` | システム監視画面（メモリ使用状況） | 低 | サーバーメモリ使用量の監視 |
| GET `/memory/report` | システム監視画面（メモリレポート） | 低 | 詳細なメモリレポート取得 |

### 影響度評価の基準

**高（High）**
- システムの基幹機能に直結するAPI
- 認証・ログイン処理
- データの保存・更新処理
- 複数画面で共通利用されるAPI
- 障害発生時にシステム全体またはメイン機能が使用不可になる

**中（Medium）**
- 特定画面の主要機能に使用されるAPI
- データの表示・取得処理
- 障害発生時に特定の画面・機能が使用不可になる
- ユーザー体験に影響を与えるが、システム全体は稼働可能

**低（Low）**
- 補助的な機能に使用されるAPI
- 管理者のみが使用する機能
- 統計情報や監視機能
- 障害発生時の影響が限定的

### 特に注意が必要な箇所

1. **時間データの扱い（UTC/JST変換）**
   - `/api/learning/progress/lesson` - レッスン完了時刻
   - `/api/users/:userId/issue-temp-password` - 一時パスワード有効期限
   - すべての `created_at`, `updated_at`, `completed_at` フィールド

2. **ファイルアップロード処理**
   - `/api/lessons` - レッスンファイル（PDF/動画）のアップロード
   - `/api/learning/upload-assignment` - 成果物のアップロード
   - multipart/form-data形式、ファイルサイズ制限（10MB）

3. **トークン管理**
   - `/api/refresh` - トークンリフレッシュの自動処理
   - `/api/login`, `/api/instructor-login` - トークン発行
   - JWT有効期限（24時間）

4. **データ整合性**
   - 企業・拠点・ユーザーの削除処理
   - コース・レッスンの削除と進捗データの整合性
   - 論理削除と物理削除の使い分け

5. **権限チェック**
   - ロールベースアクセス制御（ロール1: 利用者、ロール4: 指導員、ロール5-9: 管理者）
   - 拠点間のデータ分離
   - 指導員は同一拠点内の利用者のみ管理可能

## 更新履歴

- **v1.0.0**: 初回リリース
- 認証システム実装
- 基本CRUD操作実装
- ファイルアップロード機能実装
- AI機能統合
- 学習進捗管理機能実装
- **v1.1.0**: API影響分析マトリクスを追加
- **v1.2.0**: 不足していたAPIエンドポイントを追加
