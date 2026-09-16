import { db } from "./firebase-config.js";
import { doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { store } from "./store.js";
import { normalizarNumeroCertificado, PRIMER_SERIADO_CERTIFICADO, secuenciaCertificado } from "./certificados-core.js?v=14";

const FIRST_SEQUENCE = PRIMER_SERIADO_CERTIFICADO;
const COUNTER_REF = doc(db, "configuracion", "certificados");

function personKey(rec) {
  const raw = String(rec?._personKey || rec?.ID || rec?._docId || "").trim();
  if (!raw) throw new Error("El colaborador no tiene una identificación válida para asignar el certificado.");
  return encodeURIComponent(raw);
}

function personRecords(rec) {
  const key = rec?._personKey || rec?.ID;
  const records = key ? store.getPerson(key) : [];
  return records.length ? records : [rec];
}

export function numeroCertificadoExistente(rec) {
  const numbers = [...new Set(personRecords(rec).map(item => normalizarNumeroCertificado(item.CERT_NUMERO)).filter(Boolean))];
  if (numbers.length > 1) {
    throw new Error(`El colaborador tiene más de un código asignado (${numbers.join(", ")}). Corrige la migración antes de generar el certificado.`);
  }
  return numbers[0] || "";
}

function assertLocalOwnership(number, ownerKey) {
  const conflict = store.data.find(item => {
    const itemNumber = normalizarNumeroCertificado(item.CERT_NUMERO);
    return itemNumber === number && personKey(item) !== ownerKey;
  });
  if (conflict) {
    throw new Error(`${number} ya está asignado a ${conflict.NOMBRES || conflict.ID || "otro colaborador"}. Corrige el dato migrado antes de continuar.`);
  }
}

function maxExistingSequence() {
  return store.data.reduce((maximum, item) => {
    const sequence = secuenciaCertificado(item.CERT_NUMERO);
    return sequence === null ? maximum : Math.max(maximum, sequence);
  }, FIRST_SEQUENCE - 1);
}

function numberRef(number) {
  return doc(db, "certificadosCodigos", number);
}

function counterValue(snapshot) {
  const value = Number(snapshot.data()?.ultimoNumero);
  return Number.isSafeInteger(value) && value >= 0 ? value : FIRST_SEQUENCE - 1;
}

function personRef(ownerKey) {
  return doc(db, "certificadosPersonas", ownerKey);
}

function syncLocalPerson(rec, number) {
  personRecords(rec).forEach(item => { item.CERT_NUMERO = number; });
}

export async function asegurarNumeroCertificado(rec) {
  const ownerKey = personKey(rec);
  const migratedNumber = numeroCertificadoExistente(rec);
  if (migratedNumber) assertLocalOwnership(migratedNumber, ownerKey);
  const localMaximum = maxExistingSequence();
  const recordRef = doc(db, "capacitaciones", rec._docId);

  const number = await runTransaction(db, async transaction => {
    const ownerRef = personRef(ownerKey);
    const ownerSnapshot = await transaction.get(ownerRef);
    if (ownerSnapshot.exists()) {
      const assigned = normalizarNumeroCertificado(ownerSnapshot.data().numero);
      if (!assigned) throw new Error("La numeración guardada para este colaborador no es válida.");
      if (migratedNumber && migratedNumber !== assigned) {
        throw new Error(`El dato migrado ${migratedNumber} no coincide con el código reservado ${assigned}.`);
      }
      const reservationRef = numberRef(assigned);
      const reservationSnapshot = await transaction.get(reservationRef);
      const counterSnapshot = await transaction.get(COUNTER_REF);
      if (reservationSnapshot.exists() && reservationSnapshot.data().propietario !== ownerKey) {
        throw new Error(`${assigned} ya pertenece a otro colaborador.`);
      }
      const storedCounter = counterValue(counterSnapshot);
      const assignedSequence = secuenciaCertificado(assigned) || 0;
      transaction.set(reservationRef, { numero: assigned, propietario: ownerKey, actualizado: serverTimestamp() }, { merge: true });
      transaction.set(COUNTER_REF, { ultimoNumero: Math.max(storedCounter, localMaximum, assignedSequence), actualizado: serverTimestamp() }, { merge: true });
      transaction.set(recordRef, { CERT_NUMERO: assigned, CERT_ACTUALIZADO: new Date().toISOString() }, { merge: true });
      return assigned;
    }

    const counterSnapshot = await transaction.get(COUNTER_REF);
    const storedCounter = counterValue(counterSnapshot);
    let assigned = migratedNumber;
    let assignedSequence = secuenciaCertificado(assigned);
    let reservationRef;

    if (assigned) {
      reservationRef = numberRef(assigned);
      const reservationSnapshot = await transaction.get(reservationRef);
      if (reservationSnapshot.exists() && reservationSnapshot.data().propietario !== ownerKey) {
        throw new Error(`${assigned} ya pertenece a otro colaborador.`);
      }
    } else {
      assignedSequence = Math.max(storedCounter, localMaximum, FIRST_SEQUENCE - 1) + 1;
      for (let attempt = 0; attempt < 25; attempt++, assignedSequence++) {
        assigned = `CI-${String(assignedSequence).padStart(5, "0")}`;
        reservationRef = numberRef(assigned);
        const reservationSnapshot = await transaction.get(reservationRef);
        if (!reservationSnapshot.exists()) break;
        assigned = "";
      }
      if (!assigned || !reservationRef) throw new Error("No fue posible encontrar un código de certificado disponible.");
    }

    transaction.set(ownerRef, {
      numero: assigned,
      colaboradorId: String(rec.ID || ""),
      colaboradorNombre: String(rec.NOMBRES || ""),
      origen: migratedNumber ? "migracion" : "automatico",
      actualizado: serverTimestamp(),
    });
    transaction.set(reservationRef, { numero: assigned, propietario: ownerKey, actualizado: serverTimestamp() });
    transaction.set(COUNTER_REF, { ultimoNumero: Math.max(storedCounter, localMaximum, assignedSequence || 0), actualizado: serverTimestamp() }, { merge: true });
    transaction.set(recordRef, { CERT_NUMERO: assigned, CERT_ACTUALIZADO: new Date().toISOString() }, { merge: true });
    return assigned;
  });

  syncLocalPerson(rec, number);
  return number;
}
