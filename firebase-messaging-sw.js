// Recibe las notificaciones cuando la app está cerrada
importScripts("https://www.gstatic.com/firebasejs/13.4.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.4.0/firebase-messaging-compat.js");

firebase.initializeApp({
  apiKey: "AIzaSyCsq4hOoYMv4sly5Wz8FMOgON7x4pgDrHU",
  authDomain: "gestor-fotografo.firebaseapp.com",
  projectId: "gestor-fotografo",
  storageBucket: "gestor-fotografo.firebasestorage.app",
  messagingSenderId: "73327030013",
  appId: "1:73327030013:web:e7d881788da3ba4c43d894"
});
firebase.messaging();

self.addEventListener("notificationclick", e => {
  e.notification.close();
  e.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(ws => {
    for (const w of ws) if ("focus" in w) return w.focus();
    return clients.openWindow("/");
  }));
});
