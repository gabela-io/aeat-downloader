# Tareas: correcciones de la revisión

**Entrada**: [spec.md](spec.md), [plan.md](plan.md).

## Fase 1: preparación

- [x] T001 `specs/002-review-fixes/` y `.specify/feature.json`.

## Fase 2: historia 1, red y XML (P1)

- [x] T002 [US1] CSP en `build.ts`; comentarios de `app.tsx` y `interface.spec.ts`; prueba de `connect-src` bloqueado.
- [x] T003 [US1] Parser estricto (atributos, texto, `<error>` mezclado, justificante repetido) en `src/client.ts`.
- [x] T004 [US1] Casos malos con mensaje en `download.spec.ts` (T1 DOCTYPE, T2 101 filas, hallazgos 7 y 9) y lote detenido por contrato (T4).

## Fase 3: historia 2, errores (P1)

- [x] T005 [US2] `NetworkError`/`AccessError` y error UTF-8 en `src/client.ts`; `errorText` en `src/app.tsx`; pruebas unitarias.
- [x] T006 [US2] Acción en `#status`, aviso y espera de permiso, `aria-invalid` en `#nif`; pruebas en ambos recorridos.

## Fase 4: historia 3, descargas y borrado (P1)

- [x] T007 [US3] Rechazo de `downloads.download` → `error`.
- [x] T008 [US3] «Descargar de nuevo» y «Preparar otra descarga» individuales, foco y casilla «Ya descargado».
- [x] T009 [US3] Confirmación de borrado con recuentos y exportación previa; prueba de exportar (T5).
- [x] T010 [US3] Pruebas de las ramas de `reconcile` (T3).

## Fase 5: casos límite y aspecto

- [x] T011 Icono con `#results-title` (`background.ts`) y su prueba.
- [x] T012 Fecha local por defecto (`localDay`) y su prueba.
- [x] T013 Tokens de contraste en `src/style.css`; medición antes y después.

## Fase 6: cierre

- [x] T014 Mutantes de la revisión ejecutados contra la suite.
- [x] T015 CHANGELOG, README y AGENTS.md si cambia lo que describen.
- [x] T016 `just test`, `just test-browser`, `nix flake check`; capturas.
