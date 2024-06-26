import nodemailer from "nodemailer";
import { asyncHandler } from "../../middlewares/asyncHandler.js";

export const sendEmail = asyncHandler(
  async ({ to, subject, html  }) => {
    const transport = nodemailer.createTransport({
      host: "localhost",
      port: 465,
      secure: true,
      service: "gmail",
      auth: {
        user: process.env.EMAIL_NAME,
        pass: process.env.EMAIL_PASS,
      },
    });
    const info = await transport.sendMail({
      from: `"Eng. REHAM EID <${process.env.EMAIL_NAME}> "`,
      to,
      subject,
      html,
    });
    console.log("Message sent: %s ", info.messageId);
    
    return info.accepted.length ? true :false
  }
);
