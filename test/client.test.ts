import { afterEach, describe, expect, it, mock } from "bun:test";
import {
  expandBatch,
  fetchPdf,
  PDF_URL,
  QUERY_URL,
  queryDeclarations,
  validateSelection,
  validNif,
  type Declaration,
  type Selection,
} from "../src/client";
const selection: Selection = {
  nif: "11111111H",
  name: "PERSONA DE PRUEBA",
  model: "130",
  year: 2025,
  from: "2025-01-01",
  to: "2026-01-31",
};
const row = { nif: selection.nif, csv: "TEST000000000001" } as Declaration;
const realFetch = globalThis.fetch;
// Each test installs its own fetch stub; no request ever leaves the process.
function stubFetch(response?: Response) {
  const stub = mock(async (_url: string, _init: RequestInit) => response!);
  globalThis.fetch = stub as unknown as typeof fetch;
  return stub;
}
afterEach(() => {
  globalThis.fetch = realFetch;
});
describe("AEAT browser transport", () => {
  it("expands all selected models across fiscal years without duplicate queries", () => {
    const input = {
      ...selection,
      models: ["130", "303", "130"],
      yearFrom: 2023,
      yearTo: 2025,
    };
    const queries = expandBatch(input);
    expect(queries.map((query) => [query.model, query.year])).toEqual([
      ["130", 2023],
      ["303", 2023],
      ["130", 2024],
      ["303", 2024],
      ["130", 2025],
      ["303", 2025],
    ]);
    expect(
      queries.every(
        (query) => query.from === selection.from && query.to === selection.to,
      ),
    ).toBe(true);
    for (const invalid of [
      { models: [] },
      { models: ["999"] },
      { yearFrom: 2026 },
      { yearFrom: 1989 },
      { yearTo: new Date().getFullYear() + 1 },
      { yearFrom: 2024.5 },
    ])
      expect(() => expandBatch({ ...input, ...invalid })).toThrow();
  });
  it("checks the DNI and NIE control letter", () => {
    for (const valid of ["11111111H", "00000000T", "X0000000T", "Y0000000Z", "Z0000000M"])
      expect(validNif(valid)).toBe(true);
    for (const invalid of ["11111111A", "X00000000T", "1111111H", "W0000000T", ""])
      expect(validNif(invalid)).toBe(false);
  });
  it("validates identity and dates before contacting AEAT", async () => {
    const fetch = stubFetch();
    for (const values of [
      { nif: "11111111A" },
      { from: "2025-02-30" },
      { to: "2024-01-01" },
      { model: "999" },
      { name: "" },
    ]) {
      await expect(
        queryDeclarations(
          { ...selection, ...values },
          new AbortController().signal,
        ),
      ).rejects.toThrow();
    }
    expect(fetch).not.toHaveBeenCalled();
    expect(validateSelection({ ...selection, nif: "11111111h" }).nif).toBe(
      "11111111H",
    );
  });
  it("uses the fixed PDF POST endpoint and reads PDF bytes without downloads API", async () => {
    const fetch = stubFetch(new Response("%PDF-1.7\nfixture\n%%EOF"));
    expect(
      new TextDecoder().decode(
        await fetchPdf(row, new AbortController().signal),
      ),
    ).toContain("%PDF");
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe(PDF_URL);
    expect(init).toMatchObject({
      method: "POST",
      credentials: "include",
      redirect: "error",
      cache: "no-store",
    });
    expect(Object.fromEntries(init.body as URLSearchParams)).toEqual({
      COMPLETA: "SI",
      ORIGEN: "E",
      NIF: row.nif,
      CSV: row.csv,
    });
  });
  it("rejects HTML, truncated PDF, HTTP errors and oversized bodies", async () => {
    for (const response of [
      new Response("<html>Login</html>"),
      new Response("%PDF-1.7 incomplete"),
      new Response("denied", { status: 403 }),
      new Response(new Uint8Array(50 * 1024 * 1024 + 1)),
    ]) {
      stubFetch(response);
      await expect(
        fetchPdf(row, new AbortController().signal),
      ).rejects.toThrow();
    }
  });
  it("sends filing dates separately from the fiscal year, without retrying authentication", async () => {
    const fetch = stubFetch(new Response("denied", { status: 403 }));
    await expect(
      queryDeclarations(selection, new AbortController().signal),
    ).rejects.toThrow("403");
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(QUERY_URL);
    expect(Object.fromEntries(fetch.mock.calls[0][1].body as URLSearchParams)).toMatchObject({
      EJF: "2025",
      FED: "20250101",
      FEH: "20260131",
      HOD: "0000",
      HOH: "2359",
    });
  });
});
