import { test, expect, chromium, type Page } from "@playwright/test";
import { cp, mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createHash } from "node:crypto";
import { AEAT_ORIGINS, QUERY_URL, PDF_URL } from "../../src/client";
const fixture = (index = 1) =>
  `<respuestaCorrecta><ejercicio>2025</ejercicio><modelo>130</modelo><periodo>1T</periodo><nif>11111111H</nif><csv>TEST${String(index).padStart(12, "0")}</csv><expediente>TEST${index}</expediente><justificante>130${String(index).padStart(10, "0")}</justificante><fechaYHoraPresentacion>2025-04-20T10:30:00</fechaYHoraPresentacion></respuestaCorrecta>`;
const xml = (body = fixture()) =>
  `<servicioConsultasDirectas>${body}</servicioConsultasDirectas>`;
const evidence = resolve("test-results/screenshots");
// Evidence screenshots of the current state at both widths and both themes.
// The theme is applied as theme.ts does, so it also works behind a modal dialog.
async function shoot(page: Page, name: string, target: string) {
  await mkdir(evidence, { recursive: true });
  // Without it, the capture can land mid-way through a colour transition.
  await page.emulateMedia({ reducedMotion: "reduce" });
  const theme = (choice?: string) =>
    page.evaluate((choice) => {
      const dark =
        choice === "dark" ||
        (!choice && matchMedia("(prefers-color-scheme: dark)").matches);
      const root = document.documentElement;
      root.dataset.theme = dark ? "dark" : "light";
      root.classList.toggle("wa-dark", dark);
      root.classList.toggle("wa-light", !dark);
    }, choice);
  for (const width of [1440, 390])
    for (const choice of ["light", "dark"]) {
      await page.setViewportSize({ width, height: 1000 });
      await theme(choice);
      await page.locator(target).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: join(evidence, `${name}-${width}-${choice}.png`),
      });
    }
  await theme();
  await page.setViewportSize({ width: 1280, height: 720 });
}
test("read-only downloader: strict XML, PDF, persistence, locks and interruption", async () => {
  // One long journey; its evidence screenshots and download polling add ~25 s.
  test.setTimeout(150000);
  const temporary = await mkdtemp(join(tmpdir(), "aeat-downloader-browser-"));
  const extension = join(temporary, "extension");
  await cp(resolve("build"), extension, { recursive: true });
  const manifest = JSON.parse(
    await readFile(join(extension, "manifest.json"), "utf8"),
  );
  // Read-only scope: no permission or host beyond downloads, storage and AEAT.
  expect(manifest.permissions).toEqual(["downloads", "storage"]);
  expect(manifest.optional_host_permissions).toEqual(AEAT_ORIGINS);
  expect(manifest.host_permissions).toBeUndefined();
  // The browser, not only the code, keeps the page on the two AEAT origins.
  expect(manifest.content_security_policy.extension_pages).toContain(
    "default-src 'self'; script-src 'self'; connect-src https://www1.agenciatributaria.gob.es https://www2.agenciatributaria.gob.es;",
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
    let queryResponse: string | Buffer = xml();
    let contractBreak = false;
    let pdfResponse = "%PDF-1.7\nsynthetic fixture\n%%EOF";
    let pdfCalls = 0;
    let hold = false;
    let release: (() => void) | undefined;
    let redirect = false;
    let singleQueries = 0;
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
        if (contractBreak && key === "303/2024") {
          await route.fulfill({
            contentType: "application/xml",
            body: xml(fixture().replace("11111111H", "22222222J")),
          });
        } else if (!failedOnce.has(key) && key === "303/2024") {
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
        singleQueries++;
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
    // Access already granted: no notice about Chrome's permission prompt.
    await expect(page.locator("#permission-note")).toHaveCount(0);
    // Nothing to report yet: no idle message.
    await expect(page.locator("#status")).toBeHidden();
    await shoot(page, "first-run", "body");
    const violations = await page.evaluate(async () => {
      const seen: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) =>
        seen.push(event.effectiveDirective),
      );
      const fetched = await fetch(
        "https://ka-f.fontawesome.com/releases/v7/svgs/solid/x.svg",
      ).then(
        () => "fetched",
        () => "blocked",
      );
      const image = new Image();
      image.src = "https://example.invalid/pixel.png";
      await new Promise((resolve) => (image.onerror = image.onload = resolve));
      await new Promise((resolve) => setTimeout(resolve, 50));
      return [fetched, ...seen];
    });
    expect(violations).toEqual(["blocked", "connect-src", "img-src"]);
    await page.locator("#nif").fill("11111111H");
    await page.locator("#name").fill("PERSONA DE PRUEBA");
    await page.locator("#year-from").fill("2025");
    await page.locator("#year-to").fill("2025");
    await page.locator("#date-options > summary").click();
    await page.locator("#from").fill("2025-01-01");
    await page.locator("#to").fill("2026-01-31");
    await expect(page.locator("#batch-preview")).toHaveText(
      "1 modelo × 1 ejercicio · 1 consulta",
    );
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#results li")).toHaveCount(1);
    // Counts of one take the singular.
    await expect(page.locator("#count")).toHaveText("1 declaración");
    await expect(page.locator("#download-summary")).toHaveText(
      "0 descargados · 1 pendiente",
    );
    await expect(page.locator("#selection-note")).toHaveText("1 seleccionado");
    await expect(page.locator("#page-range")).toHaveText("1–1 de 1 documento");
    await expect(page.locator("#status")).toContainText(
      "Lote consultado: 1 declaración.",
    );
    // Each rejection names its own cause; only access failures offer the
    // certificate page. A row that is otherwise valid never gets through.
    const notAdmitted = "Respuesta de consulta no admitida.";
    const access = "Abrir acceso con certificado";
    for (const [bad, reason, action] of [
      ["<html>login</html>", "no devolvió el XML esperado", access],
      [xml(fixture().replace("11111111H", "22222222J")), "no corresponde"],
      [xml(fixture().replace("2025-04-20", "2024-04-20")), "intervalo"],
      ["<!DOCTYPE x>" + xml(), "Respuesta XML no admitida."],
      [xml(""), "1 consulta con error"],
      [xml(fixture() + fixture()), "duplicadas"],
      // Same justificante (and so the same file name) with another CSV.
      [
        xml(
          fixture() +
            fixture(2).replace(
              "<justificante>1300000000002",
              "<justificante>1300000000001",
            ),
        ),
        "duplicadas",
      ],
      [
        xml(fixture().replace("</modelo>", "</incorrect>")),
        "no devolvió el XML esperado",
        access,
      ],
      [
        xml(
          Array.from({ length: 101 }, (_, index) => fixture(index + 10)).join(
            "",
          ),
        ),
        notAdmitted,
      ],
      [
        xml().replace(
          "<servicioConsultasDirectas>",
          '<servicioConsultasDirectas estado="parcial">',
        ),
        notAdmitted,
      ],
      [
        xml(fixture().replace("<csv>", '<csv origen="x">')),
        "no tienen el formato esperado",
      ],
      [xml("Sesión caducada" + fixture()), notAdmitted],
      [xml(fixture() + "<error>test query error</error>"), notAdmitted],
      [
        Buffer.concat([
          Buffer.from("<servicioConsultasDirectas><error>"),
          Buffer.from([0xf3]),
          Buffer.from("</error></servicioConsultasDirectas>"),
        ]),
        "no está en UTF-8",
      ],
    ] as [string | Buffer, string, string?][]) {
      queryResponse = bad;
      // Wait for this query to finish: the previous case's message may match too.
      const before = singleQueries;
      await page
        .getByRole("button", { name: "Consultar AEAT", exact: true })
        .click();
      await expect.poll(() => singleQueries).toBe(before + 1);
      await expect(page.locator("#cancel")).toBeHidden();
      await expect(page.locator("#status")).toHaveClass(/error/);
      await expect(page.locator("#status")).toHaveAttribute(
        "variant",
        "danger",
      );
      await expect(page.locator("#status")).toContainText(reason);
      if (action)
        await expect(page.locator("#status-action")).toHaveText(action);
      else await expect(page.locator("#status-action")).toHaveCount(0);
      await expect(page.locator("#results li")).toHaveCount(0);
    }
    // A failed fetch (here, a refused redirect) is a network or certificate failure.
    redirect = true;
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText(
      "No se pudo conectar con AEAT",
    );
    await expect(page.locator("#status-action")).toHaveText(access);
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
    // The explicit action downloads that entry alone, not via the bulk selection.
    const beforePrepare = pdfCalls;
    await page.getByRole("button", { name: /^Preparar otra descarga/ }).click();
    await expect(page.locator(".aeat-state.done")).toHaveCount(1);
    expect(pdfCalls).toBe(beforePrepare + 1);
    await expect(page.locator("#download")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: /^Descargar de nuevo/ }),
    ).toBeFocused();
    queryResponse = xml(
      Array.from({ length: 100 }, (_, index) => fixture(index + 10)).join(""),
    );
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#limit")).toBeVisible();
    await expect(page.locator("#limit")).toContainText("Acotar esta consulta");
    // A truncated query is counted apart from errors and offers to narrow it:
    // the form gets its model and year and opens the dates, without querying.
    await expect(page.locator("#show-issues")).toHaveText("1 incompleta");
    await page.locator('input[name="models"][value="303"]').check();
    await page.locator("#year-from").fill("2024");
    await page.locator("#show-issues").click();
    const queriesBefore = singleQueries;
    await page
      .getByRole("button", {
        name: "Acotar esta consulta: modelo 130, ejercicio 2025",
      })
      .click();
    await expect(page.locator("#from")).toBeFocused();
    await expect(page.locator("#date-options")).toHaveAttribute("open", "");
    await expect(
      page.locator('input[name="models"][value="303"]'),
    ).not.toBeChecked();
    await expect(
      page.locator('input[name="models"][value="130"]'),
    ).toBeChecked();
    await expect(page.locator("#year-from")).toHaveValue("2025");
    await expect(page.locator("#year-to")).toHaveValue("2025");
    await expect(page.locator("#from")).toHaveValue("2025-01-01");
    await expect(page.locator("#to")).toHaveValue("2026-01-31");
    expect(singleQueries).toBe(queriesBefore);
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
    await expect(page.locator("#status-action")).toHaveText(
      "Abrir acceso con certificado",
    );
    await expect(page.locator("#query-progress")).toHaveText(
      "1 de 4 consultas completadas",
    );
    await shoot(page, "certificate-error", "#status");
    // The action reads as available: the callout's own ink, not a quiet grey.
    const [actionInk, calloutInk] = await page
      .locator("#status")
      .evaluate((status) => [
        getComputedStyle(status.querySelector("#status-action")!).color,
        getComputedStyle(status.shadowRoot!.querySelector("slot:not([name])")!)
          .color,
      ]);
    expect(actionInk).toBe(calloutInk);
    await expect(page.locator("#scope")).toContainText(
      "Presentaciones del 01/01/2024 al 31/01/2026",
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
    await expect(page.locator("#status")).toContainText("1 consulta con error");
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
    // A downloaded row shows a checked, locked box named as such.
    const downloadedRows = page.getByRole("checkbox", {
      name: /Ya descargado/,
    });
    await expect(downloadedRows).toHaveCount(4);
    for (const box of await downloadedRows.all()) {
      await expect(box).toBeChecked();
      await expect(box).toBeDisabled();
    }
    // "Descargar de nuevo" fetches that one PDF again; Chrome never overwrites.
    await page.evaluate(() => {
      const original = chrome.downloads.download.bind(chrome.downloads);
      const calls: unknown[] = [];
      Object.assign(window, { original, calls });
      Object.assign(chrome.downloads, {
        download: (options: chrome.downloads.DownloadOptions) => {
          calls.push(options);
          return original(options);
        },
      });
    });
    const again = page
      .getByRole("button", { name: /^Descargar de nuevo/ })
      .first();
    await again.click();
    await expect.poll(() => pdfCalls - beforeBatchDownloads).toBe(5);
    await expect(page.locator(".aeat-state.done")).toHaveCount(4);
    await expect(again).toBeFocused();
    await expect(page.locator("#download")).toBeDisabled();
    expect(
      await page.evaluate(() => (window as unknown as { calls: [] }).calls),
    ).toMatchObject([{ saveAs: false, conflictAction: "uniquify" }]);
    // Chrome refusing the call means no download exists: error, not uncertain.
    await page.evaluate(() =>
      Object.assign(chrome.downloads, {
        download: () => Promise.reject(new Error("Download blocked by policy")),
      }),
    );
    await again.click();
    await expect(page.locator(".aeat-state.error")).toHaveCount(1);
    await expect(page.locator(".aeat-state.uncertain")).toHaveCount(0);
    await expect(page.locator("#status")).toContainText("blocked by policy");
    await expect(
      page.locator(".aeat-row:has(.aeat-state.error) input"),
    ).toBeFocused();
    await page.evaluate(() =>
      Object.assign(chrome.downloads, {
        download: (window as unknown as { original: unknown }).original,
      }),
    );
    await page.locator(".aeat-row:has(.aeat-state.error) input").check();
    await page.locator("#download").click();
    await expect(page.locator(".aeat-state.done")).toHaveCount(4);
    // A broken contract in the middle of a batch stops it there.
    contractBreak = true;
    const beforeContract = batchCalls.length;
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#status")).toContainText("no corresponde");
    await expect(page.locator("#query-progress")).toHaveText(
      "1 de 4 consultas completadas",
    );
    expect(batchCalls.slice(beforeContract)).toEqual(["130/2024", "303/2024"]);
    contractBreak = false;
    await page.emulateMedia({ reducedMotion: "reduce" });
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
    // Export the inventory; clearing it needs a confirmation that says what is lost.
    const storeKey = "aeat-history-v1-normal";
    const stored = () =>
      page.evaluate(
        async (key) =>
          (await chrome.storage.local.get(key))[key] as
            | { entries: Record<string, { state: string }>; visible: string[] }
            | undefined,
        storeKey,
      );
    const exported = page.waitForEvent("download");
    await page.locator("#export").click();
    const inventory = JSON.parse(
      await readFile((await (await exported).path())!, "utf8"),
    );
    const kept = Object.values((await stored())!.entries);
    const inBatch = (await stored())!.visible.length;
    expect(kept.length).toBeGreaterThan(inBatch);
    expect(inventory).toMatchObject({
      version: 1,
      environment: "production",
      queryUrl: QUERY_URL,
      pdfUrl: PDF_URL,
    });
    expect(Object.keys(inventory.entries)).toHaveLength(kept.length);
    await page.locator("#forget").click();
    await expect(page.locator("#forget-dialog")).toBeVisible();
    const count = (state: string) =>
      kept.filter((entry) => entry.state === state).length;
    await expect(page.locator("#forget-summary")).toHaveText(
      `Historial local: ${kept.length} declaraciones, ${inBatch} en este lote; ${count("done")} descargadas y ${count("uncertain")} por revisar. Se borra todo el historial, no solo el lote. Los PDF descargados siguen en Descargas.`,
    );
    await shoot(page, "clear-confirmation", "#forget-dialog");
    const exportedFirst = page.waitForEvent("download");
    await page.locator("#forget-export").click();
    await exportedFirst;
    await page.locator("#forget-cancel").click();
    await expect(page.locator("#forget-dialog")).toBeHidden();
    expect(await stored()).toBeDefined();
    await page.locator("#forget").click();
    await page.locator("#forget-confirm").click();
    await expect(page.locator("#status")).toContainText(
      "Historial local borrado",
    );
    expect(await stored()).toBeUndefined();
    await expect(page.locator("#results li")).toHaveCount(0);
    // Every reconcile branch, against downloads Chrome reports in each state.
    const row = (index: number) => ({
      nif: "11111111H",
      modelo: "130",
      ejercicio: "2025",
      periodo: "1T",
      csv: `TEST${String(index).padStart(12, "0")}`,
      expediente: `TEST${index}`,
      justificante: `130${String(index).padStart(10, "0")}`,
      fechaYHoraPresentacion: "2025-04-20T10:30:00",
    });
    const seeded: Record<string, { state: string; downloadId?: number }> = {
      complete: { state: "saving", downloadId: 1 },
      deleted: { state: "done", downloadId: 2 },
      interrupted: { state: "saving", downloadId: 3 },
      running: { state: "saving", downloadId: 4 },
      forgotten: { state: "done", downloadId: 5 },
      unconfirmed: { state: "saving" },
      fetching: { state: "fetching" },
    };
    await page.evaluate(
      async ({ key, archive }) => chrome.storage.local.set({ [key]: archive }),
      {
        key: storeKey,
        archive: {
          version: 1,
          entries: Object.fromEntries(
            Object.entries(seeded).map(([name, entry], index) => [
              name,
              { row: row(index + 1), ...entry },
            ]),
          ),
          visible: Object.keys(seeded),
          saturated: false,
        },
      },
    );
    const reconciling = await context.newPage();
    await reconciling.addInitScript(() => {
      const known: Record<number, { state: string; exists: boolean }> = {
        1: { state: "complete", exists: true },
        2: { state: "complete", exists: false },
        3: { state: "interrupted", exists: true },
        4: { state: "in_progress", exists: true },
      };
      Object.assign(chrome.downloads, {
        search: async ({ id }: { id: number }) =>
          known[id] ? [{ id, ...known[id] }] : [],
      });
    });
    await reconciling.goto(`${base}/index.html`);
    await expect(reconciling.locator("#results li")).toHaveCount(7);
    const reconciled = (await stored())!.entries as Record<
      string,
      { state: string; error?: string }
    >;
    expect(
      Object.fromEntries(
        Object.entries(reconciled).map(([name, entry]) => [name, entry.state]),
      ),
    ).toEqual({
      complete: "done",
      deleted: "pending",
      interrupted: "pending",
      running: "saving",
      forgotten: "uncertain",
      unconfirmed: "uncertain",
      fetching: "pending",
    });
    expect(reconciled.forgotten.error).toContain("ya no conserva el registro");
    await reconciling.close();
    expect(errors).toEqual([]);
    expect(requests.every((url) => url === QUERY_URL || url === PDF_URL)).toBe(
      true,
    );
  } finally {
    await context.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
