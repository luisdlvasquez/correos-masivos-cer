/* ==========================================================================
   MailPulse 360 v2 - Email Campaign, PDF Document & Multichannel Suite
   Application Logic & Metrics Engine (JavaScript ES6+)
   ========================================================================== */

const SUPABASE_URL = 'https://nzmnzmnozbeqttofbmlf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56bW56bW5vemJlcXR0b2ZibWxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk2NTAzMjQsImV4cCI6MjA5NTIyNjMyNH0.r3hrXsazoJK_xUWTsskEgjQ40Xhg60_0YaGvWs1VXP8';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

class MailPulseApp {
  constructor() {
    this.storageKey = 'mailpulse_state_v2';
    this.state = this.loadInitialState();
    this.activeView = 'dashboard';
    this.selectedCampaignId = 'all';

    // Chart instance
    this.timelineChart = null;

    this.init();
    this.refreshEventsFromSupabase();
    setInterval(() => this.refreshEventsFromSupabase(), 15000);
  }

  /* --------------------------------------------------------------------------
     1. Initial State & Data Persistence
     -------------------------------------------------------------------------- */
  loadInitialState() {
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Error parsing stored state:', e);
      }
    }

    // Default Seed Data
    return {
      campaigns: [
        { id: 'cmp_1', name: 'Contrato Arrendamiento Lote A', desc: 'Notificación de cobro y renovación para contratos del Lote A.', createdAt: '2026-07-25' },
        { id: 'cmp_2', name: 'Cold Outreach - Directores B2B', desc: 'Prospección masiva a directores de tecnología y operaciones en LATAM.', createdAt: '2026-08-01' },
        { id: 'cmp_3', name: 'Fidelización y Servicios Q3', desc: 'Envío de cartas formales de fidelización e informes trimestrales.', createdAt: '2026-08-03' }
      ],
      campaignDetectedVariables: {
        cmp_1: ['numero_contrato', 'monto_deuda', 'fecha_vencimiento'],
        cmp_2: ['vendedor', 'descuento'],
        cmp_3: ['numero_contrato', 'ciudad']
      },
      contacts: [
        { id: 'ct_1', campaignId: 'cmp_1', name: 'Carlos Mendoza', email: 'carlos.mendoza@techcorp.com', company: 'TechCorp Latam', role: 'Director de TI', customFields: { numero_contrato: 'CTR-2026-088', monto_deuda: '$4,500,000 COP', fecha_vencimiento: '15 de Agosto 2026' } },
        { id: 'ct_2', campaignId: 'cmp_1', name: 'Ana Gutiérrez', email: 'ana.gutierrez@innovasoft.io', company: 'InnovaSoft', role: 'Gerente de Operaciones', customFields: { numero_contrato: 'CTR-2026-092', monto_deuda: '$2,800,000 COP', fecha_vencimiento: '20 de Agosto 2026' } },
        { id: 'ct_3', campaignId: 'cmp_1', name: 'Roberto Gómez', email: 'roberto.gomez@datalogistics.net', company: 'DataLogistics', role: 'VP de Tecnología', customFields: { numero_contrato: 'CTR-2026-104', monto_deuda: '$6,100,000 COP', fecha_vencimiento: '18 de Agosto 2026' } },
        { id: 'ct_4', campaignId: 'cmp_2', name: 'Lucía Fernández', email: 'lucia.f@biosalud.org', company: 'BioSalud', role: 'Directora Comercial', customFields: { vendedor: 'Felipe Reyes', descuento: '15%' } },
        { id: 'ct_5', campaignId: 'cmp_2', name: 'Javier Martínez', email: 'jmartinez@fintechgroup.co', company: 'FintechGroup', role: 'CEO', customFields: { vendedor: 'Felipe Reyes', descuento: '20%' } },
        { id: 'ct_6', campaignId: 'cmp_3', name: 'Sofía López', email: 'sofia.lopez@cloudnexus.com', company: 'CloudNexus', role: 'CMO', customFields: { numero_contrato: 'CTR-2026-550', ciudad: 'Bogotá' } }
      ],
      events: []
    };
  }

  saveState() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.state));
  }

  /* --------------------------------------------------------------------------
     1b. Backend real: eventos desde Supabase (envío real + métricas reales)
     -------------------------------------------------------------------------- */
  async refreshEventsFromSupabase() {
    try {
      // Paginate through the full table instead of a flat .limit(1000) — a
      // campaign this size generates many more than 1000 event rows (each
      // contact can have sent/delivered/opened/... rows), and a hard cap here
      // made the dashboard undercount sends on large campaigns.
      const PAGE_SIZE = 1000;
      const HARD_CAP = 50000; // safety valve, not a normal-case limit
      let allRows = [];
      let from = 0;
      while (true) {
        const { data, error } = await supabaseClient
          .from('mailpulse_events')
          .select('*')
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw error;
        if (!data || data.length === 0) break;

        allRows = allRows.concat(data);
        if (data.length < PAGE_SIZE || allRows.length >= HARD_CAP) break;
        from += PAGE_SIZE;
      }

      this.state.events = allRows.map(row => ({
        id: row.id,
        campaignId: row.campaign_id,
        contactId: row.contact_id,
        subject: row.subject || '(sin asunto)',
        status: row.status,
        channel: row.channel || 'email',
        timestamp: new Date(row.created_at).toLocaleString('es-CO'),
        providerId: row.provider_id,
        errorMessage: row.error_message
      }));

      this.setLiveStatus(true);
      this.renderDashboard();
      this.renderCampaignsView();
      this.renderContactsView();
    } catch (e) {
      console.error('No se pudo conectar con Supabase (mailpulse_events):', e);
      this.setLiveStatus(false);
    }
  }

  setLiveStatus(isOnline) {
    const banner = document.getElementById('liveStatusBanner');
    if (!banner) return;
    if (isOnline) {
      banner.classList.remove('offline');
      banner.classList.add('online');
      banner.innerHTML = '<span class="dot-live"></span> En vivo · Supabase conectado';
    } else {
      banner.classList.remove('online');
      banner.classList.add('offline');
      banner.innerHTML = '<span class="dot-live"></span> Sin conexión a Supabase';
    }
  }

  /* --------------------------------------------------------------------------
     2. Initialization & View Router
     -------------------------------------------------------------------------- */
  init() {
    this.setupNavigation();
    this.setupEventListeners();
    this.populateCampaignSelectors();
    this.renderDashboard();
    this.renderCampaignsView();
    this.renderContactsView();
    this.renderDynamicTagBars();
    this.updatePreview();
    this.updateDocPreview();
  }

  setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
      item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        const view = item.getAttribute('data-view');
        this.switchView(view);
      });
    });
  }

  switchView(viewName) {
    this.activeView = viewName;
    document.querySelectorAll('.view-section').forEach(sec => sec.classList.remove('active'));

    const targetView = document.getElementById(`view-${viewName}`);
    if (targetView) targetView.classList.add('active');

    const titles = {
      dashboard: { title: 'Dashboard 360° de Campañas', sub: 'Métricas de rendimiento, tasa de conversión y gestión de riesgo en tiempo real.' },
      campaigns: { title: 'Gestión de Campañas y Contratos', sub: 'Organiza tus despachos masivos agrupados por proyectos o contratos específicos.' },
      templates: { title: 'Diseñador de Plantillas de Correo', sub: 'Personaliza correos con etiquetas dinámicas detectadas automáticamente.' },
      documents: { title: 'Diseñador de Cartas y Documentos PDF Membretados', sub: 'Carga documentos Word o diseña cartas con encabezado, pie de página y variables.' },
      contacts: { title: 'Audiencia por Campaña / Contrato', sub: 'Administra tus contactos aislados por campaña e importa archivos de Excel (.xlsx).' },
      multichannel: { title: 'Mensajería Multicanal (WhatsApp y SMS)', sub: 'Envía y gestiona mensajes de texto en múltiples canales de comunicación.' },
      simulator: { title: 'Simulador Interactivo de Eventos', sub: 'Prueba eventos reales o escenarios hipotéticos de respuesta y rebotes.' }
    };

    if (titles[viewName]) {
      document.getElementById('currentViewTitle').textContent = titles[viewName].title;
      document.getElementById('currentViewSubtitle').textContent = titles[viewName].sub;
    }

    if (viewName === 'contacts') this.renderContactsView();
    if (viewName === 'documents') this.updateDocPreview();
    if (viewName === 'templates') this.updatePreview();
  }

  setupEventListeners() {
    // Campaign Filter Dropdown Change
    const filterSelect = document.getElementById('campaignFilterSelect');
    filterSelect.addEventListener('change', (e) => {
      this.selectedCampaignId = e.target.value;
      this.renderDashboard();
      this.renderContactsView();
      this.renderDynamicTagBars();
      this.updatePreview();
      this.updateDocPreview();
    });

    // Activity Table Filters
    document.getElementById('tableStatusFilter').addEventListener('change', () => this.renderActivityTable());
    document.getElementById('tableSearchInput').addEventListener('input', () => this.renderActivityTable());

    // Top Bar Action Buttons
    document.getElementById('btnNewCampaign').addEventListener('click', () => this.openNewCampaignModal());
    document.getElementById('btnNewDispatch').addEventListener('click', () => this.openNewDispatchModal());
    document.getElementById('btnImportXLSX').addEventListener('click', () => this.openXLSXModal());
    document.getElementById('btnExportReport').addEventListener('click', () => this.exportMetricsCSV());
    document.getElementById('btnExportContactsXLSX').addEventListener('click', () => this.exportContactsXLSX());

    // Template Editors Input Listeners
    document.getElementById('templateSubject').addEventListener('input', () => this.updatePreview());
    document.getElementById('templateBody').addEventListener('input', () => this.updatePreview());
    document.getElementById('bannerImageInput').addEventListener('change', (e) => this.handleBannerImageUpload(e));
    document.getElementById('previewContactSelect').addEventListener('change', () => this.updatePreview());

    // Document Designer Input Listeners
    document.getElementById('docHeaderTitle').addEventListener('input', () => this.updateDocPreview());
    document.getElementById('docBodyText').addEventListener('input', () => this.updateDocPreview());
    document.getElementById('docFooterText').addEventListener('input', () => this.updateDocPreview());
    document.getElementById('docPreviewContactSelect').addEventListener('change', () => this.updateDocPreview());

    // DOCX Word File Upload Listener
    document.getElementById('docxFileInput').addEventListener('change', (e) => this.handleDOCXUpload(e));
  }

  /* --------------------------------------------------------------------------
     3. Metrics Calculation Engine 360°
     -------------------------------------------------------------------------- */
  getFilteredEvents() {
    if (this.selectedCampaignId === 'all') {
      return this.state.events;
    }
    return this.state.events.filter(e => e.campaignId === this.selectedCampaignId);
  }

  calculateMetrics() {
    const events = this.getFilteredEvents();
    const totalSent = events.length;

    if (totalSent === 0) {
      return {
        sent: 0, delivered: 0, opened: 0, clicked: 0, accepted: 0,
        bounced: 0, unsubscribed: 0, spam: 0, rejected: 0, unopened: 0,
        rateDelivered: 0, rateOpened: 0, rateClicked: 0, rateAccepted: 0,
        rateBounced: 0, rateUnsubscribed: 0, rateSpam: 0, rateRejected: 0, rateUnopened: 0,
        healthScore: 100
      };
    }

    const bounced = events.filter(e => e.status === 'bounced').length;
    const delivered = totalSent - bounced;
    
    const opened = events.filter(e => ['opened', 'clicked', 'accepted'].includes(e.status)).length;
    const clicked = events.filter(e => ['clicked', 'accepted'].includes(e.status)).length;
    const accepted = events.filter(e => e.status === 'accepted').length;

    const unsubscribed = events.filter(e => e.status === 'unsubscribed').length;
    const spam = events.filter(e => e.status === 'spam').length;
    const rejected = events.filter(e => e.status === 'rejected').length;
    const unopened = events.filter(e => e.status === 'unopened').length;

    const rateDelivered = (delivered / totalSent) * 100;
    const rateOpened = delivered > 0 ? (opened / delivered) * 100 : 0;
    const rateClicked = delivered > 0 ? (clicked / delivered) * 100 : 0;
    const rateAccepted = delivered > 0 ? (accepted / delivered) * 100 : 0;

    const rateBounced = (bounced / totalSent) * 100;
    const rateUnsubscribed = delivered > 0 ? (unsubscribed / delivered) * 100 : 0;
    const rateSpam = delivered > 0 ? (spam / delivered) * 100 : 0;
    const rateRejected = delivered > 0 ? (rejected / delivered) * 100 : 0;
    const rateUnopened = delivered > 0 ? (unopened / delivered) * 100 : 0;

    let healthScore = 100 - (rateBounced * 1.8 + rateSpam * 5.0 + rateUnsubscribed * 1.2);
    healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

    return {
      sent: totalSent, delivered, opened, clicked, accepted,
      bounced, unsubscribed, spam, rejected, unopened,
      rateDelivered: rateDelivered.toFixed(1),
      rateOpened: rateOpened.toFixed(1),
      rateClicked: rateClicked.toFixed(1),
      rateAccepted: rateAccepted.toFixed(1),
      rateBounced: rateBounced.toFixed(1),
      rateUnsubscribed: rateUnsubscribed.toFixed(1),
      rateSpam: rateSpam.toFixed(1),
      rateRejected: rateRejected.toFixed(1),
      rateUnopened: rateUnopened.toFixed(1),
      healthScore
    };
  }

  /* --------------------------------------------------------------------------
     4. Render Dashboard & Visual Charts
     -------------------------------------------------------------------------- */
  renderDashboard() {
    const metrics = this.calculateMetrics();

    document.getElementById('metricSent').textContent = metrics.sent.toLocaleString();
    document.getElementById('metricDelivered').textContent = metrics.delivered.toLocaleString();
    document.getElementById('rateDelivered').textContent = `${metrics.rateDelivered}%`;

    document.getElementById('metricOpened').textContent = metrics.opened.toLocaleString();
    document.getElementById('rateOpened').textContent = `${metrics.rateOpened}%`;

    document.getElementById('metricClicked').textContent = metrics.clicked.toLocaleString();
    document.getElementById('rateClicked').textContent = `${metrics.rateClicked}%`;

    document.getElementById('metricAccepted').textContent = metrics.accepted.toLocaleString();
    document.getElementById('rateAccepted').textContent = `${metrics.rateAccepted}%`;

    document.getElementById('metricBounced').textContent = metrics.bounced.toLocaleString();
    document.getElementById('rateBounced').textContent = `${metrics.rateBounced}%`;

    document.getElementById('metricUnsubscribed').textContent = metrics.unsubscribed.toLocaleString();
    document.getElementById('rateUnsubscribed').textContent = `${metrics.rateUnsubscribed}%`;

    document.getElementById('metricSpam').textContent = metrics.spam.toLocaleString();
    document.getElementById('rateSpam').textContent = `${metrics.rateSpam}%`;

    document.getElementById('metricRejected').textContent = metrics.rejected.toLocaleString();
    document.getElementById('rateRejected').textContent = `${metrics.rateRejected}%`;

    document.getElementById('metricUnopened').textContent = metrics.unopened.toLocaleString();
    document.getElementById('rateUnopened').textContent = `${metrics.rateUnopened}%`;

    const healthFill = document.getElementById('sidebarHealthFill');
    const healthText = document.getElementById('sidebarHealthPercent');
    healthFill.style.width = `${metrics.healthScore}%`;

    if (metrics.healthScore >= 90) {
      healthText.textContent = `${metrics.healthScore}% (Excelente)`;
      healthFill.style.background = 'linear-gradient(90deg, #10b981, #06b6d4)';
    } else if (metrics.healthScore >= 75) {
      healthText.textContent = `${metrics.healthScore}% (Aceptable)`;
      healthFill.style.background = 'linear-gradient(90deg, #f59e0b, #eab308)';
    } else {
      healthText.textContent = `${metrics.healthScore}% (Riesgo Alto)`;
      healthFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
    }

    this.renderCharts(metrics);
    this.renderBreakdownProgress(metrics);
    this.renderActivityTable();
  }

  renderBreakdownProgress(m) {
    const container = document.getElementById('breakdownList');

    const items = [
      { label: 'Aperturas Positivas', count: m.opened, rate: m.rateOpened, color: '#10b981' },
      { label: 'Clics y Lectura', count: m.clicked, rate: m.rateClicked, color: '#06b6d4' },
      { label: 'Aceptados / Conversión', count: m.accepted, rate: m.rateAccepted, color: '#8b5cf6' },
      { label: 'Rebotes de Servidor (-)', count: m.bounced, rate: m.rateBounced, color: '#ef4444' },
      { label: 'Bajas de Suscripción (-)', count: m.unsubscribed, rate: m.rateUnsubscribed, color: '#f59e0b' },
      { label: 'Quejas de Spam (-)', count: m.spam, rate: m.rateSpam, color: '#dc2626' },
      { label: 'Respuestas Rechazadas (-)', count: m.rejected, rate: m.rateRejected, color: '#ec4899' },
      { label: 'Sin Abrir / Inactivos (-)', count: m.unopened, rate: m.rateUnopened, color: '#64748b' }
    ];

    container.innerHTML = items.map(item => `
      <div class="breakdown-item">
        <div class="breakdown-info">
          <span class="breakdown-name">
            <span class="breakdown-dot" style="background: ${item.color};"></span>
            ${item.label}
          </span>
          <span class="breakdown-val">${item.count} (${item.rate}%)</span>
        </div>
        <div class="progress-bg">
          <div class="progress-fill" style="width: ${Math.min(100, item.rate)}%; background: ${item.color};"></div>
        </div>
      </div>
    `).join('');
  }

  renderCharts(m) {
    const ctxTimeline = document.getElementById('timelineChart').getContext('2d');

    if (this.timelineChart) {
      this.timelineChart.destroy();
    }

    this.timelineChart = new Chart(ctxTimeline, {
      type: 'bar',
      data: {
        labels: ['Abiertos', 'Clics', 'Aceptados', 'Rebotes (-)', 'Bajas (-)', 'Spam (-)', 'Rechazos (-)'],
        datasets: [{
          label: 'Cantidad de Eventos',
          data: [m.opened, m.clicked, m.accepted, m.bounced, m.unsubscribed, m.spam, m.rejected],
          backgroundColor: [
            'rgba(16, 185, 129, 0.75)',
            'rgba(6, 182, 212, 0.75)',
            'rgba(139, 92, 246, 0.75)',
            'rgba(239, 68, 68, 0.75)',
            'rgba(245, 158, 11, 0.75)',
            'rgba(220, 38, 38, 0.75)',
            'rgba(236, 72, 153, 0.75)'
          ],
          borderColor: [
            '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#f59e0b', '#dc2626', '#ec4899'
          ],
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
          y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94a3b8', font: { family: 'Inter', size: 11 } }, beginAtZero: true }
        }
      }
    });
  }

  /* --------------------------------------------------------------------------
     5. Activity Data Table
     -------------------------------------------------------------------------- */
  renderActivityTable() {
    const tbody = document.getElementById('activityTableBody');
    const statusFilter = document.getElementById('tableStatusFilter').value;
    const searchQuery = document.getElementById('tableSearchInput').value.toLowerCase().trim();

    let events = this.getFilteredEvents();

    if (statusFilter !== 'all') {
      events = events.filter(e => e.status === statusFilter);
    }

    if (searchQuery) {
      events = events.filter(e => {
        const contact = this.state.contacts.find(c => c.id === e.contactId) || {};
        return (contact.name || '').toLowerCase().includes(searchQuery) ||
               (contact.email || '').toLowerCase().includes(searchQuery) ||
               (contact.company || '').toLowerCase().includes(searchQuery) ||
               (e.subject || '').toLowerCase().includes(searchQuery);
      });
    }

    if (events.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No se encontraron eventos con los filtros seleccionados.
          </td>
        </tr>
      `;
      return;
    }

    const badgeMap = {
      sent: '<span class="badge badge-sent"><i class="fa-solid fa-paper-plane"></i> Enviado</span>',
      opened: '<span class="badge badge-opened"><i class="fa-solid fa-envelope-open"></i> Abierto</span>',
      clicked: '<span class="badge badge-clicked"><i class="fa-solid fa-arrow-pointer"></i> Clic/Leído</span>',
      accepted: '<span class="badge badge-accepted"><i class="fa-solid fa-star"></i> Aceptado</span>',
      bounced: '<span class="badge badge-bounced"><i class="fa-solid fa-triangle-exclamation"></i> Rebotado</span>',
      unsubscribed: '<span class="badge badge-unsubscribed"><i class="fa-solid fa-user-minus"></i> Baja</span>',
      spam: '<span class="badge badge-spam"><i class="fa-solid fa-ban"></i> Spam</span>',
      rejected: '<span class="badge badge-rejected"><i class="fa-solid fa-thumbs-down"></i> Rechazado</span>',
      unopened: '<span class="badge badge-unopened"><i class="fa-solid fa-envelope"></i> Sin Abrir</span>'
    };

    tbody.innerHTML = events.map(e => {
      const contact = this.state.contacts.find(c => c.id === e.contactId) || { name: 'Desconocido', email: 'n/a', company: 'N/A' };
      const campaign = this.state.campaigns.find(cmp => cmp.id === e.campaignId) || { name: 'General' };

      return `
        <tr>
          <td class="font-mono" style="font-size: 0.8rem; color: var(--text-muted);">${e.timestamp}</td>
          <td><strong style="font-size: 0.85rem;">${campaign.name}</strong></td>
          <td>
            <div style="font-weight: 600;">${contact.name}</div>
            <div style="font-size: 0.78rem; color: var(--text-muted);">${contact.email}</div>
          </td>
          <td>${contact.company}</td>
          <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${e.subject}</td>
          <td>${badgeMap[e.status] || e.status}</td>
          <td>
            <button class="btn btn-secondary btn-sm" onclick="app.simulateSingleEvent('${e.id}')">
              <i class="fa-solid fa-arrows-rotate"></i> Cambiar Estado
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  /* --------------------------------------------------------------------------
     6. Dynamic Tag Bar & Variable Detection Engine
     -------------------------------------------------------------------------- */
  getAvailableVariablesForActiveCampaign() {
    const baseVars = ['nombre', 'email', 'empresa', 'cargo'];
    let customVars = [];

    if (this.selectedCampaignId !== 'all') {
      customVars = this.state.campaignDetectedVariables[this.selectedCampaignId] || [];
    } else {
      // Aggregate all custom variables from all campaigns
      Object.values(this.state.campaignDetectedVariables).forEach(arr => {
        arr.forEach(v => {
          if (!customVars.includes(v)) customVars.push(v);
        });
      });
    }

    return { baseVars, customVars };
  }

  renderDynamicTagBars() {
    const { baseVars, customVars } = this.getAvailableVariablesForActiveCampaign();

    const renderBar = (elementId, targetTextareaId) => {
      const el = document.getElementById(elementId);
      if (!el) return;

      const baseHtml = baseVars.map(v => `
        <span class="var-tag" onclick="app.insertVar('{{${v}}}', '${targetTextareaId}')">
          <i class="fa-solid fa-tag"></i> {{${v}}}
        </span>
      `).join('');

      const customHtml = customVars.map(v => `
        <span class="var-tag var-tag-custom" onclick="app.insertVar('{{${v}}}', '${targetTextareaId}')">
          <i class="fa-solid fa-bolt"></i> {{${v}}}
        </span>
      `).join('');

      el.innerHTML = baseHtml + customHtml;
    };

    renderBar('emailDynamicTagsBar', 'templateBody');
    renderBar('docDynamicTagsBar', 'docBodyText');
  }

  insertVar(varTag, targetId) {
    const textarea = document.getElementById(targetId);
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;

    textarea.value = textarea.value.substring(0, start) + varTag + textarea.value.substring(end);
    textarea.focus();

    if (targetId === 'templateBody') this.updatePreview();
    if (targetId === 'docBodyText') this.updateDocPreview();
  }

  handleBannerImageUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.showToast('Selecciona un archivo de imagen valido (PNG, JPG, etc.).', 'danger');
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target.result;
      const imgTag = `<img src="${dataUrl}" alt="Banner" style="max-width:100%; display:block; margin-bottom:16px;">`;

      const textarea = document.getElementById('templateBody');
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      textarea.value = textarea.value.substring(0, start) + imgTag + '\n\n' + textarea.value.substring(end);

      const sizeKB = Math.round(file.size / 1024);
      if (sizeKB > 150) {
        this.showToast(`Imagen insertada (${sizeKB} KB). Esta un poco pesada: para evitar que el correo se recorte o caiga en spam, considera comprimirla a menos de 150 KB.`, 'warning');
      } else {
        this.showToast(`Imagen insertada en el cuerpo del correo (${sizeKB} KB).`, 'success');
      }

      this.updatePreview();
      event.target.value = '';
    };
    reader.onerror = () => {
      this.showToast('No se pudo leer la imagen.', 'danger');
    };
    reader.readAsDataURL(file);
  }

  /* --------------------------------------------------------------------------
     7. Live Email & DOC/PDF Previews with Dynamic Replacements
     -------------------------------------------------------------------------- */
  getContactsForActiveCampaign() {
    if (this.selectedCampaignId === 'all') return this.state.contacts;
    return this.state.contacts.filter(c => c.campaignId === this.selectedCampaignId);
  }

  populateContactPreviewSelectors() {
    const contacts = this.getContactsForActiveCampaign();
    const html = contacts.map(c => `
      <option value="${c.id}">${c.name} (${c.company})</option>
    `).join('') || '<option value="">Sin contactos en esta campaña</option>';

    document.getElementById('previewContactSelect').innerHTML = html;
    document.getElementById('docPreviewContactSelect').innerHTML = html;
  }

  replaceVariablesInText(text, contact) {
    if (!text || !contact) return text || '';

    let result = text;
    const replacements = {
      '{{nombre}}': contact.name,
      '{{email}}': contact.email,
      '{{empresa}}': contact.company,
      '{{cargo}}': contact.role
    };

    if (contact.customFields) {
      Object.keys(contact.customFields).forEach(key => {
        replacements[`{{${key}}}`] = contact.customFields[key];
      });
    }

    Object.keys(replacements).forEach(key => {
      const reg = new RegExp(key, 'g');
      result = result.replace(reg, replacements[key]);
    });

    return result;
  }

  updatePreview() {
    this.populateContactPreviewSelectors();
    const contactId = document.getElementById('previewContactSelect').value;
    const contact = this.state.contacts.find(c => c.id === contactId) || (this.state.contacts[0] || { name: 'Ejemplo', email: 'ejemplo@correo.com', company: 'Empresa', role: 'Cargo' });

    let subject = document.getElementById('templateSubject').value;
    let body = document.getElementById('templateBody').value;

    subject = this.replaceVariablesInText(subject, contact);
    body = this.replaceVariablesInText(body, contact);

    document.getElementById('previewTo').textContent = contact.email;
    document.getElementById('previewSubjectDisplay').textContent = subject;
    document.getElementById('previewBodyDisplay').innerHTML = body.replace(/\n/g, '<br>');
  }

  updateDocPreview() {
    const contactId = document.getElementById('docPreviewContactSelect').value;
    const contact = this.state.contacts.find(c => c.id === contactId) || (this.state.contacts[0] || { name: 'Ejemplo', email: 'ejemplo@correo.com', company: 'Empresa', role: 'Cargo' });

    let header = document.getElementById('docHeaderTitle').value;
    let body = document.getElementById('docBodyText').value;
    let footer = document.getElementById('docFooterText').value;

    header = this.replaceVariablesInText(header, contact);
    body = this.replaceVariablesInText(body, contact);
    footer = this.replaceVariablesInText(footer, contact);

    document.getElementById('a4HeaderDisplay').textContent = header;
    document.getElementById('a4BodyDisplay').textContent = body;
    document.getElementById('a4FooterDisplay').textContent = footer;
  }

  /* --------------------------------------------------------------------------
     8. DOCX Upload Handler & PDF Generation
     -------------------------------------------------------------------------- */
  handleDOCXUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const arrayBuffer = e.target.result;
      mammoth.extractRawText({ arrayBuffer: arrayBuffer })
        .then((result) => {
          document.getElementById('docBodyText').value = result.value;
          this.updateDocPreview();
          this.showToast('¡Plantilla de Word (.docx) cargada con éxito en el editor!', 'success');
        })
        .catch((err) => {
          console.error(err);
          this.showToast('Error al leer el archivo .docx', 'danger');
        });
    };
    reader.readAsArrayBuffer(file);
  }

  downloadSinglePDF() {
    const element = document.getElementById('a4PaperCanvas');
    const contactId = document.getElementById('docPreviewContactSelect').value;
    const contact = this.state.contacts.find(c => c.id === contactId) || { name: 'Documento' };

    const opt = {
      margin: 10,
      filename: `Carta_Oficial_${contact.name.replace(/\s+/g, '_')}.pdf`,
      image: { type: 'jpeg', quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(element).save();
    this.showToast(`Generando y descargando PDF para ${contact.name}...`, 'success');
  }

  /* --------------------------------------------------------------------------
     9. Campaign-scoped Contacts View & XLSX Import
     -------------------------------------------------------------------------- */
  populateCampaignSelectors() {
    const filterSelect = document.getElementById('campaignFilterSelect');
    const dispatchSelect = document.getElementById('dispatchCampaignSelect');
    const xlsxTargetSelect = document.getElementById('xlsxCampaignTargetSelect');
    const contactTargetSelect = document.getElementById('contactCampaignTargetSelect');

    const options = this.state.campaigns.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    filterSelect.innerHTML = `<option value="all">🌐 Todas las Campañas (Consolidado)</option>${options}`;
    if (dispatchSelect) dispatchSelect.innerHTML = options;
    if (xlsxTargetSelect) xlsxTargetSelect.innerHTML = options;
    if (contactTargetSelect) contactTargetSelect.innerHTML = options;
  }

  renderCampaignsView() {
    const grid = document.getElementById('campaignsGrid');
    grid.innerHTML = this.state.campaigns.map(c => {
      const cmpEvents = this.state.events.filter(e => e.campaignId === c.id);
      const totalSent = cmpEvents.length;
      const opened = cmpEvents.filter(e => ['opened', 'clicked', 'accepted'].includes(e.status)).length;
      const openRate = totalSent > 0 ? ((opened / totalSent) * 100).toFixed(1) : '0.0';

      const bounced = cmpEvents.filter(e => e.status === 'bounced').length;
      const bounceRate = totalSent > 0 ? ((bounced / totalSent) * 100).toFixed(1) : '0.0';

      const vars = this.state.campaignDetectedVariables[c.id] || [];
      const varBadges = vars.map(v => `<span class="var-tag var-tag-custom" style="font-size:0.7rem;">{{${v}}}</span>`).join('');

      return `
        <div class="metric-card" style="--card-accent: var(--primary);">
          <div class="metric-header">
            <span style="font-weight: 700; color: #fff; font-size: 1rem;">${c.name}</span>
            <span class="badge badge-sent">${totalSent} envíos</span>
          </div>
          <p style="font-size: 0.83rem; color: var(--text-muted); margin-bottom: 0.75rem; min-height: 38px;">${c.desc}</p>
          <div style="margin-bottom: 0.75rem;">
            <span class="text-muted" style="font-size: 0.75rem;">Variables XLSX:</span> ${varBadges || '<span style="font-size:0.75rem; color:#64748b;">Estándar</span>'}
          </div>
          <div class="flex-between" style="font-size: 0.8rem; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
            <div>
              <span class="text-muted">Apertura:</span> <strong style="color: var(--opened-color);">${openRate}%</strong>
            </div>
            <div>
              <span class="text-muted">Rebotes (-):</span> <strong style="color: var(--bounce-color);">${bounceRate}%</strong>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  renderContactsView() {
    const tbody = document.getElementById('contactsTableBody');
    const contacts = this.getContactsForActiveCampaign();

    // Active Campaign Badge
    const cmpNameDisplay = document.getElementById('currentCampaignNameBadge');
    if (cmpNameDisplay) {
      if (this.selectedCampaignId === 'all') cmpNameDisplay.textContent = 'Todas las Campañas (Consolidado)';
      else {
        const activeCmp = this.state.campaigns.find(c => c.id === this.selectedCampaignId);
        cmpNameDisplay.textContent = activeCmp ? activeCmp.name : 'Campaña Seleccionada';
      }
    }

    const { customVars } = this.getAvailableVariablesForActiveCampaign();
    const badgesContainer = document.getElementById('detectedFieldsBadgeList');
    if (badgesContainer) {
      badgesContainer.innerHTML = customVars.map(v => `
        <span class="var-tag var-tag-custom"><i class="fa-solid fa-bolt"></i> {{${v}}}</span>
      `).join('');
    }

    if (contacts.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">
            No hay contactos asignados a esta campaña. Haz clic en "Cargar Excel (.xlsx)" para importar los destinatarios.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = contacts.map(c => {
      const history = this.state.events.filter(e => e.contactId === c.id);
      const statuses = history.map(h => h.status);

      let historyBadge = '<span class="badge badge-unopened">Sin Envíos</span>';
      if (statuses.includes('accepted')) historyBadge = '<span class="badge badge-accepted">Aceptó Propuesta</span>';
      else if (statuses.includes('clicked')) historyBadge = '<span class="badge badge-clicked">Hizo Clic</span>';
      else if (statuses.includes('opened')) historyBadge = '<span class="badge badge-opened">Abrió Correo</span>';
      else if (statuses.includes('bounced')) historyBadge = '<span class="badge badge-bounced">Rebotado</span>';
      else if (statuses.includes('unsubscribed')) historyBadge = '<span class="badge badge-unsubscribed">Baja</span>';
      else if (statuses.includes('spam')) historyBadge = '<span class="badge badge-spam">Spam</span>';

      // Custom fields list string
      let customFieldsHtml = '-';
      if (c.customFields && Object.keys(c.customFields).length > 0) {
        customFieldsHtml = Object.entries(c.customFields)
          .map(([k, v]) => `<span style="font-size:0.75rem; display:inline-block; margin-right:4px;"><strong>${k}:</strong> ${v}</span>`)
          .join('<br>');
      }

      return `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td class="font-mono">${c.email}</td>
          <td>${c.company}</td>
          <td>${c.role}</td>
          <td>${customFieldsHtml}</td>
          <td>${historyBadge}</td>
          <td>
            <button class="btn btn-danger btn-sm" onclick="app.deleteContact('${c.id}')">
              <i class="fa-solid fa-trash"></i> Eliminar
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  processXLSX() {
    const fileInput = document.getElementById('xlsxFileInput');
    const targetCampaignId = document.getElementById('xlsxCampaignTargetSelect').value;

    if (!fileInput.files || fileInput.files.length === 0) {
      this.showToast('Selecciona un archivo Excel (.xlsx) o CSV.', 'danger');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = (e) => {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

      if (json.length === 0) {
        this.showToast('El archivo Excel no contiene datos.', 'danger');
        return;
      }

      // Column Key Normalizer
      let imported = 0;
      let skippedDuplicates = 0;
      let detectedVars = [];

      // Dedup guard: emails already present in this campaign (existing contacts
      // plus anything imported earlier in this same file) never get a second contact.
      const existingEmailsInCampaign = new Set(
        this.state.contacts
          .filter(c => c.campaignId === targetCampaignId)
          .map(c => (c.email || '').trim().toLowerCase())
      );

      json.forEach(row => {
        const keys = Object.keys(row);
        let name = '', email = '', company = '', role = '';
        let customFields = {};

        keys.forEach(k => {
          const lowerKey = k.trim().toLowerCase();
          const val = String(row[k]).trim();

          if (['nombre', 'name', 'nombre completo'].includes(lowerKey)) name = val;
          else if (['email', 'correo', 'correo electronico', 'e-mail'].includes(lowerKey)) email = val;
          else if (['empresa', 'company', 'compañia'].includes(lowerKey)) company = val;
          else if (['cargo', 'role', 'puesto'].includes(lowerKey)) role = val;
          else {
            // Extra dynamic custom column!
            const cleanCustomKey = lowerKey.replace(/\s+/g, '_');
            customFields[cleanCustomKey] = val;
            if (!detectedVars.includes(cleanCustomKey)) detectedVars.push(cleanCustomKey);
          }
        });

        if (email) {
          const normalizedEmail = email.trim().toLowerCase();
          if (existingEmailsInCampaign.has(normalizedEmail)) {
            skippedDuplicates++;
            return;
          }
          existingEmailsInCampaign.add(normalizedEmail);
          this.state.contacts.push({
            id: 'ct_' + Date.now() + '_' + Math.random().toString(36).substring(2, 5),
            campaignId: targetCampaignId,
            name: name || email.split('@')[0],
            email: email,
            company: company || 'N/A',
            role: role || 'N/A',
            customFields: customFields
          });
          imported++;
        }
      });

      // Store detected variables for campaign
      if (!this.state.campaignDetectedVariables[targetCampaignId]) {
        this.state.campaignDetectedVariables[targetCampaignId] = [];
      }
      detectedVars.forEach(v => {
        if (!this.state.campaignDetectedVariables[targetCampaignId].includes(v)) {
          this.state.campaignDetectedVariables[targetCampaignId].push(v);
        }
      });

      this.saveState();
      this.closeModals();
      this.renderContactsView();
      this.renderDynamicTagBars();
      this.updatePreview();
      this.updateDocPreview();

      const dupMsg = skippedDuplicates > 0 ? ` Se omitieron ${skippedDuplicates} correos duplicados (ya existían en esta campaña).` : '';
      this.showToast(`¡Importación exitosa! Se cargaron ${imported} contactos en la campaña y se detectaron ${detectedVars.length} variables dinámicas nuevas.${dupMsg}`, 'success');
    };

    reader.readAsArrayBuffer(file);
  }

  /* --------------------------------------------------------------------------
     10. Batch Dispatch Engine & Multichannel Simulator
     -------------------------------------------------------------------------- */
  async executeDispatch() {
    const campaignId = document.getElementById('dispatchCampaignSelect').value;
    const subjectTemplate = document.getElementById('dispatchSubject').value;
    const attachPdf = document.getElementById('dispatchAttachPdfCheckbox').checked;
    const fromEmailInput = document.getElementById('dispatchFromEmail');
    const replyToInput = document.getElementById('dispatchReplyTo');
    const fromEmail = fromEmailInput ? fromEmailInput.value.trim() : '';
    const replyTo = replyToInput ? replyToInput.value.trim() : '';

    if (!campaignId) {
      this.showToast('Por favor selecciona una campaña.', 'danger');
      return;
    }

    const campaignContacts = this.state.contacts.filter(c => c.campaignId === campaignId);

    if (campaignContacts.length === 0) {
      this.showToast('No hay contactos registrados en esta campaña. Carga un archivo Excel primero.', 'warning');
      return;
    }

    const campaign = this.state.campaigns.find(cmp => cmp.id === campaignId);
    const bodyTemplate = document.getElementById('templateBody').value || '';

    // Idempotency: never re-send to a contact that already has a successful or
    // terminal event for this campaign. Makes it safe to re-run dispatch on a
    // large campaign (e.g. after a partial failure) without double-sending.
    const alreadyHandled = new Set(
      this.state.events
        .filter(e => e.campaignId === campaignId && ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'unsubscribed', 'spam'].includes(e.status))
        .map(e => e.contactId)
    );
    const pending = campaignContacts.filter(c => !alreadyHandled.has(c.id));
    const skipped = campaignContacts.length - pending.length;

    if (pending.length === 0) {
      this.showToast('Todos los contactos de esta campaña ya fueron enviados previamente (0 pendientes).', 'warning');
      return;
    }

    this.closeModals();
    this.showToast(`Enviando correos reales a ${pending.length} contactos vía Resend` + (skipped > 0 ? ` (${skipped} ya enviados, se omiten)` : '') + `... Esto puede tardar varios minutos para lotes grandes, no cierres la pestaña.`, 'info');

    let sentOk = 0;
    let sentFail = 0;
    let errorDetails = [];

    // Resend's API rate limit is ~10 req/s. Send in small concurrent batches
    // with a pause between batches to stay safely under that, and retry each
    // contact once on failure (covers transient 429/network errors).
    const BATCH_SIZE = 4;
    const BATCH_DELAY_MS = 900;
    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    const sendOne = async (c, attempt = 1) => {
      const subject = this.replaceVariablesInText(subjectTemplate, c) + (attachPdf ? ' [PDF Membretado Adjunto]' : '');
      const htmlBody = this.replaceVariablesInText(bodyTemplate, c).replace(/\n/g, '<br>') || `<p>${subject}</p>`;

      try {
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/mailpulse-send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'apikey': SUPABASE_ANON_KEY
          },
          body: JSON.stringify({
            to: c.email,
            subject: subject,
            html: htmlBody,
            campaignId: campaignId,
            campaignName: campaign ? campaign.name : null,
            contactId: c.id,
            contactName: c.name,
            contactCompany: c.company,
            fromEmail: fromEmail || undefined,
            replyTo: replyTo || undefined
          })
        });

        let json = null;
        let rawText = '';
        try {
          rawText = await resp.text();
          json = rawText ? JSON.parse(rawText) : null;
        } catch (parseErr) {
          // response wasn't JSON (e.g. a gateway/error page) - keep rawText as the detail
        }

        if (resp.ok && json && json.ok) {
          sentOk++;
          return;
        }

        // Retry once on rate-limit / server errors before giving up.
        if (attempt === 1 && (resp.status === 429 || resp.status >= 500)) {
          await sleep(1500);
          return sendOne(c, 2);
        }

        sentFail++;
        const detail = (json && (json.error || json.message)) || rawText || `HTTP ${resp.status} ${resp.statusText}`;
        errorDetails.push(`${c.email}: [${resp.status}] ${String(detail).slice(0, 200)}`);
      } catch (e) {
        if (attempt === 1) {
          await sleep(1500);
          return sendOne(c, 2);
        }
        console.error('Error enviando a', c.email, e);
        sentFail++;
        errorDetails.push(`${c.email}: ${e.message || 'Error de red/conexión (revisa la consola del navegador con F12)'}`);
      }
    };

    for (let i = 0; i < pending.length; i += BATCH_SIZE) {
      const batch = pending.slice(i, i + BATCH_SIZE);
      await Promise.all(batch.map(c => sendOne(c)));

      const done = Math.min(i + BATCH_SIZE, pending.length);
      if (done % 100 < BATCH_SIZE || done === pending.length) {
        this.showToast(`Progreso: ${done}/${pending.length} procesados (${sentOk} ok, ${sentFail} error)...`, 'info');
      }

      if (i + BATCH_SIZE < pending.length) await sleep(BATCH_DELAY_MS);
    }

    await this.refreshEventsFromSupabase();

    if (sentFail > 0) {
      const detailHtml = errorDetails.slice(0, 5).map(d => `&bull; ${d}`).join('<br>');
      this.showToast(`<strong>Envío real: ${sentOk} enviados, ${sentFail} con error.</strong><br>${detailHtml}`, 'danger');
      console.error('Detalle de errores del envio masivo:', errorDetails);
    } else {
      this.showToast(`Envío real completado: ${sentOk} enviados, ${sentFail} con error/rechazo. Revisa la tabla de actividad para el estado real.`, 'success');
    }
  }

  simulateMultichannelDispatch(channel) {
    const contacts = this.getContactsForActiveCampaign();
    if (contacts.length === 0) {
      this.showToast('No hay contactos en esta campaña para enviar.', 'warning');
      return;
    }

    const channelNames = { whatsapp: 'WhatsApp', sms: 'SMS' };
    this.showToast(`Simulando despacho masivo de ${contacts.length} mensajes por ${channelNames[channel]}...`, 'success');
  }

  simulateRandomEvents(targetStatus, count = 1) {
    this.showToast('Simulador desactivado: las métricas ahora son reales (Resend + Supabase). Los estados cambian solos cuando ocurre el evento real (entrega, apertura, clic o rebote).', 'info');
  }

  simulateSingleEvent(eventId) {
    this.showToast('Este evento es real: su estado cambiará automáticamente cuando Resend reporte la entrega/apertura/clic real vía webhook.', 'info');
  }

  /* --------------------------------------------------------------------------
     11. Modals & Helpers
     -------------------------------------------------------------------------- */
  openNewCampaignModal() { document.getElementById('modalCampaign').classList.add('active'); }
  openNewDispatchModal() { this.populateCampaignSelectors(); document.getElementById('modalDispatch').classList.add('active'); }
  openXLSXModal() { this.populateCampaignSelectors(); document.getElementById('modalXLSX').classList.add('active'); }
  openAddContactModal() { this.populateCampaignSelectors(); document.getElementById('modalContact').classList.add('active'); }
  closeModals() { document.querySelectorAll('.modal-backdrop').forEach(m => m.classList.remove('active')); }

  saveCampaign() {
    const name = document.getElementById('newCampaignName').value.trim();
    const desc = document.getElementById('newCampaignDesc').value.trim();

    if (!name) {
      this.showToast('Ingresa un nombre para la campaña.', 'danger');
      return;
    }

    const newCmp = {
      id: 'cmp_' + Date.now(),
      name, desc: desc || 'Sin descripción',
      createdAt: new Date().toISOString().split('T')[0]
    };

    this.state.campaigns.push(newCmp);
    this.state.campaignDetectedVariables[newCmp.id] = [];
    this.saveState();
    this.populateCampaignSelectors();
    this.renderCampaignsView();
    this.closeModals();
    this.showToast(`Campaña / Contrato "${name}" creado exitosamente.`, 'success');
  }

  saveContact() {
    const campaignId = document.getElementById('contactCampaignTargetSelect').value;
    const name = document.getElementById('contactName').value.trim();
    const email = document.getElementById('contactEmail').value.trim();
    const company = document.getElementById('contactCompany').value.trim();
    const role = document.getElementById('contactRole').value.trim();

    if (!name || !email) {
      this.showToast('Nombre y Correo son requeridos.', 'danger');
      return;
    }

    const newContact = {
      id: 'ct_' + Date.now(),
      campaignId: campaignId,
      name, email,
      company: company || 'N/A',
      role: role || 'N/A',
      customFields: {}
    };

    this.state.contacts.push(newContact);
    this.saveState();
    this.renderContactsView();
    this.closeModals();
    this.showToast(`Contacto ${name} agregado.`, 'success');
  }

  deleteContact(contactId) {
    if (confirm('¿Seguro que deseas eliminar este contacto?')) {
      this.state.contacts = this.state.contacts.filter(c => c.id !== contactId);
      this.saveState();
      this.renderContactsView();
      this.showToast('Contacto eliminado.', 'info');
    }
  }

  exportMetricsCSV() {
    const m = this.calculateMetrics();
    const data = [
      ['MailPulse 360 v2 - Reporte de Métricas por Campaña'],
      ['Campaña Seleccionada', this.selectedCampaignId === 'all' ? 'Todas las Campañas' : this.selectedCampaignId],
      ['Fecha de Emisión', new Date().toLocaleString()],
      [''],
      ['Métrica', 'Cantidad', 'Tasa (%)'],
      ['Enviados Totales', m.sent, '100%'],
      ['Entregados Exitosamente', m.delivered, `${m.rateDelivered}%`],
      ['Abiertos (Opened)', m.opened, `${m.rateOpened}%`],
      ['Clics / Lectura (Clicked)', m.clicked, `${m.rateClicked}%`],
      ['Aceptados (Conversion)', m.accepted, `${m.rateAccepted}%`],
      ['Rebotes (Bounced - Negativo)', m.bounced, `${m.rateBounced}%`],
      ['Bajas (Unsubscribed - Negativo)', m.unsubscribed, `${m.rateUnsubscribed}%`],
      ['Spam (Spam Complaints - Negativo)', m.spam, `${m.rateSpam}%`],
      ['Rechazados (Rejected - Negativo)', m.rejected, `${m.rateRejected}%`],
      ['Sin Abrir (Unopened - Negativo)', m.unopened, `${m.rateUnopened}%`],
      ['Salud del Dominio', `${m.healthScore}%`, '0-100%']
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + data.map(e => e.join(',')).join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `reporte_campaña_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    this.showToast('Reporte CSV descargado correctamente.', 'success');
  }

  /* --------------------------------------------------------------------------
     10.5 Exportar Base de Datos de Contactos con Estado Real (.xlsx)
     -------------------------------------------------------------------------- */
  exportContactsXLSX() {
    const isAll = this.selectedCampaignId === 'all';
    const contacts = isAll
      ? this.state.contacts
      : this.state.contacts.filter(c => c.campaignId === this.selectedCampaignId);

    if (contacts.length === 0) {
      this.showToast('No hay contactos para exportar en la campaña seleccionada.', 'warning');
      return;
    }

    // Unión de todas las columnas dinámicas (NIT, Teléfono, Municipio, etc.)
    // para que la hoja tenga las mismas columnas en todas las filas.
    const customKeysSet = new Set();
    contacts.forEach(c => {
      Object.keys(c.customFields || {}).forEach(k => customKeysSet.add(k));
    });
    const customKeys = Array.from(customKeysSet);

    // Prioridad para determinar el "Estado del Envío" de cada contacto a
    // partir de todos sus eventos registrados (el más informativo primero).
    const STATUS_LABELS = [
      { key: 'bounced', label: 'Rebotado' },
      { key: 'spam', label: 'Marcado como Spam' },
      { key: 'unsubscribed', label: 'Dado de Baja' },
      { key: 'rejected', label: 'Rechazado' },
      { key: 'accepted', label: 'Aceptó / Convirtió' },
      { key: 'clicked', label: 'Hizo Clic' },
      { key: 'opened', label: 'Abrió el Correo' },
      { key: 'delivered', label: 'Entregado' },
      { key: 'sent', label: 'Enviado (sin confirmación aún)' }
    ];

    const rows = contacts.map(c => {
      // state.events viene ordenado del más reciente al más antiguo, así
      // que el primer match es el evento más reciente de este contacto.
      const history = this.state.events.filter(e => e.contactId === c.id && (isAll || e.campaignId === this.selectedCampaignId));
      const statuses = history.map(h => h.status);

      let estadoEnvio = 'Sin Registro de Envío';
      for (const s of STATUS_LABELS) {
        if (statuses.includes(s.key)) { estadoEnvio = s.label; break; }
      }

      const campaign = this.state.campaigns.find(cmp => cmp.id === c.campaignId);
      const ultimoEvento = history[0] ? history[0].timestamp : '';

      const row = {};
      if (isAll) row['Campaña'] = campaign ? campaign.name : c.campaignId;
      row['Nombre'] = c.name || '';
      row['Email'] = c.email || '';
      row['Empresa'] = c.company || '';
      row['Cargo'] = c.role || '';
      row['Estado del Envío'] = estadoEnvio;
      row['Entregado'] = statuses.some(s => ['delivered', 'opened', 'clicked', 'accepted'].includes(s)) ? 'Sí' : 'No';
      row['Abierto'] = statuses.some(s => ['opened', 'clicked', 'accepted'].includes(s)) ? 'Sí' : 'No';
      row['Rebotado'] = statuses.includes('bounced') ? 'Sí' : 'No';
      row['Dado de Baja'] = statuses.includes('unsubscribed') ? 'Sí' : 'No';
      row['Marcado Spam'] = statuses.includes('spam') ? 'Sí' : 'No';
      row['Fecha Último Evento'] = ultimoEvento;

      customKeys.forEach(k => {
        row[k] = (c.customFields && c.customFields[k] !== undefined) ? c.customFields[k] : '';
      });

      return row;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Ancho de columnas aproximado según el contenido, para que no quede
    // todo apretado al abrirlo en Excel.
    const headerKeys = Object.keys(rows[0] || {});
    worksheet['!cols'] = headerKeys.map(key => {
      const maxLen = Math.max(
        key.length,
        ...rows.map(r => String(r[key] ?? '').length)
      );
      return { wch: Math.min(Math.max(maxLen + 2, 10), 45) };
    });

    const workbook = XLSX.utils.book_new();
    const sheetName = isAll ? 'Todas las Campañas' : (this.state.campaigns.find(c => c.id === this.selectedCampaignId)?.name || 'Campaña').slice(0, 31);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const campaignSlug = isAll
      ? 'todas_las_campanas'
      : (this.state.campaigns.find(c => c.id === this.selectedCampaignId)?.name || 'campana')
          .toLowerCase()
          .normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-z0-9]+/g, '_')
          .replace(/^_+|_+$/g, '');

    const filename = `base_datos_${campaignSlug}_${Date.now()}.xlsx`;
    XLSX.writeFile(workbook, filename);

    this.showToast(`Base de datos exportada correctamente: ${rows.length} contactos en ${filename}`, 'success');
  }

  showToast(message, type = 'info') {
    // Los avisos ya NO se cierran solos: se quedan en pantalla hasta que el
    // usuario le da clic al boton "x" a proposito. Evita perder el detalle
    // de un error/exito por no leerlo a tiempo.
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.position = 'relative';

    const colors = {
      success: 'var(--opened-color)',
      danger: 'var(--bounce-color)',
      warning: 'var(--unsubscribe-color)',
      info: 'var(--primary)'
    };

    toast.style.borderLeftColor = colors[type] || colors.info;
    toast.innerHTML = `
      <i class="fa-solid fa-circle-info" style="color: ${colors[type]};"></i>
      <span style="padding-right: 1.5rem; display: inline-block;">${message}</span>
      <button type="button" aria-label="Cerrar aviso" style="position:absolute; top:6px; right:8px; background:none; border:none; color:inherit; opacity:0.6; cursor:pointer; font-size:1rem; line-height:1;">&times;</button>
    `;

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    };

    toast.querySelector('button').addEventListener('click', dismiss);
    container.appendChild(toast);
    // Sin auto-cierre: el aviso se queda hasta que se cierre manualmente con la "x".
  }
}

// Global Application Instance
const app = new MailPulseApp();
