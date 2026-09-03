# Talma · Control de asistencia

Aplicación web para validar la asistencia al curso de Radicación de Mercancías Peligrosas. Mantiene Firebase, CRUD, importación/exportación, filtros, perfiles y certificados.

## Uso

Sirve esta carpeta desde un servidor HTTP estático y abre `index.html`:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080/index.html`.

## Navegación

- **Resumen:** total de registros, personas que asistieron, personas que no asistieron y lista de inasistencias.
- **Registros:** tabla paginada con búsqueda, filtros, CRUD, acciones masivas e importación/exportación.
- **Personas:** asistencia consolidada y perfil lateral por colaborador.
- **Cursos:** personas, grupos y asistencia por curso.
- **Grupos:** participantes y asistencia por grupo.

## Certificados

El perfil permite ver, configurar, descargar o guardar en Firebase el certificado de una persona que asistió. Cuando `ASISTIO` es `NO`, el certificado queda bloqueado en la interfaz y en la lógica de generación.

El PDF conserva las fuentes Calibri y Calibri Bold incrustadas en `assets/pdf/PLANTILLA-CERTIFICADO.pdf`. Los campos personalizados se guardan en el registro de `capacitaciones`; los PDF enviados a la nube se almacenan en Firebase Storage.

## Arquitectura

```text
Firestore (un listener)
  → normalización
  → índices por dimensión
  → filtros cacheados
  → agregación de asistencia
  → tablero y tablas paginadas
```

## Pruebas

```bash
node test-logica.mjs
node test-v2.mjs
```

Consulta `CAMBIOS-V2.md` para ver el detalle técnico y las mediciones de rendimiento.
