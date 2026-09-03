// ==========================================================================
// TALMA DATA CENTER — Configuración de Firebase (compartida)
// Mismas credenciales y colección que la versión original para no perder
// la sincronización con los datos ya cargados en producción.
// ==========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore, collection } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyD4KlXPtSo-V4LqaBqc1HlRY3-KvK9RJDo",
  authDomain: "talma-datacenter.firebaseapp.com",
  projectId: "talma-datacenter",
  storageBucket: "talma-datacenter.firebasestorage.app",
  messagingSenderId: "360747458685",
  appId: "1:360747458685:web:cafe9828c85ed55f8e1114",
  measurementId: "G-5ZH6XH59SR"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const colRef = collection(db, "capacitaciones");

// Nombre oficial de las columnas tal como se guardan en Firestore.
// (Se conserva EXACTO respecto a la versión anterior por compatibilidad.)
export const CAMPOS = [
  "ID", "NOMBRES", "PROGRAMA", "CURSO", "FECHA", "INTENSIDAD", "BASE",
  "HORA", "SALON", "GRUPO", "CARGO", "CORREO", "INSTRUCTOR", "ASISTIO",
  "NOTA", "OBSERVACION"
];
