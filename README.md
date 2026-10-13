# SoloKit

Free, private tools for freelancers. Live at https://saifi17.github.io/solokit/

## Run it locally
```
npm install
npm run dev      # http://localhost:4321/solokit/
npm run build    # static files go to dist/
```

## How the code is organised
- `src/data/tools.js` – the list of tools. Add a tool here first.
- `src/layouts/Base.astro` – <head> SEO tags, header, footer.
- `src/layouts/ToolLayout.astro` – every tool page: title, tool, article, FAQ, related tools.
- `src/components/RateCalculator.astro` – the hourly rate calculator (also used on the home page).
- `src/pages/tools/*.astro` – one file per tool. The `<script>` at the bottom of each is the tool's logic and runs in the browser.
- `src/styles/global.css` – colours, fonts, form fields and the "slip" result card.

## Adding a tool
1. Add an entry to `src/data/tools.js` (set `live: true` when ready).
2. Create `src/pages/tools/<slug>.astro` using `ToolLayout`.
3. Write a useful article and 4–5 FAQ answers for the page; they help it rank on Google.

Pushing to `main` builds and deploys the site through GitHub Actions.
