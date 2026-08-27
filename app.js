// ===== Constantes =====
const STORAGE_KEY = 'candidaturas_v1';
const NOTIFIED_KEY = 'candidaturas_notified_v1';
const PANEL_COLLAPSED_KEY = 'candidaturas_panel_collapsed';

const STAGES = [
  { id: 'candidatura', label: 'Candidatura enviada' },
  { id: 'triagem', label: 'Triagem / RH' },
  { id: 'entrevistas', label: 'Entrevistas' },
  { id: 'teste', label: 'Teste técnico' },
  { id: 'oferta', label: 'Oferta' },
];

const CLOSED_STATUSES = ['aprovado', 'rejeitado', 'desistencia'];
const CSS_VAR_BY_COLOR = { verde: '--green', amarelo: '--yellow', vermelho: '--red' };
const LABEL_BY_COLOR = { verde: 'Alta prioridade', amarelo: 'Prioridade média', vermelho: 'Baixa prioridade' };
const LABEL_BY_STATUS = { aprovado: 'Aprovado', rejeitado: 'Rejeitado', desistencia: 'Desistência' };
const LABEL_BY_CONFIDENCE = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

const state = { processos: [] };
let viewMode = 'board';
let actionsPanelCollapsed = localStorage.getItem(PANEL_COLLAPSED_KEY) === 'true';

function loadNotifiedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); }
  catch (e) { return new Set(); }
}
function saveNotifiedSet(set) { localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set])); }
let notifiedKeys = loadNotifiedSet();

function checkAndNotify(pending) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  let changed = false;
  pending.forEach(p => {
    const key = `${p.id}:${p.prazoProximaAcao}`;
    if (!notifiedKeys.has(key)) {
      notifiedKeys.add(key);
      changed = true;
      const stageLabel = (STAGES.find(s => s.id === p.etapaAtual) || {}).label || p.etapaAtual;
      try {
        new Notification(`Ação pendente: ${p.empresa}`, { body: `${stageLabel} — prazo vencido ou vencendo hoje` });
      } catch (e) { /* navegador pode bloquear silenciosamente */ }
    }
  });
  if (changed) saveNotifiedSet(notifiedKeys);
}

function updateNotifyButton() {
  const btn = document.getElementById('btnNotify');
  if (!btn) return;
  if (!('Notification' in window)) { btn.textContent = '🔔 Não suportado'; btn.disabled = true; return; }
  if (Notification.permission === 'granted') { btn.textContent = '🔔 Notificações ativas'; }
  else { btn.textContent = '🔔 Notificações'; }
}

// ===== Utilitários de data =====
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayStr() { return formatDate(new Date()); }
function addDays(dateStr, n) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return formatDate(d);
}
function daysDiff(aStr, bStr) {
  const a = new Date(aStr + 'T00:00:00');
  const b = new Date(bStr + 'T00:00:00');
  return Math.round((a - b) / 86400000);
}

// ===== Utilitários gerais =====
function uid() { return 'p_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function stageIndex(id) { return STAGES.findIndex(s => s.id === id); }
function scoreColor(p) {
  const avg = ((p.aderenciaCurto || 0) + (p.aderenciaMedio || 0) + (p.aderenciaLongo || 0)) / 3;
  if (avg >= 4) return 'verde';
  if (avg >= 2.5) return 'amarelo';
  return 'vermelho';
}
function formatMoney(v) {
  if (v == null || v === '') return '—';
  return 'R$ ' + Number(v).toLocaleString('pt-BR');
}
function formatSalaryRange(p) {
  const min = p.salarioMin, max = p.salarioMax;
  if (min == null && max == null) return '—';
  if (min != null && max != null) {
    if (Number(min) === Number(max)) return formatMoney(min);
    return `${formatMoney(min)} – ${formatMoney(max)}`;
  }
  return formatMoney(min != null ? min : max);
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function logHist(proc, tipo, descricao) {
  proc.historico.push({ data: todayStr(), tipo, descricao });
}

// ===== Persistência (servidor local, arquivo data.json) =====
function loadLegacyLocalStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch (e) { return null; }
}

function save() {
  fetch('/api/dados', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(state.processos),
  }).catch(err => {
    showToast(`⚠️ Falha ao salvar no servidor: ${err.message}. Confira se ele ainda está rodando.`, true);
  });
}

function initApp() {
  fetch('/api/dados')
    .then(r => { if (!r.ok) throw new Error('status ' + r.status); return r.json(); })
    .then(data => {
      if (Array.isArray(data) && data.length > 0) {
        state.processos = data;
      } else {
        const legacy = loadLegacyLocalStorage();
        state.processos = (legacy && legacy.length) ? legacy : seedData();
        save();
      }
      render();
      wireEvents();
    })
    .catch(err => renderServerUnavailable(err));
}

function renderServerUnavailable(err) {
  const isFile = window.location.protocol === 'file:';
  document.getElementById('app').innerHTML = `
    <div class="server-down-screen">
      <h1>⚠️ Não consegui conectar ao servidor local</h1>
      <p>${isFile
        ? 'Você abriu este arquivo direto do disco. Os processos agora ficam salvos num arquivo no servidor, então o app precisa ser acessado pelo endereço certo.'
        : `O servidor local pode ter caído ou não foi iniciado (${escapeHtml(err.message || String(err))}).`}</p>
      <p>Rode <code>node server.js</code> (ou <code>./start.sh</code>) na pasta do app, e acesse:</p>
      <p class="server-down-url">http://localhost:8934/</p>
      <button type="button" class="btn btn-primary" id="btnRetry">Tentar de novo</button>
    </div>`;
  document.getElementById('btnRetry').addEventListener('click', () => window.location.reload());
}

function showToast(message, isError) {
  const toast = document.createElement('div');
  toast.className = 'toast' + (isError ? ' toast-error' : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 5000);
}

function mkProc(fields) {
  return Object.assign({
    id: uid(),
    empresa: '', cargo: '', salarioMin: null, salarioMax: null, salarioConfianca: null, salarioComentario: null,
    aderenciaCurto: 3, aderenciaMedio: 3, aderenciaLongo: 3,
    etapaAtual: 'candidatura',
    dataCandidatura: todayStr(),
    prazoProximaAcao: null,
    entrevistasRealizadas: null,
    entrevistasPrevistas: null,
    status: 'ativo',
    historico: [{ data: todayStr(), tipo: 'criado', descricao: 'Processo criado' }],
  }, fields);
}

function seedData() {
  const today = todayStr();
  return [
    mkProc({ empresa: 'Empresa A', cargo: 'Analista de Dados', salarioMin: 7000, salarioMax: 8500, aderenciaCurto: 5, aderenciaMedio: 4, aderenciaLongo: 4, etapaAtual: 'candidatura', dataCandidatura: addDays(today, -3), prazoProximaAcao: addDays(today, -1) }),
    mkProc({ empresa: 'Empresa C', cargo: 'Product Manager', salarioMin: 6500, salarioMax: 6500, aderenciaCurto: 3, aderenciaMedio: 3, aderenciaLongo: 3, etapaAtual: 'triagem', dataCandidatura: addDays(today, -5), prazoProximaAcao: today }),
    mkProc({ empresa: 'Empresa E', cargo: 'Engenheiro de Software Sênior', salarioMin: 11000, salarioMax: 13000, aderenciaCurto: 2, aderenciaMedio: 2, aderenciaLongo: 2, etapaAtual: 'entrevistas', dataCandidatura: addDays(today, -10), prazoProximaAcao: addDays(today, -2), entrevistasPrevistas: 4, entrevistasRealizadas: 2 }),
    mkProc({ empresa: 'Empresa G', cargo: 'Head of Growth', salarioMin: 15000, salarioMax: null, aderenciaCurto: 5, aderenciaMedio: 5, aderenciaLongo: 5, etapaAtual: 'oferta', dataCandidatura: addDays(today, -15), prazoProximaAcao: addDays(today, 1) }),
  ];
}

// ===== Render =====
function render() {
  renderActionsPanel();
  const board = document.getElementById('board');
  const archive = document.getElementById('archiveView');
  if (viewMode === 'board') {
    board.style.display = 'flex'; archive.style.display = 'none';
    renderBoard();
  } else {
    board.style.display = 'none'; archive.style.display = 'block';
    renderArchive();
  }
}

function renderActionsPanel() {
  const panel = document.getElementById('actionsPanel');
  const pending = state.processos.filter(p => p.status === 'ativo' && p.prazoProximaAcao && p.prazoProximaAcao <= todayStr());
  pending.sort((a, b) => daysDiff(todayStr(), b.prazoProximaAcao) - daysDiff(todayStr(), a.prazoProximaAcao));

  checkAndNotify(pending);

  if (actionsPanelCollapsed) {
    panel.classList.add('collapsed');
    panel.innerHTML = `<button id="btnExpandPanel" class="panel-collapsed-toggle" title="Expandir ações pendentes">
      <span class="bell">🔔</span>${pending.length ? `<span class="badge-count">${pending.length}</span>` : ''}
    </button>`;
    document.getElementById('btnExpandPanel').addEventListener('click', () => setPanelCollapsed(false));
    return;
  }

  panel.classList.remove('collapsed');
  panel.innerHTML = `
    <div class="panel-header">
      <h2>⚠ Ações pendentes (${pending.length})</h2>
      <button id="btnCollapsePanel" class="icon-btn" title="Recolher painel">⟨</button>
    </div>
    ${pending.length ? pending.map(actionCardHtml).join('') : `<div class="empty-hint">Nada pendente. 🎉</div>`}
  `;
  document.getElementById('btnCollapsePanel').addEventListener('click', () => setPanelCollapsed(true));
}

function setPanelCollapsed(collapsed) {
  actionsPanelCollapsed = collapsed;
  localStorage.setItem(PANEL_COLLAPSED_KEY, String(collapsed));
  renderActionsPanel();
}

function actionCardHtml(p) {
  const diff = daysDiff(todayStr(), p.prazoProximaAcao);
  const stageLabel = (STAGES.find(s => s.id === p.etapaAtual) || {}).label || p.etapaAtual;
  const motivo = diff > 0
    ? `${stageLabel} — prazo vencido há ${diff} dia${diff > 1 ? 's' : ''}`
    : `${stageLabel} — prazo vence hoje`;
  const cls = diff > 0 ? '' : 'warn';
  const isLast = stageIndex(p.etapaAtual) === STAGES.length - 1;
  const ddKey = 'ap-' + p.id;
  return `<div class="action-card ${cls}" data-open-detail="${p.id}">
    <div class="ac-empresa">${escapeHtml(p.empresa)}${p.cargo ? ` <span class="ac-cargo">— ${escapeHtml(p.cargo)}</span>` : ''}</div>
    <div class="ac-motivo">${motivo}</div>
    <div class="ac-buttons">
      <button class="btn btn-sm" data-action="avancar" data-id="${p.id}">${isLast ? 'Aprovar' : 'Avançar'}</button>
      <button class="btn btn-sm" data-action="cobrar" data-id="${p.id}">Cobrar</button>
      ${p.etapaAtual === 'entrevistas' ? `<button class="btn btn-sm" data-action="registrarEntrevista" data-id="${p.id}">Entrevista</button>` : ''}
      <div class="dropdown">
        <button class="btn btn-sm dropdown-toggle" data-dropdown="${ddKey}">Outra ▾</button>
        <div class="dropdown-list" id="dd-${ddKey}">
          <button data-action="aguardar" data-id="${p.id}">Aguardar mais</button>
          <button data-action="standby" data-id="${p.id}">Colocar em standby</button>
          <button data-action="rejeitar" data-id="${p.id}">Marcar como rejeitada</button>
          <button data-action="arquivar" data-id="${p.id}">Arquivar (encerrar)</button>
        </div>
      </div>
    </div>
  </div>`;
}

function renderBoard() {
  const board = document.getElementById('board');
  board.innerHTML = STAGES.map(stage => {
    const items = state.processos.filter(p => p.etapaAtual === stage.id && (p.status === 'ativo' || p.status === 'standby'));
    const rank = { vermelho: 0, amarelo: 1, verde: 2 };
    items.sort((a, b) => {
      if ((a.status === 'standby') !== (b.status === 'standby')) return a.status === 'standby' ? 1 : -1;
      const ca = scoreColor(a), cb = scoreColor(b);
      if (rank[ca] !== rank[cb]) return rank[ca] - rank[cb];
      const da = daysDiff(todayStr(), a.prazoProximaAcao || todayStr());
      const db = daysDiff(todayStr(), b.prazoProximaAcao || todayStr());
      return db - da;
    });
    return `<div class="column">
      <div class="column-title"><span>${stage.label}</span><span>${items.length}</span></div>
      <div class="column-cards">${items.map(cardHtml).join('')}</div>
    </div>`;
  }).join('');
}

function cardHtml(p) {
  const color = scoreColor(p);
  const idx = stageIndex(p.etapaAtual);
  const dots = STAGES.map((s, i) => `<span class="${i <= idx ? 'filled' : ''}"></span>`).join('');

  let prazoBadge = '';
  if (p.status === 'ativo' && p.prazoProximaAcao) {
    const diff = daysDiff(todayStr(), p.prazoProximaAcao);
    if (diff > 0) prazoBadge = `<span class="badge prazo-late">⏰ atrasado ${diff}d</span>`;
    else if (diff === 0) prazoBadge = `<span class="badge prazo-warn">⏰ vence hoje</span>`;
    else prazoBadge = `<span class="badge prazo-ok">⏰ em ${-diff}d</span>`;
  } else if (p.status === 'standby') {
    prazoBadge = `<span class="badge paused">⏸ standby</span>`;
  }

  const entrevistaBadge = p.etapaAtual === 'entrevistas'
    ? `<span class="badge entrevistas">🎤 ${p.entrevistasRealizadas || 0}/${p.entrevistasPrevistas || '?'}</span>`
    : '';

  return `<div class="card prio-${color} ${p.status === 'standby' ? 'standby' : ''}" data-open-detail="${p.id}">
    <div class="card-top">
      <div class="card-title-block">
        <span class="card-empresa">${escapeHtml(p.empresa)}</span>
        ${p.cargo ? `<span class="card-cargo">${escapeHtml(p.cargo)}</span>` : ''}
      </div>
      <span class="dot prio-${color}">●</span>
    </div>
    <div class="card-salario">${formatSalaryRange(p)}</div>
    <div class="badges">${prazoBadge}${entrevistaBadge}</div>
    <div class="dots">${dots}</div>
  </div>`;
}

function renderArchive() {
  const el = document.getElementById('archiveView');
  const archived = state.processos.filter(p => CLOSED_STATUSES.includes(p.status));
  if (!archived.length) { el.innerHTML = `<div class="empty-hint">Nenhum processo arquivado ainda.</div>`; return; }
  el.innerHTML = `<table>
    <thead><tr><th>Empresa</th><th>Cargo</th><th>Salário</th><th>Resultado</th><th>Candidatura</th><th>Última atualização</th></tr></thead>
    <tbody>${archived.map(p => {
      const last = p.historico[p.historico.length - 1];
      return `<tr class="archive-row" data-open-detail="${p.id}">
        <td>${escapeHtml(p.empresa)}</td>
        <td>${escapeHtml(p.cargo || '—')}</td>
        <td>${formatSalaryRange(p)}</td>
        <td><span class="status-pill ${p.status}">${LABEL_BY_STATUS[p.status] || p.status}</span></td>
        <td>${p.dataCandidatura}</td>
        <td>${last ? last.data : '—'}</td>
      </tr>`;
    }).join('')}</tbody>
  </table>`;
}

// ===== Modal =====
function showModal(title, bodyHtml, onSubmit) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay">
    <div class="modal-box">
      <h3>${title}</h3>
      <form id="modalForm">
        ${bodyHtml}
        <div class="modal-actions">
          <button type="button" class="btn" id="modalCancel">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  </div>`;
  root.querySelector('#modalCancel').addEventListener('click', closeModal);
  root.querySelector('.modal-overlay').addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
  root.querySelector('#modalForm').addEventListener('submit', e => {
    e.preventDefault();
    onSubmit(new FormData(e.target));
  });
}
function closeModal() { document.getElementById('modalRoot').innerHTML = ''; }

function showRawModal(bodyHtml) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="modal-overlay"><div class="modal-box modal-box-lg">${bodyHtml}</div></div>`;
  root.querySelector('.modal-overlay').addEventListener('click', e => {
    if (e.target.classList.contains('modal-overlay')) closeModal();
  });
}

function detailModalBody(p) {
  const idx = stageIndex(p.etapaAtual);
  const isLast = idx === STAGES.length - 1;
  const color = scoreColor(p);
  const stageLabel = (STAGES.find(s => s.id === p.etapaAtual) || {}).label || p.etapaAtual;
  const isStandby = p.status === 'standby';
  const isActive = p.status === 'ativo';

  let prazoInfo = '—';
  if (isActive && p.prazoProximaAcao) {
    const diff = daysDiff(todayStr(), p.prazoProximaAcao);
    prazoInfo = diff > 0 ? `Vencido há ${diff}d (${p.prazoProximaAcao})` : diff === 0 ? `Vence hoje (${p.prazoProximaAcao})` : `${p.prazoProximaAcao} (em ${-diff}d)`;
  } else if (isStandby) { prazoInfo = 'Em standby (sem prazo)'; }

  const statusLabel = isActive ? stageLabel : isStandby ? `${stageLabel} (standby)` : (LABEL_BY_STATUS[p.status] || p.status);

  const entrevistaRow = (p.etapaAtual === 'entrevistas' || p.entrevistasPrevistas != null)
    ? `<div class="detail-row"><label>Entrevistas</label><span>${p.entrevistasRealizadas || 0} de ${p.entrevistasPrevistas || '?'} realizadas</span></div>`
    : '';

  let actionsHtml = '';
  if (isActive) {
    actionsHtml = `
      <button class="btn btn-sm btn-primary" data-action="avancar" data-id="${p.id}">${isLast ? 'Marcar aprovado' : 'Avançar etapa'}</button>
      <button class="btn btn-sm" data-action="cobrar" data-id="${p.id}">Cobrar empresa</button>
      ${p.etapaAtual === 'entrevistas' ? `<button class="btn btn-sm" data-action="registrarEntrevista" data-id="${p.id}">Registrar entrevista</button>` : ''}
      <button class="btn btn-sm" data-action="aguardar" data-id="${p.id}">Aguardar mais</button>
      <button class="btn btn-sm" data-action="standby" data-id="${p.id}">Colocar em standby</button>
      <button class="btn btn-sm" data-action="rejeitar" data-id="${p.id}">Marcar como rejeitada</button>
      <button class="btn btn-sm" data-action="arquivar" data-id="${p.id}">Arquivar (encerrar)</button>`;
  } else if (isStandby) {
    actionsHtml = `
      <button class="btn btn-sm btn-primary" data-action="reativar" data-id="${p.id}">Reativar</button>
      <button class="btn btn-sm" data-action="rejeitar" data-id="${p.id}">Marcar como rejeitada</button>
      <button class="btn btn-sm" data-action="arquivar" data-id="${p.id}">Arquivar (encerrar)</button>`;
  }

  const historicoHtml = (p.historico || []).slice().reverse()
    .map(h => `<li><span class="hist-data">${h.data}</span> ${escapeHtml(h.descricao)}</li>`).join('')
    || '<li class="empty-hint">Sem histórico ainda.</li>';

  return `
    <div class="modal-header-row">
      <div>
        <h3>${escapeHtml(p.empresa)}</h3>
        ${p.cargo ? `<div class="detail-subtitle">${escapeHtml(p.cargo)}</div>` : ''}
      </div>
      <button class="icon-btn" id="modalCloseX" title="Fechar">✕</button>
    </div>

    <div class="detail-grid">
      <div class="detail-row"><label>Etapa / status</label><span>${escapeHtml(statusLabel)}</span></div>
      <div class="detail-row"><label>Prioridade</label><span><span class="score-dot" style="background:var(${CSS_VAR_BY_COLOR[color]})"></span> ${LABEL_BY_COLOR[color]}</span></div>
      <div class="detail-row"><label>Salário estimado</label><span>${formatSalaryRange(p)}${p.salarioConfianca ? ` <span class="confidence-tag conf-${p.salarioConfianca}">confiança ${LABEL_BY_CONFIDENCE[p.salarioConfianca] || p.salarioConfianca}</span>` : ''}</span></div>
      <div class="detail-row"><label>Data da candidatura</label><span>${p.dataCandidatura}</span></div>
      <div class="detail-row"><label>Próxima ação</label><span>${prazoInfo}</span></div>
      ${entrevistaRow}
    </div>

    ${p.salarioComentario ? `<div class="salary-comment-box">💬 ${escapeHtml(p.salarioComentario)}</div>` : ''}

    ${actionsHtml ? `<div class="detail-actions">${actionsHtml}</div>` : ''}

    <div class="detail-footer-actions">
      <button class="btn btn-sm" data-action="editar" data-id="${p.id}">✎ Editar dados</button>
      <button class="btn btn-sm btn-danger" data-action="excluir" data-id="${p.id}">🗑 Excluir processo</button>
    </div>

    <div class="detail-hist">
      <label>Histórico</label>
      <ul>${historicoHtml}</ul>
    </div>
  `;
}

function openDetailModal(proc) {
  showRawModal(detailModalBody(proc));
  document.getElementById('modalCloseX').addEventListener('click', closeModal);
}

function optionsScale(selected) {
  const labels = { 1: '1 - Muito baixa', 2: '2 - Baixa', 3: '3 - Média', 4: '4 - Alta', 5: '5 - Muito alta' };
  let html = '';
  for (let i = 1; i <= 5; i++) html += `<option value="${i}" ${Number(selected) === i ? 'selected' : ''}>${labels[i]}</option>`;
  return html;
}

function openProcessModal(existing) {
  const isEdit = !!existing;
  const today = todayStr();
  const body = `
    <div class="field"><label>Empresa</label><input name="empresa" required value="${existing ? escapeHtml(existing.empresa) : ''}" placeholder="Ex: Empresa X"></div>
    <div class="field"><label>Cargo</label><input name="cargo" value="${existing ? escapeHtml(existing.cargo || '') : ''}" placeholder="Ex: Analista de Dados Sênior"></div>
    <div class="field-row">
      <div class="field"><label>Salário mínimo estimado (R$)</label><input name="salarioMin" type="number" min="0" step="100" value="${existing && existing.salarioMin != null ? existing.salarioMin : ''}" placeholder="Ex: 7000"></div>
      <div class="field"><label>Salário máximo estimado (R$)</label><input name="salarioMax" type="number" min="0" step="100" value="${existing && existing.salarioMax != null ? existing.salarioMax : ''}" placeholder="Ex: 9000"></div>
    </div>
    <input type="hidden" name="salarioConfianca" value="${existing && existing.salarioConfianca ? existing.salarioConfianca : ''}">
    <input type="hidden" name="salarioComentario" value="${existing && existing.salarioComentario ? escapeHtml(existing.salarioComentario) : ''}">
    <div class="field">
      <button type="button" class="btn btn-sm" id="btnBuscarSalario">🔎 Buscar referência salarial</button>
      <div id="confiancaHint" class="confianca-hint">${existing && existing.salarioConfianca ? `Confiança atual: ${LABEL_BY_CONFIDENCE[existing.salarioConfianca] || existing.salarioConfianca}${existing.salarioComentario ? ' — ' + escapeHtml(existing.salarioComentario) : ''}` : ''}</div>
    </div>
    <div class="field-row">
      <div class="field"><label>Aderência curto prazo</label><select name="curto">${optionsScale(existing ? existing.aderenciaCurto : 3)}</select></div>
      <div class="field"><label>Aderência médio prazo</label><select name="medio">${optionsScale(existing ? existing.aderenciaMedio : 3)}</select></div>
      <div class="field"><label>Aderência longo prazo</label><select name="longo">${optionsScale(existing ? existing.aderenciaLongo : 3)}</select></div>
    </div>
    <div class="score-preview" id="scorePreview"></div>
    <div class="field"><label>Data da candidatura</label><input name="dataCandidatura" type="date" value="${existing ? existing.dataCandidatura : today}"></div>
    ${!isEdit ? `<div class="field"><label>Prazo para primeira ação</label><input name="prazo" type="date" value="${addDays(today, 7)}" required></div>` : ''}
  `;

  showModal(isEdit ? 'Editar processo' : 'Criar processo', body, (data) => {
    if (isEdit) {
      existing.empresa = data.get('empresa').trim();
      existing.cargo = data.get('cargo').trim();
      existing.salarioMin = data.get('salarioMin') ? Number(data.get('salarioMin')) : null;
      existing.salarioMax = data.get('salarioMax') ? Number(data.get('salarioMax')) : null;
      existing.salarioConfianca = data.get('salarioConfianca') || null;
      existing.salarioComentario = data.get('salarioComentario') || null;
      existing.aderenciaCurto = Number(data.get('curto'));
      existing.aderenciaMedio = Number(data.get('medio'));
      existing.aderenciaLongo = Number(data.get('longo'));
      existing.dataCandidatura = data.get('dataCandidatura');
      logHist(existing, 'editado', 'Dados do processo atualizados');
    } else {
      const proc = mkProc({
        empresa: data.get('empresa').trim(),
        cargo: data.get('cargo').trim(),
        salarioMin: data.get('salarioMin') ? Number(data.get('salarioMin')) : null,
        salarioMax: data.get('salarioMax') ? Number(data.get('salarioMax')) : null,
        salarioConfianca: data.get('salarioConfianca') || null,
        salarioComentario: data.get('salarioComentario') || null,
        aderenciaCurto: Number(data.get('curto')),
        aderenciaMedio: Number(data.get('medio')),
        aderenciaLongo: Number(data.get('longo')),
        dataCandidatura: data.get('dataCandidatura'),
        prazoProximaAcao: data.get('prazo'),
      });
      state.processos.push(proc);
    }
    save();
    closeModal();
    render();
  });

  requestAnimationFrame(() => {
    const root = document.getElementById('modalRoot');
    const selCurto = root.querySelector('[name=curto]');
    const selMedio = root.querySelector('[name=medio]');
    const selLongo = root.querySelector('[name=longo]');
    const preview = root.querySelector('#scorePreview');
    function update() {
      const avg = (Number(selCurto.value) + Number(selMedio.value) + Number(selLongo.value)) / 3;
      const color = avg >= 4 ? 'verde' : avg >= 2.5 ? 'amarelo' : 'vermelho';
      preview.innerHTML = `<span class="score-dot" style="background:var(${CSS_VAR_BY_COLOR[color]})"></span> ${LABEL_BY_COLOR[color]} (score ${avg.toFixed(1)})`;
    }
    [selCurto, selMedio, selLongo].forEach(s => s.addEventListener('change', update));
    update();

    root.querySelector('#btnBuscarSalario').addEventListener('click', () => {
      const empresaVal = root.querySelector('[name=empresa]').value.trim();
      const cargoVal = root.querySelector('[name=cargo]').value.trim();
      buscarReferenciaSalarial(root, empresaVal, cargoVal);
    });
  });
}

function buscarReferenciaSalarial(root, empresa, cargo) {
  const btn = root.querySelector('#btnBuscarSalario');
  const hint = root.querySelector('#confiancaHint');
  btn.disabled = true;
  btn.textContent = '🔎 Buscando... (pode levar ~1 min)';
  hint.className = 'confianca-hint';
  hint.textContent = '';

  fetch('/api/buscar-salario', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ empresa, cargo }),
  })
    .then(r => r.json().then(data => ({ ok: r.ok, data })))
    .then(({ ok, data }) => {
      if (!ok) throw new Error(data.error || 'Falha na busca.');
      if (data.min != null) root.querySelector('[name=salarioMin]').value = Math.round(data.min);
      if (data.max != null) root.querySelector('[name=salarioMax]').value = Math.round(data.max);
      root.querySelector('[name=salarioConfianca]').value = data.confidence || '';
      root.querySelector('[name=salarioComentario]').value = data.comentario || '';
      const domains = (data.sources || []).slice(0, 3).map(u => {
        try { return new URL(u).hostname.replace('www.', ''); } catch (e) { return u; }
      });
      hint.textContent = `Confiança ${LABEL_BY_CONFIDENCE[data.confidence] || data.confidence}${domains.length ? ' — fontes: ' + domains.join(', ') : ''}${data.comentario ? ' — ' + data.comentario : ''}`;
    })
    .catch(err => {
      hint.className = 'confianca-hint confianca-erro';
      hint.textContent = `Não foi possível buscar: ${err.message}. O servidor local pode ter caído — rode "node server.js" (ou "./start.sh") de novo na pasta do app e tente outra vez.`;
    })
    .finally(() => {
      btn.disabled = false;
      btn.textContent = '🔎 Buscar referência salarial';
    });
}

function openResolveModal(proc, action) {
  const today = todayStr();
  const nextStage = STAGES[stageIndex(proc.etapaAtual) + 1];
  const needsPrevistas = action === 'avancar' && nextStage && nextStage.id === 'entrevistas' && proc.entrevistasPrevistas == null;

  let title, body;

  if (action === 'arquivar') {
    title = 'Encerrar processo';
    body = `<div class="field"><label>Resultado final</label>
      <select name="resultado">
        <option value="aprovado">Aprovado</option>
        <option value="rejeitado">Rejeitado</option>
        <option value="desistencia">Desistência</option>
      </select></div>`;
  } else if (action === 'avancar' && !nextStage) {
    title = 'Marcar como aprovado';
    body = `<p style="font-size:13.5px;color:var(--muted)">Este processo já está na etapa final (Oferta). Confirmar aprova e encerra o processo.</p>`;
  } else {
    const defaultDays = action === 'cobrar' ? 1 : 7;
    title = {
      avancar: `Avançar para "${nextStage.label}"`,
      cobrar: 'Cobrar empresa',
      aguardar: 'Aguardar mais tempo',
      reativar: 'Reativar processo',
      registrarEntrevista: 'Registrar entrevista realizada',
    }[action];
    body = `<div class="field"><label>Novo prazo para próxima ação</label><input name="prazo" type="date" value="${addDays(today, defaultDays)}" required></div>`;
    if (needsPrevistas) {
      body += `<div class="field"><label>Quantas entrevistas você prevê nesta etapa?</label><input name="previstas" type="number" min="1" value="1" required></div>`;
    }
  }

  showModal(title, body, (data) => {
    applyAction(proc, action, data);
    closeModal();
  });
}

// ===== Ações =====
function applyAction(proc, action, data) {
  if (action === 'avancar') {
    const idx = stageIndex(proc.etapaAtual);
    if (idx === STAGES.length - 1) {
      proc.status = 'aprovado';
      proc.prazoProximaAcao = null;
      logHist(proc, 'aprovado', 'Processo aprovado');
    } else {
      const next = STAGES[idx + 1];
      proc.etapaAtual = next.id;
      if (next.id === 'entrevistas' && proc.entrevistasPrevistas == null) {
        proc.entrevistasPrevistas = Number(data.get('previstas')) || 1;
        proc.entrevistasRealizadas = 0;
      }
      proc.prazoProximaAcao = data.get('prazo');
      logHist(proc, 'avancar', `Avançou para ${next.label}`);
    }
  } else if (action === 'cobrar') {
    proc.prazoProximaAcao = data.get('prazo');
    logHist(proc, 'cobrar', 'Empresa acionada / cobrada');
  } else if (action === 'aguardar') {
    proc.prazoProximaAcao = data.get('prazo');
    logHist(proc, 'aguardar', 'Prazo estendido, aguardando');
  } else if (action === 'reativar') {
    proc.status = 'ativo';
    proc.prazoProximaAcao = data.get('prazo');
    logHist(proc, 'reativar', 'Processo reativado');
  } else if (action === 'registrarEntrevista') {
    proc.entrevistasRealizadas = (proc.entrevistasRealizadas || 0) + 1;
    proc.prazoProximaAcao = data.get('prazo');
    logHist(proc, 'entrevista', `Entrevista registrada (${proc.entrevistasRealizadas}/${proc.entrevistasPrevistas || '?'})`);
  } else if (action === 'arquivar') {
    proc.status = data.get('resultado');
    proc.prazoProximaAcao = null;
    logHist(proc, 'encerrado', `Processo encerrado como ${LABEL_BY_STATUS[proc.status] || proc.status}`);
  }
  save();
  render();
}

function instantAction(proc, action) {
  if (action === 'standby') {
    proc.status = 'standby';
    proc.prazoProximaAcao = null;
    logHist(proc, 'standby', 'Colocado em standby');
  } else if (action === 'rejeitar') {
    proc.status = 'rejeitado';
    proc.prazoProximaAcao = null;
    logHist(proc, 'rejeitado', 'Marcado como rejeitado');
  }
  save();
  render();
}

function routeAction(proc, action) {
  if (action === 'editar') { openProcessModal(proc); return; }
  if (action === 'excluir') {
    if (confirm(`Excluir o processo da ${proc.empresa} permanentemente? Essa ação não pode ser desfeita.`)) {
      state.processos = state.processos.filter(pr => pr.id !== proc.id);
      save();
      closeModal();
      render();
    }
    return;
  }
  if (action === 'standby' || action === 'rejeitar') { instantAction(proc, action); return; }
  openResolveModal(proc, action);
}

// ===== Import / Export =====
function exportJson() {
  const blob = new Blob([JSON.stringify(state.processos, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `candidaturas-${todayStr()}.json`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function importJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (Array.isArray(data)) { state.processos = data; save(); render(); }
      else { alert('Arquivo inválido: esperado uma lista de processos.'); }
    } catch (err) { alert('Não foi possível ler o arquivo JSON.'); }
  };
  reader.readAsText(file);
  e.target.value = '';
}

// ===== Eventos =====
function wireEvents() {
  document.getElementById('btnNovo').addEventListener('click', () => openProcessModal(null));

  document.getElementById('btnBoard').addEventListener('click', () => {
    viewMode = 'board';
    document.getElementById('btnBoard').classList.add('active');
    document.getElementById('btnArchive').classList.remove('active');
    render();
  });
  document.getElementById('btnArchive').addEventListener('click', () => {
    viewMode = 'archive';
    document.getElementById('btnArchive').classList.add('active');
    document.getElementById('btnBoard').classList.remove('active');
    render();
  });

  document.getElementById('btnNotify').addEventListener('click', () => {
    if (!('Notification' in window)) { alert('Seu navegador não suporta notificações.'); return; }
    Notification.requestPermission().then(perm => {
      updateNotifyButton();
      if (perm === 'granted') { render(); }
      else if (perm === 'denied') { alert('Permissão de notificação negada no navegador.'); }
    });
  });
  updateNotifyButton();

  document.getElementById('btnExport').addEventListener('click', exportJson);
  document.getElementById('btnImport').addEventListener('click', () => document.getElementById('fileImport').click());
  document.getElementById('fileImport').addEventListener('change', importJson);

  document.addEventListener('click', (e) => {
    const toggle = e.target.closest('[data-dropdown]');
    if (toggle) {
      const key = toggle.getAttribute('data-dropdown');
      const list = document.getElementById('dd-' + key);
      const isOpen = list.classList.contains('open');
      document.querySelectorAll('.dropdown-list.open').forEach(el => el.classList.remove('open'));
      if (!isOpen) list.classList.add('open');
      e.stopPropagation();
      return;
    }
    if (!e.target.closest('.dropdown-list')) {
      document.querySelectorAll('.dropdown-list.open').forEach(el => el.classList.remove('open'));
    }

    const actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      const action = actionBtn.getAttribute('data-action');
      const id = actionBtn.getAttribute('data-id');
      const proc = state.processos.find(p => p.id === id);
      if (!proc) return;
      document.querySelectorAll('.dropdown-list.open').forEach(el => el.classList.remove('open'));
      routeAction(proc, action);
      return;
    }

    const openDetail = e.target.closest('[data-open-detail]');
    if (openDetail) {
      const proc = state.processos.find(p => p.id === openDetail.getAttribute('data-open-detail'));
      if (proc) openDetailModal(proc);
    }
  });

  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
}

// ===== Init =====
initApp();
