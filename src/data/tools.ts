// Every tool on the site, in the order a freelance job happens:
// talk to the client, price the work, quote, track time, invoice,
// get paid, and follow up if the money is late.
// The header menu, home page, footer and "previous / next step" links
// all read from this list.

export type Tool = {
  slug: string;
  step: number;        // position in the job, 1..7
  stage: string;       // short stage name shown in the UI
  name: string;        // short tool name
  title: string;       // full name (used in headings)
  short: string;       // one-line description
  ask: string;         // what a client says at this point in the job
  icon: string;        // key in src/data/icons.ts
};

export const tools: Tool[] = [
  {
    slug: 'time-zone-meeting-planner',
    step: 1,
    stage: 'Meet',
    name: 'Meeting planner',
    title: 'Time zone meeting planner',
    short: 'Find the hours you share with clients abroad and send a calendar invite.',
    ask: 'Can we hop on a call this week?',
    icon: 'globe',
  },
  {
    slug: 'freelance-hourly-rate-calculator',
    step: 2,
    stage: 'Price',
    name: 'Rate calculator',
    title: 'Freelance rate calculator',
    short: 'Work out the hourly and day rate that covers tax, costs and time off.',
    ask: "What's your hourly rate?",
    icon: 'rate',
  },
  {
    slug: 'project-quote-generator',
    step: 3,
    stage: 'Quote',
    name: 'Quote generator',
    title: 'Project quote generator',
    short: 'Send a clear, priced quote with a deposit, timeline and terms.',
    ask: 'How much for the whole project?',
    icon: 'quote',
  },
  {
    slug: 'time-tracker',
    step: 4,
    stage: 'Track',
    name: 'Time tracker',
    title: 'Time tracker',
    short: 'Time your work per client, then turn the hours into an invoice.',
    ask: 'How many hours did it take?',
    icon: 'timer',
  },
  {
    slug: 'invoice-generator',
    step: 5,
    stage: 'Invoice',
    name: 'Invoice generator',
    title: 'Invoice generator',
    short: 'Professional invoices with your logo. Save as PDF, no watermark.',
    ask: 'Looks great! Send me the invoice.',
    icon: 'invoice',
  },
  {
    slug: 'payment-fee-calculator',
    step: 6,
    stage: 'Get paid',
    name: 'Payment fee calculator',
    title: 'Payment fee calculator',
    short: 'Compare what PayPal, Wise, Payoneer and Stripe leave you with.',
    ask: 'How would you like to be paid?',
    icon: 'fee',
  },
  {
    slug: 'late-payment-email-generator',
    step: 7,
    stage: 'Follow up',
    name: 'Payment reminders',
    title: 'Late payment email generator',
    short: 'Polite, firm reminder emails for unpaid invoices, ready to send.',
    ask: "I'll pay it next week, promise.",
    icon: 'mail',
  },
];

export const toolBySlug = (slug: string) => tools.find((t) => t.slug === slug)!;
export const toolUrl = (base: string, slug: string) => `${base}tools/${slug}/`;
