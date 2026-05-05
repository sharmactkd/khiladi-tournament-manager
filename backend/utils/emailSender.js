import nodemailer from "nodemailer";
import logger from "./logger.js";

const getTransporter = () => {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP configuration is incomplete");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });
};

const sendEmail = async ({ to, subject, html, text }) => {
  if (!to) {
    throw new Error("Email recipient is required");
  }

  if (!subject) {
    throw new Error("Email subject is required");
  }

  const transporter = getTransporter();

  const from =
    process.env.SMTP_FROM ||
    process.env.EMAIL_FROM ||
    "KHILADI Tournament Manager <no-reply@khiladi-khoj.com>";

  try {
    const info = await transporter.sendMail({
      from,
      to,
      subject,
      html,
      text,
    });

    logger.info("Email sent successfully", {
      to,
      subject,
      messageId: info.messageId,
    });

    return info;
  } catch (error) {
    logger.error("Email sending failed", {
      to,
      subject,
      error: error.message,
    });

    throw error;
  }
};

export default sendEmail;