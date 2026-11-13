# Changelog

Cambios relevantes de aeat-downloader. El formato sigue
[Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa
[versionado semántico](https://semver.org/lang/es/).

## [Sin publicar]

Correcciones de la revisión de código y de interfaz
([specs/002-review-fixes](specs/002-review-fixes/spec.md)) y refinamientos de la
interfaz ([specs/003-ui-refinements](specs/003-ui-refinements/spec.md)).

### Añadido

- «Descargar de nuevo» en cada justificante descargado: baja solo esa entrada y
  Chrome guarda la copia con otro nombre, sin sobrescribir.
- Confirmación antes de «Borrar historial local AEAT», con los recuentos de lo
  que se olvida, el recordatorio de que los PDF siguen en Descargas y la opción
  de exportar antes. El borrado tiene su propia zona, fuera de la ayuda.
- Los errores de red, identificación o permiso traen su acción en el aviso
  («Abrir acceso con certificado» o «Conceder acceso»). Antes del primer
  permiso se avisa de que Chrome pedirá acceso a los dos dominios y, mientras
  el diálogo está abierto, el estado dice «Esperando el permiso de Chrome…».
- «Acotar esta consulta» en cada consulta truncada (100 filas): lleva su modelo
  y ejercicio al formulario y abre las fechas, sin lanzar nada.
- Nombre corto junto a cada modelo («130 · Pago fraccionado IRPF»), también en
  su nombre accesible.

### Cambiado

- La CSP del manifiesto limita la página a sus propios archivos y a los dos
  orígenes de la AEAT (`connect-src`); el navegador bloquea cualquier otro host.
- «Preparar otra descarga» descarga esa entrada sola en vez de añadirla a la
  selección.
- Un NIF no válido marca el campo (`aria-invalid`), lo enfoca y el mensaje lo
  nombra. La casilla de un justificante descargado aparece marcada y se anuncia
  como «Ya descargado».
- Bordes de campos y botones contorneados, y anillo de foco, con contraste de
  al menos 3:1 en los dos temas.
- Tres niveles de color: informativo, atención (consulta incompleta, descarga
  por revisar) y error (consulta o descarga fallida). «Revisar descarga» e
  «Incompleta» dejan de usar el color de error; los errores de `#status` usan
  el aviso de error.
- «AEAT · Producción · Solo consulta» aparece una sola vez, junto al título. Sin
  mensaje de reposo cuando no hay nada que contar.
- El recuento de incidencias separa errores e incompletas («12 con error · 1
  incompleta») y cuadra con «Reanudar consultas (12)».
- El diálogo de borrado distingue el historial local entero del lote visible.
- Singular en los recuentos de uno, fechas del lote en dd/mm/aaaa y la ayuda
  empieza por los hechos, sin la nota de MVP.
- Tamaños de letra en `rem`: la preferencia de tamaño de letra de Chrome escala
  la página. Con movimiento reducido la barra de progreso no se anima, y en
  pantallas de 700 px o menos los campos miden 44 px de alto.

### Corregido

- Una respuesta que no está en UTF-8 tiene su propio error; solo un fallo de
  `fetch` se presenta como problema de conexión o certificado.
- Si Chrome rechaza la descarga, la entrada queda en error y no en «Revisar
  descarga».
- El icono enfoca la página abierta aunque su URL lleve `#results-title`.
- El parser rechaza atributos, texto suelto, un `<error>` junto a filas y el
  mismo justificante repetido.
- La fecha «hasta» por defecto es hoy en hora local, no en UTC.
- «Abrir acceso con certificado» dentro del aviso parecía deshabilitado: usa el
  color de texto del aviso.

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
