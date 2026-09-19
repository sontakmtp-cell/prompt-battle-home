@echo off
rem ===========================================================================
rem  PROMPT CHIEN - file khoi dong nhanh
rem
rem  BAM DUP vao file nay la ung dung tu mo.
rem  Muon lam viec khac thi bam dup TEST.bat hoac CLI.bat.
rem
rem  Ghi chu: file nay co tinh viet khong dau de hien thi dung tren moi may
rem  Windows. Sua noi dung thi nho giu nguyen dinh dang, dung doi ten file.
rem ===========================================================================
setlocal
title PROMPT CHIEN
cd /d "%~dp0"

set "MODE=%~1"
if "%MODE%"=="" set "MODE=app"

where node >nul 2>nul
if errorlevel 1 goto :no_node

if /i "%MODE%"=="app"   goto :app
if /i "%MODE%"=="test"  goto :test
if /i "%MODE%"=="cli"   goto :cli
if /i "%MODE%"=="build" goto :build
goto :help


rem ============================== MO UNG DUNG ================================
:app
echo.
echo  ==========================================================
echo    PROMPT CHIEN - dang mo ung dung
echo  ==========================================================
echo.
if not exist "node_modules\typescript\package.json" goto :prepare_root
if not exist "frontend\node_modules\vite\package.json" goto :prepare_ui
goto :app_run

:prepare_root
echo  Lan dau chay: dang cai thu vien cho phan loi game...
call npx --yes pnpm@9 install
if errorlevel 1 goto :fail_root_install
echo.

:prepare_ui
if exist "frontend\node_modules\vite\package.json" goto :app_run
echo  Lan dau chay: dang cai thu vien cho phan giao dien...
pushd frontend
call npm install --legacy-peer-deps
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :fail_ui_install
echo.

:app_run
echo  Dang build loi game roi mo trinh duyet...
echo.
echo  Dia chi ung dung:  http://127.0.0.1:3000
echo  (trinh duyet se tu mo, cho khoang 10-20 giay)
echo.
echo  *** DE TAT UNG DUNG: bam Ctrl+C trong cua so nay, hoac dong cua so ***
echo.
pushd frontend
call npm run dev -- --open
set "RC=%ERRORLEVEL%"
popd
echo.
if not "%RC%"=="0" echo  Ung dung dung voi loi. Ma loi: %RC%
if "%RC%"=="0" echo  Ung dung da dung binh thuong.
echo.
pause
exit /b %RC%


rem ============================== CHAY KIEM TRA ==============================
:test
echo.
echo  ==========================================================
echo    PROMPT CHIEN - chay toan bo kiem tra
echo  ==========================================================
echo.
if not exist "node_modules\typescript\package.json" goto :prepare_root_test
goto :test_1

:prepare_root_test
echo  Lan dau chay: dang cai thu vien cho phan loi game...
call npx --yes pnpm@9 install
if errorlevel 1 goto :fail_root_install
echo.

:test_1
echo  [1/3] Build lai loi game...
call npm run build
if errorlevel 1 goto :fail_build
echo.
echo  [2/3] Kiem tra loi game...
call npm run test
if errorlevel 1 goto :fail_test_engine
echo.
if not exist "frontend\node_modules\vite\package.json" goto :prepare_ui_test
goto :test_3

:prepare_ui_test
echo  Lan dau chay: dang cai thu vien cho phan giao dien...
pushd frontend
call npm install --legacy-peer-deps
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :fail_ui_install
echo.

:test_3
echo  [3/3] Kiem tra phan giao dien...
pushd frontend
call npm test
set "RC=%ERRORLEVEL%"
popd
if not "%RC%"=="0" goto :fail_test_ui
echo.
echo  ==========================================================
echo    KET QUA: TAT CA KIEM TRA DEU DAT
echo  ==========================================================
echo.
pause
exit /b 0


rem ================================ LENH CLI =================================
:cli
if not exist "node_modules\typescript\package.json" goto :prepare_root_cli
goto :cli_prep

:prepare_root_cli
echo  Lan dau chay: dang cai thu vien cho phan loi game...
call npx --yes pnpm@9 install
if errorlevel 1 goto :fail_root_install
echo.

:cli_prep
if exist "packages\cli\dist\src\index.js" goto :cli_intro
echo  Chua co ban build, dang build truoc...
call npm run build
if errorlevel 1 goto :fail_build
echo.

:cli_intro
echo.
echo  ------------------------------------------------------------------
echo   DAY LA CAC LENH CUA GAME:
echo  ------------------------------------------------------------------
node "packages\cli\dist\src\index.js"
echo  ------------------------------------------------------------------
echo   Go lenh roi bam Enter.  Bam Enter ngay, khong go gi, de thoat.
echo  ------------------------------------------------------------------

:cli_loop
echo.
set "CMD="
set /p "CMD=Lenh: "
if "%CMD%"=="" goto :cli_end
node "packages\cli\dist\src\index.js" %CMD%
goto :cli_loop

:cli_end
echo.
echo  Tam biet.
exit /b 0


rem =============================== BUILD LAI =================================
:build
echo.
echo  Dang build lai toan bo loi game...
call npm run build
if errorlevel 1 goto :fail_build
echo.
echo  Build xong, khong co loi.
echo.
pause
exit /b 0


rem ================================ HUONG DAN ================================
:help
echo.
echo  Cach dung:  START.bat [app ^| test ^| cli ^| build]
echo.
echo    (khong go gi)  mo ung dung  - bam dup la chay luon
echo    app            mo ung dung (web lab) tai http://127.0.0.1:3000
echo    test           build lai + chay toan bo kiem tra
echo    cli            go cac lenh cua game
echo    build          chi build lai loi game
echo.
pause
exit /b 0


rem ================================== LOI ====================================
:no_node
echo.
echo  [LOI] Khong tim thay Node.js tren may nay.
echo.
echo  Cach sua:
echo    1. Vao https://nodejs.org  tai ban "LTS" (Node 22) roi cai dat.
echo    2. Dong het cua so nay.
echo    3. Bam dup lai file START.bat.
echo.
pause
exit /b 1

:fail_root_install
echo.
echo  [LOI] Cai thu vien cho phan loi game that bai.
echo  Thu chay tay:  npx --yes pnpm@9 install
echo.
pause
exit /b 1

:fail_ui_install
echo.
echo  [LOI] Cai thu vien cho phan giao dien that bai.
echo  Thu chay tay:  cd frontend   roi   npm install --legacy-peer-deps
echo.
pause
exit /b 1

:fail_build
echo.
echo  [LOI] Build loi game that bai. Xem dong bao loi ngay tren dong nay.
echo.
pause
exit /b 1

:fail_test_engine
echo.
echo  [LOI] Kiem tra phan loi game that bai. Xem dong bao loi o tren.
echo.
pause
exit /b 1

:fail_test_ui
echo.
echo  [LOI] Kiem tra phan giao dien that bai. Xem dong bao loi o tren.
echo.
pause
exit /b 1
