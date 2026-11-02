# Tareas: descargador AEAT como extensión independiente

**Entrada**: [spec.md](spec.md), [plan.md](plan.md).

## Fase 1: preparación

- [x] T001 Inicializar git y Spec Kit; constitución en `.specify/memory/constitution.md`.
- [x] T002 Flake blueprint (`prefix = "nix/"`): `nix/devshell.nix`, `nix/formatter.nix`, `.envrc`, `.gitignore`, `justfile`.
- [x] T003 `package.json` y `bun.lock` con preact, webawesome, `@playwright/test`, `@types/chrome`, `@types/bun`; `tsconfig.json`.

## Fase 2: base

- [x] T004 `src/client.ts` desde `aeat-client.ts`, con validación de NIF local.
- [x] T005 [P] `src/theme.ts`, `src/elements.d.ts`, `src/background.ts` (abre o enfoca la página).
- [x] T006 `build.ts`: bundle de `app.tsx` y `background.ts`, manifiesto mínimo.

## Fase 3: historias 1 y 2 (P1)

- [x] T007 [US1][US2] `src/app.tsx` desde `aeat.tsx`: sin enlace a Facturas, sin índice 0.5.0, destino `AEAT/…`.
- [x] T008 [US1][US2] `src/index.html` y `src/style.css` (base común + `aeat.css`).
- [x] T009 [US1] `test/client.test.ts` con `bun test`.
- [x] T010 [US1][US2] `test/browser/download.spec.ts` desde `aeat.spec.ts`.

## Fase 4: historia 3 (P2)

- [x] T011 [US3] `test/browser/interface.spec.ts` desde `aeat-interface.spec.ts`.

## Fase 5: Nix y documentación

- [x] T012 `nix/packages/aeat-downloader`: `node_modules` fijo, build, tipos y pruebas unitarias.
- [x] T013 `nix/checks/browser.nix`: Playwright con Chromium de nixpkgs.
- [x] T014 README, AGENTS.md (+ CLAUDE.md), CHANGELOG, LICENSE.
- [x] T015 `nix flake check` y recorridos de navegador en verde.

## Pendiente (fuera de esta fase)

- [ ] T016 Prueba supervisada con el certificado real del titular (specs/004 T5).
- [ ] T017 Retirar el descargador de autonomo (decisión del titular).
