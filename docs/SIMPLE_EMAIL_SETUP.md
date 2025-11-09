# Simple Email Setup (No Templates Required!)

## ✅ You're Already Done!

Your `.env` file is already configured:

```env
EMAILJS_SERVICE_ID=service_7q0qyrz  ✅
EMAILJS_PUBLIC_KEY=L0OW_7hTknDlDY57t  ✅
EMAILJS_PRIVATE_KEY=txfEYiwxbYdWxzmFRK6rK  ✅
```

**No templates needed!** The system now sends raw text emails directly.

## How It Works

When someone submits an enquiry or customer request:

1. ✅ Data is saved to Supabase
2. ✅ A plain text email is sent to your admin team
3. ✅ Email contains all the information formatted nicely

## Email Recipients

Emails are sent to the addresses configured in `utils/notificationService.js`:

```javascript
const NOTIFICATION_RECIPIENTS = [
  'admin@example.com',
  'notifications@example.com'
];
```

**To change recipients**: Edit this array in `utils/notificationService.js`

## Example Email

### For Enquiries:
```
Subject: New Enquiry - ID: 1

NEW ENQUIRY RECEIVED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           John Doe
Phone:          +1234567890
Email:          john@example.com
Source:         website

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

NEW CUSTOMER REQUEST RECEIVED

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

CONTACT INFORMATION
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Name:           Alice Johnson
Phone:          +1987654321
Company:        Tech Corp
Location:       San Francisco

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

## Testing

Run this command to test your email configuration:

```bash
npm run test:emailjs
```

You should see:
```
✅ EmailJS configuration is valid
✅ All required environment variables are set
```

## Changing Email Recipients

1. Open `utils/notificationService.js`
2. Find this section near the top:
   ```javascript
   const NOTIFICATION_RECIPIENTS = [
     'admin@example.com',
     'notifications@example.com'
   ];
   ```
3. Replace with your actual email addresses:
   ```javascript
   const NOTIFICATION_RECIPIENTS = [
     'your-email@wareongo.com',
     'team@wareongo.com'
   ];
   ```
4. Save the file
5. Restart your server

## That's It!

No templates to create, no complex setup. Just works! 🎉

## Troubleshooting

**Not receiving emails?**
- Check your Gmail service is connected in EmailJS dashboard
- Verify the email addresses in `NOTIFICATION_RECIPIENTS`
- Check spam folder
- Review server logs for error messages

**Configuration error?**
- Make sure all three environment variables are set in `.env`
- Restart your server after changing `.env`
- Run `npm run test:emailjs` to verify configuration

**Need help?**
- Check server logs for detailed error messages
- All email failures are logged but don't affect data saving
- Database entries are always saved even if email fails
