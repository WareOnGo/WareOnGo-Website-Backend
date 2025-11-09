# EmailJS Unified Template Setup

## Overview
This guide shows you how to create a single EmailJS template that works for both enquiries and customer requests.

## Template Variables

The unified template uses these variables:

| Variable | Description | Example Values |
|----------|-------------|----------------|
| `{{notification_type}}` | Type of notification | "New Enquiry" or "New Customer Request" |
| `{{record_id}}` | Database record ID | 1, 2, 3, etc. |
| `{{name}}` | Person's name | "John Doe" or "Alice Johnson" |
| `{{phone_number}}` | Contact phone | "+1234567890" |
| `{{email}}` | Email address | "john@example.com" or "Not provided" |
| `{{company_name}}` | Company name | "Tech Corp" or "N/A" |
| `{{location}}` | Location/Source | "San Francisco" or "N/A" |
| `{{source}}` | Enquiry source | "website" or "N/A" |
| `{{additional_info}}` | Extra details | Requirements or "N/A" |
| `{{created_date}}` | Timestamp | "1/15/2024, 3:30:00 PM" |
| `{{recipients}}` | Who receives this | "admin@example.com, notifications@example.com" |

## Creating the Template on EmailJS

### Step 1: Go to Email Templates
1. Visit https://dashboard.emailjs.com/admin
2. Click **"Email Templates"** in the left sidebar
3. Click **"Create New Template"**

### Step 2: Configure Template Settings
- **Template Name**: "Unified Notification Template"
- **Subject**: `{{notification_type}} - ID: {{record_id}}`

### Step 3: Template Content

Copy and paste this template:

```
{{notification_type}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           {{name}}
Phone:          {{phone_number}}
Email:          {{email}}
Company:        {{company_name}}
Location:       {{location}}
Source:         {{source}}

ADDITIONAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{additional_info}}

RECORD INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record ID:      {{record_id}}
Date/Time:      {{created_date}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This notification was sent to: {{recipients}}

Powered by WareOnGo Notification System
```

### Step 4: Configure Email Settings

**To Email**: Enter your notification recipients (e.g., `admin@wareongo.com`)

**From Name**: `WareOnGo Notifications`

**From Email**: Your Gmail address (the one you connected)

**Reply To**: Your support email (e.g., `support@wareongo.com`)

### Step 5: Save and Copy Template ID

1. Click **"Save"**
2. You'll see the **Template ID** (looks like `template_abc123xyz`)
3. Copy this ID
4. Paste it into your `.env` file as `EMAILJS_TEMPLATE_ID`

## Example Email Output

### For Enquiries:
```
Subject: New Enquiry - ID: 1

New Enquiry

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           John Doe
Phone:          +1234567890
Email:          john@example.com
Company:        N/A
Location:       N/A
Source:         website

ADDITIONAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

N/A

RECORD INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record ID:      1
Date/Time:      1/15/2024, 3:30:00 PM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This notification was sent to: admin@example.com, notifications@example.com

Powered by WareOnGo Notification System
```

### For Customer Requests:
```
Subject: New Customer Request - ID: 5

New Customer Request

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           Alice Johnson
Phone:          +1987654321
Email:          Not provided
Company:        Tech Corp
Location:       San Francisco
Source:         N/A

ADDITIONAL DETAILS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Need 24/7 support and enterprise-grade security

RECORD INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Record ID:      5
Date/Time:      1/15/2024, 4:45:00 PM

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This notification was sent to: admin@example.com, notifications@example.com

Powered by WareOnGo Notification System
```

## Configuration Summary

After creating the template, your `.env` should have:

```env
EMAILJS_SERVICE_ID=service_7q0qyrz
EMAILJS_PUBLIC_KEY=L0OW_7hTknDlDY57t
EMAILJS_PRIVATE_KEY=txfEYiwxbYdWxzmFRK6rK
EMAILJS_TEMPLATE_ID=template_abc123xyz  # ← Your template ID here
```

## Testing the Template

Run the test script to verify everything works:

```bash
npm run test:emailjs
```

## Benefits of Unified Template

✅ **Simpler Setup**: Only one template to create and maintain
✅ **Consistent Format**: All notifications look the same
✅ **Easy Updates**: Change one template, affects both notification types
✅ **Less Configuration**: Fewer environment variables to manage
✅ **Flexible**: Shows only relevant fields (N/A for unused fields)

## Customization Tips

### Make it prettier with HTML:
You can use HTML in the template for better formatting:

```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #2c3e50;">{{notification_type}}</h2>
  
  <div style="background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h3 style="color: #34495e; margin-top: 0;">Contact Information</h3>
    <p><strong>Name:</strong> {{name}}</p>
    <p><strong>Phone:</strong> {{phone_number}}</p>
    <p><strong>Email:</strong> {{email}}</p>
    <p><strong>Company:</strong> {{company_name}}</p>
    <p><strong>Location:</strong> {{location}}</p>
    <p><strong>Source:</strong> {{source}}</p>
  </div>
  
  <div style="background: #fff3cd; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <h3 style="color: #856404; margin-top: 0;">Additional Details</h3>
    <p>{{additional_info}}</p>
  </div>
  
  <div style="background: #e7f3ff; padding: 20px; border-radius: 5px; margin: 20px 0;">
    <p><strong>Record ID:</strong> {{record_id}}</p>
    <p><strong>Date/Time:</strong> {{created_date}}</p>
  </div>
  
  <p style="color: #6c757d; font-size: 12px; text-align: center;">
    This notification was sent to: {{recipients}}<br>
    Powered by WareOnGo Notification System
  </p>
</div>
```

### Add your logo:
```html
<img src="https://wareongo.com/logo.png" alt="WareOnGo" style="max-width: 200px;">
```

## Troubleshooting

**Template not working?**
- Make sure all variable names match exactly (including `{{` and `}}`)
- Check that Template ID is copied correctly to `.env`
- Verify the template is saved and active in EmailJS dashboard

**Variables showing as empty?**
- Check the notification service formatting functions
- Verify data is being passed correctly from controllers

**Need help?**
- Check logs: `console.log` statements in `notificationService.js`
- Run test script: `npm run test:emailjs`
- Review EmailJS dashboard for delivery status
