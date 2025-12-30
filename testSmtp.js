import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const testSmtp = async () => {
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });

  const testEmail = 'leqetgym@gmail.com';  
  const otp = Math.floor(100000 + Math.random() * 900000);

  try {
    console.log('🔍 Testing SMTP connection...');
    await transporter.verify();
    console.log('✅ SMTP server is ready to take our messages');

    console.log('✉️ Sending test email...');
    const info = await transporter.sendMail({
      from: `"Leqet Gym" <${process.env.FROM_EMAIL}>`,
      to: testEmail,
      subject: 'Test Email from Leqet Gym',
      text: `Your test OTP is: ${otp}`,
      html: `
        <h2>Leqet Gym Test Email</h2>
        <p>This is a test email sent from the Leqet Gym application.</p>
        <p>Your test OTP is: <strong>${otp}</strong></p>
      `
    });

    console.log('✅ Test email sent successfully!');
    console.log('📫 Message ID:', info.messageId);
    console.log('👀 Check your email at:', testEmail);
  } catch (error) {
    console.error('❌ Error sending test email:');
    console.error(error.response || error.message);
  }
};

testSmtp();
