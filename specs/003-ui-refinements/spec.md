# Especificación: refinamientos de la interfaz

**Rama**: `003-ui-refinements` · **Creada**: 2026-11-13 · **Estado**: implementada

**Entrada**: refinar la interfaz actual en los puntos de la crítica de
Impeccable que aprobó el titular: arreglos pequeños, gravedad por color, una
acción para las consultas truncadas y los pendientes de accesibilidad. Refina el
diseño actual; no es un rediseño. El alcance lo cerró el titular, así que no hay
fase de aclaraciones.

Investigación reutilizada (no se repite aquí):

- Crítica de diseño: `review-ui/HANDOFF-A.md` (P2, observaciones menores).
- Mediciones: `review-ui/HANDOFF-B.md` (2.1 tamaños, 2.4 letra, 2.5 movimiento).
- Feature 002: `002-review-fixes/HANDOFF.md`, su sonda de contraste y su script
  de mutantes.

## Escenarios y pruebas

### Historia 1: textos que cuadran (P1)

1. **Dado** el diálogo de borrar historial, **entonces** dice que el recuento es
   el historial local entero y cuántas declaraciones son del lote visible.
2. **Dado** un error de acceso, **entonces** «Abrir acceso con certificado»
   dentro del aviso se lee como una acción disponible, con el color de texto
   del aviso (≥ 4,5:1).
3. **Dado** cualquier recuento igual a 1, **entonces** el sustantivo va en
   singular («1 declaración», «1 modelo × 1 ejercicio · 1 consulta»).
4. **Dado** un lote, **entonces** `#scope` muestra las fechas en dd/mm/aaaa.
5. **Dado** «Alcance y datos guardados», **entonces** empieza por los hechos (qué
   se descarga, a quién se contacta) y no por «MVP… pendiente de comprobar».
6. **Dado** el formulario, **entonces** cada casilla de modelo muestra y anuncia
   su nombre corto («130 · Pago fraccionado IRPF») y cabe a 320 px.

### Historia 2: el color dice la gravedad (P1)

1. **Dado** un aviso, una fila o una consulta, **entonces** hay tres niveles:
   informativo (neutro), atención (consulta truncada, descarga por revisar:
   `warning`) y error (consulta o descarga fallida: `danger`).
2. **Dado** la página, **entonces** «AEAT · Producción · Solo consulta» aparece
   una sola vez, como marca discreta junto al título.
3. **Dado** que no hay nada que contar, **entonces** `#status` no se muestra.

### Historia 3: consultas truncadas con salida (P1)

1. **Dado** una consulta `limited` en la lista, **cuando** se pulsa
   **Acotar esta consulta**, **entonces** el formulario queda con ese modelo y
   ejercicio, las opciones de fecha se abren con el foco en «Presentado desde»
   y no se lanza ninguna consulta.
2. **Dado** errores y truncadas, **entonces** el recuento los separa («12 con
   error · 1 incompleta») y coincide con «Reanudar consultas (12)».

### Historia 4: accesibilidad (P2)

1. **Dado** la preferencia de tamaño de letra de Chrome al 200 %, **entonces**
   el texto de la página crece; con el tamaño por defecto se ve igual que antes.
2. **Dado** `prefers-reduced-motion: reduce`, **entonces** la barra de progreso
   no anima su avance.
3. **Dado** un ancho ≤ 700 px, **entonces** campos y selects miden ≥ 44 px de
   alto, como los botones.

## Requisitos

- **FR-001**: el resumen del diálogo de borrado distingue historial y lote.
- **FR-002**: `#status-action` usa el color de texto del aviso que lo contiene.
- **FR-003**: una función de plural para todos los recuentos visibles.
- **FR-004**: `#scope` con `dmy`.
- **FR-005**: la ayuda sin la frase de MVP; se conservan qué se guarda, dónde y
  la nota de incógnito.
- **FR-006**: nombres cortos de modelo en la etiqueta (y por tanto en el nombre
  accesible): 100 Renta (IRPF), 130 Pago fraccionado IRPF, 303 IVA trimestral,
  347 Operaciones con terceros, 349 Operaciones intracomunitarias, 390 Resumen
  anual IVA.
- **FR-007**: `#status` con `variant="danger"` para errores; `#limit`, las filas
  `uncertain` y las consultas `limited` con el color de atención; las filas y
  consultas `error` con el de error.
- **FR-008**: aviso de entorno único en la cabecera; fuera el callout lateral y
  `.aeat-intro`.
- **FR-009**: sin mensaje de reposo inicial.
- **FR-010**: «Acotar esta consulta» en cada consulta `limited`; rellena el
  formulario sin ejecutar nada ni dividir.
- **FR-011**: `#show-issues` separa errores de incompletas.
- **FR-012**: tamaños de letra de `src/style.css` en `rem`, sin `font-size` fijo
  en `:root`.
- **FR-013**: `wa-progress-bar::part(indicator)` sin transición con movimiento
  reducido.
- **FR-014**: `min-height: 44px` en campos y selects a ≤ 700 px.

Sin cambios: la cuadrícula ejercicio × modelo, densidad de filas y paginación,
el resumen de fin de lote, permisos del manifiesto, CSP, endpoints, clave de
almacenamiento y formato `version: 1`.

## Criterios de éxito

- `just test`, `just test-browser` y `nix flake check` pasan.
- Cada punto tiene una prueba que falla si se revierte (un mutante por punto).
- Contraste medido con la sonda de 002: texto ≥ 4,5:1, bordes y foco ≥ 3:1, en
  ambos temas.
- Capturas a 1440 y 390 px, claro y oscuro, idénticas antes y después del paso a
  `rem` con el tamaño de letra por defecto.

## Fuera de alcance

Lo que espera decisión del titular: hallazgo 2 (`descripcionError`), hallazgo 4
(incógnito), `reconcile` para archivos ausentes, el GET de «Abrir acceso con
certificado», el texto de «Preparar otra descarga» y si «Conceder acceso»
relanza la consulta. También dividir consultas automáticamente.
