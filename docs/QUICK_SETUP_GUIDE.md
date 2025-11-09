# Quick EmailJS Setup Guide

## What You Need to Do

You need to fill in **ONE** value in your `.env` file:

```env
EMAILJS_TEMPLATE_ID=your_template_id_here  # ← Get this from EmailJS
```

The other values are already set:
- ✅ `EMAILJS_SERVICE_ID=service_7q0qyrz`
- ✅ `EMAILJS_PUBLIC_KEY=L0OW_7hTknDlDY57t`
- ✅ `EMAILJS_PRIVATE_KEY=txfEYiwxbYdWxzmFRK6rK`

## Step-by-Step Instructions

### 1. Create the Email Template

Go to: https://dashboard.emailjs.com/admin

1. Click **"Email Templates"** (left sidebar)
2. Click **"Create New Template"**
3. Set **Subject**: `{{notification_type}} - ID: {{record_id}}`
4. Copy this template content:

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

5. Set **To Email**: Your admin email (e.g., `admin@wareongo.com`)
6. Set **From Name**: `WareOnGo Notifications`
7. Click **"Save"**

### 2. Copy the Template ID

After saving, you'll see the **Template ID** (looks like `template_abc123xyz`)

Copy this ID!

### 3. Update Your .env File

Open your `.env` file and replace:

```env
EMAILJS_TEMPLATE_ID=your_template_id_here
```

With:

```env
EMAILJS_TEMPLATE_ID=template_abc123xyz  # ← Your actual template ID
```

### 4. Test It

Run this command to test:

```bash
npm run test:emailjs
```

You should see:
```
✅ EmailJS configuration is valid
✅ All required environment variables are set
```

## That's It!

Your email notifications are now configured and will work for both:
- ✅ Enquiries (from website forms)
- ✅ Customer Requests (from customer portal)

## What Happens Next?

When someone submits an enquiry or customer request:
1. ✅ Entry is saved to Supabase database
2. ✅ Email notification is sent to your admin team
3. ✅ If email fails, entry is still saved (no data loss)

## Need Help?

- **Detailed template guide**: See `docs/EMAILJS_UNIFIED_TEMPLATE.md`
- **Full setup guide**: See `docs/EMAILJS_SETUP.md`
- **Database guarantee**: See `docs/DATABASE_ENTRY_GUARANTEE.md`

## Troubleshooting

**"Configuration is incomplete" error?**
- Make sure you copied the Template ID correctly
- Check for extra spaces or quotes in `.env`
- Restart your server after updating `.env`

**Not receiving emails?**
- Check EmailJS dashboard for delivery status
- Verify your Gmail service is connected
- Check spam folder
- Review logs for error messages
