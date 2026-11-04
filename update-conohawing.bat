@echo off
chcp 65001 >nul
echo StudySphere ConoHaWing Update Script
echo.

REM 環境変数設定
set REACT_APP_API_URL=https://studysphere-backend.ayatori-inc.co.jp
set NODE_ENV=production

echo API URL: %REACT_APP_API_URL%
echo.

REM ビルド実行
echo Building application...
call npm run build
if %errorlevel% neq 0 (
    echo Error: npm run build failed
    pause
    exit /b 1
)

REM .htaccessファイルをコピー
echo Copying updated .htaccess file...
copy "..\production_build\configs\conohawing\.htaccess" "build\" /Y
echo .htaccess updated

echo.
echo Update completed successfully!
echo.
echo Files updated:
echo - build/index.html (updated routing)
echo - build/.htaccess (CORS and proxy settings)
echo - build/static/ (all static files)
echo.
echo Next steps:
echo 1. Upload contents of 'build' folder to ConoHaWing public_html
echo 2. Test access at http://studysphere.ayatori-inc.co.jp
echo 3. Test login functionality
echo.
echo Changes made:
echo - Fixed CORS issues
echo - Updated routing (root path now shows login page)
echo - Added API proxy configuration
echo.
pause
