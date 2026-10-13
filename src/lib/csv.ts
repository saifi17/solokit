// CSV files that open cleanly in Excel, Numbers and Google Sheets:
// UTF-8 with a byte order mark (so names like "Zoë" survive Excel), every
// field quoted, and text that starts like a formula made harmless.
export function toCSVText(rows: (string | number)[][]): string {
  const cell = (v: string | number) => {
    let s = String(v ?? '');
    if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n');
}
