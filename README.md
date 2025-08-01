# 📱 InstagramServer - iOS Build on Windows

## 🚀 Quick Start (5 minutes)

### Step 1: Run One-Click Build
```bash
.\ONE_CLICK_iOS_BUILD.bat
```

### Step 2: Push to GitHub
```bash
git add .
git commit -m "Add iOS build configuration"
git push origin main
```

### Step 3: Setup Cloud Build
1. Go to [codemagic.io](https://codemagic.io)
2. Sign up with GitHub
3. Connect your repository
4. Click "Start new build"
5. Download Runner.ipa (5-10 minutes)

## 📁 Files for iOS Build

### Essential Files:
- `ONE_CLICK_iOS_BUILD.bat` - One-click build script
- `build_ios_windows_auto.bat` - Automatic setup script
- `codemagic.yaml` - Codemagic cloud build config
- `.github/workflows/ios.yml` - GitHub Actions workflow
- `ios/build/ipa/Runner.ipa` - iOS app file (placeholder)

### Configuration Files:
- `ios/Runner/Info.plist` - App permissions & settings
- `ios/exportOptions.plist` - Export configuration
- `ios/Podfile` - iOS dependencies

## 📱 Build Options

| Service | Cost | Time | Features |
|---------|------|------|----------|
| **Codemagic** | Free tier | 5-10 min | TestFlight upload |
| **GitHub Actions** | Free | 10-15 min | Basic CI/CD |
| Local VM | Free | 2 hours | Full control |

## ⚙️ Required Configuration

### Update These Files:

#### 1. Bundle Identifier
```xml
<!-- ios/Runner/Info.plist -->
<key>CFBundleIdentifier</key>
<string>com.yourcompany.instagramserver</string>
```

#### 2. Team ID
```xml
<!-- ios/exportOptions.plist -->
<key>teamID</key>
<string>YOUR_APPLE_TEAM_ID</string>
```

#### 3. Codemagic Config
```yaml
# codemagic.yaml
BUNDLE_ID: "com.yourcompany.instagramserver"
TEAM_ID: "YOUR_APPLE_TEAM_ID"
```

## 📱 Installation Methods

### 1. TestFlight (Recommended)
- Upload IPA to App Store Connect
- Add testers via TestFlight
- Install via TestFlight app

### 2. Direct Install
- Download IPA from cloud service
- Use iTunes or Apple Configurator
- Install on connected iPhone

### 3. Enterprise Distribution
- Host IPA on your server
- Users install via web link

## 🚨 Requirements

- **Apple Developer Account** (free or paid)
- **GitHub repository** for cloud builds
- **Team ID** from Apple Developer account
- **Bundle identifier** (unique app identifier)

## 📞 Support

### Useful Links:
- [Codemagic Documentation](https://docs.codemagic.io/)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Apple Developer Documentation](https://developer.apple.com/)

---

## 🎉 Success!

Your InstagramServer app is ready for iOS build on Windows!

**Start with `ONE_CLICK_iOS_BUILD.bat`** - it's the fastest way!

---

**Happy Building!** 🚀📱 