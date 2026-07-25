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
  } catch (erro) {
    // Não bloqueia a app se o servidor ainda não estiver a correr/deployado.
    console.log("Não foi possível subscrever notificações push:", erro.message);
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
  const editavel = dataISO <= obterDataHojeISO();

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
      let sub = "";
      if (goal.tipo === "semanal") {
        const contagem = contarOcorrenciasSemana(goal.nome, segundaDaSemana);
        sub = `${Math.min(contagem, goal.meta)}/${goal.meta}x esta semana`;
      } else if (goal.tipo === "mensal") {
        const progresso = calcularProgressoMensal(goal.nome, dataISO.slice(0, 7));
        sub = `${Math.min(progresso, goal.meta)}/${goal.meta} dias este mês`;
      }
      const animar = goal.nome === ultimoGoalTocado ? "anim-marcado" : "";

      // O ✓ está sempre no HTML — é a CSS (cor transparente vs. branca) que o
      // esconde ou mostra consoante o item está cumprido ou não.
      return `
        <li class="goal-item ${cumprido ? "cumprido" : ""} ${editavel ? "" : "goal-desativado"} ${animar}" data-goal="${escapeHtml(goal.nome)}">
          <span class="goal-check">✓</span>
          <span class="goal-texto">
            ${escapeHtml(goal.nome)}<span class="goal-badge ${goal.tipo}">${NOMES_TIPO[goal.tipo]}</span>
            ${sub ? `<span class="goal-etiqueta">${sub}</span>` : ""}
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
      ${!editavel ? '<p class="placeholder-text-small">Este dia ainda não chegou.</p>' : ""}
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

      if (agoraCumprido && goal.tipo !== "semanal" && checklistCompletaNoDia(diaSelecionadoISO)) {
        celebrar("🎉 Dia completo! Continua assim.");
      }

      if (agoraCumprido && goal.tipo === "semanal") {
        const segunda = obterInicioDaSemanaISO(diaSelecionadoISO);
        const contagem = contarOcorrenciasSemana(nomeGoal, segunda);
        if (contagem >= goal.meta) {
          celebrar(`🎉 Atingiste a meta semanal de "${nomeGoal}"!`);
        }
      }

      if (agoraCumprido && goal.tipo === "mensal") {
        const progresso = calcularProgressoMensal(nomeGoal, diaSelecionadoISO.slice(0, 7));
        if (progresso === goal.meta) {
          celebrar(`🎉 Atingiste a meta mensal de "${nomeGoal}"!`);
        }
      }

      if (ganhouFogo) {
        celebrar("🔥 Ganhaste um fogo esta semana!");
        comemorarBadge();
      }

      renderCalendario();
    });
  });
}

/* ===== Ecrã: Goals do mês ===== */
const LIMITE_GOALS = 6;
// Estado do formulário de "novo goal" — vive fora do render porque o utilizador
// pode trocar de tipo/quantidade várias vezes antes de submeter.
let novoGoalTipo = "diario";
let novoGoalMeta = 3;

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
        const contagem = contarOcorrenciasSemana(goal.nome);
        sub = `${Math.min(contagem, goal.meta)}/${goal.meta}x esta semana${contagem >= goal.meta ? " ✅" : ""}`;
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
        <input type="text" id="input-novo-goal" placeholder="Ex: Beber 2L de água" maxlength="60" />
        <div class="freq-row">${freqBtnsHtml}</div>
        <div id="qty-row-wrap">${qtyRowHtml}</div>
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
    document.querySelectorAll(".freq-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        novoGoalTipo = btn.dataset.tipo;
        novoGoalMeta = novoGoalTipo === "semanal" ? 3 : Math.min(20, metaMaxima(novoGoalTipo, mesISO));
        renderGoals();
      });
    });

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
      const input = document.getElementById("input-novo-goal");
      if (!input.value.trim()) return;

      const meta = novoGoalTipo === "diario" ? null : novoGoalMeta;
      adicionarGoal(input.value, novoGoalTipo, meta, mesISO);
      novoGoalTipo = "diario";
      novoGoalMeta = 3;
      renderGoals();
    });
  }

  appContent.querySelectorAll(".goal-card-remove").forEach((btn) => {
    btn.addEventListener("click", () => {
      removerGoal(btn.dataset.goal, mesISO);
      renderGoals();
    });
  });
}

/* ===== Ecrã: Check-in (goals semanais + progresso dos mensais) ===== */
function renderCheckin() {
  const segundaISO = obterInicioDaSemanaISO();
  const mesISO = segundaISO.slice(0, 7);
  const goalsSemanais = obterGoalsPorTipo(mesISO, "semanal");
  const goalsMensais = obterGoalsPorTipo(mesISO, "mensal");
  const respostas = obterCheckinSemana(segundaISO);

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

  const itensSemanaisHtml = goalsSemanais
    .map((goal) => {
      const resposta = respostas[goal.nome]; // true / false / undefined
      const contagem = contarOcorrenciasSemana(goal.nome, segundaISO);

      let statusClasse = "pending";
      let statusTexto = "A decorrer";
      if (resposta === true) {
        statusClasse = "ok";
        statusTexto = "✅ Cumprido automaticamente";
      } else if (resposta === false) {
        statusClasse = "fail";
        statusTexto = "❌ Não foi desta vez";
      }

      return `
        <div class="checkin-item">
          <div class="checkin-row-top">
            <span class="checkin-nome">${escapeHtml(goal.nome)}</span>
            <span class="checkin-status ${statusClasse}">${statusTexto}</span>
          </div>
          <p class="checkin-sub">Registaste ${Math.min(contagem, goal.meta)}/${goal.meta} vezes esta semana</p>
          <div class="checkin-botoes">
            <button class="checkin-btn certo ${resposta === true ? "selecionado" : ""}" data-goal="${escapeHtml(goal.nome)}" data-valor="true">Corrigir p/ cumprido</button>
            <button class="checkin-btn errado ${resposta === false ? "selecionado" : ""}" data-goal="${escapeHtml(goal.nome)}" data-valor="false">Corrigir p/ não cumprido</button>
          </div>
        </div>
      `;
    })
    .join("");

  const itensMensaisHtml = goalsMensais
    .map((goal) => {
      const progresso = calcularProgressoMensal(goal.nome, mesISO);
      const percentagem = Math.min(100, Math.round((progresso / goal.meta) * 100));
      const atingiu = progresso >= goal.meta;

      return `
        <div class="checkin-item">
          <div class="checkin-row-top">
            <span class="checkin-nome">${escapeHtml(goal.nome)}</span>
            <span class="checkin-sub" style="margin-top:0;">${progresso}/${goal.meta} dias${atingiu ? " 🎉" : ""}</span>
          </div>
          <div class="checkin-progresso">
            <div class="checkin-progresso-barra" style="width: ${percentagem}%"></div>
          </div>
        </div>
      `;
    })
    .join("");

  appContent.innerHTML = `
    <div class="view-checkin">
      <h2 class="view-titulo">Check-in</h2>
      <p class="placeholder-text-small">${formatarDataLonga(segundaISO)} → ${formatarDataLonga(obterFimDaSemanaISO(segundaISO))}</p>

      ${goalsSemanais.length > 0 ? `
        <h3 class="checkin-subtitulo">Metas semanais</h3>
        <p class="placeholder-text-small">Confirmam-se sozinhas quando as atinges no calendário. Usa os botões só para corrigir.</p>
        <div class="checkin-lista">${itensSemanaisHtml}</div>
      ` : ""}

      ${goalsMensais.length > 0 ? `
        <h3 class="checkin-subtitulo">Metas mensais</h3>
        <p class="placeholder-text-small">Marcam-se todos os dias no calendário — aqui é só o progresso.</p>
        <div class="checkin-lista">${itensMensaisHtml}</div>
      ` : ""}
    </div>
  `;

  appContent.querySelectorAll(".checkin-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const valor = btn.dataset.valor === "true";
      const ganhouFogo = responderCheckin(btn.dataset.goal, valor, segundaISO);
      atualizarStreakBadge();

      if (valor) celebrar(`🎉 Parabéns por cumprires "${btn.dataset.goal}" esta semana!`);
      if (ganhouFogo) {
        celebrar("🔥 Ganhaste um fogo esta semana!");
        comemorarBadge();
      }

      renderCheckin();
    });
  });
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

// Limiares (em semanas) usados por obterNivelFogo() em storage.js — repetidos
// aqui só para desenhar a faixa de níveis. Se um dia mudares os limiares lá,
// muda também esta lista para os dois ficarem alinhados.
const LIMIARES_NIVEL = [0, 1, 3, 7, 14, 30];

// Cabeçalho comum às duas tabs: grelha de estatísticas + faixa de níveis.
function renderStatGridENiveis(streakAtual, streakRecorde, monthPct) {
  const nivel = obterNivelFogo(streakAtual);

  const statGridHtml = `
    <div class="stat-grid">
      <div class="stat-box"><p class="stat-valor">${streakAtual} 🔥</p><p class="stat-label">SEMANAS DE STREAK</p></div>
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
  const segundaAtual = obterInicioDaSemanaISO();
  const hoje = obterDataHojeISO();

  // Últimas 6 semanas, mais recente à direita — igual ao protótipo.
  let semana = segundaAtual;
  const semanas = [];
  for (let i = 0; i < 6; i++) {
    semanas.unshift(semana);
    semana = obterSemanaAnteriorISO(semana);
  }
  const weeksRowHtml = semanas
    .map((s) => {
      const terminada = obterFimDaSemanaISO(s) <= hoje;
      const completa = semanaCompleta(s);
      const [, mes, dia] = s.split("-");
      const icone = !terminada ? "🕓" : completa ? "🔥" : "✕";
      return `<div class="week-chip ${terminada && completa ? "ok" : ""}">${icone}<br>${parseInt(dia, 10)}/${parseInt(mes, 10)}</div>`;
    })
    .join("");

  appContent.innerHTML = `
    <div class="view-feedback">
      <h2 class="view-titulo">Feedback</h2>
      ${renderFeedbackTabs()}
      ${renderStatGridENiveis(r.streakAtual, r.streakRecorde, rMensal.taxa)}
      <h3 class="ajustes-secao-titulo" style="margin:0 0 10px;">Últimas 6 semanas</h3>
      <div class="weeks-row">${weeksRowHtml}</div>
      ${r.questionarioPendente ? '<p class="feedback-aviso">⚠️ Falta responder ao check-in semanal — o fogo só conta depois de responderes.</p>' : ""}
      <div class="tip-card">
        <p class="tip-titulo">📬 Como funciona o streak semanal</p>
        <ul>
          <li>Uma semana só conta se todos os dias com goals diárias/mensais ficarem 100% completos.</li>
          <li>E se todas as goals semanais atingirem a meta — isso confirma-se sozinho, vê o separador Check-in.</li>
        </ul>
      </div>
    </div>
  `;
  ligarTabs();
}

function renderFeedbackMensal() {
  const r = calcularResumoMensal();
  const streak = calcularResumoSemanal(); // streak é semanal, não depende do mês em vista

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
  aplicarAjustes(obterAjustes());
  resolverSemanasPassadas();
  atualizarStreakSeNecessario();
  atualizarStreakBadge();
  renderCalendario();

  document.querySelectorAll(".nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => mudarView(btn.dataset.view));
  });

  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission().then((permissao) => {
      if (permissao === "granted") subscreverNotificacoesPush();
    });
  } else if ("Notification" in window && Notification.permission === "granted") {
    // Permissão já dada em sessões anteriores — garante que a subscrição
    // no servidor continua válida (ex: se apagaste o subscritores.json).
    subscreverNotificacoesPush();
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
