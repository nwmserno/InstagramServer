require('dotenv').config();
const express = require('express');
const cors = require('cors');
const storiesServerRouter = require('./Controller/StoriesServer.js');
const notificationRouter = require('./Controller/Notification.js');
const { scheduleCleanup } = require('./Controller/CleanupData.js');
const sessionManager = require('./Controller/SessionManager.js');

const app = express();
app.use(cors());
app.use(express.json());

// เรียกใช้ routers
app.use('/api', storiesServerRouter);
app.use('/api', notificationRouter);

// API endpoint สำหรับตรวจสอบสถานะ session
app.get('/api/session/status', (req, res) => {
  try {
    const status = sessionManager.getSessionStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint สำหรับรีเฟรช session
app.post('/api/session/refresh', async (req, res) => {
  try {
    await sessionManager.refreshSession();
    const status = sessionManager.getSessionStatus();
    res.json({
      success: true,
      message: 'รีเฟรช session สำเร็จ',
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API endpoint สำหรับตรวจสอบ credentials
app.get('/api/session/credentials', (req, res) => {
  try {
    const credentialsChanged = sessionManager.isCredentialsChanged();
    const status = sessionManager.getSessionStatus();
    res.json({
      success: true,
      data: {
        credentialsChanged: credentialsChanged,
        sessionStatus: status,
        currentUsername: process.env.IG_USERNAME,
        hasPassword: !!process.env.IG_PASSWORD
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});



const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log('🚀 ========================================');
  console.log('🚀 Instagram API Server Started');
  console.log('🚀 ========================================');
  console.log(`🌐 Server running on http://localhost:${PORT}`);
  console.log(`⏰ Started at: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  console.log('🔔 Notification System: Active');
  console.log('📧 Email Service: Active');
  console.log('🧹 เริ่มระบบลบข้อมูลอัตโนมัติ...');
  
  // ตรวจสอบและเตรียม session
  console.log('🔐 ตรวจสอบ session เก่า...');
  try {
    const sessionStatus = sessionManager.getSessionStatus();
    console.log('📊 Session Status:');
    console.log(`   - Login Status: ${sessionStatus.isLoggedIn ? '✅ เข้าสู่ระบบ' : '❌ ไม่ได้เข้าสู่ระบบ'}`);
    console.log(`   - Session Valid: ${sessionStatus.isSessionValid ? '✅ ใช้งานได้' : '❌ หมดอายุ'}`);
    console.log(`   - Session File: ${sessionStatus.hasSessionFile ? '✅ มีไฟล์' : '❌ ไม่มีไฟล์'}`);
    console.log(`   - Session Timeout: ${sessionStatus.sessionTimeout} ชั่วโมง`);
    console.log(`   - Login Attempts: ${sessionStatus.loginAttempts}/${sessionStatus.maxLoginAttemptsPerHour}`);
    console.log(`   - Can Attempt Login: ${sessionStatus.canAttemptLogin ? '✅ ได้' : '❌ ไม่ได้'}`);
    console.log(`   - Session File Size: ${sessionStatus.sessionFileSize} bytes`);
    console.log(`   - Should Rotate Session: ${sessionStatus.shouldRotateSession ? '🔄 ควรเปลี่ยน' : '✅ ยังไม่ต้องเปลี่ยน'}`);
    console.log(`   - Session Rotation Interval: ${sessionStatus.sessionRotationInterval} ชั่วโมง`);
    console.log(`   - Device Rotation: ${sessionStatus.deviceRotationEnabled ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน'}`);
    console.log(`   - Current Device Index: ${sessionStatus.currentDeviceIndex}`);
    console.log(`   - Session Only Mode: ${sessionStatus.sessionOnlyMode ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน'}`);
    console.log(`   - Aggressive Session Rotation: ${sessionStatus.aggressiveSessionRotation ? '✅ เปิดใช้งาน' : '❌ ปิดใช้งาน'}`);
    console.log(`   - Session Safe: ${sessionStatus.isSessionSafe ? '✅ ปลอดภัย' : '❌ ไม่ปลอดภัย'}`);
    
    // ตรวจสอบ credentials
    const credentialsChanged = sessionManager.isCredentialsChanged();
    console.log(`   - Credentials Changed: ${credentialsChanged ? '🔄 เปลี่ยนแล้ว' : '✅ ไม่เปลี่ยน'}`);
    console.log(`   - Saved Username: ${sessionStatus.savedUsername || 'ไม่มี'}`);
    console.log(`   - Current Username: ${sessionStatus.currentUsername || 'ไม่ตั้งค่า'}`);
    console.log(`   - Has Credentials: ${sessionStatus.hasCredentials ? '✅ มี' : '❌ ไม่มี'}`);
    
    if (credentialsChanged) {
      console.log('🔄 พบการเปลี่ยนแปลง credentials - ต้อง login ใหม่');
      await sessionManager.login();
    } else if (sessionStatus.hasSessionFile && sessionStatus.isSessionValid) {
      console.log('✅ พบ session เก่าที่ใช้งานได้ - ไม่ต้อง login ใหม่');
      // ตรวจสอบ session ว่ายังใช้งานได้จริงหรือไม่
      const isValid = await sessionManager.validateAndRepairSession();
      if (isValid) {
        console.log('✅ Session ผ่านการตรวจสอบและใช้งานได้');
      } else {
        console.log('🔄 Session ไม่ใช้งานได้ - เตรียม login ใหม่');
        await sessionManager.login();
      }
    } else {
      console.log('🔄 เตรียม login ใหม่...');
      await sessionManager.login();
    }
  } catch (error) {
    console.log('❌ Error ในการเตรียม session:', error.message);
  }
  
  console.log('🚀 ========================================');
  
  scheduleCleanup();
});