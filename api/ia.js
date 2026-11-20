// Procesa el dictado con Gemini desde el servidor (la clave nunca llega al celular)
import { usuario } from "./_lib.js";

const MODELOS = (process.env.GEMINI_MODELOS || "gemini-2.5-flash,gemini-3.6-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",");

async function principal(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Método no permitido" });
  const u = await usuario(req);
  if (!u) return res.status(401).json({ error: "No autorizado" });
  const key = process.env.GEMINI_API_KEY;
  if (!key) return res.status(500).json({ error: "Falta la variable GEMINI_API_KEY en Vercel" });
  const prompt = typeof req.body === "string" ? JSON.parse(req.body).prompt : req.body?.prompt;
  if (!prompt || prompt.length > 60000) return res.status(400).json({ error: "Pedido vacío o demasiado largo" });

  const intentos = [];
  for (const model of MODELOS) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model.trim()}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        })
      });
      const j = await r.json();
      if (!r.ok) { intentos.push(`${model}: [${r.status}] ${j?.error?.message || "error"}`); continue; }
      const txt = (j.candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim()
        .replace(/^```(json)?/, "").replace(/```$/, "");
      return res.status(200).json({ ok: true, modelo: model, data: JSON.parse(txt) });
    } catch (e) {
      intentos.push(`${model}: ${e.message}`);
    }
  }
  return res.status(502).json({ error: "Ningún modelo respondió", intentos });
}

export default async function handler(req, res) {
  try { return await principal(req, res); }
  catch (e) { console.error(e); return res.status(500).json({ error: "Error del servidor: " + (e?.message || e) }); }
}
