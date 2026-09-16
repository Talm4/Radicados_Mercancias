# Cambios V2

## Actualización manual desde el repositorio

- Se eliminó la programación horaria. El workflow solo se ejecuta con `workflow_dispatch` cuando el usuario pulsa **Run workflow**.
- El botón manual **Actualizar** refresca Firebase y abre la actualización segura del repositorio.
- El runner descarga, valida y procesa el Excel de inmediato, sin depender del computador del usuario.
- El XLSX no se confirma dentro del repositorio: contiene datos personales y su XML supera 700 MB descomprimido.
- La credencial de Firebase solo se recibe desde el Secret `FIREBASE_SERVICE_ACCOUNT_B64`.
- La alternativa local se mantiene para contingencias y procesa el archivo automáticamente al seleccionarlo.

## Procesamiento y seguridad de notas

- `assets/js/notas-worker.js` descomprime y lee el Excel por bloques fuera del hilo de interfaz. Ya admite hojas sin `<dimension>` y filtra únicamente los dos cursos autorizados.
- `assets/js/notas-core.js` centraliza el cruce por cédula, tipo de curso y nombre compatible.
- Se elige el registro histórico más reciente compatible sin usar la cédula como documento único.
- Las notas se validan entre 0 y 100 y se redondean sin decimales.
- Cada lote de Firebase usa `update` y contiene solo `NOTA`; no crea documentos ni cambia otros campos.
- El asistente informa filas leídas, coincidencias, notas actualizadas, notas ya correctas, omisiones y conflictos de identidad.
- Un resumen de la última ejecución se guarda solo en el navegador, sin datos personales.
- La prueba con el reporte adjunto leyó 551.914 filas, encontró 4.162 filas de los cursos objetivo y produjo 3.448 combinaciones únicas; 714 filas objetivo tenían nota ausente o inválida.

## Estandarización de cursos

- Las variaciones por tildes, mayúsculas o texto adicional se agrupan en `Básico Inicial` y `Básico Repaso`.
- `Repaso`, `Recurrente` y `Recurrencia` pertenecen a la misma familia.
- La normalización se aplica al cargar Firestore y al crear, editar o importar registros.
- Los filtros, perfiles, agrupaciones y certificados consumen los nombres canónicos, por lo que ya no aparecen opciones duplicadas.

## Vistas con funciones distintas

- **Resumen:** se añadió un tablero de asistencia por base; cada base abre Registros con el filtro aplicado.
- **Personas:** muestra primero quién tiene curso hoy, hora, base, grupo y estado de asistencia; debajo conserva el directorio paginado.
- **Cursos:** compara los tipos estandarizados y muestra personas, grupos, bases, ausencias y última actividad.
- **Grupos:** funciona como agenda operativa con secciones Hoy, Próximos e Historial, incluyendo fecha, hora, salón e instructor.

## Rendimiento

- Se conserva un único listener de Firestore, el store normalizado, índices por dimensión y caché de filtros.
- El tablero por base reutiliza las agregaciones existentes; no vuelve a recorrer la base para cada tarjeta.
- El reporte se reduce en un Web Worker a una entrada por cédula y tipo de curso antes del cruce.
- Las tablas principales permanecen paginadas y las agendas limitan el historial visible.
- Las escrituras se ejecutan en lotes de máximo 450 operaciones.

## Funciones conservadas

- Firebase y colección `capacitaciones`.
- CRUD, edición masiva, filtros, búsqueda, importación y exportación.
- Historial con varias citaciones para una misma cédula.
- Perfiles laterales de personas, cursos y grupos.
- Certificados personalizados y regla de elegibilidad: asistencia afirmativa y nota superior a 80.
- Logo de Power Apps únicamente en la pestaña del navegador y logo real de Talma en la aplicación.
