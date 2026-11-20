// Sirve cada foto achicada. En modo "muestra" le imprime la marca de agua (no se puede quitar).
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { db } from "./_lib.js";
import { drive, descargarBytes, llave, vencida } from "./_drive.js";

let WM = null;
const marca = () => (WM ||= fs.readFileSync(path.join(process.cwd(), "api", "_wm.png")));
const TAM = { t: 700, f: 2000 };

async function principal(req, res) {
  const slug = String(req.query?.g || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  const id = String(req.query?.id || "").replace(/[^A-Za-z0-9_-]/g, "");
  const tam = TAM[req.query?.s] || TAM.t;
  if (!slug || !id) return res.status(400).end();

  const snap = await db().doc(`galerias/${slug}`).get();
  if (!snap.exists) return res.status(404).end();
  const g = snap.data();
  if (vencida(g) || req.query?.k !== llave(slug, g.pin)) return res.status(403).end();

  // La foto tiene que estar dentro de la carpeta de esta galería
  const meta = await (await drive(`files/${id}?fields=parents,mimeType,thumbnailLink`)).json();
  if (!(meta.parents || []).some(p => (g.carpetas || [g.carpetaId]).includes(p))) return res.status(403).end();
  if (!(meta.mimeType || "").startsWith("image/")) return res.status(415).end();

  // Primero intenta la miniatura grande de Drive (rápido); si no, baja el original
  let buf = null;
  if (meta.thumbnailLink) {
    try { const b = await descargarBytes(meta.thumbnailLink.replace(/=s\d+$/, `=s${tam}`)); if (b.length > 5000) buf = b; } catch (e) {}
  }
  if (!buf) buf = await descargarBytes(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`);

  let img = sharp(buf).rotate().resize({ width: tam, height: tam, fit: "inside", withoutEnlargement: true });
  const muestra = g.modo !== "final";
  if (muestra) {
    const { data, info } = await img.toBuffer({ resolveWithObject: true });
    const lado = Math.max(140, Math.round(Math.max(info.width, info.height) / 2.6));
    const tile = await sharp(marca()).resize(lado, lado).png().toBuffer();
    img = sharp(data).composite([{ input: tile, tile: true, blend: "over" }]);
  }
  const out = await img.jpeg({ quality: tam === TAM.t ? 74 : 84, mozjpeg: true }).toBuffer();
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=604800");
  if (muestra) res.setHeader("Content-Disposition", "inline; filename=muestra.jpg");
  return res.status(200).send(out);
}
export default async function handler(req, res) {
  try { return await principal(req, res); }
  catch (e) { console.error(e); return res.status(500).end(); }
}
