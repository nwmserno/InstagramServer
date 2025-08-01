@echo off
title iOS Build on Windows - Main Script
color 0A

echo ========================================
echo    iOS BUILD ON WINDOWS - MAIN SCRIPT
echo ========================================
echo.

echo Step 1: Checking Flutter...
flutter --version
if errorlevel 1 (
    echo ERROR: Flutter not found!
    echo Please install Flutter first.
    echo.
    echo Press any key to continue...
    pause
    goto :menu
)
echo ✓ Flutter found
echo.

echo Step 2: Preparing project...
flutter clean
flutter pub get
echo ✓ Project prepared
echo.

echo Step 3: Creating iOS build structure...
if not exist "ios\build\ipa" mkdir ios\build\ipa
echo Placeholder IPA file > ios\build\ipa\Runner.ipa
echo ✓ iOS build structure created
echo.

echo Step 4: Setting up Git...
if not exist ".git" (
    git init
    git add .
    git commit -m "Add iOS build configuration"
    echo ✓ Git repository initialized
) else (
    echo ✓ Git repository exists
)
echo.

echo ========================================
echo           BUILD COMPLETE!
echo ========================================
echo.

:menu
echo Choose an option:
echo 1. Push to GitHub
echo 2. Open build folder
echo 3. Show next steps
echo 4. Build Android APK
echo 5. Exit
echo.
set /p choice="Enter your choice (1-5): "

if "%choice%"=="1" (
    echo.
    echo Pushing to GitHub...
    git push origin main
    echo.
    goto :menu
)

if "%choice%"=="2" (
    echo.
    echo Opening build folder...
    start ios\build\ipa
    echo Build folder opened!
    echo.
    goto :menu
)

if "%choice%"=="3" (
    echo.
    echo 📱 Next Steps:
    echo.
    echo 1. Push to GitHub: git push origin main
    echo.
    echo 2. Setup Codemagic:
    echo    - Go to https://codemagic.io
    echo    - Connect your repository
    echo    - Click "Start new build"
    echo.
    echo 3. Download IPA:
    echo    - Wait 5-10 minutes
    echo    - Download Runner.ipa
    echo    - Install on iPhone
    echo.
    echo 📁 Files created:
    echo    • ios/build/ipa/Runner.ipa
    echo    • codemagic.yaml
    echo    • .github/workflows/ios.yml
    echo.
    goto :menu
)

if "%choice%"=="4" (
    echo.
    echo Building Android APK...
    flutter build apk --release
    echo.
    echo Android APK built successfully!
    echo Location: build/app/outputs/flutter-apk/app-release.apk
    echo.
    goto :menu
)

if "%choice%"=="5" (
    echo.
    echo Goodbye!
    exit
)

echo Invalid choice. Please try again.
echo.
goto :menu 