// Acciones del administrador sobre las galerías: crear/editar, cambiar modo, borrar
import { db, usuario, credenciales } from "./_lib.js";
import { drive, idCarpeta, listar, llave, SA_EMAIL } from "./_drive.js";
import { FieldValue } from "firebase-admin/firestore";

const slugify = s => String(s || "galeria").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "galeria";
const azar = () => Math.random().toString(36).slice(2, 6);

async function permisoPublico(folderId, on) {
  const r = await (await drive(`files/${folderId}/permissions?fields=permissions(id,type)`)).json();
  const pub = (r.permissions || []).filter(p => p.type === "anyone");
  if (on && !pub.length) {
    await drive(`files/${folderId}/permissions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }) });
  }
  if (!on) for (const p of pub) await drive(`files/${folderId}/permissions/${p.id}`, { method: "DELETE" });
}

async function principal(req, res) {
  const u = await usuario(req);
  if (!u || u.rol !== "admin") return res.status(401).json({ error: "Solo el administrador" });
  const b = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});

  if (b.accion === "info") {
    let c = null;
    try { c = credenciales(); } catch (e) { return res.status(500).json({ error: "Clave de servicio: " + e.message }); }
    if (!c.client_email) {
      const largo = String(process.env.FIREBASE_SERVICE_ACCOUNT || "").length;
      return res.status(500).json({ error: `La clave no tiene "client_email". Campos que veo: ${Object.keys(c).join(", ") || "ninguno"}. Largo del texto: ${largo}` });
    }
    return res.json({ email: c.client_email });
  }

  if (b.accion === "guardar") {
    const carpetaId = idCarpeta(b.carpeta);
    if (!carpetaId) return res.status(400).json({ error: "El link de la carpeta de Drive no es válido" });
    try { await drive(`files/${carpetaId}?fields=id,mimeType`); }
    catch (e) { return res.status(400).json({ error: "sin_acceso", email: SA_EMAIL(), detalle: e.message }); }
    const { carpetas, total } = await listar(carpetaId);
    if (!total) return res.status(400).json({ error: "La carpeta no tiene fotos (o están en sub-subcarpetas)" });
    let slug = String(b.slug || "").toLowerCase();
    const data = {
      trabajoId: b.trabajoId || null, carpetaId, carpetaUrl: `https://drive.google.com/drive/folders/${carpetaId}`,
      titulo: String(b.titulo || "").slice(0, 80), subtitulo: String(b.subtitulo || "").slice(0, 120),
      mensaje: String(b.mensaje || "").slice(0, 600), pin: String(b.pin || "").replace(/\D/g, "").slice(0, 8),
      vence: b.vence || "", carpetas, total, actualizado: new Date().toISOString()
    };
    if (slug) {
      const ref = db().doc(`galerias/${slug}`); const s = await ref.get();
      if (!s.exists) return res.status(404).json({ error: "Galería no encontrada" });
      if (s.data().carpetaId !== carpetaId && s.data().modo === "final") { await permisoPublico(s.data().carpetaId, false).catch(() => {}); data.modo = "muestra"; data.version = FieldValue.increment(1); }
      await ref.update(data);
    } else {
      slug = `${slugify(b.titulo)}-${azar()}`;
      await db().doc(`galerias/${slug}`).set({ ...data, modo: "muestra", version: 1, vistas: 0, favoritos: [], creado: new Date().toISOString() });
    }
    return res.json({ ok: true, slug, total, k: llave(slug, data.pin) });
  }

  const slug = String(b.slug || "").toLowerCase();
  const ref = db().doc(`galerias/${slug}`); const s = await ref.get();
  if (!s.exists) return res.status(404).json({ error: "Galería no encontrada" });
  const g = s.data();

  if (b.accion === "modo") {
    const final = b.modo === "final";
    try { await permisoPublico(g.carpetaId, final); }
    catch (e) { if (final) return res.status(400).json({ error: "necesita_editor", email: SA_EMAIL(), detalle: e.message }); }
    await ref.update({ modo: final ? "final" : "muestra", version: FieldValue.increment(1), modoEn: new Date().toISOString() });
    return res.json({ ok: true });
  }
  if (b.accion === "llave") return res.json({ k: llave(slug, g.pin) });
  if (b.accion === "borrar") {
    await permisoPublico(g.carpetaId, false).catch(() => {});
    await ref.delete();
    return res.json({ ok: true });
  }
  return res.status(400).json({ error: "Acción desconocida" });
}
export default async function handler(req, res) {
  try { return await principal(req, res); }
  catch (e) { console.error(e); return res.status(500).json({ error: "Error del servidor: " + (e?.message || e) }); }
}
