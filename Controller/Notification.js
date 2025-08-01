const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { checkUserPrivacy, sendEmail, sendBulkEmail } = require('./CheckUserPrivacy.js');
const { checkNewStories, sendBulkStoriesEmail } = require('./CheckNewStories.js');

// เก็บ scheduled tasks
const scheduledTasks = new Map();
const SCHEDULE_FILE = path.join(__dirname, '../data/ScheduledTasks.json');
const OVERDUE_CHECK_FILE = path.join(__dirname, '../data/OverdueEmail.json');
const BOT_PROTECTION_FILE = path.join(__dirname, '../data/BotProtection.json');

// ฟังก์ชันสำหรับโหลดข้อมูลการป้องกัน bot
async function loadBotProtectionData() {
  try {
    await fs.access(BOT_PROTECTION_FILE);
    const data = await fs.readFile(BOT_PROTECTION_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // ถ้าไฟล์ไม่มีอยู่ ให้สร้างไฟล์ใหม่
    const defaultData = {
      lastCheckTime: null,
      checkCount: 0,
      dailyCheckLimit: 50,
      resetTime: null,
      minIntervalMinutes: 5,
      maxChecksPerHour: 10,
      hourlyChecks: [],
      dailyChecks: []
    };
    await fs.writeFile(BOT_PROTECTION_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

// ฟังก์ชันสำหรับบันทึกข้อมูลการป้องกัน bot
async function saveBotProtectionData(data) {
  try {
    await fs.writeFile(BOT_PROTECTION_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Error บันทึกข้อมูลการป้องกัน bot: ${error.message}`);
  }
}

// ฟังก์ชันสำหรับตรวจสอบและอัพเดตการป้องกัน bot ขั้นสูง
async function checkBotProtection() {
  const protectionData = await loadBotProtectionData();
  const now = new Date();
  
  // ตรวจสอบ Emergency Mode (ระดับสูงสุด)
  const emergencyCheck = await checkEmergencyMode();
  if (!emergencyCheck.canCheck) {
    return emergencyCheck;
  }
  
  // ตรวจสอบ Safety Mode
  if (protectionData.safetyMode.enabled) {
    const safetyStart = new Date(protectionData.safetyMode.activationTime);
    const safetyEnd = new Date(safetyStart.getTime() + protectionData.safetyMode.durationMinutes * 60 * 1000);
    
    if (now < safetyEnd) {
      const remainingMinutes = Math.ceil((safetyEnd.getTime() - now.getTime()) / (1000 * 60));
      console.log(`🚨 Safety Mode เปิดใช้งาน - รอ ${remainingMinutes} นาที (${protectionData.safetyMode.triggeredBy})`);
      return {
        canCheck: false,
        reason: `Safety Mode: ${protectionData.safetyMode.triggeredBy} - รอ ${remainingMinutes} นาที`,
        remainingMinutes,
        safetyMode: true
      };
    } else {
      // ปิด Safety Mode
      protectionData.safetyMode.enabled = false;
      protectionData.safetyMode.triggeredBy = null;
      protectionData.safetyMode.activationTime = null;
      console.log(`✅ ปิด Safety Mode`);
    }
  }
  
  // รีเซ็ตข้อมูลรายวัน
  if (!protectionData.resetTime || new Date(protectionData.resetTime) <= now) {
    protectionData.checkCount = 0;
    protectionData.hourlyChecks = [];
    protectionData.dailyChecks = [];
    protectionData.resetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    protectionData.advancedProtection.sessionManagement.sessionCount = 0;
    protectionData.advancedProtection.requestPatterns.consecutiveCount = 0;
    protectionData.advancedProtection.errorHandling.errorCount = 0;
    console.log(`🔄 รีเซ็ตข้อมูลการป้องกัน bot รายวัน`);
  }
  
  // ตรวจสอบการจำกัดรายชั่วโมง
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  protectionData.hourlyChecks = protectionData.hourlyChecks.filter(time => new Date(time) > oneHourAgo);
  
  // ตรวจสอบการจำกัดรายวัน
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  protectionData.dailyChecks = protectionData.dailyChecks.filter(time => new Date(time) > oneDayAgo);
  
  // ตรวจสอบ Session Management
  if (protectionData.advancedProtection.sessionManagement.currentSessionStart) {
    const sessionStart = new Date(protectionData.advancedProtection.sessionManagement.currentSessionStart);
    const sessionTimeout = new Date(sessionStart.getTime() + protectionData.advancedProtection.sessionManagement.sessionTimeoutMinutes * 60 * 1000);
    
    if (now > sessionTimeout) {
      protectionData.advancedProtection.sessionManagement.currentSessionStart = null;
      console.log(`⏰ Session หมดเวลา - เริ่ม Session ใหม่`);
    }
  }
  
  // ตรวจสอบ Request Patterns
  if (protectionData.advancedProtection.requestPatterns.lastConsecutiveTime) {
    const lastConsecutive = new Date(protectionData.advancedProtection.requestPatterns.lastConsecutiveTime);
    const cooldownEnd = new Date(lastConsecutive.getTime() + protectionData.advancedProtection.requestPatterns.cooldownMinutes * 60 * 1000);
    
    if (now < cooldownEnd) {
      const remainingMinutes = Math.ceil((cooldownEnd.getTime() - now.getTime()) / (1000 * 60));
      console.log(`⏰ Cooldown จากการร้องขอต่อเนื่อง - รอ ${remainingMinutes} นาที`);
      return {
        canCheck: false,
        reason: `Cooldown จากการร้องขอต่อเนื่อง - รอ ${remainingMinutes} นาที`,
        remainingMinutes
      };
    } else {
      protectionData.advancedProtection.requestPatterns.consecutiveCount = 0;
    }
  }
  
  // ตรวจสอบ Error Handling
  if (protectionData.advancedProtection.errorHandling.lastErrorTime) {
    const lastError = new Date(protectionData.advancedProtection.errorHandling.lastErrorTime);
    const errorCooldownEnd = new Date(lastError.getTime() + protectionData.advancedProtection.errorHandling.errorCooldownMinutes * 60 * 1000);
    
    if (now < errorCooldownEnd) {
      const remainingMinutes = Math.ceil((errorCooldownEnd.getTime() - now.getTime()) / (1000 * 60));
      console.log(`⏰ Cooldown หลัง Error - รอ ${remainingMinutes} นาที`);
      return {
        canCheck: false,
        reason: `Cooldown หลัง Error - รอ ${remainingMinutes} นาที`,
        remainingMinutes
      };
    }
  }
  
  // ตรวจสอบ Time-based Restrictions
  const currentHour = now.getHours();
  const currentMinute = now.getMinutes();
  const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
  
  let timeMultiplier = 1.0;
  
  // Peak Hours (09:00-18:00) - ลดการใช้งาน
  if (currentTime >= protectionData.advancedProtection.timeBasedRestrictions.peakHours.start && 
      currentTime <= protectionData.advancedProtection.timeBasedRestrictions.peakHours.end) {
    timeMultiplier = protectionData.advancedProtection.timeBasedRestrictions.peakHours.reducedLimit;
    console.log(`📊 Peak Hours - ลดการใช้งานเป็น ${timeMultiplier * 100}%`);
  }
  
  // Night Mode (22:00-06:00) - ลดการใช้งานมาก
  if (protectionData.advancedProtection.timeBasedRestrictions.nightMode.enabled) {
    if (currentTime >= protectionData.advancedProtection.timeBasedRestrictions.nightMode.start || 
        currentTime <= protectionData.advancedProtection.timeBasedRestrictions.nightMode.end) {
      timeMultiplier = protectionData.advancedProtection.timeBasedRestrictions.nightMode.reducedLimit;
      console.log(`🌙 Night Mode - ลดการใช้งานเป็น ${timeMultiplier * 100}%`);
    }
  }
  
  // Weekend/Holiday Mode
  const weekendHolidayMultiplier = await checkWeekendHolidayMode();
  timeMultiplier *= weekendHolidayMultiplier;
  
  // Progressive Backoff
  const progressiveBackoffMinutes = await checkProgressiveBackoff();
  if (progressiveBackoffMinutes > 0) {
    console.log(`⏰ Progressive Backoff - รอ ${progressiveBackoffMinutes} นาที`);
    return {
      canCheck: false,
      reason: `Progressive Backoff - รอ ${progressiveBackoffMinutes} นาที`,
      remainingMinutes: progressiveBackoffMinutes
    };
  }
  
  // ปรับการจำกัดตาม Time Multiplier
  const adjustedHourlyLimit = Math.floor(protectionData.maxChecksPerHour * timeMultiplier);
  const adjustedDailyLimit = Math.floor(protectionData.dailyCheckLimit * timeMultiplier);
  
  // ตรวจสอบระยะเวลาขั้นต่ำระหว่างการตรวจสอบ
  if (protectionData.lastCheckTime) {
    const lastCheck = new Date(protectionData.lastCheckTime);
    const timeDiff = now.getTime() - lastCheck.getTime();
    const minutesDiff = Math.floor(timeDiff / (1000 * 60));
    
    if (minutesDiff < protectionData.minIntervalMinutes) {
      const remainingMinutes = protectionData.minIntervalMinutes - minutesDiff;
      console.log(`⏰ ต้องรอ ${remainingMinutes} นาทีก่อนตรวจสอบครั้งถัดไป (ป้องกัน bot)`);
      return {
        canCheck: false,
        reason: `ต้องรอ ${remainingMinutes} นาทีก่อนตรวจสอบครั้งถัดไป`,
        remainingMinutes
      };
    }
  }
  
  // ตรวจสอบการจำกัดรายชั่วโมง (ปรับแล้ว)
  if (protectionData.hourlyChecks.length >= adjustedHourlyLimit) {
    const oldestCheck = new Date(protectionData.hourlyChecks[0]);
    const timeUntilReset = 60 - Math.floor((now.getTime() - oldestCheck.getTime()) / (1000 * 60));
    console.log(`⏰ เกินการจำกัด ${adjustedHourlyLimit} ครั้งต่อชั่วโมง (ป้องกัน bot) - รอ ${timeUntilReset} นาที`);
    return {
      canCheck: false,
      reason: `เกินการจำกัด ${adjustedHourlyLimit} ครั้งต่อชั่วโมง - รอ ${timeUntilReset} นาที`,
      remainingMinutes: timeUntilReset
    };
  }
  
  // ตรวจสอบการจำกัดรายวัน (ปรับแล้ว)
  if (protectionData.dailyChecks.length >= adjustedDailyLimit) {
    console.log(`⏰ เกินการจำกัด ${adjustedDailyLimit} ครั้งต่อวัน (ป้องกัน bot)`);
    return {
      canCheck: false,
      reason: `เกินการจำกัด ${adjustedDailyLimit} ครั้งต่อวัน`,
      remainingMinutes: 1440 // 24 ชั่วโมง
    };
  }
  
  // ตรวจสอบ Session Limit
  if (protectionData.advancedProtection.sessionManagement.sessionCount >= protectionData.advancedProtection.sessionManagement.maxSessionsPerDay) {
    console.log(`⏰ เกินการจำกัด Session ต่อวัน (ป้องกัน bot)`);
    return {
      canCheck: false,
      reason: `เกินการจำกัด Session ต่อวัน`,
      remainingMinutes: 1440 // 24 ชั่วโมง
    };
  }
  
  return { 
    canCheck: true,
    timeMultiplier,
    adjustedLimits: {
      hourly: adjustedHourlyLimit,
      daily: adjustedDailyLimit
    }
  };
}

// ฟังก์ชันสำหรับบันทึกการตรวจสอบ
async function recordCheck(success = true, responseTime = 0) {
  const protectionData = await loadBotProtectionData();
  const now = new Date();
  
  protectionData.lastCheckTime = now.toISOString();
  protectionData.checkCount++;
  protectionData.hourlyChecks.push(now.toISOString());
  protectionData.dailyChecks.push(now.toISOString());
  
  // อัพเดตสถิติ
  protectionData.statistics.totalRequests++;
  if (success) {
    protectionData.statistics.successfulRequests++;
    protectionData.statistics.lastSuccessTime = now.toISOString();
    protectionData.statistics.consecutiveSuccesses++;
    protectionData.statistics.consecutiveFailures = 0; // รีเซ็ตเมื่อสำเร็จ
  } else {
    protectionData.statistics.failedRequests++;
    protectionData.statistics.lastFailureTime = now.toISOString();
    protectionData.statistics.consecutiveFailures++;
    protectionData.statistics.consecutiveSuccesses = 0; // รีเซ็ตเมื่อล้มเหลว
  }
  
  // บันทึก Response Time
  if (responseTime > 0) {
    protectionData.statistics.responseTimes.push(responseTime);
    if (protectionData.statistics.responseTimes.length > 100) {
      protectionData.statistics.responseTimes.shift(); // เก็บแค่ 100 รายการล่าสุด
    }
    protectionData.statistics.averageResponseTime = protectionData.statistics.responseTimes.reduce((a, b) => a + b, 0) / protectionData.statistics.responseTimes.length;
  }
  
  // อัพเดต Success Rate
  if (protectionData.statistics.totalRequests > 0) {
    protectionData.advancedProtection.adaptiveLimits.currentSuccessRate = protectionData.statistics.successfulRequests / protectionData.statistics.totalRequests;
  }
  
  // อัพเดต Request Patterns
  if (protectionData.advancedProtection.requestPatterns.lastConsecutiveTime) {
    const lastConsecutive = new Date(protectionData.advancedProtection.requestPatterns.lastConsecutiveTime);
    const timeDiff = now.getTime() - lastConsecutive.getTime();
    
    if (timeDiff < 5 * 60 * 1000) { // ภายใน 5 นาที
      protectionData.advancedProtection.requestPatterns.consecutiveCount++;
      protectionData.advancedProtection.requestPatterns.lastConsecutiveTime = now.toISOString();
      
      // ตรวจสอบการเกินขีดจำกัด
      if (protectionData.advancedProtection.requestPatterns.consecutiveCount >= protectionData.advancedProtection.requestPatterns.maxConsecutiveRequests) {
        console.log(`⚠️ เกินการจำกัดการร้องขอต่อเนื่อง - เริ่ม Cooldown`);
      }
    } else {
      protectionData.advancedProtection.requestPatterns.consecutiveCount = 1;
      protectionData.advancedProtection.requestPatterns.lastConsecutiveTime = now.toISOString();
    }
  } else {
    protectionData.advancedProtection.requestPatterns.consecutiveCount = 1;
    protectionData.advancedProtection.requestPatterns.lastConsecutiveTime = now.toISOString();
  }
  
  // เริ่ม Session ถ้ายังไม่มี
  if (!protectionData.advancedProtection.sessionManagement.currentSessionStart) {
    protectionData.advancedProtection.sessionManagement.currentSessionStart = now.toISOString();
    protectionData.advancedProtection.sessionManagement.sessionCount++;
    console.log(`🔄 เริ่ม Session ใหม่ (${protectionData.advancedProtection.sessionManagement.sessionCount}/${protectionData.advancedProtection.sessionManagement.maxSessionsPerDay})`);
  }
  
  await saveBotProtectionData(protectionData);
  
  console.log(`📊 บันทึกการตรวจสอบ - วันนี้: ${protectionData.dailyChecks.length}/${protectionData.dailyCheckLimit}, ชั่วโมงนี้: ${protectionData.hourlyChecks.length}/${protectionData.maxChecksPerHour}, Success Rate: ${(protectionData.advancedProtection.adaptiveLimits.currentSuccessRate * 100).toFixed(1)}%`);
}

// ฟังก์ชันสำหรับบันทึก Error และจัดการ Safety Mode
async function recordError(errorMessage) {
  const protectionData = await loadBotProtectionData();
  const now = new Date();
  
  // อัพเดตสถิติ
  protectionData.statistics.consecutiveFailures++;
  protectionData.statistics.consecutiveSuccesses = 0;
  
  // ตรวจสอบว่าเป็น Suspicious Error หรือไม่
  const isSuspicious = protectionData.advancedProtection.errorHandling.suspiciousErrors.some(
    suspicious => errorMessage.toLowerCase().includes(suspicious.toLowerCase())
  );
  
  if (isSuspicious) {
    console.log(`🚨 ตรวจพบ Suspicious Error: ${errorMessage}`);
    
    // เพิ่ม Error Count
    protectionData.advancedProtection.errorHandling.errorCount++;
    protectionData.advancedProtection.errorHandling.lastErrorTime = now.toISOString();
    
    // ตรวจสอบการเกินขีดจำกัด Error
    if (protectionData.advancedProtection.errorHandling.errorCount >= protectionData.advancedProtection.errorHandling.maxErrorsPerHour) {
      console.log(`🚨 เกินการจำกัด Error ต่อชั่วโมง - เปิด Safety Mode`);
      
      // เปิด Safety Mode
      protectionData.safetyMode.enabled = true;
      protectionData.safetyMode.triggeredBy = `Suspicious Error: ${errorMessage}`;
      protectionData.safetyMode.activationTime = now.toISOString();
      
      await saveBotProtectionData(protectionData);
      return;
    }
    
    // ตรวจสอบ Emergency Mode สำหรับ Critical Errors
    const criticalErrors = ['blocked', 'suspended', 'disabled', 'captcha', 'checkpoint'];
    const isCritical = criticalErrors.some(critical => errorMessage.toLowerCase().includes(critical.toLowerCase()));
    
    if (isCritical && protectionData.statistics.consecutiveFailures >= 3) {
      console.log(`🚨 ตรวจพบ Critical Error - เปิด Emergency Mode`);
      
      // เปิด Emergency Mode
      protectionData.emergencyMode.enabled = true;
      protectionData.emergencyMode.triggeredBy = `Critical Error: ${errorMessage}`;
      protectionData.emergencyMode.activationTime = now.toISOString();
      
      await saveBotProtectionData(protectionData);
      return;
    }
  }
  
  // บันทึก Error ปกติ
  await recordCheck(false);
}

// ฟังก์ชันสำหรับสร้าง Random Delay
async function getRandomDelay() {
  const protectionData = await loadBotProtectionData();
  const { minSeconds, maxSeconds } = protectionData.advancedProtection.randomDelays;
  
  if (!protectionData.advancedProtection.randomDelays.enabled) {
    return 30; // ค่าเริ่มต้น
  }
  
  const delay = Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;
  return delay;
}

// ฟังก์ชันสำหรับสร้าง Human-like Delay
async function getHumanLikeDelay() {
  const protectionData = await loadBotProtectionData();
  const { typingDelay, readingDelay, thinkingDelay } = protectionData.advancedProtection.behavioralPatterns.humanLikeDelays;
  
  if (!protectionData.advancedProtection.behavioralPatterns.humanLikeDelays.enabled) {
    return 0;
  }
  
  const typingTime = Math.floor(Math.random() * (typingDelay.maxMs - typingDelay.minMs + 1)) + typingDelay.minMs;
  const readingTime = Math.floor(Math.random() * (readingDelay.maxMs - readingDelay.minMs + 1)) + readingDelay.minMs;
  const thinkingTime = Math.floor(Math.random() * (thinkingDelay.maxMs - thinkingDelay.minMs + 1)) + thinkingDelay.minMs;
  
  return (typingTime + readingTime + thinkingTime) / 1000; // แปลงเป็นวินาที
}

// ฟังก์ชันสำหรับตรวจสอบและจัดการ Emergency Mode
async function checkEmergencyMode() {
  const protectionData = await loadBotProtectionData();
  
  if (protectionData.emergencyMode.enabled) {
    const activationTime = new Date(protectionData.emergencyMode.activationTime);
    const emergencyEnd = new Date(activationTime.getTime() + protectionData.emergencyMode.durationHours * 60 * 60 * 1000);
    const now = new Date();
    
    if (now < emergencyEnd) {
      const remainingHours = Math.ceil((emergencyEnd.getTime() - now.getTime()) / (1000 * 60 * 60));
      console.log(`🚨 EMERGENCY MODE เปิดใช้งาน - รอ ${remainingHours} ชั่วโมง (${protectionData.emergencyMode.triggeredBy})`);
      return {
        canCheck: false,
        reason: `EMERGENCY MODE: ${protectionData.emergencyMode.triggeredBy} - รอ ${remainingHours} ชั่วโมง`,
        remainingHours,
        emergencyMode: true
      };
    } else {
      // ปิด Emergency Mode
      protectionData.emergencyMode.enabled = false;
      protectionData.emergencyMode.triggeredBy = null;
      protectionData.emergencyMode.activationTime = null;
      await saveBotProtectionData(protectionData);
      console.log(`✅ ปิด Emergency Mode`);
    }
  }
  
  return { canCheck: true };
}

// ฟังก์ชันสำหรับตรวจสอบ Progressive Backoff
async function checkProgressiveBackoff() {
  const protectionData = await loadBotProtectionData();
  const { consecutiveFailures } = protectionData.statistics;
  const { baseDelayMinutes, maxDelayHours, multiplier } = protectionData.advancedProtection.progressiveBackoff;
  
  if (!protectionData.advancedProtection.progressiveBackoff.enabled || consecutiveFailures === 0) {
    return 0;
  }
  
  const delayMinutes = Math.min(baseDelayMinutes * Math.pow(multiplier, consecutiveFailures - 1), maxDelayHours * 60);
  return delayMinutes;
}

// ฟังก์ชันสำหรับตรวจสอบ Weekend/Holiday Mode
async function checkWeekendHolidayMode() {
  const protectionData = await loadBotProtectionData();
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday
  
  let multiplier = 1.0;
  
  // Weekend Mode
  if (protectionData.advancedProtection.timeBasedRestrictions.weekendMode.enabled) {
    if (dayOfWeek === 0 || dayOfWeek === 6) { // Sunday or Saturday
      multiplier *= protectionData.advancedProtection.timeBasedRestrictions.weekendMode.reducedLimit;
      console.log(`📅 Weekend Mode - ลดการใช้งานเป็น ${(multiplier * 100).toFixed(1)}%`);
    }
  }
  
  // Holiday Mode (Thai holidays - ตัวอย่าง)
  if (protectionData.advancedProtection.geographicSimulation.holidayMode.enabled) {
    const month = now.getMonth() + 1;
    const day = now.getDate();
    
    // ตัวอย่างวันหยุดไทย (สามารถเพิ่มได้)
    const thaiHolidays = [
      { month: 1, day: 1 },   // วันขึ้นปีใหม่
      { month: 4, day: 13 },  // วันสงกรานต์
      { month: 5, day: 5 },   // วันฉัตรมงคล
      { month: 12, day: 10 }, // วันรัฐธรรมนูญ
      { month: 12, day: 31 }  // วันสิ้นปี
    ];
    
    const isHoliday = thaiHolidays.some(holiday => holiday.month === month && holiday.day === day);
    if (isHoliday) {
      multiplier *= protectionData.advancedProtection.geographicSimulation.holidayMode.reducedLimit;
      console.log(`🎉 Holiday Mode - ลดการใช้งานเป็น ${(multiplier * 100).toFixed(1)}%`);
    }
  }
  
  return multiplier;
}

// ฟังก์ชันสำหรับตรวจสอบสถานะบัญชี Instagram
async function checkAccountStatus() {
  const protectionData = await loadBotProtectionData();
  
  // ตรวจสอบ Emergency Mode
  if (protectionData.emergencyMode.enabled) {
    const activationTime = new Date(protectionData.emergencyMode.activationTime);
    const emergencyEnd = new Date(activationTime.getTime() + protectionData.emergencyMode.durationHours * 60 * 60 * 1000);
    const now = new Date();
    
    if (now < emergencyEnd) {
      const remainingHours = Math.ceil((emergencyEnd.getTime() - now.getTime()) / (1000 * 60 * 60));
      return {
        status: 'EMERGENCY',
        message: `บัญชีถูกแบน - รอ ${remainingHours} ชั่วโมง`,
        remainingHours,
        triggeredBy: protectionData.emergencyMode.triggeredBy
      };
    }
  }
  
  // ตรวจสอบ Safety Mode
  if (protectionData.safetyMode.enabled) {
    const activationTime = new Date(protectionData.safetyMode.activationTime);
    const safetyEnd = new Date(activationTime.getTime() + protectionData.safetyMode.durationMinutes * 60 * 1000);
    const now = new Date();
    
    if (now < safetyEnd) {
      const remainingMinutes = Math.ceil((safetyEnd.getTime() - now.getTime()) / (1000 * 60));
      return {
        status: 'SAFETY',
        message: `โหมดปลอดภัย - รอ ${remainingMinutes} นาที`,
        remainingMinutes,
        triggeredBy: protectionData.safetyMode.triggeredBy
      };
    }
  }
  
  return {
    status: 'NORMAL',
    message: 'ระบบทำงานปกติ',
    canCheck: true
  };
}

// ฟังก์ชันสำหรับหน่วงเวลาระหว่างการตรวจสอบ username
async function delayBetweenChecks(seconds = 30) {
  console.log(`⏳ หน่วงเวลา ${seconds} วินาทีระหว่างการตรวจสอบ (ป้องกัน bot)...`);
  await new Promise(resolve => setTimeout(resolve, seconds * 1000));
}

// ฟังก์ชันสำหรับตรวจสอบ username แบบปลอดภัยขั้นสูง
async function safeCheckUsernames(usernames, checkFunction, type = 'unknown') {
  const results = [];
  const errors = [];
  const validResults = [];
  
  // ตรวจสอบการป้องกัน bot ก่อน
  const botCheck = await checkBotProtection();
  if (!botCheck.canCheck) {
    throw new Error(`ไม่สามารถตรวจสอบได้: ${botCheck.reason}`);
  }
  
  console.log(`🔒 เริ่มตรวจสอบ ${type} แบบปลอดภัยขั้นสูงสำหรับ ${usernames.length} username`);
  console.log(`📊 การจำกัด: ชั่วโมง ${botCheck.adjustedLimits?.hourly || 'N/A'}, วัน ${botCheck.adjustedLimits?.daily || 'N/A'}, Time Multiplier: ${botCheck.timeMultiplier || 1}`);
  
  for (let i = 0; i < usernames.length; i++) {
    const username = usernames[i];
    const startTime = Date.now();
    
    try {
      console.log(`   🔍 ตรวจสอบ ${type}: @${username} (${i + 1}/${usernames.length})`);
      
      // ตรวจสอบการป้องกัน bot ก่อนแต่ละการตรวจสอบ
      const individualBotCheck = await checkBotProtection();
      if (!individualBotCheck.canCheck) {
        console.log(`   ⏰ หยุดการตรวจสอบ: ${individualBotCheck.reason}`);
        break;
      }
      
      // Human-like delay ก่อนการตรวจสอบ
      const humanDelay = await getHumanLikeDelay();
      if (humanDelay > 0) {
        console.log(`   🧠 Human-like delay: ${humanDelay.toFixed(1)} วินาที`);
        await new Promise(resolve => setTimeout(resolve, humanDelay * 1000));
      }
      
      const result = await checkFunction(username);
      const responseTime = Date.now() - startTime;
      
      if (result && !result.error) {
        validResults.push(result);
        results.push(result);
        console.log(`   ✅ ตรวจสอบ ${type} สำเร็จ: @${username} (${responseTime}ms)`);
        
        // บันทึกการตรวจสอบสำเร็จ
        await recordCheck(true, responseTime);
      } else {
        const errorMsg = result?.error || 'Unknown error';
        errors.push({ username, error: errorMsg });
        console.log(`   ❌ Error ตรวจสอบ ${type}: @${username} - ${errorMsg}`);
        
        // บันทึก Error และตรวจสอบ Safety Mode
        await recordError(errorMsg);
      }
      
      // Random delay ระหว่างการตรวจสอบ (ยกเว้นครั้งสุดท้าย)
      if (i < usernames.length - 1) {
        const randomDelay = await getRandomDelay();
        console.log(`   ⏳ Random delay: ${randomDelay} วินาที`);
        await new Promise(resolve => setTimeout(resolve, randomDelay * 1000));
      }
      
      // ตรวจสอบ Session Break
      const protectionData = await loadBotProtectionData();
      if (protectionData.advancedProtection.behavioralPatterns.sessionBreaks.enabled) {
        const breakChance = Math.random();
        if (breakChance < protectionData.advancedProtection.behavioralPatterns.sessionBreaks.breakProbability) {
          const breakMinutes = Math.floor(Math.random() * 
            (protectionData.advancedProtection.behavioralPatterns.sessionBreaks.maxBreakMinutes - 
             protectionData.advancedProtection.behavioralPatterns.sessionBreaks.minBreakMinutes + 1)) + 
             protectionData.advancedProtection.behavioralPatterns.sessionBreaks.minBreakMinutes;
          
          console.log(`   ☕ Session Break: พัก ${breakMinutes} นาที`);
          await new Promise(resolve => setTimeout(resolve, breakMinutes * 60 * 1000));
        }
      }
      
    } catch (error) {
      const responseTime = Date.now() - startTime;
      errors.push({ username, error: error.message });
      console.log(`   ❌ Error ตรวจสอบ ${type}: @${username} - ${error.message}`);
      
      // บันทึก Error และตรวจสอบ Safety Mode
      await recordError(error.message);
      
      // หน่วงเวลาหลังจาก error (นานกว่า)
      if (i < usernames.length - 1) {
        const errorDelay = 120; // 2 นาทีหลัง error
        console.log(`   ⏳ Error delay: ${errorDelay} วินาที`);
        await new Promise(resolve => setTimeout(resolve, errorDelay * 1000));
      }
    }
  }
  
  console.log(`✅ ตรวจสอบ ${type} เสร็จสิ้น: ${validResults.length}/${usernames.length} สำเร็จ`);
  
  return {
    results,
    errors,
    validResults,
    totalChecked: results.length + errors.length
  };
}

// ฟังก์ชันสำหรับโหลดข้อมูลการตรวจสอบอีเมลที่ตกค้าง
async function loadOverdueCheckData() {
  try {
    await fs.access(OVERDUE_CHECK_FILE);
    const data = await fs.readFile(OVERDUE_CHECK_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    // ถ้าไฟล์ไม่มีอยู่ ให้สร้างไฟล์ใหม่
    const defaultData = {
      lastCheckTime: null,
      checkInterval: 86400000 // 24 ชั่วโมงในมิลลิวินาที
    };
    await fs.writeFile(OVERDUE_CHECK_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }
}

// ฟังก์ชันสำหรับบันทึกข้อมูลการตรวจสอบอีเมลที่ตกค้าง
async function saveOverdueCheckData(data) {
  try {
    await fs.writeFile(OVERDUE_CHECK_FILE, JSON.stringify(data, null, 2));
  } catch (error) {
    console.log(`❌ Error บันทึกข้อมูลการตรวจสอบอีเมลที่ตกค้าง: ${error.message}`);
  }
}

// ฟังก์ชันสำหรับตรวจสอบว่าควรตรวจสอบอีเมลที่ตกค้างหรือไม่
async function shouldCheckOverdueEmails() {
  const checkData = await loadOverdueCheckData();
  const now = new Date();
  
  // ถ้ายังไม่เคยตรวจสอบ ให้ตรวจสอบได้
  if (!checkData.lastCheckTime) {
    return true;
  }
  
  const lastCheck = new Date(checkData.lastCheckTime);
  const timeDiff = now.getTime() - lastCheck.getTime();
  
  // ตรวจสอบว่าผ่านไป 24 ชั่วโมงแล้วหรือยัง
  return timeDiff >= checkData.checkInterval;
}

// ฟังก์ชันสำหรับโหลด scheduled tasks จากไฟล์
async function loadScheduledTasks() {
  try {
    // ตรวจสอบว่าไฟล์มีอยู่หรือไม่
    try {
      await fs.access(SCHEDULE_FILE);
    } catch (accessError) {
      // ถ้าไฟล์ไม่มีอยู่ ให้สร้างไฟล์เปล่า
      console.log(`📋 สร้างไฟล์ scheduled tasks ใหม่`);
      await fs.writeFile(SCHEDULE_FILE, '{}');
    }
    
    const data = await fs.readFile(SCHEDULE_FILE, 'utf8');
    const tasks = JSON.parse(data);
    
    // ล้าง scheduled tasks เดิม
    scheduledTasks.clear();
    
    console.log(`📋 เริ่มโหลด scheduled tasks: ${Object.keys(tasks).length} รายการ`);
    
    // โหลด tasks กลับมาและตรวจสอบอีเมลที่ค้างอยู่
    for (const [taskId, task] of Object.entries(tasks)) {
      scheduledTasks.set(taskId, task);
      
      // ตรวจสอบและส่งอีเมลที่ค้างอยู่ก่อนตั้งเวลาถัดไป
      await checkAndSendOverdueEmails(taskId, task);
      
      // ตั้งเวลาถัดไป
      scheduleTask(taskId, task);
    }
    
    console.log(`📋 โหลด scheduled tasks เสร็จสิ้น: ${scheduledTasks.size} รายการ`);
  } catch (error) {
    console.log(`📋 Error โหลด scheduled tasks: ${error.message}`);
    // สร้างไฟล์เปล่าถ้าเกิด error
    try {
      await fs.writeFile(SCHEDULE_FILE, '{}');
      console.log(`📋 สร้างไฟล์ scheduled tasks ใหม่หลังจาก error`);
    } catch (writeError) {
      console.log(`❌ Error สร้างไฟล์ scheduled tasks: ${writeError.message}`);
    }
  }
}

// ฟังก์ชันสำหรับบันทึก scheduled tasks ลงไฟล์
async function saveScheduledTasks() {
  try {
    // ตรวจสอบและสร้างโฟลเดอร์ถ้าไม่มี
    const dir = path.dirname(SCHEDULE_FILE);
    try {
      await fs.access(dir);
    } catch (accessError) {
      console.log(`📁 สร้างโฟลเดอร์ data`);
      await fs.mkdir(dir, { recursive: true });
    }
    
    // สร้าง copy ของ tasks โดยไม่รวม timeoutId
    const tasksToSave = {};
    for (const [taskId, task] of scheduledTasks.entries()) {
      const { timeoutId, ...taskWithoutTimeout } = task;
      tasksToSave[taskId] = taskWithoutTimeout;
    }
    
    await fs.writeFile(SCHEDULE_FILE, JSON.stringify(tasksToSave, null, 2));
    console.log(`💾 บันทึก scheduled tasks: ${scheduledTasks.size} รายการ`);
  } catch (error) {
    console.log(`❌ Error บันทึก scheduled tasks: ${error.message}`);
  }
}

// ฟังก์ชันสำหรับสร้าง task ID
function generateTaskId(type, email) {
  return `${type}_${email}_${Date.now()}`;
}

// ฟังก์ชันสำหรับตรวจสอบและส่งอีเมลที่ค้างอยู่
async function checkAndSendOverdueEmails(taskId, task) {
  const { type, usernames, email, checkFrequency, nextRunTime, lastRunTime } = task;
  
  if (!nextRunTime) return;
  
  const now = new Date();
  const nextRun = new Date(nextRunTime);
  
  // ถ้าเวลาถัดไปผ่านไปแล้ว ให้ส่งอีเมลทันที
  if (nextRun <= now) {
    console.log(`📧 ส่งอีเมลที่ค้างอยู่: ${type} สำหรับ ${email} (เลยเวลา ${Math.round((now - nextRun) / 1000 / 60)} นาที)`);
    
    try {
      if (type === 'privacy') {
        // ตรวจสอบ Privacy ที่ค้างอยู่
        const results = [];
        const errors = [];
        
        const validResults = [];
        for (const username of usernames) {
          try {
            console.log(`   🔍 ตรวจสอบ Privacy: @${username}`);
            const result = await checkUserPrivacy(username);
            if (result && !result.error) {
              validResults.push(result);
              results.push(result);
              console.log(`   ✅ ตรวจสอบ Privacy สำเร็จ: @${username}`);
            } else {
              errors.push({ username, error: result?.error || 'Unknown error' });
              console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${result?.error || 'Unknown error'}`);
            }
          } catch (error) {
            errors.push({ username, error: error.message });
            console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${error.message}`);
          }
        }
        
        // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
        if (validResults.length > 0) {
          await sendBulkEmail(validResults, email, true);
          console.log(`   ✅ ส่งอีเมล Privacy รวม ${validResults.length} บัญชีสำเร็จ`);
        }
        
        const successCount = results.length;
        const errorCount = errors.length;
        console.log(`✅ ส่งอีเมล Privacy ที่ค้างอยู่เสร็จสิ้น: ${successCount}/${usernames.length} สำเร็จ`);
        if (errorCount > 0) {
          console.log(`⚠️  มี ${errorCount} usernames ที่เกิด error:`);
          errors.forEach(({ username, error }) => {
            console.log(`   - @${username}: ${error}`);
          });
        }
        
      } else if (type === 'stories') {
        // ตรวจสอบ Stories ที่ค้างอยู่
        const results = [];
        const errors = [];
        
        for (const username of usernames) {
          try {
            console.log(`   🔍 ตรวจสอบ Stories: @${username}`);
            const result = await checkNewStories(username);
            if (result && !result.error) {
              const emailContent = {
                username: result.username,
                full_name: result.full_name || username,
                story_count: result.story_count || 0,
                new_story_count: result.new_story_count || 0,
                new_stories: result.new_stories || [],
                message: result.message || 'ตรวจสอบสตอรี่เสร็จสิ้น'
              };
              await sendStoriesEmail(username, emailContent, email, true);
              results.push(result);
              console.log(`   ✅ ส่งอีเมล Stories สำเร็จ: @${username}`);
            } else {
              errors.push({ username, error: result?.error || 'Unknown error' });
              console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${result?.error || 'Unknown error'}`);
            }
          } catch (error) {
            errors.push({ username, error: error.message });
            console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${error.message}`);
          }
        }
        
        const successCount = results.length;
        const errorCount = errors.length;
        console.log(`✅ ส่งอีเมล Stories ที่ค้างอยู่เสร็จสิ้น: ${successCount}/${usernames.length} สำเร็จ`);
        if (errorCount > 0) {
          console.log(`⚠️  มี ${errorCount} usernames ที่เกิด error:`);
          errors.forEach(({ username, error }) => {
            console.log(`   - @${username}: ${error}`);
          });
        }
      }
      
      // อัพเดตเวลารันล่าสุดและคำนวณเวลาถัดไป
      task.lastRunTime = new Date().toISOString();
      
      // คำนวณเวลาถัดไป
      const interval = getIntervalFromFrequency(checkFrequency);
      task.nextRunTime = new Date(now.getTime() + interval).toISOString();
      
      // บันทึกการเปลี่ยนแปลง
      await saveScheduledTasks();
      
      console.log(`📝 อัพเดตเวลาถัดไปสำหรับ ${type}: ${new Date(task.nextRunTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      
    } catch (error) {
      console.log(`❌ Error ส่งอีเมลที่ค้างอยู่ ${type}: ${error.message}`);
    }
  }
}

// ฟังก์ชันสำหรับตั้งเวลาทำงาน
function scheduleTask(taskId, task) {
  const { type, usernames, email, checkFrequency, nextRunTime } = task;
  
  // คำนวณเวลาถัดไป
  const now = new Date();
  let nextRun = new Date(nextRunTime);
  
  // ถ้าเวลาถัดไปผ่านไปแล้ว ให้คำนวณใหม่
  if (nextRun <= now) {
    const interval = getIntervalFromFrequency(checkFrequency);
    task.nextRunTime = new Date(now.getTime() + interval).toISOString();
    nextRun = new Date(task.nextRunTime);
  }
  
  const timeUntilNext = nextRun.getTime() - now.getTime();
  
  console.log(`⏰ ตั้งเวลา ${type} สำหรับ ${email}: ${new Date(nextRun).toLocaleString('th-TH')} (${Math.round(timeUntilNext / 1000 / 60)} นาที)`);
  
  // ตั้ง timeout
  const timeoutId = setTimeout(async () => {
    await executeScheduledTask(taskId, task);
  }, timeUntilNext);
  
  // เก็บ timeout ID
  task.timeoutId = timeoutId;
}

// ฟังก์ชันสำหรับคำนวณ interval จาก frequency
function getIntervalFromFrequency(checkFrequency) {
  switch (checkFrequency) {
    case 0: // every5Minutes
      return 5 * 60 * 1000;
    case 1: // every30Minutes
      return 30 * 60 * 1000;
    case 2: // everyHour
      return 60 * 60 * 1000;
    case 3: // every3Hours
      return 3 * 60 * 60 * 1000;
    case 4: // every6Hours
      return 6 * 60 * 60 * 1000;
    case 5: // every8Hours
      return 8 * 60 * 60 * 1000;
    case 6: // every12Hours
      return 12 * 60 * 60 * 1000;
    case 7: // everyDay
      return 24 * 60 * 60 * 1000;
    default:
      return 12 * 60 * 60 * 1000; // 12 hours
  }
}

// ฟังก์ชันสำหรับทำงานตามเวลาที่กำหนด
async function executeScheduledTask(taskId, task) {
  const { type, usernames, email, checkFrequency } = task;
  
  console.log(`🚀 เริ่มทำงานตามเวลา: ${type} สำหรับ ${email}`);
  
  try {
    if (type === 'privacy') {
      // ตรวจสอบ Privacy
      const results = [];
      const errors = [];
      
      const validResults = [];
      for (const username of usernames) {
        try {
          console.log(`   🔍 ตรวจสอบ Privacy: @${username}`);
          const result = await checkUserPrivacy(username);
          if (result && !result.error) {
            validResults.push(result);
            results.push(result);
            console.log(`   ✅ ตรวจสอบ Privacy สำเร็จ: @${username}`);
          } else {
            errors.push({ username, error: result?.error || 'Unknown error' });
            console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${result?.error || 'Unknown error'}`);
          }
        } catch (error) {
          errors.push({ username, error: error.message });
          console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${error.message}`);
        }
      }
      
      // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
      if (validResults.length > 0) {
        await sendBulkEmail(validResults, email, true);
        console.log(`   ✅ ส่งอีเมล Privacy รวม ${validResults.length} บัญชีสำเร็จ`);
      }
      
      const successCount = results.length;
      const errorCount = errors.length;
      console.log(`✅ ตรวจสอบ Privacy เสร็จสิ้น: ${successCount}/${usernames.length} สำเร็จ`);
      if (errorCount > 0) {
        console.log(`⚠️  มี ${errorCount} usernames ที่เกิด error:`);
        errors.forEach(({ username, error }) => {
          console.log(`   - @${username}: ${error}`);
        });
      }
      
    } else if (type === 'stories') {
      // ตรวจสอบ Stories
      const results = [];
      const errors = [];
      
      const validResults = [];
      for (const username of usernames) {
        try {
          console.log(`   🔍 ตรวจสอบ Stories: @${username}`);
          const result = await checkNewStories(username);
          if (result && !result.error) {
            validResults.push(result);
            results.push(result);
            console.log(`   ✅ ตรวจสอบ Stories สำเร็จ: @${username}`);
          } else {
            errors.push({ username, error: result?.error || 'Unknown error' });
            console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${result?.error || 'Unknown error'}`);
          }
        } catch (error) {
          errors.push({ username, error: error.message });
          console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${error.message}`);
        }
      }
      
      // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
      if (validResults.length > 0) {
        await sendBulkStoriesEmail(validResults, email, true);
        console.log(`   ✅ ส่งอีเมล Stories รวม ${validResults.length} บัญชีสำเร็จ`);
      }
      
      const successCount = results.length;
      const errorCount = errors.length;
      console.log(`✅ ตรวจสอบ Stories เสร็จสิ้น: ${successCount}/${usernames.length} สำเร็จ`);
      if (errorCount > 0) {
        console.log(`⚠️  มี ${errorCount} usernames ที่เกิด error:`);
        errors.forEach(({ username, error }) => {
          console.log(`   - @${username}: ${error}`);
        });
      }
    }
    
    // ตั้งเวลาถัดไป
    const interval = getIntervalFromFrequency(checkFrequency);
    task.nextRunTime = new Date(Date.now() + interval).toISOString();
    task.lastRunTime = new Date().toISOString();
    
    // บันทึกและตั้งเวลาถัดไป
    await saveScheduledTasks();
    scheduleTask(taskId, task);
    
  } catch (error) {
    console.log(`❌ Error ทำงานตามเวลา ${type}: ${error.message}`);
    
    // ตั้งเวลาถัดไปแม้เกิด error
    const interval = getIntervalFromFrequency(checkFrequency);
    task.nextRunTime = new Date(Date.now() + interval).toISOString();
    await saveScheduledTasks();
    scheduleTask(taskId, task);
  }
}

// ฟังก์ชันสำหรับตรวจสอบและส่งอีเมลที่ค้างอยู่ทั้งหมด
async function checkAllOverdueEmails() {
  // ตรวจสอบว่าควรตรวจสอบอีเมลที่ตกค้างหรือไม่
  const shouldCheck = await shouldCheckOverdueEmails();
  
  if (!shouldCheck) {
    const checkData = await loadOverdueCheckData();
    const lastCheck = new Date(checkData.lastCheckTime);
    const now = new Date();
    const timeDiff = now.getTime() - lastCheck.getTime();
    const hoursRemaining = Math.ceil((checkData.checkInterval - timeDiff) / (1000 * 60 * 60));
    
    console.log(`⏰ ข้ามการตรวจสอบอีเมลที่ตกค้าง - ตรวจสอบครั้งล่าสุดเมื่อ ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    console.log(`⏰ จะตรวจสอบอีกครั้งใน ${hoursRemaining} ชั่วโมง`);
    return;
  }
  
  console.log(`🔍 ตรวจสอบอีเมลที่ค้างอยู่ทั้งหมด...`);
  
  const now = new Date();
  let overdueCount = 0;
  let processedCount = 0;
  
  for (const [taskId, task] of scheduledTasks.entries()) {
    const { type, usernames, email, nextRunTime } = task;
    
    if (nextRunTime) {
      const nextRun = new Date(nextRunTime);
      if (nextRun <= now) {
        overdueCount++;
        console.log(`📧 พบอีเมลที่ค้างอยู่: ${type} สำหรับ ${email} (เลยเวลา ${Math.round((now - nextRun) / 1000 / 60)} นาที)`);
        
        // ตรวจสอบอีกครั้งว่าควรส่งอีเมลหรือไม่ (ป้องกันการส่งซ้ำ)
        const shouldCheck = await shouldCheckOverdueEmails();
        if (shouldCheck) {
          // ส่งอีเมลที่ค้างอยู่
          try {
            await checkAndSendOverdueEmails(taskId, task);
            processedCount++;
          } catch (error) {
            console.log(`❌ Error ส่งอีเมลที่ค้างอยู่ ${type} สำหรับ ${email}: ${error.message}`);
          }
        } else {
          console.log(`⏰ ข้ามการส่งอีเมลที่ค้างอยู่ ${type} สำหรับ ${email} - ตรวจสอบเร็วเกินไป`);
        }
      }
    }
  }
  
  if (overdueCount > 0) {
    console.log(`📧 พบอีเมลที่ค้างอยู่ ${overdueCount} รายการ ส่งสำเร็จ ${processedCount} รายการ`);
  } else {
    console.log(`✅ ไม่มีอีเมลที่ค้างอยู่`);
  }
  
  // บันทึกเวลาที่ตรวจสอบครั้งล่าสุด
  const checkData = await loadOverdueCheckData();
  checkData.lastCheckTime = now.toISOString();
  await saveOverdueCheckData(checkData);
  console.log(`📝 บันทึกเวลาการตรวจสอบอีเมลที่ตกค้าง: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
}

// โหลด scheduled tasks เมื่อเริ่มต้น
loadScheduledTasks().then(async () => {
  // ตรวจสอบสถานะการตรวจสอบอีเมลที่ตกค้าง
  const shouldCheck = await shouldCheckOverdueEmails();
  
  if (shouldCheck) {
    console.log(`🔍 ระบบจะตรวจสอบอีเมลที่ตกค้างใน 2 วินาที...`);
    setTimeout(checkAllOverdueEmails, 2000); // รอ 2 วินาทีให้ระบบพร้อม
  } else {
    const checkData = await loadOverdueCheckData();
    const lastCheck = new Date(checkData.lastCheckTime);
    const now = new Date();
    const timeDiff = now.getTime() - lastCheck.getTime();
    const hoursRemaining = Math.ceil((checkData.checkInterval - timeDiff) / (1000 * 60 * 60));
    
    console.log(`⏰ ข้ามการตรวจสอบอีเมลที่ตกค้าง - ตรวจสอบครั้งล่าสุดเมื่อ ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    console.log(`⏰ จะตรวจสอบอีกครั้งใน ${hoursRemaining} ชั่วโมง`);
  }
});

// Middleware สำหรับ log
router.use((req, res, next) => {
  const now = new Date();
  const timestamp = now.toLocaleString('th-TH', { 
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  
  console.log(`📡 [${timestamp}] ${req.method} ${req.path}`);
  
  // Log request body สำหรับ POST requests
  if (req.method === 'POST' && req.body) {
    if (req.path === '/check-privacy') {
      const { usernames, email, notification } = req.body;
      console.log(`   👤 Usernames: ${usernames?.join(', ') || 'N/A'}`);
      console.log(`   📧 Email: ${email || 'N/A'}`);
      console.log(`   🔔 Notification: ${notification ? 'Yes' : 'No'}`);
    } else if (req.path === '/check-new-stories') {
      const { usernames, email, notification } = req.body;
      console.log(`   👤 Usernames: ${usernames?.join(', ') || 'N/A'}`);
      console.log(`   📧 Email: ${email || 'N/A'}`);
      console.log(`   🔔 Notification: ${notification ? 'Yes' : 'No'}`);
    }
  }
  
  next();
});

// API endpoint สำหรับตรวจสอบ Privacy
router.post('/check-privacy', async (req, res) => {
  try {
    const { usernames, email, notification = false } = req.body;
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      console.log(`   ❌ Error: ไม่มี usernames`);
      return res.status(400).json({ error: 'กรุณาระบุ usernames' });
    }

    console.log(`   🔍 เริ่มตรวจสอบ Privacy สำหรับ ${usernames.length} usernames`);
    
    try {
      // ใช้ระบบป้องกัน bot
      const checkResult = await safeCheckUsernames(usernames, checkUserPrivacy, 'Privacy');
      
      // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
      if (email && checkResult.validResults.length > 0) {
        console.log(`   📧 ส่งอีเมลรวม ${checkResult.validResults.length} บัญชี`);
        const changes = req.body.changes || null;
        await sendBulkEmail(checkResult.validResults, email, notification, changes);
      }
      
      res.json({ 
        results: checkResult.results,
        botProtection: {
          totalChecked: checkResult.totalChecked,
          successCount: checkResult.validResults.length,
          errorCount: checkResult.errors.length
        }
      });
    } catch (error) {
      console.log(`   ❌ Error ในการตรวจสอบ: ${error.message}`);
      res.status(429).json({ 
        error: 'ไม่สามารถตรวจสอบได้ในขณะนี้', 
        reason: error.message,
        retryAfter: 300 // 5 นาที
      });
    }

    console.log(`   🎉 ตรวจสอบ Privacy เสร็จสิ้น: ${results.filter(r => !r.error).length}/${results.length} สำเร็จ`);
    res.json({ results });
  } catch (error) {
    console.log(`   💥 Error ใน check-privacy endpoint: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบ' });
  }
});

// API endpoint สำหรับตรวจสอบ Stories
router.post('/check-new-stories', async (req, res) => {
  try {
    const { usernames, email, notification = false } = req.body;
    
    if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
      console.log(`   ❌ Error: ไม่มี usernames`);
      return res.status(400).json({ error: 'กรุณาระบุ usernames' });
    }

    console.log(`   🔍 เริ่มตรวจสอบ Stories สำหรับ ${usernames.length} usernames`);
    
    try {
      // ใช้ระบบป้องกัน bot
      const checkResult = await safeCheckUsernames(usernames, checkNewStories, 'Stories');
      
      // แปลงผลลัพธ์เป็นรูปแบบที่เหมาะสมสำหรับอีเมล
      const validResults = checkResult.validResults.map(result => ({
        username: result.username,
        full_name: result.full_name || result.username,
        story_count: result.story_count || 0,
        new_story_count: result.new_story_count || 0,
        new_stories: result.new_stories || [],
        message: result.message || 'ตรวจสอบสตอรี่เสร็จสิ้น'
      }));
      
      // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
      if (email && validResults.length > 0) {
        console.log(`   📧 ส่งอีเมลรวม ${validResults.length} บัญชี`);
        const changes = req.body.changes || null;
        await sendBulkStoriesEmail(validResults, email, notification, changes);
      }
      
      res.json({ 
        results: checkResult.results,
        botProtection: {
          totalChecked: checkResult.totalChecked,
          successCount: checkResult.validResults.length,
          errorCount: checkResult.errors.length
        }
      });
    } catch (error) {
      console.log(`   ❌ Error ในการตรวจสอบ: ${error.message}`);
      res.status(429).json({ 
        error: 'ไม่สามารถตรวจสอบได้ในขณะนี้', 
        reason: error.message,
        retryAfter: 300 // 5 นาที
      });
    }
  } catch (error) {
    console.log(`   💥 Error ใน check-new-stories endpoint: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบ' });
  }
});

// ฟังก์ชันส่งอีเมลสำหรับ Stories
async function sendStoriesEmail(username, info, email, isNotification = false, changes = null) {
  try {
  const nodemailer = require('nodemailer');
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  if (!email) return;
  
  const now = new Date();
    let subject, textContent;
    
    if (changes) {
      // การแจ้งเตือนการเปลี่ยนแปลง
      subject = `[แจ้งเตือนการเปลี่ยนแปลง] สตอรี่ใหม่: @${username}`;
      textContent = `\n==== แจ้งเตือนการเปลี่ยนแปลงสตอรี่ ====\n\n`;
      textContent += `Username: @${username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${info.new_story_count} รายการ\n`;
      textContent += `การเปลี่ยนแปลง:\n${changes}`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติเมื่อตรวจพบสตอรี่ใหม่\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    } else if (isNotification) {
      // การแจ้งเตือนแบบ scheduled
    subject = `[แจ้งเตือนอัตโนมัติ] สตอรี่ใหม่: @${username}`;
      textContent = `\n==== แจ้งเตือนอัตโนมัติ - สตอรี่ใหม่ ====\n\n`;
      textContent += `Username: @${username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${info.new_story_count} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติตามเวลาที่คุณตั้งไว้\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
  } else {
      // การแจ้งเตือนแบบปกติ
    subject = `แจ้งเตือนสตอรี่ใหม่: @${username}`;
      textContent = `\n==== แจ้งเตือนสตอรี่ใหม่ ====\n\n`;
      textContent += `Username: @${username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${info.new_story_count} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    }
    
    let htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5; }
          .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); overflow: hidden; }
          .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 24px; font-weight: 300; }
          .content { padding: 30px; }
          .story-info { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #667eea; }
          .story-item { background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .story-type { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: bold; }
          .type-image { background: #d4edda; color: #155724; }
          .type-video { background: #cce5ff; color: #004085; }
          .new-badge { background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-top: 1px solid #e9ecef; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📱 แจ้งเตือนสตอรี่ใหม่</h1>
          </div>
          <div class="content">
            <div class="story-info">
              <h3>📋 ข้อมูลสตอรี่</h3>
              <p><strong>Username:</strong> @${info.username}</p>
              <p><strong>ชื่อ:</strong> ${info.full_name}</p>
              <p><strong>สตอรี่ใหม่:</strong> ${info.new_story_count} รายการ</p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            <h3 style="color: #333; margin-bottom: 20px;">📸 รายละเอียดสตอรี่ใหม่</h3>
    `;

    if (info.new_story_count > 0 && info.new_stories) {
      info.new_stories.forEach((story, index) => {
        const typeClass = story.media_type === 'รูปภาพ' ? 'type-image' : 'type-video';
        
        htmlContent += `
          <div class="story-item">
            <div style="margin-bottom: 10px;">
              <span class="story-type ${typeClass}">${story.media_type}</span>
              <span class="new-badge">ใหม่</span>
              ${story.duration ? `<span style="margin-left: 10px; color: #666;">⏱️ ${story.duration}s</span>` : ''}
            </div>
            <p><strong>เวลาที่โพสต์:</strong> ${story.taken_at}</p>
            ${story.url ? `<p><strong>ลิงก์:</strong> <a href="${story.url}" target="_blank">ดูสตอรี่</a></p>` : ''}
          </div>
        `;
      });
    } else {
      htmlContent += `
        <div class="story-item">
          <p style="text-align: center; color: #666; font-style: italic;">ไม่มีสตอรี่ใหม่</p>
        </div>
      `;
    }

    htmlContent += `
          </div>
          <div class="footer">
            <p>ขอบคุณที่ใช้บริการ IG Story Checker</p>
            <p style="font-size: 12px; margin-top: 10px;">📧 ส่งโดยระบบอัตโนมัติ</p>
          </div>
        </div>
      </body>
      </html>
    `;

    // สร้าง plain text version สำหรับการแจ้งเตือนแบบปกติ
    if (!changes && !isNotification) {
      textContent += `รายละเอียดสตอรี่ใหม่:\n`;
      if (info.new_story_count > 0 && info.new_stories) {
        info.new_stories.forEach((story, index) => {
          textContent += `${index + 1}. ${story.media_type} [ใหม่]\n`;
          textContent += `   เวลาที่โพสต์: ${story.taken_at}\n`;
          if (story.duration) textContent += `   ความยาว: ${story.duration} วินาที\n`;
          textContent += `\n`;
        });
      } else {
        textContent += `ไม่มีสตอรี่ใหม่\n`;
      }
    }

    await transporter.sendMail({
      from: `IG Story Checker <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`   📧 อีเมล Stories ส่งสำเร็จไปยัง ${email}`);
  } catch (error) {
    console.log(`   ❌ Error ส่งอีเมล Stories: ${error.message}`);
    throw error;
  }
}

// API endpoint สำหรับตั้งเวลาการแจ้งเตือน
router.post('/schedule-notification', async (req, res) => {
  try {
    const { type, usernames, email, checkFrequency, isActive } = req.body;
    
    console.log(`📅 ตั้งเวลาการแจ้งเตือน: ${type} สำหรับ ${email}`);
    console.log(`   👤 Usernames: ${usernames?.join(', ')}`);
    console.log(`   ⏰ Frequency: ${checkFrequency}`);
    console.log(`   🔔 Active: ${isActive}`);
    
    if (!type || !usernames || !email || checkFrequency === undefined) {
      return res.status(400).json({ error: 'กรุณาระบุ type, usernames, email, และ checkFrequency' });
    }
    
    // หยุด task เดิมถ้ามี
    const existingTaskId = Array.from(scheduledTasks.keys()).find(key => 
      key.startsWith(`${type}_${email}_`)
    );
    
    if (existingTaskId) {
      const existingTask = scheduledTasks.get(existingTaskId);
      if (existingTask.timeoutId) {
        clearTimeout(existingTask.timeoutId);
      }
      scheduledTasks.delete(existingTaskId);
      console.log(`🛑 หยุด task เดิม: ${existingTaskId}`);
    }
    
    if (isActive) {
      // สร้าง task ใหม่
      const taskId = generateTaskId(type, email);
      const now = new Date();
      const interval = getIntervalFromFrequency(checkFrequency);
      const nextRunTime = new Date(now.getTime() + interval).toISOString();
      
      const task = {
        type,
        usernames,
        email,
        checkFrequency,
        isActive,
        createdAt: now.toISOString(),
        nextRunTime,
        lastRunTime: null
      };
      
      scheduledTasks.set(taskId, task);
      scheduleTask(taskId, task);
      await saveScheduledTasks();
      
      console.log(`✅ ตั้งเวลาการแจ้งเตือนสำเร็จ: ${taskId}`);
      res.json({ 
        success: true, 
        taskId,
        nextRunTime,
        message: `ตั้งเวลาการแจ้งเตือน ${type} สำเร็จ`
      });
    } else {
      // สร้าง task ที่หยุดการทำงาน
      const taskId = generateTaskId(type, email);
      const now = new Date();
      
      const task = {
        type,
        usernames,
        email,
        checkFrequency,
        isActive: false,
        createdAt: now.toISOString(),
        nextRunTime: null,
        lastRunTime: null
      };
      
      scheduledTasks.set(taskId, task);
      await saveScheduledTasks();
      
      console.log(`✅ หยุดการแจ้งเตือน: ${type} สำหรับ ${email}`);
      res.json({ 
        success: true, 
        taskId,
        message: `หยุดการแจ้งเตือน ${type} สำเร็จ`
      });
    }
    
  } catch (error) {
    console.log(`❌ Error ตั้งเวลาการแจ้งเตือน: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตั้งเวลา' });
  }
});

// API endpoint สำหรับดูสถานะ scheduled tasks
router.get('/scheduled-tasks', async (req, res) => {
  try {
    const tasks = Array.from(scheduledTasks.entries()).map(([taskId, task]) => ({
      taskId,
      type: task.type,
      email: task.email,
      usernames: task.usernames,
      checkFrequency: task.checkFrequency,
      isActive: task.isActive,
      createdAt: task.createdAt,
      nextRunTime: task.nextRunTime,
      lastRunTime: task.lastRunTime
    }));
    
    res.json({ tasks });
  } catch (error) {
    console.log(`❌ Error ดึงข้อมูล scheduled tasks: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
  }
});

// API endpoint สำหรับตรวจสอบและส่งอีเมลที่ค้างอยู่
router.post('/check-overdue-emails', async (req, res) => {
  try {
    // ตรวจสอบว่าควรตรวจสอบอีเมลที่ตกค้างหรือไม่
    const shouldCheck = await shouldCheckOverdueEmails();
    
    if (!shouldCheck) {
      const checkData = await loadOverdueCheckData();
      const lastCheck = new Date(checkData.lastCheckTime);
      const now = new Date();
      const timeDiff = now.getTime() - lastCheck.getTime();
      const hoursRemaining = Math.ceil((checkData.checkInterval - timeDiff) / (1000 * 60 * 60));
      
      console.log(`⏰ ข้ามการตรวจสอบอีเมลที่ตกค้าง - ตรวจสอบครั้งล่าสุดเมื่อ ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
      console.log(`⏰ จะตรวจสอบอีกครั้งใน ${hoursRemaining} ชั่วโมง`);
      
      return res.json({
        message: `ข้ามการตรวจสอบอีเมลที่ตกค้าง - ตรวจสอบครั้งล่าสุดเมื่อ ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
        nextCheckIn: `${hoursRemaining} ชั่วโมง`,
        skipped: true
      });
    }
    
    console.log(`🔍 ตรวจสอบและส่งอีเมลที่ค้างอยู่...`);
    
    const now = new Date();
    let processedCount = 0;
    let successCount = 0;
    let totalErrors = [];
    
    for (const [taskId, task] of scheduledTasks.entries()) {
      const { type, usernames, email, nextRunTime, isActive } = task;
      
      if (!isActive || !nextRunTime) continue;
      
      const nextRun = new Date(nextRunTime);
      if (nextRun <= now) {
        processedCount++;
        console.log(`📧 ส่งอีเมลที่ค้างอยู่: ${type} สำหรับ ${email} (เลยเวลา ${Math.round((now - nextRun) / 1000 / 60)} นาที)`);
        
        try {
          if (type === 'privacy') {
            // ตรวจสอบ Privacy ที่ค้างอยู่
            const results = [];
            const errors = [];
            
            const validResults = [];
            for (const username of usernames) {
              try {
                console.log(`   🔍 ตรวจสอบ Privacy: @${username}`);
                const result = await checkUserPrivacy(username);
                if (result && !result.error) {
                  validResults.push(result);
                  results.push(result);
                  console.log(`   ✅ ตรวจสอบ Privacy สำเร็จ: @${username}`);
                } else {
                  errors.push({ username, error: result?.error || 'Unknown error' });
                  console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${result?.error || 'Unknown error'}`);
                }
              } catch (error) {
                errors.push({ username, error: error.message });
                console.log(`   ❌ Error ตรวจสอบ Privacy: @${username} - ${error.message}`);
              }
            }
            
            // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
            if (validResults.length > 0) {
              await sendBulkEmail(validResults, email, true);
              console.log(`   ✅ ส่งอีเมล Privacy รวม ${validResults.length} บัญชีสำเร็จ`);
            }
            
            successCount += results.length;
            totalErrors.push(...errors.map(e => ({ ...e, type: 'privacy', email })));
            console.log(`✅ ส่งอีเมล Privacy ที่ค้างอยู่เสร็จสิ้น: ${results.length}/${usernames.length} สำเร็จ`);
            if (errors.length > 0) {
              console.log(`⚠️  มี ${errors.length} usernames ที่เกิด error:`);
              errors.forEach(({ username, error }) => {
                console.log(`   - @${username}: ${error}`);
              });
            }
            
          } else if (type === 'stories') {
            // ตรวจสอบ Stories ที่ค้างอยู่
            const results = [];
            const errors = [];
            
            const validResults = [];
            for (const username of usernames) {
              try {
                console.log(`   🔍 ตรวจสอบ Stories: @${username}`);
                const result = await checkNewStories(username);
                if (result && !result.error) {
                  const emailContent = {
                    username: result.username,
                    full_name: result.full_name || username,
                    story_count: result.story_count || 0,
                    new_story_count: result.new_story_count || 0,
                    new_stories: result.new_stories || [],
                    message: result.message || 'ตรวจสอบสตอรี่เสร็จสิ้น'
                  };
                  validResults.push(emailContent);
                  results.push(result);
                  console.log(`   ✅ ตรวจสอบ Stories สำเร็จ: @${username}`);
                } else {
                  errors.push({ username, error: result?.error || 'Unknown error' });
                  console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${result?.error || 'Unknown error'}`);
                }
              } catch (error) {
                errors.push({ username, error: error.message });
                console.log(`   ❌ Error ตรวจสอบ Stories: @${username} - ${error.message}`);
              }
            }
            
            // ส่งอีเมลรวมสำหรับผลลัพธ์ที่สำเร็จ
            if (validResults.length > 0) {
              await sendBulkStoriesEmail(validResults, email, true);
              console.log(`   ✅ ส่งอีเมล Stories รวม ${validResults.length} บัญชีสำเร็จ`);
            }
            
            successCount += results.length;
            totalErrors.push(...errors.map(e => ({ ...e, type: 'stories', email })));
            console.log(`✅ ส่งอีเมล Stories ที่ค้างอยู่เสร็จสิ้น: ${results.length}/${usernames.length} สำเร็จ`);
            if (errors.length > 0) {
              console.log(`⚠️  มี ${errors.length} usernames ที่เกิด error:`);
              errors.forEach(({ username, error }) => {
                console.log(`   - @${username}: ${error}`);
              });
            }
          }
          
          // อัพเดตเวลารันล่าสุด
          task.lastRunTime = new Date().toISOString();
          
        } catch (error) {
          console.log(`❌ Error ส่งอีเมลที่ค้างอยู่ ${type}: ${error.message}`);
        }
      }
    }
    
    await saveScheduledTasks();
    
    // บันทึกเวลาที่ตรวจสอบครั้งล่าสุด
    const checkData = await loadOverdueCheckData();
    checkData.lastCheckTime = new Date().toISOString();
    await saveOverdueCheckData(checkData);
    console.log(`📝 บันทึกเวลาการตรวจสอบอีเมลที่ตกค้าง: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
    
    console.log(`📧 ตรวจสอบและส่งอีเมลที่ค้างอยู่เสร็จสิ้น: ${successCount}/${processedCount} สำเร็จ`);
    if (totalErrors.length > 0) {
      console.log(`⚠️  ข้อผิดพลาดทั้งหมด: ${totalErrors.length} รายการ`);
      totalErrors.forEach(({ username, error, type, email }) => {
        console.log(`   - @${username} (${type}): ${error}`);
      });
    }
    
    res.json({ 
      success: true, 
      processedCount,
      successCount,
      errorCount: totalErrors.length,
      errors: totalErrors,
      message: `ตรวจสอบและส่งอีเมลที่ค้างอยู่เสร็จสิ้น: ${successCount}/${processedCount} สำเร็จ${totalErrors.length > 0 ? ` (มี ${totalErrors.length} ข้อผิดพลาด)` : ''}`,
      checkTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    });
    
  } catch (error) {
    console.log(`❌ Error ตรวจสอบและส่งอีเมลที่ค้างอยู่: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบอีเมลที่ค้างอยู่' });
  }
});

// API endpoint สำหรับดูสถานะการตรวจสอบอีเมลที่ตกค้าง
router.get('/overdue-check-status', async (req, res) => {
  try {
    const checkData = await loadOverdueCheckData();
    const now = new Date();
    
    if (!checkData.lastCheckTime) {
      return res.json({
        lastCheckTime: null,
        nextCheckTime: null,
        canCheckNow: true,
        message: 'ยังไม่เคยตรวจสอบอีเมลที่ตกค้าง'
      });
    }
    
    const lastCheck = new Date(checkData.lastCheckTime);
    const timeDiff = now.getTime() - lastCheck.getTime();
    const canCheckNow = timeDiff >= checkData.checkInterval;
    const nextCheckTime = new Date(lastCheck.getTime() + checkData.checkInterval);
    const hoursRemaining = Math.ceil((checkData.checkInterval - timeDiff) / (1000 * 60 * 60));
    
    res.json({
      lastCheckTime: lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      nextCheckTime: nextCheckTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      canCheckNow,
      hoursRemaining: canCheckNow ? 0 : hoursRemaining,
      checkInterval: checkData.checkInterval / (1000 * 60 * 60), // แปลงเป็นชั่วโมง
      message: canCheckNow 
        ? 'สามารถตรวจสอบอีเมลที่ตกค้างได้แล้ว' 
        : `จะสามารถตรวจสอบได้อีกครั้งใน ${hoursRemaining} ชั่วโมง`
    });
  } catch (error) {
    console.log(`❌ Error ดูสถานะการตรวจสอบอีเมลที่ตกค้าง: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดูสถานะ' });
  }
});

// API endpoint สำหรับดูสถานะการป้องกัน bot
router.get('/bot-protection-status', async (req, res) => {
  try {
    const protectionData = await loadBotProtectionData();
    const now = new Date();
    
    // คำนวณข้อมูลเพิ่มเติม
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const hourlyChecks = protectionData.hourlyChecks.filter(time => new Date(time) > oneHourAgo);
    const dailyChecks = protectionData.dailyChecks.filter(time => new Date(time) > oneDayAgo);
    
    let timeUntilNextCheck = 0;
    if (protectionData.lastCheckTime) {
      const lastCheck = new Date(protectionData.lastCheckTime);
      const timeDiff = now.getTime() - lastCheck.getTime();
      const minutesDiff = Math.floor(timeDiff / (1000 * 60));
      timeUntilNextCheck = Math.max(0, protectionData.minIntervalMinutes - minutesDiff);
    }
    
    const botCheck = await checkBotProtection();
    
    res.json({
      canCheck: botCheck.canCheck,
      reason: botCheck.reason || null,
      remainingMinutes: botCheck.remainingMinutes || 0,
      timeUntilNextCheck,
      limits: {
        daily: {
          current: dailyChecks.length,
          limit: protectionData.dailyCheckLimit,
          remaining: Math.max(0, protectionData.dailyCheckLimit - dailyChecks.length)
        },
        hourly: {
          current: hourlyChecks.length,
          limit: protectionData.maxChecksPerHour,
          remaining: Math.max(0, protectionData.maxChecksPerHour - hourlyChecks.length)
        },
        minIntervalMinutes: protectionData.minIntervalMinutes
      },
      lastCheckTime: protectionData.lastCheckTime ? new Date(protectionData.lastCheckTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : null,
      resetTime: protectionData.resetTime ? new Date(protectionData.resetTime).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }) : null,
      message: botCheck.canCheck ? 'สามารถตรวจสอบได้' : botCheck.reason
    });
  } catch (error) {
    console.log(`❌ Error ดูสถานะการป้องกัน bot: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดูสถานะ' });
  }
});

// API endpoint สำหรับรีเซ็ตการป้องกัน bot
router.post('/reset-bot-protection', async (req, res) => {
  try {
    const protectionData = await loadBotProtectionData();
    const now = new Date();
    
    protectionData.checkCount = 0;
    protectionData.hourlyChecks = [];
    protectionData.dailyChecks = [];
    protectionData.lastCheckTime = null;
    protectionData.resetTime = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    protectionData.safetyMode.enabled = false;
    protectionData.safetyMode.triggeredBy = null;
    protectionData.safetyMode.activationTime = null;
    protectionData.emergencyMode.enabled = false;
    protectionData.emergencyMode.triggeredBy = null;
    protectionData.emergencyMode.activationTime = null;
    
    await saveBotProtectionData(protectionData);
    
    console.log(`🔄 รีเซ็ตการป้องกัน bot เรียบร้อย`);
    
    res.json({
      success: true,
      message: 'รีเซ็ตการป้องกัน bot เรียบร้อย',
      resetTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    });
  } catch (error) {
    console.log(`❌ Error รีเซ็ตการป้องกัน bot: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเซ็ต' });
  }
});

// API endpoint สำหรับตรวจสอบสถานะบัญชี
router.get('/account-status', async (req, res) => {
  try {
    const status = await checkAccountStatus();
    res.json(status);
  } catch (error) {
    console.log(`❌ Error ตรวจสอบสถานะบัญชี: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการตรวจสอบสถานะ' });
  }
});

// API endpoint สำหรับรีเซ็ตการตรวจสอบอีเมลที่ตกค้าง
router.post('/reset-overdue-check', async (req, res) => {
  try {
    const checkData = await loadOverdueCheckData();
    checkData.lastCheckTime = null;
    await saveOverdueCheckData(checkData);
    
    console.log(`🔄 รีเซ็ตการตรวจสอบอีเมลที่ตกค้างเรียบร้อย`);
    
    res.json({
      success: true,
      message: 'รีเซ็ตการตรวจสอบอีเมลที่ตกค้างเรียบร้อย - สามารถตรวจสอบได้ทันที',
      resetTime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
    });
  } catch (error) {
    console.log(`❌ Error รีเซ็ตการตรวจสอบอีเมลที่ตกค้าง: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเซ็ต' });
  }
});

// API endpoint สำหรับอัพเดต scheduled task
router.put('/scheduled-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    const { usernames, email, checkFrequency, isActive } = req.body;
    
    if (!scheduledTasks.has(taskId)) {
      return res.status(404).json({ error: 'ไม่พบ scheduled task' });
    }
    
    const task = scheduledTasks.get(taskId);
    
    // หยุดการทำงานเก่า
    if (task.timeoutId) {
      clearTimeout(task.timeoutId);
    }
    
    // อัพเดตข้อมูล
    task.usernames = usernames || task.usernames;
    task.email = email || task.email;
    task.checkFrequency = checkFrequency !== undefined ? checkFrequency : task.checkFrequency;
    task.isActive = isActive !== undefined ? isActive : task.isActive;
    task.lastRunTime = null; // รีเซ็ตเวลารันล่าสุด
    task.nextRunTime = null; // รีเซ็ตเวลารันถัดไป
    
    // เริ่มการทำงานใหม่ถ้า isActive = true
    if (task.isActive) {
      scheduleTask(taskId, task);
    }
    
    await saveScheduledTasks();
    
    console.log(`✏️ อัพเดต scheduled task: ${taskId}`);
    res.json({ 
      success: true, 
      message: 'อัพเดต scheduled task สำเร็จ',
      task: {
        taskId,
        type: task.type,
        usernames: task.usernames,
        email: task.email,
        checkFrequency: task.checkFrequency,
        isActive: task.isActive,
        nextRunTime: task.nextRunTime
      }
    });
  } catch (error) {
    console.log(`❌ Error อัพเดต scheduled task: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการอัพเดต' });
  }
});

// API endpoint สำหรับลบ scheduled task
router.delete('/scheduled-task/:taskId', async (req, res) => {
  try {
    const { taskId } = req.params;
    
    if (scheduledTasks.has(taskId)) {
      const task = scheduledTasks.get(taskId);
      if (task.timeoutId) {
        clearTimeout(task.timeoutId);
      }
      scheduledTasks.delete(taskId);
      await saveScheduledTasks();
      
      console.log(`🗑️ ลบ scheduled task: ${taskId}`);
      res.json({ success: true, message: 'ลบ scheduled task สำเร็จ' });
    } else {
      res.status(404).json({ error: 'ไม่พบ scheduled task' });
    }
  } catch (error) {
    console.log(`❌ Error ลบ scheduled task: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบ' });
  }
});

// API endpoint สำหรับดูสถานะ session
router.get('/session-status', async (req, res) => {
  try {
    const sessionManager = require('./SessionManager');
    const status = sessionManager.getSessionStatus();
    
    res.json({
      success: true,
      session: status,
      message: status.isLoggedIn 
        ? 'Session ใช้งานได้' 
        : 'Session ไม่พร้อมใช้งาน'
    });
  } catch (error) {
    console.log(`❌ Error ดูสถานะ session: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดูสถานะ session' });
  }
});

// API endpoint สำหรับรีเฟรช session
router.post('/refresh-session', async (req, res) => {
  try {
    const sessionManager = require('./SessionManager');
    await sessionManager.refreshSession();
    
    res.json({
      success: true,
      message: 'รีเฟรช session สำเร็จ'
    });
  } catch (error) {
    console.log(`❌ Error รีเฟรช session: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการรีเฟรช session' });
  }
});

// API endpoint สำหรับ logout
router.post('/logout', async (req, res) => {
  try {
    const sessionManager = require('./SessionManager');
    await sessionManager.logout();
    
    res.json({
      success: true,
      message: 'Logout สำเร็จ'
    });
  } catch (error) {
    console.log(`❌ Error logout: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการ logout' });
  }
});

// API endpoint สำหรับทดสอบการเชื่อมต่อ
router.get('/test-connection', async (req, res) => {
  try {
    const sessionManager = require('./SessionManager');
    const isConnected = await sessionManager.checkConnection();
    
    res.json({
      success: true,
      connected: isConnected,
      message: isConnected 
        ? 'การเชื่อมต่อปกติ' 
        : 'การเชื่อมต่อมีปัญหา'
    });
  } catch (error) {
    console.log(`❌ Error ทดสอบการเชื่อมต่อ: ${error.message}`);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดในการทดสอบการเชื่อมต่อ' });
  }
});

module.exports = router; 
