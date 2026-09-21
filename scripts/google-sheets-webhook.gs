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

// Open the deployed Web app URL to confirm this version is serving requests.
// This check exposes no enquiry data and does not write to the spreadsheet.
function doGet() {
  return jsonResponse({ version: 'enquiry-company-columns-v2' });
}

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
      ['ID', 'Created At', 'Name', 'Phone', 'Email', 'Source', 'Company']);
    appendEnquiryRow(sheet, data);
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

// Select setupEnquirySheet in the Apps Script function dropdown and click Run
// once to create and reveal the Company header without submitting an enquiry.
function setupEnquirySheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = getOrCreateSheet(ss, 'Enquiries',
    ['ID', 'Created At', 'Name', 'Phone', 'Email', 'Source', 'Company']);
  var columns = ensureEnquiryCompanyColumn(sheet);
  ss.setActiveSheet(sheet);
  sheet.showColumns(columns.companyIndex + 1);
  sheet.getRange(1, columns.companyIndex + 1).activate();
  ss.toast('Company column is ready. New warehouse enquiries will fill it.', 'Enquiries');
}

function ensureEnquiryCompanyColumn(sheet) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var normalizedHeaders = headers.map(function (header) {
    return String(header).trim().toLowerCase();
  });
  var companyIndex = normalizedHeaders.indexOf('company');
  if (companyIndex === -1) companyIndex = normalizedHeaders.indexOf('company name');
  if (companyIndex === -1) {
    companyIndex = headers.length;
    if (companyIndex + 1 > sheet.getMaxColumns()) {
      sheet.insertColumnAfter(sheet.getMaxColumns());
    }
    sheet.getRange(1, companyIndex + 1).setValue('Company');
    headers.push('Company');
  }
  return { headers: headers, normalizedHeaders: normalizedHeaders, companyIndex: companyIndex };
}

function appendEnquiryRow(sheet, data) {
  var columns = ensureEnquiryCompanyColumn(sheet);
  var headers = columns.headers;
  var normalizedHeaders = columns.normalizedHeaders;
  var companyIndex = columns.companyIndex;

  // Match the original fields by header; leave custom columns blank on new rows.
  // Existing rows, including Category, Comments, Date and assignee data, stay intact.
  var row = headers.map(function () { return ''; });
  var fields = [
    ['id', data.id], ['created at', data.createdAt], ['name', data.name],
    ['phone', data.phoneNumber], ['email', data.email], ['source', data.source]
  ];
  fields.forEach(function (field) {
    var index = normalizedHeaders.indexOf(field[0]);
    if (index !== -1) row[index] = field[1] == null ? '' : field[1];
  });
  row[companyIndex] = data.companyName || '';
  sheet.appendRow(row);
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
