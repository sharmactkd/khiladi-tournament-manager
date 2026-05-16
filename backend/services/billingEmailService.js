//D:\Khiladi\backend\services\billingEmailService.js

import sendEmail from "../utils/emailSender.js";
import logger from "../utils/logger.js";

export const sendBillingInvoiceEmail = async ({
  user,
  invoice,
} = {}) => {
  try {
    if (!user?.email) {
      return;
    }

    const subject = `KHILADI Invoice - ${invoice.invoiceNumber}`;

    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 700px; margin: auto;">
        <h2>KHILADI Billing Invoice</h2>

        <p>Hello ${user.name || "User"},</p>

        <p>Your billing invoice has been generated successfully.</p>

        <table style="border-collapse: collapse; width: 100%;">
          <tr>
            <td><strong>Invoice Number</strong></td>
            <td>${invoice.invoiceNumber}</td>
          </tr>

          <tr>
            <td><strong>Invoice Type</strong></td>
            <td>${invoice.invoiceType}</td>
          </tr>

          <tr>
            <td><strong>Plan</strong></td>
            <td>${invoice.planType || "-"}</td>
          </tr>

          <tr>
            <td><strong>Amount</strong></td>
            <td>${invoice.amount} ${invoice.currency}</td>
          </tr>

          <tr>
            <td><strong>Gateway</strong></td>
            <td>${invoice.paymentGateway || "-"}</td>
          </tr>

          <tr>
            <td><strong>Issued At</strong></td>
            <td>${new Date(invoice.issuedAt).toLocaleString()}</td>
          </tr>
        </table>

        <br />

        <p>Thank you for using KHILADI.</p>
      </div>
    `;

    await sendEmail({
      to: user.email,
      subject,
      html,
    });

    logger.info("Billing invoice email sent", {
      invoiceId: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      userId: user._id,
      email: user.email,
    });
  } catch (error) {
    logger.error("Billing invoice email failed", {
      error: error.message,
      stack: error.stack,
      invoiceId: invoice?._id,
      userId: user?._id,
    });
  }
};

export default sendBillingInvoiceEmail;