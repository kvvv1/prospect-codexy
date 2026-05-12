const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const target = process.env.INTRO_URL || "http://127.0.0.1:5173/?introPreview=1";
const outDir = path.resolve(__dirname, "playwright-intro-report");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const report = {
  target,
  pageErrors: [],
  failedRequests: [],
  console: [],
  checks: [],
};

async function shot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const state = await page.evaluate(() => ({
    hasIntro: Boolean(document.querySelector(".signal-intro")),
    hasMark: Boolean(document.querySelector(".signal-logo-stage")),
    bodyText: document.body.innerText.slice(0, 1600),
    rootChildren: document.querySelector("#root")?.children.length || 0,
  }));
  report.checks.push({ name, file, state });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on("pageerror", (error) => report.pageErrors.push({ message: error.message, stack: error.stack }));
  page.on("console", (message) => report.console.push({ type: message.type(), text: message.text(), location: message.location() }));
  page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));

  await page.goto(target, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(800);
  await shot(page, "01-intro-visible");
  await page.waitForTimeout(4700);
  await shot(page, "02-intro-finished");
  await page.getByRole("button", { name: /Rever abertura/i }).click();
  await page.waitForTimeout(900);
  await shot(page, "03-replay-visible");
  await page.getByRole("button", { name: /Pular/i }).click();
  await page.waitForTimeout(500);
  await shot(page, "04-skip-finished");

  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();

  const summary = {
    target,
    pageErrors: report.pageErrors.map((error) => error.message),
    failedRequests: report.failedRequests,
    consoleProblems: report.console.filter((item) => ["error", "warning"].includes(item.type)),
    checks: report.checks.map((check) => ({
      name: check.name,
      hasIntro: check.state.hasIntro,
      hasMark: check.state.hasMark,
      bodyText: check.state.bodyText,
      file: check.file,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
