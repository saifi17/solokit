// Typical fees for receiving an international payment from a client,
// as published by each provider. Checked 13 October 2026.
// Fees differ by country, account type and how the client pays, so every
// number is editable in the calculator and each method links to its source.

export const FEES_CHECKED = '13 October 2026';

export type FeeMethod = {
  id: string;
  name: string;          // shown in the list
  how: string;           // how the client pays
  pct: number;           // % taken from the payment
  fixed: number;         // fixed fee per payment (in the invoice currency)
  convPct: number;       // extra % when converting to your local currency
  convFixed: number;     // fixed fee when converting
  note: string;          // caveat shown under the result
  source: string;        // official page
};

export const feeMethods: FeeMethod[] = [
  {
    id: 'wise-ach',
    name: 'Wise',
    how: 'Client sends a local bank transfer (ACH) to your Wise USD account details',
    pct: 0,
    fixed: 0,
    convPct: 0.5,
    convFixed: 0.6,
    note: 'Receiving USD by local transfer is free. Converting costs about 0.3–0.6% for most currencies (up to ~2% for a few).',
    source: 'https://wise.com/us/pricing/business/receive',
  },
  {
    id: 'wise-wire',
    name: 'Wise (wire)',
    how: 'Client sends a USD wire or SWIFT payment to your Wise account',
    pct: 0,
    fixed: 6.11,
    convPct: 0.5,
    convFixed: 0.6,
    note: 'Wise charges 6.11 USD per incoming USD wire. The client\'s bank may also charge them to send it.',
    source: 'https://wise.com/us/pricing/business/receive',
  },
  {
    id: 'payoneer-bank',
    name: 'Payoneer',
    how: 'Client pays by bank transfer (ACH) to your Payoneer receiving account',
    pct: 1,
    fixed: 0,
    convPct: 2,
    convFixed: 0,
    note: 'Local USD transfers into a receiving account are free in some cases and 1% in others (for example, if USD isn\'t your local currency). Withdrawing to a bank in another currency costs 1.2–4%.',
    source: 'https://www.payoneer.com/fees/',
  },
  {
    id: 'payoneer-card',
    name: 'Payoneer (card)',
    how: 'Client pays a Payoneer payment request by credit card',
    pct: 3.99,
    fixed: 0.49,
    convPct: 2,
    convFixed: 0,
    note: 'Card payments cost up to 3.99% + 0.49 USD. Withdrawing to a bank in another currency costs 1.2–4%.',
    source: 'https://www.payoneer.com/fees/',
  },
  {
    id: 'paypal',
    name: 'PayPal',
    how: 'Client pays a PayPal invoice from another country',
    pct: 4.99,
    fixed: 0.49,
    convPct: 3,
    convFixed: 0,
    note: 'US rates: 3.49% + 0.49 USD, plus 1.5% for international payments. Converting a balance costs about 3–4%. Rates differ by country, and PayPal can\'t receive payments in some countries.',
    source: 'https://www.paypal.com/us/business/paypal-business-fees',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    how: 'Client pays an online invoice by card issued in another country',
    pct: 4.4,
    fixed: 0.3,
    convPct: 1,
    convFixed: 0,
    note: 'US rates: 2.9% + 30¢, plus 1.5% for international cards and 1% if currency is converted. Stripe is only available to businesses in certain countries.',
    source: 'https://stripe.com/pricing',
  },
  {
    id: 'bank-wire',
    name: 'Bank wire',
    how: 'Client sends a SWIFT transfer straight to your local bank',
    pct: 0,
    fixed: 25,
    convPct: 2.5,
    convFixed: 0,
    note: 'An example only: intermediary and receiving banks often take 10–45 USD, and banks\' exchange-rate margins are commonly 1–4%. Ask your bank for its real numbers.',
    source: '',
  },
];

// Marketplace fees taken before the money reaches you.
export const platforms = [
  { id: 'none', name: 'No marketplace', pct: 0, note: '' },
  { id: 'upwork', name: 'Upwork', pct: 10, note: 'Upwork\'s freelancer fee varies from 0% to 15% per contract (since May 2025). Check the rate shown on your contract.' },
  { id: 'fiverr', name: 'Fiverr', pct: 20, note: 'Fiverr keeps 20% of each order.' },
  { id: 'custom', name: 'Other', pct: 5, note: '' },
];

export type FeeResult = {
  afterPlatform: number;
  methodFee: number;
  received: number;     // in the invoice currency, before conversion
  convFee: number;
  final: number;        // what you end up with
  totalFees: number;    // everything lost on the way, including the marketplace
  pctLost: number;      // totalFees / amount
};

/** Money flow: client pays `amount` -> marketplace cut -> provider fee -> conversion. */
export function receive(amount: number, platformPct: number, m: Pick<FeeMethod, 'pct' | 'fixed' | 'convPct' | 'convFixed'>, convert: boolean): FeeResult {
  const afterPlatform = amount * (1 - platformPct / 100);
  const methodFee = afterPlatform > 0 ? afterPlatform * (m.pct / 100) + m.fixed : 0;
  const received = Math.max(0, afterPlatform - methodFee);
  const convFee = convert && received > 0 ? received * (m.convPct / 100) + m.convFixed : 0;
  const final = Math.max(0, received - convFee);
  const totalFees = amount - final;
  return { afterPlatform, methodFee, received, convFee, final, totalFees, pctLost: amount > 0 ? totalFees / amount : 0 };
}

/** Reverse: how much to charge so that `target` ends up with you. */
export function chargeFor(target: number, platformPct: number, m: Pick<FeeMethod, 'pct' | 'fixed' | 'convPct' | 'convFixed'>, convert: boolean): number {
  const received = convert ? (target + m.convFixed) / (1 - m.convPct / 100) : target;
  const afterPlatform = (received + m.fixed) / (1 - m.pct / 100);
  return afterPlatform / (1 - platformPct / 100);
}
