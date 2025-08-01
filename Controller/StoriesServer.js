const express = require('express');
const { IgApiClient } = require('instagram-private-api');
const { checkUserPrivacy, sendEmail } = require('./CheckUserPrivacy');
const { checkNewStories, sendStoriesEmail } = require('./CheckNewStories');
const { getCleanupLogs, getCleanupStatus } = require('./CleanupData');
const fs = require('fs');
const PROFILE_PIC_FILE = './data/ProfilePics.json';
let lastProfilePics = {};
// โหลดข้อมูลจากไฟล์ (ถ้ามี)
if (fs.existsSync(PROFILE_PIC_FILE)) {
  try {
    lastProfilePics = JSON.parse(fs.readFileSync(PROFILE_PIC_FILE, 'utf8'));
  } catch (e) {
    lastProfilePics = {};
  }
}

function saveProfilePics() {
  fs.writeFileSync(PROFILE_PIC_FILE, JSON.stringify(lastProfilePics, null, 2), 'utf8');
}

const router = express.Router();

const IG_USERNAME = process.env.IG_USERNAME;
const IG_PASSWORD = process.env.IG_PASSWORD;

async function getStoriesAndProfile(username) {
  const ig = new IgApiClient();
  ig.state.generateDevice(IG_USERNAME);
  await ig.account.login(IG_USERNAME, IG_PASSWORD);
  const user = await ig.user.info(await ig.user.getIdByUsername(username));
  const reelsFeed = ig.feed.reelsMedia({ userIds: [user.pk] });
  const storyItems = await reelsFeed.items();
  return {
    profile: {
      username: user.username,
      display_name: user.full_name || user.username,
      profile_pic_url: user.profile_pic_url,
      story_count: storyItems.length,
      last_story_time: storyItems.length > 0 ? new Date(storyItems[0].taken_at * 1000).toISOString() : null
    },
    stories: storyItems.map(item => ({
      type: item.media_type === 2 ? 'video' : 'photo',
      url: item.media_type === 2 ? item.video_versions[0].url : item.image_versions2.candidates[0].url,
      posted_at: new Date(item.taken_at * 1000).toISOString()
    }))
  };
}

const shuffle = arr => {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
};

function randomDelay(min = 3000, max = 7000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

router.post('/instagram-Stories', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'No username' });
  try {
    const data = await getStoriesAndProfile(username);
    res.json(data);
  } catch (e) {
    console.error('API error:', e);
    res.status(500).json({ error: 'User not found, private, or Instagram API changed.' });
  }
});

router.post('/instagram-Stories-bulk', async (req, res) => {
  const { usernames } = req.body;
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'No usernames' });
  }
  try {
    const results = [];
    const batchSize = 10;
    shuffle(usernames);
    for (let i = 0; i < usernames.length; i += batchSize) {
      const batch = usernames.slice(i, i + batchSize);
      for (const username of batch) {
      try {
        const data = await getStoriesAndProfile(username);
        results.push({
          username,
          success: true,
          profile: data.profile,
          stories: data.stories
        });
          await new Promise(res => setTimeout(res, randomDelay()));
      } catch (e) {
          if (e && e.message && (e.message.includes('429') || e.message.toLowerCase().includes('rate limit'))) {
            // ถ้าโดน block ให้หยุดพักนาน ๆ
            await new Promise(res => setTimeout(res, 60 * 60 * 1000)); // 1 ชั่วโมง
          }
        results.push({ username, success: false, error: 'User not found, private, or Instagram API changed.' });
        }
      }
      if (i + batchSize < usernames.length) {
        await new Promise(res => setTimeout(res, 10000)); // พัก 10 วินาทีระหว่าง batch
      }
    }
    res.json({ results });
  } catch (e) {
    console.error('Bulk API error:', e);
    res.status(500).json({ error: 'Bulk processing failed.' });
  }
});

// Endpoint ตรวจสอบ Privacy
router.post('/check-privacy', async (req, res) => {
  const { usernames, email } = req.body;
  
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'กรุณาระบุ username อย่างน้อย 1 รายการ' });
  }
  
  try {
    const results = [];
    const emailData = [];
    
    for (const username of usernames) {
      try {
        const info = await checkUserPrivacy(username);
        
        // ตรวจสอบการเปลี่ยนแปลงรูปโปรไฟล์ (เปรียบเทียบเฉพาะ path หลัก)
        let isProfilePicChanged = false;
        const lastPic = lastProfilePics[username];
        const lastPicNorm = normalizePicUrl(lastPic);
        const currentPicNorm = normalizePicUrl(info.profile_pic_url);
        
        if (lastPicNorm) {
          isProfilePicChanged = (lastPicNorm !== currentPicNorm);
        } else {
          isProfilePicChanged = false;
        }
        
        // อัปเดตข้อมูลในไฟล์ทันที
        lastProfilePics[username] = info.profile_pic_url;
        saveProfilePics();
        
        // เก็บข้อมูลสำหรับส่งอีเมล
        emailData.push({
          username: info.username,
          full_name: info.full_name,
          is_private: info.is_private,
          isProfilePicChanged: isProfilePicChanged
        });
        
        results.push({ username: info.username, is_private: info.is_private, full_name: info.full_name, profile_pic_url: info.profile_pic_url });
      } catch (e) {
        results.push({ username, error: 'ไม่พบผู้ใช้หรือ API มีปัญหา' });
      }
    }
    
    // ส่งอีเมลครั้งเดียวรวมข้อมูลทั้งหมด
    if (email && emailData.length > 0) {
      await sendBulkEmail(emailData, email);
    }
    
    res.json({ results });
  } catch (e) {
    console.error('Check privacy error:', e);
    res.status(500).json({ error: 'Internal error: ' + e.message });
  }
});

// Endpoint ตรวจสอบสตอรี่ใหม่
router.post('/check-new-stories', async (req, res) => {
  const { usernames, email } = req.body;
  
  if (!usernames || !Array.isArray(usernames) || usernames.length === 0) {
    return res.status(400).json({ error: 'กรุณาระบุ username อย่างน้อย 1 รายการ' });
  }
  
  try {
    const results = [];
    const emailData = [];
    
    for (const username of usernames) {
      try {
        const storyInfo = await checkNewStories(username);
        
        // เก็บข้อมูลสำหรับส่งอีเมล
        emailData.push(storyInfo);
        
        results.push({
          username: storyInfo.username,
          full_name: storyInfo.full_name,
          has_stories: storyInfo.has_stories,
          story_count: storyInfo.story_count,
          new_story_count: storyInfo.new_story_count || 0,
          message: storyInfo.message
        });
        
        // หน่วงเวลาระหว่างการตรวจสอบแต่ละบัญชี
        await new Promise(resolve => setTimeout(resolve, 2000 + Math.random() * 3000));
        
      } catch (e) {
        results.push({ 
          username, 
          error: e.message || 'ไม่สามารถตรวจสอบสตอรี่ได้' 
        });
      }
    }
    
    // ส่งอีเมลรวม
    if (email && emailData.length > 0) {
      await sendBulkStoriesEmail(emailData, email);
    }
    
    res.json({ results });
    
  } catch (e) {
    console.error('Check new stories error:', e);
    res.status(500).json({ error: 'Internal error: ' + e.message });
  }
});

// ฟังก์ชันส่งอีเมลรวมสำหรับ Privacy
async function sendBulkEmail(emailData, email) {
  try {
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

  const now = new Date();
  const subject = `รายงานสถานะบัญชี Instagram (${emailData.length} บัญชี)`;
  
  // สร้าง HTML content
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
        .summary h3 { margin: 0 0 10px 0; color: #333; font-size: 18px; }
        .summary p { margin: 5px 0; color: #666; }
        .account-item { background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
        .username { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; }
        .status-item { margin: 8px 0; display: flex; align-items: center; }
        .status-label { font-weight: 500; color: #555; min-width: 80px; }
        .status-value { margin-left: 10px; }
        .private { color: #dc3545; background: #f8d7da; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .public { color: #28a745; background: #d4edda; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .changed { color: #ffc107; background: #fff3cd; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .unchanged { color: #6c757d; background: #f8f9fa; padding: 4px 8px; border-radius: 4px; font-size: 12px; }
        .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-top: 1px solid #e9ecef; }
        .divider { height: 1px; background: linear-gradient(90deg, transparent, #667eea, transparent); margin: 20px 0; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>📊 รายงานสถานะบัญชี Instagram</h1>
        </div>
        <div class="content">
          <div class="summary">
            <h3>📋 สรุปการตรวจสอบ</h3>
            <p><strong>จำนวนบัญชี:</strong> ${emailData.length} บัญชี</p>
            <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
          </div>
          
          <div class="divider"></div>
          
          <h3 style="color: #333; margin-bottom: 20px;">📱 รายละเอียดบัญชี</h3>
  `;
  
  emailData.forEach((data, index) => {
    const type = data.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
    const typeClass = data.is_private ? 'private' : 'public';
    const profilePicText = data.isProfilePicChanged ? 'มีการเปลี่ยนแปลงรูปโปรไฟล์' : 'ไม่มีการเปลี่ยนแปลงรูปโปรไฟล์';
    const profilePicClass = data.isProfilePicChanged ? 'changed' : 'unchanged';
    
    htmlContent += `
      <div class="account-item">
        <div class="username">${index + 1}. @${data.username}</div>
        <div class="status-item">
          <span class="status-label">👤 ชื่อ:</span>
          <span class="status-value">${data.full_name || 'ไม่ระบุ'}</span>
        </div>
        <div class="status-item">
          <span class="status-label">🔒 สถานะ:</span>
          <span class="status-value"><span class="${typeClass}">${type}</span></span>
        </div>
        <div class="status-item">
          <span class="status-label">🖼️ รูปโปรไฟล์:</span>
          <span class="status-value"><span class="${profilePicClass}">${profilePicText}</span></span>
        </div>
      </div>
    `;
  });
  
  htmlContent += `
        </div>
        <div class="footer">
          <p>ขอบคุณที่ใช้บริการ IG Privacy Checker</p>
          <p style="font-size: 12px; margin-top: 10px;">📧 ส่งโดยระบบอัตโนมัติ</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  // สร้าง plain text version สำหรับ fallback
  let textContent = `\n==== รายงานสถานะบัญชี Instagram ====\n\n`;
  textContent += `ตรวจสอบทั้งหมด: ${emailData.length} บัญชี\n`;
  textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
  
  emailData.forEach((data, index) => {
    const type = data.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
    const profilePicText = data.isProfilePicChanged ? 'มีการเปลี่ยนแปลงรูปโปรไฟล์' : 'ไม่มีการเปลี่ยนแปลงรูปโปรไฟล์';
    
    textContent += `${index + 1}. @${data.username}\n`;
    textContent += `   • ชื่อ: ${data.full_name || 'ไม่ระบุ'}\n`;
    textContent += `   • สถานะ: ${type}\n`;
    textContent += `   • รูปโปรไฟล์: ${profilePicText}\n\n`;
  });
  
  textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
  
  await transporter.sendMail({
    from: `IG Checker <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
    text: textContent,
    html: htmlContent
  });
  } catch (e) {
    console.error('Send bulk email error:', e);
    throw e;
  }
}

// ฟังก์ชันส่งอีเมลรวมสำหรับสตอรี่
async function sendBulkStoriesEmail(storiesData, email) {
  try {
    const nodemailer = require('nodemailer');
    let transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const now = new Date();
    const totalNewStories = storiesData.reduce((sum, data) => sum + data.new_story_count, 0);
    const subject = `รายงานสตอรี่ใหม่ (${storiesData.length} บัญชี, ${totalNewStories} สตอรี่ใหม่)`;
    
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
          .summary h3 { margin: 0 0 10px 0; color: #333; font-size: 18px; }
          .summary p { margin: 5px 0; color: #666; }
          .account-item { background: white; border: 1px solid #e9ecef; border-radius: 8px; padding: 20px; margin-bottom: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
          .username { font-size: 18px; font-weight: bold; color: #333; margin-bottom: 15px; }
          .story-item { background: #f8f9fa; border-radius: 6px; padding: 12px; margin: 8px 0; }
          .story-type { display: inline-block; padding: 3px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; }
          .type-image { background: #d4edda; color: #155724; }
          .type-video { background: #cce5ff; color: #004085; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-top: 1px solid #e9ecef; }
          .divider { height: 1px; background: linear-gradient(90deg, transparent, #667eea, transparent); margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>📱 รายงานสตอรี่ใหม่</h1>
          </div>
          <div class="content">
            <div class="summary">
              <h3>📋 สรุปการตรวจสอบ</h3>
              <p><strong>จำนวนบัญชี:</strong> ${storiesData.length} บัญชี</p>
              <p><strong>จำนวนสตอรี่ใหม่:</strong> ${totalNewStories} รายการ</p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            <div class="divider"></div>
            
            <h3 style="color: #333; margin-bottom: 20px;">📸 รายละเอียดสตอรี่ใหม่</h3>
    `;
    
    storiesData.forEach((data, index) => {
      htmlContent += `
        <div class="account-item">
          <div class="username">${index + 1}. @${data.username}</div>
          <p><strong>ชื่อ:</strong> ${data.full_name || 'ไม่ระบุ'}</p>
          <p><strong>สถานะ:</strong> ${data.new_story_count > 0 ? `มีสตอรี่ใหม่ ${data.new_story_count} รายการ` : 'ไม่มีสตอรี่ใหม่'}</p>
          <p><strong>จำนวนสตอรี่ใหม่:</strong> ${data.new_story_count} รายการ</p>
      `;
      
      if (data.new_story_count > 0 && data.new_stories && data.new_stories.length > 0) {
        htmlContent += `<p style="margin-top: 15px; font-weight: bold; color: #333;">รายละเอียดสตอรี่ใหม่:</p>`;
        data.new_stories.forEach((story, storyIndex) => {
          const typeClass = story.media_type === 'รูปภาพ' ? 'type-image' : 'type-video';
          htmlContent += `
            <div class="story-item">
              <div style="margin-bottom: 8px;">
                <span class="story-type ${typeClass}">${story.media_type}</span>
                <span style="background: #dc3545; color: white; padding: 2px 6px; border-radius: 3px; font-size: 10px; margin-left: 8px;">ใหม่</span>
                ${story.duration ? `<span style="margin-left: 8px; color: #666; font-size: 12px;">⏱️ ${story.duration}s</span>` : ''}
              </div>
              <p style="margin: 5px 0; font-size: 13px;"><strong>เวลาที่โพสต์:</strong> ${story.taken_at}</p>
              ${story.url ? `<p style="margin: 5px 0; font-size: 13px;"><strong>ลิงก์:</strong> <a href="${story.url}" target="_blank">ดูสตอรี่</a></p>` : ''}
            </div>
          `;
        });
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
    
    // สร้าง plain text version
    let textContent = `\n==== รายงานสตอรี่ใหม่ ====\n\n`;
    textContent += `ตรวจสอบทั้งหมด: ${storiesData.length} บัญชี\n`;
    textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
    
    storiesData.forEach((data, index) => {
      textContent += `${index + 1}. @${data.username}\n`;
      textContent += `   • ชื่อ: ${data.full_name || 'ไม่ระบุ'}\n`;
      textContent += `   • สถานะ: ${data.new_story_count > 0 ? `มีสตอรี่ใหม่ ${data.new_story_count} รายการ` : 'ไม่มีสตอรี่ใหม่'}\n`;
      textContent += `   • จำนวนสตอรี่ใหม่: ${data.new_story_count} รายการ\n`;
      
      if (data.new_story_count > 0 && data.new_stories && data.new_stories.length > 0) {
        textContent += `   • รายละเอียดสตอรี่ใหม่:\n`;
        data.new_stories.forEach((story, storyIndex) => {
          textContent += `     ${storyIndex + 1}. ${story.media_type} [ใหม่]\n`;
          textContent += `        เวลาที่โพสต์: ${story.taken_at}\n`;
          if (story.duration) textContent += `        ความยาว: ${story.duration} วินาที\n`;
        });
      }
      textContent += `\n`;
    });
    
    textContent += `ขอบคุณที่ใช้บริการ IG Story Checker\n`;
    
    await transporter.sendMail({
      from: `IG Story Checker <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });
    
  } catch (e) {
    console.error('Send bulk stories email error:', e);
    throw e;
  }
}

function normalizePicUrl(url) {
  if (!url) return null;
  try {
    const uri = new URL(url);
    return uri.origin + uri.pathname;
  } catch (e) {
    return url;
  }
}

// Endpoint ดูสถานะการลบข้อมูล
router.get('/cleanup-status', (req, res) => {
  try {
    const status = getCleanupStatus();
    const logs = getCleanupLogs();
    const currentTime = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
    
    res.json({
      status: 'success',
      data: {
        current_time: currentTime,
        status: status,
        recent_logs: logs.slice(-10) // แสดง log 10 รายการล่าสุด
      }
    });
  } catch (error) {
    console.error('Error getting cleanup status:', error);
    res.status(500).json({ error: 'Internal error: ' + error.message });
  }
});

module.exports = router; 