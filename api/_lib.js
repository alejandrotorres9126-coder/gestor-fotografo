// Funciones compartidas del servidor (los archivos que empiezan con "_" no son rutas públicas)
import { initializeApp, cert, getApps } from "firebase-admin/app";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getFirestore } from "firebase-admin/firestore";
import { getMessaging } from "firebase-admin/messaging";

export const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "alejandrotorres91.26@gmail.com").toLowerCase();
export const APP_URL = process.env.APP_URL || "https://gestor-fotografo.vercel.app/";
export const TZ = "America/Argentina/Buenos_Aires";

// Lee la clave de servicio aunque tenga texto de más (espacios, comillas, una copia repetida, etc.)
export function credenciales() {
  let raw = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").trim();
  if (!raw) throw new Error("Falta la variable FIREBASE_SERVICE_ACCOUNT en Vercel");
  if (/^["']/.test(raw)) { try { const x = JSON.parse(raw); if (typeof x === "string") raw = x.trim(); } catch (e) { raw = raw.slice(1, -1); } }
  const i = raw.indexOf("{"); if (i < 0) throw new Error("La variable FIREBASE_SERVICE_ACCOUNT no tiene el formato correcto");
  let prof = 0, enTexto = false, esc = false;
  for (let j = i; j < raw.length; j++) {
    const c = raw[j];
    if (enTexto) { if (esc) esc = false; else if (c === "\\") esc = true; else if (c === '"') enTexto = false; continue; }
    if (c === '"') enTexto = true; else if (c === "{") prof++; else if (c === "}") { prof--; if (prof === 0) return JSON.parse(raw.slice(i, j + 1)); }
  }
  throw new Error("La variable FIREBASE_SERVICE_ACCOUNT está incompleta");
}

function app() {
  if (getApps().length) return getApps()[0];
  return initializeApp({ credential: cert(credenciales()) });
}
export const db = () => getFirestore(app());
// Verificación del login de Firebase sin firebase-admin/auth (evita el error ERR_REQUIRE_ESM en Vercel)
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));
const PROYECTO = () => { try { return credenciales().project_id; } catch (e) { return "gestor-fotografo"; } };
async function verificarToken(token) {
  const p = PROYECTO();
  const { payload } = await jwtVerify(token, JWKS, { issuer: `https://securetoken.google.com/${p}`, audience: p });
  return { uid: payload.sub, email: payload.email || "" };
}
export const fcm = () => getMessaging(app());

// Verifica el login de la app y devuelve { uid, email, rol }
export async function usuario(req) {
  const h = req.headers.authorization || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (!token) return null;
  try {
    const d = await verificarToken(token);
    const email = (d.email || "").toLowerCase();
    if (email === ADMIN_EMAIL) return { uid: d.uid, email, rol: "admin" };
    const m = await db().doc(`miembros/${d.uid}`).get();
    if (m.exists && m.data().activo === true) return { uid: d.uid, email, rol: m.data().rol || "secretario" };
  } catch (e) {}
  return null;
}

// Fecha "AAAA-MM-DD" en hora de Argentina, desplazada n días
export function fechaAR(n = 0) {
  const d = new Date(Date.now() + n * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
export function diaSemanaAR() {
  return new Intl.DateTimeFormat("es-AR", { timeZone: TZ, weekday: "long" }).format(new Date());
}

// Envía una notificación a todos los dispositivos de una lista de miembros y limpia tokens vencidos
export async function enviar(miembros, title, body) {
  let enviados = 0;
  for (const m of miembros) {
    const tokens = (m.tokens || []).filter(Boolean);
    if (!tokens.length) continue;
    const r = await fcm().sendEachForMulticast({
      tokens,
      notification: { title, body },
      webpush: { fcmOptions: { link: APP_URL }, notification: { icon: APP_URL + "icon-192.png", badge: APP_URL + "favicon.png" } }
    });
    enviados += r.successCount;
    const malos = tokens.filter((t, i) => {
      const c = r.responses[i].error?.code || "";
      return c.includes("registration-token-not-registered") || c.includes("invalid-registration-token") || c.includes("invalid-argument");
    });
    if (malos.length) await db().doc(`miembros/${m.id}`).update({ tokens: tokens.filter(t => !malos.includes(t)) });
  }
  return enviados;
}
