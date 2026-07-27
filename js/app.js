/**
 * app.js
 * -------
 * Ponto de entrada da app + os 4 ecrãs principais:
 * - Calendário mensal (ecrã inicial) — só goals "diario"/"mensal", clicáveis
 * - Goals do mês — criar goals com tipo (diário / semanal / mensal) e meta
 * - Check-in semanal — responder Sim/Não aos goals "semanal"
 * - Feedback (semanal / mensal)
 */

const appContent = document.getElementById("app-content");

const NOMES_TIPO = { diario: "Diário", semanal: "Semanal", mensal: "Mensal" };

/**
 * ===== Ajustes de aparência =====
 * Vieram do protótipo de design go-for-it-app_7.html. Cada preset só define
 * as cores/fonte — quem realmente as aplica ao ecrã é aplicarAjustes(),
 * trocando variáveis CSS lidas em style.css (--font-principal, --cor-destaque,
 * --cor-destaque-2, --fs-scale).
 */
const FONTES = {
  arredondada: { familia: "'Fredoka', sans-serif", label: "Arredondada" },
  classica: { familia: "'Poppins', sans-serif", label: "Clássica" },
  tecnica: { familia: "'Space Grotesk', sans-serif", label: "Técnica" },
};

const ACENTOS = {
  ignicao: { destaque: "#FF6B35", destaque2: "#FF3D7F", label: "Ignição" },
  oceano: { destaque: "#22D3EE", destaque2: "#3B82F6", label: "Oceano" },
  floresta: { destaque: "#4ADE80", destaque2: "#16A34A", label: "Floresta" },
  nebulosa: { destaque: "#C084FC", destaque2: "#9333EA", label: "Nebulosa" },
  rubi: { destaque: "#F94144", destaque2: "#C81D25", label: "Rubi" },
  aurora: { destaque: "#34D399", destaque2: "#7C3AED", label: "Aurora" },
};

const ESCALAS = [
  { valor: 1, label: "Normal" },
  { valor: 1.08, label: "Médio" },
  { valor: 1.16, label: "Grande" },
];

// Escreve os ajustes escolhidos nas variáveis CSS do :root — todo o resto da
// app já usa var(--cor-destaque) etc, por isso muda tudo sozinho, sem
// precisar de voltar a desenhar nada.
function aplicarAjustes(ajustes) {
  const raiz = document.documentElement.style;
  raiz.setProperty("--font-principal", FONTES[ajustes.fonte].familia);
  raiz.setProperty("--cor-destaque", ACENTOS[ajustes.acento].destaque);
  raiz.setProperty("--cor-destaque-2", ACENTOS[ajustes.acento].destaque2);
  raiz.setProperty("--fs-scale", ajustes.escala);
}

/**
 * ===== Notificações push reais =====
 * Endereço do servidor que manda os lembretes (ver pasta /server).
 * Publicado no Render — funciona em qualquer lado, não só no Mac de casa.
 */
const SERVER_URL = "https://goforit-server.onrender.com";

// A chave pública VAPID vem do servidor — é o "cartão de identificação"
// que prova ao browser que as notificações vêm mesmo do nosso servidor.
async function subscreverNotificacoesPush() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    console.log("Push não suportado neste browser.");
    return;
  }

  try {
    const registo = await navigator.serviceWorker.ready;

    // Já existe uma subscrição? Não faz mal pedir outra vez — o browser
    // devolve a mesma se as chaves não mudaram.
    const respostaChave = await fetch(`${SERVER_URL}/chave-publica`);
    const { publicKey } = await respostaChave.json();

    const subscricao = await registo.pushManager.subscribe({
      userVisibleOnly: true, // obrigatório: toda notificação push tem de ser visível ao utilizador
      applicationServerKey: urlBase64ParaUint8Array(publicKey),
    });

    await fetch(`${SERVER_URL}/subscrever`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(subscricao),
    });

    console.log("✅ Subscrito a notificações push.");
    sincronizarEstadoComServidor(); // já agora manda logo o primeiro resumo
  } catch (erro) {
    // Não bloqueia a app se o servidor ainda não estiver a correr/deployado.
    console.log("Não foi possível subscrever notificações push:", erro.message);
  }
}

// Manda ao servidor um resumo do progresso (streak, quanto falta em cada
// goal — nunca os nomes) para ele conseguir escolher a notificação certa à
// hora certa, mesmo com a app fechada (etapa 19). Chamada sempre que algo
// que esse resumo usa pode ter mudado: ao abrir a app, ao marcar um goal, ao
// criar/remover um goal. Falha em silêncio se não houver subscrição ainda ou
// o servidor estiver indisponível — nunca deve travar a app.
async function sincronizarEstadoComServidor() {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  try {
    const registo = await navigator.serviceWorker.ready;
    const subscricao = await registo.pushManager.getSubscription();
    if (!subscricao) return; // ainda não há subscrição para associar o estado

    await fetch(`${SERVER_URL}/atualizar-estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ endpoint: subscricao.endpoint, estado: construirEstadoParaServidor() }),
    });
  } catch (erro) {
    console.log("Não foi possível sincronizar estado com o servidor:", erro.message);
  }
}

// A chave VAPID vem em texto (base64 URL-safe); a Push API precisa dela
// como Uint8Array de bytes — esta função faz essa conversão padrão.
function urlBase64ParaUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const bruto = window.atob(base64);
  const outputArray = new Uint8Array(bruto.length);
  for (let i = 0; i < bruto.length; i++) outputArray[i] = bruto.charCodeAt(i);
  return outputArray;
}

const CLASSES_NIVEL = ["nivel-nenhum", "nivel-faisca", "nivel-chama", "nivel-fogueira", "nivel-incendio", "nivel-lendario"];

/* ===== Atualizar o badge do streak no cabeçalho ===== */
function atualizarStreakBadge() {
  const dados = carregarDados();
  const nivel = obterNivelFogo(dados.streak.atual);
  // Emojis como 🔥 ocupam 2 "unidades" internas em JS — .charAt(0) parte-os a meio
  // e mostra um símbolo partido. Array.from() lê por caráter completo, corrige isso.
  const primeiroEmoji = Array.from(nivel.icone)[0];
  document.getElementById("streak-fire").textContent = primeiroEmoji || "🔥";
  document.getElementById("streak-count").textContent = dados.streak.atual;
  document.getElementById("streak-nivel").textContent = nivel.nome;

  const badge = document.getElementById("streak-badge");
  badge.classList.remove(...CLASSES_NIVEL);
  badge.classList.add(nivel.classe);
}

// Pequeno "salto" no badge quando se ganha um fogo novo — a classe some sozinha
// no fim da animação (ver @keyframes badge-comemorar em style.css).
function comemorarBadge() {
  const badge = document.getElementById("streak-badge");
  badge.classList.remove("badge-comemorar");
  void badge.offsetWidth; // força o browser a "esquecer" a animação anterior, para poder repeti-la já a seguir
  badge.classList.add("badge-comemorar");
  setTimeout(() => badge.classList.remove("badge-comemorar"), 600);
}

/* ===== Celebração: toast + notificação do browser ===== */
function celebrar(mensagem) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("GO FOR IT", { body: mensagem, icon: "icons/icon-192.png" });
  }
  mostrarToast(mensagem);
}

/**
 * Aviso no momento do tick, quando o goal ainda não está fechado.
 *
 * Pedido do Antonio: ao dar o penúltimo tick de um objetivo, ele quer saber
 * logo ali quantos dias lhe restam para o último — não faz sentido esperar
 * pela notificação das 18:30 do servidor para receber essa informação.
 *
 * `diasRestantes` já vem sem contar com hoje: hoje o tick acabou de ser dado
 * e um goal só se pode marcar uma vez por dia, por isso o tempo útil que
 * resta é mesmo a partir de amanhã.
 */
function avisarQuantoFalta(nomeGoal, falta, diasRestantes) {
  if (falta <= 0) return;

  if (diasRestantes <= 0) {
    // Marcou hoje, mas o prazo fecha hoje e ainda falta — não há como cumprir.
    celebrar(`⚠️ "${nomeGoal}": o prazo acaba hoje e ainda faltava ${falta}.`);
    return;
  }

  const prazo = `${diasRestantes} ${diasRestantes === 1 ? "dia" : "dias"}`;

  if (falta === 1) {
    celebrar(`💪 Falta só 1 para fechares "${nomeGoal}" — ainda tens ${prazo}.`);
    return;
  }

  // Só vale a pena falar do prazo quando ele começa a apertar; caso contrário
  // seria uma notificação a cada tique, e deixava de significar alguma coisa.
  if (falta >= diasRestantes) {
    celebrar(`⚠️ "${nomeGoal}": faltam ${falta} e restam ${prazo} — sem margem para falhar.`);
  }
}

function mostrarToast(mensagem) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = mensagem;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visivel"));
  setTimeout(() => {
    toast.classList.remove("toast-visivel");
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/* ===== Ecrã: Calendário mensal ===== */
let mesVisivel = obterMesAtualISO();
let diaSelecionadoISO = null;
// Nome do goal que acabou de ser tocado (marcado/desmarcado) — usado só para saber
// a que item aplicar a animação de "pop" no próximo render, depois é limpo.
let ultimoGoalTocado = null;

function renderCalendario() {
  const semanas = gerarGradeDoMes(mesVisivel);
  const hoje = obterDataHojeISO();
  const nomesDias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

  const cabecalhoHtml = nomesDias.map((n) => `<div class="cal-dia-nome">${n}</div>`).join("");

  const celulasHtml = semanas
    .flat()
    .map((celula) => {
      if (!celula) return `<div class="cal-dia cal-vazio"></div>`;

      const estado = obterEstadoDoDia(celula.dataISO);
      const classes = ["cal-dia", `estado-${estado}`];
      if (celula.dataISO === hoje) classes.push("cal-hoje");
      if (celula.dataISO === diaSelecionadoISO) classes.push("cal-selecionado");

      const icone = estado === "completo" ? "✅" : estado === "incompleto" ? "❌" : "";

      return `
        <button class="${classes.join(" ")}" data-data="${celula.dataISO}">
          <span class="cal-dia-numero">${celula.dia}</span>
          <span class="cal-dia-icone">${icone}</span>
        </button>
      `;
    })
    .join("");

  appContent.innerHTML = `
    <div class="view-calendario">
      <div class="cal-header">
        <button class="cal-nav" id="mes-anterior">‹</button>
        <h2 class="view-titulo">${formatarMes(mesVisivel)}</h2>
        <button class="cal-nav" id="mes-seguinte">›</button>
      </div>
      <div class="cal-grid">${cabecalhoHtml}${celulasHtml}</div>
      <div class="cal-legenda">
        <span><i style="background:linear-gradient(135deg, var(--cor-destaque), var(--cor-destaque-2))"></i>completo</span>
        <span><i style="background:rgba(255,84,112,.5)"></i>incompleto</span>
        <span><i style="background:var(--bg-card); border:1px solid var(--borda)"></i>sem goals</span>
      </div>
      <div id="detalhe-dia">${diaSelecionadoISO ? renderDetalheDiaHtml(diaSelecionadoISO) : ""}</div>
    </div>
  `;

  document.getElementById("mes-anterior").addEventListener("click", () => {
    mesVisivel = mesAnteriorISO(mesVisivel);
    diaSelecionadoISO = null;
    renderCalendario();
  });
  document.getElementById("mes-seguinte").addEventListener("click", () => {
    mesVisivel = mesSeguinteISO(mesVisivel);
    diaSelecionadoISO = null;
    renderCalendario();
  });

  appContent.querySelectorAll(".cal-dia:not(.cal-vazio)").forEach((btn) => {
    btn.addEventListener("click", () => {
      diaSelecionadoISO = btn.dataset.data === diaSelecionadoISO ? null : btn.dataset.data;
      renderCalendario();
    });
  });

  if (diaSelecionadoISO) ligarDetalheDia();
}

// Card com a checklist do dia selecionado: goals "diario" + "mensal" (sempre) e
// "semanal" (só enquanto não atingir a meta dessa semana — depois some da lista).
function renderDetalheDiaHtml(dataISO) {
  const goals = obterGoalsParaMostrarNoDia(dataISO);
  const checklist = obterChecklistDoDia(dataISO);
  const segundaDaSemana = obterInicioDaSemanaISO(dataISO);
  const hoje = obterDataHojeISO();
  // Só se pode marcar/desmarcar o dia de HOJE (nem passado, nem futuro) — pedido
  // do Antonio antes do lançamento a sério, para não dar para "corrigir" dias
  // antigos depois de já terem passado.
  const editavel = dataISO === hoje;

  if (goals.length === 0) {
    return `
      <div class="detalhe-card">
        <div class="detalhe-cabecalho">
          <p class="detalhe-data">${formatarDataLonga(dataISO)}</p>
          <button class="btn-fechar" id="fechar-detalhe">✕</button>
        </div>
        <p class="placeholder-text-small">Sem goals para este dia — ou já cumpriste tudo esta semana! 🎉</p>
      </div>
    `;
  }

  const itensHtml = goals
    .map((goal) => {
      const cumprido = checklist[goal.nome] === true;
      const obrigatorio = goalObrigatorioNoDia(goal, dataISO);

      let sub = "";
      if (goal.tipo === "semanal") {
        const contagem = contarOcorrenciasSemana(goal.nome, segundaDaSemana);
        sub = `${Math.min(contagem, goal.meta)}/${goal.meta}x esta semana`;
      } else if (goal.tipo === "mensal") {
        const progresso = calcularProgressoMensal(goal.nome, dataISO.slice(0, 7));
        sub = `${Math.min(progresso, goal.meta)}/${goal.meta} dias este mês`;
      }

      // Avisa quando um goal semanal/mensal deixou de ter folga e passou a
      // contar para o dia — a pressão vê-se a chegar, não cai de surpresa.
      // (Já cumprido não precisa de aviso nenhum.)
      const marcaObrigatorio =
        obrigatorio && !cumprido && goal.tipo !== "diario"
          ? ` <span class="goal-obrigatorio">⚠️ obrigatório hoje</span>`
          : "";

      const animar = goal.nome === ultimoGoalTocado ? "anim-marcado" : "";

      // O ✓ está sempre no HTML — é a CSS (cor transparente vs. branca) que o
      // esconde ou mostra consoante o item está cumprido ou não.
      return `
        <li class="goal-item ${cumprido ? "cumprido" : ""} ${obrigatorio && !cumprido ? "goal-obrigatorio-hoje" : ""} ${editavel ? "" : "goal-desativado"} ${animar}" data-goal="${escapeHtml(goal.nome)}">
          <span class="goal-check">✓</span>
          <span class="goal-texto">
            ${escapeHtml(goal.nome)}<span class="goal-badge ${goal.tipo}">${NOMES_TIPO[goal.tipo]}</span>
            ${sub ? `<span class="goal-etiqueta">${sub}${marcaObrigatorio}</span>` : marcaObrigatorio ? `<span class="goal-etiqueta">${marcaObrigatorio}</span>` : ""}
          </span>
        </li>
      `;
    })
    .join("");

  // Já usámos a informação para este render — limpa para não animar outra vez
  // sem ser tocado (ex: ao mudar de mês ou reabrir o dia).
  ultimoGoalTocado = null;

  return `
    <div class="detalhe-card">
      <div class="detalhe-cabecalho">
        <p class="detalhe-data">${formatarDataLonga(dataISO)}</p>
        <button class="btn-fechar" id="fechar-detalhe">✕</button>
      </div>
      <ul class="goal-list">${itensHtml}</ul>
      ${!editavel ? `<p class="placeholder-text-small">${dataISO > hoje ? "Este dia ainda não chegou." : "Só podes marcar/desmarcar o dia de hoje — este é só para consulta."}</p>` : ""}
    </div>
  `;
}

function ligarDetalheDia() {
  const fechar = document.getElementById("fechar-detalhe");
  if (fechar) {
    fechar.addEventListener("click", () => {
      diaSelecionadoISO = null;
      renderCalendario();
    });
  }

  document.querySelectorAll("#detalhe-dia .goal-item:not(.goal-desativado)").forEach((li) => {
    li.addEventListener("click", () => {
      const nomeGoal = li.dataset.goal;
      ultimoGoalTocado = nomeGoal;
      const goal = obterGoalsDoMes(diaSelecionadoISO.slice(0, 7)).find((g) => g.nome === nomeGoal);
      const ganhouFogo = alternarGoalNoDia(nomeGoal, diaSelecionadoISO);
      atualizarStreakBadge();

      const agoraCumprido = obterChecklistDoDia(diaSelecionadoISO)[nomeGoal] === true;

      if (agoraCumprido && goal.tipo === "semanal") {
        const segunda = obterInicioDaSemanaISO(diaSelecionadoISO);
        const feito = contarOcorrenciasSemana(nomeGoal, segunda);
        if (feito >= goal.meta) {
          celebrar(`🎉 Atingiste a meta semanal de "${nomeGoal}"!`);
        } else {
          avisarQuantoFalta(nomeGoal, goal.meta - feito, diasAteFimDaSemana(diaSelecionadoISO) - 1);
        }
      }

      if (agoraCumprido && goal.tipo === "mensal") {
        const progresso = calcularProgressoMensal(nomeGoal, diaSelecionadoISO.slice(0, 7));
        if (progresso === goal.meta) {
          celebrar(`🎉 Atingiste a meta mensal de "${nomeGoal}"!`);
        } else if (progresso < goal.meta) {
          avisarQuantoFalta(nomeGoal, goal.meta - progresso, diasAteFimDoMes(diaSelecionadoISO) - 1);
        }
      }

      if (agoraCumprido && checklistCompletaNoDia(diaSelecionadoISO)) {
        celebrar("🎉 Dia completo! Continua assim.");
      }

      if (ganhouFogo) {
        celebrar("🔥 Mais um dia de fogo — a corrente continua!");
        comemorarBadge();
      }

      sincronizarEstadoComServidor(); // o progresso mudou — mantém o servidor a par
      renderCalendario();
    });
  });
}

/* ===== Ecrã: Goals do mês ===== */
const LIMITE_GOALS = 6;
// Estado do formulário de "novo goal" — vive fora do render porque o utilizador
// pode trocar de tipo/quantidade várias vezes antes de submeter, e cada uma
// dessas trocas volta a desenhar o ecrã todo. Se o texto não fosse guardado
// aqui, perdia-se o que já estava escrito a cada clique no +/− ou no tipo.
let novoGoalTipo = "diario";
let novoGoalMeta = 3;
let novoGoalTexto = "";
// Só interessa para goals "semanal": por defeito expiram ao fim da semana
// (pedido do Antonio); marcando isto, a pessoa escolhe explicitamente manter
// este goal a repetir-se sozinho todas as semanas, até o remover à mão.
let novoGoalPersistente = false;

function metaMaxima(tipo, mesISO) {
  if (tipo === "semanal") return 7;
  if (tipo === "mensal") return totalDiasNoMes(mesISO);
  return 99;
}

function renderGoals() {
  const mesISO = obterMesAtualISO();
  const goals = obterGoalsDoMes(mesISO);
  const isDia1 = obterDataHojeISO().endsWith("-01");

  const bannerHtml = isDia1
    ? `
      <div class="day1-banner">
        <p class="dia1-titulo">📅 Hoje é dia 1 — hora de definir os goals de ${formatarMes(mesISO)}</p>
        <p class="dia1-texto">Escolhe entre 1 e ${LIMITE_GOALS} objetivos claros e realistas, com a frequência certa para cada um.</p>
      </div>`
    : "";

  const cardsHtml = goals
    .map((goal) => {
      let sub = "todos os dias";
      if (goal.tipo === "semanal") {
        const estadoSemanal = obterEstadoGoalSemanal(goal);
        if (estadoSemanal.concluido) {
          sub = `✅ Terminado — não se renova sozinho, cria um novo goal para continuares`;
        } else {
          const etiquetaPersistente = goal.persistente ? " 🔁 mantém-se todas as semanas" : "";
          sub = `${Math.min(estadoSemanal.feito, goal.meta)}/${goal.meta}x esta semana${etiquetaPersistente}`;
        }
      } else if (goal.tipo === "mensal") {
        const progresso = calcularProgressoMensal(goal.nome, mesISO);
        sub = `${Math.min(progresso, goal.meta)}/${goal.meta} dias este mês${progresso >= goal.meta ? " ✅" : ""}`;
      }

      return `
        <div class="goal-card">
          <div class="goal-card-top">
            <div class="goal-card-left">
              <span class="goal-card-name">${escapeHtml(goal.nome)}</span>
              <span class="goal-badge ${goal.tipo}">${NOMES_TIPO[goal.tipo]}</span>
            </div>
            <button class="goal-card-remove" data-goal="${escapeHtml(goal.nome)}">✕</button>
          </div>
          <p class="goal-card-sub">${sub}</p>
          ${goal.tipo !== "diario" ? `<p class="goal-card-hint">Marca-se no separador Calendário</p>` : ""}
        </div>`;
    })
    .join("");

  const podeAdicionar = goals.length < LIMITE_GOALS;
  const freqBtnsHtml = ["diario", "semanal", "mensal"]
    .map((f) => `<button type="button" class="freq-btn ${novoGoalTipo === f ? "active" : ""}" data-tipo="${f}">${NOMES_TIPO[f]}</button>`)
    .join("");

  const qtyRowHtml =
    novoGoalTipo !== "diario"
      ? `
      <div class="qty-row">
        <span class="qty-label">${novoGoalTipo === "semanal" ? "Quantas vezes por semana" : "Em quantos dias do mês"}</span>
        <div class="stepper">
          <button type="button" id="qty-menos">−</button>
          <span class="qty-val">${novoGoalMeta}/${metaMaxima(novoGoalTipo, mesISO)}</span>
          <button type="button" id="qty-mais">+</button>
        </div>
      </div>`
      : "";

  // Só os "semanal" têm esta escolha — por defeito (desmarcada) o goal expira
  // ao fim da semana e tem de ser recriado; marcando, mantém-se sozinho.
  const persistenteRowHtml =
    novoGoalTipo === "semanal"
      ? `
      <label class="persistente-row">
        <input type="checkbox" id="check-persistente" ${novoGoalPersistente ? "checked" : ""} />
        <span>🔁 Manter este objetivo todas as semanas (até eu o remover)</span>
      </label>`
      : "";

  appContent.innerHTML = `
    <div class="view-goals">
      <h2 class="view-titulo">Goals de ${formatarMes(mesISO)}</h2>
      ${bannerHtml}
      <div class="goal-list-edit">${cardsHtml}</div>
      ${goals.length === 0 ? '<p class="placeholder-text-small">Sem goals definidos ainda.</p>' : ""}

      ${
        podeAdicionar
          ? `
      <form id="form-novo-goal" class="form-novo-goal">
        <input type="text" id="input-novo-goal" placeholder="Ex: Beber 2L de água" maxlength="60" value="${escapeHtml(novoGoalTexto)}" />
        <div class="freq-row">${freqBtnsHtml}</div>
        <div id="qty-row-wrap">${qtyRowHtml}</div>
        <div id="persistente-row-wrap">${persistenteRowHtml}</div>
        <button type="submit" class="btn-add">Adicionar</button>
      </form>`
          : `<p class="limit-note">Limite de ${LIMITE_GOALS} atingido — remove um goal para adicionar outro.</p>`
      }

      <div class="tip-card">
        <p class="tip-titulo">💡 Como funciona</p>
        <ul>
          <li><b>Diário</b> e <b>Mensal</b> marcam-se todos os dias no Calendário — só que o mensal só precisa de X dias, não de todos.</li>
          <li><b>Semanal</b> aparece no Calendário até atingires a meta da semana; não marcar num dia específico não estraga o teu dia.</li>
          <li>O fogo agora é <b>semanal</b>: só sobe se a semana toda ficar completa.</li>
        </ul>
      </div>
    </div>
  `;

  if (podeAdicionar) {
    // Mantém o texto guardado a cada tecla, para sobreviver aos re-renders.
    const inputNovo = document.getElementById("input-novo-goal");
    inputNovo.addEventListener("input", () => {
      novoGoalTexto = inputNovo.value;
    });

    document.querySelectorAll(".freq-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        novoGoalTipo = btn.dataset.tipo;
        novoGoalMeta = novoGoalTipo === "semanal" ? 3 : Math.min(20, metaMaxima(novoGoalTipo, mesISO));
        novoGoalPersistente = false; // trocar de tipo volta a começar do zero
        renderGoals();
      });
    });

    const checkPersistente = document.getElementById("check-persistente");
    if (checkPersistente) {
      checkPersistente.addEventListener("change", () => {
        novoGoalPersistente = checkPersistente.checked;
      });
    }

    const qtyMenos = document.getElementById("qty-menos");
    const qtyMais = document.getElementById("qty-mais");
    if (qtyMenos && qtyMais) {
      qtyMenos.addEventListener("click", () => {
        novoGoalMeta = Math.max(1, novoGoalMeta - 1);
        renderGoals();
      });
      qtyMais.addEventListener("click", () => {
        novoGoalMeta = Math.min(metaMaxima(novoGoalTipo, mesISO), novoGoalMeta + 1);
        renderGoals();
      });
    }

    document.getElementById("form-novo-goal").addEventListener("submit", (e) => {
      e.preventDefault();
      if (!inputNovo.value.trim()) return;

      const meta = novoGoalTipo === "diario" ? null : novoGoalMeta;
      adicionarGoal(inputNovo.value, novoGoalTipo, meta, mesISO, novoGoalPersistente);

      // Só aqui é que o formulário se limpa: o goal já foi mesmo criado.
      novoGoalTexto = "";
      novoGoalTipo = "diario";
      novoGoalMeta = 3;
      novoGoalPersistente = false;
      sincronizarEstadoComServidor(); // novo goal pode mudar temGoalsSemanais/mensais
      renderGoals();
    });
  }

  appContent.querySelectorAll(".goal-card-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removerGoal(btn.dataset.goal, mesISO);
      sincronizarEstadoComServidor();
      renderGoals();
    });
  });
}

/* ===== Ecrã: Check-in (progresso das metas semanais e mensais) =====
 * Já não há respostas manuais: as metas medem-se pelos ticks no calendário.
 * Este ecrã é só o sítio onde vês, num relance, quanto falta em cada prazo.
 */
function renderCheckin() {
  const segundaISO = obterInicioDaSemanaISO();
  const mesISO = obterMesAtualISO();
  const goalsSemanais = obterGoalsPorTipo(mesISO, "semanal");
  const goalsMensais = obterGoalsPorTipo(mesISO, "mensal");

  if (goalsSemanais.length === 0 && goalsMensais.length === 0) {
    appContent.innerHTML = `
      <div class="empty-state">
        <p class="placeholder-text">Ainda não tens goals semanais ou mensais definidos.</p>
        <button class="btn-primary" id="ir-para-goals">Definir goals</button>
      </div>
    `;
    document.getElementById("ir-para-goals").addEventListener("click", () => mudarView("goals"));
    return;
  }

  // Semanais e mensais mostram-se agora exatamente da mesma forma: progresso,
  // barra, e quantos dias ainda restam no prazo.
  function itemProgressoHtml(goal, feitos, restantes, unidadePrazo) {
    const percentagem = Math.min(100, Math.round((feitos / goal.meta) * 100));
    const atingiu = feitos >= goal.meta;
    const falta = goal.meta - feitos;
    const apertado = !atingiu && falta >= restantes;

    let estado;
    if (atingiu) estado = `<span class="checkin-status ok">✅ Meta atingida</span>`;
    else if (apertado) estado = `<span class="checkin-status fail">⚠️ Sem folga — obrigatório</span>`;
    else estado = `<span class="checkin-status pending">${restantes} ${unidadePrazo} restantes</span>`;

    return `
      <div class="checkin-item">
        <div class="checkin-row-top">
          <span class="checkin-nome">${escapeHtml(goal.nome)}</span>
          ${estado}
        </div>
        <p class="checkin-sub">${Math.min(feitos, goal.meta)}/${goal.meta}${atingiu ? " 🎉" : ""}</p>
        <div class="checkin-progresso">
          <div class="checkin-progresso-barra" style="width: ${percentagem}%"></div>
        </div>
      </div>
    `;
  }

  const hoje = obterDataHojeISO();

  const itensSemanaisHtml = goalsSemanais
    .map((goal) =>
      itemProgressoHtml(goal, obterEstadoGoalSemanal(goal, segundaISO).feito, diasAteFimDaSemana(hoje), "dias")
    )
    .join("");

  const itensMensaisHtml = goalsMensais
    .map((goal) =>
      itemProgressoHtml(goal, calcularProgressoMensal(goal.nome, mesISO), diasAteFimDoMes(hoje), "dias")
    )
    .join("");

  appContent.innerHTML = `
    <div class="view-checkin">
      <h2 class="view-titulo">Check-in</h2>
      <p class="placeholder-text-small">${formatarDataLonga(segundaISO)} → ${formatarDataLonga(obterFimDaSemanaISO(segundaISO))}</p>

      ${goalsSemanais.length > 0 ? `
        <h3 class="checkin-subtitulo">Metas semanais</h3>
        <p class="placeholder-text-small">Marcam-se no calendário, quando te der jeito. Só se tornam obrigatórias se os dias que faltam já não chegarem.</p>
        <div class="checkin-lista">${itensSemanaisHtml}</div>
      ` : ""}

      ${goalsMensais.length > 0 ? `
        <h3 class="checkin-subtitulo">Metas mensais</h3>
        <p class="placeholder-text-small">Tens o mês todo para as cumprir — só apertam no fim, se ainda faltarem dias.</p>
        <div class="checkin-lista">${itensMensaisHtml}</div>
      ` : ""}
    </div>
  `;
}

/* ===== Ecrã: Feedback (semanal / mensal) ===== */
let feedbackTabAtiva = "semana";

function renderFeedback() {
  if (feedbackTabAtiva === "semana") renderFeedbackSemanal();
  else renderFeedbackMensal();
}

function renderFeedbackTabs() {
  return `
    <div class="feedback-tabs">
      <button class="tab-btn ${feedbackTabAtiva === "semana" ? "active" : ""}" data-tab="semana">Semana</button>
      <button class="tab-btn ${feedbackTabAtiva === "mes" ? "active" : ""}" data-tab="mes">Mês</button>
    </div>
  `;
}

function ligarTabs() {
  appContent.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      feedbackTabAtiva = btn.dataset.tab;
      renderFeedback();
    });
  });
}

// Limiares (em dias) usados por obterNivelFogo() em storage.js — repetidos
// aqui só para desenhar a faixa de níveis. Se um dia mudares os limiares lá,
// muda também esta lista para os dois ficarem alinhados.
const LIMIARES_NIVEL = [0, 1, 10, 30, 60, 100];

// Cabeçalho comum às duas tabs: grelha de estatísticas + faixa de níveis.
function renderStatGridENiveis(streakAtual, streakRecorde, monthPct) {
  const nivel = obterNivelFogo(streakAtual);

  const statGridHtml = `
    <div class="stat-grid">
      <div class="stat-box"><p class="stat-valor">${streakAtual} 🔥</p><p class="stat-label">DIAS DE STREAK</p></div>
      <div class="stat-box"><p class="stat-valor">${streakRecorde} 🔥</p><p class="stat-label">MELHOR STREAK</p></div>
      <div class="stat-box"><p class="stat-valor">${monthPct}%</p><p class="stat-label">DIAS COMPLETOS (MÊS)</p></div>
      <div class="stat-box"><p class="stat-valor">${nivel.icone}</p><p class="stat-label">NÍVEL: ${nivel.nome.toUpperCase()}</p></div>
    </div>`;

  const levelStripHtml = `
    <div class="level-strip">
      ${LIMIARES_NIVEL.map((limiar) => {
        const chip = obterNivelFogo(limiar);
        const reached = streakAtual >= limiar;
        const current = nivel.nome === chip.nome;
        return `<div class="level-chip ${reached ? "reached" : ""} ${current ? "current" : ""}">${chip.icone} ${chip.nome}</div>`;
      }).join("")}
    </div>`;

  return statGridHtml + levelStripHtml;
}

function renderFeedbackSemanal() {
  const r = calcularResumoSemanal();
  const rMensal = calcularResumoMensal();

  // Últimas 6 semanas, mais recente à direita. Cada chip mostra quantos dias
  // dessa semana ficaram completos — mais útil agora que o streak é diário.
  let semana = obterInicioDaSemanaISO();
  const semanas = [];
  for (let i = 0; i < 6; i++) {
    semanas.unshift(semana);
    semana = obterSemanaAnteriorISO(semana);
  }
  const weeksRowHtml = semanas
    .map((s) => {
      const res = calcularResumoDaSemana(s);
      const [, mes, dia] = s.split("-");
      const perfeita = res.diasComGoals > 0 && res.diasCompletos === res.diasComGoals;
      const texto = res.diasComGoals > 0 ? `${res.diasCompletos}/${res.diasComGoals}` : "—";
      return `<div class="week-chip ${perfeita ? "ok" : ""}">${perfeita ? "🔥" : texto}<br>${parseInt(dia, 10)}/${parseInt(mes, 10)}</div>`;
    })
    .join("");

  appContent.innerHTML = `
    <div class="view-feedback">
      <h2 class="view-titulo">Feedback</h2>
      ${renderFeedbackTabs()}
      ${renderStatGridENiveis(r.streakAtual, r.streakRecorde, rMensal.taxa)}
      <h3 class="ajustes-secao-titulo" style="margin:0 0 10px;">Últimas 6 semanas</h3>
      <div class="weeks-row">${weeksRowHtml}</div>
      <div class="tip-card">
        <p class="tip-titulo">🔥 Como funciona o streak</p>
        <ul>
          <li>Ganhas um fogo por cada dia em que cumpres tudo o que era obrigatório nesse dia.</li>
          <li>Os goals <b>semanais</b> e <b>mensais</b> não te obrigam a nada enquanto tiveres folga no prazo — só entram no dia quando os dias que faltam já não chegam para a meta.</li>
          <li>Falhar um dia volta a pôr o streak a zero, mas o teu recorde fica sempre guardado.</li>
        </ul>
      </div>
    </div>
  `;
  ligarTabs();
}

function renderFeedbackMensal() {
  const r = calcularResumoMensal();
  const streak = calcularResumoSemanal(); // o streak é sempre o atual, não depende do mês em vista

  appContent.innerHTML = `
    <div class="view-feedback">
      <h2 class="view-titulo">Feedback</h2>
      ${renderFeedbackTabs()}
      ${renderStatGridENiveis(streak.streakAtual, streak.streakRecorde, r.taxa)}
      <h3 class="ajustes-secao-titulo" style="margin:0 0 10px;">📅 Feedback mensal</h3>
      <div class="feedback-card">
        <p class="feedback-linha-titulo">Resumo de ${formatarMes(r.mesISO)}</p>
        <p class="feedback-numero">${r.diasCompletos}<span class="feedback-numero-total">/${r.totalDias}</span></p>
        <p class="feedback-legenda">dias 100% cumpridos — ${r.taxa}%</p>
      </div>
      <div class="tip-card">
        <p class="tip-titulo">✨ Sugestões para o próximo mês</p>
        <ul>
          <li>${escapeHtml(r.sugestao)}</li>
        </ul>
      </div>
    </div>
  `;
  ligarTabs();
}

/* ===== Ecrã: Ajustes (aparência) ===== */

// O iOS só mostra o popup nativo de notificações se requestPermission() for
// chamado dentro de um toque do utilizador — por isso já não se pede sozinho
// ao abrir a app (etapa 18); este botão é o único sítio onde se pede.
function htmlEstadoNotificacoes() {
  if (!("Notification" in window)) {
    return `<p class="placeholder-text-small">Este browser não suporta notificações.</p>`;
  }
  if (Notification.permission === "granted") {
    return `<p class="notif-status notif-ok">✅ Notificações ativadas.</p>`;
  }
  if (Notification.permission === "denied") {
    return `<p class="notif-status notif-bloqueado">❌ Notificações bloqueadas. Ativa-as em Definições do iPhone → Notificações → GO FOR IT.</p>`;
  }
  return `<button class="btn-primary" id="btn-ativar-notificacoes">🔔 Ativar notificações</button>`;
}

function renderAjustes() {
  const ajustes = obterAjustes();

  const fontesHtml = Object.entries(FONTES)
    .map(
      ([chave, f]) => `
        <div class="opcao-card ${ajustes.fonte === chave ? "active" : ""}" data-valor="${chave}">
          <span class="opcao-preview" style="font-family:${f.familia}">Aa</span>
          <span class="opcao-label">${f.label}</span>
        </div>`
    )
    .join("");

  const acentosHtml = Object.entries(ACENTOS)
    .map(
      ([chave, a]) => `
        <div class="opcao-card ${ajustes.acento === chave ? "active" : ""}" data-valor="${chave}">
          <span class="opcao-ponto" style="background:linear-gradient(135deg, ${a.destaque}, ${a.destaque2})"></span>
          <span class="opcao-label">${a.label}</span>
        </div>`
    )
    .join("");

  const escalaHtml = ESCALAS.map(
    (e) => `<button class="escala-btn ${ajustes.escala === e.valor ? "active" : ""}" data-escala="${e.valor}">${e.label}</button>`
  ).join("");

  appContent.innerHTML = `
    <div class="view-ajustes">
      <h2 class="view-titulo">Ajustes</h2>
      <p class="placeholder-text-small">Personaliza o visual da app ao teu gosto — guarda-se só neste telemóvel.</p>

      <h3 class="ajustes-secao-titulo">🔔 Notificações</h3>
      <div class="notif-secao">${htmlEstadoNotificacoes()}</div>

      <h3 class="ajustes-secao-titulo">Tipo de letra</h3>
      <div class="opcao-grid" id="opcoes-fonte">${fontesHtml}</div>

      <h3 class="ajustes-secao-titulo">Cor de destaque</h3>
      <div class="opcao-grid" id="opcoes-acento">${acentosHtml}</div>

      <h3 class="ajustes-secao-titulo">Tamanho do texto</h3>
      <div class="escala-row" id="opcoes-escala">${escalaHtml}</div>
    </div>
  `;

  // As três secções seguem o mesmo padrão: ler os ajustes atuais, mudar o
  // campo certo, guardar, aplicar às variáveis CSS, e voltar a desenhar o
  // ecrã (para o "active" saltar para a opção nova).
  appContent.querySelectorAll("#opcoes-fonte .opcao-card").forEach((el) => {
    el.addEventListener("click", () => {
      const a = obterAjustes();
      a.fonte = el.dataset.valor;
      guardarAjustes(a);
      aplicarAjustes(a);
      renderAjustes();
    });
  });

  appContent.querySelectorAll("#opcoes-acento .opcao-card").forEach((el) => {
    el.addEventListener("click", () => {
      const a = obterAjustes();
      a.acento = el.dataset.valor;
      guardarAjustes(a);
      aplicarAjustes(a);
      renderAjustes();
      atualizarStreakBadge(); // o badge no cabeçalho também usa a cor de destaque
    });
  });

  appContent.querySelectorAll("#opcoes-escala .escala-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const a = obterAjustes();
      a.escala = Number(btn.dataset.escala);
      guardarAjustes(a);
      aplicarAjustes(a);
      renderAjustes();
    });
  });

  const btnNotif = appContent.querySelector("#btn-ativar-notificacoes");
  if (btnNotif) {
    btnNotif.addEventListener("click", () => {
      // Está dentro do "click" do botão — é isto que o iOS exige para mostrar
      // o popup nativo de permissão (chamar sozinho ao abrir a app não funciona).
      Notification.requestPermission().then((permissao) => {
        if (permissao === "granted") subscreverNotificacoesPush();
        renderAjustes(); // redesenha para mostrar o novo estado (✅ ou ❌)
      });
    });
  }
}

/* ===== Navegação ===== */
function mudarView(view) {
  document.querySelectorAll(".nav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });

  if (view === "calendario") renderCalendario();
  else if (view === "goals") renderGoals();
  else if (view === "checkin") renderCheckin();
  else if (view === "feedback") renderFeedback();
  else if (view === "ajustes") renderAjustes();
}

/* ===== Utilitários ===== */
function escapeHtml(texto) {
  const div = document.createElement("div");
  div.textContent = texto;
  return div.innerHTML;
}

function formatarMes(mesISO) {
  const [ano, mes] = mesISO.split("-");
  const nomes = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
  return `${nomes[parseInt(mes, 10) - 1]} ${ano}`;
}

/* ===== Arranque ===== */
function iniciarApp() {
  // Antes de tudo: se este é o primeiro acesso a um mês novo, transporta os
  // goals "diario" do mês anterior sozinhos (semanais/mensais continuam a
  // precisar de ser redefinidos manualmente).
  garantirGoalsDoMesInicializados(obterMesAtualISO());

  aplicarAjustes(obterAjustes());
  atualizarStreak();
  atualizarStreakBadge();
  renderCalendario();

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => mudarView(btn.dataset.view));
  });

  if ("Notification" in window && Notification.permission === "granted") {
    // Permissão já dada em sessões anteriores — garante que a subscrição
    // no servidor continua válida (ex: se apagaste o subscritores.json).
    // O pedido de permissão em si já não se faz aqui: o iOS só mostra o
    // popup nativo quando requestPermission() é chamado dentro de um toque
    // do utilizador, por isso passou a viver só no botão do ecrã de Ajustes.
    subscreverNotificacoesPush();
    sincronizarEstadoComServidor(); // mantém o resumo no servidor fresco a cada abertura
  }
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("service-worker.js").catch((erro) => {
      console.log("Service worker não registado:", erro);
    });
  });
}

document.addEventListener("DOMContentLoaded", iniciarApp);
