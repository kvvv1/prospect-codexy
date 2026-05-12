const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.resolve(__dirname, "playwright-report");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const events = {
  console: [],
  pageErrors: [],
  requestsFailed: [],
  responses: [],
  snapshots: [],
};

async function snapshot(page, name) {
  const file = path.join(outDir, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  const state = await page.evaluate(() => ({
    url: location.href,
    title: document.title,
    bodyText: document.body.innerText.slice(0, 2000),
    rootHtml: document.querySelector("#root")?.innerHTML.slice(0, 4000) || "",
    rootChildCount: document.querySelector("#root")?.children.length || 0,
    background: getComputedStyle(document.body).backgroundColor,
    scripts: [...document.scripts].map((script) => script.src || "inline"),
    styles: [...document.querySelectorAll('link[rel="stylesheet"]')].map((link) => link.href),
  }));
  events.snapshots.push({ name, file, state });
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  page.on("console", (message) => {
    events.console.push({
      type: message.type(),
      text: message.text(),
      location: message.location(),
    });
  });

  page.on("pageerror", (error) => {
    events.pageErrors.push({ message: error.message, stack: error.stack });
  });

  page.on("requestfailed", (request) => {
    events.requestsFailed.push({
      url: request.url(),
      method: request.method(),
      failure: request.failure()?.errorText,
    });
  });

  page.on("response", (response) => {
    const url = response.url();
    if (url.includes("prospect.codexy.com.br") || url.includes("/assets/")) {
      events.responses.push({
        url,
        status: response.status(),
        contentType: response.headers()["content-type"] || "",
      });
    }
  });

  await page.goto("https://prospect.codexy.com.br/", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(1500);
  await snapshot(page, "01-initial");

  const inputs = await page.locator("input").count();
  const buttons = await page.locator("button").count();
  events.initialCounts = { inputs, buttons };

  if (inputs >= 2) {
    await page.locator("input").nth(0).fill("codexy@admin");
    await page.locator("input").nth(1).fill("codexy@2025");
    await snapshot(page, "02-login-filled");
    await page.locator("button", { hasText: /Entrar/i }).click();
    await page.waitForTimeout(6000);
    await snapshot(page, "03-after-login");
  }

  fs.writeFileSync(path.join(outDir, "events.json"), JSON.stringify(events, null, 2));
  await browser.close();

  const summary = {
    initialCounts: events.initialCounts,
    pageErrors: events.pageErrors.map((error) => error.message),
    failedRequests: events.requestsFailed,
    consoleErrors: events.console.filter((item) => ["error", "warning"].includes(item.type)),
    snapshots: events.snapshots.map((item) => ({
      name: item.name,
      rootChildCount: item.state.rootChildCount,
      bodyText: item.state.bodyText,
      rootHtmlStart: item.state.rootHtml.slice(0, 500),
      file: item.file,
    })),
  };

  console.log(JSON.stringify(summary, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
