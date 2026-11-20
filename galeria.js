// Datos de una galería para el cliente (página /g/...). Público, protegido por PIN opcional.
import { db, usuario } from "./_lib.js";
import { listar, llave, vencida } from "./_drive.js";
import { FieldValue } from "firebase-admin/firestore";

async function principal(req, res) {
  const slug = String(req.query?.g || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
  if (!slug) return res.status(400).json({ error: "Falta la galería" });
  const ref = db().doc(`galerias/${slug}`); const snap = await ref.get();
  if (!snap.exists) return res.status(404).json({ error: "No encontramos esta galería" });
  const g = snap.data();
  if (vencida(g)) return res.status(410).json({ error: "Esta galería ya no está disponible", titulo: g.titulo });
  if (g.pin && String(req.query?.pin || "") !== String(g.pin)) return res.status(401).json({ pin: true, titulo: g.titulo, error: req.query?.pin ? "PIN incorrecto" : "" });

  const { secciones, carpetas, total } = await listar(g.carpetaId);
  const esAdmin = (await usuario(req))?.rol === "admin";
  const upd = { carpetas, total };
  if (!esAdmin) { upd.vistas = FieldValue.increment(1); upd.ultimaVista = new Date().toISOString(); }
  await ref.update(upd);

  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({
    titulo: g.titulo || "", subtitulo: g.subtitulo || "", mensaje: g.mensaje || "",
    modo: g.modo === "final" ? "final" : "muestra", portada: g.portadaId || secciones[0]?.fotos[0]?.id || null,
    secciones, total, favoritos: g.favoritos || [], k: llave(slug, g.pin), v: g.version || 1,
    carpetaUrl: g.modo === "final" ? `https://drive.google.com/drive/folders/${g.carpetaId}` : null
  });
}
export default async function handler(req, res) {
  try { return await principal(req, res); }
  catch (e) { console.error(e); return res.status(500).json({ error: "Error del servidor: " + (e?.message || e) }); }
}
