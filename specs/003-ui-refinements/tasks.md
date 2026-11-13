# Tareas: refinamientos de la interfaz

**Entrada**: [spec.md](spec.md), [plan.md](plan.md).

## Fase 1: preparación

- [x] T001 `specs/003-ui-refinements/` y `.specify/feature.json`; capturas de referencia y sonda de contraste antes de cambiar nada.

## Fase 2: historia 4, accesibilidad (P2, primero para comparar capturas)

- [ ] T002 [US4] `font-size` en `rem` en `src/style.css`; capturas idénticas a las de referencia; prueba de letra al 200 %.
- [ ] T003 [US4] Barra de progreso sin transición con movimiento reducido; prueba.
- [ ] T004 [US4] Campos y selects de 44 px a ≤ 700 px; prueba a 390 px.

## Fase 3: historia 1, textos (P1)

- [ ] T005 [US1] Plurales en todos los recuentos; pruebas en singular.
- [ ] T006 [US1] Resumen del diálogo de borrado con historial y lote; prueba.
- [ ] T007 [US1] Botón del aviso con el color del aviso; prueba.
- [ ] T008 [US1] `#scope` en dd/mm/aaaa y ayuda sin MVP; pruebas.
- [ ] T009 [US1] Nombres de modelo y nombre accesible; prueba a 320 px.

## Fase 4: historia 2, gravedad (P1)

- [ ] T010 [US2] Tres niveles de color en `#status`, filas y consultas; pruebas.
- [ ] T011 [US2] Entorno único en la cabecera; sin mensaje de reposo; pruebas.

## Fase 5: historia 3, truncadas (P1)

- [ ] T012 [US3] «Acotar esta consulta» y `#limit` que remite a ella; prueba sin peticiones.
- [ ] T013 [US3] Recuento «N con error · M incompleta»; prueba.

## Fase 6: cierre

- [ ] T014 Un mutante por punto con el script de 002.
- [ ] T015 Contraste con la sonda de 002 (texto, bordes, foco), ambos temas.
- [ ] T016 Capturas finales: primer arranque, lote con error, truncada e incierta, diálogo, letra al 200 %.
- [ ] T017 CHANGELOG, README y AGENTS.md si cambia lo que describen.
- [ ] T018 `just test`, `just test-browser`, `nix flake check`.
