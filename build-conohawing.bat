@echo off
chcp 65001 >nul
echo === StudySphere ConoHaWing Build Script ===
echo.

REM 設定
set FRONTEND_DIR=%~dp0
set BUILD_DIR=%FRONTEND_DIR%build
set DEPLOY_DIR=%FRONTEND_DIR%conohawing-deploy
set BACKUP_DIR=%FRONTEND_DIR%backups

REM ディレクトリ作成
if not exist "%DEPLOY_DIR%" mkdir "%DEPLOY_DIR%"
if not exist "%BACKUP_DIR%" mkdir "%BACKUP_DIR%"

REM 既存のデプロイをバックアップ
if exist "%DEPLOY_DIR%" (
    if exist "%DEPLOY_DIR%\index.html" (
        echo Backing up existing deployment...
        for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
        set "YY=%dt:~2,2%" & set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
        set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
        set "timestamp=%YYYY%%MM%%DD%_%HH%%Min%%Sec%"
        
        xcopy "%DEPLOY_DIR%" "%BACKUP_DIR%\conohawing_backup_%timestamp%\" /E /I /Q /Y
        echo Backup completed: %BACKUP_DIR%\conohawing_backup_%timestamp%\
    )
)

REM デプロイディレクトリをクリア
echo Clearing deploy directory...
if exist "%DEPLOY_DIR%" rmdir /S /Q "%DEPLOY_DIR%"
mkdir "%DEPLOY_DIR%"

REM フロントエンドディレクトリに移動
cd /d "%FRONTEND_DIR%"

REM ConoHaWing用の環境変数を設定
set REACT_APP_API_URL=https://studysphere-backend.ayatori-inc.co.jp
set NODE_ENV=production

echo API URL: %REACT_APP_API_URL%
echo.

REM 依存関係のインストール
echo Installing dependencies...
call npm install
if %errorlevel% neq 0 (
    echo Error: npm install failed
    pause
    exit /b 1
)

REM 依存関係の確認
echo Checking critical dependencies...
node -e "try { require('tailwindcss'); console.log('✓ tailwindcss found'); } catch(e) { console.log('✗ tailwindcss missing'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo Error: tailwindcss is missing. Please run: npm install tailwindcss
    pause
    exit /b 1
)

node -e "try { require('postcss'); console.log('✓ postcss found'); } catch(e) { console.log('✗ postcss missing'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo Error: postcss is missing. Please run: npm install postcss
    pause
    exit /b 1
)

node -e "try { require('autoprefixer'); console.log('✓ autoprefixer found'); } catch(e) { console.log('✗ autoprefixer missing'); process.exit(1); }"
if %errorlevel% neq 0 (
    echo Error: autoprefixer is missing. Please run: npm install autoprefixer
    pause
    exit /b 1
)

REM 本番用ビルド
echo Building for ConoHaWing...
call npm run build
if %errorlevel% neq 0 (
    echo Error: npm run build failed
    pause
    exit /b 1
)

REM ビルドファイルをデプロイディレクトリにコピー
echo Copying build files...
xcopy "%BUILD_DIR%\*" "%DEPLOY_DIR%\" /E /I /Q /Y

REM ConoHaWing用設定ファイルをコピー（プロジェクトのpublic/.htaccessを優先）
echo Copying ConoHaWing configuration...
if exist "%FRONTEND_DIR%public\.htaccess" (
    copy "%FRONTEND_DIR%public\.htaccess" "%DEPLOY_DIR%\" /Y
    echo .htaccess file copied from public\.htaccess
) else if exist "..\production_build\configs\conohawing\.htaccess" (
    copy "..\production_build\configs\conohawing\.htaccess" "%DEPLOY_DIR%\" /Y
    echo .htaccess file copied from production_build config
) else (
    echo Warning: .htaccess file was not found.
    echo Required location: public\.htaccess
)

REM package.jsonのhomepage設定を確認・修正
echo Checking package.json configuration...
findstr /C:"\"homepage\": \"/\"" package.json >nul
if %errorlevel% neq 0 (
    echo Fixing homepage configuration...
    powershell -Command "(Get-Content package.json) -replace '\"homepage\": \"/studysphere\"', '\"homepage\": \"/\"' | Set-Content package.json"
    echo Homepage configuration updated
) else (
    echo Homepage configuration is correct
)

REM ConoHaWing用のREADMEを作成
echo Creating README file...
(
echo # StudySphere ConoHaWing Deployment Files
echo.
echo ## Deployment Steps
echo.
echo 1. Upload all files in this directory to ConoHaWing public_html
echo 2. Ensure .htaccess file is uploaded correctly
echo 3. Test access in browser
echo.
echo ## File Structure
echo.
echo - index.html: React application entry point
echo - static/: Static files ^(JS, CSS, images, etc.^)
echo - .htaccess: ConoHaWing Apache configuration
echo.
echo ## Important Notes
echo.
echo - API runs on separate server ^(backend.studysphere.ayatori-inc.co.jp^)
echo - API requests are sent directly to backend server ^(no proxy required^)
echo - React Router requires SPA configuration in .htaccess
echo.
echo ## Troubleshooting
echo.
echo - 404 errors: Check .htaccess file configuration
echo - API errors: Check backend server status
echo - Static files not loading: Check file upload status
) > "%DEPLOY_DIR%\README-CONOHAWING.md"

REM デプロイ用ZIPファイルを作成
echo Creating deployment ZIP file...
cd /d "%DEPLOY_DIR%"
powershell -Command "Compress-Archive -Path * -DestinationPath '..\conohawing-deploy-%timestamp%.zip' -Force"

echo.
echo === ConoHaWing Build Complete ===
echo Deploy files: %DEPLOY_DIR%
echo ZIP file: %FRONTEND_DIR%conohawing-deploy-%timestamp%.zip
echo.
echo Next steps:
echo 1. Download ZIP file
echo 2. Upload to ConoHaWing public_html
echo 3. Test access in browser
echo.
echo For detailed instructions, see production_build\docs\CONOHAWING_DEPLOYMENT_GUIDE.md
echo.
pause
