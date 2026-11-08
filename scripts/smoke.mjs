// Smoke test for a deployed (or locally served) site: opens X-Frame on each
// experiment and checks that the iframe actually renders the experiment.
// Usage: node scripts/smoke.mjs https://onddi.github.io/Experiment-X/
// Needs the "playwright" package and a Chromium install (CI installs both).
import playwright from 'playwright';
const { chromium } = playwright;
import { mkdirSync } from 'node:fs';

const base = (process.argv[2] ?? 'http://localhost:4173/').replace(/\/?$/, '/');
mkdirSync('smoke', { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('console', (m) => ['error', 'warning'].includes(m.type()) && console.log(`  console.${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`));
page.on('requestfailed', (r) => console.log(`  request failed: ${r.url()} (${r.failure()?.errorText})`));
page.on('response', (r) => r.status() >= 400 && console.log(`  HTTP ${r.status()}: ${r.url()}`));

await page.goto(base, { waitUntil: 'networkidle' });
const slugs = await page.$$eval('.exp-link', (links) => links.map((a) => decodeURIComponent(a.hash.slice(2))));
console.log(`Found ${slugs.length} experiments: ${slugs.join(', ')}`);

let failed = 0;
for (const slug of slugs) {
  console.log(`\n# ${slug}`);
  await page.goto('about:blank');
  const docResponse = page.waitForResponse((r) => r.url().includes(`/experiments/${slug}/`) && r.request().resourceType() === 'document');
  await page.goto(`${base}#/${slug}`);
  const res = await docResponse.catch(() => null);
  if (res) {
    const h = res.headers();
    console.log(`  document: HTTP ${res.status()} ${res.url()}`);
    for (const k of ['content-type', 'x-frame-options', 'content-security-policy', 'cross-origin-embedder-policy', 'cross-origin-opener-policy', 'cache-control']) {
      if (h[k]) console.log(`  ${k}: ${h[k]}`);
    }
  } else {
    console.log('  no document response seen for the iframe');
  }
  await page.waitForTimeout(2000);
  const frame = page.frames().find((f) => f.url().includes(`/experiments/${slug}/`));
  const info = frame
    ? await frame.evaluate(() => ({
        url: location.href,
        elements: document.body.querySelectorAll('*').length,
        styles: document.styleSheets.length,
        bg: getComputedStyle(document.body).backgroundColor,
      }))
    : null;
  console.log(`  iframe: ${JSON.stringify(info)}`);
  await page.screenshot({ path: `smoke/${slug}.png` });
  // A working experiment has loaded its stylesheet and rendered more than its empty mount point.
  if (!info || info.styles === 0 || info.elements < 2) {
    failed++;
    console.log('  FAIL: experiment did not render in the iframe');
  } else {
    console.log('  ok');
  }
}

await browser.close();
if (failed) {
  console.log(`\n${failed} experiment(s) failed to render.`);
  process.exit(1);
}
