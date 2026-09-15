# Talma · Control de asistencia

Aplicación web para validar la asistencia al curso de Radicación de Mercancías Peligrosas. Mantiene Firebase, CRUD, importación/exportación, filtros, perfiles y certificados.

## Uso

En Windows ejecuta:

```powershell
.\INICIAR-PLATAFORMA.ps1
```

Luego abre `http://127.0.0.1:4173/index.html`. Este servidor forma parte del proyecto y mantiene activa la descarga horaria. Un servidor estático común muestra la interfaz, pero no puede ejecutar la descarga automática.

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

Servidor local
  → descarga privada de reporteglobal.xlsx cada 60 minutos
  → lectura en streaming
  → cruce por cédula y familia de curso
  → actualización por lotes en Firestore
```

## Importaciones de más de 5.000 filas

La vista previa está paginada y Firebase recibe lotes de 450 operaciones con avance visible. El navegador guarda un punto de recuperación después de cada lote; si se corta la conexión o se cierra la página, al regresar aparecerá la opción **Reanudar**. Los lotes repetidos son idempotentes y no crean copias del mismo registro.

Se admiten archivos Excel o CSV de hasta 25 MB. Conviene mantener una fila de encabezados reconocible y las columnas ID/Cédula y Nombres; las columnas adicionales se ignoran.

La cédula no se considera un registro único. Una persona puede aparecer varias veces en el mismo curso. Solo se actualiza una fila existente cuando coinciden cédula, curso, fecha, grupo, hora y salón; cualquier citación diferente se crea como otro registro y permanece visible en el historial.

## Revisión automática de notas

La automatización compara Firebase con el reporte de Aprende Talma. La coincidencia usa la cédula y el tipo de curso, sin distinguir tildes ni mayúsculas:

- `Básico inicial` y sus variaciones usan el curso LMS de 8 horas, Inicial 2026V2.
- `Básico repaso`, `Básico recurrente` y sus variaciones usan el curso LMS de 4 horas, Recurrente 2026V2.

El proceso toma el registro más reciente por persona y tipo de curso, redondea la nota al entero más cercano y actualiza Firebase. Distingue notas vacías que fueron cargadas, notas digitadas que fueron corregidas y notas que ya coincidían. Los registros sin coincidencia permanecen intactos.

La coincidencia principal usa la cédula. Antes de escribir, también compara los componentes del nombre; una diferencia importante se informa como conflicto de identidad y bloquea esa actualización. Cada nota válida queda marcada con `NOTA_ORIGEN`, `NOTA_FECHA_REPORTE` y `NOTA_VERIFICADA_EN`; la tabla muestra un visto verde junto a las notas verificadas.

El archivo completo del LMS pesa aproximadamente 55 MB y el servidor de Aprende no permite descargarlo directamente desde JavaScript por CORS. `servidor.py` resuelve esto dentro del código de la aplicación: descarga el archivo al iniciar si no existe y vuelve a descargarlo cuando transcurren 60 minutos. La copia se guarda en `.cache/reporteglobal.xlsx`, fuera de los recursos públicos y excluida de Git.

Para escribir las notas en Firestore, guarda localmente la credencial como `firebase-service-account.json` junto a `INICIAR-PLATAFORMA.ps1`. El servidor bloquea el acceso web a ese archivo y `.gitignore` evita que se suba al repositorio. Sin esa credencial, el sistema descarga, almacena y valida el Excel, pero no modifica Firebase.

El botón **Estado de notas** consulta el proceso local. **Descargar ahora** permite adelantar la siguiente revisión sin esperar una hora.

También se conserva una ejecución única independiente:

```powershell
.\SINCRONIZAR-NOTAS.ps1
```

La escritura usa la API REST de Firestore autenticada por OAuth. No usa GitHub Actions, Firebase Functions, Cloud Scheduler ni cambia el plan de Firebase.

La auditoría local de solo lectura se puede repetir sin modificar Firebase:

```bash
python scripts/actualizar_notas.py --source ../reporteglobal.xlsx --audit-public
```

## Pruebas

```bash
node test-logica.mjs
node test-v2.mjs
python test-notas.py
```

Consulta `CAMBIOS-V2.md` para ver el detalle técnico y las mediciones de rendimiento.
