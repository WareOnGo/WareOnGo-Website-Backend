# EmailJS Setup Guide

This guide walks you through setting up EmailJS for the enquiry and customer request notification system.

## Prerequisites

1. Create a free EmailJS account at [emailjs.com](https://www.emailjs.com/)
2. Connect your email service (Gmail, Outlook, etc.)

## Step 1: Create Email Service

1. Log into your EmailJS dashboard
2. Go to "Email Services" and click "Add New Service"
3. Choose your email provider (Gmail recommended)
4. Follow the authentication steps
5. Note down your **Service ID**

## Step 2: Create Email Templates

### Enquiry Notification Template

1. Go to "Email Templates" and click "Create New Template"
2. Set Template Name: "Enquiry Notification"
3. Use the following template configuration:

**Subject Line:**
```
New Enquiry Received - {{name}}
```

**Email Body:**
```
A new enquiry has been submitted through the website.

Enquiry Details:
- ID: {{enquiry_id}}
- Name: {{name}}
- Phone: {{phone_number}}
- Email: {{email}}
- Source: {{source}}
- Submitted: {{created_date}}

Please follow up with this enquiry promptly.

---
This is an automated notification from the Wareongo system.
Recipients: {{recipients}}
```

4. Save the template and note down the **Template ID**

### Customer Request Notification Template

1. Create another new template
2. Set Template Name: "Customer Request Notification"
3. Use the following template configuration:

**Subject Line:**
```
New Customer Request - {{company_name}}
```**E
mail Body:**
```
A new customer request has been submitted through the website.

Customer Request Details:
- ID: {{request_id}}
- Full Name: {{full_name}}
- Phone: {{phone_number}}
- Company: {{company_name}}
- Preferred Location: {{preferred_location}}
- Additional Requirements: {{additional_requirements}}
- Submitted: {{created_date}}

Please review and respond to this customer request.

---
This is an automated notification from the Wareongo system.
Recipients: {{recipients}}
```

4. Save the template and note down the **Template ID**

## Step 3: Get API Keys

1. Go to "Account" in your EmailJS dashboard
2. Find your **Public Key** (also called User ID)
3. Generate a **Private Key** for server-side usage

## Step 4: Configure Environment Variables

Add the following to your `.env` file:

```env
# EmailJS Configuration for Email Notifications
EMAILJS_SERVICE_ID=your_service_id_here
EMAILJS_PUBLIC_KEY=your_public_key_here
EMAILJS_PRIVATE_KEY=your_private_key_here
EMAILJS_TEMPLATE_ID_ENQUIRY=your_enquiry_template_id_here
EMAILJS_TEMPLATE_ID_CUSTOMER_REQUEST=your_customer_request_template_id_here
```

## Step 5: Update Recipient List

Edit `utils/notificationService.js` and update the recipient list:

```javascript
const NOTIFICATION_RECIPIENTS = [
  'admin@yourcompany.com',
  'notifications@yourcompany.com'
  // Add more emails as needed
];
```

## Template Variables Reference

### Enquiry Template Variables
- `{{name}}` - Enquirer's name
- `{{phone_number}}` - Phone number
- `{{email}}` - Email address (may be "Not provided")
- `{{source}}` - Source of the enquiry
- `{{created_date}}` - Formatted creation date
- `{{enquiry_id}}` - Database ID
- `{{recipients}}` - List of notification recipients

### Customer Request Template Variables
- `{{full_name}}` - Customer's full name
- `{{phone_number}}` - Phone number
- `{{company_name}}` - Company name
- `{{preferred_location}}` - Preferred location
- `{{additional_requirements}}` - Additional requirements
- `{{created_date}}` - Formatted creation date
- `{{request_id}}` - Database ID
- `{{recipients}}` - List of notification recipients

## Testing

After configuration, test the system by:
1. Creating a test enquiry through your API
2. Creating a test customer request through your API
3. Check your email for notifications
4. Monitor the application logs for any errors

## Rate Limits

EmailJS free tier includes:
- 200 emails per month
- The system includes built-in rate limiting to prevent quota exhaustion

## Troubleshooting

Common issues:
1. **Configuration errors**: Check all environment variables are set
2. **Template not found**: Verify template IDs match your EmailJS dashboard
3. **Authentication errors**: Ensure private key is correct
4. **Rate limit exceeded**: Monitor usage in application logs