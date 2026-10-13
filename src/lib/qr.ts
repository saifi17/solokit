// QR codes for payment links on invoices (scan with a phone camera to pay).
import qrcode from 'qrcode-generator';

/** SVG markup for a QR code, sized to fill its container. Empty string if the text can't be encoded. */
export function qrSvg(text: string): string {
  try {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    return qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    return '';
  }
}

/** Accept "paypal.me/alex" as well as full links. */
export function normaliseLink(v: string): string {
  const t = v.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}
