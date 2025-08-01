@echo off
title Setup GitHub Repository for iOS Build
color 0B

echo ========================================
echo    SETUP GITHUB REPOSITORY
echo ========================================
echo.

echo Step 1: Creating GitHub repository...
echo Please follow these steps:
echo.
echo 1. Go to https://github.com/new
echo 2. Repository name: InstagramServer
echo 3. Make it Public (for free GitHub Actions)
echo 4. Don't initialize with README
echo 5. Click "Create repository"
echo.
echo After creating the repository, copy the repository URL
echo (it will look like: https://github.com/nwmserno/InstagramServer.git)
echo.

set /p repo_url="Enter your GitHub repository URL: "

echo.
echo Step 2: Adding remote origin...
git remote add origin %repo_url%

echo.
echo Step 3: Pushing to GitHub...
git push -u origin main

echo.
echo ========================================
echo           SUCCESS!
echo ========================================
echo.
echo Your code is now on GitHub!
echo.
echo Next steps:
echo 1. Go to your GitHub repository
echo 2. Click "Actions" tab
echo 3. Wait for iOS build to complete
echo 4. Download Runner.ipa from artifacts
echo.
echo Press any key to open your GitHub repository...
pause
start https://github.com/yourusername/InstagramServer 