export const QUERY_URL =
  "https://www1.agenciatributaria.gob.es/wlpl/SCEJ-MANT/ConsultaExt";
export const PDF_URL =
  "https://www2.agenciatributaria.gob.es/wlpl/inwinvoc/es.aeat.dit.adu.eeca.catalogo.vis.VisualizaSc";
export const AEAT_ORIGINS = [
  "https://www1.agenciatributaria.gob.es/*",
  "https://www2.agenciatributaria.gob.es/*",
];
export const MODELS = ["100", "130", "303", "347", "349", "390"];
export interface Selection {
  nif: string;
  name: string;
  model: string;
  year: number;
  from: string;
  to: string;
}
export interface BatchSelection {
  nif: string;
  name: string;
  models: string[];
  yearFrom: number;
  yearTo: number;
  from: string;
  to: string;
}
export function expandBatch(input: BatchSelection): Selection[] {
  if (!input.models.length) throw new Error("Selecciona al menos un modelo.");
  if (
    !Number.isInteger(input.yearFrom) ||
    !Number.isInteger(input.yearTo) ||
    input.yearFrom < 1990 ||
    input.yearTo > new Date().getFullYear() ||
    input.yearFrom > input.yearTo
  )
    throw new Error("Revisa el intervalo de ejercicios.");
  const queries: Selection[] = [];
  for (let year = input.yearFrom; year <= input.yearTo; year++) {
    for (const model of new Set(input.models)) {
      queries.push(
        validateSelection({
          nif: input.nif,
          name: input.name,
          model,
          year,
          from: input.from,
          to: input.to,
        }),
      );
    }
  }
  return queries;
}
// A well-formed service error is isolated to its query. Authentication/network
// failures and unexpected responses stop the batch instead of opening more prompts.
export class QueryResponseError extends Error {}
export interface Declaration {
  ejercicio: string;
  modelo: string;
  periodo: string;
  nif: string;
  csv: string;
  expediente: string;
  justificante: string;
  just_anterior?: string;
  fechaYHoraPresentacion: string;
}
const patterns: Record<string, RegExp> = {
  ejercicio: /^\d{4}$/,
  modelo: /^\d{3}$/,
  periodo: /^(?:0[1-9]|1[012]|[1-4]T|0A)$/,
  nif: /^[A-Z0-9]{9}$/,
  csv: /^[A-Z0-9]{16}$/,
  expediente: /^[A-Z0-9 _/-]{1,25}$/i,
  justificante: /^\d{13}$/,
  just_anterior: /^\d{13}$/,
  fechaYHoraPresentacion:
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/,
};
// DNI (8 digits) or NIE (X/Y/Z + 7 digits) with its mod-23 control letter.
export function validNif(nif: string): boolean {
  const match = nif.match(/^([XYZ]?)(\d+)([A-Z])$/);
  if (!match) return false;
  const [, prefix, digits, letter] = match;
  if (digits.length !== (prefix ? 7 : 8)) return false;
  const number = Number(String("XYZ".indexOf(prefix)) + digits);
  return "TRWAGMYFPDXBNJZSQVHLCKE"[number % 23] === letter;
}
export function validDay(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(date.getTime()) &&
    date.toISOString().slice(0, 10) === value
  );
}
export function validateSelection(input: Selection): Selection {
  const selection = {
    ...input,
    nif: input.nif.trim().toUpperCase(),
    name: input.name.trim(),
  };
  if (!validNif(selection.nif))
    throw new Error("Revisa el NIF o NIE y su letra de control.");
  if (
    !selection.name ||
    selection.name.length > 150 ||
    /[\x00-\x1f]/.test(selection.name)
  )
    throw new Error("Introduce tus apellidos y nombre completos.");
  if (
    !MODELS.includes(selection.model) ||
    !Number.isInteger(selection.year) ||
    selection.year < 1990 ||
    selection.year > new Date().getFullYear()
  )
    throw new Error("Revisa el modelo y el ejercicio.");
  if (
    !validDay(selection.from) ||
    !validDay(selection.to) ||
    selection.from > selection.to
  )
    throw new Error("Revisa el intervalo de fechas de presentación.");
  return selection;
}
export function parseDeclarations(
  xml: string,
  selection: Selection,
): Declaration[] {
  if (/<!DOCTYPE|<!ENTITY|<\?(?!xml\s)/i.test(xml))
    throw new Error("Respuesta XML no admitida.");
  const document = new DOMParser().parseFromString(xml, "application/xml");
  const root = document.documentElement;
  if (
    document.querySelector("parsererror") ||
    root?.tagName !== "servicioConsultasDirectas" ||
    root.namespaceURI
  )
    throw new Error(
      "AEAT no devolvió el XML esperado. Comprueba la identificación con certificado.",
    );
  const rows: Declaration[] = [];
  for (const element of Array.from(root.children)) {
    if (element.tagName === "error")
      throw new QueryResponseError(
        "AEAT devolvió un error de consulta. Revisa identidad, fechas y acceso en la Sede; no confirma ausencia de declaraciones.",
      );
    if (
      element.tagName !== "respuestaCorrecta" ||
      element.namespaceURI ||
      rows.length >= 100
    )
      throw new Error("Respuesta de consulta no admitida.");
    const fields: Record<string, string> = {};
    for (const field of Array.from(element.children)) {
      const name = field.tagName;
      const value = field.textContent?.trim() ?? "";
      if (
        field.children.length ||
        field.namespaceURI ||
        !Object.hasOwn(patterns, name) ||
        Object.hasOwn(fields, name) ||
        !patterns[name].test(value)
      )
        throw new Error(
          "Los datos de una declaración no tienen el formato esperado.",
        );
      fields[name] = value;
    }
    if (
      Object.keys(patterns).some(
        (key) => key !== "just_anterior" && !fields[key],
      )
    )
      throw new Error("Faltan datos en una declaración.");
    if (
      fields.nif !== selection.nif ||
      fields.modelo !== selection.model ||
      fields.ejercicio !== String(selection.year)
    )
      throw new Error(
        "La respuesta no corresponde al NIF, modelo o ejercicio solicitado.",
      );
    const timestamp = fields.fechaYHoraPresentacion;
    const day = timestamp.slice(0, 10);
    if (
      !validDay(day) ||
      !Number.isFinite(Date.parse(timestamp)) ||
      Number(timestamp.slice(11, 13)) > 23 ||
      Number(timestamp.slice(14, 16)) > 59 ||
      Number(timestamp.slice(17, 19)) > 59 ||
      day < selection.from ||
      day > selection.to
    )
      throw new Error(
        "La fecha de una declaración no corresponde al intervalo solicitado.",
      );
    rows.push(fields as unknown as Declaration);
  }
  if (!rows.length)
    throw new QueryResponseError(
      "La respuesta está vacía: no se puede confirmar que no haya declaraciones. Comprueba la consulta en la Sede.",
    );
  if (new Set(rows.map(declarationKey)).size !== rows.length)
    throw new Error(
      "La respuesta contiene declaraciones duplicadas. Acota la consulta.",
    );
  return rows;
}
export function declarationKey(row: Declaration): string {
  return [
    row.nif,
    row.modelo,
    row.ejercicio,
    row.periodo,
    row.expediente,
    row.justificante,
    row.csv,
  ].join("|");
}
async function postForm(
  url: typeof QUERY_URL | typeof PDF_URL,
  values: Record<string, string>,
  limit: number,
  signal: AbortSignal,
): Promise<Uint8Array> {
  const response = await fetch(url, {
    method: "POST",
    body: new URLSearchParams(values),
    credentials: "include",
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]),
  });
  if (!response.ok || !response.body)
    throw new Error(
      `AEAT respondió HTTP ${response.status}. Revisa el acceso con certificado antes de reintentar.`,
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit)
        throw new Error("La respuesta supera el tamaño admitido.");
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}
export async function queryDeclarations(
  input: Selection,
  signal: AbortSignal,
): Promise<Declaration[]> {
  const selection = validateSelection(input);
  const bytes = await postForm(
    QUERY_URL,
    {
      NIF: selection.nif,
      ANR: selection.name.toUpperCase(),
      MOD: selection.model,
      EJF: String(selection.year),
      FED: selection.from.replaceAll("-", ""),
      FEH: selection.to.replaceAll("-", ""),
      HOD: "0000",
      HOH: "2359",
    },
    2 * 1024 * 1024,
    signal,
  );
  return parseDeclarations(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    selection,
  );
}
export async function fetchPdf(
  row: Declaration,
  signal: AbortSignal,
): Promise<Uint8Array> {
  if (!patterns.nif.test(row.nif) || !patterns.csv.test(row.csv))
    throw new Error("Identificadores de documento no válidos.");
  const bytes = await postForm(
    PDF_URL,
    { COMPLETA: "SI", ORIGEN: "E", NIF: row.nif, CSV: row.csv },
    50 * 1024 * 1024,
    signal,
  );
  const decoder = new TextDecoder();
  if (
    !/^%PDF-(?:1\.\d|2\.0)/.test(decoder.decode(bytes.slice(0, 8))) ||
    !/%%EOF\s*$/.test(decoder.decode(bytes.slice(-1024)))
  )
    throw new Error(
      "El resultado no es un PDF completo. Puede ser una página de acceso o un error de AEAT.",
    );
  return bytes;
}
