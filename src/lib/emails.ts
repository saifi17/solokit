// Payment reminder emails, from a friendly heads-up to a final notice.
// Plain, polite business English that works for clients anywhere.
import { addDays, fmtDateLong, money, todayISO, daysBetween } from './format';

export type Stage = 'before' | 'gentle' | 'firm' | 'final';

export const stages: { id: Stage; name: string; when: string }[] = [
  { id: 'before', name: 'Friendly heads-up', when: 'Before or on the due date' },
  { id: 'gentle', name: 'Polite reminder', when: '1–7 days late' },
  { id: 'firm', name: 'Firm follow-up', when: '8–30 days late' },
  { id: 'final', name: 'Final notice', when: 'More than 30 days late' },
];

export type ReminderInput = {
  contact: string;       // person you're writing to
  company: string;
  number: string;
  amount: number;
  currency: string;
  dueDate: string;
  project: string;
  yourName: string;
  business: string;
  paymentDetails: string;
  attach: boolean;
  lateFee: 'none' | 'percent' | 'fixed';
  lateFeeValue: number;
  pauseWork: boolean;
  today?: string;
};

export function suggestStage(dueDate: string, today = todayISO()): Stage {
  const late = daysBetween(dueDate, today);
  if (late <= 0) return 'before';
  if (late <= 7) return 'gentle';
  if (late <= 30) return 'firm';
  return 'final';
}

export function compose(stage: Stage, i: ReminderInput): { subject: string; body: string; nextStep: string } {
  const today = i.today ?? todayISO();
  const first = (i.contact.trim().split(/\s+/)[0] || '').replace(/[,.]$/, '') || 'there';
  const num = i.number.trim() || '[invoice number]';
  const amt = i.amount > 0 ? money(i.amount, i.currency) : '[amount]';
  const due = i.dueDate ? fmtDateLong(i.dueDate) : '[due date]';
  const late = i.dueDate ? Math.max(0, daysBetween(i.dueDate, today)) : 0;
  const lateText = `${late} day${late === 1 ? '' : 's'}`;
  const forProject = i.project.trim() ? ` for ${i.project.trim()}` : '';
  const sign = [i.yourName.trim() || '[Your name]', i.business.trim()].filter(Boolean).join('\n');
  const pay = i.paymentDetails.trim()
    ? `You can pay by:\n${i.paymentDetails.trim()}`
    : 'The payment details are on the invoice.';
  const attachLine = i.attach ? "I've attached the invoice again for convenience. " : '';
  const fee = i.lateFee === 'percent' && i.lateFeeValue > 0
    ? `${i.lateFeeValue}% per month`
    : i.lateFee === 'fixed' && i.lateFeeValue > 0 ? money(i.lateFeeValue, i.currency) : '';

  let subject = '';
  let lines: string[] = [];
  let nextStep = '';

  if (stage === 'before') {
    const dueIn = i.dueDate ? daysBetween(today, i.dueDate) : 0;
    const when = !i.dueDate ? 'soon' : dueIn <= 0 ? 'today' : dueIn === 1 ? 'tomorrow' : `on ${due}`;
    subject = `Friendly reminder: invoice ${num} is due ${when}`;
    lines = [
      `Hi ${first},`,
      `I hope you're well. This is a quick reminder that invoice ${num}${forProject}, for ${amt}, is due ${when}.`,
      `${attachLine}${pay}`,
      "If the payment is already on its way, please ignore this email. Thank you!",
      `Best regards,\n${sign}`,
    ];
    nextStep = i.dueDate ? `If it isn't paid by ${due}, send the polite reminder the next working day.` : '';
  } else if (stage === 'gentle') {
    subject = `Invoice ${num} is now past due`;
    lines = [
      `Hi ${first},`,
      `I'm following up on invoice ${num}${forProject}, for ${amt}, which was due on ${due}. I haven't received the payment yet, so I wanted to check that the invoice reached you.`,
      `${attachLine}${pay}`,
      'Could you let me know when I can expect the payment? If anything on the invoice needs correcting, just tell me and I\'ll send an updated copy.',
      `Thanks,\n${sign}`,
    ];
    nextStep = `No reply in a week? Send the firm follow-up around ${fmtDateLong(addDays(today, 7))}.`;
  } else if (stage === 'firm') {
    const payBy = fmtDateLong(addDays(today, 5));
    subject = `Second reminder: invoice ${num} is ${lateText} overdue`;
    lines = [
      `Hi ${first},`,
      `Invoice ${num}${forProject}, for ${amt}, was due on ${due} and is now ${lateText} overdue. I've sent a reminder but haven't heard back yet.`,
      `Please arrange payment by ${payBy}.${fee ? ` As set out in my terms, a late fee of ${fee} applies to payments received after that date.` : ''}`,
      `${attachLine}${pay}`,
      'If there is a problem with the invoice or the payment, please reply and let me know so we can sort it out quickly.',
      `Regards,\n${sign}`,
    ];
    nextStep = `Still unpaid on ${payBy}? Send the final notice.`;
  } else {
    const payBy = fmtDateLong(addDays(today, 7));
    subject = `Final notice: invoice ${num} (${lateText} overdue)`;
    lines = [
      `Hello ${first},`,
      `This is a final notice about invoice ${num}${forProject}, for ${amt}. It was due on ${due} and is now ${lateText} overdue. Despite earlier reminders, I have not received the payment or a reply.`,
      `Please pay the full amount by ${payBy}.${fee ? ` A late fee of ${fee} now applies, as set out in my terms.` : ''}${i.pauseWork ? ' Until the invoice is settled, I am pausing any further work on the project.' : ''}`,
      `If the payment isn't received by then, I will have to consider other ways to recover the amount, such as a collection agency or a small claims process.`,
      `${attachLine}${pay}`,
      "I would much rather resolve this directly, so please get in touch if there's an issue.",
      `Regards,\n${sign}`,
    ];
    nextStep = 'If this goes unanswered, check the dispute options on the platform you used, or get local advice on small claims.';
  }

  return { subject, body: lines.join('\n\n'), nextStep };
}
