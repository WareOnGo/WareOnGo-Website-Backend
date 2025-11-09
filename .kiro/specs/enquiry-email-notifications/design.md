# Design Document

## Overview

The email notification system will integrate directly into the existing enquiry and customer request controllers to send automated email alerts when new records are created. The system uses a modular approach with a dedicated notification service that integrates with EmailJS (a free email service) to deliver formatted notifications to a predefined recipient list.

## Architecture

### High-Level Architecture

```
Controller Layer (enquiryController.js, customerRequestController.js)
    ↓ (after successful DB creation)
Notification Service (notificationService.js)
    ↓ (formats and sends)
EmailJS API
    ↓ (delivers to)
Recipient Email Addresses
```

### Integration Points

1. **Controller Integration**: Both controllers will call the notification service after successful database record creation
2. **Service Layer**: A new `notificationService.js` module handles email composition and delivery
3. **External API**: EmailJS service for email delivery (free tier: 200 emails/month)
4. **Configuration**: Hardcoded recipient list and email templates

## Components and Interfaces

### 1. Notification Service (`utils/notificationService.js`)

**Purpose**: Central service for handling all email notifications

**Key Methods**:
- `sendEnquiryNotification(enquiryData)`: Formats and sends enquiry notifications
- `sendCustomerRequestNotification(requestData)`: Formats and sends customer request notifications
- `sendEmail(templateData, type)`: Generic email sending method

**Dependencies**:
- EmailJS SDK for email delivery
- Environment variables for EmailJS configuration

### 2. Email Templates

**Enquiry Template**:
```
Subject: New Enquiry Received - [Name]
Body: Formatted enquiry details including name, phone, email, source, and timestamp
```

**Customer Request Template**:
```
Subject: New Customer Request - [Company Name]
Body: Formatted request details including full name, phone, company, location, requirements, and timestamp
```

### 3. Configuration

**Environment Variables**:
- `EMAILJS_SERVICE_ID`: EmailJS service identifier
- `EMAILJS_TEMPLATE_ID_ENQUIRY`: Template ID for enquiry notifications
- `EMAILJS_TEMPLATE_ID_CUSTOMER_REQUEST`: Template ID for customer request notifications
- `EMAILJS_PUBLIC_KEY`: EmailJS public key

**Hardcoded Recipients** (in notificationService.js):
```javascript
const NOTIFICATION_RECIPIENTS = [
  '[email]@example.com',
  '[email]@example.com'
  // Add more emails as needed
];
```

## Data Models

### Enquiry Notification Data
```javascript
{
  id: number,
  name: string,
  phoneNumber: string,
  email: string | null,
  source: string,
  createdat: Date,
  recipients: string[]
}
```

### Customer Request Notification Data
```javascript
{
  id: number,
  full_name: string,
  phone_number: string,
  company_name: string,
  preferred_location: string,
  additional_requirements: string,
  created_at: Date,
  recipients: string[]
}
```

## Error Handling

### Controller Level
- Email notification failures will NOT affect the main controller response
- Notifications are sent asynchronously after successful database operations
- Errors are logged but don't impact the API response to the client

### Service Level
- EmailJS API failures are caught and logged with detailed error information
- Retry logic for temporary failures (network issues, rate limits)
- Graceful degradation when email service is unavailable

### Logging Strategy
```javascript
// Success logging
console.log(`Email notification sent successfully for enquiry ID: ${id}`);

// Error logging
console.error(`Failed to send email notification for enquiry ID: ${id}`, error);
```

## Testing Strategy

### Unit Tests
- Test email template formatting with various data inputs
- Test error handling for missing or invalid data
- Mock EmailJS API responses for success and failure scenarios

### Integration Tests
- Test controller integration with notification service
- Verify email notifications are triggered after successful database operations
- Test that controller responses are not affected by email failures

### Manual Testing
- Create test enquiries and customer requests
- Verify emails are received with correct formatting
- Test with missing optional fields (like email in enquiries)
- Verify system behavior when EmailJS service is unavailable

## EmailJS Integration Details

### Service Setup
1. Create free EmailJS account (emailjs.com)
2. Set up email service (Gmail, Outlook, etc.)
3. Create email templates for enquiry and customer request notifications
4. Configure environment variables with service credentials

### Template Variables
**Enquiry Template Variables**:
- `{{name}}`, `{{phone_number}}`, `{{email}}`, `{{source}}`, `{{created_date}}`

**Customer Request Template Variables**:
- `{{full_name}}`, `{{phone_number}}`, `{{company_name}}`, `{{preferred_location}}`, `{{additional_requirements}}`, `{{created_date}}`

### Rate Limiting
- EmailJS free tier: 200 emails/month
- Implement basic rate limiting to prevent quota exhaustion
- Log when approaching monthly limits

## Security Considerations

1. **API Keys**: Store EmailJS credentials in environment variables
2. **Data Sanitization**: Sanitize all data before including in email templates
3. **Recipient Validation**: Validate email addresses in recipient list
4. **Error Information**: Avoid exposing sensitive information in error logs