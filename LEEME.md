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

El perfil permite ver, configurar, descargar o guardar en Firebase el certificado cuando la persona asistió y obtuvo una nota superior a 80. Con inasistencia, nota igual o inferior a 80, o una nota no válida, queda bloqueado en la interfaz y en la lógica de generación.

El código se asigna una sola vez por colaborador mediante una transacción de Firestore. Los valores existentes en `CERT_NUMERO` se conservan durante la migración; quienes todavía no tengan código reciben automáticamente el siguiente `CI-#####` disponible. El PDF añade el prefijo visual `N°:`.

Las licencias IET se completan automáticamente para Álvaro López (`94314461`), Juan Arias (`80022447`) y Adriana Vanegas (`31172210`).

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

## Importaciones de más de 5.000 filas

La vista previa está paginada y Firebase recibe lotes de 450 operaciones con avance visible. El navegador guarda un punto de recuperación después de cada lote; si se corta la conexión o se cierra la página, al regresar aparecerá la opción **Reanudar**. Los lotes repetidos son idempotentes y no crean copias del mismo registro.

Se admiten archivos Excel o CSV de hasta 25 MB. Conviene mantener una fila de encabezados reconocible y las columnas ID/Cédula y Nombres; las columnas adicionales se ignoran.

## Pruebas

```bash
node test-logica.mjs
node test-v2.mjs
```

Consulta `CAMBIOS-V2.md` para ver el detalle técnico y las mediciones de rendimiento.
