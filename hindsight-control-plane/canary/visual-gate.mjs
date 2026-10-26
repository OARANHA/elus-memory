import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import assert from "node:assert/strict";

const browser = await chromium.launch({ headless: true });
await mkdir("canary-evidence", { recursive: true });
try {
  for (const [name, width, height] of [["desktop", 1440, 900], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("http://127.0.0.1:4179/?bank=memo.elus360", { waitUntil: "networkidle" });
    await page.getByText("Custo estimado de IA").waitFor();
    await page.getByText("Mês atual").waitFor();
    await page.getByText("DeepSeek-V4-Flash-0731").waitFor();
    await page.getByText(/chamadas sem preço\/uso verificável/).waitFor();
    const numbers = await page.locator("body").innerText();
    assert.match(numbers, /estimativa, não é fatura/);
    assert.ok(!numbers.includes("NaN"));
    assert.ok(!numbers.includes("Infinity"));
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    assert.equal(overflow, false, `Horizontal overflow at ${width}px`);
    assert.deepEqual(errors, [], `Browser errors at ${width}px`);
    await page.screenshot({ path: `canary-evidence/${name}.png`, fullPage: true });
    await page.goto("http://127.0.0.1:4179/?bank=unpriced", { waitUntil: "networkidle" });
    await page.getByText("Indisponível").first().waitFor();
    assert.ok((await page.locator("body").innerText()).includes("não precificadas"));
    await page.screenshot({ path: `canary-evidence/${name}-unknown.png`, fullPage: true });
    await page.close();
  }
  process.stdout.write("CANARY_VISUAL=GREEN (desktop 1440px, mobile 390px, unknown pricing)\\n");
} finally {
  await browser.close();
}
