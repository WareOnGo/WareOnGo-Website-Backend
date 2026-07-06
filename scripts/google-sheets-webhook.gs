/**
 * Google Apps Script webhook that receives form submissions from the
 * WareOnGo backend and appends them as rows to this spreadsheet.
 *
 * Setup:
 * 1. Create a Google Sheet with two tabs named exactly:
 *      "Enquiries" and "Customer Requests"
 * 2. In the sheet: Extensions > Apps Script, paste this file's contents.
 * 3. Replace SHARED_TOKEN below with a long random string.
 * 4. Deploy > New deployment > type "Web app":
 *      - Execute as: Me
 *      - Who has access: Anyone
 *    Copy the web app URL.
 * 5. In the backend .env set:
 *      SHEETS_WEBHOOK_URL=<web app URL>
 *      SHEETS_WEBHOOK_TOKEN=<same random string as SHARED_TOKEN>
 *
 * After editing this script you must create a NEW deployment version
 * (Deploy > Manage deployments > Edit > Version: New) for changes to apply.
 */

var SHARED_TOKEN = 'REPLACE_WITH_A_LONG_RANDOM_STRING';

function doPost(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse({ success: false, error: 'Invalid JSON' });
  }

  if (!payload || payload.token !== SHARED_TOKEN) {
    return jsonResponse({ success: false, error: 'Unauthorized' });
  }

  var data = payload.data || {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  if (payload.type === 'enquiry') {
    var sheet = getOrCreateSheet(ss, 'Enquiries',
      ['ID', 'Created At', 'Name', 'Phone', 'Email', 'Source']);
    sheet.appendRow([
      data.id, data.createdAt, data.name, data.phoneNumber, data.email, data.source
    ]);
  } else if (payload.type === 'customer_request') {
    var sheet2 = getOrCreateSheet(ss, 'Customer Requests',
      ['ID', 'Created At', 'Full Name', 'Phone', 'Email', 'Company', 'Location', 'Comments']);
    sheet2.appendRow([
      data.id, data.createdAt, data.fullName, data.phoneNumber,
      data.email, data.companyName, data.location, data.comments
    ]);
  } else {
    return jsonResponse({ success: false, error: 'Unknown type: ' + payload.type });
  }

  return jsonResponse({ success: true });
}

function getOrCreateSheet(ss, name, headers) {
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
