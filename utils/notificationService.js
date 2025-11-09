import emailjs from '@emailjs/nodejs';

// Hardcoded recipient list configuration
const NOTIFICATION_RECIPIENTS = [
  'ranita@wareongo.com',
  'Dhaval@wareongo.com'
  // Add more emails as needed
];

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  MONTHLY_LIMIT: 200, // EmailJS free tier limit
  DAILY_LIMIT: 10,    // Conservative daily limit to prevent quota exhaustion
  HOURLY_LIMIT: 5     // Conservative hourly limit
};

/**
 * Notification Service for handling email notifications
 * Integrates with EmailJS to send formatted notifications for enquiries and customer requests
 */
class NotificationService {
  constructor() {
    this.serviceId = process.env.EMAILJS_SERVICE_ID;
    this.publicKey = process.env.EMAILJS_PUBLIC_KEY;
    this.privateKey = process.env.EMAILJS_PRIVATE_KEY;
    this.templateId = process.env.EMAILJS_TEMPLATE_ID;

    // Rate limiting tracking
    this.emailCounts = {
      monthly: { count: 0, resetDate: this.getNextMonthReset() },
      daily: { count: 0, resetDate: this.getNextDayReset() },
      hourly: { count: 0, resetDate: this.getNextHourReset() }
    };

    // Load persisted counts if available
    this.loadEmailCounts();
  }

  /**
   * Get next month reset date (1st of next month)
   * @returns {Date} Next month reset date
   */
  getNextMonthReset() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  /**
   * Get next day reset date (midnight tomorrow)
   * @returns {Date} Next day reset date
   */
  getNextDayReset() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);
    return tomorrow;
  }

  /**
   * Get next hour reset date
   * @returns {Date} Next hour reset date
   */
  getNextHourReset() {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    return nextHour;
  }

  /**
   * Load email counts from environment or reset if needed
   */
  loadEmailCounts() {
    const now = new Date();

    // Reset counts if reset dates have passed
    if (now >= this.emailCounts.monthly.resetDate) {
      this.emailCounts.monthly = { count: 0, resetDate: this.getNextMonthReset() };
      this.logRateLimitReset('monthly');
    }

    if (now >= this.emailCounts.daily.resetDate) {
      this.emailCounts.daily = { count: 0, resetDate: this.getNextDayReset() };
      this.logRateLimitReset('daily');
    }

    if (now >= this.emailCounts.hourly.resetDate) {
      this.emailCounts.hourly = { count: 0, resetDate: this.getNextHourReset() };
      this.logRateLimitReset('hourly');
    }
  }

  /**
   * Check if rate limits allow sending email
   * @returns {Object} Rate limit check result
   */
  checkRateLimit() {
    this.loadEmailCounts(); // Refresh counts and reset if needed

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

  /**
   * Increment email counts for rate limiting
   */
  incrementEmailCounts() {
    this.emailCounts.monthly.count++;
    this.emailCounts.daily.count++;
    this.emailCounts.hourly.count++;

    this.logRateLimitStatus();
  }

  /**
   * Log comprehensive email delivery information
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {Object} data - Additional data to log
   */
  logEmail(level, message, data = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level: level.toUpperCase(),
      service: 'NotificationService',
      message,
      ...data
    };

    const logMessage = `[${timestamp}] [${level.toUpperCase()}] NotificationService: ${message}`;

    switch (level) {
      case 'error':
        console.error(logMessage, data);
        break;
      case 'warn':
        console.warn(logMessage, data);
        break;
      case 'info':
      default:
        console.log(logMessage, data);
        break;
    }
  }

  /**
   * Log rate limit status
   */
  logRateLimitStatus() {
    this.logEmail('info', 'Rate limit status', {
      monthly: `${this.emailCounts.monthly.count}/${RATE_LIMIT_CONFIG.MONTHLY_LIMIT}`,
      daily: `${this.emailCounts.daily.count}/${RATE_LIMIT_CONFIG.DAILY_LIMIT}`,
      hourly: `${this.emailCounts.hourly.count}/${RATE_LIMIT_CONFIG.HOURLY_LIMIT}`,
      monthlyResetDate: this.emailCounts.monthly.resetDate.toISOString(),
      dailyResetDate: this.emailCounts.daily.resetDate.toISOString(),
      hourlyResetDate: this.emailCounts.hourly.resetDate.toISOString()
    });
  }

  /**
   * Log rate limit reset
   * @param {string} type - Type of reset (monthly, daily, hourly)
   */
  logRateLimitReset(type) {
    this.logEmail('info', `Rate limit reset: ${type}`, {
      resetType: type,
      newResetDate: this.emailCounts[type].resetDate.toISOString()
    });
  }

  /**
   * Log rate limit exceeded
   * @param {Object} rateLimitResult - Rate limit check result
   */
  logRateLimitExceeded(rateLimitResult) {
    this.logEmail('warn', 'Email sending blocked due to rate limit', {
      reason: rateLimitResult.reason,
      current: rateLimitResult.current,
      limit: rateLimitResult.limit,
      resetDate: rateLimitResult.resetDate.toISOString()
    });
  }

  /**
   * Format enquiry data as plain text email
   * @param {Object} enquiryData - The enquiry data from database
   * @returns {Object} Email data with subject and message
   */
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

  /**
   * Format customer request data as plain text email
   * @param {Object} requestData - The customer request data from database
   * @returns {Object} Email data with subject and message
   */
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

  /**
   * Generic email sending method using EmailJS - sends to all recipients
   * @param {Object} emailData - Email data with subject, message, email
   * @param {string} notificationType - Type of notification for logging
   * @returns {Promise<Object>} EmailJS response
   */
  async sendEmail(emailData, notificationType = 'unknown') {
    const startTime = Date.now();

    try {
      // Check rate limits first
      const rateLimitCheck = this.checkRateLimit();
      if (!rateLimitCheck.allowed) {
        this.logRateLimitExceeded(rateLimitCheck);
        return {
          success: false,
          error: `Rate limit exceeded: ${rateLimitCheck.reason}`,
          rateLimited: true,
          resetDate: rateLimitCheck.resetDate
        };
      }

      // Validate configuration
      if (!this.serviceId || !this.publicKey || !this.privateKey || !this.templateId) {
        const error = 'EmailJS configuration is incomplete. Check environment variables.';
        this.logEmail('error', 'Email sending failed - configuration error', {
          notificationType,
          error,
          missingConfig: this.validateConfiguration().missingVariables
        });
        throw new Error(error);
      }

      this.logEmail('info', 'Attempting to send emails to multiple recipients', {
        notificationType,
        recipientCount: NOTIFICATION_RECIPIENTS.length,
        recipients: NOTIFICATION_RECIPIENTS,
        subject: emailData.subject
      });

      // Send email to each recipient individually
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

          // Increment rate limit counters on successful send
          this.incrementEmailCounts();

          results.push({
            recipient,
            success: true,
            status: response.status
          });

          this.logEmail('info', 'Email sent successfully to recipient', {
            notificationType,
            recipient,
            responseStatus: response.status
          });

        } catch (recipientError) {
          allSuccessful = false;
          lastError = recipientError;

          results.push({
            recipient,
            success: false,
            error: recipientError.message || recipientError.text || 'Unknown error'
          });

          this.logEmail('error', 'Email sending failed for recipient', {
            notificationType,
            recipient,
            error: recipientError.message || recipientError.text || JSON.stringify(recipientError),
            errorCode: recipientError.code || recipientError.status || 'unknown'
          });
        }
      }

      const duration = Date.now() - startTime;

      if (allSuccessful) {
        this.logEmail('info', 'All emails sent successfully', {
          notificationType,
          duration: `${duration}ms`,
          recipientCount: NOTIFICATION_RECIPIENTS.length,
          subject: emailData.subject
        });

        return {
          success: true,
          results,
          duration,
          recipientCount: NOTIFICATION_RECIPIENTS.length
        };
      } else {
        const successCount = results.filter(r => r.success).length;
        this.logEmail('warn', 'Some emails failed to send', {
          notificationType,
          duration: `${duration}ms`,
          successCount,
          failureCount: NOTIFICATION_RECIPIENTS.length - successCount,
          results
        });

        // Return success if at least one email was sent
        return {
          success: successCount > 0,
          partialSuccess: true,
          results,
          duration,
          error: lastError ? (lastError.message || lastError.text || 'Some emails failed') : 'Some emails failed'
        };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      this.logEmail('error', 'Email sending failed completely', {
        notificationType,
        duration: `${duration}ms`,
        error: error.message || error.text || JSON.stringify(error),
        errorStack: error.stack,
        errorCode: error.code || error.status || 'unknown'
      });
      return { success: false, error: error.message || error.text || 'Unknown error', duration };
    }
  }

  /**
   * Send enquiry notification email
   * @param {Object} enquiryData - The enquiry data from database
   * @returns {Promise<Object>} Result of email sending operation
   */
  async sendEnquiryNotification(enquiryData) {
    const notificationType = 'enquiry';

    try {
      this.logEmail('info', 'Starting enquiry notification', {
        notificationType,
        enquiryId: enquiryData.id,
        enquiryName: enquiryData.name,
        enquirySource: enquiryData.source,
        hasEmail: !!enquiryData.email
      });

      const emailData = this.formatEnquiryEmail(enquiryData);
      const result = await this.sendEmail(emailData, notificationType);

      if (result.success) {
        this.logEmail('info', 'Enquiry notification completed successfully', {
          notificationType,
          enquiryId: enquiryData.id,
          duration: result.duration,
          responseStatus: result.response?.status
        });
      } else if (result.rateLimited) {
        this.logEmail('warn', 'Enquiry notification blocked by rate limit', {
          notificationType,
          enquiryId: enquiryData.id,
          error: result.error,
          resetDate: result.resetDate?.toISOString()
        });
      } else {
        this.logEmail('error', 'Enquiry notification failed', {
          notificationType,
          enquiryId: enquiryData.id,
          error: result.error,
          duration: result.duration
        });
      }

      return result;
    } catch (error) {
      this.logEmail('error', 'Unexpected error in enquiry notification', {
        notificationType,
        enquiryId: enquiryData.id,
        error: error.message,
        errorStack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Send customer request notification email
   * @param {Object} requestData - The customer request data from database
   * @returns {Promise<Object>} Result of email sending operation
   */
  async sendCustomerRequestNotification(requestData) {
    const notificationType = 'customer_request';

    try {
      this.logEmail('info', 'Starting customer request notification', {
        notificationType,
        requestId: requestData.id,
        fullName: requestData.full_name,
        companyName: requestData.company_name,
        preferredLocation: requestData.preferred_location
      });

      const emailData = this.formatCustomerRequestEmail(requestData);
      const result = await this.sendEmail(emailData, notificationType);

      if (result.success) {
        this.logEmail('info', 'Customer request notification completed successfully', {
          notificationType,
          requestId: requestData.id,
          duration: result.duration,
          responseStatus: result.response?.status
        });
      } else if (result.rateLimited) {
        this.logEmail('warn', 'Customer request notification blocked by rate limit', {
          notificationType,
          requestId: requestData.id,
          error: result.error,
          resetDate: result.resetDate?.toISOString()
        });
      } else {
        this.logEmail('error', 'Customer request notification failed', {
          notificationType,
          requestId: requestData.id,
          error: result.error,
          duration: result.duration
        });
      }

      return result;
    } catch (error) {
      this.logEmail('error', 'Unexpected error in customer request notification', {
        notificationType,
        requestId: requestData.id,
        error: error.message,
        errorStack: error.stack
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Get current recipient list
   * @returns {Array<string>} Array of recipient email addresses
   */
  getRecipients() {
    return [...NOTIFICATION_RECIPIENTS];
  }

  /**
   * Validate service configuration
   * @returns {Object} Configuration status
   */
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

  /**
   * Get current rate limit status
   * @returns {Object} Current rate limit information
   */
  getRateLimitStatus() {
    this.loadEmailCounts(); // Refresh counts

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

  /**
   * Reset rate limit counts (for testing or manual reset)
   * @param {string} type - Type to reset ('monthly', 'daily', 'hourly', 'all')
   */
  resetRateLimit(type = 'all') {
    if (type === 'all' || type === 'monthly') {
      this.emailCounts.monthly = { count: 0, resetDate: this.getNextMonthReset() };
      this.logRateLimitReset('monthly');
    }

    if (type === 'all' || type === 'daily') {
      this.emailCounts.daily = { count: 0, resetDate: this.getNextDayReset() };
      this.logRateLimitReset('daily');
    }

    if (type === 'all' || type === 'hourly') {
      this.emailCounts.hourly = { count: 0, resetDate: this.getNextHourReset() };
      this.logRateLimitReset('hourly');
    }
  }

  /**
   * Log service health check
   */
  logHealthCheck() {
    const config = this.validateConfiguration();
    const rateLimits = this.getRateLimitStatus();

    this.logEmail('info', 'Notification service health check', {
      configurationValid: config.isValid,
      missingConfig: config.missingVariables,
      recipientCount: config.recipients,
      rateLimits: {
        monthly: `${rateLimits.monthly.current}/${rateLimits.monthly.limit} (${rateLimits.monthly.percentUsed}%)`,
        daily: `${rateLimits.daily.current}/${rateLimits.daily.limit} (${rateLimits.daily.percentUsed}%)`,
        hourly: `${rateLimits.hourly.current}/${rateLimits.hourly.limit} (${rateLimits.hourly.percentUsed}%)`
      },
      nextResets: {
        monthly: rateLimits.monthly.resetDate.toISOString(),
        daily: rateLimits.daily.resetDate.toISOString(),
        hourly: rateLimits.hourly.resetDate.toISOString()
      }
    });
  }
}

// Export singleton instance
export default new NotificationService();
