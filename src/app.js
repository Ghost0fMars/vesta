// ── STATE ──
const SYSTEM = `Tu es un conseiller financier personnel expert francophone. Analyse les données financières de l'utilisateur (transactions, abonnements, comptes, budget) et réponds de façon concise, chiffrée, en français. Sois direct et pratique.`;

let chatHistory = [];

const CAT_COLORS = {
  salaire:'#1a6b4a', immo:'#8b2020', credit:'#c0392b', alimentation:'#7a4f0d',
  restaurant:'#d4880a', sante:'#1a4a7a', transport:'#2c6e49', loisirs:'#4a3080',
  vetements:'#8a3a8a', voyage:'#1a6b6b', travaux:'#6b4a1a', abonnement:'#3a6b8a',
  epargne:'#2a5a3a', divers:'#6b6860'
};
const CAT_ICONS = {
  salaire:'€', immo:'🏠', credit:'🔒', alimentation:'🛒', restaurant:'🍽',
  sante:'💊', transport:'🚗', loisirs:'🎭', vetements:'👗', voyage:'✈',
  travaux:'🔧', abonnement:'📱', epargne:'💰', divers:'•'
};
const CAT_LABELS = {
  salaire:'Salaire', immo:'Crédit immo', credit:'Crédit/Assur.', alimentation:'Alimentation',
  restaurant:'Restaurant', sante:'Santé', transport:'Transport', loisirs:'Loisirs',
  vetements:'Vêtements', voyage:'Voyage', travaux:'Travaux', abonnement:'Abonnement',
  epargne:'Épargne', divers:'Divers'
};
const ACCOUNT_TYPES = {
  courant: { label:'Compte courant', icon:'🏦', color:'--blue-bg' },
  epargne: { label:'Livret / Épargne', icon:'💰', color:'--green-bg' },
  joint:   { label:'Compte joint',    icon:'🏠', color:'--amber-bg' },
  pro:     { label:'Compte pro',      icon:'💼', color:'--purple-bg' },
  invest:  { label:'Investissement',  icon:'📊', color:'--purple-bg' },
};

function getAccountLabel(id) {
  const a = accounts.find(a => a.id === id);
  return a ? a.name : (id || '—');
}

let transactions = [];
let abonnements  = [];
let accounts     = [];
const _env = (typeof window !== 'undefined' && window.__ENV__) || {};
let settings     = { aiProvider:'openai', aiApiKey:_env.OPENAI_API_KEY||'', displayName:'' };
let budget       = {};
let creditsImmo  = [];

let importedFiles = [];

const STORAGE_KEY = 'mes-finances-state-v3';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    transactions, abonnements, accounts, settings, budget, creditsImmo,
    savedAt: new Date().toISOString()
  }));
}

const savedState = loadState();
if (savedState?.transactions?.length) transactions = savedState.transactions;
if (savedState?.abonnements?.length)  abonnements  = savedState.abonnements;
if (savedState?.accounts?.length)     accounts     = savedState.accounts;
if (savedState?.settings)             settings     = { ...settings, ...savedState.settings };
if (savedState?.budget)               budget       = savedState.budget;
if (savedState?.creditsImmo?.length)  creditsImmo  = savedState.creditsImmo;

// ── NAVIGATION ──
function go(id, el) {
  if (!document.getElementById('sec-' + id)) id = 'dashboard';
  document.querySelectorAll('.sec').forEach(s => s.classList.remove('on'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('sec-' + id).classList.add('on');
  const navItem = el || document.querySelector(`[onclick*="${id}"]`);
  if (navItem) navItem.classList.add('active');
  history.replaceState(null, '', '#' + id);
  document.querySelector('.sidebar')?.classList.remove('open');
  if (id === 'transactions') renderTx();
  if (id === 'abonnements')  renderAbo();
  if (id === 'patrimoine')   renderPatrimoine();
  if (id === 'dashboard')    renderDashAbo();
  if (id === 'settings')     { renderSettingsAccounts(); loadSettingsUI(); }
  if (id === 'epargne') { calcEpargne(); setTimeout(initTRChart, 100); }
  if (id === 'bourse') { calcBourseProfil(); if (typeof restoreAgentAnalysis === 'function') restoreAgentAnalysis(); }
}

function goToAccountTransactions(accountId) {
  go('transactions', document.querySelector('[onclick*="transactions"]'));
  setTimeout(() => {
    const sel = document.getElementById('tx-filter-account');
    if (sel) { sel.value = accountId; renderTx(); }
  }, 50);
}

// ── FORMATTERS ──
function fmtE(n) { return (n < 0 ? '-' : '') + Math.abs(n).toLocaleString('fr-FR', {minimumFractionDigits:2,maximumFractionDigits:2}) + ' €'; }
function fmtK(n) { return n >= 1000000 ? (n/1000000).toFixed(2)+' M€' : n >= 1000 ? (n/1000).toFixed(0)+' K€' : fmtE(n); }

// ── CHARTS ──
function buildDonutData() {
  const rev      = +document.getElementById('sl-rev')?.value     || 0;
  const contrib  = +document.getElementById('sl-contrib')?.value  || 0;
  const dv       = +document.getElementById('sl-dv')?.value       || 0;
  const aboTotal = abonnements.reduce((s, a) => s + a.price, 0);
  const epargne  = Math.max(0, rev - contrib - aboTotal - dv);

  if (rev === 0) {
    return { labels:['Aucune donnée'], data:[1], colors:['rgba(155,152,144,0.18)'], empty:true };
  }

  const labels = [], data = [], colors = [];
  if (contrib   > 0) { labels.push('Contribution foyer'); data.push(contrib);   colors.push('#8b2020'); }
  if (aboTotal  > 0) { labels.push('Crédits & Abonnements'); data.push(aboTotal); colors.push('#3a6b8a'); }
  if (dv        > 0) { labels.push('Dépenses variables'); data.push(dv);        colors.push('#7a4f0d'); }
  if (epargne   > 0) { labels.push('Épargne');            data.push(epargne);   colors.push('#1a6b4a'); }

  if (!data.length) return { labels:['Aucune donnée'], data:[1], colors:['rgba(155,152,144,0.18)'], empty:true };
  return { labels, data, colors, empty:false };
}

function updateDonutChart() {
  const donut = buildDonutData();
  if (charts['donut']) {
    charts['donut'].data.labels = donut.labels;
    charts['donut'].data.datasets[0].data = donut.data;
    charts['donut'].data.datasets[0].backgroundColor = donut.colors;
    charts['donut'].update();
  }
  const legendEl = document.getElementById('donut-legend');
  if (legendEl) {
    legendEl.innerHTML = donut.empty
      ? '<span style="font-size:11px;color:var(--text3)">Renseignez votre budget pour voir la répartition</span>'
      : donut.labels.map((l,i) => `<span class="leg-item"><span class="leg-dot" style="background:${donut.colors[i]}"></span>${l}</span>`).join('');
  }
}

const isDark = matchMedia('(prefers-color-scheme:dark)').matches;
const gc = isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)';
const tc = isDark ? '#9b9890' : '#9b9890';

let charts = {};
function destroyChart(id) { if (charts[id]) { charts[id].destroy(); delete charts[id]; } }

function buildFluxData() {
  const MON_LABELS = ['Jan','Fév','Mars','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
  const map = {};
  transactions.forEach(t => {
    const key = t.date.slice(0,7);
    if (!map[key]) map[key] = {in:0, out:0};
    if (t.amount > 0) map[key].in  += t.amount;
    else              map[key].out += Math.abs(t.amount);
  });
  const keys = Object.keys(map).sort().slice(-5);
  return {
    labels: keys.map(k => MON_LABELS[+k.slice(5)-1]),
    ins:    keys.map(k => Math.round(map[k].in)),
    outs:   keys.map(k => Math.round(map[k].out))
  };
}

function buildVarData() {
  const FIXED = new Set(['salaire','immo','credit','abonnement','epargne']);
  const VAR_CATS = [
    {key:'alimentation', label:'Alimentation'},
    {key:'restaurant',   label:'Restaurants'},
    {key:'loisirs',      label:'Loisirs'},
    {key:'sante',        label:'Santé'},
    {key:'voyage',       label:'Voyage'},
    {key:'travaux',      label:'Travaux'},
    {key:'divers',       label:'Divers'},
  ];
  const now = new Date().toISOString().slice(0,7);
  const totals = {};
  transactions
    .filter(t => t.date.startsWith(now) && !FIXED.has(t.cat) && t.amount < 0)
    .forEach(t => { totals[t.cat] = (totals[t.cat]||0) + Math.abs(t.amount); });
  return {
    labels: VAR_CATS.map(c => c.label),
    data:   VAR_CATS.map(c => Math.round(totals[c.key]||0))
  };
}

function initCharts() {
  if (typeof Chart === 'undefined') return;
  // Flux — dynamique depuis les transactions
  const flux = buildFluxData();
  destroyChart('flux');
  charts['flux'] = new Chart(document.getElementById('c-flux'), {
    type:'bar',
    data:{
      labels: flux.labels,
      datasets:[
        {label:'Entrées',data:flux.ins, backgroundColor:'rgba(26,107,74,.75)',borderRadius:4},
        {label:'Sorties',data:flux.outs,backgroundColor:'rgba(139,32,32,.75)',borderRadius:4}
      ]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:tc,font:{size:11}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>(v/1000).toFixed(0)+'K€'},grid:{color:gc}}}}
  });
  // Donut — calculé depuis les sliders budget
  const donut = buildDonutData();
  destroyChart('donut');
  charts['donut'] = new Chart(document.getElementById('c-donut'), {
    type:'doughnut',
    data:{labels:donut.labels, datasets:[{data:donut.data, backgroundColor:donut.colors, borderWidth:0}]},
    options:{responsive:true,maintainAspectRatio:false,cutout:'65%',plugins:{legend:{display:false}}}
  });
  // Dépenses variables du mois — dynamiques
  const varD = buildVarData();
  destroyChart('var');
  charts['var'] = new Chart(document.getElementById('c-var'), {
    type:'bar', indexAxis:'y',
    data:{
      labels: varD.labels,
      datasets:[{data:varD.data,backgroundColor:'rgba(122,79,13,.75)',borderRadius:4}]
    },
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:tc,font:{size:11},callback:v=>v+'€'},grid:{color:gc}},y:{ticks:{color:tc,font:{size:11}},grid:{display:false}}}}
  });
  // Patrimoine — courbe d'amortissement ou zéros par défaut
  destroyChart('pat');
  const patLabels = Array.from({length:11},(_,i)=> i===0?'Auj.':`+${i} an${i>1?'s':''}`);
  const patData   = Array.from({length:11},()=>0);
  charts['pat'] = new Chart(document.getElementById('c-pat'), {
    type:'line',
    data:{labels:patLabels,datasets:[{label:'Capital restant dû',data:patData,borderColor:'#8b2020',backgroundColor:'rgba(139,32,32,.08)',fill:true,tension:.35,pointRadius:3,borderWidth:2}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:tc,font:{size:10}},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>fmtK(v)},grid:{color:gc}}}}
  });
}

function initTRChart() {
  if (typeof Chart === 'undefined') return;
  const m = +document.getElementById('sl-tr').value;
  const r = +document.getElementById('sl-rd').value / 100;
  const mr = r / 12;
  function fv(n) { let v=0; for(let i=0;i<n;i++) v=(v+m)*(1+mr); return v; }
  const labs = Array.from({length:21},(_,i)=>i===0?'Auj':'An '+i);
  const vals = Array.from({length:21},(_,i)=>Math.round(fv(i*12)));
  const cont = Array.from({length:21},(_,i)=>i*12*m);
  document.getElementById('tr-5').textContent = fmtK(Math.round(fv(60)));
  document.getElementById('tr-10').textContent = fmtK(Math.round(fv(120)));
  document.getElementById('tr-20').textContent = fmtK(Math.round(fv(240)));
  if (charts['tr']) {
    charts['tr'].data.labels = labs;
    charts['tr'].data.datasets[0].data = vals;
    charts['tr'].data.datasets[1].data = cont;
    charts['tr'].update(); return;
  }
  charts['tr'] = new Chart(document.getElementById('c-tr'), {
    type:'line',
    data:{labels:labs,datasets:[
      {label:'Valeur',data:vals,borderColor:'#4a3080',backgroundColor:'rgba(74,48,128,.08)',fill:true,tension:.35,pointRadius:2,borderWidth:2},
      {label:'Versé',data:cont,borderColor:'#1a4a7a',borderDash:[5,4],backgroundColor:'transparent',tension:.1,pointRadius:0,borderWidth:1.5}
    ]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{x:{ticks:{color:tc,font:{size:10},maxRotation:0},grid:{color:gc}},y:{ticks:{color:tc,callback:v=>fmtK(v)},grid:{color:gc}}}}
  });
}

// ── TRANSACTIONS ──
function addTx() {
  const date = document.getElementById('tx-date').value;
  const label = document.getElementById('tx-label').value.trim();
  const amount = parseFloat(document.getElementById('tx-amount').value);
  const cat = document.getElementById('tx-cat').value;
  const account = document.getElementById('tx-account').value;
  const note = document.getElementById('tx-note').value.trim();
  if (!date || !label || isNaN(amount)) { alert('Date, libellé et montant requis.'); return; }
  const id = Date.now();
  transactions.unshift({id,date,label,amount,cat,account,note});
  saveState();
  clearTxForm();
  renderTx();
  renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
  updateSidebar();
}
function clearTxForm() {
  document.getElementById('tx-date').value='';
  document.getElementById('tx-label').value='';
  document.getElementById('tx-amount').value='';
  document.getElementById('tx-note').value='';
}
function deleteTx(id) {
  transactions = transactions.filter(t => t.id !== id);
  saveState();
  renderTx(); renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
}
function setTxAccount(id, accountId) {
  const t = transactions.find(t => t.id == id);
  if (!t) return;
  t.account = accountId;
  saveState();
  renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
}
function ensureTxGrid() {
  const currentBody = document.getElementById('tx-tbody');
  if (!currentBody) return null;
  if (currentBody.tagName !== 'TBODY' && currentBody.closest('.tx-grid')) return currentBody;

  const host = currentBody.closest('.card') || currentBody.parentElement;
  if (!host) return currentBody;

  host.innerHTML = `
    <div class="tx-grid">
      <div class="tx-grid-head">
        <div>Date</div>
        <div>Libellé</div>
        <div>Catégorie</div>
        <div>Compte</div>
        <div>Montant</div>
        <div></div>
      </div>
      <div id="tx-tbody"></div>
    </div>`;

  return document.getElementById('tx-tbody');
}
function renderTx() {
  const q = (document.getElementById('tx-search')?.value||'').toLowerCase();
  const cat = document.getElementById('tx-filter-cat')?.value||'';
  const type = document.getElementById('tx-filter-type')?.value||'';
  const acc = document.getElementById('tx-filter-account')?.value||'';
  let filtered = transactions.filter(t => {
    if (q && !t.label.toLowerCase().includes(q)) return false;
    if (cat && t.cat !== cat) return false;
    if (type === 'credit' && t.amount < 0) return false;
    if (type === 'debit' && t.amount > 0) return false;
    if (acc && t.account !== acc) return false;
    return true;
  });
  filtered.sort((a,b) => b.date.localeCompare(a.date));
  const tbody = ensureTxGrid();
  if (!tbody) return;
  tbody.innerHTML = filtered.map(t => `
    <div class="tx-grid-row">
      <div class="mono" style="color:var(--text3);font-size:11px">${t.date.slice(5).split('-').reverse().join('/')}</div>
      <div class="tx-label-cell"><div class="tx-label-main" style="font-weight:500;font-size:12.5px">${t.label}</div>${t.note?`<div class="tx-label-note" style="font-size:11px;color:var(--text3)">${t.note}</div>`:''}</div>
      <div><span class="badge" style="background:${CAT_COLORS[t.cat]}22;color:${CAT_COLORS[t.cat]}">${CAT_LABELS[t.cat]||t.cat}</span></div>
      <div><select class="tx-account-select" onchange="setTxAccount(${t.id},this.value)" style="font-size:11px;border:none;background:transparent;color:${t.account?'var(--text2)':'var(--red)'};cursor:pointer;max-width:120px;padding:0">${!t.account?`<option value="" selected disabled>— choisir —</option>`:''}${accounts.map(a=>`<option value="${a.id}"${a.id===t.account?' selected':''}>${a.name}</option>`).join('')}</select></div>
      <div class="mono" style="color:${t.amount>=0?'var(--green)':'var(--red)'}">${fmtE(t.amount)}</div>
      <div><span class="tx-delete" onclick="deleteTx(${t.id})">✕</span></div>
    </div>`).join('');
  const total = filtered.reduce((s,t)=>s+t.amount,0);
  const sum = document.getElementById('tx-summary');
  if (sum) sum.textContent = `${filtered.length} transaction(s) · Solde net : ${fmtE(total)}`;
}
function updateTotalLiquidity() {
  const el = document.getElementById('dm-total-liq');
  if (!el) return;
  const total = accounts.reduce((s, a) => s + (a.balance || 0), 0);
  el.textContent = fmtE(total);
}

function updateTRBalance() {
  const row = document.querySelector('[data-tr-cash-base]');
  const el  = document.getElementById('tr-cash-bal');
  if (!row || !el) return;
  const base = parseFloat(row.dataset.trCashBase) || 0;
  const spent = transactions
    .filter(t => t.account === 'traderepublic')
    .reduce((s, t) => s + t.amount, 0);
  const balance = base + spent;
  el.textContent = balance.toLocaleString('fr-FR', {minimumFractionDigits:2, maximumFractionDigits:2}) + ' €';
  el.className = 'account-bal ' + (balance >= 0 ? 'pos' : 'neg');
}

function renderDashAlerts() {
  const el = document.getElementById('dash-alerts');
  if (!el) return;
  const alerts = [];

  if (!accounts.length) {
    alerts.push(`<div class="notif info">→ Aucun compte configuré — <button class="btn btn-sm" onclick="go('settings',document.querySelector('[onclick*=settings]'))">Ajouter un compte</button></div>`);
  }
  if (!settings.aiApiKey) {
    alerts.push(`<div class="notif info">→ Clé API manquante — configurez-la dans <button class="btn btn-sm" onclick="go('settings',document.querySelector('[onclick*=settings]'))">Paramètres</button> pour activer le conseiller IA.</div>`);
  }

  const savings = accounts.filter(a => a.type === 'epargne').reduce((s,a) => s+(a.balance||0), 0);
  const rev = +document.getElementById('sl-rev')?.value || 0;
  if (rev > 0 && savings < rev * 3) {
    alerts.push(`<div class="notif">⚠ Fonds d'urgence recommandé : ${fmtE(rev*3)} (3 mois de revenus) — actuel : ${fmtE(savings)}.</div>`);
  }

  const thisMonth = new Date().toISOString().slice(0,7);
  const monthSpend = transactions.filter(t => t.date.startsWith(thisMonth) && t.amount < 0).reduce((s,t) => s+Math.abs(t.amount), 0);
  if (monthSpend > 0) {
    alerts.push(`<div class="notif success">✓ Dépenses du mois en cours : ${fmtE(monthSpend)}</div>`);
  }

  el.innerHTML = alerts.length ? alerts.join('') : '<div style="color:var(--text3);font-size:13px;padding:.5rem 0">Aucune alerte.</div>';
}

function renderDashRecent() {
  const el = document.getElementById('dash-recent-tx');
  if (!el) return;
  const recent = [...transactions].sort((a,b)=>b.date.localeCompare(a.date)).slice(0,8);
  el.innerHTML = recent.map(t => `
    <div class="tx-row">
      <div class="tx-cat" style="background:${CAT_COLORS[t.cat]}22;color:${CAT_COLORS[t.cat]}">${CAT_ICONS[t.cat]||'•'}</div>
      <div class="tx-info"><div class="tx-name">${t.label}</div><div class="tx-meta">${t.date.slice(5).split('-').reverse().join('/')} · ${getAccountLabel(t.account)}</div></div>
      <div class="tx-amount" style="color:${t.amount>=0?'var(--green)':'var(--red)'}">${fmtE(t.amount)}</div>
    </div>`).join('');
}

function renderDashAbo() {
  const el = document.getElementById('dm-abo');
  if (!el) return;
  const total = abonnements.reduce((s, a) => s + a.price, 0);
  el.textContent = abonnements.length ? fmtE(total) : '— €';
}

// ── ABONNEMENTS ──
// ── DETECT SUBSCRIPTIONS FROM TRANSACTIONS ──

function _normAboLabel(label) {
  return label
    .toUpperCase()
    .replace(/\b(PRLV|SEPA|VIR|CB|CARTE|PRELEVEMENT|VIREMENT|FACTURE|REF|REFERENCE|ECH|ECHEANCE|PAIEMENT|INTER|INTERNATIONAL|B\.?V\.?|SAS|SARL|SA|SPA|GROUPE)\b/g, '')
    .replace(/\d{4}-\d{2}-\d{2}/g, '')
    .replace(/\d{2}\/\d{2}\/\d{4}/g, '')
    .replace(/\d{2}\/\d{2}/g, '')
    .replace(/\d{5,}/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 2)
    .slice(0, 3)
    .join(' ');
}

function _guessCatAbo(label) {
  const l = label.toLowerCase();
  if (/pret immo|credit immo|crédit immo|prêt immo|hypothe|echeance.*immo|ech pret|emprunt immobilier/.test(l)) return 'immo';
  if (/credit auto|crédit auto|prêt auto|pret auto|lcl auto|ca auto|cetelem auto/.test(l)) return 'auto';
  if (/credit travaux|crédit travaux|prêt travaux|pret travaux/.test(l)) return 'travaux';
  if (/credit conso|crédit conso|credit perso|prêt perso|pret perso|cofidis|cetelem|sofinco|floa|younited/.test(l)) return 'conso';
  if (/netflix|disney|spotify|deezer|canal|youtube|prime video|apple tv|hulu|crunchyroll|paramount|tidal|mubi|arte/.test(l)) return 'streaming';
  if (/sfr|free mobile|orange |bouygues|virgin mobile|prixtel|sosh/.test(l)) return 'telephonie';
  if (/assur|maif|axa|allianz|mma|groupama|macif|maaf|covea|generali/.test(l)) return 'assurance';
  if (/frais bancaires?|cotis|carte bancaire|frais tenue/.test(l)) return 'banque';
  if (/adobe|microsoft|google|apple |dropbox|1password|notion|github|claude|openai|chatgpt|figma|canva|slack|zoom/.test(l)) return 'logiciel';
  return 'autre';
}

function detectAboFromTx() {
  const debits = transactions.filter(t => t.amount < 0);
  if (debits.length < 2) return [];

  const groups = {};
  debits.forEach(tx => {
    const key = _normAboLabel(tx.label);
    if (!key || key.length < 3) return;
    if (!groups[key]) groups[key] = [];
    groups[key].push(tx);
  });

  const existingKeys = new Set(abonnements.map(a => _normAboLabel(a.name)));

  return Object.entries(groups).reduce((acc, [key, txList]) => {
    if (txList.length < 2 || existingKeys.has(key)) return acc;

    txList.sort((a, b) => a.date.localeCompare(b.date));
    const ms = txList.map(t => new Date(t.date).getTime());
    const intervals = ms.slice(1).map((v, i) => (v - ms[i]) / 86400000);
    const avg = intervals.reduce((s, v) => s + v, 0) / intervals.length;

    let freq, factor;
    if      (avg >= 20  && avg <= 40)  { freq = 'mensuel';      factor = 1;    }
    else if (avg >= 75  && avg <= 105) { freq = 'trimestriel';  factor = 1/3;  }
    else if (avg >= 340 && avg <= 400) { freq = 'annuel';       factor = 1/12; }
    else return acc;

    if (intervals.some(d => Math.abs(d - avg) > 9)) return acc;

    const amounts = txList.map(t => Math.abs(t.amount));
    const avgAmt  = amounts.reduce((s, v) => s + v, 0) / amounts.length;
    if (amounts.some(a => Math.abs(a - avgAmt) / avgAmt > 0.15)) return acc;

    const bestLabel = txList.map(t => t.label).sort((a, b) => a.length - b.length)[0];
    acc.push({
      key, name: bestLabel,
      price: +(avgAmt * factor).toFixed(2),
      freq, occurrences: txList.length,
      cat: _guessCatAbo(bestLabel),
      account: txList[0].account || ''
    });
    return acc;
  }, []).sort((a, b) => b.price - a.price);
}

let _aboDetected = [];

function showDetectAbo() {
  _aboDetected = detectAboFromTx();
  const panel = document.getElementById('abo-detect-panel');
  if (!panel) return;

  if (!transactions.length) {
    panel.innerHTML = '<div class="notif" style="margin-bottom:1rem">Aucune transaction enregistrée. Importez d\'abord un relevé bancaire.</div>';
    return;
  }
  if (!_aboDetected.length) {
    panel.innerHTML = '<div class="notif" style="margin-bottom:1rem">Aucun prélèvement récurrent détecté dans vos transactions.</div>';
    return;
  }

  const catLabels = {streaming:'Streaming',telephonie:'Téléphonie',assurance:'Assurance',banque:'Banque',logiciel:'Logiciel / IA',autre:'Autre'};
  let html = `<div class="card" style="margin-bottom:1rem">
    <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
      <span>${_aboDetected.length} abonnement(s) détecté(s)</span>
      <button class="btn btn-primary" onclick="addAllDetectedAbo()" style="font-size:12px;padding:4px 12px">Tout ajouter</button>
    </div>`;

  _aboDetected.forEach((c, i) => {
    html += `<div class="row" id="abo-cand-${i}" style="gap:8px;align-items:center">
      <span class="row-label" style="flex:1">
        ${c.name}<br>
        <span style="font-size:10px;color:var(--text3)">${catLabels[c.cat]||c.cat} · ${c.freq} · ${c.occurrences} opération(s)</span>
      </span>
      <span style="display:flex;align-items:center;gap:8px;flex-shrink:0">
        <span style="font-family:var(--mono);font-size:13px">${fmtE(c.price)}/mois</span>
        <button class="btn btn-primary" style="font-size:11px;padding:3px 10px" onclick="addDetectedAbo(${i})">Ajouter</button>
        <span style="font-size:11px;color:var(--text3);cursor:pointer;user-select:none" onclick="ignoreDetectedAbo(${i})">Ignorer</span>
      </span>
    </div>`;
  });

  panel.innerHTML = html + '</div>';
}

function addDetectedAbo(idx) {
  const c = _aboDetected[idx];
  if (!c) return;
  abonnements.push({ id: Date.now()+Math.random(), name: c.name, price: c.price, cat: c.cat, account: c.account, keep: true });
  saveState();
  renderAbo();
  document.getElementById(`abo-cand-${idx}`)?.remove();
  _checkDetectEmpty();
}

function ignoreDetectedAbo(idx) {
  document.getElementById(`abo-cand-${idx}`)?.remove();
  _checkDetectEmpty();
}

function addAllDetectedAbo() {
  _aboDetected.forEach(c => {
    if (!abonnements.some(a => _normAboLabel(a.name) === c.key)) {
      abonnements.push({ id: Date.now()+Math.random(), name: c.name, price: c.price, cat: c.cat, account: c.account, keep: true });
    }
  });
  saveState();
  renderAbo();
  const panel = document.getElementById('abo-detect-panel');
  if (panel) panel.innerHTML = '<div class="notif success" style="margin-bottom:1rem">✓ Tous les abonnements détectés ont été ajoutés.</div>';
}

function _checkDetectEmpty() {
  const panel = document.getElementById('abo-detect-panel');
  if (panel && !panel.querySelector('[id^="abo-cand-"]'))
    panel.innerHTML = '<div class="notif success" style="margin-bottom:1rem">✓ Tous les abonnements détectés ont été traités.</div>';
}

const CREDIT_CATS  = new Set(['immo','auto','conso','travaux']);
const ABO_CAT_LABELS = {
  immo:'Crédit immobilier', auto:'Crédit auto', conso:'Crédit conso / perso', travaux:'Crédit travaux',
  assurance:'Assurances', telephonie:'Téléphonie', streaming:'Streaming & divertissement',
  logiciel:'Logiciels & IA', banque:'Frais bancaires', autre:'Autres'
};

function _renderAboSection(items, isCredit) {
  const cats = {};
  items.forEach(a => { if (!cats[a.cat]) cats[a.cat] = []; cats[a.cat].push(a); });
  let html = '';
  for (const [cat, list] of Object.entries(cats)) {
    const total = list.reduce((s,a)=>s+a.price,0);
    html += `<div class="card"><div class="card-title"><span>${ABO_CAT_LABELS[cat]||cat}</span><span style="font-family:var(--mono);font-size:12px">${fmtE(total)}/mois</span></div>`;
    list.forEach(a => {
      let badge;
      if (isCredit) {
        badge = '<span class="badge badge-a">en cours</span>';
      } else {
        badge = a.keep === false ? '<span class="badge badge-r">à résilier</span>' : a.keep === null ? '<span class="badge badge-a">à vérifier</span>' : '<span class="badge badge-g">ok</span>';
      }
      html += `<div class="row" style="gap:8px">
        <span class="row-label">${a.name}<br><span style="font-size:10px;color:var(--text3)">${getAccountLabel(a.account)}</span></span>
        <span style="display:flex;align-items:center;gap:8px">
          <span class="row-value" style="font-family:var(--mono)">${fmtE(a.price)}</span>
          ${badge}
          <span style="font-size:11px;color:var(--red);cursor:pointer" onclick="deleteAbo(${a.id})">✕</span>
        </span>
      </div>`;
    });
    html += '</div>';
  }
  return html;
}

function renderAbo() {
  const credits = abonnements.filter(a => CREDIT_CATS.has(a.cat));
  const subs    = abonnements.filter(a => !CREDIT_CATS.has(a.cat));
  const el = document.getElementById('abo-list');
  if (!el) return;

  let html = '';
  if (credits.length) {
    html += `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin:1rem 0 .4rem">Crédits</div>`;
    html += _renderAboSection(credits, true);
  }
  if (subs.length) {
    html += `<div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);margin:1rem 0 .4rem">Abonnements</div>`;
    html += _renderAboSection(subs, false);
  }
  el.innerHTML = html || '<div style="padding:1rem;text-align:center;font-size:13px;color:var(--text3)">Aucun prélèvement enregistré.</div>';

  const creditTotal = credits.reduce((s,a)=>s+a.price,0);
  const subTotal    = subs.reduce((s,a)=>s+a.price,0);
  const grandTotal  = creditTotal + subTotal;
  const cm = document.getElementById('abo-credit-m');
  const sm = document.getElementById('abo-sub-m');
  const tm = document.getElementById('abo-total-m');
  const ty = document.getElementById('abo-total-y');
  if (cm) cm.textContent = credits.length ? fmtE(creditTotal) : '— €';
  if (sm) sm.textContent = subs.length    ? fmtE(subTotal)    : '— €';
  if (tm) tm.textContent = fmtE(grandTotal);
  if (ty) ty.textContent = fmtE(grandTotal*12);
  renderDashAbo();
  updateDonutChart();
}
function addAbo() {
  const name = document.getElementById('abo-name').value.trim();
  const price = parseFloat(document.getElementById('abo-price').value);
  const cat = document.getElementById('abo-cat').value;
  const account = document.getElementById('abo-account').value;
  if (!name || isNaN(price)) { alert('Nom et montant requis.'); return; }
  abonnements.push({id:Date.now(),name,price,cat,account,keep:true});
  saveState();
  document.getElementById('abo-name').value='';
  document.getElementById('abo-price').value='';
  renderAbo();
}
function deleteAbo(id) { abonnements = abonnements.filter(a=>a.id!==id); saveState(); renderAbo(); }

// ── CRÉDIT IMMO / PATRIMOINE ──

// Amortissement français taux fixe : capital restant après k mensualités
function _calcCRD(montant, tauxAnnuel, dureeMois, k) {
  if (k <= 0) return montant;
  if (k >= dureeMois) return 0;
  const r = tauxAnnuel / 12 / 100;
  if (r < 1e-6) return Math.max(0, montant * (1 - k / dureeMois));
  return montant * (Math.pow(1+r, dureeMois) - Math.pow(1+r, k)) / (Math.pow(1+r, dureeMois) - 1);
}

function getCapitalRestantToday(credit) {
  const today = new Date().toISOString().slice(0, 10);
  // Méthode 1 : lookup dans le tableau d'amortissement importé
  if (credit.schedule?.length) {
    const past = credit.schedule.filter(r => r.date <= today);
    if (past.length) return Math.max(0, past[past.length - 1].capitalRestant);
    return credit.schedule[0].capitalRestant; // avant la 1ère échéance
  }
  // Méthode 2 : calcul par formule
  if (credit.montantInitial && credit.dateDebut && credit.dureeMois) {
    const start = new Date(credit.dateDebut);
    const now   = new Date();
    const k = Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
    return Math.round(_calcCRD(credit.montantInitial, credit.tauxAnnuel || 0, credit.dureeMois, k));
  }
  return 0;
}

function parseCreditImmoFile(content) {
  content = content.replace(/^﻿/, '');
  const lines = content.trim().split(/\r?\n/).map(l => l.trim()).filter(l => l);
  if (lines.length < 3) return null;

  const sep = lines.slice(0, 10).join('').split(';').length > lines.slice(0, 10).join('').split(',').length ? ';' : ',';
  const toNum  = s => parseFloat((s||'').replace(/\s/g,'').replace(',','.').replace(/[€%]/g,'')) || 0;
  const toDate = s => {
    s = (s||'').trim().replace(/^"|"$/g,'');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}` : '';
  };

  // ── Extraction des paramètres dans les lignes d'en-tête ──
  let montantInitial = 0, tauxAnnuel = 0, dureeMois = 0, mensualite = 0, name = '';
  for (const line of lines.slice(0, 30)) {
    const l = line.toLowerCase();
    const firstNum = toNum((line.match(/[\d][\d\s.,]*/)||[''])[0]);
    if (!name && /pr[eê]t|emprunt|cr[eé]dit/.test(l)) {
      const m = line.match(/[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ\s]{3,}/);
      if (m) name = m[0].trim().slice(0, 50);
    }
    if (/capital.*(emprunt|initial)|montant.*(pr[eê]t|emprunt)/.test(l) && firstNum > 1000 && !montantInitial) montantInitial = firstNum;
    if (/taux.*(annuel|nominal)/.test(l) && !tauxAnnuel) { const m = line.match(/([\d.,]+)\s*%/); if (m) tauxAnnuel = toNum(m[1]); }
    if (/dur[eé]e/.test(l) && !dureeMois) {
      const ma = line.match(/(\d+)\s*ans?/i); const mm = line.match(/(\d+)\s*mois/i);
      if (ma) dureeMois = parseInt(ma[1]) * 12;
      else if (mm) dureeMois = parseInt(mm[1]);
    }
    if (/mensualit/.test(l) && !mensualite && firstNum > 0) mensualite = firstNum;
  }

  // ── Détection et parsing du tableau d'amortissement ──
  let tableStart = -1, headers = [];
  for (let i = 0; i < Math.min(40, lines.length); i++) {
    const row = lines[i].split(sep).map(c => c.replace(/^"|"$/g,'').trim().toLowerCase());
    const hasDate = row.some(c => c === 'date' || /date.*(op|val|ech|[eé]ch)/.test(c) || c.includes('échéance'));
    const hasCRD  = row.some(c => c.includes('capital restant') || c === 'crd' || /restant.*(d[uû]|due)/.test(c));
    if (hasDate && hasCRD) { headers = row; tableStart = i + 1; break; }
    // Format sans header explicite : cherche une ligne numérique ressemblant à une première échéance
  }

  const schedule = [];
  if (tableStart >= 0) {
    const iDate = headers.findIndex(h => h === 'date' || /date.*(op|ech|[eé]ch)/.test(h) || h.includes('échéance'));
    const iCRD  = headers.findIndex(h => h.includes('capital restant') || h === 'crd' || /restant.*(d[uû]|due)/.test(h));
    const iMen  = headers.findIndex(h => h.includes('mensualit') || h.includes('montant'));

    for (let i = tableStart; i < lines.length; i++) {
      const row = lines[i].split(sep).map(c => c.replace(/^"|"$/g,'').trim());
      if (row.length < 3) continue;
      const date = iDate >= 0 ? toDate(row[iDate]) : '';
      const crd  = iCRD  >= 0 ? toNum(row[iCRD])  : 0;
      if (!date || crd < 0) continue;
      if (date) schedule.push({ date, capitalRestant: crd });
      if (iMen >= 0 && !mensualite) mensualite = toNum(row[iMen]);
    }
    if (!dureeMois && schedule.length) dureeMois = schedule.length;
    if (!montantInitial && schedule.length > 1) {
      // Estimation : CRD ligne 0 + capital amorti implicite de la 1ère mensualité
      montantInitial = schedule[0].capitalRestant;
    }
  }

  if (!schedule.length && !montantInitial) return null;
  return {
    name:           name || 'Crédit immobilier',
    montantInitial: Math.round(montantInitial),
    tauxAnnuel,
    dureeMois,
    dateDebut:      schedule.length ? schedule[0].date : '',
    mensualite:     Math.round(mensualite * 100) / 100,
    schedule        // stocké seulement si paramètres insuffisants pour formule
  };
}

async function importCreditImmo(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const notif = document.getElementById('pat-immo-notif');
  const show = (ok, msg) => {
    if (!notif) return;
    notif.style.display = 'block';
    notif.innerHTML = `<div class="notif${ok?' success':''}" style="${ok?'':'background:var(--red-bg);color:var(--red)'};margin-top:8px">${msg}</div>`;
    if (ok) setTimeout(() => { notif.style.display = 'none'; }, 7000);
  };

  const applyParsed = parsed => {
    const credit = { id: Date.now(), ...parsed, valeurBien: 0 };
    if (credit.montantInitial && credit.tauxAnnuel && credit.dureeMois && credit.dateDebut) credit.schedule = [];
    creditsImmo.push(credit);
    saveState(); renderPatrimoine();
    const crd = getCapitalRestantToday(credit);
    show(true, `✓ ${credit.name} importé — Capital restant dû au ${new Date().toLocaleDateString('fr-FR')} : <strong>${fmtE(Math.round(crd))}</strong>`);
  };

  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  try {
    // ── Étape 1 : extraction texte + parseur direct ──
    let textContent = '';
    if (isPDF) {
      try { textContent = await extractPDFText(file); } catch(e) { /* PDF.js indisponible ou PDF scanné */ }
    } else {
      textContent = await file.text();
    }

    if (textContent) {
      const parsed = parseCreditImmoFile(textContent);
      if (parsed) { applyParsed(parsed); return; }
    }

    // ── Étape 2 : fallback IA ──
    const key      = settings.aiApiKey || '';
    const provider = settings.aiProvider || 'openai';
    if (!key) {
      show(false, `Format non reconnu. Renseignez une clé API dans Paramètres pour analyser ce fichier automatiquement.`);
      return;
    }

    show(false, `<span style="color:var(--text2)">Analyse IA en cours…</span>`);

    const PROMPT = `Tu es un expert en crédit immobilier. Analyse ce tableau d'amortissement et extrais les données. Réponds UNIQUEMENT en JSON valide sans markdown :
{"name":"","montantInitial":0,"tauxAnnuel":0,"dureeMois":0,"dateDebut":"YYYY-MM-DD","mensualite":0,"schedule":[{"date":"YYYY-MM-DD","capitalRestant":0}]}
- name : nom ou référence du crédit
- montantInitial : capital emprunté en euros
- tauxAnnuel : taux nominal annuel en % (nombre seul, ex: 3.5)
- dureeMois : durée totale en mois
- dateDebut : date de la première échéance (YYYY-MM-DD)
- mensualite : mensualité hors assurance
- schedule : tableau complet des échéances si présent, sinon []`;

    let aiText = '';
    if (isPDF && provider === 'claude') {
      const readAsDataURL = f => new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f); });
      const b64  = (await readAsDataURL(file)).split(',')[1];
      const msgs = [{role:'user', content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:b64}},{type:'text',text:PROMPT}]}];
      aiText = await callAIForImport(provider, key, msgs);
    } else {
      const body = textContent || `Fichier : ${file.name} (${(file.size/1024).toFixed(0)} Ko) — impossible d'extraire le texte.`;
      aiText = await callAIForImport(provider, key, [{role:'user', content:`${PROMPT}\n\nContenu :\n${body.slice(0, 20000)}`}]);
    }

    let parsed = null;
    try { parsed = JSON.parse(aiText.replace(/```json|```/g,'').trim()); } catch(e) {}
    if (parsed?.montantInitial || parsed?.schedule?.length) {
      applyParsed(parsed);
    } else {
      show(false, `L'IA n'a pas pu extraire les données du fichier. Vérifiez qu'il s'agit bien d'un tableau d'amortissement.`);
    }
  } catch(e) {
    show(false, `Erreur : ${e.message}`);
  }
}

async function importPlacements(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const notif = document.getElementById('pat-placements-notif');
  const show = (ok, msg) => {
    if (!notif) return;
    notif.style.display = 'block';
    notif.innerHTML = `<div class="notif${ok?' success':''}" style="${ok?'':'background:var(--red-bg);color:var(--red)'};margin-top:8px">${msg}</div>`;
    if (ok) setTimeout(() => { notif.style.display = 'none'; }, 7000);
  };

  const applyParsed = parsed => {
    const name = parsed.accountName || 'Compte Titres';
    const bank = parsed.bank || 'Courtier';
    const balance = parseFloat(parsed.balance) || 0;
    const holdings = Array.isArray(parsed.holdings) ? parsed.holdings.map(h => ({
      name: h.name || 'Titre',
      ticker: h.ticker || '',
      quantity: parseFloat(h.quantity) || 0,
      price: parseFloat(h.price) || 0,
      value: parseFloat(h.value) || 0
    })) : [];

    let account = accounts.find(a => 
      ['epargne', 'invest'].includes(a.type) && 
      (a.name.toLowerCase() === name.toLowerCase() || (a.bank && a.bank.toLowerCase() === bank.toLowerCase() && a.name.toLowerCase().includes(name.toLowerCase())))
    );

    if (account) {
      account.balance = balance;
      account.holdings = holdings;
      show(true, `✓ Compte "${account.name}" mis à jour avec ${holdings.length} ligne(s) de titres. Solde : <strong>${fmtE(balance)}</strong>`);
    } else {
      const newAcc = {
        id: 'acc_' + Date.now(),
        name: name,
        bank: bank,
        type: 'invest',
        balance: balance,
        accountNumber: '',
        holdings: holdings
      };
      accounts.push(newAcc);
      show(true, `✓ Nouveau compte d'investissement "${name}" créé avec ${holdings.length} ligne(s) de titres. Solde : <strong>${fmtE(balance)}</strong>`);
    }

    saveState(); 
    renderPatrimoine();
    updateAccountDropdowns();
    renderAccounts();
    renderSettingsAccounts();
  };

  const isPDF = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');

  try {
    let textContent = '';
    if (isPDF) {
      try { textContent = await extractPDFText(file); } catch(e) { /* PDF.js exception */ }
    } else {
      textContent = await file.text();
    }

    const key      = settings.aiApiKey || '';
    const provider = settings.aiProvider || 'openai';
    if (!key) {
      show(false, `Renseignez une clé API dans Paramètres pour analyser ce fichier automatiquement.`);
      return;
    }

    show(false, `<span style="color:var(--text2)">Analyse IA en cours…</span>`);

    const PROMPT = `Tu es un extracteur de données financières expert en bourse et placements. Analyse ce relevé de compte-titres, PEA, assurance-vie ou portefeuille d'investissement et extrais les données. Réponds UNIQUEMENT en JSON valide sans markdown :
{
  "accountName": "Nom du compte (ex: PEA, Compte-Titres, Assurance-Vie...)",
  "bank": "Nom de la banque ou courtier (ex: BoursoBank, Fortuneo, Yomoni...)",
  "balance": 0.0,
  "holdings": [
    {
      "name": "Nom de la ligne / valeur / fonds / action (ex: Amundi MSCI World)",
      "ticker": "Ticker ou ISIN si disponible (ex: CW8 ou FR0010315770)",
      "quantity": 1.0,
      "price": 0.0,
      "value": 0.0
    }
  ]
}`;

    let aiText = '';
    if (isPDF && provider === 'claude') {
      const readAsDataURL = f => new Promise((res,rej) => { const r=new FileReader(); r.onload=e=>res(e.target.result); r.onerror=rej; r.readAsDataURL(f); });
      const b64  = (await readAsDataURL(file)).split(',')[1];
      const msgs = [{role:'user', content:[{type:'document',source:{type:'base64',media_type:'application/pdf',data:b64}},{type:'text',text:PROMPT}]}];
      aiText = await callAIForImport(provider, key, msgs);
    } else {
      const body = textContent || `Fichier : ${file.name} (${(file.size/1024).toFixed(0)} Ko) — impossible d'extraire le texte.`;
      aiText = await callAIForImport(provider, key, [{role:'user', content:`${PROMPT}\n\nContenu :\n${body.slice(0, 20000)}`}]);
    }

    let parsed = null;
    try { parsed = JSON.parse(aiText.replace(/```json|```/g,'').trim()); } catch(e) {}
    if (parsed && (parsed.accountName || parsed.holdings)) {
      applyParsed(parsed);
    } else {
      show(false, `L'IA n'a pas pu extraire les données du fichier. Vérifiez qu'il s'agit bien d'un relevé de titres.`);
    }
  } catch(e) {
    show(false, `Erreur : ${e.message}`);
  }
}


function deleteCreditImmo(id) {
  if (!confirm('Supprimer ce crédit ?')) return;
  creditsImmo = creditsImmo.filter(c => c.id !== id);
  saveState(); renderPatrimoine();
}

function updateValeurBienCredit(id, val) {
  const c = creditsImmo.find(c => c.id === id);
  if (!c) return;
  c.valeurBien = parseFloat(val) || 0;
  saveState(); renderPatrimoine();
}

function renderPatrimoine() {
  // ── Métriques comptes ──
  const finTotal = accounts.filter(a => ['epargne','invest'].includes(a.type)).reduce((s,a) => s + (a.balance||0), 0);
  const liqTotal = accounts.filter(a => ['courant','joint','pro'].includes(a.type)).reduce((s,a) => s + (a.balance||0), 0);

  // ── Crédits immo ──
  const totalCRD        = creditsImmo.reduce((s,c) => s + getCapitalRestantToday(c), 0);
  const totalValeurBien = creditsImmo.reduce((s,c) => s + (c.valeurBien||0), 0);
  const immoNet         = totalValeurBien - totalCRD;

  // ── Autres dettes (crédits dans abonnements) ──
  const autresDettes = abonnements.filter(a => CREDIT_CATS.has(a.cat) && a.cat !== 'immo').reduce((s,a) => s + (a.price * (a.dureeMoisRestants||0)), 0);
  const totalDettes  = totalCRD;

  const totalNet = finTotal + liqTotal + Math.max(0, immoNet);

  const setEl = (id, val) => { const e = document.getElementById(id); if (e) e.textContent = val; };
  setEl('pat-fin',    fmtE(finTotal + liqTotal));
  setEl('pat-immo',   totalValeurBien > 0 ? fmtE(immoNet)  : '— €');
  setEl('pat-total',  fmtE(totalNet));
  setEl('pat-dettes', totalCRD > 0 ? fmtE(totalCRD) : '— €');

  // ── Placements financiers ──
  const plaEl = document.getElementById('pat-placements-list');
  if (plaEl) {
    const finAccounts = accounts.filter(a => ['epargne','invest'].includes(a.type));
    plaEl.innerHTML = finAccounts.length
      ? finAccounts.map(a => {
          let holdingsHtml = '';
          if (a.holdings && a.holdings.length > 0) {
            holdingsHtml = `
              <div class="account-holdings" style="margin-top: 8px; margin-bottom: 4px; padding-left: 12px; border-left: 2px solid var(--border2); font-size: 11.5px; display: flex; flex-direction: column; gap: 6px;">
                ${a.holdings.map(h => `
                  <div style="display:flex; justify-content:space-between; align-items:center; color:var(--text2)">
                    <span style="font-weight: 400; line-height: 1.3;">
                      ${h.name}
                      ${h.ticker ? `<span style="font-family:var(--mono); color:var(--text3); font-size:10px; margin-left: 4px;">(${h.ticker})</span>` : ''}
                      ${h.quantity ? `<br><span style="color:var(--text3); font-size:10.5px;">${h.quantity} part${h.quantity > 1 ? 's' : ''} · ${fmtE(h.price || 0)}</span>` : ''}
                    </span>
                    <span style="font-family:var(--mono); font-weight:500; color:var(--text);">${fmtE(h.value || 0)}</span>
                  </div>
                `).join('')}
              </div>
            `;
          }
          return `
            <div style="padding: 10px 0; border-bottom: 1px solid var(--border);">
              <div class="row" style="margin: 0; padding: 0; border: none; align-items: center; justify-content: space-between;">
                <span class="row-label" style="font-weight: 500; font-size: 13.5px; color: var(--text);">
                  ${a.name}
                  <br><span style="font-size:10px;color:var(--text3)">${a.bank||''} · ${a.type === 'invest' ? 'Portefeuille' : 'Livret'}</span>
                </span>
                <span class="row-value rv-g" style="font-family:var(--mono); font-weight: 600; font-size: 14px;">${fmtE(a.balance||0)}</span>
              </div>
              ${holdingsHtml}
            </div>
          `;
        }).join('')
      : `<div style="color:var(--text3);font-size:13px;padding:1rem 0;text-align:center">Ajoutez des comptes épargne et investissement dans <button class="btn btn-sm" onclick="go('settings',document.querySelector('[onclick*=settings]'))">Paramètres</button></div>`;
  }

  // ── Liste des crédits immo ──
  const el = document.getElementById('pat-immo-credits');
  if (!el) return;
  if (!creditsImmo.length) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:.25rem 0 .5rem">Aucun crédit importé.</div>';
    setEl('pat-valeur-bien',     '— €');
    setEl('pat-capital-restant', '— €');
    setEl('pat-valeur-nette',    '— €');
    _updatePatChart([]);
    return;
  }

  el.innerHTML = creditsImmo.map(c => {
    const crd      = getCapitalRestantToday(c);
    const dateDebut = c.dateDebut ? new Date(c.dateDebut) : null;
    const dateFin   = dateDebut ? new Date(c.dateDebut) : null;
    if (dateFin && c.dureeMois) dateFin.setMonth(dateFin.getMonth() + c.dureeMois);
    const now = new Date();
    const moisPayés  = dateDebut ? Math.max(0, (now.getFullYear()-dateDebut.getFullYear())*12 + (now.getMonth()-dateDebut.getMonth())) : 0;
    const moisRest   = Math.max(0, (c.dureeMois||0) - moisPayés);
    const progress   = c.dureeMois ? Math.min(100, Math.round(moisPayés / c.dureeMois * 100)) : 0;
    const finStr     = dateFin ? dateFin.toLocaleDateString('fr-FR',{month:'short',year:'numeric'}) : '—';

    return `<div style="padding:10px 0;border-bottom:1px solid var(--border)">
      <div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:3px">
        <span style="font-size:13px;font-weight:500">${c.name}</span>
        <span style="font-family:var(--mono);font-size:13px;color:var(--red)">${fmtE(Math.round(crd))}</span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:10px 20px;font-size:11px;color:var(--text3);margin-bottom:6px">
        ${c.montantInitial ? `<span>Initial : ${fmtE(c.montantInitial)}</span>` : ''}
        ${c.tauxAnnuel     ? `<span>Taux : ${c.tauxAnnuel} %</span>` : ''}
        ${c.mensualite     ? `<span>Mensualité : ${fmtE(c.mensualite)}</span>` : ''}
        ${dateFin          ? `<span>Fin prévue : ${finStr}</span>` : ''}
        ${moisRest > 0     ? `<span>${moisRest} mois restants</span>` : ''}
      </div>
      <div style="background:var(--border);border-radius:3px;height:4px;overflow:hidden">
        <div style="height:100%;background:var(--red);width:${progress}%;border-radius:3px"></div>
      </div>
      <div style="font-size:10px;color:var(--text3);margin:2px 0 8px">${progress}% remboursé</div>
      <div style="display:flex;align-items:center;gap:10px">
        <input type="number" value="${c.valeurBien||''}" placeholder="Valeur du bien (€)"
          style="font-size:11px;padding:3px 6px;width:170px" step="1000"
          onchange="updateValeurBienCredit(${c.id}, this.value)">
        <span style="font-size:11px;color:var(--text3);cursor:pointer" onclick="deleteCreditImmo(${c.id})">✕ Supprimer</span>
      </div>
    </div>`;
  }).join('');

  setEl('pat-valeur-bien',     totalValeurBien > 0 ? fmtE(totalValeurBien) : '— €');
  setEl('pat-capital-restant', fmtE(Math.round(totalCRD)));
  setEl('pat-valeur-nette',    totalValeurBien > 0 ? fmtE(Math.round(immoNet)) : '— €');

  _updatePatChart(creditsImmo);
}

function _updatePatChart(credits) {
  if (!charts['pat']) return;
  const now = new Date();
  const labels = [], data = [];
  for (let y = 0; y <= 10; y++) {
    const d = new Date(now.getFullYear() + y, now.getMonth(), 1);
    const future = d.toISOString().slice(0,10);
    labels.push(y === 0 ? 'Auj.' : `+${y} an${y>1?'s':''}`);
    const crd = credits.reduce((s,c) => {
      if (c.schedule?.length) {
        const past = c.schedule.filter(r => r.date <= future);
        return s + (past.length ? Math.max(0, past[past.length-1].capitalRestant) : c.schedule[0]?.capitalRestant || 0);
      }
      const start = c.dateDebut ? new Date(c.dateDebut) : now;
      const k = Math.max(0, (d.getFullYear()-start.getFullYear())*12 + (d.getMonth()-start.getMonth()));
      return s + Math.max(0, _calcCRD(c.montantInitial, c.tauxAnnuel||0, c.dureeMois||0, k));
    }, 0);
    data.push(Math.round(crd));
  }
  charts['pat'].data.labels = labels;
  charts['pat'].data.datasets[0].data = data;
  charts['pat'].data.datasets[0].label = 'Capital restant dû';
  charts['pat'].data.datasets[0].borderColor = '#8b2020';
  charts['pat'].data.datasets[0].backgroundColor = 'rgba(139,32,32,.08)';
  charts['pat'].update();
}

// ── ACCOUNTS ──
function renderAccounts() {
  const el = document.getElementById('accounts-list');
  if (!el) return;
  if (!accounts.length) {
    el.innerHTML = '<div style="padding:1.5rem;text-align:center;font-size:13px;color:var(--text3)">Aucun compte configuré · <button class="btn btn-sm" onclick="go(\'settings\',document.querySelector(\'[onclick*=settings]\'))">Ajouter un compte</button></div>';
    return;
  }
  const byBank = {};
  accounts.forEach(a => { const b = a.bank||'Autre'; if (!byBank[b]) byBank[b]=[]; byBank[b].push(a); });
  let html = '';
  for (const [bank, accs] of Object.entries(byBank)) {
    html += `<div class="account-section-label">${bank}</div>`;
    accs.forEach(a => {
      const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.courant;
      const bal = a.balance || 0;
      html += `<div class="account-row" onclick="goToAccountTransactions('${a.id}')">
        <div class="account-icon" style="background:var(${t.color})">${t.icon}</div>
        <div class="account-info"><div class="account-name">${a.name}</div><div class="account-num">${a.accountNumber ? '···'+a.accountNumber : t.label}</div></div>
        <div class="account-bal ${bal>0?'pos':bal<0?'neg':'neu'}">${fmtE(bal)}</div>
        <div class="account-arrow">›</div>
      </div>`;
    });
  }
  el.innerHTML = html;
  updateTotalLiquidity();
}

function updateAccountDropdowns() {
  const opts = accounts.map(a => `<option value="${a.id}">${a.name}${a.bank?' · '+a.bank:''}</option>`).join('');
  const ph = '<option value="">— Compte —</option>';
  ['tx-account','abo-account'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = ph + opts;
  });
  const fa = document.getElementById('tx-filter-account');
  if (fa) fa.innerHTML = '<option value="">Tous comptes</option>' + opts;
}

function addAccount() {
  const name  = document.getElementById('acc-name').value.trim();
  const bank  = document.getElementById('acc-bank').value.trim();
  const type  = document.getElementById('acc-type').value;
  const bal   = parseFloat(document.getElementById('acc-balance').value)||0;
  const num   = document.getElementById('acc-number').value.trim();
  if (!name || !bank) { alert('Nom et banque requis.'); return; }
  accounts.push({ id:'acc_'+Date.now(), name, bank, type, balance:bal, accountNumber:num });
  saveState();
  renderAccounts(); renderSettingsAccounts(); updateAccountDropdowns();
  ['acc-name','acc-bank','acc-number'].forEach(id => { const e = document.getElementById(id); if(e) e.value=''; });
  document.getElementById('acc-balance').value = '0';
}

function deleteAccount(id) {
  if (!confirm('Supprimer ce compte ?')) return;
  accounts = accounts.filter(a => a.id !== id);
  saveState();
  renderAccounts(); renderSettingsAccounts(); updateAccountDropdowns(); updateTotalLiquidity();
}

function updateAccountBalance(id) {
  const el = document.getElementById('bal-'+id);
  if (!el) return;
  const acc = accounts.find(a => a.id === id);
  if (!acc) return;
  acc.balance = parseFloat(el.value)||0;
  saveState();
  renderAccounts(); updateTotalLiquidity();
}

function renderSettingsAccounts() {
  const el = document.getElementById('settings-accounts-list');
  if (!el) return;
  if (!accounts.length) { el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">Aucun compte ajouté.</div>'; return; }
  el.innerHTML = accounts.map(a => {
    const t = ACCOUNT_TYPES[a.type] || ACCOUNT_TYPES.courant;
    return `<div class="acc-settings-row" id="acc-row-${a.id}">
      <div class="row" style="gap:8px;align-items:center;flex-wrap:wrap">
        <span style="font-size:16px">${t.icon}</span>
        <span class="row-label" style="flex:1;min-width:120px">${a.name} <span style="font-size:11px;color:var(--text3)">${a.bank}</span>${a.accountNumber?`<span style="font-size:10px;color:var(--text3);margin-left:4px">···${a.accountNumber}</span>`:''}</span>
        <input type="number" id="bal-${a.id}" value="${a.balance||0}" step="0.01" style="width:110px;font-family:var(--mono)" onchange="updateAccountBalance('${a.id}')">
        <span style="font-size:11px;color:var(--text3)">€</span>
        <button class="btn btn-sm" onclick="editAccount('${a.id}')" title="Modifier">✎</button>
        <button class="btn btn-sm" style="color:var(--red)" onclick="deleteAccount('${a.id}')">✕</button>
      </div>
    </div>`;
  }).join('');
}

function editAccount(id) {
  const a = accounts.find(a => a.id === id);
  if (!a) return;
  const row = document.getElementById(`acc-row-${id}`);
  if (!row) return;
  const typeOptions = Object.entries(ACCOUNT_TYPES).map(([k,v]) =>
    `<option value="${k}"${a.type===k?' selected':''}>${v.label}</option>`).join('');
  row.innerHTML = `
    <div style="background:var(--surface3,rgba(0,0,0,.04));border-radius:var(--radius);padding:12px;display:flex;flex-direction:column;gap:8px">
      <div class="form-grid three" style="margin:0">
        <div class="form-group" style="margin:0">
          <label class="form-label">Nom</label>
          <input type="text" id="edit-name-${id}" value="${a.name||''}" placeholder="Nom du compte">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Banque</label>
          <input type="text" id="edit-bank-${id}" value="${a.bank||''}" placeholder="BNP, Bourso…">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">Type</label>
          <select id="edit-type-${id}">${typeOptions}</select>
        </div>
      </div>
      <div class="form-grid three" style="margin:0">
        <div class="form-group" style="margin:0">
          <label class="form-label">Solde (€)</label>
          <input type="number" id="edit-bal-${id}" value="${a.balance||0}" step="0.01">
        </div>
        <div class="form-group" style="margin:0">
          <label class="form-label">N° compte</label>
          <input type="text" id="edit-num-${id}" value="${a.accountNumber||''}" placeholder="4 derniers chiffres" maxlength="10">
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="saveAccountEdit('${id}')">Enregistrer</button>
        <button class="btn btn-sm" onclick="renderSettingsAccounts()">Annuler</button>
      </div>
    </div>`;
}

function saveAccountEdit(id) {
  const a = accounts.find(a => a.id === id);
  if (!a) return;
  a.name          = document.getElementById(`edit-name-${id}`)?.value.trim() || a.name;
  a.bank          = document.getElementById(`edit-bank-${id}`)?.value.trim() || a.bank;
  a.type          = document.getElementById(`edit-type-${id}`)?.value || a.type;
  a.balance       = parseFloat(document.getElementById(`edit-bal-${id}`)?.value) || 0;
  a.accountNumber = document.getElementById(`edit-num-${id}`)?.value.trim() || '';
  saveState();
  renderAccounts();
  renderSettingsAccounts();
  updateAccountDropdowns();
  showSyncBadge('Compte mis à jour');
}

// ── SETTINGS ──
function updateDisplayName() {
  const nameEl = document.getElementById('user-display-name');
  if (!nameEl) return;
  nameEl.textContent = settings.displayName || 'Profil';
}

function saveSettings() {
  settings.displayName = document.getElementById('set-display-name')?.value.trim() || '';
  settings.aiProvider  = document.getElementById('set-provider')?.value || 'openai';
  settings.aiApiKey    = document.getElementById('set-api-key')?.value.trim() || '';
  saveState();
  updateDisplayName();
  showSyncBadge('Paramètres enregistrés');
}

function loadSettingsUI() {
  const dn = document.getElementById('set-display-name');
  const p  = document.getElementById('set-provider');
  const k  = document.getElementById('set-api-key');
  if (dn) dn.value = settings.displayName || '';
  if (p)  p.value  = settings.aiProvider  || 'openai';
  if (k)  k.value  = settings.aiApiKey    || '';
}

// ── BUDGET ──
const CHARGES_PERSO_BOURSO = 0;

const _BUDGET_SLIDER_IDS = ['sl-rev','sl-contrib','sl-contrib-e','sl-contrib-as','sl-dv','sl-pp','sl-pj','sl-pi','sl-tr','sl-rd','sl-bourse-duree','sl-bourse-risque'];
const _BUDGET_INPUT_IDS  = ['bourse-montant','bourse-mensuel'];

function saveBudget() {
  _BUDGET_SLIDER_IDS.concat(_BUDGET_INPUT_IDS).forEach(id => {
    const el = document.getElementById(id);
    if (el && el.value !== '') budget[id] = el.value;
  });
  saveState();
}

function loadBudgetSliders() {
  _BUDGET_SLIDER_IDS.concat(_BUDGET_INPUT_IDS).forEach(id => {
    if (budget[id] !== undefined) {
      const el = document.getElementById(id);
      if (el) el.value = budget[id];
    }
  });
}

function calcBudget() {
  const rev = +document.getElementById('sl-rev').value;
  const contrib = +document.getElementById('sl-contrib').value;
  const dv = +document.getElementById('sl-dv').value;
  const aboTotal = abonnements.reduce((s, a) => s + a.price, 0);
  const disp = rev - contrib - CHARGES_PERSO_BOURSO - dv - aboTotal;
  document.getElementById('sl-rev-out').textContent = rev.toLocaleString('fr-FR')+' €';
  document.getElementById('sl-contrib-out').textContent = contrib.toLocaleString('fr-FR')+' €';
  document.getElementById('sl-dv-out').textContent = dv.toLocaleString('fr-FR')+' €';
  document.getElementById('bm-rev').textContent = rev.toLocaleString('fr-FR')+' €';
  document.getElementById('bm-cf').textContent = '-'+contrib.toLocaleString('fr-FR')+' €';
  document.getElementById('bm-dv').textContent = '-'+dv.toLocaleString('fr-FR')+' €';
  document.getElementById('bm-disp').textContent = disp.toLocaleString('fr-FR')+' €';
  // sync dashboard metrics
  document.getElementById('dm-rev').textContent = rev.toLocaleString('fr-FR')+' €';
  document.getElementById('dm-cf').textContent = '-'+contrib.toLocaleString('fr-FR')+' €';
  document.getElementById('dm-disp').textContent = disp.toLocaleString('fr-FR')+' €';
  // keep sl-contrib-e in sync with sl-contrib (same person)
  const ce = document.getElementById('sl-contrib-e');
  if (ce) { ce.value = contrib; document.getElementById('sl-contrib-e-out').textContent = contrib.toLocaleString('fr-FR')+' €'; }
  const now = new Date().toISOString().slice(0,7);
  const immoAmt = transactions.filter(t => t.cat === 'immo' && t.date?.slice(0,7) === now && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const creditAmt = transactions.filter(t => t.cat === 'credit' && t.date?.slice(0,7) === now && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const ti = rev > 0 ? (immoAmt/rev*100).toFixed(1) : '0.0';
  const tt = rev > 0 ? ((immoAmt+creditAmt)/rev*100).toFixed(1) : '0.0';
  document.getElementById('taux-immo').textContent = ti+' %';
  document.getElementById('taux-total').textContent = tt+' %';
  document.getElementById('pf-immo').style.width = ti+'%';
  document.getElementById('pf-total').style.width = Math.min(tt,100)+'%';
  calcJoint();
  updateDonutChart();
  updateSidebar();
  saveBudget();
}

function calcJoint() {
  const e = +document.getElementById('sl-contrib-e').value;
  const as = +document.getElementById('sl-contrib-as').value;
  const total = e + as;
  const nowJ = new Date().toISOString().slice(0,7);
  const jointAccIds = accounts.filter(a => a.type === 'joint').map(a => a.id);
  const chargesJoint = transactions.filter(t => jointAccIds.includes(t.account) && t.date?.slice(0,7) === nowJ && t.amount < 0).reduce((s,t) => s + Math.abs(t.amount), 0);
  const marge = total - chargesJoint;
  const part = total > 0 ? Math.round(e/total*100) : 0;
  document.getElementById('sl-contrib-e-out').textContent = e.toLocaleString('fr-FR')+' €';
  document.getElementById('sl-contrib-as-out').textContent = as.toLocaleString('fr-FR')+' €';
  document.getElementById('joint-total').textContent = total.toLocaleString('fr-FR')+' €';
  const jcEl = document.getElementById('joint-charges');
  if (jcEl) jcEl.textContent = chargesJoint > 0 ? '-'+Math.round(chargesJoint).toLocaleString('fr-FR')+' €' : '— €';
  document.getElementById('joint-marge').textContent = (marge >= 0 ? '+' : '')+Math.round(marge).toLocaleString('fr-FR')+' €';
  document.getElementById('joint-marge').style.color = marge >= 0 ? 'var(--green)' : 'var(--red)';
  document.getElementById('joint-part').textContent = part+' %';
  // sync sl-contrib with sl-contrib-e
  const sc = document.getElementById('sl-contrib');
  if (sc) { sc.value = e; document.getElementById('sl-contrib-out').textContent = e.toLocaleString('fr-FR')+' €'; }
  const rev = +document.getElementById('sl-rev').value;
  const dv = +document.getElementById('sl-dv').value;
  const aboTotal = abonnements.reduce((s, a) => s + a.price, 0);
  const disp = rev - e - CHARGES_PERSO_BOURSO - dv - aboTotal;
  document.getElementById('bm-cf').textContent = '-'+e.toLocaleString('fr-FR')+' €';
  document.getElementById('bm-disp').textContent = disp.toLocaleString('fr-FR')+' €';
  document.getElementById('dm-cf').textContent = '-'+e.toLocaleString('fr-FR')+' €';
  document.getElementById('dm-disp').textContent = disp.toLocaleString('fr-FR')+' €';
  updateSidebar();
}

// ── ÉPARGNE ──
function calcEpargne() {
  const aboTotal = abonnements.reduce((s, a) => s + a.price, 0);
  const cap = (+document.getElementById('sl-rev').value||0) - (+document.getElementById('sl-contrib-e')?.value||0) - CHARGES_PERSO_BOURSO - (+document.getElementById('sl-dv').value||0) - aboTotal;
  const pp = +document.getElementById('sl-pp').value;
  const pj = +document.getElementById('sl-pj').value;
  const pi = +document.getElementById('sl-pi').value;
  const tot = pp+pj+pi||1;
  const prec = cap*(pp/100);
  const proj = cap*(pj/100);
  const inv = cap*(pi/100);
  document.getElementById('sl-pp-out').textContent = pp+' %';
  document.getElementById('sl-pj-out').textContent = pj+' %';
  document.getElementById('sl-pi-out').textContent = pi+' %';
  document.getElementById('em-cap').textContent = Math.round(cap).toLocaleString('fr-FR')+' €';
  document.getElementById('em-prec').textContent = Math.round(prec).toLocaleString('fr-FR')+' €';
  document.getElementById('em-proj').textContent = Math.round(proj).toLocaleString('fr-FR')+' €';
  document.getElementById('em-inv').textContent = Math.round(inv).toLocaleString('fr-FR')+' €';
  const bar = document.getElementById('epargne-bar');
  bar.children[0].style.width=(pp/tot*100)+'%';
  bar.children[1].style.width=(pj/tot*100)+'%';
  bar.children[2].style.width=(pi/tot*100)+'%';
  document.getElementById('ll-p').textContent='Précaution · '+pp+' % · '+Math.round(prec).toLocaleString('fr-FR')+' €';
  document.getElementById('ll-j').textContent='Projets · '+pj+' % · '+Math.round(proj).toLocaleString('fr-FR')+' €';
  document.getElementById('ll-i').textContent='Investissement · '+pi+' % · '+Math.round(inv).toLocaleString('fr-FR')+' €';
  document.getElementById('rv-tr-sugg').textContent='~'+Math.round(inv).toLocaleString('fr-FR')+' €/mois';
  calcTR();
  saveBudget();
}
function calcTR() {
  document.getElementById('sl-tr-out').textContent = (+document.getElementById('sl-tr').value).toLocaleString('fr-FR')+' €';
  document.getElementById('sl-rd-out').textContent = (+document.getElementById('sl-rd').value).toFixed(1)+' %';
  initTRChart();
  saveBudget();
}

// ── SIDEBAR FOOTER ──
function updateSidebar() {
  const rev = +document.getElementById('sl-rev')?.value||0;
  const contrib = +document.getElementById('sl-contrib-e')?.value||0;
  const dv = +document.getElementById('sl-dv')?.value||0;
  document.getElementById('sf-rev').textContent = 'Revenus : '+rev.toLocaleString('fr-FR')+' €';
  const aboTotal = abonnements.reduce((s, a) => s + a.price, 0);
  document.getElementById('sf-disp').textContent = 'Disponible : '+(rev-contrib-CHARGES_PERSO_BOURSO-dv-aboTotal).toLocaleString('fr-FR')+' €';
}

// ── CSV PARSER ──
function parseCSVDirect(content) {
  // Strip UTF-8 BOM if present
  content = content.replace(/^﻿/, '');

  const lines = content.trim().split(/\r?\n/);
  if (lines.length < 2) return null;

  const sep = lines[0].split(';').length > lines[0].split(',').length ? ';' : ',';
  const headers = lines[0].split(sep).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

  const col = (row, ...names) => {
    for (const name of names) {
      const i = headers.indexOf(name);
      if (i >= 0 && row[i] !== undefined) {
        const v = row[i].trim().replace(/^"|"$/g, '');
        if (v) return v;
      }
    }
    return '';
  };

  const toDate = s => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? `${m[3]}-${m[2]}-${m[1]}` : s;
  };

  const toAmt = s => parseFloat(s.replace(/[\s ]/g, '').replace(',', '.').replace('+', '')) || 0;

  const guessCat = (label, cat) => {
    const l = `${label} ${cat}`.toLowerCase();
    // Crédits immobiliers
    if (/ech pret|echeance de credit|emprunt immobilier/.test(l)) return 'immo';
    // Assurances / crédits
    if (/assur/.test(l)) return 'credit';
    if (/credit|crédit|pret|prêt|banque et assurances/.test(l)) return 'credit';
    // Revenus
    if (/salaire|paie/.test(l)) return 'salaire';
    if (/mercer|drfip|paje|mgen remboursement/.test(l)) return 'salaire';
    // Abonnements téléphonie / streaming
    if (/telephonie|téléphonie|free mobile|sfr|orange |bouygues|multi impact/.test(l)) return 'abonnement';
    if (/netflix|spotify|canal\+?|youtube|nintendo|audible|microsoft|verisure/.test(l)) return 'abonnement';
    if (/abonnement/.test(l)) return 'abonnement';
    // Logement / travaux
    if (/bricolage|travaux|renovation|renov/.test(l)) return 'travaux';
    if (/logement|agence du sud|energie|electricit|gaz|totalenergies/.test(l)) return 'immo';
    // Restaurants / loisirs
    if (/loisirs et sorties|restaurant|bistro|brasserie|pizza|sushi|burger|bar |cafe |fournaise|enjoy sushi|cutback|amorino/.test(l)) return 'restaurant';
    // Alimentation
    if (/alimentation|intermarche|auchan|carrefour|leclerc|lidl|aldi|monoprix|picard|franprix|casino |paul |alma /.test(l)) return 'alimentation';
    // Transport / voyage
    if (/hotel|hébergement|hebergement|voyage|voyages/.test(l)) return 'voyage';
    if (/carburant|auto & moto|sncf|ratp|navigo|transport|parking|indigo/.test(l)) return 'transport';
    // Santé
    if (/pharmacie|sant[ée]|m[eé]decin|hopital|mgen|cpam/.test(l)) return 'sante';
    // Vêtements
    if (/v[eê]tement/.test(l)) return 'vetements';
    // Loisirs / divertissement
    if (/loisirs|divertissement|cin[eé]|concert|fnac|amazon|google|steam|jeux/.test(l)) return 'loisirs';
    return 'divers';
  };

  // Caisse d'Épargne / Banque Populaire format
  const isCE = headers.includes('date de comptabilisation') && headers.includes('libelle simplifie');
  // BoursoBank export format
  const isBourso = headers.includes('dateop') && headers.includes('amount') && headers.includes('label');
  // Generic fallback
  const hasDate = headers.some(h => h.includes('date'));
  const hasAmt  = headers.some(h => ['montant','amount','debit','credit'].includes(h));
  if (!isCE && !isBourso && !(hasDate && hasAmt)) return null;

  // Detect source account from CSV and match against configured accounts
  // Returns { id, matched } where matched=false means fallback to accounts[0]
  const matchAccount = (csvLabel, csvNum) => {
    const lbl = (csvLabel || '').toLowerCase().trim();
    const num = (csvNum || '').replace(/\s/g, '');
    for (const a of accounts) {
      const aNum = (a.accountNumber || '').replace(/\s/g, '');
      if (aNum && num && (num.endsWith(aNum) || aNum.endsWith(num.slice(-4)))) return { id: a.id, matched: true };
      const aName = (a.name || '').toLowerCase();
      if (lbl && aName && (aName.includes(lbl.split(' ')[0]) || lbl.includes(aName.split(' ')[0]))) return { id: a.id, matched: true };
    }
    return { id: accounts[0]?.id || '', matched: false };
  };

  // Extract account info from first data row
  let csvAccountId = accounts[0]?.id || '';
  let csvAccountLabel = '';
  let csvAccountMatched = false;
  if (lines.length > 1) {
    const firstRow = lines[1].trim().split(sep);
    if (isBourso) {
      const csvLabel = col(firstRow, 'accountlabel');
      const csvNum   = col(firstRow, 'accountnum');
      csvAccountLabel = csvLabel;
      const m = matchAccount(csvLabel, csvNum);
      csvAccountId = m.id;
      csvAccountMatched = m.matched;
    } else if (isCE) {
      csvAccountId = accounts[0]?.id || '';
      csvAccountMatched = !!accounts[0];
    }
  }

  const txs = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const row = line.split(sep);

    let date, label, amount, cat;

    if (isCE) {
      date  = toDate(col(row, 'date de comptabilisation', 'date operation'));
      label = col(row, 'libelle simplifie') || col(row, 'libelle operation');
      cat   = col(row, 'categorie') + ' ' + col(row, 'sous categorie') + ' ' + col(row, 'type operation');
      const debit  = col(row, 'debit');
      const credit = col(row, 'credit');
      if (debit)       amount = -Math.abs(toAmt(debit));
      else if (credit) amount =  Math.abs(toAmt(credit));
      else continue;

    } else if (isBourso) {
      date  = toDate(col(row, 'dateop', 'dateval'));
      label = col(row, 'suggestedlabel') || col(row, 'label');
      cat   = col(row, 'category') + ' ' + col(row, 'categoryparent');
      amount = toAmt(col(row, 'amount'));

    } else {
      date  = toDate(col(row, 'date', 'dateop', 'dateval', 'date operation', 'date de comptabilisation'));
      label = col(row, 'libelle', 'label', 'suggestedlabel', 'description', 'libelle simplifie', 'libelle operation');
      cat   = col(row, 'categorie', 'category') + ' ' + col(row, 'sous categorie', 'categoryparent');
      const montant = col(row, 'montant', 'amount');
      const debit   = col(row, 'debit');
      const credit  = col(row, 'credit');
      if (montant)       amount = toAmt(montant);
      else if (debit)    amount = -Math.abs(toAmt(debit));
      else if (credit)   amount =  Math.abs(toAmt(credit));
      else continue;
    }

    if (!date || !label || isNaN(amount) || amount === 0) continue;
    txs.push({ date, label, amount, categorie: guessCat(label, cat), accountId: csvAccountId });
  }

  if (!txs.length) return null;
  const dates = txs.map(t => t.date).sort();
  const matchedAccount = accounts.find(a => a.id === csvAccountId);
  return {
    type: 'Relevé bancaire CSV',
    periode: `${dates[0]} → ${dates[dates.length - 1]}`,
    titulaire: csvAccountLabel || matchedAccount?.name || '',
    accountId: csvAccountId,
    accountName: matchedAccount?.name || csvAccountLabel || '',
    accountMatched: csvAccountMatched,
    transactions: txs
  };
}

// ── IMPORT ──
function dragOver(e) { e.preventDefault(); document.getElementById('drop-zone').classList.add('drag-over'); }
function dragLeave(e) { document.getElementById('drop-zone').classList.remove('drag-over'); }
function dropFile(e) { e.preventDefault(); dragLeave(e); handleFiles(e.dataTransfer.files); }
function handleFiles(files) {
  Array.from(files).forEach(f => {
    importedFiles.push(f);
    const fileItem = addFileToList(f);
    analyzeFile(f, fileItem);
  });
}
function addFileToList(file) {
  const list = document.getElementById('file-list');
  const size = (file.size/1024/1024).toFixed(2)+' Mo';
  const div = document.createElement('div');
  div.className = 'file-item';
  const nameWithoutExt = file.name.replace(/\.[^.]+$/, '');
  div.innerHTML = `<span class="file-item-icon">📄</span><span class="file-item-name" contenteditable="true" spellcheck="false" title="Cliquer pour renommer">${nameWithoutExt}</span><span class="file-item-size">${size}</span><span class="file-item-status badge badge-a">analyse…</span>`;
  list.appendChild(div);
  return div;
}
async function extractPDFText(file) {
  const pdfjsLib = window['pdfjs-dist/build/pdf'];
  if (!pdfjsLib) throw new Error('PDF.js non chargé');
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;
  let text = '';
  for (let i = 1; i <= Math.min(pdf.numPages, 10); i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(item => item.str).join(' ') + '\n';
  }
  return text.trim();
}
async function callAIForImport(provider, key, messages) {
  if (provider === 'claude') {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-use':'true'},
      body: JSON.stringify({model:'claude-opus-4-5', max_tokens:2000, messages})
    });
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const data = await resp.json();
    if (data.error) throw new Error(data.error.message);
    return data.content?.[0]?.text || '';
  }
  if (provider === 'gemini') {
    const parts = messages.flatMap(m => Array.isArray(m.content) ? m.content.map(c => c.type==='text'?{text:c.text}:c) : [{text:m.content}]);
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({contents:[{parts}]})
    });
    if (!resp.ok) throw new Error('HTTP '+resp.status);
    const data = await resp.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }
  // OpenAI (défaut)
  const resp = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {'Content-Type':'application/json','Authorization':'Bearer '+key},
    body: JSON.stringify({model:_env.OPENAI_MODEL||'gpt-4o', max_tokens:2000, messages})
  });
  if (!resp.ok) throw new Error('HTTP '+resp.status);
  const data = await resp.json();
  if (data.error) throw new Error(data.error.message);
  return data.choices?.[0]?.message?.content || '';
}
async function analyzeFile(file, fileItem) {
  const setStatus = (cls, text) => {
    if (!fileItem) return;
    const s = fileItem.querySelector('.file-item-status');
    if (s) { s.className = `file-item-status badge ${cls}`; s.textContent = text; }
  };
  const result = document.getElementById('import-result');
  result.innerHTML = `<div style="padding:1.5rem;text-align:center;font-size:13px;color:var(--text3)">Analyse de <strong>${file.name}</strong> en cours...</div>`;
  const isImage = file.type.startsWith('image/');
  const isPDF   = file.type === 'application/pdf';

  // CSV/TXT : tentative de parseur direct sans IA
  if (!isImage && !isPDF) {
    try {
      const content = await file.text();
      const direct = parseCSVDirect(content);
      if (direct) {
        const imported = importTransactions(direct.transactions);
        setStatus('badge-g', `${imported} importées`);
        const accLabel = direct.accountName ? ` → ${direct.accountName}` : '';
        let html = `<div class="notif success">✓ ${imported} transaction(s) importée(s) — ${direct.periode}${accLabel}</div>`;
        if (direct.accountName && !direct.accountMatched) {
          html += `<div class="notif" style="font-size:12px">⚠ Compte "${direct.accountName}" non reconnu — transactions affectées au premier compte. Configurez vos comptes dans Paramètres.</div>`;
        }
        html += `<div style="margin-top:12px"><div class="card-title">${imported} transactions importées</div>`;
        direct.transactions.slice(0, 15).forEach(t => {
          html += `<div class="tx-row"><div class="tx-info"><div class="tx-name">${t.label}</div><div class="tx-meta">${t.date}</div></div><div class="tx-amount" style="color:${t.amount>=0?'var(--green)':'var(--red)'}">${fmtE(t.amount)}</div></div>`;
        });
        if (direct.transactions.length > 15) html += `<div style="font-size:11px;color:var(--text3);padding:6px 0">… et ${direct.transactions.length - 15} autres</div>`;
        result.innerHTML = html + '</div>';
        return;
      }
    } catch(e) { /* ignore, continue to AI */ }
  }

  const key = settings.aiApiKey || '';
  if (!key) {
    setStatus('badge-r', 'clé API manquante');
    result.innerHTML = `<div class="notif">Renseignez votre clé API dans Paramètres pour activer l'analyse automatique.</div>
    <div style="padding:1rem;font-size:13px;color:var(--text2)">
      <strong>Document détecté :</strong> ${file.name} (${(file.size/1024).toFixed(0)} Ko)<br><br>
      Sans clé API, ajoutez les transactions manuellement via l'onglet Transactions.
    </div>`;
    return;
  }

  const provider = settings.aiProvider || 'openai';
  const PROMPT  = `Tu es un extracteur de données financières. Voici le contenu d'un document bancaire. Extrais : 1) Type de document 2) Période 3) Titulaire 4) Soldes début/fin 5) Toutes les transactions (date, libellé, montant numérique, catégorie parmi : salaire/immo/credit/alimentation/restaurant/sante/transport/loisirs/vetements/voyage/travaux/abonnement/epargne/divers) 6) Données fiscales si présentes. Réponds UNIQUEMENT en JSON valide sans markdown : {"type":"","periode":"","titulaire":"","solde_debut":0,"solde_fin":0,"transactions":[{"date":"YYYY-MM-DD","label":"","amount":0,"categorie":""}],"fiscal":{"revenu_imposable":0,"impot":0,"taux_marginal":""}}`;

  const readAsDataURL = f => new Promise((res, rej) => {
    const r = new FileReader(); r.onload = e => res(e.target.result); r.onerror = rej; r.readAsDataURL(f);
  });

  try {
    let aiText;

    if (!isImage && !isPDF) {
      // Fallback IA pour les CSV non reconnus par le parseur direct
      const content = await file.text();
      const body = `${PROMPT}\n\nContenu du fichier "${file.name}" :\n${content.slice(0, 20000)}`;
      aiText = await callAIForImport(provider, key, [{role:'user', content: body}]);

    } else if (isImage) {
      const dataUrl = await readAsDataURL(file);
      const b64 = dataUrl.split(',')[1];
      const msgs = provider === 'claude'
        ? [{role:'user', content:[{type:'image', source:{type:'base64', media_type:file.type, data:b64}},{type:'text', text:PROMPT}]}]
        : [{role:'user', content:[{type:'image_url', image_url:{url:dataUrl}},{type:'text', text:PROMPT}]}];
      aiText = await callAIForImport(provider, key, msgs);

    } else if (isPDF) {
      if (provider === 'claude') {
        const b64 = (await readAsDataURL(file)).split(',')[1];
        const msgs = [{role:'user', content:[
          {type:'document', source:{type:'base64', media_type:'application/pdf', data:b64}},
          {type:'text', text:PROMPT}
        ]}];
        aiText = await callAIForImport(provider, key, msgs);
      } else {
        const pdfText = await extractPDFText(file);
        if (!pdfText) throw new Error('Impossible d\'extraire le texte du PDF (document scanné ?)');
        const body = `${PROMPT}\n\nContenu du PDF "${file.name}" :\n${pdfText.slice(0, 20000)}`;
        aiText = await callAIForImport(provider, key, [{role:'user', content: body}]);
      }
    }

    let parsed = null;
    try { parsed = JSON.parse(aiText.replace(/```json|```/g, '').trim()); } catch(e) {}
    if (parsed) {
      let html = '';
      if (parsed.periode)   html += `<div class="row"><span class="row-label">Période</span><span class="row-value">${parsed.periode}</span></div>`;
      if (parsed.titulaire) html += `<div class="row"><span class="row-label">Titulaire</span><span class="row-value">${parsed.titulaire}</span></div>`;
      if (parsed.solde_fin) html += `<div class="row"><span class="row-label">Solde final</span><span class="row-value rv-g">${parsed.solde_fin}</span></div>`;
      if (parsed.transactions?.length) {
        const imported = importTransactions(parsed.transactions);
        setStatus('badge-g', `${imported} importées`);
        html = `<div class="notif success">✓ ${imported} transaction(s) importée(s) depuis ${parsed.type || file.name}</div>` + html;
        html += `<div style="margin-top:12px"><div class="card-title">${imported} transactions importées</div>`;
        parsed.transactions.slice(0, 15).forEach(t => {
          const amt = parseFloat(String(t.amount).replace(/[€\s+]/g,'').replace(',','.'));
          html += `<div class="tx-row"><div class="tx-info"><div class="tx-name">${t.label}</div><div class="tx-meta">${t.date}</div></div><div class="tx-amount" style="color:${!isNaN(amt)&&amt>=0?'var(--green)':'var(--red)'}">${t.amount}</div></div>`;
        });
        if (parsed.transactions.length > 15) html += `<div style="font-size:11px;color:var(--text3);padding:6px 0">… et ${parsed.transactions.length - 15} autres</div>`;
        html += `</div>`;
      } else {
        setStatus('badge-a', 'aucune tx');
        html = `<div class="notif success">Document analysé : ${parsed.type || file.name} — aucune transaction détectée.</div>` + html;
      }
      if (parsed.fiscal?.revenu_imposable) {
        html += `<div style="margin-top:12px"><div class="card-title">Informations fiscales</div>
          <div class="row"><span class="row-label">Revenu imposable</span><span class="row-value">${parsed.fiscal.revenu_imposable}</span></div>
          <div class="row"><span class="row-label">Impôt</span><span class="row-value rv-r">${parsed.fiscal.impot}</span></div>
        </div>`;
      }
      result.innerHTML = html;
    } else {
      setStatus('badge-r', 'erreur JSON');
      result.innerHTML = `<div class="card-title">Résultat de l'analyse</div><div style="font-size:13px;white-space:pre-wrap;padding:8px;font-family:var(--mono);font-size:12px;color:var(--text2)">${aiText}</div>`;
    }
  } catch(err) {
    setStatus('badge-r', 'erreur');
    result.innerHTML = `<div class="notif" style="background:var(--red-bg);color:var(--red)">Erreur : ${err.message}</div>`;
  }
}
async function handleTxImportFile(input) {
  const file = input.files[0];
  if (!file) return;
  input.value = '';
  const accountId = document.getElementById('tx-filter-account')?.value || '';
  const notif = document.getElementById('tx-import-notif');
  const show = (ok, msg) => {
    if (!notif) return;
    notif.style.display = 'block';
    notif.innerHTML = `<div class="notif${ok ? ' success' : ''}" style="${ok ? '' : 'background:var(--red-bg);color:var(--red)'}">${msg}</div>`;
    if (ok) setTimeout(() => { notif.style.display = 'none'; }, 6000);
  };
  try {
    const content = await file.text();
    const direct = parseCSVDirect(content);
    if (!direct) {
      show(false, `Format CSV non reconnu (${file.name}). Formats supportés : Caisse d'Épargne, BoursoBank, ou CSV générique avec colonnes date/montant.`);
      return;
    }
    if (accountId) direct.transactions.forEach(t => { t.accountId = accountId; });
    const imported = importTransactions(direct.transactions);
    const acc = accounts.find(a => a.id === (accountId || direct.accountId));
    show(true, `✓ ${imported} transaction(s) importée(s) — ${direct.periode}${acc ? ' → ' + acc.name : ''}`);
  } catch(e) {
    show(false, `Erreur : ${e.message}`);
  }
}

function importTransactions(txs) {
  let count = 0;
  txs.forEach(t => {
    const amt = parseFloat(String(t.amount||0).replace(/[€\s+]/g,'').replace(',','.'));
    if (isNaN(amt)) return;
    transactions.unshift({
      id: Date.now()+Math.random(),
      date: t.date||new Date().toISOString().slice(0,10),
      label: t.label||'Import',
      amount: amt,
      cat: t.categorie||'divers',
      account: t.accountId || accounts[0]?.id || '',
      note: 'importé automatiquement'
    });
    count++;
  });
  saveState();
  renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
  renderTx();
  return count;
}

function exportAppData() {
  const data = JSON.stringify({transactions, abonnements, exportedAt: new Date().toISOString()}, null, 2);
  const blob = new Blob([data], {type: 'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vesta-backup.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importAppData(input) {
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data.transactions) || !Array.isArray(data.abonnements)) {
        throw new Error('Format de sauvegarde invalide.');
      }
      transactions = data.transactions;
      abonnements = data.abonnements;
      saveState();
      renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
      renderTx();
      renderAbo();
      input.value = '';
      alert('Données restaurées.');
    } catch (e) {
      alert('Import impossible : ' + e.message);
    }
  };
  reader.readAsText(file);
}

function resetAppData() {
  if (!confirm('Réinitialiser les transactions et abonnements sauvegardés localement ?')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

// ── CONSEILLER IA ──
async function callAI(messages) {
  const provider = settings.aiProvider || 'openai';
  const key = settings.aiApiKey || '';
  if (!key) throw new Error('Clé API manquante — configurez-la dans Paramètres.');

  if (provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:_env.OPENAI_MODEL||'gpt-4o', max_tokens:1000, messages})
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content || '';
  }

  if (provider === 'claude') {
    const sys = messages.find(m=>m.role==='system')?.content || '';
    const msgs = messages.filter(m=>m.role!=='system');
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01'},
      body:JSON.stringify({model:'claude-opus-4-5', max_tokens:1000, system:sys, messages:msgs})
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message || d.error.type);
    return d.content?.[0]?.text || '';
  }

  if (provider === 'gemini') {
    const contents = messages.filter(m=>m.role!=='system').map(m => ({
      role: m.role==='assistant'?'model':'user', parts:[{text:m.content}]
    }));
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({contents})
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
  }

  if (provider === 'lechat') {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+key},
      body:JSON.stringify({model:'mistral-large-latest', max_tokens:1000, messages})
    });
    const d = await res.json();
    if (d.error) throw new Error(d.error.message);
    return d.choices?.[0]?.message?.content || '';
  }

  throw new Error('Fournisseur IA inconnu : ' + provider);
}

async function sendChat() {
  const inp = document.getElementById('chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  addChatMsg(msg,'user');
  const el = addChatMsg('…','ai loading');
  chatHistory.push({role:'user',content:msg});
  try {
    const txt = await callAI([{role:'system',content:SYSTEM}, ...chatHistory]);
    el.classList.remove('loading'); el.textContent = txt;
    chatHistory.push({role:'assistant', content:txt});
    if (chatHistory.length > 24) chatHistory = chatHistory.slice(-24);
  } catch(e) {
    el.classList.remove('loading'); el.textContent = 'Erreur : '+e.message;
  }
}
function addChatMsg(text, cls) {
  const msgs = document.getElementById('chat-msgs');
  const d = document.createElement('div');
  d.className = 'chat-msg '+cls;
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}
function askAI(q) {
  go('conseiller', document.querySelector('[onclick*=conseiller]'));
  setTimeout(() => { document.getElementById('chat-input').value = q; sendChat(); }, 100);
}

// ── BOURSE ──
const BOURSE_SYSTEM = `Tu es un conseiller en investissement boursier expert francophone. Tu analyses les marchés financiers et conseilles sur les placements (ETF, actions, obligations, crypto-monnaies, matières premières) adaptés au profil de l'utilisateur. Tu es direct, chiffré et pratique. Cite toujours des exemples concrets (tickers, produits réels). Rappelle les risques sans être alarmiste. Les performances passées ne préjugent pas des performances futures.`;

let bourseHistory = [];

const BOURSE_PROFILES = ['Défensif','Prudent','Modéré','Dynamique','Agressif'];
const BOURSE_PROFILE_COLORS = ['var(--green)','var(--blue)','var(--purple)','var(--amber)','var(--red)'];
const BOURSE_RENDEMENTS = [2.5, 4, 6, 7.5, 9];
const BOURSE_RISQUE_LABELS = ['Très faible','Faible','Modéré','Élevé','Très élevé'];

const BOURSE_BASE_ALLOC = [
  [25, 10, 60,  0,  5],
  [35, 15, 40,  3,  7],
  [50, 20, 20,  3,  7],
  [45, 35,  3,  7, 10],
  [35, 40,  3, 15,  7],
];

const BOURSE_ASSET_LABELS = ['ETF', 'Actions', 'Obligations', 'Crypto', 'Mat. prem.'];
const BOURSE_ASSET_COLORS = ['#1a4a7a','#4a3080','#1a6b4a','#7a4f0d','#8b2020'];
const BOURSE_ASSET_ICONS  = ['◈','📈','🏛','₿','🥇'];

const BOURSE_PRODUCTS = {
  etf: [
    { name:'Amundi MSCI World',      ticker:'CW8',   desc:'1 800+ actions mondiales, frais 0,12%',     risk:'Moyen' },
    { name:'iShares Core MSCI World', ticker:'IWDA',  desc:'ETF monde, éligible PEA via swap',          risk:'Moyen' },
    { name:'BNP Paribas S&P 500',    ticker:'PE500',  desc:'500 plus grandes entreprises US',          risk:'Moyen' },
    { name:'Amundi Nasdaq 100',      ticker:'ANX',   desc:'Tech US, croissance, volatilité élevée',    risk:'Élevé' },
    { name:'iShares MSCI EM',        ticker:'AEME',  desc:'Marchés émergents, forte croissance',       risk:'Élevé' },
  ],
  actions: [
    { name:'LVMH',        ticker:'MC.PA',   desc:'Leader luxe mondial, dividende régulier',  risk:'Moyen' },
    { name:'Air Liquide', ticker:'AI.PA',   desc:'Gaz industriels, 30 ans de hausse du dividende', risk:'Faible' },
    { name:'TotalEnergies',ticker:'TTE.PA', desc:'Énergie, rendement dividende ~6%',         risk:'Moyen' },
    { name:'ASML',        ticker:'ASML.AS', desc:'Monopole semi-conducteurs EUV',            risk:'Moyen' },
    { name:'Microsoft',   ticker:'MSFT',   desc:'Cloud & IA, dividende croissant',           risk:'Faible' },
  ],
  oblig: [
    { name:'Fonds euros AV',         ticker:'—',    desc:'Capital garanti, ~3 % net 2024',           risk:'Très faible' },
    { name:'Livret A',               ticker:'—',    desc:'3 %, plafond 22 950 €, défiscalisé',        risk:'Nul' },
    { name:'OAT France 10 ans',      ticker:'OAT',  desc:'Obligation d\'État, taux fixe ~3,3%',       risk:'Très faible' },
    { name:'iShares € Corp Bond',    ticker:'IEAC', desc:'Obligations d\'entreprises zone euro',       risk:'Faible' },
  ],
  crypto: [
    { name:'Bitcoin',  ticker:'BTC', desc:'1ère crypto par capitalisation, valeur refuge numérique', risk:'Très élevé' },
    { name:'Ethereum', ticker:'ETH', desc:'Smart contracts, DeFi, staking ~4%/an',                   risk:'Très élevé' },
  ],
  matprem: [
    { name:'Invesco Physical Gold',  ticker:'SGLD', desc:'ETC adossé à l\'or physique, valeur refuge', risk:'Moyen' },
    { name:'iShares Diversified Commodity', ticker:'CMOD', desc:'Panier de matières premières diversifié', risk:'Élevé' },
  ],
};

const BOURSE_RISK_BADGE = {
  'Nul':'badge-g', 'Très faible':'badge-g', 'Faible':'badge-g',
  'Moyen':'badge-b', 'Élevé':'badge-a', 'Très élevé':'badge-r'
};

function getBourseContext() {
  const montant = +document.getElementById('bourse-montant')?.value || 0;
  const mensuel = +document.getElementById('bourse-mensuel')?.value || 0;
  const duree   = +document.getElementById('sl-bourse-duree')?.value || 10;
  const risque  = +document.getElementById('sl-bourse-risque')?.value || 3;
  const profil  = BOURSE_PROFILES[risque - 1];
  return `Profil : ${profil} (risque ${risque}/5). Capital initial : ${montant} €. Versement mensuel : ${mensuel} €. Durée : ${duree} an${duree > 1 ? 's' : ''}.`;
}

function calcBourseProfil() {
  const montant = +document.getElementById('bourse-montant')?.value || 0;
  const mensuel = +document.getElementById('bourse-mensuel')?.value || 0;
  const duree   = +document.getElementById('sl-bourse-duree')?.value || 10;
  const risque  = +document.getElementById('sl-bourse-risque')?.value || 3;

  let alloc = [...BOURSE_BASE_ALLOC[risque - 1]];

  if (duree <= 3) {
    const equity = alloc[0] + alloc[1] + alloc[3];
    const targetEquity = 20;
    if (equity > targetEquity) {
      const factor = targetEquity / equity;
      alloc[0] = Math.round(alloc[0] * factor);
      alloc[1] = Math.round(alloc[1] * factor);
      alloc[3] = 0;
      alloc[2] = 100 - alloc[0] - alloc[1] - alloc[4];
    }
  }

  const r  = BOURSE_RENDEMENTS[risque - 1] / 100;
  const mr = r / 12;
  const n  = duree * 12;
  const fv = montant * Math.pow(1 + mr, n)
    + (mensuel > 0 && mr > 0 ? mensuel * (Math.pow(1 + mr, n) - 1) / mr : mensuel * n);

  const dureeLabel   = duree === 1 ? '1 an' : duree + ' ans';
  const profilLabel  = BOURSE_PROFILES[risque - 1];
  const risqueLabel  = BOURSE_RISQUE_LABELS[risque - 1];
  const profilColor  = BOURSE_PROFILE_COLORS[risque - 1];
  const rendement    = BOURSE_RENDEMENTS[risque - 1];

  document.getElementById('sl-bourse-duree-out').textContent  = dureeLabel;
  document.getElementById('sl-bourse-risque-out').textContent = risqueLabel;

  const profilEl = document.getElementById('bourse-profil-label');
  profilEl.textContent  = profilLabel;
  profilEl.style.color  = profilColor;
  document.getElementById('bourse-horizon').textContent    = dureeLabel;
  document.getElementById('bourse-rendement').textContent  = rendement.toFixed(1) + ' %/an';
  document.getElementById('bourse-capital').textContent    = (montant > 0 || mensuel > 0) ? fmtK(Math.round(fv)) : '— €';

  const bar = document.getElementById('bourse-alloc-bar');
  if (bar) for (let i = 0; i < 5; i++) bar.children[i].style.width = alloc[i] + '%';

  const legendEl = document.getElementById('bourse-alloc-legend');
  if (legendEl) legendEl.innerHTML = alloc.map((v, i) =>
    v > 0 ? `<span class="leg-item"><span class="leg-dot" style="background:${BOURSE_ASSET_COLORS[i]}"></span>${BOURSE_ASSET_LABELS[i]} ${v}%</span>` : ''
  ).join('');

  const gridEl = document.getElementById('bourse-alloc-grid');
  if (gridEl) gridEl.innerHTML = alloc.map((v, i) => {
    if (v === 0) return '';
    const amount = (montant > 0) ? `<span style="font-size:12px;color:var(--text2);font-family:var(--mono)">${fmtE(Math.round(montant * v / 100))}</span>` : '';
    return `<div class="row"><span class="row-label">${BOURSE_ASSET_ICONS[i]} ${BOURSE_ASSET_LABELS[i]}</span>
      <span style="display:flex;align-items:center;gap:8px">${amount}<span class="badge" style="background:${BOURSE_ASSET_COLORS[i]}22;color:${BOURSE_ASSET_COLORS[i]}">${v}%</span></span></div>`;
  }).join('');

  renderBourseProducts(risque, alloc);
  saveBudget();
}

function renderBourseProducts(risque, alloc) {
  const el = document.getElementById('bourse-produits');
  if (!el) return;
  const cats = [
    { key:'etf',     label:'ETF',           idx:0 },
    { key:'actions', label:'Actions',        idx:1 },
    { key:'oblig',   label:'Obligations',   idx:2 },
    { key:'crypto',  label:'Crypto',         idx:3 },
    { key:'matprem', label:'Mat. premières', idx:4 },
  ].filter(c => alloc[c.idx] > 0);

  let html = '';
  for (const cat of cats) {
    const items = BOURSE_PRODUCTS[cat.key].slice(0, risque <= 2 ? 2 : 3);
    const color = BOURSE_ASSET_COLORS[cat.idx];
    html += `<div style="margin-bottom:16px">
      <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:${color};margin-bottom:8px">${cat.label} — ${alloc[cat.idx]}%</div>`;
    items.forEach(p => {
      html += `<div class="tx-row" style="cursor:default">
        <div style="font-family:var(--mono);font-size:11px;color:var(--text3);min-width:52px;flex-shrink:0">${p.ticker}</div>
        <div class="tx-info"><div class="tx-name">${p.name}</div><div class="tx-meta">${p.desc}</div></div>
        <span class="badge ${BOURSE_RISK_BADGE[p.risk]}">${p.risk}</span>
      </div>`;
    });
    html += '</div>';
  }
  el.innerHTML = html || '<div style="color:var(--text3);font-size:13px;padding:.5rem 0;text-align:center">Renseignez votre profil pour voir les recommandations.</div>';
}

async function sendBourseChat() {
  const inp = document.getElementById('bourse-chat-input');
  const msg = inp.value.trim();
  if (!msg) return;
  inp.value = '';
  addBourseChatMsg(msg, 'user');
  const el = addBourseChatMsg('…', 'ai loading');
  bourseHistory.push({ role:'user', content: msg });
  try {
    const ctx = getBourseContext();
    const sys = BOURSE_SYSTEM + '\n\nContexte investisseur : ' + ctx;
    const txt = await callAI([{ role:'system', content: sys }, ...bourseHistory]);
    el.classList.remove('loading');
    el.textContent = txt;
    bourseHistory.push({ role:'assistant', content: txt });
    if (bourseHistory.length > 20) bourseHistory = bourseHistory.slice(-20);
  } catch(e) {
    el.classList.remove('loading');
    el.textContent = 'Erreur : ' + e.message;
  }
}

function addBourseChatMsg(text, cls) {
  const msgs = document.getElementById('bourse-chat-msgs');
  const d = document.createElement('div');
  d.className = 'chat-msg ' + cls;
  d.textContent = text;
  msgs.appendChild(d);
  msgs.scrollTop = msgs.scrollHeight;
  return d;
}

function askBourseAI(q) {
  go('bourse', document.querySelector('[onclick*=bourse]'));
  setTimeout(() => { document.getElementById('bourse-chat-input').value = q; sendBourseChat(); }, 150);
}

// ── PIN AUTH ──
const PIN_KEY = 'vesta-pin-hash';
let _pinBuffer = '';
let _pinStep = 'unlock';
let _pinFirst = '';

async function hashPin(pin) {
  const data = new TextEncoder().encode('vesta:' + pin);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function updatePinDots() {
  document.querySelectorAll('#pin-dots .pin-dot').forEach((d, i) => {
    d.classList.toggle('filled', i < _pinBuffer.length);
  });
}

function showPinErr(msg) {
  const el = document.getElementById('pin-err');
  if (el) el.textContent = msg;
  const dots = document.getElementById('pin-dots');
  dots.classList.remove('pin-shake');
  void dots.offsetWidth;
  dots.classList.add('pin-shake');
}

function clearPinErr() {
  const el = document.getElementById('pin-err');
  if (el) el.textContent = '';
}

function pinKey(val) {
  if (val === 'del') {
    _pinBuffer = _pinBuffer.slice(0, -1);
    updatePinDots();
    clearPinErr();
    return;
  }
  if (_pinBuffer.length >= 4) return;
  _pinBuffer += val;
  updatePinDots();
  if (_pinBuffer.length === 4) submitPin();
}

async function submitPin() {
  const pin = _pinBuffer;
  if (pin.length < 4) return;

  if (_pinStep === 'unlock') {
    const stored = localStorage.getItem(PIN_KEY);
    const hash = await hashPin(pin);
    if (hash === stored) {
      document.getElementById('pin-screen').classList.add('hidden');
    } else {
      showPinErr('Code incorrect');
      _pinBuffer = '';
      updatePinDots();
    }
  } else if (_pinStep === 'setup-enter') {
    _pinFirst = pin;
    _pinBuffer = '';
    _pinStep = 'setup-confirm';
    document.getElementById('pin-subtitle').textContent = 'Confirmez votre code PIN';
    updatePinDots();
    clearPinErr();
  } else if (_pinStep === 'setup-confirm') {
    if (pin !== _pinFirst) {
      showPinErr('Les codes ne correspondent pas');
      _pinBuffer = '';
      _pinStep = 'setup-enter';
      _pinFirst = '';
      document.getElementById('pin-subtitle').textContent = 'Créez votre code PIN';
      updatePinDots();
    } else {
      const hash = await hashPin(pin);
      localStorage.setItem(PIN_KEY, hash);
      document.getElementById('pin-screen').classList.add('hidden');
      showSyncBadge('Code PIN enregistré');
    }
  }
}

function changePin() {
  _pinBuffer = '';
  _pinFirst = '';
  _pinStep = 'setup-enter';
  clearPinErr();
  updatePinDots();
  document.getElementById('pin-subtitle').textContent = 'Créez votre nouveau code PIN';
  document.getElementById('pin-screen').classList.remove('hidden');
}

// ── INIT ──
function openApp() {
  updateDisplayName();

  const txDate = document.getElementById('tx-date');
  if (txDate) txDate.value = new Date().toISOString().slice(0,10);

  renderAccounts();
  updateAccountDropdowns();
  loadSettingsUI();

  loadBudgetSliders();

  setTimeout(initCharts, 50);
  renderDashRecent(); updateTRBalance(); updateTotalLiquidity();
  renderDashAlerts();
  renderDashAbo();
  renderPatrimoine();
  calcBudget();
  renderAbo();
  go(location.hash.replace('#', '') || 'dashboard');
}

function showSyncBadge(msg) {
  let b = document.getElementById('sync-badge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'sync-badge';
    b.style.cssText = 'position:fixed;bottom:20px;right:20px;background:var(--green-bg);color:var(--green);border:1px solid var(--green);border-radius:8px;padding:8px 14px;font-size:12px;z-index:9999;transition:opacity .6s;pointer-events:none';
    document.body.appendChild(b);
  }
  b.textContent = '✓ ' + msg;
  b.style.opacity = '1';
  clearTimeout(b._t);
  b._t = setTimeout(() => b.style.opacity = '0', 2500);
}

document.addEventListener('DOMContentLoaded', () => {
  ['mes-finances-state-v2', 'fin-api-key'].forEach(k => localStorage.removeItem(k));
  openApp();

  const stored = localStorage.getItem(PIN_KEY);
  if (stored) {
    _pinStep = 'unlock';
    document.getElementById('pin-subtitle').textContent = 'Entrez votre code PIN';
  } else {
    _pinStep = 'setup-enter';
    document.getElementById('pin-subtitle').textContent = 'Créez votre code PIN';
  }

  document.addEventListener('keydown', e => {
    if (document.getElementById('pin-screen').classList.contains('hidden')) return;
    if (e.key >= '0' && e.key <= '9') pinKey(e.key);
    else if (e.key === 'Backspace') pinKey('del');
    else if (e.key === 'Enter') submitPin();
  });

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
