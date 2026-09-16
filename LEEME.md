# Talma Mercancías Dashboard V2

Aplicación para administrar asistencia, registros, calificaciones y certificados del curso de Mercancías Peligrosas.

## Uso principal

- **Actualizar:** vuelve a cargar los datos de la plataforma.
- **Actualizar notas:** intenta descargar y validar el reporte de calificaciones inmediatamente. Si el sitio de origen no permite la lectura automática, descarga el archivo y muestra el selector para continuar con un clic.
- **Editar tabla:** permite escribir directamente en las celdas, pegar bloques copiados desde Excel y guardar los cambios en lotes.
- **Importar:** admite Excel o CSV y encuentra automáticamente la hoja que contiene `ID` y `NOMBRES Y APELLIDOS`, aunque no sea la primera.
- **Exportar:** genera un Excel con el formato del Consolidado de Radicación MP.

## Formato de importación y exportación

La hoja de datos puede contener estas columnas en cualquier orden:

`AÑO`, `MES`, `PROGRAMA DE ENTRENAMIENTO`, `CURSO`, `INTENSIDAD`, `BASE`, `FECHA`, `HORA`, `SALÓN`, `GRUPO`, `ID`, `NOMBRES Y APELLIDOS`, `CARGO`, `CORREO`, `INSTRUCTOR`, `ASISTIÓ`, `NOTA`, `OBSERVACIÓN`, `RADICADO`, `BASE CURSO`, `INCIAL`, `VMP I`, `RECURRENTE`, `VMP R`, `ME`, `OB`.

Las columnas auxiliares pueden estar presentes y no impiden la carga. Para identificar una fila se conserva la citación completa; una misma cédula puede tener varios días o varios registros históricos.

## Calificaciones

La actualización cruza cédula, nombre compatible y tipo de curso. Si hay varios registros de la misma persona y tipo, se toma el más reciente que corresponda. Las notas se redondean sin decimales y solo se cambia el registro validado.

## Validación técnica

```bash
node test-logica.mjs
node test-v2.mjs
```
