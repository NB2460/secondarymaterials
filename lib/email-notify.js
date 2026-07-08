/**
 * lib/email-notify — sends email notifications via SMTP.
 * Used only from background jobs; never throws.
 */
const nodemailer = require('nodemailer');

let transporter;

function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      },
      secure: parseInt(process.env.SMTP_PORT || '587', 10) === 465
    });
  }
  return transporter;
}

async function sendEmail({ to, subject, text }) {
  try {
    const transport = getTransporter();
    if (!transport.options.host) {
      console.warn('[email-notify] SMTP_HOST not configured — skipping email');
      return;
    }
    await transport.sendMail({
      from: process.env.SMTP_FROM || 'wastetideos@polsia.app',
      to,
      subject,
      text
    });
    console.log(`[email-notify] sent: ${subject} → ${to}`);
  } catch (err) {
    console.error('[email-notify] failed:', err.message);
  }
}

module.exports = { sendEmail };