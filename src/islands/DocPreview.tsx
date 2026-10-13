// The invoice / quote document itself: what the client sees and what is
// printed to PDF. Three templates share the same markup and differ in CSS
// (see src/styles/doc.css).
import type { Doc } from '../lib/documents';
import { totals, lineAmount } from '../lib/documents';
import { money, fmtDate, num } from '../lib/format';

const unitLabel: Record<string, string> = { hrs: 'hrs', days: 'days', items: '', '': '' };

/** Multi-line text (addresses, notes) with line breaks kept. */
function Lines({ text }: { text: string }) {
  const parts = text.replace(/\s+$/, '').split('\n');
  return <>{parts.map((l, i) => <span class="ln" key={i}>{l || ' '}</span>)}</>;
}

export default function DocPreview({ doc, stampKey = 0 }: { doc: Doc; stampKey?: number }) {
  const t = totals(doc);
  const m = (n: number) => money(n, doc.currency);
  const isQuote = doc.type === 'quote';
  const title = isQuote ? 'Quote' : 'Invoice';
  const f = doc.from;
  const c = doc.client;
  const hasDiscount = t.discount > 0;
  const hasTax = (doc.taxRate || 0) > 0;
  const fromName = f.businessName || f.yourName;
  const showStamp = (!isQuote && doc.status === 'paid') || (isQuote && doc.status === 'accepted');
  const amountDue = isQuote ? t.total : t.total;

  return (
    <article class={`doc tpl-${doc.template} paper-${doc.paper}`} style={{ '--doc-accent': doc.accent } as Record<string, string>} aria-label={`${title} preview`}>
      <header class="doc-head">
        <div class="doc-brand">
          {doc.showLogo && f.logo && <img class="doc-logo" src={f.logo} alt="" />}
          <div class="doc-from-name">{fromName || <span class="doc-ph">Your business name</span>}</div>
          {f.businessName && f.yourName && <div class="doc-small">{f.yourName}</div>}
        </div>
        <div class="doc-titlebox">
          <h1 class="doc-title">{title}</h1>
          <div class="doc-number">{doc.number ? `No. ${doc.number}` : ''}</div>
        </div>
      </header>

      <section class="doc-meta">
        <div class="doc-party">
          <h2>{isQuote ? 'Prepared for' : 'Billed to'}</h2>
          <div class="doc-party-name">{c.name || <span class="doc-ph">Client name</span>}</div>
          {c.contact && <div>{c.contact}</div>}
          {c.address && <Lines text={c.address} />}
          {c.email && <div>{c.email}</div>}
          {c.taxId && <div>Tax ID: {c.taxId}</div>}
        </div>
        <div class="doc-party">
          <h2>From</h2>
          <div class="doc-party-name">{fromName || <span class="doc-ph">Your name</span>}</div>
          {f.address && <Lines text={f.address} />}
          {f.email && <div>{f.email}</div>}
          {f.phone && <div>{f.phone}</div>}
          {f.website && <div>{f.website}</div>}
          {f.taxId && <div>Tax ID: {f.taxId}</div>}
        </div>
        <dl class="doc-dates">
          <div><dt>{isQuote ? 'Date' : 'Issue date'}</dt><dd>{fmtDate(doc.issueDate)}</dd></div>
          <div><dt>{isQuote ? 'Valid until' : 'Due date'}</dt><dd>{fmtDate(doc.dueDate)}</dd></div>
          {isQuote && doc.timeline && <div><dt>Timeline</dt><dd>{doc.timeline}</dd></div>}
          {!isQuote && doc.sourceQuote && <div><dt>Quote</dt><dd>{doc.sourceQuote}</dd></div>}
          <div class="doc-due"><dt>{isQuote ? 'Total' : 'Amount due'}</dt><dd>{m(amountDue)}</dd></div>
        </dl>
      </section>

      {doc.project && <p class="doc-project"><span>Project</span>{doc.project}</p>}

      <table class="doc-items">
        <thead>
          <tr><th class="d">Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr>
        </thead>
        <tbody>
          {doc.items.map((it) => (
            <tr key={it.id}>
              <td class="d">{it.description ? <Lines text={it.description} /> : <span class="doc-ph">Description of the work</span>}</td>
              <td class="n">{num(Number(it.qty) || 0, Number.isInteger(Number(it.qty)) ? 0 : 2)}{unitLabel[it.unit] ? ` ${unitLabel[it.unit]}` : ''}</td>
              <td class="n">{m(Number(it.rate) || 0)}</td>
              <td class="n">{m(lineAmount(it))}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div class="doc-bottom">
        <div class="doc-stamp-slot">
          {showStamp && (
            <div class={`doc-stamp ${isQuote ? 'accepted' : ''}`} key={stampKey}>
              <b>{isQuote ? 'Accepted' : 'Paid'}</b>
              {!isQuote && doc.paidDate && <span>{fmtDate(doc.paidDate)}</span>}
            </div>
          )}
        </div>
        <dl class="doc-totals">
          {(hasDiscount || hasTax) && <div><dt>Subtotal</dt><dd>{m(t.subtotal)}</dd></div>}
          {hasDiscount && <div><dt>Discount{doc.discountType === 'percent' ? ` (${num(doc.discountValue, doc.discountValue % 1 ? 1 : 0)}%)` : ''}</dt><dd>−{m(t.discount)}</dd></div>}
          {hasTax && <div><dt>{doc.taxLabel || 'Tax'} ({num(doc.taxRate, doc.taxRate % 1 ? 1 : 0)}%)</dt><dd>{m(t.tax)}</dd></div>}
          <div class="doc-total"><dt>{isQuote ? 'Total' : 'Amount due'}</dt><dd>{m(t.total)}</dd></div>
          {isQuote && doc.deposit > 0 && doc.deposit < 100 && (
            <div class="doc-deposit"><dt>Deposit to start ({num(doc.deposit)}%)</dt><dd>{m(t.deposit)}</dd></div>
          )}
          {isQuote && doc.deposit >= 100 && <div class="doc-deposit"><dt>Payable in full upfront</dt><dd>{m(t.total)}</dd></div>}
        </dl>
      </div>

      <section class="doc-notes">
        {!isQuote && doc.paymentDetails && (
          <div><h2>How to pay</h2><Lines text={doc.paymentDetails} /></div>
        )}
        {isQuote && doc.quoteTerms && (
          <div><h2>Scope & terms</h2><Lines text={doc.quoteTerms} /></div>
        )}
        {doc.notes && <div><h2>Notes</h2><Lines text={doc.notes} /></div>}
        {isQuote && doc.paymentDetails && (
          <div><h2>Payment details</h2><Lines text={doc.paymentDetails} /></div>
        )}
      </section>

      {isQuote && (
        <section class="doc-accept">
          <div><span class="doc-line" /><span>Accepted by (name and signature)</span></div>
          <div><span class="doc-line" /><span>Date</span></div>
        </section>
      )}

    </article>
  );
}
