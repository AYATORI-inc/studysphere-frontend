# 写真一覧は文章だけ返し、画像URLは詳細で作る

対応済み。写真・記録の一覧は `summary=1` を付けて取得する。画像は詳細の `GET /api/remote-support/capture-records/:userId/:date` のまま。

写真・記録の一覧（`/instructor/home-support/photos`）は、サムネイルを出さず、日付・利用者・枚数・状況だけを表示する。画像はその行の「詳細」で、その日の分だけ見る。

画面は詳細のときだけ、既存の次のAPIを呼ぶ。

```http
GET /api/remote-support/capture-records/:userId/:date
```

`summary=1` のあと、一覧の待ちは利用者ごとの S3 一覧が順番なことに残っている。続きは `写真一覧_S3一覧を並列にする.md`。

## 変えること

`scripts/remoteSupportController.js` の `getCaptureRecords`。

クエリ `summary=1` のときは、S3のファイル一覧から日付ごとの件数と最終更新時刻だけを返す。`getSignedUrl` は呼ばない。`photos` と `screenshots` と `thumbnail` と `thumbnails` は返さない。

各レコードは次の形。

```json
{
  "date": "2026-11-20",
  "user": { "id": 44, "name": "利用者名", "login_code": "..." },
  "photoCount": 3,
  "screenshotCount": 2,
  "latestAt": "2026-11-20T06:12:00.000Z"
}
```

`summary` が無いとき、または `summary=1` でないときは、今のレスポンスのまま。

## 確認

`summary=1` の一覧は、画像URLを含まず、件数と時刻だけが返る。`summary` なしの一覧と、利用者・日付を指定した詳細は、今どおり画像URLが返る。
