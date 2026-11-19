// Datos públicos que la app necesita (la clave VAPID pública para las notificaciones)
export default function handler(req, res) {
  res.setHeader("Cache-Control", "public, max-age=300");
  res.status(200).json({ vapidKey: process.env.VAPID_PUBLIC_KEY || "" });
}
