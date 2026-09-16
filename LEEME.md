# Talma Mercancías Dashboard V2

Aplicación estática para GitHub Pages conectada con Firebase. No requiere `127.0.0.1`, PowerShell, un computador encendido ni un servidor local.

## Actualización manual de datos y notas

El botón **Actualizar** inicia dos acciones:

1. refresca la conexión en tiempo real con Firebase;
2. abre el workflow manual del repositorio para actualizar las notas.

El workflow `.github/workflows/actualizar-notas-manual.yml` solo contiene `workflow_dispatch`: no tiene `schedule`, cron ni ejecución horaria. En GitHub pulsa **Run workflow**. El runner descarga el Excel en una carpeta temporal, valida su estructura, hace el cruce y actualiza Firestore. El reporte no se guarda ni se publica en el repositorio porque contiene datos personales.

## Configuración única

En **Settings → Secrets and variables → Actions** crea `FIREBASE_SERVICE_ACCOUNT_B64` con el JSON Base64 de una cuenta de servicio del proyecto `talma-datacenter`. La credencial no debe agregarse a ningún archivo del repositorio.

Como alternativa, el asistente conserva el procesamiento local. Al seleccionar el Excel, la validación comienza automáticamente. Este lector procesa el XML progresivamente porque la hoja real no incluye `<dimension>` y se expande a más de 700 MB.

Solo se conservan los registros de:

- Mercancías Peligrosas Básico 8 Horas · Inicial 2026V2;
- Mercancías Peligrosas Básico 4 Horas · Recurrente 2026V2.

El cruce usa cédula normalizada, familia de curso y compatibilidad del nombre. Cuando una persona tiene varios registros del mismo tipo se actualiza el más reciente cuyo nombre coincida. El historial no se elimina. Las escrituras por lotes modifican exclusivamente `NOTA` y la redondean sin decimales.

## Cursos estandarizados

La aplicación presenta y agrupa todos los derivados como:

- `Básico Inicial`;
- `Básico Repaso`.

Se ignoran diferencias de tildes, mayúsculas y las variantes Repaso, Recurrente o Recurrencia. La normalización se aplica a datos históricos en memoria y a todo registro creado, editado o importado.

## Vistas operativas

- **Resumen:** asistencia general, inasistencias y comparación rápida por base.
- **Registros:** tabla maestra paginada, filtros, CRUD, importación y exportación.
- **Personas:** agenda de colaboradores con curso hoy y directorio histórico.
- **Cursos:** comparación de Inicial y Repaso por personas, grupos, bases y asistencia.
- **Grupos:** agenda separada en Hoy, Próximos e Historial.

## Seguridad

- La cuenta de servicio se recibe únicamente mediante el Secret `FIREBASE_SERVICE_ACCOUNT_B64`.
- El reporte solo existe temporalmente en el runner y se elimina automáticamente.
- La alternativa local permanece disponible y no sube el Excel a ningún servidor adicional.
- Si la lectura o el cruce falla, no se inicia ninguna escritura de notas.

## Validación

```bash
node test-logica.mjs
node test-v2.mjs
```

Para publicar, sube el contenido de esta carpeta a la rama configurada para GitHub Pages.
