# Plan: descargador AEAT como extensión independiente

**Rama**: `main` · **Fecha**: 2026-11-02 · **Especificación**: [spec.md](spec.md)

## Resumen

Copiar la página «Histórico AEAT» de autonomo (`src/aeat.tsx`,
`src/aeat-client.ts`, `src/aeat.css`) a una extensión MV3 propia con una única
página y un service worker que la abre. Se recortan las piezas compartidas con
Facturas (cabecera, estilos de proveedores, enlace) y se adaptan las pruebas.
El transporte, la validación y la cola no cambian.

## Por qué una extensión de Chrome

- El certificado del titular vive en Chrome (o en el almacén del sistema que
  Chrome usa). Una página de extensión con permisos de host hace `fetch` con
  `credentials: "include"` a la AEAT sin exportar claves ni pedir el PIN.
- Una CLI ya existe (`autonomo/apps/aeat-history`, curl + PKCS#11) y resuelve
  otro caso: cubre YubiKey/PFX, no el certificado gestionado por Chrome.
- Una web normal no puede: CORS impide leer las respuestas de la AEAT.

## Contexto técnico

- **Lenguaje**: TypeScript 7.0.2 (`tsc` de nixpkgs), JSX de Preact.
- **Dependencias de ejecución**: `preact` 11.0.1 y `@awesome.me/webawesome`
  3.14.0, las mismas que el origen (tema, aviso y barra de progreso).
- **Desarrollo**: Bun 1.4.2 (bundler y `bun test`), `@playwright/test` 1.63.0
  con Chromium de `playwright-driver.browsers` (misma versión en nixpkgs),
  `@types/chrome`, `@types/bun`.
- **Pruebas unitarias**: `bun test` sustituye a Vitest; mismas aserciones con
  `mock` de `bun:test`. Elimina Vitest, Vite, Rolldown y esbuild.
- **Almacenamiento**: `chrome.storage.local`, claves `aeat-history-v1-{normal,incognito}`.
- **Plataforma**: Chrome/Chromium 120+.

## Comprobación de la constitución

- Solo lectura y dos dominios: se conservan endpoints fijos y permisos opcionales;
  el manifiesto pierde `scripting` y todos los dominios de Facturas. ✔
- Sin secretos: fixtures sintéticos heredados (`11111111H`, CSV `TEST…`). ✔
- Recuperación comprobada: se conservan los dos recorridos de navegador. ✔
- Simplicidad: no se añaden dependencias de ejecución; se quitan las de Vitest. ✔

## Estructura

```text
src/
├── client.ts        # transporte AEAT, validación XML/PDF, expansión de lotes (de aeat-client.ts)
├── app.tsx          # página: estado, cola, descargas, vista (de aeat.tsx)
├── theme.ts         # tema claro/oscuro (de theme.ts)
├── background.ts    # el icono abre o enfoca la página
├── elements.d.ts    # tipos JSX de los elementos wa-*
├── index.html
└── style.css        # base común + aeat.css, sin estilos de Facturas
test/
├── client.test.ts   # bun test
└── browser/
    ├── download.spec.ts   # recorrido funcional (de aeat.spec.ts)
    └── interface.spec.ts  # archivo grande (de aeat-interface.spec.ts)
build.ts             # Bun.build + manifiesto
nix/                 # blueprint: devshell, formatter, package, checks
```

## Nix

- `packages/aeat-downloader`: `node_modules` como derivación de salida fija
  (`bun install --frozen-lockfile --os='*' --cpu='*'`, un hash para todos los
  sistemas porque las dependencias son JS puro) y build de la extensión. Su
  `checkPhase` ejecuta `tsc` y `bun test`.
- `checks/browser`: los recorridos de Playwright con Chromium de nixpkgs dentro
  del sandbox (sin red: las rutas se interceptan y el DNS se anula).
- `formatter`: treefmt (nixfmt, deadnix, prettier, mdformat de dgt-consultas).
