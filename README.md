# aeat-downloader

Extensión de Chrome que consulta tus declaraciones ya presentadas en la AEAT y
descarga sus justificantes PDF a `Descargas/AEAT/<NIF>/<ejercicio>/`, con un
índice local que permite reanudar. Usa la sesión y el certificado que ya tienes
en Chrome. **Solo lectura**: no firma, presenta ni modifica declaraciones.

> [!IMPORTANT]
> Proyecto **no oficial**, sin relación con la Agencia Tributaria. Consulta el
> entorno de **producción** con tu identidad. Comprobado con red simulada;
> falta validarlo con un certificado y respuestas reales (ver [Estado](#estado)).

## Qué hace

- Consulta varios modelos (100, 130, 303, 347, 349, 390) y un intervalo de
  ejercicios en un único lote, con fechas de presentación independientes.
- Guarda el estado de cada combinación modelo/ejercicio: **Reanudar consultas**
  repite solo las pendientes o fallidas, también tras cerrar la pestaña.
- Descarga los PDF seleccionados, registra su huella SHA-256 y comprueba que
  Chrome terminó cada descarga. Lo ya descargado no se repite.
- Exporta el inventario a JSON y permite borrar el índice local.

Un error de la AEAT, una respuesta vacía o un HTML de acceso **no** se
interpretan como «no hay declaraciones». Si una consulta devuelve cien filas,
puede estar truncada: acota las fechas.

## Privacidad y seguridad

- Solo contacta con dos endpoints fijos, por POST y sin seguir redirecciones:
  - consulta: `https://www1.agenciatributaria.gob.es/wlpl/SCEJ-MANT/ConsultaExt`
  - PDF por NIF/CSV: `https://www2.agenciatributaria.gob.es/wlpl/inwinvoc/es.aeat.dit.adu.eeca.catalogo.vis.VisualizaSc`
- Permisos: `downloads` y `storage`. El acceso a esos dos dominios es opcional y
  se pide al pulsar **Consultar AEAT**. Sin otros dominios ni scripts remotos.
- Chrome gestiona el certificado: la extensión nunca recibe la clave ni el PIN.
- No envía datos a terceros. NIF, nombre e identificadores se guardan solo en
  `chrome.storage.local` de tu perfil hasta que pulses **Borrar historial local
  AEAT**. El modo incógnito usa un índice separado.

## Instalación

Desde el checkout, con Nix:

```bash
nix build
cp -r --no-preserve=mode result ~/aeat-downloader
```

O, en `nix develop`, `just build` deja la extensión en `build/`.

En Chrome, abre `chrome://extensions`, activa **Modo de desarrollador** y pulsa
**Cargar descomprimida** con esa carpeta. Usa siempre la misma carpeta: Chrome
deriva el ID de la extensión de su ruta y el índice local va ligado a ese ID.
Para actualizar, sustituye el contenido de la carpeta y pulsa **Actualizar**.

En WSL con Chrome de Windows, copia la carpeta a una ruta de Windows
(por ejemplo, `/mnt/c/Users/<usuario>/aeat-downloader`) y cárgala desde allí.

## Uso

1. Pulsa el icono de la extensión. Introduce NIF/NIE y apellidos y nombre, marca
   los modelos y elige los ejercicios. Ajusta las **fechas de presentación**:
   una declaración de 2025 presentada en 2026 exige incluir 2026.
2. Pulsa **Consultar AEAT** y concede acceso a los dos dominios. Si Chrome pide
   el certificado, selecciónalo tú. Si falla la identificación, **Abrir acceso
   con certificado** abre el endpoint en otra pestaña; identifícate y repite.
3. Revisa los justificantes, filtra si hace falta y pulsa **Descargar
   selección**. Mantén abierta la pestaña mientras dure el lote.
4. **Actualizar estados** contrasta el índice con las descargas de Chrome. Una
   descarga sin confirmar queda en «Revisar descarga»: comprueba tus archivos
   antes de **Preparar otra descarga**.

## Desarrollo

`nix develop` (o direnv) aporta Bun, `tsc`, `just`, el formateador y el Chromium
de Playwright.

| Comando             | Qué hace                                               |
| ------------------- | ------------------------------------------------------ |
| `just test`         | tipos (`tsc`) y pruebas unitarias (`bun test`)         |
| `just build`        | extensión descomprimida en `build/`                    |
| `just test-browser` | recorridos en Chromium contra endpoints interceptados  |
| `just fmt`          | `nix fmt` (treefmt: nixfmt, deadnix, prettier, just)   |
| `just check`        | `nix flake check`: build, pruebas, navegador y formato |

Las pruebas usan solo datos sintéticos y bloquean la resolución DNS: ninguna
llega a la AEAT. La especificación está en
[specs/001-standalone-extension](specs/001-standalone-extension/spec.md).

## Estado

Versión 0.1.0, extraída del «Histórico AEAT» de la extensión de facturas de
autonomo (0.8.0), donde se diseñó y probó. Pendiente: una prueba supervisada con
el certificado real (mTLS desde `fetch` en Chrome) y comparar un justificante
descargado con el de la Sede.

## Licencia

[MIT](LICENSE). `.specify/` y `.claude/skills/` los genera [Spec Kit](https://github.com/github/spec-kit) (MIT).
