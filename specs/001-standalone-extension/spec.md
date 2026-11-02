# Especificación: descargador AEAT como extensión independiente

**Rama**: `main` · **Creada**: 2026-11-02 · **Estado**: implementada

**Entrada**: extraer el descargador «Histórico AEAT» de la extensión de facturas
de autonomo (`apps/invoices-extension`, versión 0.8.0) a un repositorio y una
extensión de Chrome propios, sin depender de la extensión de facturas y
conservando comportamiento, salvaguardas y pruebas.

Origen funcional y evidencia: `autonomo/specs/004-aeat-browser-history/`
(requisitos FR1–FR7, plan, validación del MVP 0.7.0). Esta especificación no
repite esa investigación: la reutiliza y fija qué cambia al separarla.

## Escenarios y pruebas

### Historia 1: consultar un lote de presentaciones (P1)

El titular abre la extensión, introduce NIF/NIE y nombre, marca modelos y un
intervalo de ejercicios, ajusta las fechas de presentación y pulsa
**Consultar AEAT**. Ve cada declaración con modelo, periodo, justificante y fecha.

**Prueba independiente**: Chromium real con la extensión cargada, DNS bloqueado y
respuestas XML sintéticas interceptadas.

1. **Dado** un lote de 2 modelos × 2 ejercicios, **cuando** una consulta devuelve
   HTTP 403, **entonces** el lote se detiene y **Reanudar consultas** solo repite
   las combinaciones pendientes o fallidas, también tras recargar.
2. **Dado** un error de servicio (`<error>`), **cuando** se consulta, **entonces**
   se registra en esa combinación y el lote sigue con las demás.
3. **Dado** HTML, DTD, XML vacío, malformado, duplicado, de otro NIF o fuera de
   fechas, o una redirección, **entonces** se rechaza con un mensaje de error y no
   se muestra ninguna declaración.

### Historia 2: descargar justificantes PDF de forma reanudable (P1)

El titular selecciona declaraciones y pulsa **Descargar selección**. Los PDF se
guardan en `Descargas/AEAT/<NIF>/<ejercicio>/` con su huella SHA-256 en el
índice local.

1. **Dado** un PDF válido, **cuando** termina la descarga en Chrome, **entonces**
   la entrada queda «Descargado» y no se vuelve a descargar en lotes posteriores.
2. **Dado** HTML o un PDF truncado, **entonces** la entrada queda en error y
   pendiente de reintento.
3. **Dado** un cierre de la pestaña tras iniciar la descarga sin confirmar,
   **entonces** la entrada pasa a «Revisar descarga» y solo
   **Preparar otra descarga** permite repetirla.
4. **Dado** otra pestaña con una operación en curso, **entonces** la segunda
   pestaña no inicia ninguna operación.

### Historia 3: revisar un archivo grande, exportar y borrar (P2)

Filtros por texto, ejercicio y estado; selección entre páginas; paginación de 25;
tema claro/oscuro persistente; **Exportar inventario** (JSON) y
**Borrar historial local AEAT** (no borra PDF).

1. **Dado** un índice de 145 documentos y 72 consultas, **entonces** la vista
   pagina, filtra, conserva la selección fuera de filtros y no desborda en
   320–1440 px, sin ninguna petición de red ni violación de CSP.

### Casos límite

- Cien filas en una consulta: aviso de posible truncamiento; no se subdivide.
- Descarga borrada o interrumpida en Chrome: vuelve a pendiente al reconciliar.
- Chrome pierde el registro de una descarga: «Revisar descarga».
- Incógnito: índice separado (`incognito: "split"`).

## Requisitos

- **FR-001**: Extensión de Chrome MV3 independiente, instalable descomprimida,
  sin código ni permisos de la extensión de facturas.
- **FR-002**: Conservar FR1–FR7 de specs/004: solo lectura en producción;
  permisos opcionales solo para `www1` y `www2.agenciatributaria.gob.es`; lotes
  por modelo/ejercicio con reanudación manual; validación estricta de XML y PDF;
  cola persistente con hash y seguimiento de la descarga real; bloqueo entre
  pestañas; exportación local.
- **FR-003**: Permisos obligatorios mínimos: `downloads` y `storage`. Sin
  `scripting`, sin `tabs`, sin dominios de terceros, CSP `script-src 'self'`.
- **FR-004**: Ninguna petición sale de la extensión salvo a los dos endpoints
  fijos de la AEAT (POST de formulario, sin seguir redirecciones).
- **FR-005**: Al pulsar el icono se abre (o enfoca) la página del descargador.
- **FR-006**: Las pruebas unitarias y de navegador del origen se conservan,
  adaptadas, con datos sintéticos.

## Cambios respecto al origen

- Carpeta de destino: `Descargas/AEAT/…` en lugar de `Descargas/Autonomo/AEAT/…`.
- Sin enlace a Facturas ni marca «Autónomo».
- Se retira la compatibilidad con el índice de una sola consulta de 0.5.0: una
  extensión nueva tiene su propio `chrome.storage` y nunca verá ese formato.
- El NIF se valida con una copia local de la función de `autonomo/apps/sheets`.

## Criterios de éxito

- **SC-001**: `nix flake check` pasa: tipos, pruebas unitarias, build y formato.
- **SC-002**: Los dos recorridos de navegador pasan con Chromium de nixpkgs y
  registran cero peticiones fuera de los endpoints AEAT simulados.
- **SC-003**: El manifiesto generado solo declara `downloads`, `storage` y los
  dos dominios AEAT opcionales.

## Supuestos

- Uso personal en Chrome 120+ con la sesión y el certificado del titular.
- La compatibilidad real del certificado (mTLS desde `fetch`) y del endpoint de
  PDF sigue pendiente de una prueba supervisada, igual que en specs/004 (T5).
- La retirada del descargador de autonomo es una fase posterior del titular.
