// "Your business details": entered once, reused by the invoice and quote
// generators, reminder emails and the rate calculator.
import { load, save } from './storage';

export type Profile = {
  businessName: string;
  yourName: string;
  email: string;
  phone: string;
  website: string;
  address: string;
  taxId: string;
  logo: string;            // data URL, resized on upload
  currency: string;
  defaultRate: number;     // hourly
  paymentDetails: string;  // bank / Wise / PayPal details printed on invoices
  paymentLink: string;     // online payment link printed (and as a QR code) on invoices
  taxLabel: string;        // VAT, GST, Sales tax...
  taxRate: number;
  paymentTerms: number;    // days until an invoice is due
  template: 'classic' | 'modern' | 'minimal';
  accent: string;
  paper: 'A4' | 'Letter';
  invoicePrefix: string;
  nextInvoice: number;
  quotePrefix: string;
  nextQuote: number;
};

export const defaultProfile: Profile = {
  businessName: '',
  yourName: '',
  email: '',
  phone: '',
  website: '',
  address: '',
  taxId: '',
  logo: '',
  currency: 'USD',
  defaultRate: 0,
  paymentDetails: '',
  paymentLink: '',
  taxLabel: 'Tax',
  taxRate: 0,
  paymentTerms: 14,
  template: 'modern',
  accent: '#0F6B58',
  paper: 'A4',
  invoicePrefix: 'INV-',
  nextInvoice: 1,
  quotePrefix: 'Q-',
  nextQuote: 1,
};

const KEY = 'profile';

export function getProfile(): Profile {
  const p = { ...defaultProfile, ...load<Partial<Profile>>(KEY, {}) };
  p.nextInvoice = Math.max(1, Math.floor(Number(p.nextInvoice) || 1));
  p.nextQuote = Math.max(1, Math.floor(Number(p.nextQuote) || 1));
  return p;
}

export function saveProfile(p: Profile) {
  save(KEY, p);
}

export function updateProfile(patch: Partial<Profile>) {
  saveProfile({ ...getProfile(), ...patch });
}

export const hasBusinessDetails = (p: Profile) => !!(p.businessName || p.yourName);

/** The next document number, without using it up. */
export function peekNumber(type: 'invoice' | 'quote'): string {
  const p = getProfile();
  return type === 'invoice'
    ? `${p.invoicePrefix}${String(p.nextInvoice).padStart(3, '0')}`
    : `${p.quotePrefix}${String(p.nextQuote).padStart(3, '0')}`;
}

/** Take the next document number (e.g. INV-007) and move the counter on. */
export function takeNumber(type: 'invoice' | 'quote'): string {
  const p = getProfile();
  if (type === 'invoice') {
    const n = `${p.invoicePrefix}${String(p.nextInvoice).padStart(3, '0')}`;
    saveProfile({ ...p, nextInvoice: p.nextInvoice + 1 });
    return n;
  }
  const n = `${p.quotePrefix}${String(p.nextQuote).padStart(3, '0')}`;
  saveProfile({ ...p, nextQuote: p.nextQuote + 1 });
  return n;
}

/** Resize an uploaded logo so it stays small in storage (max 480x200). */
export function resizeLogo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('Please choose an image file (PNG, JPG or SVG).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.onload = () => {
      const src = String(reader.result);
      if (file.type === 'image/svg+xml') return resolve(src); // vectors stay sharp and small
      const img = new Image();
      img.onerror = () => reject(new Error('That image could not be opened.'));
      img.onload = () => {
        const scale = Math.min(1, 480 / img.width, 200 / img.height);
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w * 2; // 2x for crisp printing
        canvas.height = h * 2;
        const ctx = canvas.getContext('2d')!;
        ctx.scale(2, 2);
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  });
}
