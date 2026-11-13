# Plan: refinamientos de la interfaz

**Rama**: `003-ui-refinements` · **Fecha**: 2026-11-13 · **Especificación**: [spec.md](spec.md)

## Resumen

Cambios locales en `src/app.tsx` y `src/style.css`, sin dependencias ni capas
nuevas. Cada punto lleva una aserción en los recorridos de Playwright actuales
que falla si se revierte. El paso a `rem` va primero y solo, para comparar
capturas antes y después byte a byte.

## Contexto técnico

Igual que [002](../002-review-fixes/plan.md): TypeScript, Preact, Web Awesome
3.14, Bun, Playwright con Chromium de nixpkgs. Web Awesome ya define sus tamaños
en `rem`, así que quitar `:root { font-size: 16px }` hace que todo siga la
preferencia de Chrome.

## Comprobación de la constitución

- Solo lectura: «Acotar esta consulta» solo rellena el formulario. ✔
- Sin secretos: fixtures sintéticos; ninguna prueba contacta con AEAT. ✔
- Recuperación comprobada: no cambia ninguna transición de estado. ✔
- Simplicidad: sin dependencias; variantes de `wa-callout` y tokens existentes. ✔

## Diseño por punto

| Punto              | Dónde                    | Cómo                                                                                                                         |
| ------------------ | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `rem`              | `style.css`              | cada `font-size: Npx` → `N/16 rem`; fuera el `font-size` de `:root`.                                                         |
| Movimiento         | `style.css`              | `wa-progress-bar::part(indicator) { transition: none }` dentro de `prefers-reduced-motion: reduce`.                          |
| 44 px              | `style.css`              | en `max-width: 700px`, `input:not([type=checkbox]), select { min-height: 44px }`.                                            |
| Plurales           | `app.tsx`                | `count(n, singular, plural?)` usada en todos los recuentos.                                                                  |
| Diálogo            | `app.tsx`                | «Se olvidarán las N declaraciones del historial local (M en este lote): …».                                                  |
| Botón del aviso    | `style.css`              | `#status-action { color: inherit }`: no estaba deshabilitado; era el gris `quiet` sobre el fondo de color del aviso.         |
| `#scope`           | `app.tsx`                | `dmy(batch.from)`, `dmy(batch.to)`.                                                                                          |
| Ayuda              | `app.tsx`                | primer párrafo sin la frase de MVP.                                                                                          |
| Modelos            | `app.tsx`, `style.css`   | `MODEL_NAMES`; etiqueta «130 · Pago fraccionado IRPF»; la rejilla 3×2 pasa a una columna.                                    |
| Gravedad           | `app.tsx`, `style.css`   | `#status` `danger`/`neutral`; `--attention` (`warning-on-quiet`) para `uncertain`, `limited` y la parte «incompleta».          |
| Entorno            | `app.tsx`, `style.css`   | `.entorno` en `.identidad`; fuera el callout lateral y `.aeat-intro`.                                                         |
| Reposo             | `app.tsx`                | `status` inicial vacío.                                                                                                      |
| Acotar             | `app.tsx`                | `narrowQuery(query)`: modelo, ejercicio y fechas de esa consulta al formulario; abre `#consultation` y `#date-options`; foco en `#from`. |
| Recuentos          | `app.tsx`                | `#show-issues` = «N con error · M incompleta(s)»; `#limit` remite a «Acotar esta consulta».                                  |

## Pruebas

- `interface.spec.ts`: entorno único en la cabecera; nombres de modelo y 320 px
  sin desbordar con el formulario abierto; recuentos separados y «Acotar esta
  consulta» en el archivo sembrado (con una consulta `limited`); colores de
  atención y error; ayuda sin MVP; 44 px a 390; transición del indicador;
  letra al 200 % con CDP `Page.setFontSizes`.
- `download.spec.ts`: sin mensaje de reposo; plurales en singular; `#scope` en
  dd/mm/aaaa; botón del aviso con el color del aviso; «Acotar esta consulta»
  sin peticiones; resumen del diálogo de borrado; captura del primer arranque.
- Fuera de la suite: sonda de contraste (texto, bordes y foco) y capturas
  antes/después en el scratchpad de la sesión.
