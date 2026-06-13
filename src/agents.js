// ── ANALYSE MULTI-AGENTS (inspiré de TradingAgents — TauricResearch) ──
// Pipeline : Analystes → Débat Bull/Bear → Gérant de recherche → Trader → Débat risque → Décision finale.
// Chaque agent est un appel LLM séquentiel ; l'état circule comme dans agent_states.py du projet original.

const AGENT_MODELS = {
  openai: 'gpt-4o',
  claude: 'claude-sonnet-4-5',      // moins cher qu'Opus : le pipeline fait 8 à 12 appels
  gemini: 'gemini-1.5-flash',
  lechat: 'mistral-large-latest',
};

const AGENT_MAX_TOKENS = 1600;

const AGENT_LANG = `Réponds intégralement en français. Sois concis, structuré et chiffré. N'invente jamais de données précises : si une donnée de marché récente t'est inconnue, dis-le explicitement.`;

let agentAnalysisRunning = false;
let lastAgentAnalysis = loadAgentAnalysis();

function loadAgentAnalysis() {
  try { return JSON.parse(localStorage.getItem('vesta-agent-analysis') || 'null'); }
  catch { return null; }
}
function saveAgentAnalysis(a) {
  try { localStorage.setItem('vesta-agent-analysis', JSON.stringify(a)); } catch {}
}

// ── Appel LLM générique pour les agents ──
// `useSearch` active la recherche web (fournisseur Claude uniquement) pour ancrer
// les analystes dans des données récentes, comme les tools yfinance/Finnhub du projet original.
async function callAgentLLM(system, user, useSearch = false) {
  const provider = settings.aiProvider || 'openai';
  const key = settings.aiApiKey || '';
  if (!key) throw new Error('Clé API manquante — configurez-la dans Paramètres.');
  const model = AGENT_MODELS[provider];

  if (provider === 'claude') {
    const body = {
      model, max_tokens: AGENT_MAX_TOKENS,
      system: system + '\n' + AGENT_LANG,
      messages: [{ role: 'user', content: user }],
    };
    if (useSearch) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-use': 'true',
      },
      body: JSON.stringify(body),
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message || d.error.type);
    return (d.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  }

  if (provider === 'gemini') {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system + '\n' + AGENT_LANG }] },
        contents: [{ role: 'user', parts: [{ text: user }] }],
      }),
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  // OpenAI & Mistral (API compatible)
  const url = provider === 'lechat'
    ? 'https://api.mistral.ai/v1/chat/completions'
    : 'https://api.openai.com/v1/chat/completions';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model, max_tokens: AGENT_MAX_TOKENS,
      messages: [
        { role: 'system', content: system + '\n' + AGENT_LANG },
        { role: 'user', content: user },
      ],
    }),
  });
  const d = await res.json();
  if (d.error) throw new Error(d.error.message);
  return d.choices?.[0]?.message?.content || '';
}

// ── Définition des agents (prompts adaptés de tradingagents/agents/*) ──
const AGENT_DEFS = {
  market: {
    label: 'Analyste technique & marché', icon: '📈',
    system: `Tu es un analyste technique de marché. Tu analyses la tendance de prix, le momentum, la volatilité et les niveaux clés d'un actif (supports/résistances, moyennes mobiles, RSI, MACD si les données te sont accessibles). Tu conclus par un biais court terme et moyen terme (haussier / neutre / baissier).`,
  },
  news: {
    label: 'Analyste actualités & sentiment', icon: '📰',
    system: `Tu es un analyste actualités et sentiment de marché. Tu identifies les nouvelles récentes (entreprise, secteur, macroéconomie) et le sentiment dominant des investisseurs autour de l'actif. Tu évalues l'impact probable de ces éléments sur le cours à court et moyen terme.`,
  },
  fundamentals: {
    label: 'Analyste fondamental', icon: '🏛',
    system: `Tu es un analyste fondamental. Tu évalues la santé financière de l'entreprise : croissance du chiffre d'affaires, marges, endettement, flux de trésorerie, valorisation (PER, EV/EBITDA, rendement du dividende) par rapport au secteur et à l'historique. Tu identifies la valeur intrinsèque et les signaux d'alerte. Pour un ETF ou une crypto, adapte : composition, frais, encours, adoption.`,
  },
  bull: {
    label: 'Chercheur Bull (optimiste)', icon: '🐂',
    system: `Tu es l'analyste Bull. Tu construis le dossier d'investissement le plus solide possible EN FAVEUR de l'actif : potentiel de croissance, avantages compétitifs, indicateurs positifs. Tu réfutes point par point les derniers arguments du Bear avec des données précises. Style : débat direct et engagé, pas une simple liste.`,
  },
  bear: {
    label: 'Chercheur Bear (pessimiste)', icon: '🐻',
    system: `Tu es l'analyste Bear. Tu construis le dossier le plus solide possible CONTRE l'investissement : risques, valorisation excessive, faiblesses concurrentielles, signaux négatifs. Tu réfutes point par point les derniers arguments du Bull avec des données précises. Style : débat direct et engagé.`,
  },
  manager: {
    label: 'Gérant de recherche (arbitre)', icon: '⚖️',
    system: `Tu es le gérant de recherche. Tu arbitres le débat Bull/Bear : tu évalues de façon critique la force de chaque argumentation et tu prends une position claire (Acheter / Conserver / Vendre) — pas de "ça dépend". Tu rédiges ensuite un plan d'investissement : recommandation, justification, points de vigilance qui invalideraient la thèse.`,
  },
  trader: {
    label: 'Trader (plan d\'exécution)', icon: '🎯',
    system: `Tu es un trader. À partir du plan d'investissement validé, tu proposes un plan d'exécution concret : point d'entrée (immédiat ou sur repli, DCA ou lump sum), taille de position en % du capital investissable, niveau d'invalidation de la thèse, horizon. Termine impérativement par une ligne : PROPOSITION FINALE : **ACHETER/CONSERVER/VENDRE**`,
  },
  risky: {
    label: 'Risque — profil agressif', icon: '🔥',
    system: `Tu es l'analyste risque AGRESSIF. Tu défends la prise de risque : le coût d'opportunité de ne pas agir, le potentiel de gain asymétrique. Tu critiques les positions trop prudentes du plan du trader quand elles sacrifient du rendement.`,
  },
  safe: {
    label: 'Risque — profil prudent', icon: '🛡',
    system: `Tu es l'analyste risque PRUDENT. Tu défends la préservation du capital : scénarios défavorables, drawdown maximal acceptable, corrélation avec le reste du patrimoine. Tu critiques les positions trop agressives du plan du trader.`,
  },
  neutral: {
    label: 'Risque — profil neutre', icon: '⚪',
    system: `Tu es l'analyste risque NEUTRE. Tu pèses les deux positions précédentes (agressive et prudente), tu pointes ce que chacune exagère ou ignore, et tu proposes l'ajustement le plus équilibré du plan du trader.`,
  },
  portfolio: {
    label: 'Gestionnaire de portefeuille (décision)', icon: '🏁',
    system: `Tu es le gestionnaire de portefeuille, décideur final. Tu synthétises le débat de risque et tu rends la décision finale ADAPTÉE AU PROFIL DE L'UTILISATEUR fourni (tolérance au risque, horizon, montants). Tu ajustes la taille de position en conséquence. Structure ta réponse : 1) Décision 2) Taille de position recommandée (en % et en € sur la base du capital de l'utilisateur) 3) Conditions d'invalidation 4) Risques résiduels. Termine impérativement par deux lignes exactes :
DÉCISION : ACHETER ou CONSERVER ou VENDRE
CONVICTION : x/10`,
  },
};

// ── Pipeline ──
async function runAgentAnalysis() {
  if (agentAnalysisRunning) return;
  const ticker = (document.getElementById('agent-ticker')?.value || '').trim();
  if (!ticker) { alert('Indiquez un ticker ou un nom d\'actif (ex : MC.PA, CW8, BTC).'); return; }
  if (!settings.aiApiKey) {
    alert('Configurez votre clé API dans Paramètres pour lancer l\'analyse.');
    go('settings', document.querySelector('[onclick*=settings]'));
    return;
  }

  const depth = document.getElementById('agent-depth')?.value || 'standard';
  const debateRounds = depth === 'approfondi' ? 2 : 1;
  const useSearch = (settings.aiProvider === 'claude');
  const today = new Date().toLocaleDateString('fr-FR', { year: 'numeric', month: 'long', day: 'numeric' });
  const userProfile = getBourseContext();

  agentAnalysisRunning = true;
  const btn = document.getElementById('agent-run-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Analyse en cours…'; }

  const analysis = { ticker, date: new Date().toISOString(), depth, steps: [], decision: null, conviction: null };
  renderAgentSteps(analysis, null);

  const ctxHeader = `Actif analysé : ${ticker}. Date : ${today}. ${useSearch ? '' : 'Attention : tu n\'as pas accès aux données de marché en temps réel — base-toi sur tes connaissances et signale leur date.'}`;

  const step = async (key, user, search = false) => {
    const def = AGENT_DEFS[key];
    const s = { key, label: def.label, icon: def.icon, status: 'running', text: '' };
    analysis.steps.push(s);
    renderAgentSteps(analysis, s.key);
    try {
      s.text = await callAgentLLM(def.system, ctxHeader + '\n\n' + user, search);
      s.status = 'done';
    } catch (e) {
      s.status = 'error';
      s.text = 'Erreur : ' + e.message;
      renderAgentSteps(analysis, null);
      throw e;
    }
    renderAgentSteps(analysis, null);
    return s.text;
  };

  try {
    // 1. Équipe d'analystes
    const marketReport = await step('market', `Rédige le rapport d'analyse technique et de marché pour ${ticker}.`, useSearch);
    const newsReport = await step('news', `Rédige le rapport actualités & sentiment pour ${ticker}.`, useSearch);
    const fundReport = depth === 'rapide' ? '' :
      await step('fundamentals', `Rédige le rapport d'analyse fondamentale pour ${ticker}.`, useSearch);

    const reports = `RAPPORT MARCHÉ/TECHNIQUE :\n${marketReport}\n\nRAPPORT ACTUALITÉS/SENTIMENT :\n${newsReport}` +
      (fundReport ? `\n\nRAPPORT FONDAMENTAL :\n${fundReport}` : '');

    // 2. Débat Bull / Bear (état du débat comme InvestDebateState)
    let history = '', lastResponse = '';
    for (let r = 0; r < debateRounds; r++) {
      const bullArg = await step('bull',
        `${reports}\n\nHistorique du débat :\n${history || '(début du débat)'}\n\nDernier argument du Bear :\n${lastResponse || '(aucun)'}\n\nPrésente ton argumentation Bull.`);
      history += `\nBull : ${bullArg}`;
      lastResponse = bullArg;

      const bearArg = await step('bear',
        `${reports}\n\nHistorique du débat :\n${history}\n\nDernier argument du Bull :\n${lastResponse}\n\nPrésente ton argumentation Bear.`);
      history += `\nBear : ${bearArg}`;
      lastResponse = bearArg;
    }

    // 3. Gérant de recherche → plan d'investissement
    const investmentPlan = await step('manager',
      `${reports}\n\nDébat complet Bull/Bear :\n${history}\n\nArbitre le débat et rédige le plan d'investissement.`);

    // 4. Trader → plan d'exécution
    const traderPlan = await step('trader',
      `Plan d'investissement du gérant de recherche :\n${investmentPlan}\n\nProfil de l'utilisateur : ${userProfile}\n\nPropose le plan d'exécution.`);

    // 5. Débat de risque (mode approfondi uniquement)
    let riskHistory = '';
    if (depth === 'approfondi') {
      const risky = await step('risky', `Plan du trader :\n${traderPlan}\n\nDonne ta critique agressive.`);
      riskHistory += `\nAgressif : ${risky}`;
      const safe = await step('safe', `Plan du trader :\n${traderPlan}\n\nDébat en cours :\n${riskHistory}\n\nDonne ta critique prudente.`);
      riskHistory += `\nPrudent : ${safe}`;
      const neutral = await step('neutral', `Plan du trader :\n${traderPlan}\n\nDébat en cours :\n${riskHistory}\n\nDonne ton arbitrage neutre.`);
      riskHistory += `\nNeutre : ${neutral}`;
    }

    // 6. Décision finale du gestionnaire de portefeuille
    const finalText = await step('portfolio',
      `Plan du trader :\n${traderPlan}\n${riskHistory ? `\nDébat de risque :\n${riskHistory}\n` : ''}\nPROFIL DE L'UTILISATEUR (à respecter impérativement) : ${userProfile}\n\nRends la décision finale.`);

    const dMatch = finalText.match(/D[ÉE]CISION\s*:?\s*\**\s*(ACHETER|CONSERVER|VENDRE)/i);
    const cMatch = finalText.match(/CONVICTION\s*:?\s*\**\s*(\d{1,2})\s*\/\s*10/i);
    analysis.decision = dMatch ? dMatch[1].toUpperCase() : null;
    analysis.conviction = cMatch ? +cMatch[1] : null;

    lastAgentAnalysis = analysis;
    saveAgentAnalysis(analysis);
    renderAgentSteps(analysis, null);
    _updateAgentTickerChip();
  } catch (e) {
    // l'étape en erreur est déjà affichée
  } finally {
    agentAnalysisRunning = false;
    if (btn) { btn.disabled = false; btn.textContent = 'Lancer l\'analyse'; }
  }
}

// ── Rendu ──
const AGENT_DECISION_STYLE = {
  ACHETER:   { color: 'var(--green)', bg: 'var(--green-bg)', icon: '▲' },
  CONSERVER: { color: 'var(--amber)', bg: 'var(--amber-bg)', icon: '◆' },
  VENDRE:    { color: 'var(--red)',   bg: 'var(--red-bg)',   icon: '▼' },
};

function escapeHTML(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// Mini-rendu markdown (gras, titres, listes) — suffisant pour les rapports d'agents
function miniMD(s) {
  return escapeHTML(s)
    .replace(/^###+\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/^##\s*(.+)$/gm, '<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^\s*[-*•]\s+(.+)$/gm, '<span style="display:block;padding-left:14px">• $1</span>')
    .replace(/\n{2,}/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function renderAgentSteps(analysis, runningKey) {
  const el = document.getElementById('agent-pipeline');
  if (!el) return;

  let html = '';
  analysis.steps.forEach((s, i) => {
    const statusIcon = s.status === 'running' ? '<span class="agent-spinner"></span>'
      : s.status === 'error' ? '<span style="color:var(--red)">✕</span>'
      : '<span style="color:var(--green)">✓</span>';
    const open = (s.status === 'error' || (s.status === 'done' && i === analysis.steps.length - 1 && analysis.decision)) ? ' open' : '';
    html += `<details class="agent-step${s.status === 'running' ? ' running' : ''}"${open}>
      <summary><span class="agent-step-icon">${s.icon}</span> ${s.label} <span class="agent-step-status">${statusIcon}</span></summary>
      <div class="agent-step-body">${s.text ? miniMD(s.text) : '<em style="color:var(--text3)">En cours…</em>'}</div>
    </details>`;
  });

  if (analysis.decision) {
    const st = AGENT_DECISION_STYLE[analysis.decision] || AGENT_DECISION_STYLE.CONSERVER;
    html += `<div class="agent-verdict" style="background:${st.bg};border-color:${st.color}">
      <div style="font-size:22px;color:${st.color}">${st.icon} ${analysis.decision}</div>
      ${analysis.conviction != null ? `<div style="color:var(--text2);font-size:13px">Conviction : ${analysis.conviction}/10</div>` : ''}
      <div style="color:var(--text3);font-size:11px;margin-top:4px">${analysis.ticker} · ${new Date(analysis.date).toLocaleDateString('fr-FR')} · mode ${analysis.depth}</div>
    </div>`;
  }

  el.innerHTML = html || '<div style="color:var(--text3);font-size:13px;text-align:center;padding:.5rem 0">Indiquez un actif et lancez l\'analyse pour voir le comité d\'investissement au travail.</div>';
}

function restoreAgentAnalysis() {
  if (lastAgentAnalysis) {
    const t = document.getElementById('agent-ticker');
    if (t && !t.value) t.value = lastAgentAnalysis.ticker;
    renderAgentSteps(lastAgentAnalysis, null);
    _updateAgentTickerChip();
  }
}

// ── CHAT CONTEXTUEL — Produits recommandés + Mes placements + Analyse ──

let agentChatHistory = [];

const AGENT_CHAT_SYSTEM = `Tu es un conseiller en investissement expert francophone. Tu as accès :
1. Au profil d'investissement de l'utilisateur (capital, versements, durée, tolérance au risque)
2. Aux produits recommandés par l'algorithme d'allocation pour ce profil
3. Aux placements actuels de l'utilisateur (comptes épargne et investissement avec détail des positions)
4. Aux résultats de la dernière analyse multi-agents sur un actif spécifique (si disponible)
Ton rôle : répondre de façon précise, chiffrée et personnalisée. Compare les placements actuels avec l'allocation cible. Identifie les écarts, sur/sous-expositions. Propose des actions concrètes. Sois direct et concis.`;

function getAgentChatContext() {
  const userProfile = getBourseContext();

  // Produits recommandés selon le profil actuel
  const risque  = +document.getElementById('sl-bourse-risque')?.value || 3;
  const montant = +document.getElementById('bourse-montant')?.value   || 0;
  const alloc   = [...(BOURSE_BASE_ALLOC[risque - 1] || BOURSE_BASE_ALLOC[2])];
  const CATS    = [
    { key:'etf',     label:'ETF',           idx:0 },
    { key:'actions', label:'Actions',        idx:1 },
    { key:'oblig',   label:'Obligations',    idx:2 },
    { key:'crypto',  label:'Crypto',         idx:3 },
    { key:'matprem', label:'Mat. premières', idx:4 },
  ];
  let prodTxt = 'PRODUITS RECOMMANDÉS (allocation cible) :\n';
  CATS.filter(c => alloc[c.idx] > 0).forEach(c => {
    const items  = BOURSE_PRODUCTS[c.key].slice(0, risque <= 2 ? 2 : 3);
    const euros  = montant > 0 ? ` (~${fmtE(Math.round(montant * alloc[c.idx] / 100))})` : '';
    prodTxt += `• ${c.label} ${alloc[c.idx]}%${euros} : ${items.map(p => p.ticker + ' – ' + p.name).join(', ')}\n`;
  });

  // Placements actuels
  const finAccounts = accounts.filter(a => ['epargne','invest'].includes(a.type));
  let placTxt = 'PLACEMENTS ACTUELS :\n';
  if (finAccounts.length) {
    const total = finAccounts.reduce((s, a) => s + (a.balance || 0), 0);
    placTxt += `Total : ${fmtE(total)}\n`;
    finAccounts.forEach(a => {
      placTxt += `• ${a.name} (${a.bank || '—'}, ${a.type === 'invest' ? 'investissement' : 'épargne'}) : ${fmtE(a.balance || 0)}`;
      if (a.holdings?.length) {
        placTxt += `\n  Holdings : ${a.holdings.map(h => `${h.name}${h.ticker ? ' (' + h.ticker + ')' : ''} → ${fmtE(h.value || 0)}`).join(' | ')}`;
      }
      placTxt += '\n';
    });
  } else {
    placTxt += 'Aucun placement enregistré.\n';
  }

  // Dernière analyse multi-agents
  let analysisTxt = '';
  if (lastAgentAnalysis?.steps?.length) {
    analysisTxt = `\nDERNIÈRE ANALYSE MULTI-AGENTS — ${lastAgentAnalysis.ticker} :\n`;
    if (lastAgentAnalysis.decision) {
      analysisTxt += `Décision : ${lastAgentAnalysis.decision}`;
      if (lastAgentAnalysis.conviction != null) analysisTxt += ` (conviction ${lastAgentAnalysis.conviction}/10)`;
      analysisTxt += '\n';
    }
    const portfolioStep = lastAgentAnalysis.steps.find(s => s.key === 'portfolio');
    if (portfolioStep?.text) {
      analysisTxt += `Conclusion du gestionnaire :\n${portfolioStep.text.slice(0, 700)}\n`;
    }
  }

  return `PROFIL : ${userProfile}\n\n${prodTxt}\n${placTxt}${analysisTxt}`;
}

async function sendAgentChat() {
  const inp = document.getElementById('agent-chat-input');
  const msg = inp?.value.trim();
  if (!msg) return;
  inp.value = '';

  _addAgentChatMsg(msg, 'user');
  const loadingEl = _addAgentChatMsg('…', 'ai loading');
  agentChatHistory.push({ role: 'user', content: msg });

  try {
    const ctx = getAgentChatContext();
    const sys  = AGENT_CHAT_SYSTEM + '\n\n' + AGENT_LANG + '\n\nDONNÉES UTILISATEUR :\n' + ctx;
    const txt  = await callAI([{ role: 'system', content: sys }, ...agentChatHistory]);
    loadingEl.classList.remove('loading');
    loadingEl.innerHTML = miniMD(txt);
    agentChatHistory.push({ role: 'assistant', content: txt });
    if (agentChatHistory.length > 20) agentChatHistory = agentChatHistory.slice(-20);
  } catch(e) {
    loadingEl.classList.remove('loading');
    loadingEl.textContent = 'Erreur : ' + e.message;
  }
}

function _addAgentChatMsg(text, cls) {
  const msgs = document.getElementById('agent-chat-msgs');
  if (!msgs) return null;
  const d = document.createElement('div');
  d.className = 'chat-msg ' + cls;
  if (cls.includes('loading')) d.textContent = text;
  else d.innerHTML = miniMD(text);
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function askAgentChat(q) {
  const inp = document.getElementById('agent-chat-input');
  if (!inp) return;
  inp.value = q;
  sendAgentChat();
}

function _updateAgentTickerChip() {
  const chip = document.getElementById('agent-chip-ticker');
  if (!chip || !lastAgentAnalysis?.ticker) return;
  const ticker = lastAgentAnalysis.ticker;
  chip.style.display = '';
  chip.textContent = `Intégrer ${ticker} dans mon portfolio`;
  chip.setAttribute('onclick',
    `askAgentChat("L'actif ${ticker} analysé (${lastAgentAnalysis.decision || 'décision inconnue'}) est-il cohérent avec mes placements actuels et mon profil ? Dois-je l'ajouter à mon portefeuille ?")`);
}
