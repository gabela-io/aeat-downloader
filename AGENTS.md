# aeat-downloader

Extensión de Chrome (MV3, Preact + Web Awesome, Bun) que consulta en producción
las declaraciones presentadas del titular y descarga sus justificantes PDF.
Solo lectura. Extraída de `autonomo/apps/invoices-extension` 0.8.0.

## Estructura

| Ruta                                  | Qué                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------- |
| `src/client.ts`                       | endpoints fijos, validación de selección/NIF, parser XML estricto, PDF, lotes   |
| `src/app.tsx`                         | página: estado, cola persistente, bloqueo entre pestañas, descargas, vista      |
| `src/background.ts`                   | el icono abre o enfoca la página                                                |
| `src/theme.ts`, `src/style.css`       | tema claro/oscuro sobre Web Awesome                                             |
| `build.ts`                            | `Bun.build` + `manifest.json` (permisos tomados de `AEAT_ORIGINS`)              |
| `test/client.test.ts`                 | `bun test`, con `fetch` simulado                                                |
| `test/browser/*.spec.ts`              | Playwright con la extensión real, DNS bloqueado y rutas interceptadas           |
| `nix/`                                | blueprint (`prefix = "nix/"`): devshell, formatter, paquete, check de navegador |
| `specs/`, `.specify/`                 | Spec Kit: especificaciones y su andamiaje (no se formatea)                      |
| `.claude/skills/`, `skills-lock.json` | skills de Spec Kit y de terceros (`npx skills`), sin formatear                  |

## Comandos

| Comando             | Qué                                                         |
| ------------------- | ----------------------------------------------------------- |
| `just test`         | `tsc --noEmit` + `bun test`                                 |
| `just build`        | extensión en `build/`                                       |
| `just test-browser` | recorridos de Playwright (requiere `just build`, lo invoca) |
| `just fmt`          | `nix fmt`                                                   |
| `just check`        | `nix flake check` (lo que debe pasar antes de cerrar algo)  |

## Invariantes

- Solo `www1`/`www2.agenciatributaria.gob.es`, por POST de formulario con
  `redirect: "error"`. Ningún otro destino de red; nada a terceros. Las pruebas
  de navegador fallan si aparece otra URL.
- Permisos del manifiesto: `downloads`, `storage` y los dos dominios como
  `optional_host_permissions`. Añadir uno exige justificarlo en la especificación.
- Una respuesta de error, vacía o HTML nunca significa «sin declaraciones».
  Errores de servicio (`QueryResponseError`) se aíslan por consulta; red,
  autenticación y contrato detienen el lote. Sin reintentos automáticos.
- La intención se guarda antes de descargar. Una descarga sin ID confirmado pasa
  a `uncertain` y solo una acción explícita la repite.
- Clave de almacenamiento `aeat-history-v1-{normal,incognito}` y formato
  `version: 1`: cambiarlos rompe los índices existentes.
- Datos de prueba sintéticos (`11111111H`, `PERSONA DE PRUEBA`, CSV `TEST…`).
  Nunca credenciales, certificados ni respuestas reales en fixtures o logs.
- `@playwright/test` va fijado a la versión de `playwright-driver` de nixpkgs;
  al actualizar uno, actualiza el otro. `tsc` viene de nixpkgs, no de npm.
- `node_modules` en Nix es una derivación de salida fija: tras cambiar
  `bun.lock`, actualiza `outputHash` en `nix/packages/aeat-downloader.nix`.

## Forma de trabajo

- Interfaz y documentación en español; código, identificadores, comentarios y
  pruebas en inglés.
- Cambios sustanciales con Spec Kit (`specs/NNN-…`: spec, plan, tasks); los
  principios están en `.specify/memory/constitution.md`.
- Commits pequeños y firmados. Sin remoto, push ni PR salvo petición del titular.
