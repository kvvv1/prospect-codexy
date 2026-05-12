const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const outDir = path.resolve(__dirname, "playwright-report-full");
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const report = {
  url: "https://prospect.codexy.com.br/",
  startedAt: new Date().toISOString(),
  console: [],
  pageErrors: [],
  failedRequests: [],
  steps: [],
};

async function addStep(page, name, status = "ok", notes = "") {
  const safeName = `${String(report.steps.length + 1).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const screenshot = path.join(outDir, `${safeName}.png`);
  await page.screenshot({ path: screenshot, fullPage: true });
  const state = await page.evaluate(() => ({
    title: document.title,
    url: location.href,
    rootChildCount: document.querySelector("#root")?.children.length || 0,
    bodyText: document.body.innerText.slice(0, 2500),
    visibleButtons: [...document.querySelectorAll("button")].map((button) => button.innerText.trim()).filter(Boolean).slice(0, 40),
    visibleInputs: [...document.querySelectorAll("input, textarea, select")].map((input) => ({
      tag: input.tagName,
      value: input.value,
      text: input.closest("label")?.innerText || "",
    })).slice(0, 20),
  }));
  report.steps.push({ name, status, notes, screenshot, state });
}

async function clickNav(page, label) {
  await page.locator(".sidebar nav button").filter({ hasText: label }).first().click();
  await page.waitForTimeout(700);
  await addStep(page, `nav-${label}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  page.on("console", (message) => {
    report.console.push({ type: message.type(), text: message.text(), location: message.location() });
  });
  page.on("pageerror", (error) => report.pageErrors.push({ message: error.message, stack: error.stack }));
  page.on("requestfailed", (request) => report.failedRequests.push({ url: request.url(), method: request.method(), failure: request.failure()?.errorText }));

  await page.goto(report.url, { waitUntil: "networkidle", timeout: 45000 });
  await addStep(page, "login-screen");

  await page.locator("input").nth(0).fill("codexy@admin");
  await page.locator("input").nth(1).fill("codexy@2025");
  await addStep(page, "credentials-filled");
  await page.getByRole("button", { name: /^Entrar$/i }).click();
  await page.waitForTimeout(3500);
  await addStep(page, "after-login");

  for (const label of ["Criar Prospecção", "Aprovação", "Base Geral", "Meu CRM", "Follow-ups", "WhatsApp", "Admin", "Meu Dia"]) {
    await clickNav(page, label);
  }

  await page.locator(".sidebar nav button").filter({ hasText: "Criar Prospecção" }).first().click();
  await page.waitForTimeout(500);
  const textarea = page.locator("textarea").first();
  await textarea.fill("Quero vender landing page para odontologia em Belo Horizonte");
  await page.getByRole("button", { name: /^Gerar preview$/i }).click();
  await page.waitForTimeout(1800);
  await addStep(page, "prospecting-preview-generated", "ok", "Preview gerado. A busca não foi executada para não criar leads mock na base de produção.");

  report.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(outDir, "report.json"), JSON.stringify(report, null, 2));

  const markdown = [
    "# Auditoria Playwright - Codexy Prospect",
    "",
    `URL: ${report.url}`,
    `Início: ${report.startedAt}`,
    `Fim: ${report.finishedAt}`,
    "",
    "## Resultado",
    `- Erros de página: ${report.pageErrors.length}`,
    `- Requisições falhas: ${report.failedRequests.length}`,
    `- Console warnings/errors: ${report.console.filter((item) => ["warning", "error"].includes(item.type)).length}`,
    "",
    "## Passos",
    ...report.steps.map((step) => `- ${step.status.toUpperCase()} - ${step.name}: ${step.notes || step.state.bodyText.split("\\n").slice(0, 2).join(" / ")}`),
    "",
    "## Erros",
    ...(
      report.pageErrors.length
        ? report.pageErrors.map((error) => `- ${error.message}`)
        : ["- Nenhum erro de runtime capturado."]
    ),
    "",
    "## Requisições Falhas",
    ...(
      report.failedRequests.length
        ? report.failedRequests.map((request) => `- ${request.method} ${request.url}: ${request.failure}`)
        : ["- Nenhuma requisição falha capturada."]
    ),
    "",
    "## Observação",
    "- A auditoria gerou preview de prospecção, mas não executou a busca para não inserir leads de teste na base de produção.",
  ].join("\n");

  fs.writeFileSync(path.join(outDir, "README.md"), markdown);
  await browser.close();
  console.log(markdown);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
