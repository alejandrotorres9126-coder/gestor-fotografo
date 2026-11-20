// Descarga del original, solo en modo "entrega final"
import { db } from "./_lib.js";
import { drive, llave, vencida } from "./_drive.js";

export default async function handler(req, res) {
  try {
    const slug = String(req.query?.g || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const id = String(req.query?.id || "").replace(/[^A-Za-z0-9_-]/g, "");
    const snap = await db().doc(`galerias/${slug}`).get();
    if (!snap.exists || !id) return res.status(404).send("No encontrada");
    const g = snap.data();
    if (g.modo !== "final" || vencida(g) || req.query?.k !== llave(slug, g.pin)) return res.status(403).send("La descarga no está habilitada");
    const meta = await (await drive(`files/${id}?fields=parents`)).json();
    if (!(meta.parents || []).some(p => (g.carpetas || [g.carpetaId]).includes(p))) return res.status(403).send("Sin acceso");
    res.setHeader("Cache-Control", "no-store");
    return res.redirect(302, `https://drive.google.com/uc?export=download&id=${id}`);
  } catch (e) { console.error(e); return res.status(500).send("Error: " + e.message); }
}
