/**
 * service-worker.js
 * -------------------
 * Permite que a app abra offline e seja instalável no telemóvel.
 * Por agora, guarda em cache os ficheiros essenciais.
 */

/**
 * IMPORTANTE — sobe este número sempre que publicares uma versão nova da app.
 * É isso que faz o telemóvel deitar fora a cópia antiga e ir buscar a nova.
 */
const CACHE_NAME = "goforit-cache-v5";

const FICHEIROS_PARA_CACHE = [
  "./index.html",
  "./css/style.css",
  "./js/app.js",
  "./js/storage.js",
  "./manifest.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (evento) => {
  evento.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(FICHEIROS_PARA_CACHE))
      // Não fica à espera que todas as janelas da app fechem para assumir o
      // controlo — senão uma versão nova podia demorar dias a entrar.
      .then(() => self.skipWaiting())
  );
});

// Ao ativar, apaga as caches de versões anteriores (goforit-cache-v1, etc).
self.addEventListener("activate", (evento) => {
  evento.waitUntil(
    caches
      .keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/**
 * Estratégia: primeiro a rede, cache só como plano B.
 *
 * A versão anterior fazia o contrário (cache primeiro) e nunca mais ia à
 * rede — resultado: publicavam-se versões novas da app e o telemóvel
 * continuava a mostrar a antiga para sempre. Assim, com internet vês sempre
 * a versão mais recente; sem internet a app continua a abrir, com a última
 * cópia guardada.
 */
self.addEventListener("fetch", (evento) => {
  if (evento.request.method !== "GET") return;

  evento.respondWith(
    fetch(evento.request)
      .then((resposta) => {
        // Guarda uma cópia fresca para quando não houver rede.
        const copia = resposta.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(evento.request, copia));
        return resposta;
      })
      .catch(() => caches.match(evento.request))
  );
});

/**
 * ===== Notificações push reais =====
 * Estes dois eventos só existem porque a app está registada num servidor
 * (ver /server/server.js) que manda notificações via Push API. O service
 * worker corre em segundo plano no telemóvel — por isso consegue mostrar a
 * notificação mesmo com a app GO FOR IT fechada.
 */

// Chega uma notificação do servidor (ex: lembrete das 20h ou do domingo).
self.addEventListener("push", (evento) => {
  let dados = { titulo: "GO FOR IT", mensagem: "Tens uma novidade na app." };
  if (evento.data) {
    try {
      dados = evento.data.json();
    } catch (erro) {
      dados.mensagem = evento.data.text();
    }
  }

  evento.waitUntil(
    self.registration.showNotification(dados.titulo, {
      body: dados.mensagem,
      icon: "icons/icon-192.png",
      badge: "icons/icon-192.png",
    })
  );
});

// Ao tocar na notificação, abre (ou foca) a app.
self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  evento.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((listaJanelas) => {
      for (const janela of listaJanelas) {
        if (janela.url.includes("index.html") && "focus" in janela) return janela.focus();
      }
      if (clients.openWindow) return clients.openWindow("./index.html");
    })
  );
});
