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

/* ===== A REGRA CENTRAL: quando é que um goal é OBRIGATÓRIO num dia =====
 *
 * Cada tipo de goal é julgado no seu próprio prazo, nunca antes:
 * - "diario"  → obrigatório todos os dias.
 * - "semanal" → só passa a obrigatório quando já não há dias suficientes até
 *               domingo para ainda cumprires a meta.
 * - "mensal"  → o mesmo, mas com prazo até ao último dia do mês.
 *
 * É isto que resolve o problema do "17 dias em 30": nos primeiros dias tens
 * folga de sobra, por isso o goal não te obriga a nada e não parte o streak.
 * Só quando os dias que faltam forem exatamente os ticks que ainda precisas
 * é que ele entra na checklist obrigatória — e aí já o vias a chegar.
 */

function diaAnteriorISO(dataISO) {
  const data = new Date(dataISO + "T00:00:00");
  data.setDate(data.getDate() - 1);
  return paraISO(data);
}

// Ticks de um goal na semana/mês do dia indicado, contando SÓ os dias anteriores
// a esse dia (o próprio dia ainda está em aberto, não entra na conta da folga).
function ocorrenciasNaSemanaAntesDe(nomeGoal, dataISO) {
  const segunda = obterInicioDaSemanaISO(dataISO);
  if (dataISO <= segunda) return 0;
  return obterDiasDoIntervalo(segunda, diaAnteriorISO(dataISO)).filter(
    (d) => obterChecklistDoDia(d)[nomeGoal] === true
  ).length;
}

function ocorrenciasNoMesAntesDe(nomeGoal, dataISO) {
  const primeiro = `${dataISO.slice(0, 7)}-01`;
  if (dataISO <= primeiro) return 0;
  return obterDiasDoIntervalo(primeiro, diaAnteriorISO(dataISO)).filter(
    (d) => obterChecklistDoDia(d)[nomeGoal] === true
  ).length;
}

// Quantos dias faltam até ao fim do prazo, incluindo o próprio dia.
function diasAteFimDaSemana(dataISO) {
  return obterDiasDoIntervalo(dataISO, obterFimDaSemanaISO(obterInicioDaSemanaISO(dataISO))).length;
}

function diasAteFimDoMes(dataISO) {
  return obterDiasDoIntervalo(dataISO, ultimoDiaDoMesISO(dataISO.slice(0, 7))).length;
}

function goalObrigatorioNoDia(goal, dataISO) {
  if (goal.tipo === "diario") return true;

  if (goal.tipo === "semanal") {
    const falta = goal.meta - ocorrenciasNaSemanaAntesDe(goal.nome, dataISO);
    return falta > 0 && falta >= diasAteFimDaSemana(dataISO);
  }

  if (goal.tipo === "mensal") {
    const falta = goal.meta - ocorrenciasNoMesAntesDe(goal.nome, dataISO);
    return falta > 0 && falta >= diasAteFimDoMes(dataISO);
  }

  return false;
}

// Os goals que decidem se o dia fica ✅ ou ❌ (e portanto o streak).
function obterGoalsObrigatoriosNoDia(dataISO) {
  return obterGoalsDoMes(dataISO.slice(0, 7)).filter((g) => goalObrigatorioNoDia(g, dataISO));
}

// Quantas vezes um goal já foi registado nesta semana (até hoje).
function contarOcorrenciasSemana(nomeGoal, segundaISO = obterInicioDaSemanaISO()) {
  const hoje = obterDataHojeISO();
  const fimSemana = obterFimDaSemanaISO(segundaISO);
  const fim = fimSemana > hoje ? hoje : fimSemana;
  return obterDiasDoIntervalo(segundaISO, fim).filter(
    (d) => obterChecklistDoDia(d)[nomeGoal] === true
  ).length;
}

// Goals a mostrar no cartão do dia: diário e mensal aparecem sempre (para poderes
// marcar quando te der jeito); o semanal desaparece assim que a meta da semana
// estiver atingida — já está despachado. Exceção: se foi neste dia que o
// marcaste, continua à vista, senão desaparecia debaixo do dedo e não davas
// para o desmarcar se te tivesses enganado.
function obterGoalsParaMostrarNoDia(dataISO) {
  const segundaDaSemana = obterInicioDaSemanaISO(dataISO);
  const checklist = obterChecklistDoDia(dataISO);
  return obterGoalsDoMes(dataISO.slice(0, 7)).filter((g) => {
    if (g.tipo !== "semanal") return true;
    if (checklist[g.nome] === true) return true;
    return contarOcorrenciasSemana(g.nome, segundaDaSemana) < g.meta;
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

/* ===== Checklist diária ===== */

function obterChecklistDoDia(dataISO = obterDataHojeISO()) {
  const dados = carregarDados();
  return dados.checklist[dataISO] || {};
}

// Marca/desmarca um goal nesse dia. Devolve true se com isto ganhaste um fogo novo.
function alternarGoalNoDia(nomeGoal, dataISO = obterDataHojeISO()) {
  const streakAntes = carregarDados().streak.atual || 0;

  const dados = carregarDados();
  if (!dados.checklist[dataISO]) dados.checklist[dataISO] = {};
  dados.checklist[dataISO][nomeGoal] = !dados.checklist[dataISO][nomeGoal];
  guardarDados(dados);

  return atualizarStreak() > streakAntes;
}

// O dia só olha para os goals que hoje são obrigatórios — os que ainda têm
// folga no prazo deles não podem estragar o dia.
function checklistCompletaNoDia(dataISO) {
  const obrigatorios = obterGoalsObrigatoriosNoDia(dataISO);
  if (obrigatorios.length === 0) return false;
  const checklist = obterChecklistDoDia(dataISO);
  return obrigatorios.every((g) => checklist[g.nome] === true);
}

function obterEstadoDoDia(dataISO) {
  const hoje = obterDataHojeISO();
  if (dataISO > hoje) return "futuro";
  if (obterGoalsObrigatoriosNoDia(dataISO).length === 0) return "sem-goals";
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

/* ===== Streak / Fogos (diário) =====
 *
 * O streak é recalculado do zero a partir do histórico, em vez de ser um número
 * guardado que vai somando e subtraindo. É mais simples de perceber e nunca fica
 * dessincronizado — se voltares atrás e corrigires um dia antigo, o streak
 * ajusta-se sozinho da próxima vez que for calculado.
 */

function calcularStreakDiario() {
  const hoje = obterDataHojeISO();
  let dia = hoje;

  // O dia de hoje ainda pode estar a meio: se ainda não está completo, isso não
  // parte a corrente — começa-se simplesmente a contar a partir de ontem.
  if (obterEstadoDoDia(hoje) !== "completo") dia = diaAnteriorISO(hoje);

  let total = 0;
  for (let i = 0; i < 1000; i++) {
    if (obterGoalsDoMes(dia.slice(0, 7)).length === 0) break; // antes de haver goals definidos, pára

    const estado = obterEstadoDoDia(dia);
    if (estado === "completo") total++;
    else if (estado !== "sem-goals") break; // dia incompleto → a corrente parte aqui

    dia = diaAnteriorISO(dia);
  }
  return total;
}

// Recalcula e guarda o streak. Devolve o valor novo.
function atualizarStreak() {
  const dados = carregarDados();
  const atual = calcularStreakDiario();
  dados.streak.atual = atual;
  if (atual > (dados.streak.recorde || 0)) dados.streak.recorde = atual;
  guardarDados(dados);
  return atual;
}

// "classe" é o nome da classe CSS usada no badge do cabeçalho (ver style.css)
// para dar mais brilho/movimento a cada nível — quanto mais alto o nível,
// mais "vivo" o badge fica, só de olhar, sem precisar de ler o número.
function obterNivelFogo(streakAtual) {
  if (streakAtual >= 100) return { icone: "🔥🔥🔥🔥🔥", nome: "Lendário", classe: "nivel-lendario" };
  if (streakAtual >= 60) return { icone: "🔥🔥🔥🔥", nome: "Incêndio", classe: "nivel-incendio" };
  if (streakAtual >= 30) return { icone: "🔥🔥🔥", nome: "Fogueira", classe: "nivel-fogueira" };
  if (streakAtual >= 10) return { icone: "🔥🔥", nome: "Chama", classe: "nivel-chama" };
  if (streakAtual >= 1) return { icone: "🔥", nome: "Faísca", classe: "nivel-faisca" };
  return { icone: "💨", nome: "Sem streak", classe: "nivel-nenhum" };
}

/* ===== Feedback semanal / mensal ===== */

// Conta os dias completos / dias que contavam, num intervalo qualquer.
// Dias "sem-goals" (sem nada obrigatório) ficam de fora da conta — não contam
// como sucesso nem como falha.
function contarDiasNoIntervalo(inicioISO, fimISO) {
  let diasCompletos = 0;
  let diasComGoals = 0;

  obterDiasDoIntervalo(inicioISO, fimISO).forEach((dia) => {
    const estado = obterEstadoDoDia(dia);
    if (estado === "sem-goals" || estado === "futuro") return;
    diasComGoals++;
    if (estado === "completo") diasCompletos++;
  });

  const taxa = diasComGoals > 0 ? Math.round((diasCompletos / diasComGoals) * 100) : 0;
  return { diasCompletos, diasComGoals, taxa };
}

// Resumo de uma semana qualquer (usado nos chips das últimas semanas no Feedback).
function calcularResumoDaSemana(segundaISO) {
  const hoje = obterDataHojeISO();
  if (segundaISO > hoje) return { diasCompletos: 0, diasComGoals: 0, taxa: 0, comecou: false };

  const fimSemana = obterFimDaSemanaISO(segundaISO);
  const fim = fimSemana > hoje ? hoje : fimSemana;
  return { ...contarDiasNoIntervalo(segundaISO, fim), comecou: true };
}

function calcularResumoSemanal() {
  const segundaISO = obterInicioDaSemanaISO();
  const hoje = obterDataHojeISO();
  const contagem = contarDiasNoIntervalo(segundaISO, hoje);
  const dados = carregarDados();

  return {
    inicioSemana: segundaISO,
    fim: hoje,
    diasCompletos: contagem.diasCompletos,
    diasComGoals: contagem.diasComGoals,
    taxa: contagem.taxa,
    streakAtual: dados.streak.atual || 0,
    streakRecorde: dados.streak.recorde || 0,
  };
}

function calcularResumoMensal(mesISO = obterMesAtualISO()) {
  const hoje = obterDataHojeISO();
  const inicioMes = `${mesISO}-01`;
  const fimIntervalo = mesISO === obterMesAtualISO() ? hoje : ultimoDiaDoMesISO(mesISO);
  const goals = obterGoalsDoMes(mesISO);

  const { diasCompletos, diasComGoals, taxa } = contarDiasNoIntervalo(inicioMes, fimIntervalo);

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

  return { mesISO, diasCompletos, totalDias: diasComGoals, taxa, goals, sugestao };
}

/* ===== Estado resumido para o servidor de notificações (etapa 19) =====
 *
 * O servidor precisa de saber o teu progresso para conseguir mandar
 * notificações personalizadas (quanto falta, resumo da semana/mês) mesmo
 * com a app fechada — mas só os NÚMEROS, nunca o nome dos teus goals. Esta
 * função constrói exatamente esse resumo, reaproveitando as mesmas contas
 * que já a app usa para se desenhar a si própria (nada de lógica nova).
 */
function construirEstadoParaServidor() {
  const dados = carregarDados();
  const mesISO = obterMesAtualISO();
  const hoje = obterDataHojeISO();

  // "Diário" aqui junta os tipos "diario" e "mensal" — são os dois que se
  // marcam todos os dias (o mensal só difere na meta, não na frequência).
  const goalsParaMarcarHoje = obterGoalsDoMes(mesISO).filter((g) => g.tipo === "diario" || g.tipo === "mensal");
  const checklistHoje = obterChecklistDoDia(hoje);
  const feitosHoje = goalsParaMarcarHoje.filter((g) => checklistHoje[g.nome] === true).length;

  const semanais = obterGoalsPorTipo(mesISO, "semanal").map((g) => ({
    meta: g.meta,
    feito: contarOcorrenciasSemana(g.nome),
  }));

  const mensais = obterGoalsPorTipo(mesISO, "mensal").map((g) => ({
    meta: g.meta,
    feito: calcularProgressoMensal(g.nome, mesISO),
  }));

  const resumoSemana = calcularResumoSemanal();
  const resumoMes = calcularResumoMensal(mesISO);

  return {
    streak: { atual: dados.streak.atual || 0, recorde: dados.streak.recorde || 0 },
    diario: {
      existemGoals: goalsParaMarcarHoje.length > 0,
      totalHoje: goalsParaMarcarHoje.length,
      feitosHoje,
    },
    temGoalsSemanais: semanais.length > 0,
    semanais,
    mensais,
    resumoSemana: {
      diasCompletos: resumoSemana.diasCompletos,
      diasComGoals: resumoSemana.diasComGoals,
      taxa: resumoSemana.taxa,
    },
    resumoMes: {
      diasCompletos: resumoMes.diasCompletos,
      totalDias: resumoMes.totalDias,
      taxa: resumoMes.taxa,
      sugestao: resumoMes.sugestao,
    },
  };
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
