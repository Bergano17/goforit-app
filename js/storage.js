/**
 * storage.js
 * -----------
 * Camada de acesso aos dados guardados no telemóvel (localStorage).
 * Tudo fica só no dispositivo — sem servidor, sem login.
 *
 * Cada goal tem um TIPO, que muda como é acompanhado:
 * - "diario"  → marca-se todos os dias (ex: beber 2L de água)
 * - "mensal"  → marca-se todos os dias, mas a meta é X em ~30 dias (ex: sem doces 20/30 dias)
 * - "semanal" → não se marca dia a dia; responde-se Sim/Não uma vez por semana
 *               no Check-in (ex: correr 2x por semana)
 *
 * Estrutura dos dados:
 *
 * {
 *   "goals": {
 *     "2026-07": [
 *       { "nome": "Beber 2L de água", "tipo": "diario", "meta": null },
 *       { "nome": "Correr", "tipo": "semanal", "meta": 2 },
 *       { "nome": "Não comer doces", "tipo": "mensal", "meta": 20 }
 *     ]
 *   },
 *   "checklist": {
 *     "2026-07-22": { "Beber 2L de água": true, "Não comer doces": false }
 *   },
 *   "checkins": {
 *     "2026-07-20": { "Correr": true }   // chave = segunda-feira dessa semana
 *   },
 *   "streak": {
 *     "atual": 0,                  // semanas seguidas com tudo cumprido
 *     "recorde": 0,
 *     "ultimaSemanaCompleta": null
 *   }
 * }
 */

const STORAGE_KEY = "goforit-data";

function carregarDados() {
  const bruto = localStorage.getItem(STORAGE_KEY);

  if (!bruto) {
    return {
      goals: {},
      checklist: {},
      checkins: {},
      streak: { atual: 0, recorde: 0, ultimaSemanaCompleta: null },
    };
  }

  const dados = JSON.parse(bruto);

  // ---- Migrações para dados de versões anteriores da app ----
  if (!dados.checkins) dados.checkins = {};
  if (!dados.streak) dados.streak = { atual: 0, recorde: 0, ultimaSemanaCompleta: null };
  if (dados.streak.ultimaDataCompleta !== undefined) {
    // O streak era diário; passa a ser semanal, mantém só o recorde antigo.
    dados.streak = { atual: 0, recorde: dados.streak.recorde || 0, ultimaSemanaCompleta: null };
  }
  Object.keys(dados.goals || {}).forEach((mes) => {
    dados.goals[mes] = (dados.goals[mes] || []).map((g) =>
      typeof g === "string" ? { nome: g, tipo: "diario", meta: null } : g
    );
  });

  return dados;
}

function guardarDados(dados) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(dados));
}

/* ===== Ajustes de aparência (fonte, cor de destaque, tamanho do texto) =====
 * Guardados à parte dos dados de goals — não fazem parte do "progresso",
 * só de como a app se mostra neste telemóvel. Vieram do protótipo
 * go-for-it-app_7.html, agora ligados a sério à app real. */
const AJUSTES_KEY = "goforit-ajustes";

function obterAjustes() {
  const bruto = localStorage.getItem(AJUSTES_KEY);
  if (!bruto) return { fonte: "classica", acento: "ignicao", escala: 1 };
  return JSON.parse(bruto);
}

function guardarAjustes(ajustes) {
  localStorage.setItem(AJUSTES_KEY, JSON.stringify(ajustes));
}

/* ===== Datas ===== */

function paraISO(dataObj) {
  const ano = dataObj.getFullYear();
  const mes = String(dataObj.getMonth() + 1).padStart(2, "0");
  const dia = String(dataObj.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

function obterDataHojeISO() {
  return paraISO(new Date());
}

function obterMesAtualISO() {
  return obterDataHojeISO().slice(0, 7);
}

function obterDiasDoIntervalo(inicioISO, fimISO) {
  const dias = [];
  const atual = new Date(inicioISO + "T00:00:00");
  const fim = new Date(fimISO + "T00:00:00");
  while (atual <= fim) {
    dias.push(paraISO(atual));
    atual.setDate(atual.getDate() + 1);
  }
  return dias;
}

// Segunda-feira é o 1º dia da semana. Devolve a data ISO dessa segunda-feira.
function obterInicioDaSemanaISO(dataISO = obterDataHojeISO()) {
  const data = new Date(dataISO + "T00:00:00");
  const diaSemana = data.getDay(); // 0=domingo..6=sábado
  const deslocamento = diaSemana === 0 ? 6 : diaSemana - 1;
  data.setDate(data.getDate() - deslocamento);
  return paraISO(data);
}

function obterSemanaAnteriorISO(segundaISO) {
  const data = new Date(segundaISO + "T00:00:00");
  data.setDate(data.getDate() - 7);
  return paraISO(data);
}

function obterFimDaSemanaISO(segundaISO) {
  const data = new Date(segundaISO + "T00:00:00");
  data.setDate(data.getDate() + 6);
  return paraISO(data);
}

function ultimoDiaDoMesISO(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  return paraISO(new Date(ano, mes, 0));
}

function totalDiasNoMes(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  return new Date(ano, mes, 0).getDate();
}

function mesAnteriorISO(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const data = new Date(ano, mes - 2, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function mesSeguinteISO(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const data = new Date(ano, mes, 1);
  return `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}`;
}

function formatarDataLonga(dataISO) {
  const [ano, mes, dia] = dataISO.split("-");
  const nomesMeses = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${parseInt(dia, 10)} de ${nomesMeses[parseInt(mes, 10) - 1]} de ${ano}`;
}

/* ===== Goals ===== */

function obterGoalsDoMes(mesISO = obterMesAtualISO()) {
  const dados = carregarDados();
  return dados.goals[mesISO] || [];
}

function obterGoalsPorTipo(mesISO, tipo) {
  return obterGoalsDoMes(mesISO).filter((g) => g.tipo === tipo);
}

// Goals que se marcam dia a dia no calendário (diário + mensal) — conta para o ✅/❌ do dia.
function obterGoalsDiariosDoDia(dataISO) {
  return obterGoalsDoMes(dataISO.slice(0, 7)).filter((g) => g.tipo === "diario" || g.tipo === "mensal");
}

// Quantas vezes um goal "semanal" já foi registado esta semana (conta os ticks no checklist diário).
function contarOcorrenciasSemana(nomeGoal, segundaISO = obterInicioDaSemanaISO()) {
  const hoje = obterDataHojeISO();
  const fimSemana = obterFimDaSemanaISO(segundaISO);
  const fim = fimSemana > hoje ? hoje : fimSemana;
  const dias = obterDiasDoIntervalo(segundaISO, fim);
  return dias.filter((d) => obterChecklistDoDia(d)[nomeGoal] === true).length;
}

// Goals a mostrar no cartão do dia: diário + mensal (sempre) + semanal (só enquanto
// não atingir a meta dessa semana — depois some da lista, já está "despachado").
function obterGoalsParaMostrarNoDia(dataISO) {
  const segundaDaSemana = obterInicioDaSemanaISO(dataISO);
  return obterGoalsDoMes(dataISO.slice(0, 7)).filter((g) => {
    if (g.tipo === "diario" || g.tipo === "mensal") return true;
    if (g.tipo === "semanal") return contarOcorrenciasSemana(g.nome, segundaDaSemana) < g.meta;
    return false;
  });
}

function adicionarGoal(nome, tipo = "diario", meta = null, mesISO = obterMesAtualISO()) {
  const dados = carregarDados();
  if (!dados.goals[mesISO]) dados.goals[mesISO] = [];
  const nomeLimpo = nome.trim();
  if (!nomeLimpo) return;
  if (dados.goals[mesISO].some((g) => g.nome === nomeLimpo)) return;

  dados.goals[mesISO].push({
    nome: nomeLimpo,
    tipo,
    meta: tipo === "diario" ? null : Math.max(1, Number(meta) || 1),
  });
  guardarDados(dados);
}

function removerGoal(nome, mesISO = obterMesAtualISO()) {
  const dados = carregarDados();
  if (!dados.goals[mesISO]) return;
  dados.goals[mesISO] = dados.goals[mesISO].filter((g) => g.nome !== nome);
  guardarDados(dados);
}

/* ===== Checklist diária (goals "diario" + "mensal") ===== */

function obterChecklistDoDia(dataISO = obterDataHojeISO()) {
  const dados = carregarDados();
  return dados.checklist[dataISO] || {};
}

// Marca/desmarca um goal nesse dia. Devolve true se o novo valor ganhou um fogo semanal.
function alternarGoalNoDia(nomeGoal, dataISO = obterDataHojeISO()) {
  const dados = carregarDados();
  if (!dados.checklist[dataISO]) dados.checklist[dataISO] = {};
  dados.checklist[dataISO][nomeGoal] = !dados.checklist[dataISO][nomeGoal];
  guardarDados(dados);

  const segundaDaSemana = obterInicioDaSemanaISO(dataISO);

  // Se for um goal semanal e a meta já foi atingida, confirma o check-in sozinho —
  // já não é preciso ir ao ecrã de Check-in para "Sim".
  const goal = obterGoalsDoMes(dataISO.slice(0, 7)).find((g) => g.nome === nomeGoal);
  if (goal && goal.tipo === "semanal") {
    const contagem = contarOcorrenciasSemana(nomeGoal, segundaDaSemana);
    if (contagem >= goal.meta) {
      responderCheckin(nomeGoal, true, segundaDaSemana);
    }
  }

  return registarStreakSemanalSeCompleto(segundaDaSemana);
}

function checklistCompletaNoDia(dataISO) {
  const goalsDoDia = obterGoalsDiariosDoDia(dataISO);
  if (goalsDoDia.length === 0) return false;
  const checklist = obterChecklistDoDia(dataISO);
  return goalsDoDia.every((g) => checklist[g.nome] === true);
}

function obterEstadoDoDia(dataISO) {
  const hoje = obterDataHojeISO();
  if (dataISO > hoje) return "futuro";
  const goalsDoDia = obterGoalsDiariosDoDia(dataISO);
  if (goalsDoDia.length === 0) return "sem-goals";
  return checklistCompletaNoDia(dataISO) ? "completo" : "incompleto";
}

// Quantos dias, desde o início do mês, este goal "mensal" já foi cumprido.
function calcularProgressoMensal(nomeGoal, mesISO = obterMesAtualISO()) {
  const hoje = obterDataHojeISO();
  const fim = mesISO === obterMesAtualISO() ? hoje : ultimoDiaDoMesISO(mesISO);
  const dias = obterDiasDoIntervalo(`${mesISO}-01`, fim);
  let cumpridos = 0;
  dias.forEach((dia) => {
    if (obterChecklistDoDia(dia)[nomeGoal] === true) cumpridos++;
  });
  return cumpridos;
}

/* ===== Check-in semanal (goals "semanal") ===== */

function obterCheckinSemana(segundaISO = obterInicioDaSemanaISO()) {
  const dados = carregarDados();
  return dados.checkins[segundaISO] || {};
}

// Devolve true se ganhou um fogo novo com esta resposta.
function responderCheckin(nomeGoal, valor, segundaISO = obterInicioDaSemanaISO()) {
  const dados = carregarDados();
  if (!dados.checkins[segundaISO]) dados.checkins[segundaISO] = {};
  dados.checkins[segundaISO][nomeGoal] = valor;
  guardarDados(dados);

  return registarStreakSemanalSeCompleto(segundaISO);
}

function metasSemanaisCumpridas(segundaISO) {
  const goalsSemanais = obterGoalsPorTipo(segundaISO.slice(0, 7), "semanal");
  if (goalsSemanais.length === 0) return true;
  const respostas = obterCheckinSemana(segundaISO);
  return goalsSemanais.every((g) => respostas[g.nome] === true);
}

function questionarioPendente(segundaISO = obterInicioDaSemanaISO()) {
  const goalsSemanais = obterGoalsPorTipo(segundaISO.slice(0, 7), "semanal");
  if (goalsSemanais.length === 0) return false;
  const respostas = obterCheckinSemana(segundaISO);
  return goalsSemanais.some((g) => respostas[g.nome] === undefined);
}

// Todos os dias da semana (seg até hoje/domingo) tiveram a checklist diária 100% cumprida?
function semanaComDiasCompletos(segundaISO) {
  const hoje = obterDataHojeISO();
  const fimSemana = obterFimDaSemanaISO(segundaISO);
  const fim = fimSemana > hoje ? hoje : fimSemana;
  const dias = obterDiasDoIntervalo(segundaISO, fim);
  const diasComGoals = dias.filter((d) => obterGoalsDiariosDoDia(d).length > 0);
  if (diasComGoals.length === 0) return true; // sem goals diários definidos, não penaliza
  return diasComGoals.every((d) => checklistCompletaNoDia(d));
}

// O fogo da semana só conta se o questionário foi respondido — como pedido.
function semanaCompleta(segundaISO) {
  if (questionarioPendente(segundaISO)) return false;
  return metasSemanaisCumpridas(segundaISO) && semanaComDiasCompletos(segundaISO);
}

/* ===== Streak / Fogos (agora por semana) ===== */

function atualizarStreakSeNecessario() {
  const dados = carregarDados();
  const semanaAtual = obterInicioDaSemanaISO();
  const semanaAnterior = obterSemanaAnteriorISO(semanaAtual);
  const { ultimaSemanaCompleta } = dados.streak;

  if (ultimaSemanaCompleta && ultimaSemanaCompleta !== semanaAtual && ultimaSemanaCompleta !== semanaAnterior) {
    dados.streak.atual = 0;
    guardarDados(dados);
  }
}

// Reavalia a semana indicada e ajusta o streak. Devolve true se ganhou um fogo novo agora.
function registarStreakSemanalSeCompleto(segundaISO) {
  const dados = carregarDados();
  const completa = semanaCompleta(segundaISO);

  if (completa && dados.streak.ultimaSemanaCompleta !== segundaISO) {
    dados.streak.atual += 1;
    dados.streak.ultimaSemanaCompleta = segundaISO;
    if (dados.streak.atual > dados.streak.recorde) dados.streak.recorde = dados.streak.atual;
    guardarDados(dados);
    return true;
  }

  if (!completa && dados.streak.ultimaSemanaCompleta === segundaISO) {
    dados.streak.atual = Math.max(0, dados.streak.atual - 1);
    dados.streak.ultimaSemanaCompleta = null;
    guardarDados(dados);
  }

  return false;
}

// Resolve sozinho o check-in de semanas já terminadas que ficaram por responder:
// se a meta foi atingida conta como cumprido, senão como não cumprido.
// Chamado no arranque da app — assim nunca fica nada pendente de semanas antigas.
function resolverSemanasPassadas() {
  let semana = obterSemanaAnteriorISO(obterInicioDaSemanaISO());

  for (let i = 0; i < 12; i++) {
    const goalsSemanais = obterGoalsPorTipo(semana.slice(0, 7), "semanal");
    if (goalsSemanais.length === 0) break;

    const respostas = obterCheckinSemana(semana);
    let havaPendentes = false;

    goalsSemanais.forEach((g) => {
      if (respostas[g.nome] === undefined) {
        havaPendentes = true;
        const contagem = contarOcorrenciasSemana(g.nome, semana);
        responderCheckin(g.nome, contagem >= g.meta, semana);
      }
    });

    if (!havaPendentes) break; // esta semana já estava toda resolvida, não vale a pena ir mais atrás
    semana = obterSemanaAnteriorISO(semana);
  }
}

// "classe" é o nome da classe CSS usada no badge do cabeçalho (ver style.css)
// para dar mais brilho/movimento a cada nível — quanto mais alto o nível,
// mais "vivo" o badge fica, só de olhar, sem precisar de ler o número.
function obterNivelFogo(streakAtual) {
  if (streakAtual >= 30) return { icone: "🔥🔥🔥🔥🔥", nome: "Lendário", classe: "nivel-lendario" };
  if (streakAtual >= 14) return { icone: "🔥🔥🔥🔥", nome: "Incêndio", classe: "nivel-incendio" };
  if (streakAtual >= 7) return { icone: "🔥🔥🔥", nome: "Fogueira", classe: "nivel-fogueira" };
  if (streakAtual >= 3) return { icone: "🔥🔥", nome: "Chama", classe: "nivel-chama" };
  if (streakAtual >= 1) return { icone: "🔥", nome: "Faísca", classe: "nivel-faisca" };
  return { icone: "💨", nome: "Sem streak", classe: "nivel-nenhum" };
}

/* ===== Feedback semanal / mensal ===== */

function calcularResumoSemanal() {
  const segundaISO = obterInicioDaSemanaISO();
  const hoje = obterDataHojeISO();
  const dias = obterDiasDoIntervalo(segundaISO, hoje);

  let diasCompletos = 0;
  let diasComGoals = 0;
  dias.forEach((dia) => {
    if (obterGoalsDiariosDoDia(dia).length > 0) {
      diasComGoals++;
      if (checklistCompletaNoDia(dia)) diasCompletos++;
    }
  });

  const taxa = diasComGoals > 0 ? Math.round((diasCompletos / diasComGoals) * 100) : 0;
  const dados = carregarDados();

  return {
    inicioSemana: segundaISO,
    fim: hoje,
    diasCompletos,
    diasComGoals,
    taxa,
    streakAtual: dados.streak.atual,
    streakRecorde: dados.streak.recorde,
    questionarioPendente: questionarioPendente(segundaISO),
  };
}

function calcularResumoMensal(mesISO = obterMesAtualISO()) {
  const hoje = obterDataHojeISO();
  const inicioMes = `${mesISO}-01`;
  const fimIntervalo = mesISO === obterMesAtualISO() ? hoje : ultimoDiaDoMesISO(mesISO);
  const dias = obterDiasDoIntervalo(inicioMes, fimIntervalo);
  const goals = obterGoalsDoMes(mesISO);
  const goalsDiariosMensais = goals.filter((g) => g.tipo === "diario" || g.tipo === "mensal");

  let diasCompletos = 0;
  dias.forEach((dia) => {
    if (checklistCompletaNoDia(dia)) diasCompletos++;
  });

  const taxa = goalsDiariosMensais.length > 0 ? Math.round((diasCompletos / dias.length) * 100) : 0;

  let sugestao;
  if (goals.length === 0) {
    sugestao = "Ainda não definiste goals este mês.";
  } else if (taxa >= 80) {
    sugestao = "Excelente mês! Considera adicionar mais um goal para te desafiares.";
  } else if (taxa >= 50) {
    sugestao = "Bom progresso. Vê que dias falhas mais e porquê — talvez precises de ajustar horários.";
  } else {
    sugestao = "Mês difícil. Considera reduzir o número de goals para algo mais realista no próximo mês.";
  }

  return { mesISO, diasCompletos, totalDias: dias.length, taxa, goals, sugestao };
}

/* ===== Grelha de calendário ===== */

function gerarGradeDoMes(mesISO) {
  const [ano, mes] = mesISO.split("-").map(Number);
  const primeiroDia = new Date(ano, mes - 1, 1);
  const totalDiasNoMesAtual = totalDiasNoMes(mesISO);

  const diaSemanaPrimeiro = primeiroDia.getDay();
  const espacosAntes = diaSemanaPrimeiro === 0 ? 6 : diaSemanaPrimeiro - 1;

  const celulas = [];
  for (let i = 0; i < espacosAntes; i++) celulas.push(null);
  for (let dia = 1; dia <= totalDiasNoMesAtual; dia++) {
    celulas.push({ dataISO: `${mesISO}-${String(dia).padStart(2, "0")}`, dia });
  }
  while (celulas.length % 7 !== 0) celulas.push(null);

  const semanas = [];
  for (let i = 0; i < celulas.length; i += 7) {
    semanas.push(celulas.slice(i, i + 7));
  }
  return semanas;
}
