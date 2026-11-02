# Constitución de aeat-downloader

Principios derivados de las instrucciones del titular, recogidas en
[AGENTS.md](../../AGENTS.md). Las instrucciones actuales del titular prevalecen.

## Principios

### 1. Solo lectura

La extensión consulta presentaciones y descarga justificantes del propio
titular. No firma, presenta, rectifica ni modifica nada en la AEAT. Ninguna ruta
de código envía datos a terceros: solo contacta con los dos dominios de la AEAT
necesarios, con permisos opcionales concedidos por el titular.

### 2. Sin secretos ni datos reales

Chrome y el titular gestionan el certificado; la extensión nunca recibe claves,
PIN ni certificados. Pruebas, fixtures y logs usan solo datos sintéticos
(NIF de prueba, CSV `TEST…`). Ninguna prueba contacta con la AEAT.

### 3. Recuperación comprobada

Una respuesta dudosa no es una ausencia de declaraciones. Se guarda la intención
antes de descargar; una descarga sin confirmar requiere revisión manual, nunca
un reenvío automático. Las pruebas cubren interrupciones, recargas, concurrencia
entre pestañas y respuestas inválidas.

### 4. Simplicidad y código en inglés

Lo mínimo que resuelva el problema, con capacidades nativas del navegador y sin
dependencias nuevas sin motivo. Código, identificadores, comentarios y pruebas
en inglés; interfaz y documentación en español.

## Forma de trabajo

Cambios sustanciales: especificar, planificar, dividir en tareas y verificar con
`just test`, `just test-browser` y `nix flake check` antes de concluir. Commits
pequeños y firmados. Sin remoto, push ni PR salvo petición del titular.

**Versión**: 1.0.0 | **Creada**: 2026-11-02 | **Última actualización**: 2026-11-02
