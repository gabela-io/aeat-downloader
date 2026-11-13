# Plan: correcciones de la revisión

**Rama**: `002-review-fixes` · **Fecha**: 2026-11-13 · **Especificación**: [spec.md](spec.md)

## Resumen

Cambios pequeños y locales en el código existente, sin dependencias nuevas ni
capas nuevas. Cada corrección lleva una aserción en las pruebas actuales
(`test/client.test.ts`, `test/browser/*.spec.ts`) que falla si se revierte.

## Contexto técnico

Igual que [001](../001-standalone-extension/plan.md): TypeScript, Preact,
Web Awesome 3.14, Bun, Playwright 1.63 con Chromium de nixpkgs.

## Comprobación de la constitución

- Solo lectura y dos dominios: la CSP pasa a hacerlo cumplir el navegador. ✔
- Sin secretos: fixtures sintéticos; ninguna prueba contacta con AEAT. ✔
- Recuperación comprobada: nuevas pruebas de `reconcile`, de lote detenido por
  contrato y de las acciones por fila. ✔
- Simplicidad: sin dependencias nuevas; `<dialog>` nativo para confirmar. ✔

## Diseño por punto

| Punto              | Dónde                     | Cómo                                                                                                                                                                                                                       |
| ------------------ | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| CSP                | `build.ts`                | `connect-src` desde `AEAT_ORIGINS` sin `/*`; `default-src 'self'`; comentario corregido en `app.tsx` y en `interface.spec.ts`.                                                                                             |
| Red / UTF-8        | `client.ts`               | `AccessError` (HTTP no OK, XML que no es el esperado) y `NetworkError` (solo `TypeError` de `fetch` o de `read()`); `decode` en `try` con error propio. `errorText` ya no traduce cualquier `TypeError`.                   |
| Descarga rechazada | `app.tsx` `downloadEntry` | si `downloads.download` rechaza, la entrada pasa a `error` antes del `catch` común.                                                                                                                                        |
| Icono              | `background.ts`           | `getContexts` por tipo y comparación sin fragmento; `openPage` expuesto en `globalThis` para la prueba.                                                                                                                    |
| Parser             | `client.ts`               | atributos, texto suelto (`childNodes`), `<error>` junto a otros hijos y justificantes repetidos → `Error`.                                                                                                                 |
| Fecha local        | `client.ts` `localDay`    | `getFullYear/getMonth/getDate`; prueba con `TZ=Europe/Madrid`.                                                                                                                                                             |
| Borrar             | `app.tsx`                 | zona propia tras la ayuda; `<dialog>` modal con recuentos, «Exportar inventario» y «Borrar historial».                                                                                                                     |
| Volver a descargar | `app.tsx`                 | `downloadAgain(key)` en un `run()`; botón por fila para `done` y `uncertain`; foco a la acción de la fila al terminar. Casilla marcada y deshabilitada con «Ya descargado».                                                |
| Errores con acción | `app.tsx`                 | `status.action` (`certificate`/`permission`); aviso de permiso según `chrome.permissions.contains`; «Esperando el permiso de Chrome…»; `aria-invalid` en `#nif`.                                                           |
| Contraste          | `style.css`               | redefinir `--wa-color-neutral-border-loud`, `--wa-color-brand/danger-border-loud` y `--wa-color-focus` a pasos más oscuros (claro) o más claros (oscuro) de la paleta de Web Awesome. Medición con el método de HANDOFF-B. |

## Pruebas

- `test/client.test.ts`: `NetworkError` solo desde `fetch`; respuesta Latin-1;
  `localDay` en Madrid a las 00:30 del 1 de enero.
- `download.spec.ts`: casos malos con su mensaje (DOCTYPE + fila válida, 101
  filas, atributo, texto suelto, `<error>` tras filas, justificante repetido,
  no UTF-8), CSP de `connect-src`, lote detenido por contrato, acciones por
  fila, rechazo de `downloads.download`, borrar con confirmación, exportar,
  ramas de `reconcile` (con `downloads.search` simulado) y capturas del error de
  certificado.
- `interface.spec.ts`: icono tras el enlace de salto, NIF no válido, aviso y
  espera de permiso, permiso denegado con su botón, confirmación de borrado y
  fila `done` en capturas de 1440/390, claro/oscuro.
