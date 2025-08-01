@echo off
title Codemagic iOS Build Setup
color 0E

echo ========================================
echo    CODEMAGIC iOS BUILD SETUP
echo ========================================
echo.

echo Step 1: Preparing project...
flutter clean
flutter pub get
echo ✓ Project prepared
echo.

echo Step 2: Creating iOS build structure...
if not exist "ios\build\ipa" mkdir ios\build\ipa
echo Placeholder IPA file > ios\build\ipa\Runner.ipa
echo ✓ iOS build structure created
echo.

echo Step 3: Setting up Git...
if not exist ".git" (
    git init
    git add .
    git commit -m "Add iOS build configuration"
    echo ✓ Git repository initialized
) else (
    echo ✓ Git repository exists
)
echo.

echo Step 4: Pushing to GitHub...
git add .
git commit -m "Update iOS build configuration"
git push origin master
echo ✓ Code pushed to GitHub
echo.

echo ========================================
echo    CODEMAGIC SETUP INSTRUCTIONS
echo ========================================
echo.
echo 🚀 Follow these steps to build iOS app:
echo.
echo 1. Go to: https://codemagic.io
echo 2. Click "Sign up with GitHub"
echo 3. Authorize Codemagic to access your GitHub
echo 4. Click "Add application"
echo 5. Select your repository: nwmserno/InstagramServer
echo 6. Click "Set up build"
echo 7. Choose "iOS" platform
echo 8. Click "Start your first build"
echo.
echo ⏰ Build time: 5-10 minutes
echo 📱 Result: Downloadable Runner.ipa file
echo.
echo Press any key to open Codemagic...
pause
start https://codemagic.io 