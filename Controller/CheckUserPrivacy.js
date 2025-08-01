const sessionManager = require('./SessionManager');
const nodemailer = require('nodemailer');
require('dotenv').config();

async function checkUserPrivacy(username) {
  try {
    // ใช้ SessionManager พร้อม retry mechanism
    return await sessionManager.executeWithRetry(async (ig) => {
      const user = await ig.user.info(await ig.user.getIdByUsername(username));
      return {
        username: user.username,
        is_private: user.is_private,
        full_name: user.full_name,
        profile_pic_url: user.profile_pic_url,
        banned: false
      };
    });
  } catch (e) {
    // ตรวจจับ error ที่อาจโดนแบน
    const msg = (e && e.message) ? e.message.toLowerCase() : '';
    const banKeywords = [
      'checkpoint',
      'login required',
      'spam',
      'feedback_required',
      'challenge',
      'temporarily blocked',
      'suspended',
      'disabled',
      'bad password',
      'rate limit'
    ];
    const isBan = banKeywords.some(k => msg.includes(k));
    if (isBan) {
      // ส่งอีเมลแจ้งเตือนโดนแบน
      await sendBanAlert(username, msg);
    }
    return { username, banned: isBan, error: msg };
  }
}

async function sendEmail(username, info, email, isProfilePicChanged, isNotification = false, changes = null) {
  try {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  if (!email) return; // ถ้าไม่มี email ไม่ต้องส่ง
    
  const now = new Date();
  const type = info.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
    const statusColor = info.is_private ? '#dc3545' : '#28a745';
    const statusIcon = info.is_private ? '🔒' : '🌐';
    
    // กำหนด subject และ text ตามประเภทการแจ้งเตือน
    let subject, textContent;
    
    if (changes) {
      // การแจ้งเตือนการเปลี่ยนแปลง
      subject = `[แจ้งเตือนการเปลี่ยนแปลง] บัญชี @${info.username}`;
      textContent = `\n==== แจ้งเตือนการเปลี่ยนแปลงบัญชี Instagram ====\n\n`;
      textContent += `Username: @${info.username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สถานะปัจจุบัน: ${type}\n`;
      textContent += `การเปลี่ยนแปลง:\n${changes}`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติเมื่อตรวจพบการเปลี่ยนแปลง\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
    } else if (isNotification) {
      // การแจ้งเตือนแบบ scheduled
      subject = `[แจ้งเตือนอัตโนมัติ] สถานะ Privacy: @${info.username}`;
      textContent = `\n==== แจ้งเตือนอัตโนมัติ - สถานะบัญชี Instagram ====\n\n`;
      textContent += `Username: @${info.username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สถานะ: ${type}\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `นี่เป็นการแจ้งเตือนอัตโนมัติตามเวลาที่คุณตั้งไว้\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
    } else {
      // การแจ้งเตือนแบบปกติ
      subject = `แจ้งเตือน IG: @${info.username} (${info.full_name})`;
  let profilePicText = '';
  if (typeof isProfilePicChanged === 'boolean') {
    profilePicText = isProfilePicChanged ? 'ไม่มีการเปลี่ยนแปลงรูปโปรไฟล์' : 'มีการเปลี่ยนแปลงรูปโปรไฟล์';
  }
      textContent = `\n==== รายงานสถานะบัญชี Instagram ====\n\n`;
      textContent += `Username: @${info.username}\n`;
      textContent += `ชื่อ: ${info.full_name}\n`;
      textContent += `สถานะ: ${type}\n`;
      if (profilePicText) textContent += `${profilePicText}\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
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
          .account-info { background: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 25px; border-left: 4px solid #667eea; }
          .status-badge { display: inline-block; padding: 8px 16px; border-radius: 20px; font-weight: bold; font-size: 14px; margin: 10px 0; }
          .status-private { background: #f8d7da; color: #721c24; border: 1px solid #f5c6cb; }
          .status-public { background: #d4edda; color: #155724; border: 1px solid #c3e6cb; }
          .profile-pic { width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin: 10px 0; border: 3px solid #667eea; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-top: 1px solid #e9ecef; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔍 แจ้งเตือนสถานะบัญชี</h1>
          </div>
          <div class="content">
            <div class="account-info">
              <h3>📋 ข้อมูลบัญชี</h3>
              <p><strong>Username:</strong> @${info.username}</p>
              <p><strong>ชื่อ:</strong> ${info.full_name}</p>
              <p><strong>สถานะ:</strong> <span class="status-badge ${info.is_private ? 'status-private' : 'status-public'}">${statusIcon} ${type}</span></p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            ${info.profile_pic_url ? `
            <div style="text-align: center; margin: 20px 0;">
              <h3 style="color: #333; margin-bottom: 15px;">📸 รูปโปรไฟล์</h3>
              <img src="${info.profile_pic_url}" alt="Profile Picture" class="profile-pic" onerror="this.style.display='none'">
            </div>
            ` : ''}
            
            ${changes ? `
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="color: #856404; margin-top: 0;">⚠️ การเปลี่ยนแปลงที่ตรวจพบ</h3>
              <p style="color: #856404; margin-bottom: 0;">${changes}</p>
            </div>
            ` : ''}
            
            ${typeof isProfilePicChanged === 'boolean' ? `
            <div style="background: ${isProfilePicChanged ? '#d4edda' : '#f8d7da'}; border: 1px solid ${isProfilePicChanged ? '#c3e6cb' : '#f5c6cb'}; border-radius: 8px; padding: 15px; margin: 20px 0;">
              <h3 style="color: ${isProfilePicChanged ? '#155724' : '#721c24'}; margin-top: 0;">${isProfilePicChanged ? '✅' : '🔄'} รูปโปรไฟล์</h3>
              <p style="color: ${isProfilePicChanged ? '#155724' : '#721c24'}; margin-bottom: 0;">${isProfilePicChanged ? 'ไม่มีการเปลี่ยนแปลงรูปโปรไฟล์' : 'มีการเปลี่ยนแปลงรูปโปรไฟล์'}</p>
            </div>
            ` : ''}
          </div>
          <div class="footer">
            <p>ขอบคุณที่ใช้บริการ IG Privacy Checker</p>
            <p style="font-size: 12px; margin-top: 10px;">📧 ส่งโดยระบบอัตโนมัติ</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
  await transporter.sendMail({
      from: `IG Privacy Checker <${process.env.EMAIL_USER}>`,
    to: email,
    subject,
      text: textContent,
      html: htmlContent
  });
    
    console.log(`   📧 อีเมล Privacy ส่งสำเร็จไปยัง ${email}`);
  } catch (error) {
    console.log(`   ❌ Error ส่งอีเมล Privacy: ${error.message}`);
    throw error;
  }
}

// ส่งอีเมลแจ้งเตือนโดนแบน
async function sendBanAlert(username, msg) {
  let transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });
  const now = new Date();
  const subject = `แจ้งเตือน IG API อาจโดนแบน: @${username}`;
  const text = `\n==== แจ้งเตือน IG API อาจโดนแบน ====
\n• Username: @${username}
• เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}
• ข้อความ error: ${msg}
\nโปรดตรวจสอบบัญชีและเปลี่ยนรหัสผ่านหรือยืนยันตัวตนในแอป Instagram\n`;
  await transporter.sendMail({
    from: `IG Checker <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_USER,
    subject,
    text
  });
}

// ฟังก์ชันส่งอีเมลรวมหลาย username
async function sendBulkEmail(usersData, email, isNotification = false, changes = null) {
  try {
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
      subject = `[แจ้งเตือนการเปลี่ยนแปลง] บัญชี ${usersData.length} รายการ`;
      textContent = `\n==== แจ้งเตือนการเปลี่ยนแปลงบัญชี Instagram ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `การเปลี่ยนแปลง:\n${changes}\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดบัญชี:\n`;
      usersData.forEach((user, index) => {
        const type = user.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - ${type}\n`;
      });
      textContent += `\nนี่เป็นการแจ้งเตือนอัตโนมัติเมื่อตรวจพบการเปลี่ยนแปลง\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
    } else if (isNotification) {
      // การแจ้งเตือนแบบ scheduled
      subject = `[แจ้งเตือนอัตโนมัติ] สถานะ Privacy: ${usersData.length} บัญชี`;
      textContent = `\n==== แจ้งเตือนอัตโนมัติ - สถานะบัญชี Instagram ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดบัญชี:\n`;
      usersData.forEach((user, index) => {
        const type = user.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - ${type}\n`;
      });
      textContent += `\nนี่เป็นการแจ้งเตือนอัตโนมัติตามเวลาที่คุณตั้งไว้\n`;
      textContent += `ขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
    } else {
      // การแจ้งเตือนแบบปกติ
      subject = `แจ้งเตือน IG: ${usersData.length} บัญชี`;
      textContent = `\n==== รายงานสถานะบัญชี Instagram ====\n\n`;
      textContent += `จำนวนบัญชี: ${usersData.length} รายการ\n`;
      textContent += `เวลาตรวจสอบ: ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
      textContent += `รายละเอียดบัญชี:\n`;
      usersData.forEach((user, index) => {
        const type = user.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
        textContent += `${index + 1}. @${user.username} (${user.full_name}) - ${type}\n`;
      });
      textContent += `\nขอบคุณที่ใช้บริการ IG Privacy Checker\n`;
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
          .status-private { color: #dc3545; font-weight: bold; }
          .status-public { color: #28a745; font-weight: bold; }
          .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; border-top: 1px solid #e9ecef; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔒 แจ้งเตือนสถานะ Privacy</h1>
          </div>
          <div class="content">
            <div class="summary">
              <h3>📋 สรุปข้อมูล</h3>
              <p><strong>จำนวนบัญชี:</strong> ${usersData.length} รายการ</p>
              <p><strong>เวลาตรวจสอบ:</strong> ${now.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</p>
            </div>
            
            <h3 style="color: #333; margin-bottom: 20px;">👥 รายละเอียดบัญชี</h3>
    `;

    usersData.forEach((user, index) => {
      const type = user.is_private ? 'ส่วนตัว (Private)' : 'สาธารณะ (Public)';
      const statusClass = user.is_private ? 'status-private' : 'status-public';
      const statusIcon = user.is_private ? '🔒' : '🌐';
      
      htmlContent += `
        <div class="user-item">
          <h4 style="margin: 0 0 10px 0;">${index + 1}. @${user.username}</h4>
          <p><strong>ชื่อ:</strong> ${user.full_name}</p>
          <p><strong>สถานะ:</strong> <span class="${statusClass}">${statusIcon} ${type}</span></p>
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

    await transporter.sendMail({
      from: `IG Privacy Checker <${process.env.EMAIL_USER}>`,
      to: email,
      subject,
      text: textContent,
      html: htmlContent
    });

    console.log(`📧 ส่งอีเมลรวม ${usersData.length} บัญชีไปยัง ${email}`);
  } catch (error) {
    console.error('Send bulk email error:', error);
    throw error;
  }
}

module.exports = { checkUserPrivacy, sendEmail, sendBulkEmail }; 