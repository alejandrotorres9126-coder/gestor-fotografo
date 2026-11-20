// Acceso a Google Drive con la cuenta de servicio (la misma clave de Firebase)
import { GoogleAuth } from "google-auth-library";
import crypto from "node:crypto";

let ga = null;
const creds = () => JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "{}");
export const SA_EMAIL = () => creds().client_email || "";

async function token() {
  if (!ga) ga = new GoogleAuth({ credentials: creds(), scopes: ["https://www.googleapis.com/auth/drive"] });
  return await ga.getAccessToken();
}

export async function drive(path, opts = {}) {
  const tk = await token();
  const sep = path.includes("?") ? "&" : "?";
  const r = await fetch(`https://www.googleapis.com/drive/v3/${path}${sep}supportsAllDrives=true`, {
    ...opts, headers: { Authorization: `Bearer ${tk}`, ...(opts.headers || {}) }
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    const e = new Error(j?.error?.message || `Drive ${r.status}`); e.status = r.status; throw e;
  }
  return r;
}

export async function descargarBytes(url) {
  const tk = await token();
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tk}` } });
  if (!r.ok) throw new Error(`Descarga ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

// Acepta el link completo de la carpeta o el ID solo
export function idCarpeta(u) {
  const s = String(u || "").trim();
  const m = s.match(/folders\/([A-Za-z0-9_-]{10,})/) || s.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || s.match(/^([A-Za-z0-9_-]{15,})$/);
  return m ? m[1] : null;
}

async function hijos(folderId) {
  const out = []; let pageToken = "";
  do {
    const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
    const f = encodeURIComponent("nextPageToken,files(id,name,mimeType,imageMediaMetadata(width,height,rotation))");
    const r = await drive(`files?q=${q}&fields=${f}&orderBy=name_natural&pageSize=1000&includeItemsFromAllDrives=true${pageToken ? "&pageToken=" + pageToken : ""}`);
    const j = await r.json(); out.push(...(j.files || [])); pageToken = j.nextPageToken || "";
  } while (pageToken);
  return out;
}
const foto = f => {
  const m = f.imageMediaMetadata || {}; const rot = m.rotation === 1 || m.rotation === 3;
  return { id: f.id, n: f.name, w: (rot ? m.height : m.width) || 3, h: (rot ? m.width : m.height) || 2 };
};

// Devuelve las secciones (fotos sueltas + una sección por subcarpeta)
export async function listar(folderId) {
  const items = await hijos(folderId);
  const esImg = f => (f.mimeType || "").startsWith("image/");
  const secciones = [];
  const sueltas = items.filter(esImg).map(foto);
  if (sueltas.length) secciones.push({ nombre: "Fotos", fotos: sueltas });
  const carpetas = [folderId];
  for (const sub of items.filter(f => f.mimeType === "application/vnd.google-apps.folder")) {
    carpetas.push(sub.id);
    const fs = (await hijos(sub.id)).filter(esImg).map(foto);
    if (fs.length) secciones.push({ nombre: sub.name, fotos: fs });
  }
  return { secciones, carpetas, total: secciones.reduce((s, x) => s + x.fotos.length, 0) };
}

// Llave de acceso a la galería (cambia si cambia el PIN)
export function llave(slug, pin) {
  const sec = process.env.CRON_SECRET || creds().private_key_id || "gt";
  return crypto.createHmac("sha256", sec).update(`${slug}:${pin || ""}`).digest("hex").slice(0, 24);
}
export const vencida = g => g.vence && g.vence < new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
