# Cambios V2

## Registros e importación

- La importación ya no presupone que la primera hoja contiene los datos. Revisa las hojas y sus primeras filas hasta encontrar los encabezados operativos.
- Se agregó compatibilidad directa con el formato del Consolidado de Radicación MP, incluidas columnas desordenadas y columnas auxiliares.
- La exportación genera `Hoja1` con las 26 columnas del consolidado y conserva los filtros visibles.
- Una cédula puede aparecer en varias citaciones. La identificación usa persona, curso, fecha, grupo, hora y salón para conservar el historial.
- La tabla admite edición rápida en celdas, pegado de filas o columnas desde Excel, validación previa y guardado por lotes.

## Actualización de notas

- El botón **Actualizar notas** intenta obtener el reporte y empieza la revisión inmediatamente.
- Cuando el navegador impide leer la descarga, se abre el archivo y queda disponible la selección manual como respaldo.
- El procesamiento se realiza fuera del hilo de interfaz para que la pantalla siga respondiendo con archivos grandes.
- El cruce valida cédula, nombre y tipo de curso, elige el registro compatible más reciente y redondea la nota sin decimales.
- Solo se modifica la nota del registro confirmado; no se eliminan citaciones anteriores.

## Rendimiento

- Un store central normaliza e indexa los datos una sola vez.
- Los filtros reutilizan resultados y agregaciones en lugar de recalcular cada componente.
- Las tablas están paginadas y las cargas grandes se guardan en bloques recuperables.
- Los reportes extensos se leen progresivamente en un Web Worker.

## Interfaz

- Resumen enfocado en asistencia y comparación por base.
- Personas muestra primero la programación del día y luego el historial individual.
- Cursos presenta cada tipo de capacitación; Grupos funciona como agenda operativa.
- Los nombres de curso se presentan como `Básico Inicial` y `Básico Repaso` sin duplicados por tildes o mayúsculas.
- La certificación exige asistencia afirmativa y nota superior a 80.
- La vista del certificado es de solo lectura: ya no intenta reservar ni escribir el código antes de mostrarlo. Esto evita que una cuota de escritura impida visualizarlo.
- La categoría del certificado se asigna automáticamente por cargo. Los cargos definidos para categoría 9 generan `Cat. 9`; `AGENTE OPERACIONES TERRESTRES`, `COORDINADOR PRM Y PUENTES DE ABORDAJE` y cualquier cargo fuera de esa lista generan `Cat. 8`.
- La numeración conserva el prefijo `CI-`, respeta los códigos históricos importados, detecta el seriado más alto y asigna los siguientes desde `CI-15161` por antigüedad de la capacitación. La exportación incluye `N° CERTIFICADO` para facilitar la migración progresiva.
- La página del PDF se dibuja dentro de la plataforma, conservando exactamente la plantilla, tipografía y negrillas del archivo generado.
