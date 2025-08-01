const fs = require('fs');
const path = require('path');

// ไฟล์ข้อมูล (ปรับ path ให้ชี้ไปยังโฟลเดอร์ data)
const STORIES_HISTORY_FILE = path.join(__dirname, '../data/StoriesHistory.json');
const PROFILE_PICS_FILE = path.join(__dirname, '../data/ProfilePics.json');
const CLEANUP_LOG_FILE = path.join(__dirname, '../data/CleanupLog.json');
const OVERDUE_EMAIL_FILE = path.join(__dirname, '../data/OverdueEmail.json');
const SESSION_LOG_FILE = path.join(__dirname, '../data/SessionLogin.json');

// เวลาที่เก็บข้อมูล (ในวินาที)
const ONE_DAY = 1 * 24 * 60 * 60; // 1 วัน
const TWO_DAYS = 2 * 24 * 60 * 60; // 2 วัน
const TEN_MINUTES = 10 * 60; // 10 นาที
const FOUR_MONTHS = 4 * 30 * 24 * 60 * 60; // 4 เดือน (ประมาณ)

// ฟังก์ชันโหลดข้อมูลจากไฟล์
function loadJsonFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error(`Error loading file ${filePath}:`, error);
  }
  return {};
}

// ฟังก์ชันบันทึกข้อมูลลงไฟล์
function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (error) {
    console.error(`Error saving file ${filePath}:`, error);
  }
}

// ฟังก์ชันบันทึก log การลบข้อมูล
function saveCleanupLog(action, details) {
  try {
    let logData = loadJsonFile(CLEANUP_LOG_FILE);
    
    // ถ้าไฟล์ไม่มีอยู่หรือไม่มีข้อมูล ให้สร้างใหม่
    if (!logData || !logData.logs) {
      logData = { logs: [] };
    }
    
    const logEntry = {
      timestamp: Math.floor(Date.now() / 1000),
      datetime: new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      action: action,
      details: details
    };
    
    logData.logs.push(logEntry);
    
    // เก็บ log แค่ 30 รายการล่าสุด
    if (logData.logs.length > 30) {
      logData.logs = logData.logs.slice(-30);
    }
    
    saveJsonFile(CLEANUP_LOG_FILE, logData);
  } catch (error) {
    console.error('Error saving cleanup log:', error);
  }
}

// ฟังก์ชันลบข้อมูลเก่าจาก stories_history.json (2 วัน)
function cleanupStoriesHistory() {
  console.log('🧹 เริ่มลบข้อมูลเก่าใน StoriesHistory.json...');
  
  // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
  if (!fs.existsSync(STORIES_HISTORY_FILE)) {
    console.log('   ไฟล์ StoriesHistory.json ไม่มีอยู่');
    saveCleanupLog('check_stories_history', { 
      action: 'file_not_found',
      message: 'ไฟล์ไม่มีอยู่'
    });
    return;
  }
  
  const data = loadJsonFile(STORIES_HISTORY_FILE);
  const currentTime = Math.floor(Date.now() / 1000);
  const cutoffTime = currentTime - TWO_DAYS;
  
  let deletedCount = 0;
  const deletedDetails = [];
  const remainingDetails = [];
  const cleanedData = {};
  
  for (const [username, stories] of Object.entries(data)) {
    // กรองสตอรี่ที่เก่ากว่า 2 วัน
    const recentStories = stories.filter(story => story.checked_at >= cutoffTime);
    const oldStories = stories.filter(story => story.checked_at < cutoffTime);
    
    if (oldStories.length > 0) {
      deletedCount += oldStories.length;
      const oldestAge = Math.floor((currentTime - Math.min(...oldStories.map(s => s.checked_at))) / 86400);
      console.log(`   ลบสตอรี่เก่าของ @${username}: ${oldStories.length} รายการ (อายุเก่าสุด ${oldestAge} วัน)`);
      
      deletedDetails.push({
        username: username,
        deleted_count: oldStories.length,
        oldest_age_days: oldestAge
      });
    }
    
    if (recentStories.length > 0) {
      cleanedData[username] = recentStories;
      
      // คำนวณเวลาที่เหลือสำหรับสตอรี่เก่าสุด
      const oldestStory = recentStories.reduce((oldest, current) => 
        current.checked_at < oldest.checked_at ? current : oldest
      );
      const timeUntilDeletion = TWO_DAYS - (currentTime - oldestStory.checked_at);
      const hoursLeft = Math.floor(timeUntilDeletion / 3600);
      const minutesLeft = Math.floor((timeUntilDeletion % 3600) / 60);
      
      remainingDetails.push({
        username: username,
        time_left_hours: hoursLeft,
        time_left_minutes: minutesLeft,
        stories_count: recentStories.length
      });
      
      console.log(`   @${username}: เหลือเวลา ${hoursLeft} ชั่วโมง ${minutesLeft} นาที ก่อนถูกลบ (${recentStories.length} สตอรี่)`);
    } else {
      console.log(`   ลบข้อมูลทั้งหมดของ @${username} (ไม่มีสตอรี่ใหม่)`);
    }
  }
  
  saveJsonFile(STORIES_HISTORY_FILE, cleanedData);
  console.log(`✅ ลบข้อมูลเก่าจาก StoriesHistory.json เรียบร้อย (${deletedCount} รายการ)`);
  saveCleanupLog('cleanup_stories_history', { 
    deleted_count: deletedCount, 
    total_entries: Object.keys(data).length,
    deleted_details: deletedDetails,
    remaining_details: remainingDetails
  });
}

// ฟังก์ชันลบข้อมูลเก่าจาก profile_pics.json (4 เดือน)
function cleanupProfilePics() {
  console.log('🧹 เริ่มลบข้อมูลเก่าใน ProfilePics.json...');
  
  // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
  if (!fs.existsSync(PROFILE_PICS_FILE)) {
    console.log('   ไฟล์ ProfilePics.json ไม่มีอยู่');
    saveCleanupLog('check_profile_pics', { 
      action: 'file_not_found',
      message: 'ไฟล์ไม่มีอยู่'
    });
    return;
  }
  
  const data = loadJsonFile(PROFILE_PICS_FILE);
  const currentTime = Math.floor(Date.now() / 1000);
  const cutoffTime = currentTime - FOUR_MONTHS;
  
  // ตรวจสอบเวลาที่สร้างไฟล์
  try {
    const stats = fs.statSync(PROFILE_PICS_FILE);
    const fileAge = currentTime - Math.floor(stats.mtime.getTime() / 1000);
    const fileAgeDays = Math.floor(fileAge / 86400);
    
    if (fileAge > FOUR_MONTHS) {
      // ลบไฟล์ทั้งหมดและสร้างใหม่
      const emptyData = {};
      saveJsonFile(PROFILE_PICS_FILE, emptyData);
      console.log(`   ลบข้อมูลเก่าทั้งหมดใน ProfilePics.json (อายุไฟล์ ${fileAgeDays} วัน)`);
      console.log(`✅ ลบข้อมูลเก่าจาก ProfilePics.json เรียบร้อย`);
      saveCleanupLog('cleanup_profile_pics', { 
        action: 'cleared_all_data',
        file_age_days: fileAgeDays,
        deleted_users: Object.keys(data || {})
      });
    } else {
      // คำนวณเวลาที่เหลือก่อนจะถูกลบ
      const timeUntilDeletion = FOUR_MONTHS - fileAge;
      const daysLeft = Math.floor(timeUntilDeletion / 86400);
      const hoursLeft = Math.floor((timeUntilDeletion % 86400) / 3600);
      
      console.log(`   ข้อมูลใน ProfilePics.json ยังไม่เก่าเกินไป (อายุไฟล์ ${fileAgeDays} วัน)`);
      console.log(`   เหลือเวลา ${daysLeft} วัน ${hoursLeft} ชั่วโมง ก่อนถูกลบ`);
      
      saveCleanupLog('check_profile_pics', { 
        action: 'no_cleanup_needed', 
        file_age_days: fileAgeDays,
        total_users: Object.keys(data || {}).length,
        time_left_days: daysLeft,
        time_left_hours: hoursLeft
      });
    }
  } catch (error) {
    console.error('Error checking profile_pics.json age:', error);
    saveCleanupLog('error_profile_pics', { 
      action: 'error',
      error: error.message
    });
  }
}

// ฟังก์ชันลบข้อมูลเก่าจาก OverdueEmail.json (1 วัน)
function cleanupOverdueEmail() {
  console.log('🧹 เริ่มลบข้อมูลเก่าใน OverdueEmail.json...');
  
  // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
  if (!fs.existsSync(OVERDUE_EMAIL_FILE)) {
    console.log('   ไฟล์ OverdueEmail.json ไม่มีอยู่');
    saveCleanupLog('check_overdue_email', { 
      action: 'file_not_found',
      message: 'ไฟล์ไม่มีอยู่'
    });
    return;
  }
  
  const data = loadJsonFile(OVERDUE_EMAIL_FILE);
  const currentTime = Math.floor(Date.now() / 1000);
  
  // ตรวจสอบเวลาที่สร้างไฟล์
  try {
    const stats = fs.statSync(OVERDUE_EMAIL_FILE);
    const fileAge = currentTime - Math.floor(stats.mtime.getTime() / 1000);
    const fileAgeHours = Math.floor(fileAge / 3600);
    const fileAgeMinutes = Math.floor((fileAge % 3600) / 60);
    
    if (fileAge > ONE_DAY) {
      // ลบไฟล์ทั้งหมดและสร้างใหม่
      const defaultData = {
        lastCheckTime: null,
        checkInterval: 86400000
      };
      saveJsonFile(OVERDUE_EMAIL_FILE, defaultData);
      console.log(`   ลบข้อมูลเก่าทั้งหมดใน OverdueEmail.json (อายุไฟล์ ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที)`);
      console.log(`✅ ลบข้อมูลเก่าจาก OverdueEmail.json เรียบร้อย`);
      saveCleanupLog('cleanup_overdue_email', { 
        action: 'cleared_all_data',
        file_age_hours: fileAgeHours,
        file_age_minutes: fileAgeMinutes,
        previous_last_check_time: data.lastCheckTime,
        previous_check_interval: data.checkInterval
      });
    } else {
      // คำนวณเวลาที่เหลือก่อนจะถูกลบ
      const timeUntilDeletion = ONE_DAY - fileAge;
      const hoursLeft = Math.floor(timeUntilDeletion / 3600);
      const minutesLeft = Math.floor((timeUntilDeletion % 3600) / 60);
      
      console.log(`   ข้อมูลใน OverdueEmail.json ยังไม่เก่าเกินไป (อายุไฟล์ ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที)`);
      console.log(`   เหลือเวลา ${hoursLeft} ชั่วโมง ${minutesLeft} นาที ก่อนถูกลบ`);
      
      // แสดงข้อมูลปัจจุบัน
      if (data.lastCheckTime) {
        const lastCheck = new Date(data.lastCheckTime);
        const lastCheckAge = currentTime - Math.floor(lastCheck.getTime() / 1000);
        const lastCheckHours = Math.floor(lastCheckAge / 3600);
        const lastCheckMinutes = Math.floor((lastCheckAge % 3600) / 60);
        
        console.log(`   ตรวจสอบครั้งล่าสุด: ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (${lastCheckHours} ชั่วโมง ${lastCheckMinutes} นาทีที่แล้ว)`);
      } else {
        console.log(`   ยังไม่เคยตรวจสอบอีเมลที่ตกค้าง`);
      }
      
      saveCleanupLog('check_overdue_email', { 
        action: 'no_cleanup_needed', 
        file_age_hours: fileAgeHours,
        file_age_minutes: fileAgeMinutes,
        last_check_time: data.lastCheckTime,
        check_interval: data.checkInterval,
        time_left_hours: hoursLeft,
        time_left_minutes: minutesLeft
      });
    }
  } catch (error) {
    console.error('Error checking OverdueEmail.json age:', error);
    saveCleanupLog('error_overdue_email', { 
      action: 'error',
      error: error.message
    });
  }
}

// ฟังก์ชันลบข้อมูลเก่าจาก CleanupLog.json (10 นาที)
function cleanupCleanupLog() {
  console.log('🧹 เริ่มลบข้อมูลเก่าใน CleanupLog.json...');
  
  // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
  if (!fs.existsSync(CLEANUP_LOG_FILE)) {
    console.log('   ไฟล์ CleanupLog.json ไม่มีอยู่');
    saveCleanupLog('check_cleanup_log', { 
      action: 'file_not_found',
      message: 'ไฟล์ไม่มีอยู่'
    });
    return;
  }
  
  const data = loadJsonFile(CLEANUP_LOG_FILE);
  const currentTime = Math.floor(Date.now() / 1000);
  const cutoffTime = currentTime - TEN_MINUTES;
  
  // ตรวจสอบ log entries ที่เก่าเกินไป
  if (data.logs && data.logs.length > 0) {
    // กรอง log entries ที่เก่ากว่า 10 นาที
    const recentLogs = data.logs.filter(log => log.timestamp >= cutoffTime);
    const oldLogs = data.logs.filter(log => log.timestamp < cutoffTime);
    
    if (oldLogs.length > 0) {
      // ลบ log entries เก่า
      data.logs = recentLogs;
      saveJsonFile(CLEANUP_LOG_FILE, data);
      
      console.log(`   ลบ log entries เก่า: ${oldLogs.length} รายการ`);
      console.log(`   เหลือ log entries: ${recentLogs.length} รายการ`);
      console.log(`✅ ลบข้อมูลเก่าจาก CleanupLog.json เรียบร้อย`);
      
      saveCleanupLog('cleanup_cleanup_log', { 
        action: 'cleared_old_logs',
        deleted_logs: oldLogs.length,
        remaining_logs: recentLogs.length
      });
    } else {
      // คำนวณเวลาที่เหลือก่อนจะถูกลบ
      const oldestLog = data.logs.reduce((oldest, current) => 
        current.timestamp < oldest.timestamp ? current : oldest
      );
      const logAge = currentTime - oldestLog.timestamp;
      const logAgeMinutes = Math.floor(logAge / 60);
      const timeUntilDeletion = TEN_MINUTES - logAge;
      const minutesLeft = Math.floor(timeUntilDeletion / 60);
      const secondsLeft = timeUntilDeletion % 60;
      
      console.log(`   ข้อมูลใน CleanupLog.json ยังไม่เก่าเกินไป (อายุ log ล่าสุด ${logAgeMinutes} นาที)`);
      console.log(`   เหลือเวลา ${minutesLeft} นาที ${secondsLeft} วินาที ก่อนถูกลบ`);
      
      saveCleanupLog('check_cleanup_log', { 
        action: 'no_cleanup_needed', 
        log_age_minutes: logAgeMinutes,
        total_logs: data.logs.length,
        time_left_minutes: minutesLeft,
        time_left_seconds: secondsLeft
      });
    }
  } else {
    console.log(`   ไม่มี log entries ใน CleanupLog.json`);
    saveCleanupLog('check_cleanup_log', { 
      action: 'no_logs_found',
      message: 'ไม่มี log entries'
    });
  }
}

// ฟังก์ชันลบข้อมูลเก่าจาก SessionLogin.json (10 นาที)
function cleanupSessionLog() {
  console.log('🧹 เริ่มลบข้อมูลเก่าใน SessionLogin.json...');
  
  // ตรวจสอบว่าไฟล์มีอยู่จริงหรือไม่
  if (!fs.existsSync(SESSION_LOG_FILE)) {
    console.log('   ไฟล์ SessionLogin.json ไม่มีอยู่');
    saveCleanupLog('check_session_log', { 
      action: 'file_not_found',
      message: 'ไฟล์ไม่มีอยู่'
    });
    return;
  }
  
  try {
    const data = loadJsonFile(SESSION_LOG_FILE);
    const currentTime = Math.floor(Date.now() / 1000);
    const cutoffTime = currentTime - TEN_MINUTES;
    
    if (!Array.isArray(data)) {
      console.log('   ไม่มีข้อมูล log ที่ต้องลบ');
      saveCleanupLog('check_session_log', { 
        action: 'no_data',
        message: 'ไม่มีข้อมูล log'
      });
      return;
    }
    
    const originalCount = data.length;
    const recentLogs = data.filter(log => {
      let logTime;
      if (typeof log.timestamp === 'string') {
        logTime = Math.floor(new Date(log.timestamp).getTime() / 1000);
      } else if (typeof log.timestamp === 'number') {
        logTime = log.timestamp;
      } else {
        return false; // ถ้าแปลงไม่ได้ ให้ถือว่าเก่า
      }
      return logTime >= cutoffTime;
    });
    const deletedCount = originalCount - recentLogs.length;
    
    if (deletedCount > 0) {
      console.log(`   ลบ session log เก่า: ${deletedCount} รายการ`);
      console.log(`   เหลือ session log: ${recentLogs.length} รายการ`);
      
      // คำนวณอายุ log เก่าสุด
      const oldestLog = data.reduce((oldest, current) => {
        let oldestTime, currentTime;
        
        if (typeof oldest.timestamp === 'string') {
          oldestTime = Math.floor(new Date(oldest.timestamp).getTime() / 1000);
        } else if (typeof oldest.timestamp === 'number') {
          oldestTime = oldest.timestamp;
        } else {
          oldestTime = 0;
        }
        
        if (typeof current.timestamp === 'string') {
          currentTime = Math.floor(new Date(current.timestamp).getTime() / 1000);
        } else if (typeof current.timestamp === 'number') {
          currentTime = current.timestamp;
        } else {
          currentTime = 0;
        }
        
        return currentTime < oldestTime ? current : oldest;
      });
      
      let oldestAge = 0;
      if (oldestLog && oldestLog.timestamp) {
        let oldestLogTime;
        if (typeof oldestLog.timestamp === 'string') {
          oldestLogTime = Math.floor(new Date(oldestLog.timestamp).getTime() / 1000);
        } else if (typeof oldestLog.timestamp === 'number') {
          oldestLogTime = oldestLog.timestamp;
        } else {
          oldestLogTime = 0;
        }
        oldestAge = Math.floor((currentTime - oldestLogTime) / 60);
      }
      console.log(`   อายุ session log เก่าสุด: ${oldestAge} นาที`);
      
      saveJsonFile(SESSION_LOG_FILE, recentLogs);
      
      saveCleanupLog('cleanup_session_log', {
        deleted_count: deletedCount,
        remaining_count: recentLogs.length,
        oldest_age_minutes: oldestAge
      });
    } else {
      console.log('   ไม่มี session log เก่าที่ต้องลบ');
      saveCleanupLog('check_session_log', { 
        action: 'no_old_data',
        message: 'ไม่มี session log เก่า'
      });
    }
  } catch (error) {
    console.error('   Error ลบ session log:', error);
    saveCleanupLog('error_session_log', { 
      action: 'error',
      message: error.message
    });
  }
}

// ฟังก์ชันหลักสำหรับลบข้อมูลเก่า
function cleanupOldData() {
  const currentTime = new Date();
  console.log('🚀 เริ่มกระบวนการลบข้อมูลเก่า...');
  console.log(`⏰ เวลาปัจจุบัน: ${currentTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  console.log('');
  
  // บันทึก log การเริ่มลบข้อมูล
  saveCleanupLog('start_cleanup', {
    current_time: currentTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
  });
  
  cleanupStoriesHistory();
  console.log('');
  
  cleanupProfilePics();
  console.log('');
  
  cleanupOverdueEmail();
  console.log('');
  
  cleanupCleanupLog();
  console.log('');
  
  cleanupSessionLog();
  console.log('');
  
  const endTime = new Date();
  console.log('🎉 กระบวนการลบข้อมูลเก่าเสร็จสิ้น!');
  console.log(`⏰ เวลาสิ้นสุด: ${endTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  
  // บันทึก log การเสร็จสิ้น
  saveCleanupLog('finish_cleanup', {
    end_time: endTime.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    duration_seconds: Math.floor((endTime.getTime() - currentTime.getTime()) / 1000)
  });
}

// ฟังก์ชันตั้งเวลาลบข้อมูลอัตโนมัติ (ทุกวันเวลา 22:00 น. ตาม timezone)
function scheduleCleanup() {
  const now = new Date();
  
  // คำนวณเวลาถัดไปที่จะลบข้อมูล (22:00 น. ของวันถัดไป)
  const nextCleanup = new Date();
  nextCleanup.setHours(22, 0, 0, 0); // เวลา 22:00 น. (4 ทุ่ม)
  
  // ถ้าเวลาปัจจุบันเลย 22:00 น. แล้ว ให้ไปวันถัดไป
  if (now.getHours() >= 22) {
    nextCleanup.setDate(nextCleanup.getDate() + 1);
  }
  
  const timeUntilCleanup = nextCleanup.getTime() - now.getTime();
  
  console.log(`⏰ เวลาปัจจุบัน: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  console.log(`⏰ ตั้งเวลาลบข้อมูลเก่า: ${nextCleanup.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`);
  console.log(`⏰ รออีก ${Math.floor(timeUntilCleanup / 1000 / 60)} นาที`);
  
  // แสดงรายละเอียดการลบข้อมูลแต่ละไฟล์
  console.log('');
  console.log('📋 รายละเอียดการลบข้อมูล:');
  console.log('   📄 StoriesHistory.json: ลบข้อมูลเก่ากว่า 2 วัน');
  console.log('   📄 ProfilePics.json: ลบข้อมูลเก่ากว่า 4 เดือน');
  console.log('   📄 OverdueEmail.json: ลบข้อมูลเก่ากว่า 1 วัน');
  console.log('   📄 CleanupLog.json: ลบข้อมูลเก่ากว่า 10 นาที');
  console.log('   📄 SessionLogin.json: ลบข้อมูลเก่ากว่า 10 นาที');
  console.log('   ⏰ เวลาลบข้อมูล: ทุกวันเวลา 22:00 น. (4 ทุ่ม)');
  console.log('');
  
  // ตรวจสอบและแสดงสถานะข้อมูลปัจจุบัน
  checkCurrentDataStatus();
  
  // บันทึก log การตั้งเวลา
  saveCleanupLog('schedule_cleanup', {
    current_time: now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    next_cleanup: nextCleanup.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    wait_minutes: Math.floor(timeUntilCleanup / 1000 / 60)
  });
  
  // ตั้งเวลาลบข้อมูลครั้งแรก
  setTimeout(() => {
    console.log('🕐 ถึงเวลาลบข้อมูลเก่าแล้ว!');
    cleanupOldData();
    
    // ตั้งเวลาลบข้อมูลทุกวันเวลา 02:00 น.
    setInterval(() => {
      console.log('🕐 ถึงเวลาลบข้อมูลเก่าแล้ว!');
      cleanupOldData();
    }, 24 * 60 * 60 * 1000); // 24 ชั่วโมง
  }, timeUntilCleanup);

  // ตั้งเวลาลบ SessionLogin.json ทุก 10 นาที
  console.log('⏰ ตั้งเวลาลบ SessionLogin.json ทุก 10 นาที...');
  setInterval(() => {
    const now = new Date();
    console.log(`🕐 [${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}] ถึงเวลาลบ SessionLogin.json แล้ว!`);
    cleanupSessionLog();
  }, 10 * 60 * 1000); // 10 นาที
}

// ฟังก์ชันดู log การลบข้อมูล
function getCleanupLogs() {
  try {
    if (!fs.existsSync(CLEANUP_LOG_FILE)) {
      return [];
    }
    const logData = loadJsonFile(CLEANUP_LOG_FILE);
    return logData.logs || [];
  } catch (error) {
    console.error('Error loading cleanup logs:', error);
    return [];
  }
}

// ฟังก์ชันตรวจสอบและแสดงสถานะข้อมูลปัจจุบัน
function checkCurrentDataStatus() {
  const currentTime = Math.floor(Date.now() / 1000);
  
  console.log('📊 สถานะข้อมูลปัจจุบัน:');
  
  // ตรวจสอบ stories_history.json
  if (fs.existsSync(STORIES_HISTORY_FILE)) {
    try {
      const historyData = loadJsonFile(STORIES_HISTORY_FILE);
      const historyUsers = Object.keys(historyData);
      
      if (historyUsers.length > 0) {
        console.log(`   📄 StoriesHistory.json: ${historyUsers.length} ผู้ใช้`);
        
        historyUsers.forEach(username => {
          const userStories = historyData[username];
          if (userStories.length > 0) {
            const oldestStory = userStories.reduce((oldest, current) => 
              current.checked_at < oldest.checked_at ? current : oldest
            );
            const ageHours = Math.floor((currentTime - oldestStory.checked_at) / 3600);
            const ageMinutes = Math.floor(((currentTime - oldestStory.checked_at) % 3600) / 60);
            const timeLeft = TWO_DAYS - (currentTime - oldestStory.checked_at);
            const hoursLeft = Math.floor(timeLeft / 3600);
            const minutesLeft = Math.floor((timeLeft % 3600) / 60);
            
            if (timeLeft > 0) {
              console.log(`      @${username}: เหลือเวลา ${hoursLeft} ชั่วโมง ${minutesLeft} นาที (อายุ ${ageHours} ชั่วโมง ${ageMinutes} นาที)`);
            } else {
              console.log(`      @${username}: เกินกำหนดแล้ว (อายุ ${ageHours} ชั่วโมง ${ageMinutes} นาที) - จะถูกลบ`);
            }
          }
        });
      } else {
        console.log('   📄 StoriesHistory.json: ไม่มีข้อมูล');
      }
    } catch (error) {
      console.log('   📄 StoriesHistory.json: ไม่สามารถอ่านไฟล์ได้');
    }
  } else {
    console.log('   📄 StoriesHistory.json: ไฟล์ไม่มีอยู่');
  }
  
  // ตรวจสอบ profile_pics.json
  if (fs.existsSync(PROFILE_PICS_FILE)) {
    try {
      const profilePicsData = loadJsonFile(PROFILE_PICS_FILE);
      const profilePicsUsers = Object.keys(profilePicsData);
      
      if (profilePicsUsers.length > 0) {
        console.log(`   📄 ProfilePics.json: ${profilePicsUsers.length} ผู้ใช้`);
        
        // ตรวจสอบอายุไฟล์
        const stats = fs.statSync(PROFILE_PICS_FILE);
        const fileAge = currentTime - Math.floor(stats.mtime.getTime() / 1000);
        const fileAgeDays = Math.floor(fileAge / 86400);
        const fileAgeHours = Math.floor((fileAge % 86400) / 3600);
        const fileAgeMinutes = Math.floor((fileAge % 3600) / 60);
        const timeLeft = FOUR_MONTHS - fileAge;
        const daysLeft = Math.floor(timeLeft / 86400);
        const hoursLeft = Math.floor((timeLeft % 86400) / 3600);
        const minutesLeft = Math.floor((timeLeft % 3600) / 60);
        
        if (timeLeft > 0) {
          console.log(`      อายุไฟล์: ${fileAgeDays} วัน ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที, เหลือเวลา ${daysLeft} วัน ${hoursLeft} ชั่วโมง ${minutesLeft} นาที`);
        } else {
          console.log(`      อายุไฟล์: ${fileAgeDays} วัน ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที - เกินกำหนดแล้ว (จะถูกลบ)`);
        }
      } else {
        console.log('   📄 ProfilePics.json: ไม่มีข้อมูล');
      }
    } catch (error) {
      console.log('   📄 ProfilePics.json: ไม่สามารถอ่านไฟล์ได้');
    }
  } else {
    console.log('   📄 ProfilePics.json: ไฟล์ไม่มีอยู่');
  }
  
  // ตรวจสอบ CleanupLog.json
  if (fs.existsSync(CLEANUP_LOG_FILE)) {
    try {
      const logData = loadJsonFile(CLEANUP_LOG_FILE);
      const logCount = logData.logs ? logData.logs.length : 0;
      
      if (logCount > 0) {
        console.log(`   📄 CleanupLog.json: ${logCount} รายการ log`);
        
        // ตรวจสอบอายุจาก log entry ล่าสุด
        const latestLog = logData.logs[logData.logs.length - 1];
        if (latestLog && latestLog.timestamp) {
          const logAge = currentTime - latestLog.timestamp;
          const logAgeMinutes = Math.floor(logAge / 60);
          const logAgeSeconds = logAge % 60;
          const timeLeft = TEN_MINUTES - logAge;
          const minutesLeft = Math.floor(timeLeft / 60);
          const secondsLeft = timeLeft % 60;
        
        if (timeLeft > 0) {
            console.log(`      อายุ log ล่าสุด: ${logAgeMinutes} นาที ${logAgeSeconds} วินาที, เหลือเวลา ${minutesLeft} นาที ${secondsLeft} วินาที`);
          } else {
            console.log(`      อายุ log ล่าสุด: ${logAgeMinutes} นาที ${logAgeSeconds} วินาที - เกินกำหนดแล้ว (จะถูกลบ)`);
          }
        } else {
          console.log(`      ไม่สามารถอ่านเวลาจาก log entries ได้`);
        }
      } else {
        console.log('   📄 CleanupLog.json: ไม่มีข้อมูล');
      }
    } catch (error) {
      console.log('   📄 CleanupLog.json: ไม่สามารถอ่านไฟล์ได้');
    }
  } else {
    console.log('   📄 CleanupLog.json: ไฟล์ไม่มีอยู่');
  }
  
  // ตรวจสอบ OverdueEmail.json
  if (fs.existsSync(OVERDUE_EMAIL_FILE)) {
    try {
      const overdueEmailData = loadJsonFile(OVERDUE_EMAIL_FILE);
      
      // ตรวจสอบอายุไฟล์
      const stats = fs.statSync(OVERDUE_EMAIL_FILE);
      const fileAge = currentTime - Math.floor(stats.mtime.getTime() / 1000);
      const fileAgeHours = Math.floor(fileAge / 3600);
      const fileAgeMinutes = Math.floor((fileAge % 3600) / 60);
      const timeLeft = ONE_DAY - fileAge;
      const hoursLeft = Math.floor(timeLeft / 3600);
      const minutesLeft = Math.floor((timeLeft % 3600) / 60);
      
      console.log(`   📄 OverdueEmail.json: ไฟล์มีอยู่`);
      
      if (timeLeft > 0) {
        console.log(`      อายุไฟล์: ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที, เหลือเวลา ${hoursLeft} ชั่วโมง ${minutesLeft} นาที`);
      } else {
        console.log(`      อายุไฟล์: ${fileAgeHours} ชั่วโมง ${fileAgeMinutes} นาที - เกินกำหนดแล้ว (จะถูกลบ)`);
      }
      
      // แสดงข้อมูลการตรวจสอบล่าสุด
      if (overdueEmailData.lastCheckTime) {
        const lastCheck = new Date(overdueEmailData.lastCheckTime);
        const lastCheckAge = currentTime - Math.floor(lastCheck.getTime() / 1000);
        const lastCheckHours = Math.floor(lastCheckAge / 3600);
        const lastCheckMinutes = Math.floor((lastCheckAge % 3600) / 60);
        
        console.log(`      ตรวจสอบครั้งล่าสุด: ${lastCheck.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })} (${lastCheckHours} ชั่วโมง ${lastCheckMinutes} นาทีที่แล้ว)`);
      } else {
        console.log(`      ยังไม่เคยตรวจสอบอีเมลที่ตกค้าง`);
      }
      
      console.log(`      ช่วงเวลาตรวจสอบ: ${overdueEmailData.checkInterval / (1000 * 60 * 60)} ชั่วโมง`);
    } catch (error) {
      console.log('   📄 OverdueEmail.json: ไม่สามารถอ่านไฟล์ได้');
    }
  } else {
    console.log('   📄 OverdueEmail.json: ไฟล์ไม่มีอยู่');
  }
  
  // ตรวจสอบ SessionLogin.json
  if (fs.existsSync(SESSION_LOG_FILE)) {
    try {
      const sessionLogData = loadJsonFile(SESSION_LOG_FILE);
      const logCount = Array.isArray(sessionLogData) ? sessionLogData.length : 0;
      
      if (logCount > 0) {
        console.log(`   📄 SessionLogin.json: ${logCount} รายการ log`);
        
        // ตรวจสอบอายุจาก log entry ล่าสุด
        const latestLog = sessionLogData[sessionLogData.length - 1];
        if (latestLog && latestLog.timestamp) {
          // แปลง timestamp เป็น Unix timestamp
          let logTime;
          if (typeof latestLog.timestamp === 'string') {
            logTime = Math.floor(new Date(latestLog.timestamp).getTime() / 1000);
          } else if (typeof latestLog.timestamp === 'number') {
            logTime = latestLog.timestamp;
          } else {
            console.log(`      ไม่สามารถแปลง timestamp ได้: ${typeof latestLog.timestamp}`);
            return;
          }
          
          const logAge = currentTime - logTime;
          const logAgeMinutes = Math.floor(logAge / 60);
          const logAgeSeconds = Math.floor(logAge % 60);
          const timeLeft = TEN_MINUTES - logAge;
          const minutesLeft = Math.floor(timeLeft / 60);
          const secondsLeft = Math.floor(timeLeft % 60);
        
          if (timeLeft > 0) {
            console.log(`      อายุ log ล่าสุด: ${logAgeMinutes} นาที ${logAgeSeconds} วินาที, เหลือเวลา ${minutesLeft} นาที ${secondsLeft} วินาที`);
          } else {
            console.log(`      อายุ log ล่าสุด: ${logAgeMinutes} นาที ${logAgeSeconds} วินาที - เกินกำหนดแล้ว (จะถูกลบ)`);
          }
        } else {
          console.log(`      ไม่สามารถอ่านเวลาจาก log entries ได้`);
        }
      } else {
        console.log('   📄 SessionLogin.json: ไม่มีข้อมูล');
      }
    } catch (error) {
      console.log('   📄 SessionLogin.json: ไม่สามารถอ่านไฟล์ได้');
    }
  } else {
    console.log('   📄 SessionLogin.json: ไฟล์ไม่มีอยู่');
  }
  
  console.log('');
}

// ฟังก์ชันดูสถานะการลบข้อมูล
function getCleanupStatus() {
  const now = new Date();
  const nextCleanup = new Date();
  nextCleanup.setHours(2, 0, 0, 0);
  
  if (now.getHours() >= 2) {
    nextCleanup.setDate(nextCleanup.getDate() + 1);
  }
  
  const timeUntilCleanup = nextCleanup.getTime() - now.getTime();
  
  return {
    current_time: now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    next_cleanup: nextCleanup.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
    time_until_cleanup_minutes: Math.floor(timeUntilCleanup / 1000 / 60),
    time_until_cleanup_hours: Math.floor(timeUntilCleanup / 1000 / 60 / 60)
  };
}

// Export ฟังก์ชันสำหรับใช้งาน
module.exports = {
  cleanupOldData,
  scheduleCleanup,
  cleanupStoriesHistory,
  cleanupProfilePics,
  cleanupOverdueEmail,
  cleanupCleanupLog,
  cleanupSessionLog,
  getCleanupLogs,
  getCleanupStatus,
  checkCurrentDataStatus
};

// ถ้าเรียกไฟล์นี้โดยตรง ให้รันการลบข้อมูล
if (require.main === module) {
  cleanupOldData();
} 