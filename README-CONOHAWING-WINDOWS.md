# StudySphere ConoHaWing デプロイ手順（Windows環境）

## 🚀 簡単3ステップ

### 1. ビルドスクリプトを実行

```cmd
cd studysphere-frontend
build-conohawing.bat
```

### 2. ZIPファイルをダウンロード

生成された `conohawing-deploy-*.zip` ファイルをダウンロード

### 3. ConoHaWingにアップロード

1. **ConoHaWingコントロールパネルにログイン**
2. **ファイルマネージャーを開く**
3. **`public_html`ディレクトリに移動**
4. **ZIPファイルをアップロード**
5. **ZIPファイルを解凍**
6. **解凍したファイルを`public_html`に移動**

## ⚠️ 重要な注意事項

### .htaccessファイルが必須
- `.htaccess`ファイルが正しくアップロードされていることを確認
- React Router の直接アクセス時に `index.html` へフォールバックするために必要です

### ファイル構造
```
public_html/
├── index.html          ← React アプリ
├── static/             ← 静的ファイル
├── .htaccess           ← Apache設定（重要！）
└── manifest.json
```

## 🔧 トラブルシューティング

### 404エラーが出る場合
- `.htaccess`ファイルがアップロードされているか確認

### APIエラーが出る場合
- バックエンドサーバー（例: `backend2.studysphere.ayatori-inc.co.jp`）が動作しているか確認

### 静的ファイルが読み込まれない場合
- ファイルのアップロードが完了しているか確認

## 📞 サポート

詳細な手順は以下を参照：
- `production_build/docs/WINDOWS_CONOHAWING_GUIDE.md` - 詳細ガイド
- `production_build/CONOHAWING_QUICK_START.md` - クイックスタート

---

**準備完了！** これでWindows環境からConoHaWingにStudySphereフロントエンドをデプロイできます。
