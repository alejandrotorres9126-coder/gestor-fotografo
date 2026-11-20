// El cliente marca o desmarca una foto como favorita (sirve para elegir las del álbum)
import { db } from "./_lib.js";
import { llave, vencida } from "./_drive.js";
import { FieldValue } from "firebase-admin/firestore";

export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).end();
    const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
    const slug = String(b.g || "").toLowerCase().replace(/[^a-z0-9-]/g, "");
    const id = String(b.id || "").replace(/[^A-Za-z0-9_-]/g, "");
    const ref = db().doc(`galerias/${slug}`); const snap = await ref.get();
    if (!snap.exists || !id) return res.status(404).json({ error: "No encontrada" });
    const g = snap.data();
    if (vencida(g) || b.k !== llave(slug, g.pin)) return res.status(403).json({ error: "Sin acceso" });
    await ref.update({ favoritos: b.on ? FieldValue.arrayUnion(id) : FieldValue.arrayRemove(id), favoritosEn: new Date().toISOString() });
    return res.status(200).json({ ok: true });
  } catch (e) { console.error(e); return res.status(500).json({ error: e.message }); }
}
