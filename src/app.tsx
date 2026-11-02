// AEAT archive page: Preact renders the view from the module state below and
// Web Awesome provides the theme. Every state change calls `update()`, which
// re-renders synchronously.
import { render } from "preact";
import "@awesome.me/webawesome/dist/components/callout/callout.js";
import "@awesome.me/webawesome/dist/components/progress-bar/progress-bar.js";
import { registerIconLibrary } from "@awesome.me/webawesome/dist/components/icon/library.js";
import {
  AEAT_ORIGINS,
  QUERY_URL,
  PDF_URL,
  declarationKey,
  fetchPdf,
  queryDeclarations,
  expandBatch,
  QueryResponseError,
  type BatchSelection,
  type Declaration,
  type Selection,
} from "./client";
import {
  initializeTheme,
  readTheme,
  saveTheme,
  type ThemeChoice,
} from "./theme";

// Never reach the Font Awesome CDN (the extension CSP blocks it anyway): the
// default icon library resolves to an empty inline SVG.
registerIconLibrary("default", {
  resolver: () =>
    "data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22/%3E",
});

type Entry = {
  row: Declaration;
  state: "pending" | "fetching" | "saving" | "done" | "error" | "uncertain";
  downloadId?: number;
  sha256?: string;
  error?: string;
};
type QueryTask = {
  selection: Selection;
  state: "pending" | "running" | "done" | "limited" | "error";
  keys: string[];
  error?: string;
};
type Archive = {
  version: 1;
  batch?: { selection: BatchSelection; queries: QueryTask[] };
  entries: Record<string, Entry>;
  visible: string[];
  saturated: boolean;
};
const storeKey = `aeat-history-v1-${chrome.extension.inIncognitoContext ? "incognito" : "normal"}`;
const lockKey = "aeat-history-operation";
let archive: Archive = emptyArchive();
let operation: AbortController | undefined;
let ready = false;
const selected = new Set<string>();
const expandedQueryErrors = new Set<string>();
const pageSize = 25;
let pageIndex = 0;

// View state that previously lived in the DOM.
const THEME_KEY = "aeat-theme";
const MODELS = ["130", "303", "349", "347", "390", "100"];
let theme: ThemeChoice = readTheme(THEME_KEY);
let status = {
  text: "Listo para consultar. Mantén esta pestaña abierta durante el lote.",
  error: false,
};
const form = {
  nif: "",
  name: "",
  models: [] as string[],
  yearFrom: "",
  yearTo: "",
  from: "",
  to: "",
};
let consultationOpen = true;
let dateOptionsOpen = false;
let batchDetailsOpen = false;
let queryFilter = "issues";
let documentSearch = "";
let documentYear = "all";
let documentState = "all";

function filteredKeys(): string[] {
  const search = documentSearch.trim().toLowerCase();
  return archive.visible.filter((key) => {
    const entry = archive.entries[key];
    return (
      (documentYear === "all" || entry.row.ejercicio === documentYear) &&
      (documentState === "all" ||
        (documentState === "pending"
          ? ["pending", "error"].includes(entry.state)
          : documentState === "issues"
            ? ["error", "uncertain"].includes(entry.state)
            : entry.state === documentState)) &&
      (!search ||
        [
          entry.row.modelo,
          entry.row.ejercicio,
          entry.row.periodo,
          entry.row.justificante,
        ]
          .join(" ")
          .toLowerCase()
          .includes(search))
    );
  });
}
function resetFilters(): void {
  documentSearch = "";
  documentYear = "all";
  documentState = "all";
  pageIndex = 0;
}
function emptyArchive(): Archive {
  return { version: 1, entries: {}, visible: [], saturated: false };
}
function message(text: string, error = false): void {
  status = { text, error };
  update();
}
function errorText(error: unknown): string {
  if (error instanceof DOMException && error.name === "AbortError")
    return "Operación cancelada. Las descargas pendientes se conservan.";
  if (
    error instanceof TypeError ||
    (error instanceof DOMException && error.name === "TimeoutError")
  )
    return "No se pudo conectar con AEAT. Comprueba el certificado en Chrome, la conexión y los permisos. No se ha reintentado automáticamente.";
  return error instanceof Error
    ? error.message
    : "No se completó la operación. Puedes volver a intentarlo.";
}
async function save(): Promise<void> {
  await chrome.storage.local.set({ [storeKey]: archive });
}
async function load(): Promise<void> {
  const value = (await chrome.storage.local.get(storeKey))[storeKey] as
    Archive | undefined;
  archive = value?.version === 1 ? value : emptyArchive();
}
function readSelection(): BatchSelection {
  const selection: BatchSelection = {
    nif: form.nif.trim().toUpperCase(),
    name: form.name.trim(),
    models: MODELS.filter((model) => form.models.includes(model)),
    yearFrom: Number(form.yearFrom),
    yearTo: Number(form.yearTo),
    from: form.from,
    to: form.to,
  };
  expandBatch(selection);
  return selection;
}
const stateLabels: Record<Entry["state"], string> = {
  pending: "Pendiente",
  fetching: "Obteniendo PDF…",
  saving: "Guardando en Chrome…",
  done: "Descargado",
  error: "Error · pendiente",
  uncertain: "Revisar descarga",
};
const queryLabels: Record<QueryTask["state"], string> = {
  pending: "Pendiente",
  running: "Consultando…",
  done: "Completada",
  limited: "Incompleta · límite de 100",
  error: "Error",
};
async function reconcile(): Promise<void> {
  for (const query of archive.batch?.queries ?? [])
    if (query.state === "running") query.state = "pending";
  for (const entry of Object.values(archive.entries)) {
    if (entry.state === "fetching") entry.state = "pending";
    if (entry.downloadId !== undefined) {
      const [download] = await chrome.downloads.search({
        id: entry.downloadId,
      });
      if (download?.state === "complete" && download.exists) {
        entry.state = "done";
        entry.error = undefined;
      } else if (download?.state === "in_progress") entry.state = "saving";
      else if (
        download?.state === "interrupted" ||
        download?.exists === false
      ) {
        entry.state = "pending";
        entry.downloadId = undefined;
      } else {
        entry.state = "uncertain";
        entry.error =
          "Chrome ya no conserva el registro. Revisa tus archivos antes de repetir.";
      }
    } else if (entry.state === "saving") {
      entry.state = "uncertain";
      entry.error =
        "La pestaña se cerró antes de confirmar el guardado. Revisa las descargas de Chrome.";
    }
  }
  for (const key of [...selected])
    if (!["pending", "error"].includes(archive.entries[key]?.state))
      selected.delete(key);
  await save();
}
async function run(
  action: (signal: AbortSignal) => Promise<void>,
): Promise<void> {
  if (operation || !ready) return;
  operation = new AbortController();
  update();
  try {
    await navigator.locks.request(
      lockKey,
      { ifAvailable: true },
      async (lock) => {
        if (!lock)
          throw new Error(
            "Ya hay una operación AEAT en otra pestaña. Termínala antes de continuar.",
          );
        await load();
        await reconcile();
        await action(operation!.signal);
      },
    );
  } catch (error) {
    message(errorText(error), true);
  } finally {
    operation = undefined;
    update();
  }
}
async function downloadEntry(entry: Entry, signal: AbortSignal): Promise<void> {
  entry.state = "fetching";
  entry.error = undefined;
  entry.downloadId = undefined;
  await save();
  update();
  let url: string | undefined;
  try {
    const bytes = await fetchPdf(entry.row, signal);
    signal.throwIfAborted();
    entry.sha256 = Array.from(
      new Uint8Array(
        await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
      ),
      (value) => value.toString(16).padStart(2, "0"),
    ).join("");
    url = URL.createObjectURL(
      new Blob([new Uint8Array(bytes)], { type: "application/pdf" }),
    );
    entry.state = "saving";
    await save();
    entry.downloadId = await chrome.downloads.download({
      url,
      filename: `AEAT/${entry.row.nif}/${entry.row.ejercicio}/${entry.row.modelo}-${entry.row.periodo}-${entry.row.justificante}.pdf`,
      saveAs: false,
      conflictAction: "uniquify",
    });
    await save();
    update();
    // The foreground tab owns this short operation; the persisted ID survives it.
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      signal.throwIfAborted();
      const [download] = await chrome.downloads.search({
        id: entry.downloadId,
      });
      if (download?.state === "complete") {
        entry.state = "done";
        await save();
        return;
      }
      if (!download || download.state === "interrupted")
        throw new Error(
          "Chrome interrumpió la descarga. Comprueba su lista de descargas.",
        );
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
    throw new Error(
      "Chrome no confirmó el guardado. Pulsa «Actualizar estados» antes de repetir.",
    );
  } catch (error) {
    if (entry.state === "saving") {
      entry.state = "uncertain";
    } else entry.state = "error";
    entry.error = errorText(error);
    await save();
    throw error;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
async function queryBatch(signal: AbortSignal): Promise<void> {
  const queries = archive.batch!.queries;
  // Explicit resume retries each failed query once; completed queries are skipped.
  const pending = queries.filter((query) =>
    ["pending", "error"].includes(query.state),
  );
  for (const query of pending) {
    signal.throwIfAborted();
    query.state = "running";
    query.error = undefined;
    await save();
    update();
    message(
      `Consultando modelo ${query.selection.model}, ejercicio ${query.selection.year}… Si Chrome solicita el certificado, selecciónalo tú.`,
    );
    try {
      const rows = await queryDeclarations(query.selection, signal);
      signal.throwIfAborted();
      query.keys = rows.map(declarationKey);
      query.state = rows.length === 100 ? "limited" : "done";
      for (const row of rows) {
        const key = declarationKey(row);
        archive.entries[key] ??= { row, state: "pending" };
        if (["pending", "error"].includes(archive.entries[key].state))
          selected.add(key);
      }
      archive.visible = [...new Set(queries.flatMap((task) => task.keys))];
      archive.saturated = queries.some((task) => task.state === "limited");
      await save();
    } catch (error) {
      query.state = signal.aborted ? "pending" : "error";
      query.error = errorText(error);
      await save();
      if (!(error instanceof QueryResponseError) || signal.aborted) throw error;
    }
    update();
  }
  const failed = queries.filter((query) => query.state === "error").length;
  message(
    `Lote consultado: ${archive.visible.length} declaraciones. ${failed ? `Hay ${failed} consultas con error; puedes reintentarlas.` : "Revisa la selección antes de descargar."}`,
    failed > 0,
  );
}

function submitQuery(event: Event): void {
  event.preventDefault();
  if (operation || !ready) return;
  let selection: BatchSelection;
  try {
    selection = readSelection();
  } catch (error) {
    message(errorText(error), true);
    return;
  }
  // Request permissions directly in the user gesture, before any storage awaits.
  const permission = chrome.permissions.request({ origins: AEAT_ORIGINS });
  void run(async (signal) => {
    if (!(await permission))
      throw new Error(
        "No se concedió acceso a los dos dominios de AEAT. Puedes volver a consultar para concederlo.",
      );
    archive.batch = {
      selection,
      queries: expandBatch(selection).map((selection) => ({
        selection,
        state: "pending",
        keys: [],
      })),
    };
    expandedQueryErrors.clear();
    resetFilters();
    archive.visible = [];
    archive.saturated = false;
    selected.clear();
    await save();
    await queryBatch(signal);
  });
}
function resume(): void {
  if (operation || !ready) return;
  const permission = chrome.permissions.request({ origins: AEAT_ORIGINS });
  void run(async (signal) => {
    if (!(await permission))
      throw new Error("Concede acceso a AEAT para continuar el lote.");
    if (archive.batch) await queryBatch(signal);
  });
}
const downloadSelection = () =>
  void run(async (signal) => {
    const keys = archive.visible.filter(
      (key) =>
        selected.has(key) &&
        ["pending", "error"].includes(archive.entries[key].state),
    );
    let count = 0;
    for (const key of keys) {
      signal.throwIfAborted();
      message(`Descargando ${count + 1} de ${keys.length}…`);
      await downloadEntry(archive.entries[key], signal);
      selected.delete(key);
      count++;
      update();
    }
    message(
      `${count} PDF guardados. El inventario conserva sus huellas SHA-256.`,
    );
  });
const refresh = () =>
  void run(async () => {
    selected.clear();
    for (const key of archive.visible)
      if (["pending", "error"].includes(archive.entries[key].state))
        selected.add(key);
    message("Estados comprobados con las descargas de Chrome.");
  });
const forget = () =>
  void run(async () => {
    archive = emptyArchive();
    resetFilters();
    selected.clear();
    await chrome.storage.local.remove(storeKey);
    message("Historial local borrado. Los PDF descargados se conservan.");
  });
const exportInventory = () =>
  void run(async () => {
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            {
              ...archive,
              exportedAt: new Date().toISOString(),
              environment: "production",
              queryUrl: QUERY_URL,
              pdfUrl: PDF_URL,
            },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "aeat-history.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    message(
      "Inventario exportado. Contiene NIF e identificadores fiscales; guárdalo con tus documentos.",
    );
  });
function prepareAgain(key: string): void {
  void run(async () => {
    // This deliberate action is required after an unconfirmed download.
    const entry = archive.entries[key];
    if (entry?.state !== "uncertain") return;
    archive.entries[key] = { row: entry.row, state: "pending" };
    selected.add(key);
    await save();
    message(
      "Preparada para descargar de nuevo. Puede crear otra copia; revisa antes las descargas de Chrome.",
    );
  });
}
function changeYearFrom(): void {
  const year = Number(form.yearFrom);
  if (
    Number.isInteger(year) &&
    year >= 1990 &&
    year <= new Date().getFullYear()
  ) {
    const day = `${year}-01-01`;
    if (form.from > day) form.from = day;
  }
  update();
}
const value = (event: Event) => (event.currentTarget as HTMLInputElement).value;
const dmy = (date: string) => date.split("-").reverse().join("/");

function QueryItem(props: { query: QueryTask }) {
  const { query } = props;
  const key = `${query.selection.model}/${query.selection.year}`;
  return (
    <li>
      <div class="query-heading">
        <strong>{`Modelo ${query.selection.model} · ${query.selection.year}`}</strong>
        <span class={query.state}>
          {`${queryLabels[query.state]}${query.keys.length ? ` · ${query.keys.length} documentos` : ""}`}
        </span>
      </div>
      {query.error && (
        <details
          open={expandedQueryErrors.has(key)}
          onToggle={(event) =>
            event.currentTarget.open
              ? expandedQueryErrors.add(key)
              : expandedQueryErrors.delete(key)
          }
        >
          <summary>Ver motivo</summary>
          <p>{query.error}</p>
        </details>
      )}
    </li>
  );
}

function ResultRow(props: { entryKey: string; busy: boolean }) {
  const key = props.entryKey;
  const entry = archive.entries[key];
  return (
    <li class="aeat-row">
      <label>
        <input
          type="checkbox"
          data-selection-key={key}
          checked={selected.has(key)}
          disabled={props.busy || !["pending", "error"].includes(entry.state)}
          onChange={(event) => {
            if (event.currentTarget.checked) selected.add(key);
            else selected.delete(key);
            update();
          }}
        />
        <span>
          <strong>{`${entry.row.modelo} · ${entry.row.ejercicio} · ${entry.row.periodo === "0A" ? "Anual" : entry.row.periodo}`}</strong>
          <small>{`Justificante ${entry.row.justificante}`}</small>
        </span>
      </label>
      <time dateTime={entry.row.fechaYHoraPresentacion}>
        {dmy(entry.row.fechaYHoraPresentacion.slice(0, 10))}
        <small>{entry.row.fechaYHoraPresentacion.slice(11, 16)}</small>
      </time>
      <span class={`aeat-state ${entry.state}`}>
        {stateLabels[entry.state]}
        {entry.error && <small>{entry.error}</small>}
      </span>
      {entry.state === "uncertain" && (
        <button
          type="button"
          class="wa-neutral wa-outlined"
          disabled={props.busy}
          onClick={() => prepareAgain(key)}
        >
          Preparar otra descarga
        </button>
      )}
    </li>
  );
}

function App() {
  for (const key of selected)
    if (["done", "uncertain"].includes(archive.entries[key]?.state))
      selected.delete(key);
  const busy = !!operation || !ready;
  const queries = archive.batch?.queries ?? [];
  const issues = queries.filter((query) =>
    ["error", "limited"].includes(query.state),
  ).length;
  const resolved = queries.filter((query) =>
    ["done", "limited"].includes(query.state),
  ).length;
  const remaining = queries.filter((query) =>
    ["pending", "error"].includes(query.state),
  ).length;
  const shownQueries = queries.filter(
    (query) => queryFilter === "all" || query.state !== "done",
  );
  const countIn = (states: Entry["state"][]) =>
    archive.visible.filter((key) => states.includes(archive.entries[key].state))
      .length;
  const uncertain = countIn(["uncertain"]);
  const years = [
    ...new Set(
      archive.visible.map((key) => archive.entries[key].row.ejercicio),
    ),
  ]
    .sort()
    .reverse();
  if (!years.includes(documentYear)) documentYear = "all";
  const filtered = filteredKeys();
  const actionable = filtered.filter((key) =>
    ["pending", "error"].includes(archive.entries[key].state),
  );
  const allChecked =
    actionable.length > 0 && actionable.every((key) => selected.has(key));
  const hiddenSelected = [...selected].filter(
    (key) => !filtered.includes(key),
  ).length;
  pageIndex = Math.min(
    pageIndex,
    Math.max(0, Math.ceil(filtered.length / pageSize) - 1),
  );
  const start = pageIndex * pageSize;
  const modelCount = form.models.length;
  const yearCount = Number(form.yearTo) - Number(form.yearFrom) + 1;
  const batch = archive.batch?.selection;
  return (
    <>
      <a class="skip-link" href="#results-title">
        Saltar a los justificantes
      </a>
      <header class="cabecera">
        <div class="identidad">
          <h1>Histórico AEAT</h1>
          <span class="marca">Descargador de justificantes</span>
        </div>
        <div class="header-tools">
          <label class="theme-control" for="theme">
            Tema
            <select
              id="theme"
              value={theme}
              onChange={(event) => {
                theme = event.currentTarget.value as ThemeChoice;
                saveTheme(THEME_KEY, theme);
                update();
              }}
            >
              <option value="system">Automático</option>
              <option value="light">Claro</option>
              <option value="dark">Oscuro</option>
            </select>
          </label>
        </div>
      </header>
      <main class="mesa aeat-workspace">
        <aside class="proveedores">
          <details
            id="consultation"
            open={consultationOpen}
            onToggle={(event) => (consultationOpen = event.currentTarget.open)}
          >
            <summary>Configurar consulta</summary>
            <p>Declaraciones ya presentadas y sus justificantes PDF.</p>
            <wa-callout class="aeat-environment" variant="warning" size="s">
              <strong>AEAT · Producción · Solo consulta</strong>
              <br />
              Esta vista no presenta ni modifica declaraciones.
            </wa-callout>
            <form
              id="query-form"
              onSubmit={submitQuery}
              onInvalidCapture={() => {
                consultationOpen = true;
                dateOptionsOpen = true;
                update();
              }}
            >
              <fieldset id="selection-fields" disabled={busy}>
                <legend class="sr-only">Identidad y periodo de consulta</legend>
                <label for="nif">NIF / NIE</label>
                <input
                  id="nif"
                  type="text"
                  required
                  maxLength={9}
                  autocomplete="off"
                  spellcheck={false}
                  value={form.nif}
                  onInput={(event) => {
                    form.nif = value(event);
                    update();
                  }}
                />
                <label for="name">Apellidos y nombre</label>
                <input
                  id="name"
                  type="text"
                  required
                  maxLength={150}
                  autocomplete="name"
                  value={form.name}
                  onInput={(event) => {
                    form.name = value(event);
                    update();
                  }}
                />
                <fieldset class="model-options">
                  <legend>Modelos</legend>
                  {MODELS.map((model) => (
                    <label key={model}>
                      <input
                        type="checkbox"
                        name="models"
                        value={model}
                        checked={form.models.includes(model)}
                        onChange={(event) => {
                          form.models = event.currentTarget.checked
                            ? [...form.models, model]
                            : form.models.filter((item) => item !== model);
                          update();
                        }}
                      />{" "}
                      {model}
                    </label>
                  ))}
                </fieldset>
                <div class="year-range">
                  <label for="year-from">
                    Ejercicio desde
                    <input
                      id="year-from"
                      type="number"
                      min="1990"
                      max="2100"
                      required
                      value={form.yearFrom}
                      onInput={(event) => {
                        form.yearFrom = value(event);
                        update();
                      }}
                      onChange={changeYearFrom}
                    />
                  </label>
                  <label for="year-to">
                    Hasta
                    <input
                      id="year-to"
                      type="number"
                      min="1990"
                      max="2100"
                      required
                      value={form.yearTo}
                      onInput={(event) => {
                        form.yearTo = value(event);
                        update();
                      }}
                    />
                  </label>
                </div>
                <details
                  id="date-options"
                  class="date-options"
                  open={dateOptionsOpen}
                  onToggle={(event) =>
                    (dateOptionsOpen = event.currentTarget.open)
                  }
                >
                  <summary>
                    Fechas de presentación{" "}
                    <small id="date-range-summary">
                      {ready ? `${dmy(form.from)} – ${dmy(form.to)}` : ""}
                    </small>
                  </summary>
                  <label for="from">Presentado desde</label>
                  <input
                    id="from"
                    type="date"
                    required
                    value={form.from}
                    onInput={(event) => {
                      form.from = value(event);
                      update();
                    }}
                  />
                  <label for="to">Presentado hasta</label>
                  <input
                    id="to"
                    type="date"
                    required
                    value={form.to}
                    onInput={(event) => {
                      form.to = value(event);
                      update();
                    }}
                  />
                  <p>
                    Las fechas corresponden a la presentación, que puede ser
                    posterior al ejercicio.
                  </p>
                </details>
                <p id="batch-preview" class="batch-preview">
                  {!ready
                    ? ""
                    : modelCount && yearCount > 0
                      ? `${modelCount} modelos × ${yearCount} ejercicios · ${modelCount * yearCount} consultas`
                      : "Selecciona modelos y ejercicios."}
                </p>
                <button class="wa-brand wa-accent" type="submit">
                  Consultar AEAT
                </button>
              </fieldset>
            </form>
            <details class="certificate-help">
              <summary>Acceso con certificado</summary>
              <button
                id="authenticate"
                type="button"
                class="wa-neutral wa-outlined"
                disabled={busy}
                onClick={() => void chrome.tabs.create({ url: QUERY_URL })}
              >
                Abrir acceso con certificado
              </button>
              <p>
                Chrome gestiona tu certificado. Si la consulta falla al
                identificarte, abre el acceso y vuelve a intentarlo.
              </p>
            </details>
          </details>
        </aside>
        <section class="trabajo" aria-labelledby="results-title">
          <h2 id="results-title" tabindex={-1}>
            Justificantes presentados
          </h2>
          <p class="aeat-intro">AEAT · Producción · Solo consulta</p>
          <p id="scope">
            {batch
              ? `Lote: ${batch.nif} · Modelos ${batch.models.join(", ")} · Ejercicios ${batch.yearFrom}–${batch.yearTo} · Presentaciones del ${batch.from} al ${batch.to}`
              : "Selecciona modelos y ejercicios para reunir sus justificantes."}
          </p>
          <div class="acciones">
            <div>
              <strong id="count">
                {archive.visible.length
                  ? `${archive.visible.length} declaraciones`
                  : archive.batch
                    ? "0 declaraciones recuperadas"
                    : "Sin consulta"}
              </strong>
              <p id="download-summary">
                {`${countIn(["done"])} descargados · ${countIn(["pending", "error"])} pendientes${uncertain ? ` · ${uncertain} por revisar` : ""}`}
              </p>
            </div>
            <div class="botones">
              <button
                id="cancel"
                type="button"
                class="wa-danger wa-outlined"
                hidden={!operation}
                onClick={() => operation?.abort()}
              >
                Cancelar
              </button>
              <button
                id="download"
                type="button"
                class="wa-brand wa-accent"
                disabled={busy || selected.size === 0}
                onClick={downloadSelection}
              >
                {selected.size
                  ? `Descargar selección (${selected.size})`
                  : "Descargar selección"}
              </button>
            </div>
          </div>
          <wa-callout
            id="status"
            class={status.error ? "estado error" : "estado"}
            variant={status.error ? "warning" : "neutral"}
            size="s"
            role="status"
            aria-live="polite"
            hidden={!status.text}
          >
            {status.text}
          </wa-callout>
          <wa-callout
            id="limit"
            class="aeat-warning"
            variant="warning"
            size="s"
            role="alert"
            hidden={!archive.saturated}
          >
            Alguna consulta devolvió 100 declaraciones y puede estar incompleta.
            Revisa el modelo y ejercicio en el lote y acota las fechas para
            recuperar el resto.
          </wa-callout>
          <section
            id="batch-panel"
            class="batch-panel"
            aria-label="Progreso de consultas"
            hidden={queries.length === 0}
          >
            <div class="batch-overview">
              <span id="query-progress">
                {queries.length
                  ? `${resolved} de ${queries.length} consultas completadas`
                  : ""}
              </span>
              <button
                id="show-issues"
                type="button"
                class="text-action wa-danger wa-plain"
                hidden={issues === 0}
                onClick={() => {
                  batchDetailsOpen = true;
                  queryFilter = "issues";
                  update();
                  document.getElementById("query-filter")?.focus();
                }}
              >
                {`${issues} con incidencias`}
              </button>
              <button
                id="resume"
                type="button"
                class="wa-brand wa-outlined"
                hidden={remaining === 0}
                disabled={busy}
                onClick={resume}
              >
                {`Reanudar consultas (${remaining})`}
              </button>
            </div>
            <wa-progress-bar
              id="batch-progress"
              value={(resolved / Math.max(1, queries.length)) * 100}
              label="Consultas resueltas"
            />
            <details
              id="batch-details"
              open={batchDetailsOpen}
              onToggle={(event) =>
                (batchDetailsOpen = event.currentTarget.open)
              }
            >
              <summary>Ver consultas por modelo y ejercicio</summary>
              <label class="query-filter" for="query-filter">
                Mostrar
                <select
                  id="query-filter"
                  value={queryFilter}
                  onChange={(event) => {
                    queryFilter = value(event);
                    update();
                  }}
                >
                  <option value="issues">Incidencias y pendientes</option>
                  <option value="all">Todas las consultas</option>
                </select>
              </label>
              <ul id="queries" aria-label="Consultas por modelo y ejercicio">
                {shownQueries.map((query) => (
                  <QueryItem
                    key={`${query.selection.model}/${query.selection.year}`}
                    query={query}
                  />
                ))}
              </ul>
              <p id="queries-empty" hidden={shownQueries.length > 0}>
                Todas las consultas han terminado sin incidencias.
              </p>
            </details>
          </section>
          <div id="document-controls" hidden={archive.visible.length === 0}>
            <div class="document-filters">
              <label for="document-search">
                Buscar documento
                <input
                  id="document-search"
                  type="search"
                  placeholder="Modelo, año o justificante"
                  autocomplete="off"
                  value={documentSearch}
                  onInput={(event) => {
                    documentSearch = value(event);
                    pageIndex = 0;
                    update();
                  }}
                />
              </label>
              <label for="document-year">
                Ejercicio
                <select
                  id="document-year"
                  value={documentYear}
                  onChange={(event) => {
                    documentYear = value(event);
                    pageIndex = 0;
                    update();
                  }}
                >
                  <option value="all">Todos</option>
                  {years.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
              </label>
              <label for="document-state">
                Descarga
                <select
                  id="document-state"
                  value={documentState}
                  onChange={(event) => {
                    documentState = value(event);
                    pageIndex = 0;
                    update();
                  }}
                >
                  <option value="all">Todos los estados</option>
                  <option value="pending">Pendientes</option>
                  <option value="done">Descargados</option>
                  <option value="issues">Con incidencias</option>
                </select>
              </label>
            </div>
            <div class="selection-summary">
              <p id="selection-note">
                {`${selected.size} seleccionados${hiddenSelected ? ` · ${hiddenSelected} fuera de estos filtros` : ""}`}
              </p>
              <button
                id="clear-selection"
                type="button"
                class="text-action wa-brand wa-plain"
                disabled={busy || selected.size === 0}
                onClick={() => {
                  if (!operation) {
                    selected.clear();
                    update();
                  }
                }}
              >
                Quitar selección
              </button>
            </div>
            <div class="aeat-columns">
              <label>
                <input
                  id="select-visible"
                  type="checkbox"
                  disabled={busy || actionable.length === 0}
                  checked={allChecked}
                  indeterminate={
                    !allChecked && actionable.some((key) => selected.has(key))
                  }
                  onChange={(event) => {
                    if (operation) return;
                    const checked = event.currentTarget.checked;
                    for (const key of filteredKeys())
                      if (
                        ["pending", "error"].includes(
                          archive.entries[key].state,
                        )
                      )
                        checked ? selected.add(key) : selected.delete(key);
                    update();
                  }}
                />{" "}
                Seleccionar resultados
              </label>
              <span>Presentación</span>
              <span>Descarga</span>
            </div>
          </div>
          <ul id="results" aria-label="Justificantes AEAT" aria-busy={busy}>
            {filtered.slice(start, start + pageSize).map((key) => (
              <ResultRow key={key} entryKey={key} busy={busy} />
            ))}
          </ul>
          <div id="empty" class="vacio" hidden={archive.visible.length > 0}>
            <h3 id="empty-title">
              {archive.batch
                ? "Aún no se han recuperado justificantes"
                : "Tu archivo empieza con una consulta"}
            </h3>
            <p id="empty-description">
              {archive.batch
                ? "Revisa el estado de las consultas del lote. Un error no confirma que no haya declaraciones."
                : "Elige varios modelos y un intervalo de ejercicios. Después podrás descargar sus justificantes y conservar el inventario."}
            </p>
          </div>
          <p
            id="filtered-empty"
            class="vacio"
            hidden={archive.visible.length === 0 || filtered.length > 0}
          >
            No hay documentos con estos filtros. Prueba con otro ejercicio o
            estado.
          </p>
          <nav
            id="pagination"
            class="pagination"
            aria-label="Páginas de justificantes"
            hidden={filtered.length === 0}
          >
            <span id="page-range" aria-live="polite">
              {`${start + 1}–${Math.min(start + pageSize, filtered.length)} de ${filtered.length} documentos`}
            </span>
            <div>
              <button
                id="previous-page"
                type="button"
                class="wa-neutral wa-outlined"
                aria-label="Página anterior"
                disabled={pageIndex === 0}
                onClick={() => {
                  pageIndex = Math.max(0, pageIndex - 1);
                  update();
                }}
              >
                Anterior
              </button>
              <button
                id="next-page"
                type="button"
                class="wa-neutral wa-outlined"
                aria-label="Página siguiente"
                disabled={start + pageSize >= filtered.length}
                onClick={() => {
                  pageIndex++;
                  update();
                }}
              >
                Siguiente
              </button>
            </div>
          </nav>
          <p class="download-location">
            Destino: Descargas / AEAT / NIF / ejercicio
          </p>
          <div class="aeat-tools">
            <button
              id="refresh"
              type="button"
              class="wa-neutral wa-outlined"
              disabled={busy}
              onClick={refresh}
            >
              Actualizar estados
            </button>
            <button
              id="downloads"
              type="button"
              class="wa-neutral wa-outlined"
              onClick={() =>
                void chrome.tabs.create({ url: "chrome://downloads/" })
              }
            >
              Ver descargas de Chrome
            </button>
            <button
              id="export"
              type="button"
              class="wa-neutral wa-outlined"
              disabled={busy}
              onClick={exportInventory}
            >
              Exportar inventario
            </button>
          </div>
          <details class="ayuda">
            <summary>Alcance y datos guardados</summary>
            <p>
              MVP con pruebas locales. La compatibilidad real del certificado de
              Windows y del cotejo PDF está pendiente de comprobar. Solo
              descarga PDF; no recupera los TXT originales ni envía datos a
              terceros: solo contacta con los dos dominios de AEAT indicados
              abajo.
            </p>
            <p>
              El historial, NIF y metadatos se conservan en este perfil hasta
              que los borres. Los PDF permanecen en Descargas. Una descarga
              completa no verifica el contenido fiscal ni la firma del
              documento.
            </p>
            <p>
              Si Chrome pierde el registro de una descarga, revisa tus archivos
              antes de prepararla de nuevo. El historial de incógnito se guarda
              por separado y tampoco se borra automáticamente al cerrar la
              ventana.
            </p>
            <p>
              Consulta:{" "}
              <code>
                www1.agenciatributaria.gob.es/wlpl/SCEJ-MANT/ConsultaExt
              </code>
              . PDF:{" "}
              <code>
                www2.agenciatributaria.gob.es/wlpl/inwinvoc/es.aeat.dit.adu.eeca.catalogo.vis.VisualizaSc
              </code>
              .
            </p>
            <button
              id="forget"
              type="button"
              class="wa-danger wa-outlined"
              disabled={busy}
              onClick={forget}
            >
              Borrar historial local AEAT
            </button>
          </details>
        </section>
      </main>
    </>
  );
}

function update(): void {
  render(<App />, document.body);
}

async function initialize(): Promise<void> {
  await navigator.locks.request(
    lockKey,
    { ifAvailable: true },
    async (lock) => {
      await load();
      if (lock) await reconcile();
    },
  );
  const currentYear = new Date().getFullYear();
  const selection: BatchSelection = archive.batch?.selection ?? {
    nif: "",
    name: "",
    models: ["130"],
    yearFrom: currentYear,
    yearTo: currentYear,
    from: `${currentYear}-01-01`,
    to: new Date().toISOString().slice(0, 10),
  };
  form.nif = selection.nif;
  form.name = selection.name;
  form.from = selection.from;
  form.to = selection.to;
  form.yearFrom = String(selection.yearFrom);
  form.yearTo = String(selection.yearTo);
  form.models = MODELS.filter((model) => selection.models.includes(model));
  for (const key of archive.visible)
    if (["pending", "error"].includes(archive.entries[key].state))
      selected.add(key);
  consultationOpen = !archive.batch || matchMedia("(min-width: 851px)").matches;
  ready = true;
  update();
  if (archive.visible.length) message("");
}
initializeTheme(THEME_KEY, () => theme);
update();
void initialize().catch((error) => message(errorText(error), true));
