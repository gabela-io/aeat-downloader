import { test, expect, chromium } from "@playwright/test";
import { cp, mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

test("large AEAT archive: query review, filters, selection, pagination and themes", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "aeat-interface-"));
  const extension = join(temporary, "extension");
  await cp(resolve("build"), extension, { recursive: true });
  const context = await chromium.launchPersistentContext(
    join(temporary, "profile"),
    {
      executablePath: process.env.CHROMIUM_PATH,
      channel: process.env.CHROMIUM_PATH ? undefined : "chromium",
      headless: true,
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
    const requests: string[] = [];
    await context.route(/^https?:\/\//, (route) => {
      requests.push(route.request().url());
      return route.abort();
    });
    const worker =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent("serviceworker"));
    await worker.evaluate(async () => {
      const models = ["130", "303", "349", "347", "390", "100"];
      const entries = Object.fromEntries(
        Array.from({ length: 145 }, (_, index) => [
          String(index),
          {
            row: {
              nif: "11111111H",
              modelo: models[index % 6],
              ejercicio: String(2015 + Math.floor(index / 13)),
              periodo: "1T",
              justificante: String(1000000000000 + index),
              expediente: `TEST${index}`,
              csv: `TEST${String(index).padStart(12, "0")}`,
              fechaYHoraPresentacion: "2026-04-20T10:30:00",
            },
            state:
              index < 110
                ? "pending"
                : index < 140
                  ? "done"
                  : index < 144
                    ? "error"
                    : "uncertain",
          },
        ]),
      );
      const selection = {
        nif: "11111111H",
        name: "PERSONA DE PRUEBA",
        models,
        yearFrom: 2015,
        yearTo: 2026,
        from: "2015-01-01",
        to: "2026-10-06",
      };
      const queries = Array.from({ length: 72 }, (_, index) => ({
        selection: {
          nif: selection.nif,
          name: selection.name,
          model: models[index % 6],
          year: 2015 + Math.floor(index / 6),
          from: selection.from,
          to: selection.to,
        },
        state: index < 55 ? "done" : "error",
        keys: [],
        error:
          index < 55
            ? undefined
            : "AEAT devolvió un error de consulta. Revisa identidad, fechas y acceso en la Sede; no confirma ausencia de declaraciones.",
      }));
      await chrome.storage.local.set({
        "aeat-history-v1-normal": {
          version: 1,
          batch: { selection, queries },
          entries,
          visible: Object.keys(entries),
          saturated: false,
        },
      });
    });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    // Console errors include CSP violations (a CDN icon or font, inline script).
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() =>
      document.addEventListener("securitypolicyviolation", (event) =>
        console.error(`CSP: ${event.violatedDirective} ${event.blockedURI}`),
      ),
    );
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(
      `chrome-extension://${new URL(worker.url()).host}/index.html`,
    );
    await expect(page.locator("#count")).toHaveText("145 declaraciones");
    // The toolbar button relies on this lookup to focus the open tab.
    expect(
      await worker.evaluate(async () => {
        const contexts = await chrome.runtime.getContexts({
          contextTypes: [chrome.runtime.ContextType.TAB],
          documentUrls: [chrome.runtime.getURL("index.html")],
        });
        return contexts.length;
      }),
    ).toBe(1);
    await expect(page.locator("#results li")).toHaveCount(25);
    await expect(page.locator("#batch-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(page.locator("#query-progress")).toHaveText(
      "55 de 72 consultas completadas",
    );
    await page.locator("#show-issues").click();
    await expect(page.locator("#queries > li")).toHaveCount(17);
    await page.locator("#queries summary").first().click();
    await expect(page.locator("#queries details[open] p")).toContainText(
      "no confirma ausencia",
    );
    await page.locator("#query-filter").selectOption("all");
    await expect(page.locator("#queries > li")).toHaveCount(72);
    await page.locator("#batch-details > summary").click();
    await page.locator("#clear-selection").click();
    await page.locator("#document-search").fill("303");
    await expect(page.locator("#results li")).toHaveCount(24);
    await page.locator("#select-visible").check();
    await expect(page.locator("#download")).toHaveText(
      "Descargar selección (19)",
    );
    await page.locator("#document-search").fill("100");
    // Justificante numbers also match this search; filter by year without losing selection.
    await page.locator("#document-year").selectOption("2015");
    await expect(page.locator("#selection-note")).toContainText(
      "fuera de estos filtros",
    );
    await page.locator("#document-year").selectOption("all");
    await page.locator("#document-search").fill("");
    await page.locator("#clear-selection").click();
    await page.locator("#select-visible").check();
    await expect(page.locator("#download")).toHaveText(
      "Descargar selección (114)",
    );
    await page.locator("#next-page").click();
    await expect(page.locator("#page-range")).toHaveText(
      "26–50 de 145 documentos",
    );
    const checkbox = page.locator("#results input").first();
    await checkbox.focus();
    await page.keyboard.press("Space");
    await expect(page.locator("#results input").first()).toBeFocused();
    await expect(page.locator("#select-visible")).toHaveJSProperty(
      "indeterminate",
      true,
    );
    await page.locator("#document-state").selectOption("issues");
    await expect(page.locator("#results li")).toHaveCount(5);
    await page.locator("#document-search").fill("NO MATCH");
    await expect(page.locator("#filtered-empty")).toBeVisible();
    await page.locator("#document-search").fill("");
    await page.locator("#document-state").selectOption("all");
    await page.locator("#select-visible").check();
    const evidence = resolve("test-results/screenshots");
    await mkdir(evidence, { recursive: true });
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.reload();
      await expect(page.locator("#count")).toHaveText("145 declaraciones");
      if (width < 851)
        await expect(page.locator("#consultation")).not.toHaveAttribute(
          "open",
          "",
        );
      for (const theme of ["light", "dark"]) {
        await page.locator("#theme").selectOption(theme);
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: join(evidence, `aeat-interface-${width}-${theme}.png`),
            fullPage: false,
          });
      }
    }
    await page.reload();
    await expect(page.locator("#theme")).toHaveValue("dark");
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
