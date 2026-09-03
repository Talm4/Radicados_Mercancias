// ==========================================================================
// TALMA DATA CENTER — Documentos por colaborador
// Integración real con el backend existente (Firebase):
//   · Binarios    → Firebase Storage (bucket del proyecto talma-datacenter)
//   · Metadatos   → colección Firestore "documentos"
// Esquema de metadatos:
//   { colaboradorId, nombre, tipo, size, path, uploader, fecha, mime }
// Si el proyecto aún no tiene Storage habilitado o las reglas lo bloquean,
// el error se muestra explícitamente (nada se simula como exitoso).
// ==========================================================================
import { app, db } from "./firebase-config.js";
import {
  getStorage, ref, uploadBytes, getDownloadURL, deleteObject
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import {
  collection, query, where, onSnapshot, addDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const storage = getStorage(app);
const docsColRef = collection(db, "documentos");

const UPLOAD_KEY = "tdc-uploader-name";
let unsubscribeDocs = null;
let currentList = [];

// El nombre del usuario que carga: se pregunta una vez y se guarda en este
// navegador, yendo sincero sobre la fuente con un marcador "(sin autenticar)".
export function obtenerUploader() {
  let nombre = localStorage.getItem(UPLOAD_KEY);
  if (!nombre) {
    nombre = (prompt("¿Con qué nombre quieres registrar los documentos que cargues?", "") || "").trim();
    if (nombre) localStorage.setItem(UPLOAD_KEY, nombre);
  }
  return nombre || "Sin nombre (sin autenticar)";
}

export function cancelUploader() { localStorage.removeItem(UPLOAD_KEY); }

/* ------------------- Listado en tiempo real por colaborador ------------------- */
export function suscribirDocumentos(colaboradorId, onChange) {
  if (unsubscribeDocs) unsubscribeDocs();
  const q = query(docsColRef, where("colaboradorId", "==", colaboradorId));
  unsubscribeDocs = onSnapshot(q, (snapshot) => {
    currentList = snapshot.docs.map(d => ({ _docId: d.id, ...d.data() }));
    currentList.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || ""));
    onChange(currentList);
  }, (err) => {
    console.error("[DOCUMENTOS] Error al suscribir documentos:", err);
    onChange([], err);
  });
  return () => { if (unsubscribeDocs) { unsubscribeDocs(); unsubscribeDocs = null; } };
}

/* ------------------- Carga de documento ------------------- */
export async function subirDocumento(colaboradorId, nombrePersona, file) {
  const ts = Date.now();
  const path = `documentos/${colaboradorId}/${ts}_${file.name}`;
  const storageRef = ref(storage, path);

  await uploadBytes(storageRef, file);
  const url = await getDownloadURL(storageRef);

  const meta = {
    colaboradorId,
    colaboradorNombre: nombrePersona || "",
    nombre: file.name,
    tipo: file.type || "desconocido",
    size: file.size,
    path,
    url,
    uploader: obtenerUploader(),
    fecha: new Date().toISOString(),
  };
  const docRef = await addDoc(docsColRef, meta);
  return { _docId: docRef.id, ...meta };
}

/* ------------------- Descarga (URL firmada ya guardada) ------------------- */
export async function obtenerUrlDescarga(docReg) {
  if (docReg.url) return docReg.url;
  return await getDownloadURL(ref(storage, docReg.path));
}

/* ------------------- Eliminación ------------------- */
export async function eliminarDocumento(docReg) {
  try {
    if (docReg.path) await deleteObject(ref(storage, docReg.path));
  } catch (err) {
    console.warn("[DOCUMENTOS] El binario no se pudo eliminar (se borra solo la referencia):", err);
  }
  await deleteDoc(doc(db, "documentos", docReg._docId));
}
