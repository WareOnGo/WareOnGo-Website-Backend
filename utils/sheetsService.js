const WEBHOOK_URL = process.env.SHEETS_WEBHOOK_URL;
const WEBHOOK_TOKEN = process.env.SHEETS_WEBHOOK_TOKEN;

class SheetsService {
  isConfigured() {
    return Boolean(WEBHOOK_URL && WEBHOOK_TOKEN);
  }

  // e.g. "3 July 2026, 14:35" in IST
  formatTimestamp(value) {
    const date = value ? new Date(value) : new Date();
    const datePart = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric',
    }).format(date);
    const timePart = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(date);
    return `${datePart}, ${timePart}`;
  }

  async appendRow(type, rowData) {
    if (!this.isConfigured()) {
      console.warn('Sheets webhook not configured (SHEETS_WEBHOOK_URL / SHEETS_WEBHOOK_TOKEN missing) - skipping sheet append');
      return { success: false, skipped: true };
    }

    try {
      const response = await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: WEBHOOK_TOKEN,
          type,
          data: rowData,
        }),
        // Apps Script redirects on success; follow is the default but be explicit
        redirect: 'follow',
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`Sheets webhook responded ${response.status}: ${text}`);
      }

      return { success: true };
    } catch (error) {
      console.error(`Sheets append failed for ${type}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async appendEnquiry(enquiryData) {
    return this.appendRow('enquiry', {
      id: enquiryData.id ?? '',
      createdAt: this.formatTimestamp(enquiryData.createdat),
      name: enquiryData.name || '',
      phoneNumber: enquiryData.phoneNumber || '',
      email: enquiryData.email || '',
      source: enquiryData.source || '',
    });
  }

  async appendCustomerRequest(requestData) {
    // additional_requirements may hold a JSON blob from the website form:
    // {location, additionalComments, contact: {fullName, phone, email, company}}
    let parsed = null;
    if (typeof requestData.additional_requirements === 'string') {
      try {
        const candidate = JSON.parse(requestData.additional_requirements);
        if (candidate && typeof candidate === 'object') parsed = candidate;
      } catch {
        // plain-text requirement, not JSON - fall back to flat columns
      }
    }
    const contact = parsed?.contact || {};

    return this.appendRow('customer_request', {
      // id is a BigInt in Prisma; JSON.stringify cannot serialize BigInt
      id: requestData.id != null ? Number(requestData.id) : '',
      createdAt: this.formatTimestamp(requestData.created_at),
      fullName: contact.fullName || requestData.full_name || '',
      phoneNumber: contact.phone || requestData.phone_number || '',
      email: contact.email || '',
      companyName: contact.company || requestData.company_name || '',
      location: parsed?.location || requestData.preferred_location || '',
      comments: parsed ? (parsed.additionalComments || '') : (requestData.additional_requirements || ''),
    });
  }
}

export default new SheetsService();
