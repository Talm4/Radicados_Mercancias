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
- El logo de Power Apps aparece únicamente como favicon en la pestaña del navegador. Se retiró de la navegación y de todos los botones.
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

## Numeración única y migración

- Cada colaborador conserva un único código `CI-#####`; el PDF lo imprime como `N°: CI-#####`.
- Los códigos existentes en `CERT_NUMERO` se consideran migrados y se conservan sin reemplazarlos.
- La importación reconoce las columnas `CERT_NUMERO`, `Número de certificado`, `N° Certificado` y `Código de certificado`, aunque estén en otro orden.
- Una importación no puede reemplazar el código que ya tenga una cédula ni asignar el mismo código a dos personas.
- Los códigos nuevos comienzan en `CI-15161` o continúan después del mayor número existente.
- La asignación usa una transacción de Firestore, un contador global y una reserva por código para evitar colisiones entre usuarios concurrentes.
- Firestore guarda la relación en `certificadosPersonas`, la reserva en `certificadosCodigos` y el contador en `configuracion/certificados`.
- El código también queda guardado como `CERT_NUMERO` en el registro de capacitación que generó el certificado.

## Instructor y elegibilidad

- Álvaro López: licencia IET `94314461`, tratamiento `el Instructor`.
- Juan Arias: licencia IET `80022447`, tratamiento `el Instructor`.
- Adriana Vanegas: licencia IET `31172210`, tratamiento `la Instructora`.
- La coincidencia de nombres ignora mayúsculas, tildes y espacios adicionales.
- Para estos instructores, licencia y tratamiento son automáticos y no se pueden alterar desde el formulario del certificado.
- El certificado solo está disponible cuando `ASISTIO` es afirmativo y la nota numérica es estrictamente superior a 80.
- La restricción se valida en el perfil, el editor, el visor, la descarga, la generación del PDF y la subida a Firebase Storage.

## Notas verificadas desde Aprende Talma

- El logotipo suministrado de Microsoft Power Apps se usa exclusivamente como icono de la pestaña del navegador.
- Se inspeccionó el reporte real `reporteglobal.xlsx`: contiene 549.796 registros y las columnas `cedula`, `curso`, `nota`, `nombre completo` y `fecha de finalizacion del curso`.
- El servidor de Aprende Talma no publica `Access-Control-Allow-Origin`; una página estática no puede descargar el Excel directamente sin infringir CORS.
- `servidor.py` descarga directamente el reporte al iniciar y cada 60 minutos. No depende de GitHub Actions, Firebase Functions, Cloud Scheduler ni plan Blaze.
- El Excel se almacena en `.cache/reporteglobal.xlsx`. El servidor impide descargar esa ruta desde el navegador y Git no incluye la carpeta.
- El flujo usa OAuth con una credencial local excluida del repositorio. Sin credencial puede descargar y validar, pero no escribir en Firestore.
- El proceso conserva exclusivamente los cursos LMS Inicial de 8 horas y Recurrente de 4 horas indicados por el usuario.
- La verificación inicial encontró 3.420 combinaciones únicas de persona y curso: 2.755 iniciales y 665 recurrentes.
- La comparación usa cédula y familia de curso. Ignora tildes, mayúsculas, signos y espacios adicionales.
- Para no alterar el historial, cuando una persona tiene varias recurrencias solo se propone actualizar el registro más reciente de cada familia.
- La nota se redondea al entero más cercano. Valores vacíos, no numéricos, inferiores a 0 o superiores a 100 se omiten.
- El sincronizador compara el reporte con la base y distingue notas cargadas, notas digitadas corregidas y notas ya correctas.
- La escritura usa lotes de 400 y añade `NOTA_ORIGEN`, `NOTA_FECHA_REPORTE` y `NOTA_VERIFICADA_EN` para trazabilidad. La tabla identifica visualmente cada nota verificada.
- Además de la cédula y la familia de curso, se comprueba la compatibilidad del nombre. Las discrepancias importantes quedan bloqueadas como conflictos de identidad.
- El código procesa el Excel por streaming y escribe en lotes de hasta 400 operaciones, sin cargar las 549.796 filas completas en memoria.
- El estado se guarda localmente y, cuando existe credencial, también en `sincronizaciones/notasAprende`.

### Auditoría real de la base existente

- Registros de capacitación comparables en Firebase: 4.215.
- Coincidencias válidas con el reporte: 3.407.
- Notas ausentes que pueden cargarse: 1.405.
- Notas digitadas que no coinciden y deben corregirse: 165.
- Notas que ya son correctas: 1.837.
- Registros sin coincidencia en esos cursos: 802.
- Coincidencias bloqueadas por diferencia relevante de nombre: 6.
- La auditoría fue de solo lectura; estas correcciones se aplican al ejecutar el servidor o `SINCRONIZAR-NOTAS.ps1` con la credencial local.

## Citaciones repetidas e historial

- La cédula dejó de ser una clave única de asistencia.
- Solo se actualiza una fila cuando coinciden cédula, curso, fecha, grupo, hora y salón.
- Una fecha distinta siempre crea un registro nuevo, aunque la persona y el curso ya existan.
- Se eliminó la reducción que conservaba una sola fila por persona y curso durante la importación.
- El identificador determinista conserva todas las fechas sin duplicar una misma citación exacta al reintentar una carga.

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

### Importación masiva reforzada

- La vista previa dejó de insertar todas las filas del Excel en el DOM: ahora crea una sola página de 25, 50 o 100 filas por pestaña.
- Las categorías Nuevos, Actualizarán, Sin cambios y Errores se calculan una vez y se reutilizan al cambiar de pestaña o página.
- La validación de archivos grandes cede el control al navegador cada 250–500 filas para mantener la interfaz receptiva.
- Firebase conserva lotes de 450 operaciones, por debajo del máximo de 500 de Firestore, y muestra el avance lote por lote.
- Antes de escribir se guarda un trabajo recuperable en IndexedDB. Después de cada lote confirmado se actualiza su punto de avance.
- Si la red o Firebase fallan, la aplicación informa cuántos registros ya se guardaron y cuántos siguen pendientes; ya no afirma incorrectamente que no hubo cambios parciales.
- Una carga interrumpida se detecta al volver a abrir la aplicación y ofrece **Reanudar** o **Descartar**.
- Los documentos nuevos usan un identificador estable derivado de cédula, curso, fecha, grupo, hora y salón, de modo que repetir un lote incierto no duplica la misma citación.
- Se añadió un límite preventivo de 25 MB por archivo para evitar agotar la memoria del navegador.
- La suite incluye una prueba específica de 5.207 filas: confirma 12 lotes y páginas de vista previa de máximo 50 filas.

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
- La prueba final con 12.000 registros quedó dentro de los umbrales definidos para indexación, filtro y agregación.
- Restricción de certificados probada para `ASISTIO = NO` y `ASISTIO = SÍ`.
- Respuesta HTTP 200 verificada al servir `index.html` desde un servidor estático.
