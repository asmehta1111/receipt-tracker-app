import Anthropic from '@anthropic-ai/sdk';
import { CATEGORIES } from './sheets';

// One photo per call, so this is a per-receipt cost of roughly a cent. The
// email scraper uses Haiku because it runs over thousands of messages; here the
// hard part is reading a creased thermal till roll, not volume, so accuracy is
// worth more than the model tier saving.
const MODEL = 'claude-opus-5';

// Claude's vision input accepts these four. A phone camera gives JPEG, Google
// Photos gives JPEG, a screenshot gives PNG. HEIC is deliberately absent — the
// API rejects it, so we catch it here and say so rather than 400 later.
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const PDF_TYPE = 'application/pdf';
export const ACCEPTED_TYPES = [...IMAGE_TYPES, PDF_TYPE];

// Mirrors EXTRACTION_SCHEMA in receipt-scraper.js so a photographed receipt and
// an emailed one produce the same shape of answer, with three additions that
// only make sense for a photo: isReceipt, unreadable and warnings.
const PHOTO_SCHEMA = {
  type: 'object',
  properties: {
    isReceipt: {
      type: 'boolean',
      description: 'True if this image actually shows a receipt, bill, invoice, ticket or payment confirmation. False for anything else - a screenshot of a chat, a photo of a person, a menu with no total.',
    },
    vendor: { type: 'string', description: 'Clean merchant name as you would say it aloud, e.g. "Starbucks", "Taj Mahal Palace", "Blinkit". Not the legal entity line, not the GSTIN, not the branch address.' },
    currency: { type: 'string', description: 'ISO code such as INR, USD, EUR, GBP, AED. Infer from the symbol and the country context if no code is printed. Empty string only if there is no amount at all.' },
    amount: { type: 'number', description: 'The FINAL total actually paid, after tax, service charge, tip and any discount. Not the subtotal, not a single line item, not the cash tendered, not the change. 0 if no total is legible.' },
    category: { type: 'string', enum: CATEGORIES },
    isSubscription: { type: 'boolean', description: 'True only for a recurring membership or subscription charge. A one-off shop or restaurant bill is false.' },
    renewalDate: { type: 'string', description: 'Next renewal or billing date as YYYY-MM-DD if printed, otherwise empty string.' },
    paymentMethod: { type: 'string', description: 'How it was paid, as printed: "Visa ending 4242", "Amex", "UPI", "Cash", "GPay". Empty string if not shown.' },
    transactionDate: {
      type: 'string',
      description: 'The date printed on the receipt, as YYYY-MM-DD. Indian receipts are usually DD/MM/YYYY and US ones MM/DD/YYYY - use the vendor, currency and address to decide which, and if the first number is greater than 12 that settles it. Empty string if no date is legible; do NOT invent one.',
    },
    description: { type: 'string', description: 'One specific line about what was bought - items, covers, nights, route. "Dinner for 4, two mains and wine" beats "Restaurant bill". Max 100 chars.' },
    transactionType: {
      type: 'string',
      enum: ['charge', 'refund', 'cancellation', 'failed', 'reminder'],
      description: '"charge" = money was paid. "refund" = a credit note or refund slip. "cancellation" = a voided bill. "failed" = a declined transaction slip. "reminder" = an unpaid invoice or proforma asking for payment, with no evidence of payment on the document itself.',
    },
    confident: { type: 'boolean', description: 'False if you are guessing at the vendor, the total or the category because the image is blurred, cropped or ambiguous. Be honest - a false here just means the human checks more carefully.' },
    unreadable: {
      type: 'array',
      items: { type: 'string', enum: ['vendor', 'amount', 'currency', 'date', 'paymentMethod'] },
      description: 'Which fields you could NOT read off the image and had to leave empty or guess. Empty array if the receipt was fully legible.',
    },
    warnings: {
      type: 'array',
      items: { type: 'string' },
      description: 'Short human-readable cautions worth showing before saving, e.g. "Two totals printed, took the lower one", "Date could be 03 Apr or 04 Mar", "Tip line handwritten and unclear". Empty array if nothing is odd.',
    },
  },
  required: ['isReceipt', 'vendor', 'currency', 'amount', 'category', 'isSubscription', 'renewalDate', 'paymentMethod', 'transactionDate', 'description', 'transactionType', 'confident', 'unreadable', 'warnings'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `You read photographs and scans of real-world receipts, bills, invoices and tickets belonging to a person based in Mumbai, India who travels internationally and runs an investment fund and an advisory firm.

The image is often imperfect: a crumpled thermal till roll, a photo taken at an angle, a screenshot of a payment app, glare across the middle, or a page cut off at the edge. Read what is actually there. Where something is genuinely illegible, say so in "unreadable" and leave the field empty rather than inventing a plausible value - a blank the human fills in is far better than a confident wrong number in a financial record.

THE TOTAL is the single most important field. Receipts print many numbers: line items, subtotal, CGST/SGST, service charge, tip, rounding, cash tendered, change due, and loyalty points. You want the final amount actually charged. On Indian restaurant bills this is usually the last line, after "Grand Total" or "Net Payable". If a tip was added by hand below a printed total, the amount charged is the handwritten final figure - take that and note it in "warnings".

DATES are ambiguous and get this wrong more than anything else. Indian receipts print DD/MM/YYYY; US receipts print MM/DD/YYYY. Decide from the vendor, the currency, the address and the language on the receipt. If the first number is greater than 12 it must be the day. If you genuinely cannot tell which of two readings is right, pick the one consistent with the country and add a warning saying so.

CATEGORY - use your knowledge of what the business actually is, not keyword matching:
- Indian consumer brands: Swiggy and Zomato are Food; Blinkit, Zepto, BigBasket and DMart are Groceries; Ola, Uber and Rapido are Transportation; IRCTC is Travel; Airtel and Jio are Telecom
- Private members' clubs, gymkhanas and yacht clubs are "Clubs & Memberships", unless the specific bill is clearly an overnight stay ("Hotels") or a meal in the club restaurant ("Food")
- A restaurant inside a hotel is "Food" if the bill is for a meal, "Hotels" if it is a room folio
- Petrol, fuel and parking are "Transportation"; a pharmacy or clinic is "Health"

This person runs Blue Lotus Investment Fund (BLIF) and Azlin Consultants. Anything that exists only because of the fund or the advisory firm - a supplier invoice to either entity, a law or audit firm bill, a custody statement - is "Business (BLIF/AMA)" even when it looks like an ordinary bill. Money moving into or out of an investment vehicle is "Investments".

Use "Other" only when you genuinely cannot tell what kind of business issued the document.

If the image is not a financial document at all, set isReceipt false and leave the other fields empty or zero - do not try to force a reading.`;

export type ReceiptDraft = {
  isReceipt: boolean;
  vendor: string;
  currency: string;
  amount: number;
  category: string;
  isSubscription: boolean;
  renewalDate: string;
  paymentMethod: string;
  transactionDate: string;
  description: string;
  transactionType: 'charge' | 'refund' | 'cancellation' | 'failed' | 'reminder';
  confident: boolean;
  unreadable: string[];
  warnings: string[];
};

/**
 * Read a receipt image or PDF and return the draft row, unsaved. Nothing here
 * writes to the Sheet - the caller shows this to a human first.
 */
export async function extractFromUpload(
  base64: string,
  mediaType: string,
): Promise<ReceiptDraft> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is not set on the server.');
  }
  if (!ACCEPTED_TYPES.includes(mediaType)) {
    const heic = mediaType === 'image/heic' || mediaType === 'image/heif';
    throw new Error(
      `${mediaType} can't be read. Use a JPEG, PNG, WebP, GIF or PDF.` +
      (heic ? ' HEIC photos need converting to JPEG first.' : ''),
    );
  }

  const client = new Anthropic();

  // A PDF goes in as a document block, an image as an image block. Both sit
  // before the text block, which is the order the API expects.
  const media: any = mediaType === PDF_TYPE
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } };

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    // Reading a till roll is a perception problem, not a reasoning one, so
    // medium effort keeps the round trip inside the function timeout.
    output_config: {
      effort: 'medium',
      format: { type: 'json_schema', schema: PHOTO_SCHEMA },
    },
    messages: [{
      role: 'user',
      content: [media, { type: 'text', text: 'Extract the expense details from this receipt.' }],
    }],
  } as any);

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to read this image.');
  }

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No parseable answer came back from Claude.');
  }
  return JSON.parse(textBlock.text) as ReceiptDraft;
}
