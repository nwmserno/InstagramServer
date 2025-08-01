const sessionManager = require('./SessionManager');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ไฟล์เก็บประวัติสตอรี่
const STORIES_HISTORY_FILE = path.join(__dirname, '..', 'data', 'StoriesHistory.json');

// ฟังก์ชันโหลดประวัติสตอรี่
function loadStoriesHistory() {
  try {
    if (fs.existsSync(STORIES_HISTORY_FILE)) {
      const data = fs.readFileSync(STORIES_HISTORY_FILE, 'utf8');
      // ตรวจสอบว่าไฟล์ไม่ว่างเปล่า
      if (data.trim() === '') {
        console.log('StoriesHistory.json is empty, returning empty object');
        return {};
      }
      
      // ตรวจสอบว่าไฟล์มีข้อมูลที่สมบูรณ์หรือไม่
      if (!data.trim().startsWith('{') || !data.trim().endsWith('}')) {
        console.log('StoriesHistory.json has incomplete data, returning empty object');
        return {};
      }
      
      const parsed = JSON.parse(data);
      // ตรวจสอบว่าเป็น object หรือไม่
      if (typeof parsed !== 'object' || parsed === null) {
        console.log('StoriesHistory.json is not a valid object, returning empty object');
        return {};
      }
      return parsed;
    }
  } catch (error) {
    console.error('Error loading stories history:', error);
    console.error('File content might be corrupted');
    
    // ถ้าเกิด error ให้ลบไฟล์ที่เสียหายและสร้างใหม่
    try {
      if (fs.existsSync(STORIES_HISTORY_FILE)) {
        // อ่านไฟล์เพื่อดูข้อมูลที่เสียหาย
        const corruptedData = fs.readFileSync(STORIES_HISTORY_FILE, 'utf8');
        console.error('Corrupted file content:', corruptedData.substring(0, 200) + '...');
        
        fs.unlinkSync(STORIES_HISTORY_FILE);
        console.log('Deleted corrupted StoriesHistory.json');
      }
    } catch (deleteError) {
      console.error('Error deleting corrupted file:', deleteError);
    }
  }
  return {};
}

// ฟังก์ชันบันทึกประวัติสตอรี่
function saveStoriesHistory(history) {
  try {
    // ตรวจสอบว่า history เป็น object หรือไม่
    if (typeof history !== 'object' || history === null) {
      console.error('Invalid history data, cannot save');
      return;
    }
    
    // สร้าง backup ก่อนบันทึก
    const backupFile = STORIES_HISTORY_FILE + '.backup';
    if (fs.existsSync(STORIES_HISTORY_FILE)) {
      try {
        fs.copyFileSync(STORIES_HISTORY_FILE, backupFile);
      } catch (backupError) {
        console.error('Error creating backup:', backupError);
      }
    }
    
    // บันทึกข้อมูลใหม่
    const jsonData = JSON.stringify(history, null, 2);
    
    // ตรวจสอบว่า JSON string ถูกต้องหรือไม่
    try {
      JSON.parse(jsonData);
    } catch (parseError) {
      console.error('Generated JSON is invalid:', parseError);
      throw new Error('Invalid JSON data generated');
    }
    
    // เขียนไฟล์แบบ atomic (เขียนไปไฟล์ชั่วคราวก่อน)
    const tempFile = STORIES_HISTORY_FILE + '.tmp';
    fs.writeFileSync(tempFile, jsonData);
    
    // ย้ายไฟล์ชั่วคราวไปแทนที่ไฟล์เดิม
    fs.renameSync(tempFile, STORIES_HISTORY_FILE);
    
    // ลบ backup หลังจากบันทึกสำเร็จ
    if (fs.existsSync(backupFile)) {
      try {
        fs.unlinkSync(backupFile);
      } catch (deleteError) {
        console.error('Error deleting backup:', deleteError);
      }
    }
  } catch (error) {
    console.error('Error saving stories history:', error);
    // ถ้าเกิด error ให้ restore จาก backup
    const backupFile = STORIES_HISTORY_FILE + '.backup';
    if (fs.existsSync(backupFile)) {
      try {
        fs.copyFileSync(backupFile, STORIES_HISTORY_FILE);
        console.log('Restored from backup');
      } catch (restoreError) {
        console.error('Error restoring from backup:', restoreError);
      }
    }
  }
}

// ฟังก์ชันตรวจสอบสตอรี่ใหม่
async function checkNewStories(username) {
  try {
    // ใช้ SessionManager พร้อม retry mechanism
    return await sessionManager.executeWithRetry(async (ig) => {
      // ค้นหาผู้ใช้
      const user = await ig.user.searchExact(username);
    
    // ตรวจสอบว่าเป็นบัญชี public หรือไม่
    if (user.is_private) {
      throw new Error('🔒 บัญชีนี้เป็นส่วนตัว (Private Account)\n\n📱 ไม่สามารถดูสตอรี่ได้เนื่องจากบัญชีนี้ตั้งค่าเป็นส่วนตัว\n\n💡 ข้อแนะนำ:\n• บัญชีส่วนตัวจะแสดงเฉพาะผู้ติดตามที่ได้รับการอนุมัติเท่านั้น\n• หากต้องการดูสตอรี่ ต้องขอติดตามและรอการอนุมัติจากเจ้าของบัญชี\n• หรือลองตรวจสอบบัญชีอื่นที่ตั้งค่าเป็นสาธารณะ');
    }
    
    // ดึงสตอรี่
    const stories = await ig.feed.userStory(user.pk).items();
    
    // โหลดประวัติสตอรี่
    const storiesHistory = loadStoriesHistory();
    const userHistory = storiesHistory[username] || [];
    
    // ตรวจสอบว่ามีสตอรี่หรือไม่
    if (stories.length === 0) {
      return {
        username: user.username,
        full_name: user.full_name,
        has_stories: false,
        story_count: 0,
        stories: [],
        new_stories: [],
        message: '📭 ไม่มีสตอรี่\n\n📱 บัญชีนี้ยังไม่มีสตอรี่ที่โพสต์\n\n💡 ข้อแนะนำ:\n• ลองตรวจสอบอีกครั้งในภายหลัง\n• หรือตรวจสอบบัญชีอื่นที่มีสตอรี่'
      };
    }
    
    // แปลงข้อมูลสตอรี่
    const storyData = stories.map(story => ({
      id: story.id,
      media_type: story.media_type === 1 ? 'รูปภาพ' : 'วิดีโอ',
      taken_at: new Date(story.taken_at * 1000).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' }),
      taken_at_timestamp: story.taken_at,
      url: story.media_type === 1 ? story.image_versions2?.candidates?.[0]?.url : story.video_versions?.[0]?.url,
      duration: story.media_type === 2 ? story.video_duration : null
    }));
    
    // ตรวจสอบสตอรี่ใหม่
    const newStories = [];
    const currentStoryIds = storyData.map(story => story.id);
    
    for (const story of storyData) {
      // ตรวจสอบว่าสตอรี่นี้เคยเห็นหรือไม่
      const isNew = !userHistory.some(historyStory => historyStory.id === story.id);
      
      if (isNew) {
        newStories.push(story);
      }
    }
    
    // อัปเดตประวัติสตอรี่
    const updatedHistory = storyData.map(story => ({
      id: story.id,
      taken_at_timestamp: story.taken_at_timestamp,
      checked_at: Math.floor(Date.now() / 1000)
    }));
    
    storiesHistory[username] = updatedHistory;
    saveStoriesHistory(storiesHistory);
    
    // สร้างข้อความ
    let message;
    if (newStories.length === 0) {
      message = `✅ ไม่มีสตอรี่ใหม่\n\n📱 บัญชี @${user.username} มีสตอรี่ ${storyData.length} รายการ แต่ไม่มีสตอรี่ใหม่\n\n💡 ข้อแนะนำ:\n• ลองตรวจสอบอีกครั้งในภายหลัง\n• หรือตรวจสอบบัญชีอื่นที่มีสตอรี่ใหม่`;
    } else if (newStories.length === storyData.length) {
      message = `🎉 พบสตอรี่ใหม่ ${newStories.length} รายการ!\n\n📱 บัญชี @${user.username} มีสตอรี่ใหม่ทั้งหมด\n\n✨ สตอรี่ใหม่:\n${newStories.map((story, index) => `• ${index + 1}. ${story.media_type} - ${story.taken_at}`).join('\n')}`;
    } else {
      message = `🎉 พบสตอรี่ใหม่ ${newStories.length} รายการ!\n\n📱 บัญชี @${user.username} มีสตอรี่ทั้งหมด ${storyData.length} รายการ\n\n✨ สตอรี่ใหม่:\n${newStories.map((story, index) => `• ${index + 1}. ${story.media_type} - ${story.taken_at}`).join('\n')}`;
    }
    
    return {
      username: user.username,
      full_name: user.full_name,
      has_stories: true,
      story_count: storyData.length,
      stories: storyData,
      new_stories: newStories,
      new_story_count: newStories.length,
      message: message
    };
    });
    
  } catch (error) {
    console.error(`Error checking stories for ${username}:`, error.message);
    throw error;
  }
}

// ฟังก์ชันส่งอีเมลแจ้งเตือนสตอรี่ใหม่
async function sendStoriesEmail(username, storyInfo, email, isNotification = false, changes = null) {
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
      textContent += `ชื่อ: ${storyInfo.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${storyInfo.new_story_count} รายการ\n`;
      textContent += `การเปลี่ยนแปลง:\n${changes}`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติเมื่อตรวจพบสตอรี่ใหม่\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    } else if (isNotification) {
      // การแจ้งเตือนแบบ scheduled
      subject = `[แจ้งเตือนอัตโนมัติ] สตอรี่ใหม่: @${username}`;
      textContent = `\n==== แจ้งเตือนอัตโนมัติ - สตอรี่ใหม่ ====\n\n`;
      textContent += `Username: @${username}\n`;
      textContent += `ชื่อ: ${storyInfo.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${storyInfo.new_story_count} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติตามเวลาที่คุณตั้งไว้\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    } else {
      // การแจ้งเตือนแบบปกติ
      subject = `แจ้งเตือนสตอรี่ใหม่: @${username}`;
      textContent = `\n==== แจ้งเตือนสตอรี่ใหม่ ====\n\n`;
      textContent += `Username: @${username}\n`;
      textContent += `ชื่อ: ${storyInfo.full_name}\n`;
      textContent += `สตอรี่ใหม่: ${storyInfo.new_story_count} รายการ\n`;
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
              <p><strong>Username:</strong> @${storyInfo.username}</p>
              <p><strong>ชื่อ:</strong> ${storyInfo.full_name}</p>
              <p><strong>สตอรี่ใหม่:</strong> ${storyInfo.new_story_count} รายการ</p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            <h3 style="color: #333; margin-bottom: 20px;">📸 รายละเอียดสตอรี่ใหม่</h3>
    `;

    if (storyInfo.new_story_count > 0) {
      storyInfo.new_stories.forEach((story, index) => {
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
      if (storyInfo.new_story_count > 0) {
      storyInfo.new_stories.forEach((story, index) => {
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

  } catch (error) {
    console.error('Send stories email error:', error);
    throw error;
  }
}

// ฟังก์ชันส่งอีเมลรวมหลาย username สำหรับ stories
async function sendBulkStoriesEmail(usersData, email, isNotification = false, changes = null) {
  try {
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    if (!email || !usersData || usersData.length === 0) return;

    const now = new Date();
    let subject, textContent;
    
    if (changes) {
      // การแจ้งเตือนการเปลี่ยนแปลง
      subject = `[แจ้งเตือนการเปลี่ยนแปลง] สตอรี่ใหม่: ${usersData.length} บัญชี`;
      textContent = `\n==== แจ้งเตือนการเปลี่ยนแปลงสตอรี่ ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `การเปลี่ยนแปลง:\n${changes}\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดสตอรี่:\n`;
      usersData.forEach((user, index) => {
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - สตอรี่ใหม่: ${user.new_story_count} รายการ\n`;
      });
      textContent += `\nนี่เป็นการแจ้งเตือนอัตโนมัติเมื่อตรวจพบสตอรี่ใหม่\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    } else if (isNotification) {
      // การแจ้งเตือนแบบ scheduled
      subject = `[แจ้งเตือนอัตโนมัติ] สตอรี่ใหม่: ${usersData.length} บัญชี`;
      textContent = `\n==== แจ้งเตือนอัตโนมัติ - สตอรี่ใหม่ ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดสตอรี่:\n`;
      usersData.forEach((user, index) => {
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - สตอรี่ใหม่: ${user.new_story_count} รายการ\n`;
      });
      textContent += `\nนี่เป็นการแจ้งเตือนอัตโนมัติตามเวลาที่คุณตั้งไว้\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    } else {
      // การแจ้งเตือนแบบปกติ
      subject = `แจ้งเตือนสตอรี่ใหม่: ${usersData.length} บัญชี`;
      textContent = `\n==== แจ้งเตือนสตอรี่ใหม่ ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดสตอรี่:\n`;
      usersData.forEach((user, index) => {
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - สตอรี่ใหม่: ${user.new_story_count} รายการ\n`;
      });
      textContent += `\nขอบคุณที่ใช้บริการ IG Story Checker\n`;
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
          .summary { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #667eea; }
          .user-item { background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 15px; margin-bottom: 10px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .story-item { background: #f8f9fa; border: 1px solid #e9ecef; border-radius: 8px; padding: 10px; margin: 5px 0; }
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
            <div class="summary">
              <h3>📋 สรุปข้อมูล</h3>
              <p><strong>จำนวนบัญชี:</strong> ${usersData.length} รายการ</p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            <h3 style="color: #333; margin-bottom: 20px;">👥 รายละเอียดสตอรี่</h3>
    `;

    usersData.forEach((user, index) => {
      htmlContent += `
        <div class="user-item">
          <h4 style="margin: 0 0 10px 0;">${index + 1}. @${user.username}</h4>
          <p><strong>ชื่อ:</strong> ${user.full_name}</p>
          <p><strong>สตอรี่ใหม่:</strong> ${user.new_story_count} รายการ</p>
      `;
      
      if (user.new_story_count > 0 && user.new_stories) {
        htmlContent += `<h5 style="margin: 15px 0 10px 0;">📸 รายละเอียดสตอรี่ใหม่:</h5>`;
        user.new_stories.forEach((story, storyIndex) => {
          const typeClass = story.media_type === 'รูปภาพ' ? 'type-image' : 'type-video';
          htmlContent += `
            <div class="story-item">
              <div style="margin-bottom: 5px;">
                <span class="story-type ${typeClass}">${story.media_type}</span>
                <span class="new-badge">ใหม่</span>
                ${story.duration ? `<span style="margin-left: 10px; color: #666;">⏱️ ${story.duration}s</span>` : ''}
              </div>
              <p style="margin: 5px 0;"><strong>เวลาที่โพสต์:</strong> ${story.taken_at}</p>
              ${story.url ? `<p style="margin: 5px 0;"><strong>ลิงก์:</strong> <a href="${story.url}" target="_blank">ดูสตอรี่</a></p>` : ''}
            </div>
          `;
        });
      } else {
        htmlContent += `<p style="color: #666; font-style: italic;">ไม่มีสตอรี่ใหม่</p>`;
      }
      
      htmlContent += `</div>`;
    });

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

    await transporter.sendMail({
      from: `IG Story Checker <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`📧 ส่งอีเมลรวม ${usersData.length} บัญชีไปยัง ${email}`);
  } catch (error) {
    console.error('Send bulk stories email error:', error);
    throw error;
  }
}

module.exports = {
  checkNewStories,
  sendStoriesEmail,
  sendBulkStoriesEmail
}; 