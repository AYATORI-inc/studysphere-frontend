#!/usr/bin/env bash
set -e

echo "=== StudySphere ConoHaWing Build Script ==="
echo ""

# スクリプトのディレクトリを取得
FRONTEND_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="${FRONTEND_DIR}/build"
DEPLOY_DIR="${FRONTEND_DIR}/conohawing-deploy"
BACKUP_DIR="${FRONTEND_DIR}/backups"

# タイムスタンプ（ZIP・バックアップ用）
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ディレクトリ作成
mkdir -p "$DEPLOY_DIR"
mkdir -p "$BACKUP_DIR"

# 既存のデプロイをバックアップ
if [ -f "${DEPLOY_DIR}/index.html" ]; then
    echo "Backing up existing deployment..."
    cp -R "$DEPLOY_DIR" "${BACKUP_DIR}/conohawing_backup_${TIMESTAMP}/"
    echo "Backup completed: ${BACKUP_DIR}/conohawing_backup_${TIMESTAMP}/"
fi

# デプロイディレクトリをクリア
echo "Clearing deploy directory..."
rm -rf "$DEPLOY_DIR"
mkdir -p "$DEPLOY_DIR"

# フロントエンドディレクトリに移動
cd "$FRONTEND_DIR"

# ConoHaWing用の環境変数を設定
export REACT_APP_API_URL=https://studysphere-backend.ayatori-inc.co.jp
export NODE_ENV=production

echo "API URL: $REACT_APP_API_URL"
echo ""

# 依存関係のインストール
echo "Installing dependencies..."
npm install
if [ $? -ne 0 ]; then
    echo "Error: npm install failed"
    exit 1
fi

# 依存関係の確認
echo "Checking critical dependencies..."
node -e "try { require('tailwindcss'); console.log('✓ tailwindcss found'); } catch(e) { console.log('✗ tailwindcss missing'); process.exit(1); }" || {
    echo "Error: tailwindcss is missing. Please run: npm install tailwindcss"
    exit 1
}
node -e "try { require('postcss'); console.log('✓ postcss found'); } catch(e) { console.log('✗ postcss missing'); process.exit(1); }" || {
    echo "Error: postcss is missing. Please run: npm install postcss"
    exit 1
}
node -e "try { require('autoprefixer'); console.log('✓ autoprefixer found'); } catch(e) { console.log('✗ autoprefixer missing'); process.exit(1); }" || {
    echo "Error: autoprefixer is missing. Please run: npm install autoprefixer"
    exit 1
}

# 本番用ビルド
echo "Building for ConoHaWing..."
npm run build
if [ $? -ne 0 ]; then
    echo "Error: npm run build failed"
    exit 1
fi

# ビルドファイルをデプロイディレクトリにコピー
echo "Copying build files..."
cp -R "${BUILD_DIR}/"* "$DEPLOY_DIR/"

# ConoHaWing用設定ファイルをコピー
echo "Copying ConoHaWing configuration..."
HTACCESS_SRC="${FRONTEND_DIR}/../production_build/configs/conohawing/.htaccess"
if [ -f "$HTACCESS_SRC" ]; then
    cp "$HTACCESS_SRC" "$DEPLOY_DIR/"
    echo ".htaccess file copied successfully"
else
    echo "Warning: .htaccess file not found at $HTACCESS_SRC"
    echo "Please ensure the .htaccess file is in the correct location"
fi

# package.jsonのhomepage設定を確認・修正
echo "Checking package.json configuration..."
if ! grep -q '"homepage": "/"' package.json 2>/dev/null; then
    echo "Fixing homepage configuration..."
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' 's|"homepage": "/studysphere"|"homepage": "/"|g' package.json
    else
        sed -i 's|"homepage": "/studysphere"|"homepage": "/"|g' package.json
    fi
    echo "Homepage configuration updated"
else
    echo "Homepage configuration is correct"
fi

# ConoHaWing用のREADMEを作成
echo "Creating README file..."
cat > "${DEPLOY_DIR}/README-CONOHAWING.md" << 'READMEEOF'
# StudySphere ConoHaWing Deployment Files

## Deployment Steps

1. Upload all files in this directory to ConoHaWing public_html
2. Ensure .htaccess file is uploaded correctly
3. Test access in browser

## File Structure

- index.html: React application entry point
- static/: Static files (JS, CSS, images, etc.)
- .htaccess: ConoHaWing Apache configuration

## Important Notes

- API runs on separate server (backend.studysphere.ayatori-inc.co.jp)
- API requests are sent directly to backend server (no proxy required)
- React Router requires SPA configuration in .htaccess

## Troubleshooting

- 404 errors: Check .htaccess file configuration
- API errors: Check backend server status
- Static files not loading: Check file upload status
READMEEOF

# デプロイ用ZIPファイルを作成
echo "Creating deployment ZIP file..."
ZIP_NAME="conohawing-deploy-${TIMESTAMP}.zip"
(cd "$DEPLOY_DIR" && zip -r "${FRONTEND_DIR}/${ZIP_NAME}" . -x "*.DS_Store")

echo ""
echo "=== ConoHaWing Build Complete ==="
echo "Deploy files: $DEPLOY_DIR"
echo "ZIP file: ${FRONTEND_DIR}/${ZIP_NAME}"
echo ""
echo "Next steps:"
echo "1. Download ZIP file"
echo "2. Upload to ConoHaWing public_html"
echo "3. Test access in browser"
echo ""
echo "For detailed instructions, see production_build/docs/CONOHAWING_DEPLOYMENT_GUIDE.md"
echo ""
