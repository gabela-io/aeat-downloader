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
        state: index < 55 ? "done" : index === 55 ? "limited" : "error",
        keys: [],
        error:
          index < 56
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
    // Console errors include CSP violations: the manifest CSP limits the page to
    // its own files and the two AEAT origins, so a CDN icon or font, or an
    // inline script, lands here (download.spec checks the blocking itself).
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
    // The environment shows once, as a quiet mark beside the title.
    await expect(
      page.getByText("AEAT · Producción · Solo consulta", { exact: true }),
    ).toHaveCount(1);
    await expect(
      page.locator(".cabecera").getByText("AEAT · Producción · Solo consulta"),
    ).toBeVisible();
    // Each model checkbox carries its short name in its accessible name.
    for (const name of [
      "100 · Renta (IRPF)",
      "130 · Pago fraccionado IRPF",
      "303 · IVA trimestral",
      "347 · Operaciones con terceros",
      "349 · Operaciones intracomunitarias",
      "390 · Resumen anual IVA",
    ])
      await expect(
        page.getByRole("checkbox", { name, exact: true }),
      ).toBeVisible();
    // Scope and help: dd/mm/aaaa dates, and the help opens with the facts.
    await expect(page.locator("#scope")).toContainText(
      "Presentaciones del 01/01/2015 al 06/10/2026",
    );
    await page.locator(".ayuda > summary").click();
    await expect(page.locator(".ayuda p").first()).toHaveText(
      /^Solo descarga PDF;/,
    );
    await expect(page.locator(".ayuda")).not.toContainText("MVP");
    await page.locator(".ayuda > summary").click();
    // The toolbar button focuses the open page, also after the skip link adds
    // a fragment to its URL, instead of opening a second tab.
    await page.locator(".skip-link").focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/index\.html#results-title$/);
    const tabs = () =>
      worker.evaluate(async () => (await chrome.tabs.query({})).length);
    const openTabs = await tabs();
    await worker.evaluate(() =>
      (globalThis as unknown as { openPage(): Promise<void> }).openPage(),
    );
    expect(await tabs()).toBe(openTabs);
    // Before the first query, the page says Chrome will ask for both domains.
    await expect(page.locator("#permission-note")).toHaveText(
      "Chrome te pedirá acceso a www1 y www2.agenciatributaria.gob.es.",
    );
    // An invalid NIF marks and focuses its field, and the message names it.
    await page.locator("#nif").fill("11111111A");
    await page
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(page.locator("#nif")).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#nif")).toHaveAttribute(
      "aria-describedby",
      "status",
    );
    await expect(page.locator("#nif")).toBeFocused();
    await expect(page.locator("#status")).toContainText("campo NIF / NIE");
    await page.locator("#nif").fill("11111111H");
    await expect(page.locator("#nif")).not.toHaveAttribute("aria-invalid");
    await expect(page.locator("#results li")).toHaveCount(25);
    await expect(page.locator("#batch-details")).not.toHaveAttribute(
      "open",
      "",
    );
    await expect(page.locator("#query-progress")).toHaveText(
      "56 de 72 consultas completadas",
    );
    // Errors and truncated queries are counted apart; the errors match resume.
    await expect(page.locator("#show-issues")).toHaveText(
      "16 con error · 1 incompleta",
    );
    await expect(page.locator("#resume")).toHaveText("Reanudar consultas (16)");
    await page.locator("#show-issues").click();
    await expect(
      page.getByRole("button", { name: /^Acotar esta consulta/ }),
    ).toHaveCount(1);
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
    // Three severities: an unconfirmed download and a truncated query share the
    // attention colour; failed downloads and queries the error colour.
    await page.locator("#batch-details > summary").click();
    const colours = await page.evaluate(() =>
      Object.fromEntries(
        [
          ".aeat-state.uncertain",
          ".aeat-state.error",
          ".query-heading .limited",
          ".query-heading .error",
        ].map((selector) => [
          selector,
          getComputedStyle(document.querySelector(selector)!).color,
        ]),
      ),
    );
    await page.locator("#batch-details > summary").click();
    expect(colours[".aeat-state.uncertain"]).toBe(
      colours[".query-heading .limited"],
    );
    expect(colours[".aeat-state.error"]).toBe(colours[".query-heading .error"]);
    expect(colours[".aeat-state.uncertain"]).not.toBe(
      colours[".aeat-state.error"],
    );
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
        await expect(page.locator(".entorno")).toBeVisible();
        await page.evaluate(() => window.scrollTo(0, 0));
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
        ).toBe(true);
        // Fields and selects reach the 44 px touch height of buttons.
        if (width <= 700)
          for (const field of ["#theme", "#document-search", "#document-year"])
            expect(
              (await page.locator(field).boundingBox())!.height,
            ).toBeGreaterThanOrEqual(44);
        if (width === 1440 || width === 390)
          await page.screenshot({
            path: join(evidence, `aeat-interface-${width}-${theme}.png`),
            fullPage: false,
          });
      }
    }
    // At 320 px the open form, model names included, fits without overflow.
    await page.locator("#consultation > summary").click();
    expect(
      await page.evaluate(() => [
        document.documentElement.scrollWidth <= innerWidth,
        ...[...document.querySelectorAll(".model-options label")].map(
          (label) => label.getBoundingClientRect().right <= innerWidth,
        ),
      ]),
    ).toEqual(Array(7).fill(true));
    expect(
      (await page.locator("#nif").boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
    // Downloaded rows: a checked, locked box and their own "Descargar de nuevo".
    await page.locator("#document-state").selectOption("done");
    await expect(
      page.getByRole("checkbox", { name: /Ya descargado/ }),
    ).toHaveCount(25);
    await expect(
      page.getByRole("button", { name: /^Descargar de nuevo/ }),
    ).toHaveCount(25);
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const theme of ["light", "dark"]) {
        await page.locator("#theme").selectOption(theme);
        await page.locator("#results").scrollIntoViewIfNeeded();
        await page.screenshot({
          path: join(evidence, `done-rows-${width}-${theme}.png`),
        });
      }
    }
    // Reduced motion also reaches the progress bar's shadow root.
    expect(
      await page
        .locator("#batch-progress")
        .evaluate(
          (bar) =>
            getComputedStyle(bar.shadowRoot!.querySelector(".indicator")!)
              .transitionDuration,
        ),
    ).toBe("0s");
    // Chrome's font-size preference scales the text (sizes in rem).
    const fontSize = (selector: string) =>
      page
        .locator(selector)
        .evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
    const sizes = [await fontSize("#count"), await fontSize("#page-range")];
    const cdp = await context.newCDPSession(page);
    await cdp.send("Page.setFontSizes", { fontSizes: { standard: 32 } });
    expect([await fontSize("#count"), await fontSize("#page-range")]).toEqual(
      sizes.map((size) => size * 2),
    );
    await page.reload();
    await expect(page.locator("#theme")).toHaveValue("dark");
    // While Chrome's permission prompt is open the page says so; a refusal
    // offers to ask again. The stub stands in for the native prompt.
    const asking = await context.newPage();
    await asking.addInitScript(() =>
      Object.assign(chrome.permissions, {
        request: () =>
          new Promise<boolean>((answer) => Object.assign(window, { answer })),
      }),
    );
    await asking.goto(page.url());
    await expect(asking.locator("#count")).toHaveText("145 declaraciones");
    await asking
      .getByRole("button", { name: "Consultar AEAT", exact: true })
      .click();
    await expect(asking.locator("#status")).toHaveText(
      "Esperando el permiso de Chrome…",
    );
    await asking.evaluate(() =>
      (window as unknown as { answer(granted: boolean): void }).answer(false),
    );
    await expect(asking.locator("#status")).toContainText(
      "No se concedió acceso",
    );
    await expect(asking.locator("#status-action")).toHaveText(
      "Conceder acceso",
    );
    await asking.locator("#status-action").click();
    await expect(asking.locator("#status")).toHaveText(
      /^Esperando el permiso de Chrome…/,
    );
    await asking.close();
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  } finally {
    await context.close();
    await rm(temporary, { recursive: true, force: true });
  }
});
