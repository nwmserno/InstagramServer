const { IgApiClient } = require('instagram-private-api');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ไฟล์เก็บ session
const SESSION_FILE = path.join(__dirname, '..', 'data', 'InstagramSession.json');

class SessionManager {
  constructor() {
    this.ig = new IgApiClient();
    this.isLoggedIn = false;
    this.lastLoginTime = null;
    this.sessionTimeout = 48 * 60 * 60 * 1000; // 48 ชั่วโมง (เพิ่มขึ้นเพื่อลดการ login บ่อย)
    this.maxRetries = 3;
    this.retryDelay = 15000; // 15 วินาที (เพิ่มขึ้นเพื่อป้องกัน rate limiting)
    this.loginAttempts = 0;
    this.lastLoginAttempt = null;
    this.maxLoginAttemptsPerHour = 3; // ลดลงเหลือ 3 ครั้งต่อชั่วโมง
    this.sessionRotationInterval = 24 * 60 * 60 * 1000; // เปลี่ยน session ทุก 24 ชั่วโมง
    this.deviceRotationEnabled = true;
    this.currentDeviceIndex = 0;
    this.sessionOnlyMode = true; // โหมดใช้ session เฉยๆ
    this.aggressiveSessionRotation = false; // ไม่หมุนเวียน session บ่อย
  }

  // โหลด session จากไฟล์
  loadSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        const data = fs.readFileSync(SESSION_FILE, 'utf8');
        if (data.trim()) {
          const session = JSON.parse(data);
          return session;
        }
      }
    } catch (error) {
      console.log('❌ Error โหลด session:', error.message);
    }
    return null;
  }

  // บันทึก session ลงไฟล์
  saveSession() {
    try {
      const session = {
        state: this.ig.state.serialize(),
        lastLoginTime: new Date().toISOString(),
        deviceString: this.ig.state.deviceString,
        uuid: this.ig.state.uuid,
        phoneId: this.ig.state.phoneId,
        adid: this.ig.state.adid,
        build: this.ig.state.build,
        username: process.env.IG_USERNAME, // เพิ่ม username เพื่อตรวจสอบการเปลี่ยนแปลง
        passwordHash: this.hashPassword(process.env.IG_PASSWORD) // เพิ่ม hash ของรหัสผ่าน
      };
      
      fs.writeFileSync(SESSION_FILE, JSON.stringify(session, null, 2));
      console.log('💾 บันทึก session สำเร็จ');
    } catch (error) {
      console.log('❌ Error บันทึก session:', error.message);
    }
  }

  // สร้าง hash ของรหัสผ่าน (ไม่เก็บรหัสผ่านจริง)
  hashPassword(password) {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(password).digest('hex');
  }

  // ลบ session
  clearSession() {
    try {
      if (fs.existsSync(SESSION_FILE)) {
        fs.unlinkSync(SESSION_FILE);
        console.log('🗑️ ลบ session เก่า');
      }
    } catch (error) {
      console.log('❌ Error ลบ session:', error.message);
    }
    this.isLoggedIn = false;
    this.lastLoginTime = null;
  }

  // ตรวจสอบว่า session ยังใช้งานได้หรือไม่
  isSessionValid() {
    if (!this.isLoggedIn || !this.lastLoginTime) {
      return false;
    }

    const now = new Date();
    const lastLogin = new Date(this.lastLoginTime);
    const timeDiff = now.getTime() - lastLogin.getTime();

    return timeDiff < this.sessionTimeout;
  }

  // ตรวจสอบว่าควรเปลี่ยน session หรือไม่
  shouldRotateSession() {
    if (!this.lastLoginTime) {
      return true;
    }

    const now = new Date();
    const lastLogin = new Date(this.lastLoginTime);
    const timeDiff = now.getTime() - lastLogin.getTime();

    // ถ้าเป็นโหมด session เฉยๆ ให้ใช้ session นานขึ้น
    if (this.sessionOnlyMode && !this.aggressiveSessionRotation) {
      // เปลี่ยน session ทุก 7 วัน (ปลอดภัยกว่า)
      return timeDiff > (7 * 24 * 60 * 60 * 1000);
    }

    // โหมดปกติ: เปลี่ยน session ทุก 24 ชั่วโมง
    return timeDiff > this.sessionRotationInterval;
  }

  // ตรวจสอบความปลอดภัยของ session
  isSessionSafe() {
    try {
      const savedSession = this.loadSession();
      if (!savedSession) {
        return false;
      }

      // ตรวจสอบว่า session ไม่เก่าเกินไป
      const lastLogin = new Date(savedSession.lastLoginTime);
      const now = new Date();
      const daysSinceLogin = (now.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);

      // Session ปลอดภัยถ้าไม่เกิน 30 วัน
      return daysSinceLogin < 30;
    } catch (error) {
      return false;
    }
  }

  // สร้าง device string ใหม่
  generateNewDevice() {
    const devices = [
      // Samsung Galaxy S21
      {
        deviceString: "30/11; 420dpi; 1080x2400; samsung; SM-G991B; o1s; qcom",
        build: "RP1A.200720.012"
      },
      // iPhone 13
      {
        deviceString: "25/15.0; 390dpi; 1170x2532; apple; iPhone14,2; iPhone14,2; qcom",
        build: "19A346"
      },
      // Google Pixel 6
      {
        deviceString: "31/12; 420dpi; 1080x2400; google; Pixel 6; redfin; qcom",
        build: "SP2A.220505.002"
      },
      // OnePlus 9
      {
        deviceString: "30/11; 420dpi; 1080x2400; OnePlus; LE2113; lemonade; qcom",
        build: "RKQ1.201217.002"
      }
    ];

    this.currentDeviceIndex = (this.currentDeviceIndex + 1) % devices.length;
    return devices[this.currentDeviceIndex];
  }



  // ตรวจสอบว่า credentials เปลี่ยนไปหรือไม่
  isCredentialsChanged() {
    try {
      const savedSession = this.loadSession();
      if (!savedSession) {
        return true; // ไม่มี session เก่า = ต้อง login ใหม่
      }

      const currentUsername = process.env.IG_USERNAME;
      const currentPasswordHash = this.hashPassword(process.env.IG_PASSWORD);

      // ตรวจสอบ username และ password hash
      if (savedSession.username !== currentUsername || 
          savedSession.passwordHash !== currentPasswordHash) {
        console.log('🔍 พบการเปลี่ยนแปลง credentials:');
        console.log(`   - Username เปลี่ยน: ${savedSession.username} -> ${currentUsername}`);
        console.log(`   - Password เปลี่ยน: ${savedSession.passwordHash !== currentPasswordHash ? 'ใช่' : 'ไม่'}`);
        return true;
      }

      return false;
    } catch (error) {
      console.log('❌ Error ตรวจสอบ credentials:', error.message);
      return true; // ถ้าเกิด error ให้ login ใหม่เพื่อความปลอดภัย
    }
  }

  // ตรวจสอบการจำกัดการ login
  canAttemptLogin() {
    const now = new Date();
    
    // รีเซ็ตการนับถ้าเกิน 1 ชั่วโมง
    if (this.lastLoginAttempt) {
      const timeDiff = now.getTime() - this.lastLoginAttempt.getTime();
      if (timeDiff > 60 * 60 * 1000) { // 1 ชั่วโมง
        this.loginAttempts = 0;
      }
    }
    
    return this.loginAttempts < this.maxLoginAttemptsPerHour;
  }

  // เพิ่มการนับการ login
  incrementLoginAttempts() {
    this.loginAttempts++;
    this.lastLoginAttempt = new Date();
  }

  // หน่วงเวลา
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ตรวจสอบ error ที่ต้องรีเฟรช session
  isSessionError(error) {
    const errorMessage = error.message.toLowerCase();
    const sessionErrors = [
      'login required',
      'checkpoint',
      'challenge',
      'session expired',
      'invalid session',
      'not logged in',
      'user not found',
      'rate limit',
      'temporarily blocked'
    ];
    return sessionErrors.some(err => errorMessage.includes(err));
  }

  // Login ด้วย session หรือ login ใหม่
  async login(retryCount = 0) {
    try {
      // ตรวจสอบการจำกัดการ login
      if (!this.canAttemptLogin()) {
        const waitTime = Math.ceil((60 * 60 * 1000 - (new Date().getTime() - this.lastLoginAttempt.getTime())) / 1000 / 60);
        throw new Error(`เกินจำนวนการ login ที่อนุญาต (${this.maxLoginAttemptsPerHour} ครั้งต่อชั่วโมง) กรุณารอ ${waitTime} นาที`);
      }

      // ตรวจสอบว่า credentials เปลี่ยนไปหรือไม่
      if (this.isCredentialsChanged()) {
        console.log('🔄 พบการเปลี่ยนแปลง credentials - ลบ session เก่าและ login ใหม่');
        this.clearSession();
      }

      // ลองใช้ session เก่า (ถ้า credentials ไม่เปลี่ยน)
      const savedSession = this.loadSession();
      if (savedSession && !this.isCredentialsChanged()) {
        try {
          console.log('🔄 ลองใช้ session เก่า...');
          this.ig.state.deserialize(savedSession.state);
          this.lastLoginTime = savedSession.lastLoginTime;
          
          // ทดสอบ session
          await this.ig.account.currentUser();
          this.isLoggedIn = true;
          console.log('✅ ใช้ session เก่าสำเร็จ');
          this.logSessionActivity('login', 'ใช้ session เก่า');
          return true;
        } catch (error) {
          console.log('❌ Session เก่าไม่ใช้งานได้:', error.message);
          this.clearSession();
        }
      }

      // Login ใหม่
      console.log(`🔐 Login ใหม่... (ครั้งที่ ${retryCount + 1})`);
      this.incrementLoginAttempts();
      
      // ใช้ device rotation ถ้าเปิดใช้งาน
      if (this.deviceRotationEnabled) {
        const newDevice = this.generateNewDevice();
        console.log(`📱 ใช้ device ใหม่: ${newDevice.deviceString}`);
        this.ig.state.generateDevice(process.env.IG_USERNAME, newDevice.deviceString, newDevice.build);
      } else {
        this.ig.state.generateDevice(process.env.IG_USERNAME);
      }
      
      await this.ig.account.login(process.env.IG_USERNAME, process.env.IG_PASSWORD);
      
      this.isLoggedIn = true;
      this.lastLoginTime = new Date().toISOString();
      this.saveSession();
      
      console.log('✅ Login สำเร็จ');
      this.logSessionActivity('login', 'login ใหม่สำเร็จ');
      return true;
    } catch (error) {
      console.log(`❌ Login ล้มเหลว (ครั้งที่ ${retryCount + 1}):`, error.message);
      
      // ลองใหม่ถ้ายังไม่เกินจำนวนครั้ง
      if (retryCount < this.maxRetries - 1) {
        console.log(`⏳ รอ ${this.retryDelay / 1000} วินาที แล้วลองใหม่...`);
        await this.delay(this.retryDelay);
        return this.login(retryCount + 1);
      }
      
      this.isLoggedIn = false;
      this.clearSession();
      this.logSessionActivity('login', `login ล้มเหลว: ${error.message}`);
      throw error;
    }
  }

  // ตรวจสอบและ login ถ้าจำเป็น
  async ensureLogin() {
    try {
      // ตรวจสอบว่า credentials เปลี่ยนไปหรือไม่
      if (this.isCredentialsChanged()) {
        console.log('🔄 พบการเปลี่ยนแปลง credentials - ต้อง login ใหม่');
        this.logSessionActivity('ensure_login', 'credentials เปลี่ยน - login ใหม่');
        await this.login();
        return this.ig;
      }



      // ตรวจสอบว่าควรเปลี่ยน session หรือไม่
      if (this.shouldRotateSession()) {
        if (this.sessionOnlyMode) {
          console.log('🔄 ถึงเวลาหมุนเวียน session (โหมด session เฉยๆ) - เปลี่ยน session ใหม่');
          this.logSessionActivity('ensure_login', 'session rotation - session only mode');
        } else {
          console.log('🔄 ถึงเวลาหมุนเวียน session - เปลี่ยน session ใหม่');
          this.logSessionActivity('ensure_login', 'session rotation - normal mode');
        }
        this.clearSession();
        await this.login();
        return this.ig;
      }

      // ตรวจสอบ session ปัจจุบัน
      if (this.isLoggedIn) {
        const isValid = await this.validateAndRepairSession();
        if (isValid) {
          this.logSessionActivity('ensure_login', 'ใช้ session ปัจจุบัน');
          return this.ig;
        }
      }

      // ตรวจสอบ session timeout
      if (!this.isSessionValid()) {
        this.logSessionActivity('ensure_login', 'session หมดอายุ');
      }

      // Login ใหม่
      await this.login();
      this.logSessionActivity('ensure_login', 'login ใหม่สำเร็จ');
      return this.ig;
    } catch (error) {
      this.logSessionActivity('ensure_login', `error: ${error.message}`);
      throw error;
    }
  }

  // ทำงานพร้อม retry mechanism
  async executeWithRetry(operation, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const ig = await this.ensureLogin();
        return await operation(ig);
      } catch (error) {
        console.log(`❌ Error (ครั้งที่ ${attempt + 1}):`, error.message);
        
        // ถ้าเป็น session error ให้รีเฟรช session
        if (this.isSessionError(error)) {
          console.log('🔄 รีเฟรช session เนื่องจาก session error...');
          this.clearSession();
          this.isLoggedIn = false;
          
          if (attempt < maxRetries - 1) {
            await this.delay(this.retryDelay);
            continue;
          }
        }
        
        // ถ้าเป็นครั้งสุดท้ายแล้ว ให้ throw error
        if (attempt === maxRetries - 1) {
          throw error;
        }
        
        // รอแล้วลองใหม่
        await this.delay(this.retryDelay);
      }
    }
  }

  // Logout
  async logout() {
    try {
      if (this.isLoggedIn) {
        await this.ig.account.logout();
        console.log('👋 Logout สำเร็จ');
      }
    } catch (error) {
      console.log('❌ Error logout:', error.message);
    } finally {
      this.isLoggedIn = false;
      this.clearSession();
    }
  }

  // ตรวจสอบสถานะการเชื่อมต่อ
  async checkConnection() {
    try {
      await this.ensureLogin();
      await this.ig.account.currentUser();
      return true;
    } catch (error) {
      console.log('❌ การเชื่อมต่อมีปัญหา:', error.message);
      return false;
    }
  }

  // รีเฟรช session
  async refreshSession() {
    console.log('🔄 รีเฟรช session...');
    this.clearSession();
    return await this.login();
  }

    // ดูสถานะ session
  getSessionStatus() {
    const savedSession = this.loadSession();
    return {
      isLoggedIn: this.isLoggedIn,
      lastLoginTime: this.lastLoginTime,
      isSessionValid: this.isSessionValid(),
      sessionTimeout: this.sessionTimeout / (1000 * 60 * 60), // แปลงเป็นชั่วโมง
      hasSessionFile: fs.existsSync(SESSION_FILE),
      loginAttempts: this.loginAttempts,
      maxLoginAttemptsPerHour: this.maxLoginAttemptsPerHour,
      canAttemptLogin: this.canAttemptLogin(),
      sessionFileSize: fs.existsSync(SESSION_FILE) ? fs.statSync(SESSION_FILE).size : 0,
      credentialsChanged: this.isCredentialsChanged(),
      savedUsername: savedSession ? savedSession.username : null,
      currentUsername: process.env.IG_USERNAME,
      hasCredentials: !!(process.env.IG_USERNAME && process.env.IG_PASSWORD),
      shouldRotateSession: this.shouldRotateSession(),
      sessionRotationInterval: this.sessionRotationInterval / (1000 * 60 * 60), // แปลงเป็นชั่วโมง
      deviceRotationEnabled: this.deviceRotationEnabled,
      currentDeviceIndex: this.currentDeviceIndex,
      sessionOnlyMode: this.sessionOnlyMode,
      aggressiveSessionRotation: this.aggressiveSessionRotation,
      isSessionSafe: this.isSessionSafe()
    };
  }

  // บันทึก log การใช้งาน session
  logSessionActivity(action, details = '') {
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: action,
      details: details,
      isLoggedIn: this.isLoggedIn,
      sessionValid: this.isSessionValid()
    };
    
    console.log(`📝 Session Log [${action}]: ${details}`);
    
    // บันทึกลงไฟล์ log (ถ้าต้องการ)
          const logFile = path.join(__dirname, '..', 'data', 'SessionLogin.json');
    try {
      let logs = [];
      if (fs.existsSync(logFile)) {
        logs = JSON.parse(fs.readFileSync(logFile, 'utf8'));
      }
      logs.push(logEntry);
      
      // เก็บ log แค่ 100 รายการล่าสุด
      if (logs.length > 100) {
        logs = logs.slice(-100);
      }
      
      fs.writeFileSync(logFile, JSON.stringify(logs, null, 2));
    } catch (error) {
      console.log('❌ Error บันทึก log:', error.message);
    }
  }

  // ตรวจสอบและซ่อมแซม session
  async validateAndRepairSession() {
    try {
      if (!this.isLoggedIn) {
        return false;
      }

      // ทดสอบ session
      await this.ig.account.currentUser();
      this.logSessionActivity('session_validation', 'session ใช้งานได้');
      return true;
    } catch (error) {
      console.log('❌ Session ไม่ใช้งานได้:', error.message);
      this.logSessionActivity('session_validation', `session error: ${error.message}`);
      
      // ลองใช้ session เก่าจากไฟล์
      const savedSession = this.loadSession();
      if (savedSession) {
        try {
          this.ig.state.deserialize(savedSession.state);
          await this.ig.account.currentUser();
          this.isLoggedIn = true;
          this.lastLoginTime = savedSession.lastLoginTime;
          this.logSessionActivity('session_repair', 'ซ่อมแซม session สำเร็จ');
          return true;
        } catch (repairError) {
          console.log('❌ ไม่สามารถซ่อมแซม session ได้:', repairError.message);
          this.clearSession();
          return false;
        }
      }
      
      return false;
    }
  }
}

// สร้าง instance เดียว
const sessionManager = new SessionManager();

module.exports = sessionManager; 