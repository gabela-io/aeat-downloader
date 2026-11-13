# Especificación: correcciones de la revisión

**Rama**: `002-review-fixes` · **Creada**: 2026-11-13 · **Estado**: implementada

**Entrada**: corregir los defectos de la revisión adversarial de código y los
problemas P1 de la crítica de interfaz, con pruebas que fallen si se pierden. El
alcance lo aprobó el titular; lo demás no cambia.

Investigación reutilizada (no se repite aquí):

- Revisión de código: `review-adversarial/HANDOFF.md` (hallazgos 1-11, pruebas T1-T8).
- Crítica de interfaz: `review-ui/HANDOFF-A.md` (P1) y `HANDOFF-B.md`
  (mediciones de contraste no textual).

## Escenarios y pruebas

### Historia 1: la red y el XML no admiten más de lo previsto (P1)

1. **Dado** un `fetch` o una imagen hacia otro host desde la página, **entonces**
   la CSP del manifiesto lo bloquea (`connect-src` solo admite los dos orígenes
   AEAT) y la página no muestra errores de consola propios.
2. **Dado** un XML con atributos, texto suelto entre elementos, un `<error>`
   junto a filas o el mismo justificante dos veces, **entonces** se rechaza como
   contrato roto y el lote se detiene.
3. **Dado** un DOCTYPE delante de una respuesta válida o 101 filas, **entonces**
   se rechaza con su mensaje.
4. **Dado** un contrato roto en la segunda consulta de un lote, **entonces** las
   consultas siguientes no se lanzan.

### Historia 2: errores con su causa y su salida (P1)

1. **Dado** una respuesta que no es UTF-8, **entonces** el mensaje lo dice y no
   menciona el certificado.
2. **Dado** un fallo de red, HTTP o una página de acceso, **entonces** `#status`
   lo explica y ofrece **Abrir acceso con certificado**; un permiso denegado
   ofrece **Conceder acceso**.
3. **Dado** que aún no se ha concedido acceso, **entonces** junto a
   **Consultar AEAT** se avisa de que Chrome pedirá acceso a los dos dominios, y
   mientras el diálogo está abierto el estado dice «Esperando el permiso de
   Chrome…».
4. **Dado** un NIF no válido, **entonces** `#nif` queda con `aria-invalid`,
   recibe el foco y el mensaje nombra el campo.

### Historia 3: volver a descargar y borrar sin perder nada (P1)

1. **Dado** un justificante «Descargado», **cuando** se pulsa
   **Descargar de nuevo**, **entonces** se descarga solo esa entrada, Chrome
   no sobrescribe el archivo existente (`uniquify`) y el foco vuelve a la fila.
2. **Dado** un «Revisar descarga», **cuando** se pulsa
   **Preparar otra descarga**, **entonces** se descarga solo esa entrada, sin
   añadirla a la selección masiva.
3. **Dado** que Chrome rechaza la llamada de descarga, **entonces** la entrada
   queda en error (pendiente), no en «Revisar descarga».
4. **Dado** **Borrar historial local AEAT**, **entonces** se pide confirmación
   con los recuentos (declaraciones, descargadas, por revisar), se recuerda que
   los PDF siguen en Descargas y se ofrece exportar antes; cancelar no borra.
5. **Dado** un índice con descargas, **cuando** se recarga, **entonces**
   `reconcile` aplica cada rama: completa → «Descargado», archivo borrado o
   interrumpida → pendiente, en curso → guardando, sin registro → «Revisar
   descarga».

### Casos límite

- El icono de la extensión enfoca la página aunque su URL lleve `#results-title`.
- La fecha «hasta» por defecto es hoy en hora local, no en UTC.

## Requisitos

- **FR-001**: CSP `extension_pages` con `default-src 'self'`, `connect-src`
  limitado a los orígenes de `AEAT_ORIGINS`, `img-src 'self' data:` y
  `style-src 'self' 'unsafe-inline'` (Web Awesome y Preact fijan estilos en línea).
- **FR-002**: solo un `TypeError` de `fetch` o de la lectura del cuerpo es
  error de red; una respuesta no UTF-8 tiene su propio error.
- **FR-003**: un rechazo de `chrome.downloads.download` deja la entrada en `error`.
- **FR-004**: el service worker busca la página por URL sin fragmento.
- **FR-005**: el parser rechaza atributos, texto suelto, `<error>` mezclado con
  filas y justificantes repetidos.
- **FR-006**: la fecha «hasta» por defecto es la fecha local de hoy.
- **FR-007**: confirmación de borrado con recuentos, aviso sobre los PDF y
  exportación previa; el borrado sale de la ayuda a su propia zona.
- **FR-008**: acción por fila para `done` («Descargar de nuevo») y `uncertain`
  («Preparar otra descarga») que descarga esa entrada sola, con `uniquify`, y
  devuelve el foco a la fila. La casilla de un `done` aparece marcada y su
  nombre accesible dice «Ya descargado».
- **FR-009**: errores de red, autenticación o permiso con su botón de acción en
  `#status`; aviso previo al permiso; estado de espera del permiso;
  `aria-invalid` en `#nif`.
- **FR-010**: bordes de campos, selects y botones contorneados y anillo de foco
  con contraste ≥ 3:1 frente a su fondo real en ambos temas, también en filas
  seleccionadas, mediante tokens en `src/style.css`.

Sin cambios: permisos del manifiesto, endpoints, clave de almacenamiento y
formato `version: 1`.

## Criterios de éxito

- `just test`, `just test-browser` y `nix flake check` pasan.
- Los mutantes de la revisión (guarda DOCTYPE `if (false)`, tope de 100 → `false`,
  «sin registro» → `pending`) hacen fallar la suite.
- Contraste medido ≥ 3:1 en bordes y foco, claro y oscuro.

## Fuera de alcance

Hallazgo 2 (`descripcionError`), 4 (índice de incógnito), 10 y 11; `reconcile`
devolviendo a pendiente los archivos que Chrome ya no encuentra; el GET de
«Abrir acceso con certificado»; los P2 de interfaz y la cuadrícula ejercicio ×
modelo.
