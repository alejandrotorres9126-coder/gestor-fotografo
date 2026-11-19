// Se ejecuta solo una vez por día (8 a 9 hs de Argentina) desde Vercel Cron.
// - Todos los días: avisa los trabajos y tareas de MAÑANA.
// - Los lunes: manda el repaso de la semana.
// Nunca incluye montos, así el mismo aviso sirve para secretarios.
import { db, fechaAR, diaSemanaAR, enviar, usuario } from "./_lib.js";

const DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const fdc = f => { const [y, m, d] = f.split("-"); return `${DIAS[new Date(+y, +m - 1, +d).getDay()]} ${d}/${m}`; };

export default async function handler(req, res) {
  // Autorización: el cron de Vercel (CRON_SECRET) o el administrador desde la app (para probar)
  const secreto = process.env.CRON_SECRET;
  const esCron = secreto && req.headers.authorization === `Bearer ${secreto}`;
  let soloUid = null;
  if (!esCron) {
    const u = await usuario(req);
    if (!u || u.rol !== "admin") return res.status(401).json({ error: "No autorizado" });
    soloUid = u.uid; // en modo prueba solo te llega a vos
  }
  const forzar = req.query?.forzar || ""; // "manana", "lunes" o "ambos" para probar

  const [msnap, tsnap, tasnap, csnap] = await Promise.all([
    db().collection("miembros").get(), db().collection("trabajos").get(),
    db().collection("tareas").where("hecha", "==", false).get(), db().collection("clientes").get()
  ]);
  let miembros = msnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.rol === "admin" || m.activo === true);
  if (soloUid) miembros = miembros.filter(m => m.id === soloUid);
  const cli = Object.fromEntries(csnap.docs.map(d => [d.id, d.data().nombre || "Cliente"]));
  const trabajos = tsnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.etapa !== "entregado" || t.fecha >= fechaAR(0));
  const tareas = tasnap.docs.map(d => d.data());

  const hoy = fechaAR(0), manana = fechaAR(1), finSemana = fechaAR(6);
  const enviados = [];

  // 1) Aviso del día anterior
  if (forzar !== "lunes") {
    const tm = trabajos.filter(t => t.fecha === manana).sort((a, b) => String(a.hora).localeCompare(String(b.hora)));
    const km = tareas.filter(t => t.fecha === manana);
    if (tm.length || km.length || forzar) {
      const lineas = tm.map(t => `${t.hora || "hora a definir"} · ${t.tipo} · ${cli[t.clienteId] || ""}${t.lugar ? " · " + t.lugar : ""}`);
      if (km.length) lineas.push(`Tareas para mañana: ${km.map(t => t.texto).slice(0, 3).join("; ")}${km.length > 3 ? "…" : ""}`);
      const titulo = tm.length === 1 ? `Mañana: ${tm[0].tipo} de ${cli[tm[0].clienteId] || ""}`
        : tm.length > 1 ? `Mañana tenés ${tm.length} trabajos` : km.length ? `Mañana vencen ${km.length} tarea(s)` : "Mañana no tenés trabajos agendados";
      const n = await enviar(miembros, titulo, lineas.join("\n") || "Día libre. Aprovechá para editar y entregar.");
      enviados.push({ tipo: "manana", n });
    }
  }

  // 2) Repaso del lunes
  const esLunes = diaSemanaAR().startsWith("lun");
  if ((esLunes && forzar !== "manana") || forzar === "lunes" || forzar === "ambos") {
    const semana = trabajos.filter(t => t.fecha && t.fecha >= hoy && t.fecha <= finSemana).sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora));
    const vencidas = tareas.filter(t => t.fecha && t.fecha < hoy).length;
    const incompletos = trabajos.filter(t => t.etapa !== "entregado" && (!t.fecha || !t.hora || !t.lugar)).length;
    const porEditar = trabajos.filter(t => t.etapa === "sesion" || t.etapa === "edicion").length;
    const lineas = [];
    lineas.push(semana.length ? `Trabajos: ${semana.slice(0, 4).map(t => `${fdc(t.fecha)} ${t.tipo} (${cli[t.clienteId] || ""})`).join(", ")}${semana.length > 4 ? ` y ${semana.length - 4} más` : ""}` : "Sin trabajos agendados esta semana");
    lineas.push(`Tareas pendientes: ${tareas.length}${vencidas ? ` (${vencidas} vencidas)` : ""}`);
    if (porEditar) lineas.push(`Por editar o entregar: ${porEditar}`);
    if (incompletos) lineas.push(`Datos a completar: ${incompletos}`);
    const n = await enviar(miembros, "Arranca la semana 📸", lineas.join("\n"));
    enviados.push({ tipo: "lunes", n });
  }

  return res.status(200).json({ ok: true, hoy, manana, enviados });
}
