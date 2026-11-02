# Changelog

Cambios relevantes de aeat-downloader. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [0.1.0] - Sin publicar

Primera versión independiente, extraída del «Histórico AEAT» de la extensión de
facturas de autonomo (0.8.0).

### Añadido

- Extensión de Chrome MV3 propia con una sola página; el icono la abre o enfoca.
- Consulta por lotes de modelos y ejercicios, reanudación, descarga de PDF con
  SHA-256, filtros, paginación, exportación y borrado del índice, como en origen.
- Flake de Nix con blueprint: dev shell, formateador treefmt, paquete con tipos
  y pruebas unitarias, y check con los recorridos de Playwright en Chromium.

### Cambiado

- Los PDF se guardan en `Descargas/AEAT/<NIF>/<ejercicio>/` (antes
  `Descargas/Autonomo/AEAT/…`).
- Permisos reducidos a `downloads` y `storage`, más los dos dominios AEAT
  opcionales; sin `scripting` ni dominios de facturas.
- Pruebas unitarias con `bun test` en lugar de Vitest.

### Eliminado

- Enlace a Facturas y compatibilidad con el índice de una sola consulta (0.5.0),
  que una extensión nueva no puede heredar.
