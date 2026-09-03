import { app, db } from "./firebase-config.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";
import { collection, addDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const storage = getStorage(app);
const certificatesCollection = collection(db, "documentos");

export async function subirCertificado(colaboradorId, nombrePersona, file) {
  const timestamp = Date.now();
  const path = `certificados/${colaboradorId}/${timestamp}_${file.name}`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, file, { contentType: "application/pdf" });
  const url = await getDownloadURL(storageRef);
  const metadata = {
    colaboradorId,
    colaboradorNombre: nombrePersona || "",
    nombre: file.name,
    tipo: "application/pdf",
    size: file.size,
    path,
    url,
    categoria: "certificado",
    uploader: "Plataforma Talma",
    fecha: new Date().toISOString(),
  };
  const reference = await addDoc(certificatesCollection, metadata);
  return { _docId: reference.id, ...metadata };
}
