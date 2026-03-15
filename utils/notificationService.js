import emailjs from '@emailjs/nodejs';

const NOTIFICATION_RECIPIENTS = [
  'ranita@wareongo.com',
];

const RATE_LIMIT_CONFIG = {
  MONTHLY_LIMIT: 200,
  DAILY_LIMIT: 10,
  HOURLY_LIMIT: 5
};

class NotificationService {
  constructor() {
    this.serviceId = process.env.EMAILJS_SERVICE_ID;
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY;
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY;
    this.templateId = process.env.EMAILJS_TEMPLATE_ID;

    this.emailCounts = {
      monthly: { count: 0, resetDate: this.getNextMonthReset() },
      daily: { count: 0, resetDate: this.getNextDayReset() },
      hourly: { count: 0, resetDate: this.getNextHourReset() }
    };

    this.loadEmailCounts();
  }

  getNextMonthReset() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  getNextDayReset() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  getNextHourReset() {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return nextHour;
  }

  loadEmailCounts() {
    const now = new Date();

    if (now >= this.emailCounts.monthly.resetDate) {
      this.emailCounts.monthly = { count: 0, resetDate: this.getNextMonthReset() };
    }

    if (now >= this.emailCounts.daily.resetDate) {
      this.emailCounts.daily = { count: 0, resetDate: this.getNextDayReset() };
    }

    if (now >= this.emailCounts.hourly.resetDate) {
      this.emailCounts.hourly = { count: 0, resetDate: this.getNextHourReset() };
    }
  }

  checkRateLimit() {
    this.loadEmailCounts();

    const limits = [
      { type: 'monthly', current: this.emailCounts.monthly.count, limit: RATE_LIMIT_CONFIG.MONTHLY_LIMIT },
      { type: 'daily', current: this.emailCounts.daily.count, limit: RATE_LIMIT_CONFIG.DAILY_LIMIT },
      { type: 'hourly', current: this.emailCounts.hourly.count, limit: RATE_LIMIT_CONFIG.HOURLY_LIMIT }
    ];

    for (const limitCheck of limits) {
      if (limitCheck.current >= limitCheck.limit) {
        return {
          allowed: false,
          reason: `${limitCheck.type} limit exceeded`,
          current: limitCheck.current,
          limit: limitCheck.limit,
          resetDate: this.emailCounts[limitCheck.type].resetDate
        };
      }
    }

    return { allowed: true };
  }

  incrementEmailCounts() {
    this.emailCounts.monthly.count++;
    this.emailCounts.daily.count++;
    this.emailCounts.hourly.count++;
  }

  formatEnquiryEmail(enquiryData) {
    const subject = `New Enquiry - ID: ${enquiryData.id}`;
    const message = `
NEW ENQUIRY RECEIVED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           ${enquiryData.name || 'N/A'}
Phone:          ${enquiryData.phoneNumber || 'N/A'}
Email:          ${enquiryData.email || 'Not provided'}
Source:         ${enquiryData.source || 'N/A'}

RECORD INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record ID:      ${enquiryData.id || 'N/A'}
Date/Time:      ${enquiryData.createdat ? new Date(enquiryData.createdat).toLocaleString() : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This notification was sent to: ${NOTIFICATION_RECIPIENTS.join(', ')}

Powered by WareOnGo Notification System
    `.trim();

    return {
      subject: subject,
      message: message,
      email: enquiryData.email || 'noreply@wareongo.com'
    };
  }

  formatCustomerRequestEmail(requestData) {
    const subject = `New Customer Request - ID: ${requestData.id}`;
    const message = `
NEW CUSTOMER REQUEST RECEIVED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           ${requestData.full_name || 'N/A'}
Phone:          ${requestData.phone_number || 'N/A'}
Company:        ${requestData.company_name || 'N/A'}
Location:       ${requestData.preferred_location || 'N/A'}

ADDITIONAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

${requestData.additional_requirements || 'None specified'}

RECORD INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record ID:      ${requestData.id || 'N/A'}
Date/Time:      ${requestData.created_at ? new Date(requestData.created_at).toLocaleString() : 'N/A'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This notification was sent to: ${NOTIFICATION_RECIPIENTS.join(', ')}

Powered by WareOnGo Notification System
    `.trim();

    return {
      subject: subject,
      message: message,
      email: 'noreply@wareongo.com'
    };
  }

  async sendEmail(emailData, notificationType = 'unknown') {
    try {
      const rateLimitCheck = this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        console.warn(`Rate limit exceeded: ${rateLimitCheck.reason}`);
        return {
          success: false,
          error: `Rate limit exceeded: ${rateLimitCheck.reason}`,
          rateLimited: true,
          resetDate: rateLimitCheck.resetDate
        };
      }

      if (!this.serviceId || !this.publicKey || !this.privateKey || !this.templateId) {
        const error = 'EmailJS configuration is incomplete. Check environment variables.';
        console.error('Email sending failed - configuration error:', error);
        throw new Error(error);
      }

      const results = [];
      let allSuccessful = true;
      let lastError = null;

      for (const recipient of NOTIFICATION_RECIPIENTS) {
        try {
          const recipientEmailData = {
            ...emailData,
            to_email: recipient
          };

          const response = await emailjs.send(
            this.serviceId,
            this.templateId,
            recipientEmailData,
            {
              publicKey: this.publicKey,
              privateKey: this.privateKey,
            }
          );

          this.incrementEmailCounts();

          results.push({
            recipient,
            success: true,
            status: response.status
          });

          console.log(`Email sent successfully to ${recipient}`);

        } catch (recipientError) {
          allSuccessful = false;
          lastError = recipientError;

          results.push({
            recipient,
            success: false,
            error: recipientError.message || recipientError.text || 'Unknown error'
          });

          console.error(`Email sending failed for ${recipient}:`, recipientError.message);
        }
      }

      if (allSuccessful) {
        return {
          success: true,
          results,
          recipientCount: NOTIFICATION_RECIPIENTS.length
        };
      } else {
        const successCount = results.filter(r => r.success).length;
        return {
          success: successCount > 0,
          partialSuccess: true,
          results,
          error: lastError ? (lastError.message || lastError.text || 'Some emails failed') : 'Some emails failed'
        };
      }
    } catch (error) {
      console.error('Email sending failed completely:', error.message);
      return { success: false, error: error.message || error.text || 'Unknown error' };
    }
  }

  async sendEnquiryNotification(enquiryData) {
    try {
      const emailData = this.formatEnquiryEmail(enquiryData);
      const result = await this.sendEmail(emailData, 'enquiry');

      if (result.success) {
        console.log(`Enquiry notification sent successfully for ID ${enquiryData.id}`);
      } else {
        console.error(`Enquiry notification failed for ID ${enquiryData.id}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error(`Unexpected error in enquiry notification for ID ${enquiryData.id}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async sendCustomerRequestNotification(requestData) {
    try {
      const emailData = this.formatCustomerRequestEmail(requestData);
      const result = await this.sendEmail(emailData, 'customer_request');

      if (result.success) {
        console.log(`Customer request notification sent successfully for ID ${requestData.id}`);
      } else {
        console.error(`Customer request notification failed for ID ${requestData.id}:`, result.error);
      }

      return result;
    } catch (error) {
      console.error(`Unexpected error in customer request notification for ID ${requestData.id}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  getRecipients() {
    return [...NOTIFICATION_RECIPIENTS];
  }

  validateConfiguration() {
    const missing = [];

    if (!this.serviceId) missing.push('EMAILJS_SERVICE_ID');
    if (!this.publicKey) missing.push('EMAILJS_PUBLIC_KEY');
    if (!this.privateKey) missing.push('EMAILJS_PRIVATE_KEY');
    if (!this.templateId) missing.push('EMAILJS_TEMPLATE_ID');

    return {
      isValid: missing.length === 0,
      missingVariables: missing,
      recipients: NOTIFICATION_RECIPIENTS.length
    };
  }

  getRateLimitStatus() {
    this.loadEmailCounts();

    return {
      monthly: {
        current: this.emailCounts.monthly.count,
        limit: RATE_LIMIT_CONFIG.MONTHLY_LIMIT,
        remaining: RATE_LIMIT_CONFIG.MONTHLY_LIMIT - this.emailCounts.monthly.count,
        resetDate: this.emailCounts.monthly.resetDate,
        percentUsed: Math.round((this.emailCounts.monthly.count / RATE_LIMIT_CONFIG.MONTHLY_LIMIT) * 100)
      },
      daily: {
        current: this.emailCounts.daily.count,
        limit: RATE_LIMIT_CONFIG.DAILY_LIMIT,
        remaining: RATE_LIMIT_CONFIG.DAILY_LIMIT - this.emailCounts.daily.count,
        resetDate: this.emailCounts.daily.resetDate,
        percentUsed: Math.round((this.emailCounts.daily.count / RATE_LIMIT_CONFIG.DAILY_LIMIT) * 100)
      },
      hourly: {
        current: this.emailCounts.hourly.count,
        limit: RATE_LIMIT_CONFIG.HOURLY_LIMIT,
        remaining: RATE_LIMIT_CONFIG.HOURLY_LIMIT - this.emailCounts.hourly.count,
        resetDate: this.emailCounts.hourly.resetDate,
        percentUsed: Math.round((this.emailCounts.hourly.count / RATE_LIMIT_CONFIG.HOURLY_LIMIT) * 100)
      }
    };
  }
}

export default new NotificationService();