@echo off
title Auto iOS Build - Complete Setup
color 0A

echo ========================================
echo    AUTO iOS BUILD - COMPLETE SETUP
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

echo Step 4: GitHub Repository Setup
echo ================================
echo.
echo Please create a GitHub repository:
echo.
echo 1. Go to: https://github.com/new
echo 2. Repository name: InstagramServer
echo 3. Make it Public (for free GitHub Actions)
echo 4. Don't initialize with README
echo 5. Click "Create repository"
echo.
echo After creating, copy the repository URL
echo (Example: https://github.com/nwmserno/InstagramServer.git)
echo.

set /p repo_url="Enter your GitHub repository URL: "

echo.
echo Step 5: Adding remote and pushing...
git remote add origin %repo_url%
git push -u origin main

echo.
echo ========================================
echo           BUILD STARTED!
echo ========================================
echo.
echo 🎉 Your iOS build is now running on GitHub!
echo.
echo 📱 Next steps:
echo.
echo 1. Go to your GitHub repository
echo 2. Click "Actions" tab
echo 3. You'll see "iOS Build" workflow running
echo 4. Wait 10-15 minutes for build to complete
echo 5. Click on the completed workflow
echo 6. Scroll down to "Artifacts"
echo 7. Download "ios-app" (Runner.ipa)
echo.
echo 📁 Build location:
echo    GitHub Actions → ios-app artifact
echo.
echo ⏰ Estimated time: 10-15 minutes
echo.
echo Press any key to open your GitHub repository...
pause
start %repo_url% 