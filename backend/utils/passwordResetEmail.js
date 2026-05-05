export const getPasswordResetEmailHtml = ({ name, resetUrl, expiresInMinutes = 15 }) => {
  const safeName = name || "KHILADI User";

  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Reset Your Password</title>
      </head>
      <body style="margin:0;padding:0;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f6f8;padding:30px 12px;">
          <tr>
            <td align="center">
              <table width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
                <tr>
                  <td style="background:#0f172a;padding:26px 30px;text-align:center;">
                    <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:1px;">KHILADI</h1>
                    <p style="margin:8px 0 0;color:#cbd5e1;font-size:14px;">Tournament Manager</p>
                  </td>
                </tr>

                <tr>
                  <td style="padding:32px 30px;">
                    <h2 style="margin:0 0 16px;color:#111827;font-size:22px;">Reset Your Password</h2>

                    <p style="margin:0 0 16px;line-height:1.6;font-size:15px;">
                      Hello ${safeName},
                    </p>

                    <p style="margin:0 0 22px;line-height:1.6;font-size:15px;">
                      We received a request to reset your KHILADI account password. Click the button below to create a new password.
                    </p>

                    <div style="text-align:center;margin:30px 0;">
                      <a href="${resetUrl}" target="_blank" rel="noopener noreferrer"
                        style="display:inline-block;background:#dc2626;color:#ffffff;text-decoration:none;padding:14px 26px;border-radius:10px;font-weight:bold;font-size:15px;">
                        Reset Password
                      </a>
                    </div>

                    <p style="margin:0 0 16px;line-height:1.6;font-size:14px;color:#4b5563;">
                      This link will expire in ${expiresInMinutes} minutes for security reasons.
                    </p>

                    <p style="margin:0 0 16px;line-height:1.6;font-size:14px;color:#4b5563;">
                      If you did not request this password reset, you can safely ignore this email. Your password will not be changed.
                    </p>

                    <div style="margin-top:24px;padding:14px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;">
                      <p style="margin:0 0 8px;font-size:13px;color:#6b7280;">
                        If the button does not work, copy and paste this link into your browser:
                      </p>
                      <p style="margin:0;font-size:13px;line-height:1.5;word-break:break-all;color:#2563eb;">
                        ${resetUrl}
                      </p>
                    </div>
                  </td>
                </tr>

                <tr>
                  <td style="padding:20px 30px;background:#f9fafb;text-align:center;border-top:1px solid #e5e7eb;">
                    <p style="margin:0;color:#6b7280;font-size:12px;">
                      © ${new Date().getFullYear()} KHILADI Tournament Manager. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

export const getPasswordResetEmailText = ({ name, resetUrl, expiresInMinutes = 15 }) => {
  const safeName = name || "KHILADI User";

  return `
Hello ${safeName},

We received a request to reset your KHILADI account password.

Reset your password using this link:
${resetUrl}

This link will expire in ${expiresInMinutes} minutes.

If you did not request this password reset, you can safely ignore this email.

KHILADI Tournament Manager
  `.trim();
};