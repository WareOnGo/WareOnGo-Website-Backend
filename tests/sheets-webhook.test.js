import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const script = readFileSync(new URL('../scripts/google-sheets-webhook.gs', import.meta.url), 'utf8');
const data = { id: 123, createdAt: '12 September 2026', name: 'Test', phoneNumber: '9876543210', email: '', source: 'warehouse-card-123-callback', companyName: 'Example Logistics' };

test('deployment version can be checked without accessing the spreadsheet', () => {
  const context = vm.createContext({ ContentService: {
    MimeType: { JSON: 'application/json' },
    createTextOutput: text => ({ setMimeType: () => JSON.parse(text) }),
  } });
  vm.runInContext(script, context);
  assert.deepEqual(context.doGet(), { version: 'enquiry-company-columns-v2' });
});

function sheetWith(headers) {
  const rows = [headers.slice(), headers.map((_, index) => `old-${index}`)];
  let maxColumns = headers.length;
  return {
    rows,
    getLastColumn: () => rows[0].length,
    getMaxColumns: () => maxColumns,
    insertColumnAfter: () => { maxColumns++; },
    getRange: (row, column) => ({
      getValues: () => [rows[row - 1].slice(column - 1)],
      setValue: value => { rows[row - 1][column - 1] = value; },
    }),
    appendRow: row => { rows.push(Array.from(row)); },
  };
}

test('company is appended after custom columns without overwriting headers or old records', () => {
  const context = vm.createContext({});
  vm.runInContext(script, context);
  const headers = ['ID', 'Created At', 'Name', 'Phone', 'Email', 'Source', 'Category', 'Comments', 'Date', 'Nihas'];
  const sheet = sheetWith(headers);
  const oldRow = sheet.rows[1].slice();
  context.appendEnquiryRow(sheet, data);
  assert.deepEqual(sheet.rows[0], [...headers, 'Company']);
  assert.deepEqual(sheet.rows[1], oldRow);
  assert.deepEqual(sheet.rows[2], [123, data.createdAt, 'Test', data.phoneNumber, '', data.source, '', '', '', '', 'Example Logistics']);
  context.appendEnquiryRow(sheet, { ...data, companyName: undefined });
  assert.equal(sheet.rows[0].length, 11);
  assert.equal(sheet.rows[3][10], '');
});

test('an existing Company Name column is reused and reordered fields follow their headers', () => {
  const context = vm.createContext({});
  vm.runInContext(script, context);
  const headers = ['ID', 'Company Name', 'Name', 'Created At', 'Phone', 'Email', 'Source', 'Category'];
  const sheet = sheetWith(headers);
  context.appendEnquiryRow(sheet, data);
  assert.deepEqual(sheet.rows[0], headers);
  assert.deepEqual(sheet.rows[2], [123, 'Example Logistics', 'Test', data.createdAt, data.phoneNumber, '', data.source, '']);
});

test('setup immediately creates and reveals Company without adding an enquiry or changing old rows', () => {
  const sheet = sheetWith(['ID', 'Created At', 'Name', 'Phone', 'Email', 'Source', 'Category', 'Comments', 'Date', 'Nihas']);
  const oldRow = sheet.rows[1].slice();
  let visibleColumn;
  let activeColumn;
  const getRange = sheet.getRange;
  sheet.getRange = (row, column) => ({ ...getRange(row, column), activate() { activeColumn = column; } });
  sheet.getLastRow = () => sheet.rows.length;
  sheet.showColumns = column => { visibleColumn = column; };
  const ss = { getSheetByName: () => sheet, setActiveSheet: value => assert.equal(value, sheet), toast() {} };
  const context = vm.createContext({ SpreadsheetApp: { getActiveSpreadsheet: () => ss } });
  vm.runInContext(script, context);
  context.setupEnquirySheet();
  context.setupEnquirySheet();
  assert.equal(sheet.rows.length, 2);
  assert.deepEqual(sheet.rows[1], oldRow);
  assert.equal(sheet.rows[0].length, 11);
  assert.equal(sheet.rows[0][10], 'Company');
  assert.equal(visibleColumn, 11);
  assert.equal(activeColumn, 11);
});
