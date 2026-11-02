// Packs the Chrome extension (MV3) with Bun's bundler: one self-contained ES
// module for the page plus the service worker; copies HTML, CSS and the manifest.
// The stylesheet is copied, not bundled, so Web Awesome's theme stays byte-identical.
import { copyFile, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { AEAT_ORIGINS } from "./src/client";

const { version } = JSON.parse(await readFile("package.json", "utf8"));

await rm("build", { recursive: true, force: true });
await mkdir("build", { recursive: true });
const result = await Bun.build({
  entrypoints: ["src/app.tsx", "src/background.ts"],
  outdir: "build",
  target: "browser",
  format: "esm",
  splitting: false,
  minify: false,
  naming: "[name].[ext]",
  // Production builds of Lit (Web Awesome) without its dev-mode warnings.
  conditions: ["production"],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
});
if (!result.success) throw new AggregateError(result.logs, "build_failed");
for (const file of ["index.html", "style.css"])
  await copyFile(`src/${file}`, `build/${file}`);
await cp(
  "node_modules/@awesome.me/webawesome/dist/styles",
  "build/webawesome",
  { recursive: true },
);
await writeFile(
  "build/manifest.json",
  JSON.stringify(
    {
      manifest_version: 3,
      name: "Histórico AEAT",
      version,
      description:
        "Consulta tus declaraciones presentadas en la AEAT y descarga sus justificantes PDF. Solo lectura.",
      minimum_chrome_version: "120",
      incognito: "split",
      permissions: ["downloads", "storage"],
      optional_host_permissions: AEAT_ORIGINS,
      action: { default_title: "Abrir Histórico AEAT" },
      background: { service_worker: "background.js", type: "module" },
      content_security_policy: {
        extension_pages:
          "script-src 'self'; object-src 'none'; base-uri 'none'",
      },
    },
    null,
    2,
  ) + "\n",
);
console.log("Extensión preparada en build/ (cargar descomprimida en Chrome).");
