import { test, expect, chromium } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { QUERY_URL, PDF_URL } from "../../src/client";
const fixture = (index = 1) =>
  `<respuestaCorrecta><ejercicio>2025</ejercicio><modelo>130</modelo><periodo>1T</periodo><nif>11111111H</nif><csv>TEST${String(index).padStart(12, "0")}</csv><expediente>TEST${index}</expediente><justificante>130${String(index).padStart(10, "0")}</justificante><fechaYHoraPresentacion>2025-04-20T10:30:00</fechaYHoraPresentacion></respuestaCorrecta>`;
const xml = (body = fixture()) =>
  `<servicioConsultasDirectas>${body}</servicioConsultasDirectas>`;
test("read-only downloader: strict XML, PDF, persistence, locks and interruption", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "aeat-downloader-browser-"));
  const extension = join(temporary, "extension");
  await cp(resolve("build"), extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  manifest.host_permissions = manifest.optional_host_permissions;
  await writeFile(join(extension, "manifest.json"), JSON.stringify(manifest));
  const context = await chromium.launchPersistentContext(
    join(temporary, "profile"),
    {
      executablePath: process.env.CHROMIUM_PATH,
      channel: process.env.CHROMIUM_PATH ? undefined : "chromium",
      headless: true,
      acceptDownloads: true,
      args: [
        `--disable-extensions-except=${extension}`,
        `--load-extension=${extension}`,
        "--no-sandbox",
        "--host-resolver-rules=MAP * ~NOTFOUND",
        "--disable-background-networking",
      ],
    },
  );
  try {
    let queryResponse = xml();
    let pdfResponse = "%PDF-1.7\nsynthetic fixture\n%%EOF";
    let pdfCalls = 0;
    let hold = false;
    let release: (() => void) | undefined;
    let redirect = false;
    const requests: string[] = [];
    let batchMode = false;
    let holdBatch = false;
    let releaseQuery: (() => void) | undefined;
    const batchCalls: string[] = [];
    const failedOnce = new Set<string>();
    await context.route(/^https?:\/\//, async (route) => {
      const request = route.request();
      const url = request.url();
      requests.push(url);
      expect([QUERY_URL, PDF_URL]).toContain(url);
      expect(request.method()).toBe("POST");
      if (url === QUERY_URL && batchMode) {
        const values = new URLSearchParams(request.postData()!);
        const model = values.get("MOD")!;
        const year = values.get("EJF")!;
        const key = model + "/" + year;
        batchCalls.push(key);
        if (holdBatch && key === "303/2024") {
          await new Promise<void>((resolve) => {
            releaseQuery = resolve;
          });
          await route.abort().catch(() => {});
          return;
        }
        expect(values.get("FED")).toBe("20240101");
        if (!failedOnce.has(key) && key === "303/2024") {
          failedOnce.add(key);
          await route.fulfill({ status: 403, body: "certificate required" });
        } else if (!failedOnce.has(key) && key === "130/2025") {
          failedOnce.add(key);
          await route.fulfill({
            contentType: "application/xml",
            body: xml("<error>test query error</error>"),
          });
        } else {
          await route.fulfill({
            contentType: "application/xml",
            body: xml(
              fixture(Number(model) + Number(year))
                .replaceAll("2025", year)
                .replace("<modelo>130</modelo>", `<modelo>${model}</modelo>`),
            ),
          });
        }
      } else if (url === QUERY_URL) {
        expect(
          Object.fromEntries(new URLSearchParams(request.postData()!)),
        ).toMatchObject({
          NIF: "11111111H",
          MOD: "130",
          EJF: "2025",
          FED: "20250101",
          FEH: "20260131",
        });
        if (redirect)
          await route.fulfill({
            status: 302,
            headers: { location: "https://example.invalid/forbidden" },
          });
        else
          await route.fulfill({
            contentType: "application/xml",
            body: queryResponse,
          });
      } else if (url === PDF_URL) {
        pdfCalls++;
        if (hold) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          await route.abort().catch(() => {});
        } else
          await route.fulfill({
            contentType: "application/pdf",
            body: pdfResponse,
          });
      } else await route.abort();
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    const base = `chrome-extension://${new URL(worker.url()).host}`;
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/index.html`);
    await expect(page.locator("#selection-fields")).toBeEnabled();
    await page.locator("#nif").fill("11111111H");
    await page.locator("#name").fill("PERSONA DE PRUEBA");
    await page.locator("#year-from").fill("2025");
    await page.locator("#year-to").fill("2025");
    await page.locator("#date-options > summary").click();
    await page.locator("#from").fill("2025-01-01");
    await page.locator("#to").fill("2026-01-31");
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#results li")).toHaveCount(1);
    for (const bad of [
      "<html>login</html>",
      xml(fixture().replace("11111111H", "22222222J")),
      xml(fixture().replace("2025-04-20", "2024-04-20")),
      "<!DOCTYPE x><servicioConsultasDirectas/>",
      xml(""),
      xml(fixture() + fixture()),
      xml(fixture().replace("</modelo>", "</incorrect>")),
    ]) {
      queryResponse = bad;
      await page
        .getByRole("button", { name: "Consultar AEAT", exact: true })
        .click();
      await expect(page.locator("#status")).toHaveClass(/error/);
      await expect(page.locator("#results li")).toHaveCount(0);
    }
    redirect = true;
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#status")).toHaveClass(/error/);
    redirect = false;
    queryResponse = xml();
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#results li")).toHaveCount(1);
    pdfResponse = "<html>login</html>";
    await page.locator("#download").click();
    await expect(page.locator(".aeat-state.error")).toHaveCount(1);
    pdfResponse = "%PDF-1.7\nsynthetic fixture\n%%EOF";
    const downloaded = page.waitForEvent("download");
    await page.locator("#download").click();
    const download = await downloaded;
    // Playwright redirects browser downloads to its UUID-named artifact store.
    const bytes = await readFile((await download.path())!);
    expect(bytes.toString()).toBe(pdfResponse);
    await expect(page.locator(".aeat-state.done")).toHaveCount(1);
    const state = await page.evaluate(
      async () =>
        (await chrome.storage.local.get("aeat-history-v1-normal"))[
          "aeat-history-v1-normal"
        ] as { entries: Record<string, { sha256: string }> },
    );
    expect(Object.values(state.entries)[0].sha256).toBe(
      createHash("sha256").update(bytes).digest("hex"),
    );
    await page.reload();
    await expect(page.locator(".aeat-state.done")).toHaveCount(1);
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#download")).toBeDisabled();
    expect(pdfCalls).toBe(2);
    queryResponse = xml(fixture(2));
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#download")).toBeEnabled();
    hold = true;
    await page.locator("#download").click();
    await expect(page.locator(".aeat-state.fetching")).toHaveCount(1);
    const second = await context.newPage();
    await second.goto(`${base}/index.html`);
    await second.locator("#refresh").click();
    await expect(second.locator("#status")).toContainText("otra pestaña");
    await page.reload();
    release?.();
    hold = false;
    await expect(page.locator(".aeat-state.pending")).toHaveCount(1);
    // Simulate a crash in the small window after Chrome accepts a download,
    // before its ID reaches storage: must require a manual review, not redownload.
    await page.evaluate(async () => {
      const key = "aeat-history-v1-normal";
      const archive = (await chrome.storage.local.get(key))[key] as {
        visible: string[];
        entries: Record<string, { state: string }>;
      };
      archive.entries[archive.visible[0]].state = "saving";
      await chrome.storage.local.set({ [key]: archive });
    });
    await page.reload();
    await expect(page.locator(".aeat-state.uncertain")).toHaveCount(1);
    await expect(page.locator("#download")).toBeDisabled();
    queryResponse = xml(
      Array.from({ length: 100 }, (_, index) => fixture(index + 10)).join(""),
    );
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#limit")).toBeVisible();
    await expect(page.locator("#results li")).toHaveCount(25);
    await expect(page.locator("#page-range")).toHaveText(
      "1–25 de 100 documentos",
    );
    queryResponse = xml(fixture(1) + fixture(2) + fixture(3));
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#results li")).toHaveCount(3);
    await expect(page.locator("#download")).toBeEnabled();
    // A batch survives authentication failure/reload and only retries unfinished
    // combinations. A service-level error does not suppress later combinations.
    batchMode = true;
    await page.locator('input[name="models"][value="303"]').check();
    await page.locator("#year-from").fill("2024");
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText("403");
    await expect(page.locator("#query-progress")).toHaveText(
      "1 de 4 consultas completadas",
    );
    expect(batchCalls).toEqual(["130/2024", "303/2024"]);
    await page.reload();
    await expect(
      page.locator('input[name="models"][value="303"]'),
    ).toBeChecked();
    await page.locator("#resume").click();
    await expect(page.locator("#query-progress")).toHaveText(
      "3 de 4 consultas completadas",
    );
    await expect(page.locator("#status")).toContainText(
      "1 consultas con error",
    );
    expect(batchCalls).toEqual([
      "130/2024",
      "303/2024",
      "303/2024",
      "130/2025",
      "303/2025",
    ]);
    await page.locator("#resume").click();
    await expect(page.locator("#query-progress")).toHaveText(
      "4 de 4 consultas completadas",
    );
    await expect(page.locator("#resume")).toBeHidden();
    await expect(page.locator("#results li")).toHaveCount(4);
    expect(batchCalls.filter((key) => key === "130/2024")).toHaveLength(1);
    expect(batchCalls.filter((key) => key === "303/2025")).toHaveLength(1);
    const beforeBatchDownloads = pdfCalls;
    await page.locator("#download").click();
    await expect(page.locator(".aeat-state.done")).toHaveCount(4);
    expect(pdfCalls - beforeBatchDownloads).toBe(4);
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#query-progress")).toHaveText(
      "4 de 4 consultas completadas",
    );
    await expect(page.locator("#download")).toBeDisabled();
    expect(pdfCalls - beforeBatchDownloads).toBe(4);
    await page.emulateMedia({ reducedMotion: "reduce" });
    const evidence = resolve("test-results/screenshots");
    await mkdir(evidence, { recursive: true });
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: join(evidence, `aeat-${width}.png`),
        fullPage: true,
      });
    }
    // Closing during a query leaves it resumable; preceding results survive.
    holdBatch = true;
    const beforeInterruptedBatch = batchCalls.length;
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#queries")).toContainText("Consultando…");
    await expect.poll(() => !!releaseQuery).toBe(true);
    await page.reload();
    releaseQuery?.();
    holdBatch = false;
    await expect(page.locator("#query-progress")).toHaveText(
      "1 de 4 consultas completadas",
    );
    await page.locator("#resume").click();
    await expect(page.locator("#query-progress")).toHaveText(
      "4 de 4 consultas completadas",
    );
    expect(batchCalls.slice(beforeInterruptedBatch)).toEqual([
      "130/2024",
      "303/2024",
      "303/2024",
      "130/2025",
      "303/2025",
    ]);
    await expect(page.locator("#download")).toBeDisabled();
    expect(errors).toEqual([]);
    expect(requests.every((url) => url === QUERY_URL || url === PDF_URL)).toBe(
      true,
    );
  } finally {
    await context.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
