// One list of every tool on the site. The home page, the footer and the
// "related tools" section all read from here, so adding a tool means adding
// one entry. `live: false` shows it as "coming soon" without a link.
export const tools = [
  {
    slug: 'freelance-hourly-rate-calculator',
    name: 'Hourly rate calculator',
    short: 'Work out the hourly and day rate you need to hit your income goal.',
    icon: 'rate',
    live: true,
  },
  {
    slug: 'invoice-generator',
    name: 'Invoice generator',
    short: 'Fill in a form, save a clean invoice as a PDF. No sign-up.',
    icon: 'invoice',
    live: true,
  },
  {
    slug: 'time-zone-meeting-planner',
    name: 'Time zone meeting planner',
    short: 'See the working hours you share with clients in other countries.',
    icon: 'clock',
    live: true,
  },
  {
    slug: 'project-quote-generator',
    name: 'Project quote generator',
    short: 'Turn a project scope into a priced quote you can send.',
    icon: 'quote',
    live: false,
  },
  {
    slug: 'payment-fee-calculator',
    name: 'Payment fee calculator',
    short: 'Compare what PayPal, Wise and Stripe take from a payment.',
    icon: 'fee',
    live: false,
  },
  {
    slug: 'late-payment-email-generator',
    name: 'Late payment email generator',
    short: 'Polite, firm reminder emails for unpaid invoices.',
    icon: 'mail',
    live: false,
  },
];

export const toolBySlug = (slug) => tools.find((t) => t.slug === slug);
