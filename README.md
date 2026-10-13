# SoloKit

Free, private tools for freelancers who work with clients around the world.
Live at https://saifi17.github.io/solokit/

The tools follow the order of a freelance job:

1. **Meeting planner**: shared working hours across time zones, calendar invites, share links
2. **Rate calculator**: minimum hourly/day rate from income goal, costs, tax and billable hours
3. **Quote generator**: priced quotes with deposit, timeline and terms; becomes an invoice in one click
4. **Time tracker**: timer per client; unbilled hours become invoice lines; CSV timesheets
5. **Invoice generator**: three templates, logo, any currency, A4/Letter, PAID stamp, PDF
6. **Payment fee calculator**: PayPal, Wise, Payoneer, Stripe and bank wire, with marketplace and conversion fees
7. **Payment reminders**: four stages of late-payment emails, filled in from saved invoices

Plus a **Workspace** (all documents, clients, business details, backup/restore) and offline support.
Everything is stored in the visitor's browser (localStorage). There is no server.

## Run it locally
```
npm install
npm run dev      # http://localhost:4321/solokit/
npm run build    # static files go to dist/ (also writes the offline service worker)
npx astro check  # type-check
```

## How the code is organised
- `src/data/` – the tool list (`tools.ts`), icons, currencies, cities, payment fees (`fees.ts`, with sources and the date they were checked).
- `src/lib/` – plain TypeScript logic with no UI: storage, formatting, profile, documents, time entries, time zones, calendar files, email templates, backups.
- `src/islands/` – the interactive tools, written in Preact (React-style components). `ui.tsx` has shared building blocks.
- `src/layouts/` – `Base.astro` (head, header, footer) and `ToolLayout.astro` (every tool page: heading, tool, article, FAQ, previous/next step).
- `src/pages/` – one file per page. Each tool page holds its SEO text and FAQ.
- `src/styles/` – `global.css` (design tokens, components), `tools.css` (page/tool styles), `doc.css` (invoice and quote documents, print).

## Updating payment fees
Edit `src/data/fees.ts`, update `FEES_CHECKED`, and keep each `source` link pointing to the provider's official fee page.

Pushing to `main` builds and deploys the site through GitHub Actions.
