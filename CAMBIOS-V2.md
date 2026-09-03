# Cambios V2

## Enfoque de la aplicación

La interfaz se simplificó para responder una sola pregunta operativa: **quién asistió y quién no asistió al curso de Radicación de Mercancías Peligrosas**.

- El Resumen muestra únicamente registros revisados, asistencias, inasistencias y porcentaje de asistencia.
- Se eliminan tendencias, rankings, hallazgos genéricos, promedios de nota, horas y otros indicadores que no ayudan a validar asistencia.
- La lista de inasistencias aparece directamente en el tablero y permite abrir el perfil del colaborador.
- El botón **Revisar quién no asistió** lleva a Registros con el filtro `NO` ya aplicado.
- La barra de filtros usa un texto natural y breve: `17 registros`.

## Diseño

- Nueva composición inspirada en Power Apps y Microsoft Fluent: barra de comandos, navegación clara, superficies rectangulares, jerarquía compacta y colores corporativos.
- Se incorporó el logotipo real de Talma como imagen local en `assets/img/talma-logo.png`.
- Se eliminó el indicador inferior **En línea**.
- Se retiró por completo la página Analítica y su código asociado.
- Se mantuvieron Resumen, Registros, Personas, Cursos y Grupos.

## Personas y certificados

- El perfil lateral solo muestra información personal, resumen de asistencia e historial.
- Se eliminaron Empresa, Estado de capacitación, vencimientos, estados de vigencia, promedio de nota y Documentos.
- Se eliminó la opción **Adjuntar documento**, su selector de archivos y su listener de Firebase.
- Si el registro tiene `ASISTIO = NO`, la fila muestra **No disponible** y no crea botones de certificado.
- La misma regla se valida nuevamente dentro de la lógica de configuración, visualización, descarga, generación y subida del PDF; no depende solo de ocultar el botón.
- Se conserva el visor integrado y la plantilla PDF con Calibri y Calibri Bold.
- Los certificados generados se pueden guardar en Firebase Storage bajo `certificados/{colaboradorId}/...`.
- Se eliminó del certificado el párrafo que indicaba la vigencia del curso.

## Rendimiento para más de 5.000 registros

### Problemas corregidos previamente

1. Firebase alimenta un único store mediante un solo `onSnapshot()`.
2. Los documentos se normalizan una sola vez y se indexan por persona, curso, grupo, base, instructor, salón y fecha.
3. Las combinaciones de filtros se reutilizan desde una caché LRU.
4. Registros y Personas usan paginación para no insertar miles de filas en el DOM.
5. Las agrupaciones de curso, grupo y persona se reutilizan desde el modelo central.

### Simplificaciones de esta versión

- Se eliminó Chart.js porque el tablero de asistencia ya no necesita gráficos complejos.
- Se eliminó `chart-manager.js` y toda reconstrucción o actualización de gráficos.
- El motor dejó de calcular promedios, distribuciones de notas, estados de vigencia, tendencias e insights en cada cambio de filtro.
- El tablero consume la agregación cacheada y renderiza como máximo 12 inasistencias; la lista completa se revisa en la tabla paginada.
- Se eliminó el listener adicional de documentos que se abría al consultar cada perfil.

## Funciones conservadas

- Firebase y la colección `capacitaciones`.
- Crear, editar y eliminar registros.
- Edición y eliminación masiva por lotes.
- Importación Excel/CSV con validación y UPSERT.
- Exportación del universo filtrado.
- Búsqueda y filtros por asistencia, curso, base, fecha, grupo, instructor, salón y calidad.
- Perfiles laterales de personas, cursos y grupos.
- Reglas de recurrencia usadas internamente durante la importación para evitar duplicados de negocio.

## Validación realizada

- Sintaxis comprobada en todos los módulos JavaScript.
- Suite de lógica de negocio original aprobada.
- Suite V2 aprobada con 12.000 registros sintéticos.
- En la ejecución final: modelo e índices en 398,3 ms; filtro indexado en 3,4 ms; agregación en 2,3 ms.
- Restricción de certificados probada para `ASISTIO = NO` y `ASISTIO = SÍ`.
- Respuesta HTTP 200 verificada al servir `index.html` desde un servidor estático.
