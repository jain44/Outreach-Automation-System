/**
 * MapLead SaaS CRM - Core Application Logic
 * Specially designed for Google Maps Lead Prospecting for Tuitions & Local Businesses
 */

(function () {
  'use strict';

  // --- STATE ---
  let leads = [];
  let templates = [];
  let currentView = 'table';
  let activeTemplateId = null;
  let activeOutreachLead = null;
  let parsedLeadCandidate = null;

  // Search & Filter State
  const filters = {
    search: '',
    category: 'all',
    stage: 'all',
    onlyFollowUp: false
  };

  // --- INITIALIZATION ---
  async function init() {
    loadLocalFallbackData();
    setupEventListeners();
    renderAll();
    await syncWithServer();
  }

  function enhanceLeadsList(leadsList) {
    if (!Array.isArray(leadsList)) return;
    leadsList.forEach(l => {
      const sirMatch = (l.businessName || '').match(/\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:Sir's|Sir\b|Ma'am's|Ma'am\b)/i);
      if (sirMatch && (!l.contactPerson || l.contactPerson.includes('Director') || l.contactPerson.includes('Owner'))) {
        l.contactPerson = toTitleCase(sirMatch[1]) + (/ma'am/i.test(sirMatch[0]) ? " Ma'am" : " Sir");
      }

      if (l.address && (!l.city || l.city === 'Mumbai' || l.city === 'Pune' || l.city === 'Local')) {
        const refined = extractCityAndLocality(l.address, l.address);
        if (refined && refined !== 'Local Area') {
          l.city = refined;
        }
      }

      if (l.address && /(?:batches for|jee|neet)/i.test(l.address) && l.address.length < 80) {
        l.address = l.city ? `${l.city}, Near Metro / Station` : 'Local Area';
      }

      if (!isValidPersonName(l.contactPerson)) {
        l.contactPerson = 'Institute Director';
      }
    });
  }

  function loadLocalFallbackData() {
    try {
      const storedLeads = localStorage.getItem('maplead_leads');
      if (storedLeads) {
        leads = JSON.parse(storedLeads);
        enhanceLeadsList(leads);
      } else {
        leads = [];
      }

      const storedTemplates = localStorage.getItem('maplead_templates');
      if (storedTemplates) {
        templates = JSON.parse(storedTemplates);
        if (!templates.some(t => t.id === 'tpl_universal') || !templates.some(t => t.id === 'tpl_marketing')) {
          templates = (typeof DEFAULT_TEMPLATES !== 'undefined') ? [...DEFAULT_TEMPLATES] : [];
        }
      } else {
        templates = (typeof DEFAULT_TEMPLATES !== 'undefined') ? [...DEFAULT_TEMPLATES] : [];
      }

      if (templates.length > 0) {
        activeTemplateId = templates[0].id;
      }
    } catch (e) {
      console.error('Error loading fallback data', e);
      leads = [];
      templates = (typeof DEFAULT_TEMPLATES !== 'undefined') ? [...DEFAULT_TEMPLATES] : [];
    }
  }

  async function syncWithServer() {
    try {
      // 1. Fetch persistent leads from SQLite database via /api/leads
      const res = await fetch('/api/leads');
      if (res.ok) {
        const serverLeads = await res.json();
        if (Array.isArray(serverLeads)) {
          if (serverLeads.length > 0) {
            leads = serverLeads;
            enhanceLeadsList(leads);
            try {
              localStorage.setItem('maplead_leads', JSON.stringify(leads));
            } catch (_) {}
            renderAll();
          } else if (leads.length > 0) {
            // Server database was empty but local storage has leads -> sync up to SQLite!
            await fetch('/api/leads', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(leads)
            });
          }
        }
      }

      // 2. Fetch templates from SQLite database via /api/templates
      const tplRes = await fetch('/api/templates');
      if (tplRes.ok) {
        const serverTemplates = await tplRes.json();
        if (Array.isArray(serverTemplates) && serverTemplates.length > 0) {
          templates = serverTemplates;
          if (!activeTemplateId && templates.length > 0) {
            activeTemplateId = templates[0].id;
          }
          try {
            localStorage.setItem('maplead_templates', JSON.stringify(templates));
          } catch (_) {}
          renderAll();
        } else if (templates.length > 0) {
          await fetch('/api/templates', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(templates)
          });
        }
      }

      updateDbStatusBadge(leads.length);
    } catch (e) {
      // Running standalone (e.g. file:///) - fallback already rendered
      const badge = document.getElementById('dbStatusBadge');
      if (badge) {
        badge.innerHTML = `<span class="db-dot" style="background:#f59e0b;box-shadow:0 0 8px #f59e0b;"></span><span>Local Storage Mode</span>`;
        badge.title = 'Run "npm start" for SQLite database persistence';
      }
    }
  }

  function updateDbStatusBadge(count) {
    const badge = document.getElementById('dbStatusBadge');
    if (!badge) return;
    const num = typeof count === 'number' ? count : (leads ? leads.length : 0);
    badge.innerHTML = `<span class="db-dot"></span><span>SQLite DB (${num} ${num === 1 ? 'lead' : 'leads'})</span>`;
    badge.title = `All data stored in local SQLite database: leads.db (${num} leads)`;
  }

  function saveLeads() {
    try {
      localStorage.setItem('maplead_leads', JSON.stringify(leads));
    } catch (e) {
      console.error('Failed to save leads to localStorage', e);
    }
    updateDbStatusBadge(leads.length);

    // Persist permanently to local SQLite database (leads.db)
    fetch('/api/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leads)
    }).catch(() => {});
  }

  function saveTemplates() {
    try {
      localStorage.setItem('maplead_templates', JSON.stringify(templates));
    } catch (e) {
      console.error('Failed to save templates to localStorage', e);
    }
    // Persist permanently to local SQLite database
    fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(templates)
    }).catch(() => {});
  }

  // --- RENDER ROUTINES ---
  function renderAll() {
    renderKPIs();
    renderFilteredView();
  }

  function renderFilteredView() {
    if (currentView === 'table') {
      renderTable();
    } else if (currentView === 'kanban') {
      renderKanban();
    } else if (currentView === 'templates') {
      renderTemplatesView();
    } else if (currentView === 'analytics') {
      renderAnalyticsView();
    }
  }

  // Filter leads based on current filter state
  function getFilteredLeads() {
    const q = filters.search.trim().toLowerCase();
    const todayStr = new Date().toISOString().split('T')[0];

    return leads.filter(lead => {
      // Search query filter
      if (q) {
        const matchName = lead.businessName.toLowerCase().includes(q);
        const matchContact = (lead.contactPerson || '').toLowerCase().includes(q);
        const matchPhone = (lead.phone || '').toLowerCase().includes(q);
        const matchCity = (lead.city || '').toLowerCase().includes(q);
        const matchNotes = (lead.notes || '').toLowerCase().includes(q);
        const matchProduct = (lead.offeredProduct || '').toLowerCase().includes(q);
        if (!matchName && !matchContact && !matchPhone && !matchCity && !matchNotes && !matchProduct) {
          return false;
        }
      }

      // Category filter
      if (filters.category !== 'all' && lead.category !== filters.category) {
        return false;
      }

      // Stage filter
      if (filters.stage !== 'all' && lead.stage !== filters.stage) {
        return false;
      }

      // Only follow-up filter
      if (filters.onlyFollowUp) {
        if (!lead.nextFollowUp || lead.nextFollowUp > todayStr) {
          return false;
        }
      }

      return true;
    });
  }

  // --- KPI BANNER ---
  function renderKPIs() {
    const total = leads.length;
    const contacted = leads.filter(l => ['contacted', 'follow_up', 'demo_booked', 'closed_won'].includes(l.stage)).length;
    const demos = leads.filter(l => l.stage === 'demo_booked').length;
    const won = leads.filter(l => l.stage === 'closed_won').length;

    const todayStr = new Date().toISOString().split('T')[0];
    const followUpsToday = leads.filter(l => l.nextFollowUp && l.nextFollowUp <= todayStr && l.stage !== 'closed_won' && l.stage !== 'not_interested').length;

    document.getElementById('kpiTotalLeads').textContent = total;
    document.getElementById('kpiContacted').textContent = contacted;
    const contactedPct = total > 0 ? Math.round((contacted / total) * 100) : 0;
    document.getElementById('kpiContactedPercent').textContent = `${contactedPct}% of total`;
    document.getElementById('kpiDemos').textContent = demos;
    document.getElementById('kpiWon').textContent = won;
    document.getElementById('kpiFollowUps').textContent = followUpsToday;
  }

  // --- VIEW 1: TABLE VIEW ---
  function renderTable() {
    const tableBody = document.getElementById('leadsTableBody');
    const emptyState = document.getElementById('tableEmptyState');
    const filtered = getFilteredLeads();

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      emptyState.style.display = 'block';
      return;
    }

    emptyState.style.display = 'none';
    tableBody.innerHTML = filtered.map(lead => {
      const mapsLink = lead.mapsUrl ? `<a href="${lead.mapsUrl}" target="_blank" rel="noopener" class="action-btn maps" title="Open Google Maps listing"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg></a>` : '';

      return `
        <tr data-lead-id="${lead.id}">
          <td>
            <div class="business-cell">
              <a href="javascript:void(0)" class="business-name-link" onclick="window.editLead('${lead.id}')">
                ${escapeHtml(lead.businessName)}
              </a>
              <div class="rating-tag">
                <span>★ ${lead.rating || '4.5'}</span>
                <span class="reviews-count">(${lead.reviewsCount || 0} reviews)</span>
              </div>
              <span class="category-pill">${escapeHtml(lead.category)}</span>
            </div>
          </td>

          <td>
            <div class="contact-cell">
              <span class="contact-name">${escapeHtml(lead.contactPerson || 'Business Owner')}</span>
              ${lead.offeredProduct ? `<span class="product-tag" title="SaaS Solution Pitching">📦 ${escapeHtml(lead.offeredProduct)}</span>` : ''}
            </div>
          </td>

          <td>
            <div class="comm-cell">
              <span class="phone-num">📞 ${escapeHtml(lead.phone)}</span>
              <span class="email-text" title="${escapeHtml(lead.email || 'No email')}">✉️ ${escapeHtml(lead.email || 'No email')}</span>
            </div>
          </td>

          <td>
            <div class="location-cell">
              <span class="city-text">📍 ${escapeHtml(lead.city || 'Local')}</span>
              <span class="address-sub" title="${escapeHtml(lead.address || '')}">${escapeHtml(lead.address || '')}</span>
            </div>
          </td>

          <td>
            <div class="stage-select-wrapper">
              <select class="stage-select stage-${lead.stage}" onchange="window.updateLeadStage('${lead.id}', this.value)">
                <option value="new" ${lead.stage === 'new' ? 'selected' : ''}>🆕 New Lead</option>
                <option value="contacted" ${lead.stage === 'contacted' ? 'selected' : ''}>💬 Contacted</option>
                <option value="follow_up" ${lead.stage === 'follow_up' ? 'selected' : ''}>⏰ Follow-up</option>
                <option value="demo_booked" ${lead.stage === 'demo_booked' ? 'selected' : ''}>🖥️ Demo Booked</option>
                <option value="closed_won" ${lead.stage === 'closed_won' ? 'selected' : ''}>🎉 Deal Won</option>
                <option value="not_interested" ${lead.stage === 'not_interested' ? 'selected' : ''}>🚫 Not Interested</option>
              </select>
            </div>
          </td>

          <td class="text-right">
            <div class="action-buttons-group">
              <button class="action-btn pitch" onclick="window.openOutreachModal('${lead.id}')" title="Compose & Send Personalized SaaS Pitch">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                Pitch
              </button>
              <button class="action-btn wa" onclick="window.quickSendWhatsApp('${lead.id}')" title="1-Click WhatsApp Personalized Pitch">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.19-.09-1.12-.55-1.3-.61-.17-.07-.3-.1-.43.1-.12.19-.49.61-.6.74-.11.12-.23.14-.42.05-.19-.09-.81-.3-1.54-.95-.57-.51-.96-1.14-1.07-1.33-.11-.19-.01-.3.08-.39.09-.08.19-.23.29-.35.09-.12.13-.2.19-.33.06-.14.03-.26-.01-.35-.05-.09-.43-1.04-.59-1.42-.16-.38-.32-.33-.43-.33h-.37c-.13 0-.34.05-.52.24-.17.2-.67.66-.67 1.6 0 .95.69 1.86.79 1.99.09.14 1.36 2.08 3.3 2.91.46.2.82.32 1.1.41.46.15.89.13 1.22.08.37-.05 1.12-.46 1.28-.9.16-.44.16-.82.11-.9-.04-.08-.17-.13-.36-.23z"/></svg>
              </button>
              <button class="action-btn email ${lead.email ? '' : 'no-email'}" onclick="window.quickSendEmail('${lead.id}')" title="${lead.email ? '1-Click Gmail: ' + escapeHtml(lead.email) : 'Add Email & 1-Click Gmail'}">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </button>
              ${mapsLink}
              <button class="action-btn" onclick="window.editLead('${lead.id}')" title="Edit Lead Details">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
              </button>
              <button class="action-btn" onclick="window.deleteLead('${lead.id}')" title="Delete Lead" style="color: #f87171;">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // --- VIEW 2: KANBAN BOARD ---
  function renderKanban() {
    const stages = ['new', 'contacted', 'follow_up', 'demo_booked', 'closed_won', 'not_interested'];
    const filtered = getFilteredLeads();

    stages.forEach(stageKey => {
      const dropzone = document.querySelector(`.kanban-dropzone[data-stage="${stageKey}"]`);
      const countEl = document.getElementById(`count-${stageKey}`);
      if (!dropzone) return;

      const stageLeads = filtered.filter(l => l.stage === stageKey);
      if (countEl) countEl.textContent = stageLeads.length;

      dropzone.innerHTML = stageLeads.map(lead => {
        return `
          <div class="kanban-card" draggable="true" data-lead-id="${lead.id}">
            <div class="card-top-row">
              <span class="card-business-title">${escapeHtml(lead.businessName)}</span>
              <span class="card-rating">★ ${lead.rating || '4.5'}</span>
            </div>
            <span class="card-category">${escapeHtml(lead.category)}</span>

            <div class="card-contact-row">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              <strong>${escapeHtml(lead.contactPerson || 'Owner')}</strong>
            </div>

            <div class="card-location-row">
              📍 ${escapeHtml(lead.city || 'Local Area')}
            </div>

            ${lead.notes ? `
            <div class="card-notes-snippet" title="${escapeHtml(lead.notes)}">
              "${escapeHtml(lead.notes)}"
            </div>` : ''}

            <div class="card-footer-actions">
              <div class="kanban-mini-actions">
                <button class="action-btn wa" style="width:30px;height:30px;" onclick="window.quickSendWhatsApp('${lead.id}')" title="1-Click WhatsApp">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.19-.09-1.12-.55-1.3-.61-.17-.07-.3-.1-.43.1-.12.19-.49.61-.6.74-.11.12-.23.14-.42.05-.19-.09-.81-.3-1.54-.95-.57-.51-.96-1.14-1.07-1.33-.11-.19-.01-.3.08-.39.09-.08.19-.23.29-.35.09-.12.13-.2.19-.33.06-.14.03-.26-.01-.35-.05-.09-.43-1.04-.59-1.42-.16-.38-.32-.33-.43-.33h-.37c-.13 0-.34.05-.52.24-.17.2-.67.66-.67 1.6 0 .95.69 1.86.79 1.99.09.14 1.36 2.08 3.3 2.91.46.2.82.32 1.1.41.46.15.89.13 1.22.08.37-.05 1.12-.46 1.28-.9.16-.44.16-.82.11-.9-.04-.08-.17-.13-.36-.23z"/></svg>
                </button>
                <button class="action-btn email ${lead.email ? '' : 'no-email'}" style="width:30px;height:30px;" onclick="window.quickSendEmail('${lead.id}')" title="${lead.email ? '1-Click Gmail: ' + escapeHtml(lead.email) : 'Add Email & 1-Click Gmail'}">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
                </button>
                <button class="action-btn pitch" style="height:30px;" onclick="window.openOutreachModal('${lead.id}')" title="Pitch Modal">
                  Pitch
                </button>
                <button class="action-btn" style="width:30px;height:30px;" onclick="window.editLead('${lead.id}')" title="Edit">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
              </div>

              <!-- Quick Next Stage Mover -->
              ${getNextStageBtn(lead)}
            </div>
          </div>
        `;
      }).join('');
    });

    setupKanbanDragAndDrop();
  }

  function getNextStageBtn(lead) {
    const stageFlow = {
      'new': { next: 'contacted', label: 'Mark Contacted 💬' },
      'contacted': { next: 'follow_up', label: 'Set Follow-up ⏰' },
      'follow_up': { next: 'demo_booked', label: 'Book Demo 🖥️' },
      'demo_booked': { next: 'closed_won', label: 'Close Deal 🎉' },
      'closed_won': null,
      'not_interested': { next: 'new', label: 'Re-open 🔄' }
    };

    const target = stageFlow[lead.stage];
    if (!target) return '';
    return `
      <button class="stage-shift-btn" onclick="window.updateLeadStage('${lead.id}', '${target.next}')">
        ${target.label}
      </button>
    `;
  }

  function setupKanbanDragAndDrop() {
    const cards = document.querySelectorAll('.kanban-card');
    const dropzones = document.querySelectorAll('.kanban-dropzone');

    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => {
        card.classList.add('dragging');
        e.dataTransfer.setData('text/plain', card.getAttribute('data-lead-id'));
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('dragging');
      });
    });

    dropzones.forEach(zone => {
      zone.addEventListener('dragover', (e) => {
        e.preventDefault();
        zone.classList.add('drag-over');
      });

      zone.addEventListener('dragleave', () => {
        zone.classList.remove('drag-over');
      });

      zone.addEventListener('drop', (e) => {
        e.preventDefault();
        zone.classList.remove('drag-over');
        const leadId = e.dataTransfer.getData('text/plain');
        const targetStage = zone.getAttribute('data-stage');
        if (leadId && targetStage) {
          window.updateLeadStage(leadId, targetStage);
        }
      });
    });
  }

  // --- VIEW 3: TEMPLATES VIEW ---
  function renderTemplatesView() {
    const listEl = document.getElementById('templateList');
    listEl.innerHTML = templates.map(t => {
      const isActive = t.id === activeTemplateId;
      return `
        <div class="tpl-list-item ${isActive ? 'active' : ''}" onclick="window.selectTemplate('${t.id}')">
          <span class="tpl-item-title">${escapeHtml(t.name)}</span>
          <span class="tpl-item-channel ${t.channel}">
            ${t.channel === 'whatsapp' ? '🟢 WhatsApp' : '🔵 Email'}
          </span>
        </div>
      `;
    }).join('');

    const currentTpl = templates.find(t => t.id === activeTemplateId) || templates[0];
    if (currentTpl) {
      document.getElementById('currentTemplateTitle').textContent = `Editing: ${currentTpl.name}`;
      document.getElementById('tplNameInput').value = currentTpl.name;
      document.getElementById('tplChannelInput').value = currentTpl.channel;
      document.getElementById('tplSubjectInput').value = currentTpl.subject || '';
      document.getElementById('tplBodyInput').value = currentTpl.body;

      // Email subject toggle
      document.getElementById('tplSubjectGroup').style.display = currentTpl.channel === 'email' ? 'flex' : 'none';

      // Update live preview
      updateLiveTemplatePreview(currentTpl.body);
    }
  }

  function updateLiveTemplatePreview(bodyText) {
    const previewEl = document.getElementById('templateLivePreview');
    const badgeEl = document.getElementById('previewChannelBadge');
    const channel = document.getElementById('tplChannelInput').value;

    badgeEl.textContent = channel.toUpperCase();
    badgeEl.className = `badge-channel ${channel}`;

    // Sample lead for preview
    const sample = leads[0] || {
      businessName: "Excel Academy & Tutorials",
      contactPerson: "Prof. Rajesh Sharma",
      category: "Tuition / Coaching",
      city: "Mumbai, Andheri",
      rating: 4.8,
      offeredProduct: "Student Attendance & Fee Tracker SaaS"
    };

    const personalized = generatePersonalizedMessage(bodyText, sample, "Alex | EdTech SaaS");
    previewEl.textContent = personalized;
  }

  // --- VIEW 4: ANALYTICS VIEW ---
  function renderAnalyticsView() {
    // 1. Funnel
    const total = leads.length;
    const contacted = leads.filter(l => ['contacted', 'follow_up', 'demo_booked', 'closed_won'].includes(l.stage)).length;
    const followUps = leads.filter(l => ['follow_up', 'demo_booked', 'closed_won'].includes(l.stage)).length;
    const demos = leads.filter(l => ['demo_booked', 'closed_won'].includes(l.stage)).length;
    const won = leads.filter(l => l.stage === 'closed_won').length;

    const stagesData = [
      { name: '1. Discovered on Google Maps', count: total, color: '#06b6d4' },
      { name: '2. Outreach Pitched / Contacted', count: contacted, color: '#6366f1' },
      { name: '3. Actively Following Up', count: followUps, color: '#f59e0b' },
      { name: '4. SaaS Demos Scheduled', count: demos, color: '#a855f7' },
      { name: '5. Paid SaaS Subscribers (Won)', count: won, color: '#10b981' }
    ];

    const funnelEl = document.getElementById('funnelVisual');
    funnelEl.innerHTML = stagesData.map(st => {
      const pct = total > 0 ? Math.round((st.count / total) * 100) : 0;
      return `
        <div class="funnel-stage-row">
          <div class="funnel-label-row">
            <span>${st.name}</span>
            <span><strong>${st.count}</strong> (${pct}%)</span>
          </div>
          <div class="funnel-bar-bg">
            <div class="funnel-bar-fill" style="width: ${pct}%; background-color: ${st.color};"></div>
          </div>
        </div>
      `;
    }).join('');

    // 2. Categories breakdown
    const catMap = {};
    leads.forEach(l => {
      catMap[l.category] = (catMap[l.category] || 0) + 1;
    });

    const catEl = document.getElementById('categoryStats');
    catEl.innerHTML = Object.entries(catMap).map(([cat, count]) => {
      return `
        <div class="category-stat-item">
          <span class="cat-stat-name">📚 ${escapeHtml(cat)}</span>
          <span class="cat-stat-badge">${count} leads</span>
        </div>
      `;
    }).join('');

    // 3. Follow-up agenda
    const agendaEl = document.getElementById('followupsAgenda');
    const todayStr = new Date().toISOString().split('T')[0];
    const followLeads = leads
      .filter(l => l.nextFollowUp && l.stage !== 'closed_won' && l.stage !== 'not_interested')
      .sort((a, b) => (a.nextFollowUp > b.nextFollowUp ? 1 : -1));

    if (followLeads.length === 0) {
      agendaEl.innerHTML = `<div style="color:var(--text-dim); padding:20px; text-align:center;">No scheduled follow-ups. You're all caught up! 🚀</div>`;
    } else {
      agendaEl.innerHTML = followLeads.map(l => {
        const isOverdue = l.nextFollowUp < todayStr;
        const isToday = l.nextFollowUp === todayStr;
        const badgeColor = isOverdue ? 'color:#ef4444;' : isToday ? 'color:#f59e0b;' : 'color:#10b981;';
        const label = isOverdue ? `⚠️ Overdue (${l.nextFollowUp})` : isToday ? `⚡ Due Today (${l.nextFollowUp})` : `📅 Due on ${l.nextFollowUp}`;

        return `
          <div class="agenda-card">
            <span class="agenda-date" style="${badgeColor}">${label}</span>
            <div class="agenda-title">${escapeHtml(l.businessName)}</div>
            <div class="agenda-notes">${escapeHtml(l.notes || 'Time to follow up with tuition owner on demo or inquiry.')}</div>
            <div class="agenda-action-row">
              <button class="action-btn wa" onclick="window.quickSendWhatsApp('${l.id}')" title="Send WhatsApp">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2zm.01 1.67c2.2 0 4.26.86 5.82 2.42a8.225 8.225 0 0 1 2.41 5.83c0 4.54-3.7 8.24-8.24 8.24-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.196 8.196 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.24-8.24zm4.52 11.66c-.19-.09-1.12-.55-1.3-.61-.17-.07-.3-.1-.43.1-.12.19-.49.61-.6.74-.11.12-.23.14-.42.05-.19-.09-.81-.3-1.54-.95-.57-.51-.96-1.14-1.07-1.33-.11-.19-.01-.3.08-.39.09-.08.19-.23.29-.35.09-.12.13-.2.19-.33.06-.14.03-.26-.01-.35-.05-.09-.43-1.04-.59-1.42-.16-.38-.32-.33-.43-.33h-.37c-.13 0-.34.05-.52.24-.17.2-.67.66-.67 1.6 0 .95.69 1.86.79 1.99.09.14 1.36 2.08 3.3 2.91.46.2.82.32 1.1.41.46.15.89.13 1.22.08.37-.05 1.12-.46 1.28-.9.16-.44.16-.82.11-.9-.04-.08-.17-.13-.36-.23z"/></svg>
              </button>
              <button class="action-btn email ${l.email ? '' : 'no-email'}" onclick="window.quickSendEmail('${l.id}')" title="${l.email ? '1-Click Gmail: ' + escapeHtml(l.email) : 'Add Email & 1-Click Gmail'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>
              </button>
              <button class="action-btn pitch" onclick="window.openOutreachModal('${l.id}')">
                Send Pitch
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // --- PERSONALIZED OUTREACH ENGINE ---
  function getBestTemplateForLead(lead, channel = null) {
    if (!lead || !templates || templates.length === 0) return templates[0];
    const cat = (lead.category || '').toLowerCase();
    const bName = (lead.businessName || '').toLowerCase();
    const notes = (lead.notes || '').toLowerCase();
    const full = `${cat} ${bName} ${notes}`;

    // If channel is specified as 'email', check for matching email templates first!
    if (channel === 'email') {
      if (/interior|decor|architect|design studio/i.test(full)) {
        const t = templates.find(tpl => tpl.id === 'tpl_email_interior');
        if (t) return t;
      }
      if (/clinic|doctor|aesthetic|skin|hair|derma|dental|hospital/i.test(full)) {
        const t = templates.find(tpl => tpl.id === 'tpl_email_aesthetic_clinic');
        if (t) return t;
      }
      if (/real estate|property|realty|realtor|developer|builder|broker/i.test(full)) {
        const t = templates.find(tpl => tpl.id === 'tpl_email_realestate');
        if (t) return t;
      }
    }

    if (/interior|decor|architect|design studio/i.test(full)) {
      const t = templates.find(tpl => tpl.id === 'tpl_email_interior');
      if (t) return t;
    }
    if (/dental|dentist|teeth|orthodont|oral|implant|clinic|aesthetic|skin|hair|doctor/i.test(full)) {
      if (channel === 'email') {
        const t = templates.find(tpl => tpl.id === 'tpl_email_aesthetic_clinic');
        if (t) return t;
      }
      return templates.find(t => t.id === 'tpl_dental') || templates[0];
    }
    if (/real estate|property|realty|realtor|developer|builder|plots|flats|apartments|villas|broker/i.test(full)) {
      if (channel === 'email') {
        const t = templates.find(tpl => tpl.id === 'tpl_email_realestate');
        if (t) return t;
      }
      return templates.find(t => t.id === 'tpl_realestate') || templates[0];
    }
    if (/restaurant|cafe|bistro|kitchen|bakery|dining|pizzeria|food|bar & grill|lounge/i.test(full)) {
      return templates.find(t => t.id === 'tpl_restaurant') || templates[0];
    }
    if (/gym|fitness|crossfit|workout|yoga|pilates|training club|bodybuilding/i.test(full)) {
      return templates.find(t => t.id === 'tpl_fitness') || templates[0];
    }
    if (/salon|spa|beauty|hair|parlour|makeup|nails|skincare|barber/i.test(full)) {
      return templates.find(t => t.id === 'tpl_salon') || templates[0];
    }
    if (/marketing|digital|seo|social media|advertising|agency|branding/i.test(full)) {
      return templates.find(t => t.id === 'tpl_marketing') || templates[0];
    }
    if (/wholesale|distributor|distribution|trader|supplier|stockist/i.test(full)) {
      return templates.find(t => t.id === 'tpl_wholesale') || templates[0];
    }
    if (/chartered accountant|ca firm|advocate|lawyer|legal|tax consultant|accounting|audit|gst/i.test(full)) {
      return templates.find(t => t.id === 'tpl_ca_legal') || templates[0];
    }
    if (/garage|car service|auto repair|detailing|motors|tyres|car care|mechanic/i.test(full)) {
      return templates.find(t => t.id === 'tpl_automobile') || templates[0];
    }
    if (/recruitment|staffing|hiring|hr consultancy|talent|job/i.test(full)) {
      return templates.find(t => t.id === 'tpl_recruitment') || templates[0];
    }
    if (/manufacturing|factory|production|industrial|fabricat/i.test(full)) {
      return templates.find(t => t.id === 'tpl_manufacturing') || templates[0];
    }
    if (/ecommerce|e-commerce|online store|shopify|retailer/i.test(full)) {
      return templates.find(t => t.id === 'tpl_ecommerce') || templates[0];
    }
    if (/tuition|coaching|classes|academy|tutorials|institute|exam|jee|neet|cbse|study|maths|science/i.test(full)) {
      return templates.find(t => t.id === 'tpl_tuition') || templates[0];
    }
    // Universal Fallback for any other business!
    return templates.find(t => t.id === 'tpl_universal') || templates[templates.length - 1] || templates[0];
  }

  function generatePersonalizedMessage(templateText, lead, senderName) {
    if (!templateText) return '';

    // Determine the best greeting name
    const genericFallbacks = new Set([
      'director / owner', 'institute director', 'business owner / director',
      'business owner', 'lead doctor / clinic director', 'executive chef / owner',
      'principal broker / director', 'agency founder / ceo', 'managing partner / ca',
      'head coach / owner', 'salon owner / director', 'managing partner',
      'plant manager / director', 'managing consultant', 'service head / owner',
      'principal designer / studio head',
      'there', ''
    ]);

    let contact = (lead.contactPerson || '').trim();
    // If contact is a generic fallback, use the business name as the greeting
    if (!contact || genericFallbacks.has(contact.toLowerCase())) {
      contact = (lead.businessName || 'there').trim();
    }

    let bName = (lead.businessName || 'your business').trim();
    let authorName = senderName || 'Jainam Jain';
    let docName = contact.replace(/^(?:Dr\.?|Doctor)\s*/i, '').trim() || bName;

    let result = templateText
      .replace(/\{\{\s*contact_name\s*\}\}/gi, contact)
      .replace(/\{\s*contact_name\s*\}/gi, contact)
      .replace(/\{\{\s*Owner_Name\s*\}\}/gi, contact)
      .replace(/\{\s*Owner_Name\s*\}/gi, contact)
      .replace(/\{\{\s*Doctor_Name\s*\}\}/gi, docName)
      .replace(/\{\s*Doctor_Name\s*\}/gi, docName)
      .replace(/\{\{\s*Clinic_Name\s*\}\}/gi, bName)
      .replace(/\{\s*Clinic_Name\s*\}/gi, bName)
      .replace(/\{\{\s*Business_Name\s*\}\}/gi, bName)
      .replace(/\{\s*Business_Name\s*\}/gi, bName)
      .replace(/\{\{\s*contactPerson\s*\}\}/gi, contact)
      .replace(/\{\s*contactPerson\s*\}/gi, contact)
      .replace(/\{\{\s*business_name\s*\}\}/gi, bName)
      .replace(/\{\s*business_name\s*\}/gi, bName)
      .replace(/\{\{\s*businessName\s*\}\}/gi, bName)
      .replace(/\{\s*businessName\s*\}/gi, bName)
      .replace(/\{\{\s*city\s*\}\}/gi, lead.city || 'your area')
      .replace(/\{\s*city\s*\}/gi, lead.city || 'your area')
      .replace(/\{\{\s*phone\s*\}\}/gi, lead.phone || '')
      .replace(/\{\s*phone\s*\}/gi, lead.phone || '')
      .replace(/\{\{\s*rating\s*\}\}/gi, lead.rating ? lead.rating.toString() : '')
      .replace(/\{\s*rating\s*\}/gi, lead.rating ? lead.rating.toString() : '')
      .replace(/\{\{\s*offeredProduct\s*\}\}/gi, lead.offeredProduct || 'Custom Software & Automation Solutions')
      .replace(/\{\s*offeredProduct\s*\}/gi, lead.offeredProduct || 'Custom Software & Automation Solutions')
      .replace(/\{\{\s*senderName\s*\}\}/gi, authorName)
      .replace(/\{\s*senderName\s*\}/gi, authorName);

        // Clean duplicate title (e.g. "Hello Dr. Dr. Arvind" -> "Hello Dr. Arvind")
    result = result.replace(/\b(Dr|Prof|Mr|Mrs|Ms)\.?\s+(?:\1\.?)\s*/gi, (m, p1) => `${p1}. `);
    // If contact was generic/business name (e.g. "Ceramco Dental Clinic"), clean "Hi Dr. <Clinic>" -> "Hi <Clinic>"
    result = result.replace(/\b(Hi|Hello)\s+Dr\.\s+([A-Za-z0-9\s'&.-]+?(?:Clinic|Hospital|Center|Centre|Dental|Healthcare|Studio))\b/gi, (m, g1, g2) => `${g1} ${g2}`);
    return result;
  }


  function cleanPhoneNumberForWhatsApp(phone) {
    if (!phone) return '';
    // Strip all non-digit characters except leading +
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }
    // If standard 10 digit Indian number without country code, add 91
    if (cleaned.length === 10) {
      cleaned = '91' + cleaned;
    }
    return cleaned;
  }

  // Global functions attached to window for HTML events
  window.updateLeadStage = function (leadId, newStage) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    lead.stage = newStage;
    if (newStage === 'contacted' && !lead.lastContactDate) {
      lead.lastContactDate = new Date().toISOString().split('T')[0];
    }
    saveLeads();
    renderAll();
    showToast(`Lead moved to "${formatStageName(newStage)}"`, 'success');
  };

  function formatStageName(stageKey) {
    const map = {
      'new': 'New Lead',
      'contacted': 'Outreach Sent',
      'follow_up': 'Follow-up Needed',
      'demo_booked': 'Demo Scheduled',
      'closed_won': 'Deal Won 🎉',
      'not_interested': 'Not Interested'
    };
    return map[stageKey] || stageKey;
  }

  window.openOutreachModal = function (leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;
    activeOutreachLead = lead;

    document.getElementById('outreachRecipientBadge').textContent = `${lead.contactPerson || 'Owner'} (${lead.businessName})`;

    // Populate templates dropdown
    const selectEl = document.getElementById('outreachTemplateSelect');
    selectEl.innerHTML = templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)} (${t.channel.toUpperCase()})</option>`).join('');

    // Auto-select best industry template for this lead
    const bestTpl = getBestTemplateForLead(lead);
    selectEl.value = bestTpl ? bestTpl.id : templates[0].id;

    refreshOutreachModalFields();

    // Lead quick info bar
    document.getElementById('outreachLeadInfoBar').innerHTML = `
      <span>📞 <strong>${escapeHtml(lead.phone)}</strong></span>
      <span>✉️ <strong>${escapeHtml(lead.email || 'No email')}</strong></span>
      <span>📍 <strong>${escapeHtml(lead.city)}</strong></span>
      ${lead.mapsUrl ? `<a href="${lead.mapsUrl}" target="_blank" rel="noopener" style="color:#818cf8; text-decoration:underline;">View on Google Maps</a>` : ''}
    `;

    document.getElementById('outreachModalOverlay').classList.add('open');
  };

  function refreshOutreachModalFields() {
    if (!activeOutreachLead) return;
    const selectEl = document.getElementById('outreachTemplateSelect');
    const selectedTpl = templates.find(t => t.id === selectEl.value) || templates[0];
    const senderName = document.getElementById('outreachSenderName').value;

    if (selectedTpl) {
      const subjectGroup = document.getElementById('outreachSubjectGroup');
      if (selectedTpl.channel === 'email') {
        subjectGroup.style.display = 'flex';
        document.getElementById('outreachSubject').value = generatePersonalizedMessage(selectedTpl.subject, activeOutreachLead, senderName);
      } else {
        subjectGroup.style.display = 'none';
      }

      document.getElementById('outreachMessageText').value = generatePersonalizedMessage(selectedTpl.body, activeOutreachLead, senderName);
    }
  }

  window.quickSendWhatsApp = function (leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    // Pick best template for this lead's industry or universal fallback
    const bestTpl = getBestTemplateForLead(lead, 'whatsapp');
    const message = generatePersonalizedMessage(bestTpl ? bestTpl.body : `Hi {{contact_name}}!`, lead, "Jainam Jain");
    const cleanPhone = cleanPhoneNumberForWhatsApp(lead.phone);

    if (!cleanPhone) {
      showToast('No phone number provided for this lead!', 'warning');
      return;
    }

    const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
    window.open(waUrl, '_blank');

    // Auto update stage to contacted if new
    if (lead.stage === 'new') {
      lead.stage = 'contacted';
      lead.lastContactDate = new Date().toISOString().split('T')[0];
      saveLeads();
      renderAll();
    }
    showToast(`WhatsApp opened for ${lead.businessName}!`, 'success');
  };

  window.quickSendEmail = function (leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (!lead.email) {
      const enteredEmail = prompt(`Please enter the email address for "${lead.businessName}":`);
      if (!enteredEmail || !enteredEmail.trim()) {
        showToast('Email address is required to launch outreach.', 'warning');
        return;
      }
      lead.email = enteredEmail.trim();
      saveLeads();
      renderAll();
    }

    // Pick best email template for this lead's industry or universal fallback
    const bestTpl = getBestTemplateForLead(lead, 'email');
    const subject = generatePersonalizedMessage(
      (bestTpl && bestTpl.subject) ? bestTpl.subject : `Software & Custom Automation for ${lead.businessName}`,
      lead,
      "Jainam Jain"
    );
    const body = generatePersonalizedMessage(
      bestTpl ? bestTpl.body : `Hi {{contact_name}},\n\nLet's connect and discuss custom software solutions for {{business_name}}.\n\nJainam Jain\n7977963474\njainamjain1116@gmail.com`,
      lead,
      "Jainam Jain"
    );

    // Direct 1-Click Gmail Web compose URL with pre-filled To, Subject, and Body:
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(lead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(gmailUrl, '_blank');

    if (lead.stage === 'new') {
      lead.stage = 'contacted';
      lead.lastContactDate = new Date().toISOString().split('T')[0];
      saveLeads();
      renderAll();
    }
    showToast(`1-Click Gmail compose opened for ${lead.businessName}!`, 'success');
  };

  // --- UNIVERSAL WEBSITE & GOOGLE MAPS AI PARSER (v2) ---
  function parseWebsiteAndMapsText(rawText) {
    if (!rawText || !rawText.trim()) return null;

    // Normalise Google Maps bullet separators (·) into newlines for easier parsing
    const full = rawText.replace(/\s*·\s*/g, '\n').replace(/\r\n/g, '\n');
    const lines = full.split('\n').map(l => l.trim()).filter(Boolean);

    const result = {
      businessName: '',
      contactPerson: '',
      category: 'Other',
      phone: '',
      allPhones: [],
      whatsappPhone: '',
      email: '',
      allEmails: [],
      city: '',
      address: '',
      rating: 0,
      reviewsCount: 0,
      website: '',
      mapsUrl: '',
      courses: [],
      offeredProduct: 'Custom Workflow Automation & AI Lead Engine',
      notes: ''
    };

    // 1. Phone numbers — supports +91, 0xx-xxxx, spaced 5+5, dashes, dots
    const phoneRegex = /(?:(?:\+|00)91[\s\-.]?)?(?:[6789]\d{9}|\d{5}[\s\-.]\d{5})|0\d{2,4}[\s\-.]?\d{6,8}/g;
    const rawPhones = full.match(phoneRegex) || [];
    const cleanPhoneSet = new Set();
    // Also pick up whatsapp-labelled numbers
    let waPhone = '';
    const waLine = full.match(/(?:WhatsApp|WA|Whatsapp)[^\n]{0,40}?([6789]\d{9})/i);
    if (waLine) waPhone = waLine[1];

    rawPhones.forEach(p => {
      const stripped = p.replace(/[\s.\-]/g, '').replace(/^0091/, '+91').replace(/^091/, '+91');
      const digitsOnly = stripped.replace(/\D/g, '');
      if (digitsOnly.length >= 10 && digitsOnly.length <= 13) {
        // Normalise to +91 XXXXX XXXXX for Indian mobiles
        const d = digitsOnly.replace(/^91/, '');
        if (d.length === 10 && /^[6789]/.test(d)) {
          const formatted = `+91 ${d.slice(0,5)} ${d.slice(5)}`;
          cleanPhoneSet.add(formatted);
          if (!waPhone) waPhone = formatted; // use first mobile as WA fallback
        } else {
          cleanPhoneSet.add(stripped);
        }
      }
    });
    result.allPhones = Array.from(cleanPhoneSet);
    // Prefer WhatsApp-labelled number as primary
    if (waPhone) {
      result.phone = waPhone;
      result.whatsappPhone = waPhone;
    } else if (result.allPhones.length > 0) {
      result.phone = result.allPhones[0];
    }

    // 2. Email extraction
    const emailRegex = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
    const rawEmails = full.match(emailRegex) || [];
    const cleanEmailSet = new Set();
    rawEmails.forEach(e => {
      const em = e.toLowerCase().trim();
      if (!/\.(png|jpg|jpeg|webp|gif|svg)$/i.test(em) && em.includes('.')) {
        cleanEmailSet.add(em);
      }
    });
    result.allEmails = Array.from(cleanEmailSet);
    // Prefer non-generic email (info@, contact@ less preferred than personal)
    const personalEmail = result.allEmails.find(e => !/^(?:info|contact|support|admin|hello|enquiry|sales|orders|care|office|admissions|help)@/i.test(e));
    result.email = personalEmail || result.allEmails[0] || '';

    // 3. Rating & Reviews extraction
    const ratingMatch = full.match(/([1-5](?:\.[0-9])?)[\s]*(?:★|⭐|\*|stars?|out of 5)/i)
      || full.match(/(?:rated?|rating)[:\s]+([1-5](?:\.[0-9])?)/i)
      || full.match(/([1-5]\.[0-9])\s*(?:\/\s*5|rating|reviews?|google)/i);
    if (ratingMatch) result.rating = parseFloat(ratingMatch[1]);

    const reviewMatch = full.match(/(\d[\d,]*)\s*(?:reviews?|ratings?|customers?|patients?|clients?|student reviews?)/i);
    if (reviewMatch) result.reviewsCount = parseInt(reviewMatch[1].replace(/,/g, ''), 10);

    // Google Maps card pattern: "4.7\n(217)" or "4.7 (217)"
    const mapsRatingMatch = full.match(/\b([1-5]\.[0-9])\s*(?:\n|\s+)\((\d[\d,]*)\)/)
      || full.match(/\b([1-5]\.[0-9])\s*\((\d[\d,]*)\)/);
    if (mapsRatingMatch) {
      if (!result.rating) result.rating = parseFloat(mapsRatingMatch[1]);
      if (!result.reviewsCount) result.reviewsCount = parseInt(mapsRatingMatch[2].replace(/,/g, ''), 10);
    }
    if (!result.reviewsCount) {
      const parenMatch = full.match(/\((\d[\d,]*)\)/);
      if (parenMatch) result.reviewsCount = parseInt(parenMatch[1].replace(/,/g, ''), 10);
    }
    if (!result.rating) {
      const standaloneRating = full.match(/^[ \t]*([1-5]\.[0-9])[ \t]*$/m);
      if (standaloneRating) result.rating = parseFloat(standaloneRating[1]);
    }

    // 4. Business Name
    result.businessName = extractBusinessNameFromText(full, lines);

    // 5. Category & Product
    const detected = detectBusinessCategoryAndProduct(full, result.businessName, lines);
    result.category = detected.category;
    result.offeredProduct = detected.product;
    result.courses = detected.services;

    // 6. Contact Person
    result.contactPerson = extractContactPersonIntelligent(full, result.businessName, result.email, result.category, lines);

    // 7. Address
    result.address = extractAddressLine(full, lines);

    // 8. City & Locality
    result.city = extractCityAndLocality(full, result.address);
    if (!result.address && result.city) result.address = result.city;

    // 9. Website / Maps URL
    const urlMatches = full.match(/https?:\/\/[^\s"'<>\n]+/g) || [];
    for (const u of urlMatches) {
      if (u.includes('maps.google') || u.includes('goo.gl/maps') || u.includes('maps.app.goo')) {
        result.mapsUrl = u;
      } else if (!result.website && !u.includes('facebook.com') && !u.includes('instagram.com') && !u.includes('wa.me') && !u.includes('youtube.com')) {
        result.website = u;
      }
    }
    if (!result.website) {
      const wwwMatch = full.match(/www\.[a-zA-Z0-9\-]+\.[a-zA-Z]{2,6}(?:\.[a-zA-Z]{2})?/i);
      if (wwwMatch) result.website = 'https://' + wwwMatch[0];
    }

    return result;
  }

  // --- STRICT PERSON & BUSINESS NAME EXTRACTORS ---
  const STOP_WORDS = new Set([
    'who', 'are', 'the', 'and', 'our', 'with', 'for', 'from', 'you', 'all', 'this', 'that',
    'have', 'has', 'was', 'were', 'been', 'can', 'will', 'your', 'about', 'contact', 'service',
    'services', 'home', 'menu', 'nav', 'header', 'footer', 'teacher', 'teachers', 'student',
    'students', 'faculty', 'batch', 'batches', 'class', 'classes', 'course', 'courses', 'tuition',
    'tuitions', 'academy', 'institute', 'school', 'coaching', 'center', 'education', 'learning',
    'test', 'series', 'online', 'offline', 'exam', 'fee', 'fees', 'admission', 'admissions',
    'privacy', 'policy', 'terms', 'condition', 'conditions', 'review', 'reviews', 'rating',
    'ratings', 'call', 'email', 'phone', 'address', 'location', 'website', 'rights', 'reserved',
    'copyright', 'skip', 'content', 'login', 'register', 'ienced', 'vices',
    'open', 'closed', 'opening', 'hours', 'directions', 'directions', 'save', 'share', 'nearby',
    'suggest', 'edit', 'claim', 'verified', 'business', 'profile', 'photos', 'overview'
  ]);

  function isValidPersonName(name) {
    if (!name) return false;
    const trimmed = name.trim();
    if (trimmed.length < 3 || trimmed.length > 35) return false;

    // Check if it's the clean fallback
    if (trimmed === 'Director / Owner' || trimmed === 'Tuition Owner' || trimmed === 'Business Owner') {
      return true;
    }

    const words = trimmed.split(/\s+/);
    if (words.length > 4) return false;

    // Must not have concatenated camelCase nav words like "vicesAboutContact"
    if (/[a-z][A-Z]/.test(trimmed)) return false;

    // Check if any word is in stop words
    for (const w of words) {
      const clean = w.toLowerCase().replace(/[^a-z]/g, '');
      if (STOP_WORDS.has(clean)) {
        return false;
      }
    }

    return true;
  }

  // --- LOCALITY & CITY MAPS ---
  const LOCALITY_MAP = {
    // Mumbai & MMR Localities
    'andheri east': 'Mumbai', 'andheri west': 'Mumbai', 'andheri': 'Mumbai',
    'j b nagar': 'Mumbai', 'jb nagar': 'Mumbai', 'borivali': 'Mumbai',
    'kandivali': 'Mumbai', 'malad': 'Mumbai', 'goregaon': 'Mumbai',
    'bandra': 'Mumbai', 'dadar': 'Mumbai', 'powai': 'Mumbai',
    'ghatkopar': 'Mumbai', 'mulund': 'Mumbai', 'thane': 'Thane',
    'navi mumbai': 'Navi Mumbai', 'chembur': 'Mumbai', 'vile parle': 'Mumbai',
    'santacruz': 'Mumbai', 'khar': 'Mumbai', 'kurla': 'Mumbai',
    'vashi': 'Navi Mumbai', 'nerul': 'Navi Mumbai', 'kalyan': 'Kalyan',
    'dombivli': 'Dombivli', 'bhayandar': 'Mumbai', 'mira road': 'Mumbai',
    'vasai': 'Mumbai', 'virar': 'Mumbai', 'khopoli': 'Mumbai',
    'lower parel': 'Mumbai', 'worli': 'Mumbai', 'prabhadevi': 'Mumbai',
    'colaba': 'Mumbai', 'fort': 'Mumbai', 'churchgate': 'Mumbai',
    'juhu': 'Mumbai', 'versova': 'Mumbai', 'oshiwara': 'Mumbai',
    'lokhandwala': 'Mumbai', 'jogeshwari': 'Mumbai', 'vikhroli': 'Mumbai',
    'bhandup': 'Mumbai', 'nahur': 'Mumbai', 'panvel': 'Navi Mumbai',
    'airoli': 'Navi Mumbai', 'ghansoli': 'Navi Mumbai', 'kopar khairane': 'Navi Mumbai',
    'sanpada': 'Navi Mumbai', 'turbhe': 'Navi Mumbai', 'belapur': 'Navi Mumbai',
    'kharghar': 'Navi Mumbai', 'kamothe': 'Navi Mumbai', 'ulwe': 'Navi Mumbai',

    // Pune Localities
    'kothrud': 'Pune', 'shivaji nagar': 'Pune', 'fc road': 'Pune',
    'deccan': 'Pune', 'aundh': 'Pune', 'baner': 'Pune',
    'wakad': 'Pune', 'hinjewadi': 'Pune', 'hadapsar': 'Pune',
    'viman nagar': 'Pune', 'pimpri': 'Pune', 'chinchwad': 'Pune',
    'camp': 'Pune', 'karve nagar': 'Pune', 'katraj': 'Pune',
    'kharadi': 'Pune', 'magarpatta': 'Pune', 'kalyani nagar': 'Pune',
    'nibm': 'Pune', 'kondhwa': 'Pune', 'undri': 'Pune',
    'sinhagad road': 'Pune', 'paud road': 'Pune', 'sus': 'Pune',
    'bavdhan': 'Pune', 'pashan': 'Pune', 'sus road': 'Pune',
    'warje': 'Pune', 'dhayari': 'Pune', 'ambegaon': 'Pune',

    // Delhi / NCR Localities
    'janakpuri': 'Delhi', 'rohini': 'Delhi', 'pitampura': 'Delhi',
    'laxmi nagar': 'Delhi', 'dwarka': 'Delhi', 'connaught place': 'Delhi',
    'south ex': 'Delhi', 'saket': 'Delhi', 'karol bagh': 'Delhi',
    'rajouri garden': 'Delhi', 'tilak nagar': 'Delhi', 'uttam nagar': 'Delhi',
    'preet vihar': 'Delhi', 'mayur vihar': 'Delhi', 'vasundhara enclave': 'Delhi',
    'vikaspuri': 'Delhi', 'paschim vihar': 'Delhi', 'shakurpur': 'Delhi',
    'noida': 'Noida', 'gurugram': 'Gurugram', 'gurgaon': 'Gurugram',
    'greater noida': 'Greater Noida', 'faridabad': 'Faridabad', 'ghaziabad': 'Ghaziabad',
    'sector 62': 'Noida', 'sector 18': 'Noida', 'sector 15': 'Noida',
    'cyber city': 'Gurugram', 'dlf': 'Gurugram', 'sohna road': 'Gurugram',

    // Bangalore Localities
    'indiranagar': 'Bangalore', 'koramangala': 'Bangalore', 'hsr layout': 'Bangalore',
    'whitefield': 'Bangalore', 'jayanagar': 'Bangalore', 'malleshwaram': 'Bangalore',
    'marathahalli': 'Bangalore', 'electronic city': 'Bangalore',
    'jp nagar': 'Bangalore', 'banashankari': 'Bangalore', 'btm layout': 'Bangalore',
    'rajajinagar': 'Bangalore', 'basavanagudi': 'Bangalore', 'yeshwanthpur': 'Bangalore',
    'hebbal': 'Bangalore', 'yelahanka': 'Bangalore', 'sarjapur': 'Bangalore',
    'kr puram': 'Bangalore', 'bellandur': 'Bangalore', 'outer ring road': 'Bangalore',

    // Ahmedabad Localities
    'navrangpura': 'Ahmedabad', 'vastrapur': 'Ahmedabad', 'satellite': 'Ahmedabad',
    'maninagar': 'Ahmedabad', 'bodakdev': 'Ahmedabad', 'sg highway': 'Ahmedabad',
    'prahlad nagar': 'Ahmedabad', 'thaltej': 'Ahmedabad', 'bopal': 'Ahmedabad',
    'chandkheda': 'Ahmedabad', 'nikol': 'Ahmedabad', 'naroda': 'Ahmedabad',
    'ctm': 'Ahmedabad', 'isanpur': 'Ahmedabad', 'vastral': 'Ahmedabad',

    // Hyderabad Localities
    'madhapur': 'Hyderabad', 'gachibowli': 'Hyderabad', 'kukatpally': 'Hyderabad',
    'dilsukhnagar': 'Hyderabad', 'ameerpet': 'Hyderabad', 'hitech city': 'Hyderabad',
    'banjara hills': 'Hyderabad', 'jubilee hills': 'Hyderabad', 'kondapur': 'Hyderabad',
    'miyapur': 'Hyderabad', 'lb nagar': 'Hyderabad', 'secunderabad': 'Hyderabad',
    'uppal': 'Hyderabad', 'kompally': 'Hyderabad', 'vanasthalipuram': 'Hyderabad',

    // Chennai Localities
    'anna nagar': 'Chennai', 't nagar': 'Chennai', 'adyar': 'Chennai',
    'velachery': 'Chennai', 'mylapore': 'Chennai', 'nungambakkam': 'Chennai',
    'porur': 'Chennai', 'ambattur': 'Chennai', 'mogappair': 'Chennai',
    'perambur': 'Chennai', 'chromepet': 'Chennai', 'tambaram': 'Chennai',
    'perungudi': 'Chennai', 'sholinganallur': 'Chennai', 'omr': 'Chennai',

    // Kolkata Localities
    'salt lake': 'Kolkata', 'new town': 'Kolkata', 'rajarhat': 'Kolkata',
    'park street': 'Kolkata', 'gariahat': 'Kolkata', 'howrah': 'Kolkata',
    'dum dum': 'Kolkata', 'behala': 'Kolkata', 'jadavpur': 'Kolkata',
    'tollygunge': 'Kolkata', 'alipore': 'Kolkata', 'ballygunj': 'Kolkata',

    // Surat Localities
    'adajan': 'Surat', 'vesu': 'Surat', 'athwa': 'Surat',
    'rander': 'Surat', 'katargam': 'Surat', 'udhna': 'Surat',

    // Jaipur Localities
    'malviya nagar': 'Jaipur', 'vaishali nagar': 'Jaipur', 'c scheme': 'Jaipur',
    'mansarovar': 'Jaipur', 'jagatpura': 'Jaipur', 'tonk road': 'Jaipur',

    // Nagpur Localities
    'dharampeth': 'Nagpur', 'sadar': 'Nagpur', 'sitabuldi': 'Nagpur',
    'laxmi nagar': 'Nagpur', 'manish nagar': 'Nagpur', 'wardhaman nagar': 'Nagpur'
  };

  const PARENT_CITIES = [
    'Mumbai', 'Pune', 'Delhi', 'New Delhi', 'Bangalore', 'Bengaluru', 'Ahmedabad',
    'Hyderabad', 'Chennai', 'Kolkata', 'Jaipur', 'Lucknow', 'Indore', 'Chandigarh',
    'Surat', 'Nagpur', 'Bhopal', 'Vadodara', 'Coimbatore', 'Patna', 'Nashik',
    'Thane', 'Navi Mumbai', 'Noida', 'Gurugram', 'Gurgaon', 'Faridabad', 'Ghaziabad',
    'Greater Noida', 'Meerut', 'Agra', 'Varanasi', 'Kanpur', 'Allahabad', 'Prayagraj',
    'Rajkot', 'Gandhinagar', 'Anand', 'Ankleshwar', 'Vapi', 'Bhavnagar', 'Jamnagar',
    'Mysore', 'Mysuru', 'Mangalore', 'Mangaluru', 'Hubli', 'Dharwad',
    'Visakhapatnam', 'Vijayawada', 'Guntur', 'Tirupati', 'Warangal',
    'Kochi', 'Thiruvananthapuram', 'Kozhikode', 'Thrissur', 'Kollam',
    'Madurai', 'Tiruchirappalli', 'Salem', 'Erode', 'Tirunelveli',
    'Durgapur', 'Asansol', 'Siliguri', 'Bardhaman',
    'Bhubaneswar', 'Cuttack', 'Rourkela',
    'Raipur', 'Bilaspur', 'Bhilai',
    'Ranchi', 'Jamshedpur', 'Dhanbad',
    'Dehradun', 'Haridwar', 'Roorkee',
    'Amritsar', 'Ludhiana', 'Jalandhar', 'Patiala', 'Mohali', 'Zirakpur',
    'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner',
    'Aurangabad', 'Solapur', 'Kolhapur', 'Nanded', 'Latur', 'Akola', 'Amravati',
    'Guwahati', 'Imphal', 'Shillong', 'Dibrugarh'
  ];

  function toTitleCase(str) {
    if (!str) return '';
    return str.toLowerCase().replace(/(?:^|\s|\/|-)\S/g, function(a) { return a.toUpperCase(); });
  }

  function extractCityAndLocality(full, address) {
    const fullLower = (full + ' ' + (address || '')).toLowerCase();
    
    let detectedCity = '';
    let detectedLocality = '';

    // 1. Check localities
    for (const [loc, city] of Object.entries(LOCALITY_MAP)) {
      const regex = new RegExp('\\b' + loc.replace(/\s+/g, '[\\s-]') + '\\b', 'i');
      if (regex.test(fullLower)) {
        detectedLocality = toTitleCase(loc);
        detectedCity = city;
        break;
      }
    }

    // 2. Check parent cities if city not found
    if (!detectedCity) {
      for (const city of PARENT_CITIES) {
        const regex = new RegExp('\\b' + city.toLowerCase() + '\\b', 'i');
        if (regex.test(fullLower)) {
          detectedCity = city;
          break;
        }
      }
    }

    // 3. Fallback to address parsing if still missing locality
    if (address && detectedCity && !detectedLocality) {
      const parts = address.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        for (let i = parts.length - 1; i >= 0; i--) {
          const pClean = parts[i].replace(/\d+/g, '').replace(/maharashtra|gujarat|karnataka|delhi|india/i, '').trim();
          if (pClean && pClean.toLowerCase() !== detectedCity.toLowerCase() && pClean.length > 3 && pClean.length < 25) {
            detectedLocality = toTitleCase(pClean);
            break;
          }
        }
      }
    }

    if (detectedCity && detectedLocality) {
      return `${detectedCity}, ${detectedLocality}`;
    } else if (detectedCity) {
      return detectedCity;
    } else if (detectedLocality) {
      return detectedLocality;
    }
    return 'Local Area';
  }

  function extractAddressLine(full, lines) {
    const addressMarkers = /(?:Road|Rd\.?|Street|St\.?|Plot|Sector|Colony|Marg|Floor|Plaza|Arcade|Opp\.?|Near|Behind|Avenue|Square|Nagar|Complex|Tower|Bldg|Building|Cross|Lane|Gali|Enclave|Vihar|Layout|Phase|Block|Camp|Chowk|Chowki|Chawk|Bazaar|Market|Station|Junction|Circle|Ring Road|Bypass|Highway|NH|SH|Gate|Garden|Residency|Heights|Park|Apartments?)/i;
    const courseBlacklist = /(?:batch|batches|jee|neet|foundation|curriculum|class 11|class 12|standard|tuition for|coaching for|test series|crash course)/i;
    const labelPattern = /^(?:address|location|office|head office|registered office|corporate office|shop|unit|flat|gala|godown|plot|premises)\s*(?:no\.?|number|#)?\s*[:\-–#]?\s*/i;
    const PIN_CODE = /\b[1-9]\d{5}\b/;

    // Priority 1: Explicitly labelled address lines
    for (const line of lines) {
      if (labelPattern.test(line)) {
        const stripped = line.replace(labelPattern, '').trim();
        if (stripped.length > 8) return stripped;
      }
    }

    // Priority 2: Lines with address markers & NOT course info
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10 && trimmed.length < 220 && addressMarkers.test(trimmed)) {
        if (!courseBlacklist.test(trimmed) && !/^(?:courses|batches|phone|email|website|timings|reviews|services|features)\s*[:\-–]/i.test(trimmed)) {
          return trimmed.replace(labelPattern, '').trim();
        }
      }
    }

    // Priority 3: Line containing a 6-digit PIN code (very reliable indicator)
    for (const line of lines) {
      if (PIN_CODE.test(line) && line.length > 10 && line.length < 220) {
        if (!courseBlacklist.test(line)) {
          return line.trim();
        }
      }
    }

    // Priority 4: Lines with multiple commas (typical of address format)
    for (const line of lines) {
      const commaCount = (line.match(/,/g) || []).length;
      if (commaCount >= 2 && line.length > 15 && line.length < 220) {
        if (!courseBlacklist.test(line) && !/^(?:phone|email|website|timings|reviews|open|closed|hours)\s*[:\-–]/i.test(line)) {
          return line.trim();
        }
      }
    }

    return '';
  }

  function detectBusinessCategoryAndProduct(text, businessName, lines) {
    const bName = (businessName || '').toLowerCase();
    const allLines = Array.isArray(lines) ? lines : (text ? text.split('\n') : []);

    // 1. Check Google Maps Category Line (very specific lines like "Coaching Center", "Dental clinic", etc.)
    for (const line of allLines) {
      const l = line.trim().toLowerCase();
      if (l.length < 3 || l.length > 55) continue;

      if (/^(?:coaching center|tuition centre|education center|educational institution|school|college|training centre|tutoring service|academy)$/i.test(l) ||
          /\b(?:coaching center|tuition centre|educational institution|tutoring service)\b/i.test(l)) {
        return {
          category: 'Coaching & Education',
          product: 'Student Attendance & Parent WhatsApp Fee Reminder SaaS',
          services: extractMatchedKeywords(text, ['IIT-JEE', 'NEET-UG', 'Foundation Batches', 'Board Exams', 'Test Series', 'Doubt Clearing'])
        };
      }
      if (/^(?:dental clinic|dentist|dental laboratory|orthodontist|teeth clinic)$/i.test(l) ||
          /\b(?:dental clinic|dentist|orthodontist)\b/i.test(l)) {
        return {
          category: 'Dental & Healthcare Clinic',
          product: 'Patient Recall & WhatsApp Appointment Booking CRM',
          services: extractMatchedKeywords(text, ['Root Canal', 'Teeth Whitening', 'Dental Implants', 'Invisible Aligners', 'Pediatric Care', 'Consultations'])
        };
      }
      if (/^(?:marketing agency|advertising agency|internet marketing service|media agency)$/i.test(l) ||
          /\b(?:marketing agency|advertising agency|internet marketing)\b/i.test(l)) {
        return {
          category: 'Digital Marketing Agency',
          product: 'Client Reporting & Multi-Account Lead Dashboard',
          services: extractMatchedKeywords(text, ['Performance Marketing', 'SEO', 'Social Media', 'Landing Pages', 'Branding', 'Lead Gen'])
        };
      }
      if (/^(?:real estate agency|real estate consultant|property management company|builder)$/i.test(l) ||
          /\b(?:real estate agency|real estate consultant)\b/i.test(l)) {
        return {
          category: 'Real Estate & Property',
          product: 'Site Visit Scheduler & Automated Buyer Follow-up CRM',
          services: extractMatchedKeywords(text, ['Luxury Apartments', 'Commercial Shops', 'Plots & Land', 'Villas', 'Site Visits', 'Resale Advisory'])
        };
      }
      if (/^(?:restaurant|cafe|bakery|fast food restaurant|coffee shop|bar & grill|family restaurant)$/i.test(l) ||
          /\b(?:restaurant|bakery|coffee shop)\b/i.test(l)) {
        return {
          category: 'Restaurant & Hospitality',
          product: 'Direct WhatsApp Menu Ordering & Table Reservation Bot',
          services: extractMatchedKeywords(text, ['Dine-in Menu', 'Takeaway', 'Home Delivery', 'Table Booking', 'Private Parties', 'Artisanal Food'])
        };
      }
      if (/^(?:gym|fitness center|yoga studio|personal trainer|health club)$/i.test(l) ||
          /\b(?:fitness center|yoga studio|health club)\b/i.test(l)) {
        return {
          category: 'Gym & Fitness Studio',
          product: 'Automated Member Renewal & Attendance Check-in App',
          services: extractMatchedKeywords(text, ['Strength Training', 'Cardio', 'Yoga', 'Personal Training', 'Weight Loss', 'Crossfit'])
        };
      }
      if (/^(?:beauty salon|hair salon|spa|barber shop|nail salon)$/i.test(l) ||
          /\b(?:beauty salon|hair salon|barber shop)\b/i.test(l)) {
        return {
          category: 'Salon & Beauty Spa',
          product: 'Stylist Booking & Automated Google Review Booster Bot',
          services: extractMatchedKeywords(text, ['Hair Styling', 'Facials', 'Bridal Makeup', 'Manicure / Pedicure', 'Spa Therapies', 'Hair Coloring'])
        };
      }
      if (/^(?:wholesaler|wholesale market|distribution service)$/i.test(l) ||
          /\b(?:wholesaler|wholesale market)\b/i.test(l)) {
        return {
          category: 'Wholesale & Distribution',
          product: 'B2B Order Portal & WhatsApp Dispatch Notification System',
          services: extractMatchedKeywords(text, ['Bulk Supply', 'Distribution Network', 'Pan-India Dispatch', 'FMCG Trading', 'Warehouse Logistics'])
        };
      }
      if (/^(?:chartered accountant|legal services|law firm|tax consultant)$/i.test(l) ||
          /\b(?:chartered accountant|legal services|law firm)\b/i.test(l)) {
        return {
          category: 'CA & Legal Services',
          product: 'Client GST / Tax Document Portal & Deadline Reminder Bot',
          services: extractMatchedKeywords(text, ['GST Filing', 'Income Tax Returns', 'Auditing', 'Company Registration', 'Legal Advisory', 'Tax Audit'])
        };
      }
      if (/^(?:car repair and maintenance service|auto repair shop|car detailing service)$/i.test(l) ||
          /\b(?:car repair|auto repair shop|car detailing)\b/i.test(l)) {
        return {
          category: 'Automobile & Detailing',
          product: 'Vehicle Service Reminder & Digital Job Card WhatsApp System',
          services: extractMatchedKeywords(text, ['Periodic Servicing', 'Ceramic Coating', 'Wheel Alignment', 'Engine Diagnostics', 'Car Wash & Polish', 'Dent Repair'])
        };
      }
      if (/^(?:recruiter|employment agency|human resource consulting)$/i.test(l)) {
        return {
          category: 'Recruitment & Staffing',
          product: 'Candidate Pipeline Tracker & Automated Interview Scheduler',
          services: extractMatchedKeywords(text, ['Executive Search', 'IT Recruitment', 'Bulk Staffing', 'Contract Staffing', 'Payroll Management'])
        };
      }
      if (/^(?:manufacturer|factory|industrial equipment supplier)$/i.test(l)) {
        return {
          category: 'Manufacturing & Industrial',
          product: 'Production Job Order & Raw Material Stock Workflow Tracker',
          services: extractMatchedKeywords(text, ['Custom Fabrication', 'Precision Machining', 'Sheet Metal Works', 'Component Assembly', 'Industrial Supplies'])
        };
      }
      if (/^(?:clothing store|store|boutique|retail shop)$/i.test(l)) {
        return {
          category: 'E-commerce & Retail',
          product: 'Abandoned Cart WhatsApp Recovery & Return / Exchange Portal',
          services: extractMatchedKeywords(text, ['Online Store', 'Cash on Delivery', 'Fast Shipping', 'Hassle-Free Returns', 'Customer Support'])
        };
      }
      if (/^(?:interior designer|interior design studio|architectural designer|home interior|architect)$/i.test(l) ||
          /\b(?:interior designer|interior design|architectural designer)\b/i.test(l)) {
        return {
          category: 'Interior Design & Architecture',
          product: 'Project Management & Client Follow-up Dashboard',
          services: extractMatchedKeywords(text, ['Residential Interiors', 'Commercial Fitouts', '3D Visualisation', 'Modular Kitchens', 'Vendor Management', 'Turnkey Execution'])
        };
      }
    }

    // 2. Check Business Name keywords (high confidence, immune to address landmarks)
    if (/\b(?:interior|interiors|decor|architects?|architecture|fitouts?|design studio)\b/i.test(bName)) {
      return {
        category: 'Interior Design & Architecture',
        product: 'Project Management & Client Follow-up Dashboard',
        services: extractMatchedKeywords(text, ['Residential Interiors', 'Commercial Fitouts', '3D Visualisation', 'Modular Kitchens', 'Vendor Management', 'Turnkey Execution'])
      };
    }
    if (/\b(?:academy|classes|tutorials?|tuitions?|coaching|edu\b|institute|vidyamandir|shiksha|school|learning center)\b/i.test(bName)) {
      return {
        category: 'Coaching & Education',
        product: 'Student Attendance & Parent WhatsApp Fee Reminder SaaS',
        services: extractMatchedKeywords(text, ['IIT-JEE', 'NEET-UG', 'Foundation Batches', 'Board Exams', 'Test Series', 'Doubt Clearing'])
      };
    }
    if (/\b(?:dental|dentist|teeth|orthodont|implant|smile\s*clinic|dr\.\s*[a-z]+)\b/i.test(bName)) {
      return {
        category: 'Dental & Healthcare Clinic',
        product: 'Patient Recall & WhatsApp Appointment Booking CRM',
        services: extractMatchedKeywords(text, ['Root Canal', 'Teeth Whitening', 'Dental Implants', 'Invisible Aligners', 'Pediatric Care', 'Consultations'])
      };
    }
    if (/\b(?:marketing|agency|digital|seo|media|branding|creative)\b/i.test(bName)) {
      return {
        category: 'Digital Marketing Agency',
        product: 'Client Reporting & Multi-Account Lead Dashboard',
        services: extractMatchedKeywords(text, ['Performance Marketing', 'SEO', 'Social Media', 'Landing Pages', 'Branding', 'Lead Gen'])
      };
    }
    if (/\b(?:realty|properties|estates|realtors|builders|developers)\b/i.test(bName)) {
      return {
        category: 'Real Estate & Property',
        product: 'Site Visit Scheduler & Automated Buyer Follow-up CRM',
        services: extractMatchedKeywords(text, ['Luxury Apartments', 'Commercial Shops', 'Plots & Land', 'Villas', 'Site Visits', 'Resale Advisory'])
      };
    }
    if (/\b(?:cafe|restaurant|bistro|kitchen|bakery|dining|pizzeria|food|dhaba|hotel)\b/i.test(bName)) {
      return {
        category: 'Restaurant & Hospitality',
        product: 'Direct WhatsApp Menu Ordering & Table Reservation Bot',
        services: extractMatchedKeywords(text, ['Dine-in Menu', 'Takeaway', 'Home Delivery', 'Table Booking', 'Private Parties', 'Artisanal Food'])
      };
    }
    if (/\b(?:gym|fitness|crossfit|workout|yoga|pilates|bodybuilding)\b/i.test(bName)) {
      return {
        category: 'Gym & Fitness Studio',
        product: 'Automated Member Renewal & Attendance Check-in App',
        services: extractMatchedKeywords(text, ['Strength Training', 'Cardio', 'Yoga', 'Personal Training', 'Weight Loss', 'Crossfit'])
      };
    }
    if (/\b(?:salon|spa|beauty|hair|parlour|makeup|nails)\b/i.test(bName)) {
      return {
        category: 'Salon & Beauty Spa',
        product: 'Stylist Booking & Automated Google Review Booster Bot',
        services: extractMatchedKeywords(text, ['Hair Styling', 'Facials', 'Bridal Makeup', 'Manicure / Pedicure', 'Spa Therapies', 'Hair Coloring'])
      };
    }
    if (/\b(?:wholesale|distributors|traders|imports|exports|supply)\b/i.test(bName)) {
      return {
        category: 'Wholesale & Distribution',
        product: 'B2B Order Portal & WhatsApp Dispatch Notification System',
        services: extractMatchedKeywords(text, ['Bulk Supply', 'Distribution Network', 'Pan-India Dispatch', 'FMCG Trading', 'Warehouse Logistics'])
      };
    }
    if (/\b(?:ca|legal|law|advocate|tax|audit|consultants)\b/i.test(bName)) {
      return {
        category: 'CA & Legal Services',
        product: 'Client GST / Tax Document Portal & Deadline Reminder Bot',
        services: extractMatchedKeywords(text, ['GST Filing', 'Income Tax Returns', 'Auditing', 'Company Registration', 'Legal Advisory', 'Tax Audit'])
      };
    }
    if (/\b(?:motors|auto|garage|tyres|car care|detailing)\b/i.test(bName)) {
      return {
        category: 'Automobile & Detailing',
        product: 'Vehicle Service Reminder & Digital Job Card WhatsApp System',
        services: extractMatchedKeywords(text, ['Periodic Servicing', 'Ceramic Coating', 'Wheel Alignment', 'Engine Diagnostics', 'Car Wash & Polish', 'Dent Repair'])
      };
    }

    // 3. Fallback to body text, BUT first strip address landmarks (e.g. "opp. Mukund Hospital", "above choice bakery")
    const textWithoutLandmarks = (text || '')
      .replace(/(?:opp\.?|opposite|near|behind|above|below|next to|adjacent to|beside)\s+[^\n,]+/gi, '')
      .toLowerCase();

    const combined = `${bName} ${textWithoutLandmarks}`;

    if (/tuition|coaching|classes|academy|tutorials|institute|exam|jee|neet|cbse|study|maths|science/i.test(combined)) {
      return {
        category: 'Coaching & Education',
        product: 'Student Attendance & Parent WhatsApp Fee Reminder SaaS',
        services: extractMatchedKeywords(text, ['IIT-JEE', 'NEET-UG', 'Foundation Batches', 'Board Exams', 'Test Series', 'Doubt Clearing'])
      };
    }
    if (/dental|dentist|teeth|orthodont|implant|smile design|oral care|clinic|hospital|doctor|dermatolog/i.test(combined)) {
      return {
        category: 'Dental & Healthcare Clinic',
        product: 'Patient Recall & WhatsApp Appointment Booking CRM',
        services: extractMatchedKeywords(text, ['Root Canal', 'Teeth Whitening', 'Dental Implants', 'Invisible Aligners', 'Pediatric Care', 'Consultations'])
      };
    }
    if (/real estate|properties|realty|realtor|developer|builder|plots|flats|apartments|villas|commercial space|resale/i.test(combined)) {
      return {
        category: 'Real Estate & Property',
        product: 'Site Visit Scheduler & Automated Buyer Follow-up CRM',
        services: extractMatchedKeywords(text, ['Luxury Apartments', 'Commercial Shops', 'Plots & Land', 'Villas', 'Site Visits', 'Resale Advisory'])
      };
    }
    if (/restaurant|cafe|bistro|kitchen|bakery|dining|pizzeria|food|bar & grill|lounge|tiffin|catering/i.test(combined)) {
      return {
        category: 'Restaurant & Hospitality',
        product: 'Direct WhatsApp Menu Ordering & Table Reservation Bot',
        services: extractMatchedKeywords(text, ['Dine-in Menu', 'Takeaway', 'Home Delivery', 'Table Booking', 'Private Parties', 'Artisanal Food'])
      };
    }
    if (/gym|fitness|crossfit|workout|yoga|pilates|training club|bodybuilding|personal training|aerobics/i.test(combined)) {
      return {
        category: 'Gym & Fitness Studio',
        product: 'Automated Member Renewal & Attendance Check-in App',
        services: extractMatchedKeywords(text, ['Strength Training', 'Cardio', 'Yoga', 'Personal Training', 'Weight Loss', 'Crossfit'])
      };
    }
    if (/salon|spa|beauty|hair|parlour|makeup|nails|skincare|barber|bridal|cosmetic|massage/i.test(combined)) {
      return {
        category: 'Salon & Beauty Spa',
        product: 'Stylist Booking & Automated Google Review Booster Bot',
        services: extractMatchedKeywords(text, ['Hair Styling', 'Facials', 'Bridal Makeup', 'Manicure / Pedicure', 'Spa Therapies', 'Hair Coloring'])
      };
    }
    if (/marketing|digital|seo|social media|advertising|pr agency|branding|web design|lead generation|google ads|meta ads/i.test(combined)) {
      return {
        category: 'Digital Marketing Agency',
        product: 'Client Reporting & Multi-Account Lead Dashboard',
        services: extractMatchedKeywords(text, ['Performance Marketing', 'SEO', 'Social Media', 'Landing Pages', 'Branding', 'Lead Gen'])
      };
    }
    if (/wholesale|distributor|distribution|trader|supplier|stockist|import export|fmcg|bulk supply/i.test(combined)) {
      return {
        category: 'Wholesale & Distribution',
        product: 'B2B Order Portal & WhatsApp Dispatch Notification System',
        services: extractMatchedKeywords(text, ['Bulk Supply', 'Distribution Network', 'Pan-India Dispatch', 'FMCG Trading', 'Warehouse Logistics'])
      };
    }
    if (/chartered accountant|ca firm|advocate|lawyer|legal|tax consultant|accounting|audit|gst|itr/i.test(combined)) {
      return {
        category: 'CA & Legal Services',
        product: 'Client GST / Tax Document Portal & Deadline Reminder Bot',
        services: extractMatchedKeywords(text, ['GST Filing', 'Income Tax Returns', 'Auditing', 'Company Registration', 'Legal Advisory', 'Tax Audit'])
      };
    }
    if (/garage|car service|auto repair|detailing|motors|tyres|car care|mechanic|bodyshop|ceramic coating/i.test(combined)) {
      return {
        category: 'Automobile & Detailing',
        product: 'Vehicle Service Reminder & Digital Job Card WhatsApp System',
        services: extractMatchedKeywords(text, ['Periodic Servicing', 'Ceramic Coating', 'Wheel Alignment', 'Engine Diagnostics', 'Car Wash & Polish', 'Dent Repair'])
      };
    }
    if (/recruitment|staffing|hiring|hr consultancy|talent acquisition|placement|manpower/i.test(combined)) {
      return {
        category: 'Recruitment & Staffing',
        product: 'Candidate Pipeline Tracker & Automated Interview Scheduler',
        services: extractMatchedKeywords(text, ['Executive Search', 'IT Recruitment', 'Bulk Staffing', 'Contract Staffing', 'Payroll Management'])
      };
    }
    if (/manufacturing|factory|production|industrial|fabricat|machinery|metal works|cnc/i.test(combined)) {
      return {
        category: 'Manufacturing & Industrial',
        product: 'Production Job Order & Raw Material Stock Workflow Tracker',
        services: extractMatchedKeywords(text, ['Custom Fabrication', 'Precision Machining', 'Sheet Metal Works', 'Component Assembly', 'Industrial Supplies'])
      };
    }
    if (/ecommerce|e-commerce|online store|shopify|retailer|clothing brand|apparel|footwear/i.test(combined)) {
      return {
        category: 'E-commerce & Retail',
        product: 'Abandoned Cart WhatsApp Recovery & Return / Exchange Portal',
        services: extractMatchedKeywords(text, ['Online Store', 'Cash on Delivery', 'Fast Shipping', 'Hassle-Free Returns', 'Customer Support'])
      };
    }
    if (/interior design|interiors|architect|architecture|decor|home design|modular kitchen/i.test(combined)) {
      return {
        category: 'Interior Design & Architecture',
        product: 'Project Management & Client Follow-up Dashboard',
        services: extractMatchedKeywords(text, ['Residential Interiors', 'Commercial Fitouts', '3D Visualisation', 'Modular Kitchens', 'Vendor Management', 'Turnkey Execution'])
      };
    }

    return {
      category: 'Other',
      product: 'Custom Workflow Automation & AI Lead Engine',
      services: ['Custom Business Services', 'Client Management', 'Workflow Solutions']
    };
  }

  function extractMatchedKeywords(text, candidates) {
    if (!text) return candidates.slice(0, 4);
    const matched = candidates.filter(c => new RegExp(c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(text));
    return matched.length > 0 ? matched : candidates.slice(0, 4);
  }

  function getRecommendedProductForCategory(cat) {
    const c = (cat || '').toLowerCase();
    if (/dental|health|clinic/i.test(c)) return 'Patient Recall & WhatsApp Appointment Booking CRM';
    if (/real estate|property/i.test(c)) return 'Site Visit Scheduler & Automated Buyer Follow-up CRM';
    if (/restaurant|cafe|hospitality/i.test(c)) return 'Direct WhatsApp Menu Ordering & Table Reservation Bot';
    if (/gym|fitness/i.test(c)) return 'Automated Member Renewal & Attendance Check-in App';
    if (/salon|spa|beauty/i.test(c)) return 'Stylist Booking & Automated Google Review Booster Bot';
    if (/marketing|agency/i.test(c)) return 'Client Reporting & Multi-Account Lead Dashboard';
    if (/wholesale|distribut/i.test(c)) return 'B2B Order Portal & WhatsApp Dispatch Notification System';
    if (/ca|legal|account|tax/i.test(c)) return 'Client GST / Tax Document Portal & Deadline Reminder Bot';
    if (/auto|garage|car/i.test(c)) return 'Vehicle Service Reminder & Digital Job Card WhatsApp System';
    if (/recruitment|staff/i.test(c)) return 'Candidate Pipeline Tracker & Automated Interview Scheduler';
    if (/manufactur|industrial/i.test(c)) return 'Production Job Order & Raw Material Stock Workflow Tracker';
    if (/ecommerce|retail/i.test(c)) return 'Abandoned Cart WhatsApp Recovery & Return / Exchange Portal';
    if (/interior|architect|decor/i.test(c)) return 'Project Management & Client Follow-up Dashboard';
    if (/coaching|tuition|education/i.test(c)) return 'Student Attendance & Parent WhatsApp Fee Reminder SaaS';
    return 'Custom Workflow Automation & AI Lead Engine';
  }

  function extractContactPersonIntelligent(full, businessName, email, category, lines) {
    const bName = businessName || '';
    const PERSON_BLACKLIST = /(?:experienced|best|expert|senior|our|leading|premier|top|award|rated|trusted|renowned|reputed|located|established|offering|providing)/i;
    const lineList = Array.isArray(lines) ? lines : (full ? full.split('\n') : []);

    // 1. Business Name contains honorifics (Sir/Ma'am)
    const sirInBiz = bName.match(/\b([A-Za-z]+(?:\s+[A-Za-z]+)?)\s+(?:Sir's|Sir\b|Ma'am's|Ma'am\b|Madam\b)/i);
    if (sirInBiz) {
      const tc = toTitleCase(sirInBiz[1]);
      return `${tc} ${/ma'am/i.test(sirInBiz[0]) ? "Ma'am" : 'Sir'}`;
    }

    // 2. Professional title in business name (Dr., CA, Chef, etc.)
    const titleInBiz = bName.match(/\b(?:Dr\.?|Chef|CA|Advocate|Prof\.?|Er\.?|Ar\.?)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)\b/i);
    if (titleInBiz) return toTitleCase(titleInBiz[0]);

    // 3. Professional title anywhere in text — strict word boundary, max 3 words after title
    const titleMatch = full.match(/\b(Dr\.?|Chef|CA\b|Advocate|Prof\.?|Professor|Er\.?|Ar\.?|Shri|Smt\.?|Mr\.?|Mrs\.?|Ms\.?)\s+([A-Z][a-z]{1,19}(?:\s+[A-Z][a-z]{1,19}){0,2})\b/);
    if (titleMatch) return toTitleCase(`${titleMatch[1]} ${titleMatch[2]}`.trim());

    // 4. Explicit role label: "Founder: Rahul Sharma" or "Owner - Priya Gupta"
    // Handles both newline-terminated AND inline (comma/period) termination
    const ROLES = 'Founder(?:\s*&\s*CEO)?|CEO|MD|Managing Director|Managing Partner|Director|Partner|Principal|Executive Chef|Proprietor|Owner|Head Doctor|Lead Doctor|Head Faculty|General Manager|President|Vice President|CTO|COO';
    const roleMatch = full.match(new RegExp(`\\b(${ROLES})\\s*[:\\-–]\\s*([A-Za-z][A-Za-z.\\s]{2,38})(?:\\n|,|\\.|;|$)`, 'i'));
    if (roleMatch && roleMatch[2]) {
      const cand = roleMatch[2].trim().split(/\s{2,}|\n|,|;/)[0].replace(/\([^)]*\)/g, '').trim();
      if (cand.length > 2 && cand.split(' ').length <= 4 && !PERSON_BLACKLIST.test(cand)
          && !/(?:academy|clinic|agency|pvt|ltd|llp|solutions|classes|institute|coaching)/i.test(cand)) {
        return toTitleCase(cand);
      }
    }

    // 5. Role before colon on its own line (e.g. "Director\nArvind Mehta")
    for (let i = 0; i < lineList.length - 1; i++) {
      const curr = (lineList[i] || '').trim();
      if (/^(?:Director|Owner|Founder|CEO|Principal|Proprietor|Partner|MD)$/i.test(curr)) {
        const next = (lineList[i + 1] || '').trim();
        if (next && next.length >= 3 && next.length <= 35 && next.split(' ').length <= 4 && !PERSON_BLACKLIST.test(next)) {
          return toTitleCase(next);
        }
      }
    }

    // 6. Sir/Ma'am pattern in full text
    const sirMatch = full.match(/\b([A-Za-z]{3,20}(?:\s+[A-Za-z]{2,20}){0,2})\s+(?:Sir|Sir's|Ma'am|Madam)\b/i);
    if (sirMatch && !PERSON_BLACKLIST.test(sirMatch[1])) {
      return `${toTitleCase(sirMatch[1])} ${/ma'am|madam/i.test(sirMatch[0]) ? "Ma'am" : 'Sir'}`;
    }

    // 7. Personal email inference
    if (email && email.includes('@')) {
      const userPart = email.split('@')[0].replace(/\d+/g, '').replace(/[._\-]/g, ' ').trim();
      if (userPart.length > 3 && !/^(?:admin|info|contact|support|admissions|office|help|enquiry|sales|orders|care|hello|noreply|no.reply|mail|team|hr|accounts|reception)$/i.test(userPart)) {
        return toTitleCase(userPart);
      }
    }

    // 8. Category-smart fallback
    const catLower = (category || '').toLowerCase();
    if (/coaching|tuition|education|academy/i.test(catLower)) return 'Institute Director';
    if (/interior|decor|architect/i.test(catLower)) return 'Principal Designer / Studio Head';
    if (/dental|health|clinic|hospital/i.test(catLower)) return 'Lead Doctor / Clinic Director';
    if (/restaurant|cafe|bistro|kitchen/i.test(catLower)) return 'Executive Chef / Owner';
    if (/real estate|property|realty/i.test(catLower)) return 'Principal Broker / Director';
    if (/marketing|agency|digital/i.test(catLower)) return 'Agency Founder / CEO';
    if (/\bca\b|legal|accountant|audit/i.test(catLower)) return 'Managing Partner / CA';
    if (/gym|fitness|yoga|training/i.test(catLower)) return 'Head Coach / Owner';
    if (/salon|spa|beauty|parlour/i.test(catLower)) return 'Salon Owner / Director';
    if (/wholesale|distribut|trading/i.test(catLower)) return 'Managing Partner';
    if (/manufactur|industrial|factory/i.test(catLower)) return 'Plant Manager / Director';
    if (/recruit|staffing|placement/i.test(catLower)) return 'Managing Consultant';
    if (/automobile|garage|service centre/i.test(catLower)) return 'Service Head / Owner';

    return 'Business Owner / Director';
  }

  function extractBusinessNameFromText(full, lines) {
    const NAV_SKIP = /^(?:home|about|services|contact|menu|skip to content|privacy policy|terms|gallery|portfolio|blog|careers|login|register|sign in|sign up|back|next|prev|load more|see all|view all|open|closed|directions|save|share|suggest|edit|claim|verified|overview|photos|reviews?|q&a|get in touch|book appointment|our team|our story)$/i;
    const LABEL_SKIP = /^(?:courses|batches|fees|address|phone|call us|email|website|timings?|helpline|head office|branch|location|sales|orders|hours|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\s*[:\-]/i;
    // UI noise: lines that contain 'icon', 'logo', 'navbar', long ALLCAPS nav blobs, or are clearly not a business name
    const UI_NOISE = /(?:\bicon\b|\blogo\b|\bnavbar\b|\bcookies?\b|\bscroll\b|\btoggle\b|\bhamburger\b)/i;
    const ALLCAPS_NAV = /[A-Z]{4,}(?:[A-Z]{4,}){2,}/; // e.g. ABOUTTREATMENTSBLOG
    const BIZ_SUFFIX = /(?:Dental|Clinic|Hospital|Polyclinic|Agency|Studio|Realty|Properties|Cafe|Restaurant|Bistro|Gym|Fitness|Salon|Spa|Motors|Garage|Enterprises|Industries|Wholesale|Traders|Solutions|Consultants|Associates|Firm|Academy|Classes|Tutorials|Care|Kitchen|Logistics|Hub|Lab|Laboratories|Pharmacy|Chemist|Finance|Capital|Trust|Foundation|Group|International|Exports|Imports|Builders|Developers|Tech|Technologies|Digital|Media|Networks?|Services|Works|Pvt|Ltd|LLP|Electronics|Mobiles?|Hardware|Jewellers?|Textiles?|Fashions?)/i;

    function isCleanLine(line) {
      if (!line || line.length < 3 || line.length > 85) return false;
      if (NAV_SKIP.test(line.trim())) return false;
      if (LABEL_SKIP.test(line.trim())) return false;
      if (UI_NOISE.test(line)) return false;
      if (ALLCAPS_NAV.test(line)) return false;
      if (/^[\d\s+(),.:\-]+$/.test(line)) return false; // pure phone/date line
      if (/^(?:open|closed|permanently closed|temporarily closed)/i.test(line)) return false;
      if (/^(?:call|whatsapp|wa|email|phone|tel|mobile)\s*[:\-]?\s*/i.test(line)) return false;
      if (/^(?:opening hours|timings|mon|tue|wed|thu|fri|sat|sun)/i.test(line)) return false;
      return true;
    }

    // 1. Copyright match (most reliable — website footers always have the business name)
    const copyrightMatch = full.match(/[©Cc]opyright\s*(?:\d{4}[-–]?\d{0,4})?\s*([A-Za-z0-9&'.\s-]{3,60}?)(?:\.\s|\s*All rights|\s*\||\n|$)/i)
      || full.match(/©\s*(?:\d{4})?\s*([A-Za-z0-9&'.\s-]{3,60}?)(?:\.\s|\s*All rights|\s*\||\n|$)/i);
    if (copyrightMatch && copyrightMatch[1]) {
      const cName = copyrightMatch[1].trim().replace(/\s+/g, ' ');
      if (cName.length > 2 && !STOP_WORDS.has(cName.toLowerCase())) return cName;
    }

    // 2. Scan ALL lines for business suffix keywords (catches "My Smile Dental Clinic Logo..." -> split at "Logo")
    for (const line of lines) {
      const trimmed = line.trim();
      if (!isCleanLine(trimmed)) continue;
      if (BIZ_SUFFIX.test(trimmed)) {
        // Split off nav junk after the business name (e.g. "Clinic Logo ABOUT...")
        let clean = trimmed
          .replace(/\s+(?:logo|icon|navbar|ABOUT|HOME|MENU|BLOG|CONTACT|TESTIMONIALS|GET IN TOUCH|BOOK APPOINTMENT|TREATMENTS|SERVICES|GALLERY|PORTFOLIO|OUR TEAM).*/i, '')
          .split(/[|]/)[0].trim();
        if (clean.length >= 3 && clean.length <= 80) return clean;
      }
    }

    // 3. Welcome to / Introducing / About [Name]
    const welcomeMatch = full.match(/(?:Welcome to|Introducing|About)\s+([A-Za-z0-9&'.\s-]{3,60}?)(?:!|\.\s|\n|$)/i);
    if (welcomeMatch && welcomeMatch[1]) {
      const wName = welcomeMatch[1].trim();
      if (!STOP_WORDS.has(wName.toLowerCase())) return wName;
    }

    // 4. First clean line that is not UI noise (Google Maps: business name is always line 1)
    for (const line of lines) {
      const trimmed = line.trim();
      if (!isCleanLine(trimmed)) continue;
      const candidate = trimmed
        .replace(/\s+(?:logo|icon|ABOUT|HOME|MENU).*/i, '')
        .split(/[|]/)[0].trim();
      if (candidate.length >= 3 && candidate.length <= 80) return candidate;
    }

    return 'Local Business / Firm';
  }

  // --- LEAD FORM MODAL (ADD / EDIT) ---
  window.openAddLeadModal = function () {
    document.getElementById('modalLeadTitle').textContent = 'Add New Business Lead';
    document.getElementById('leadForm').reset();
    document.getElementById('formLeadId').value = '';
    document.getElementById('formRating').value = '4.8';
    document.getElementById('formReviews').value = '50';
    document.getElementById('formStage').value = 'new';
    const initCat = document.getElementById('formCategory')?.value || 'Digital Marketing Agency';
    const prodInput = document.getElementById('formOfferedProduct');
    if (prodInput) {
      prodInput.value = getRecommendedProductForCategory(initCat);
      prodInput.setAttribute('data-auto', 'true');
    }
    document.getElementById('leadModalOverlay').classList.add('open');
  };

  window.editLead = function (leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    document.getElementById('modalLeadTitle').textContent = 'Edit Lead Details';
    document.getElementById('formLeadId').value = lead.id;
    document.getElementById('formBusinessName').value = lead.businessName;
    document.getElementById('formCategory').value = lead.category;
    document.getElementById('formContactPerson').value = lead.contactPerson || '';
    document.getElementById('formPhone').value = lead.phone;
    document.getElementById('formEmail').value = lead.email || '';
    document.getElementById('formCity').value = lead.city;
    document.getElementById('formAddress').value = lead.address || '';
    document.getElementById('formMapsUrl').value = lead.mapsUrl || '';
    document.getElementById('formRating').value = lead.rating || 4.8;
    document.getElementById('formReviews').value = lead.reviewsCount || 0;
    document.getElementById('formStage').value = lead.stage;
    document.getElementById('formOfferedProduct').value = lead.offeredProduct || '';
    document.getElementById('formNextFollowUp').value = lead.nextFollowUp || '';
    document.getElementById('formNotes').value = lead.notes || '';

    document.getElementById('leadModalOverlay').classList.add('open');
  };

  window.deleteLead = function (leadId) {
    const lead = leads.find(l => l.id === leadId);
    if (!lead) return;

    if (confirm(`Are you sure you want to delete "${lead.businessName}"?`)) {
      leads = leads.filter(l => l.id !== leadId);
      saveLeads();
      renderAll();
      showToast('Lead deleted successfully.', 'info');
    }
  };

  // --- TEMPLATE EDITING ---
  window.selectTemplate = function (tplId) {
    activeTemplateId = tplId;
    renderTemplatesView();
  };

  // --- TOAST NOTIFICATION ---
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <span>${message}</span>
    `;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3200);
  }

  // --- CSV EXPORT & IMPORT ---
  function exportLeadsToCsv() {
    if (leads.length === 0) {
      showToast('No leads available to export.', 'warning');
      return;
    }

    const headers = ['Business Name', 'Category', 'Contact Person', 'Phone', 'Email', 'City', 'Address', 'Rating', 'Reviews Count', 'Stage', 'SaaS Product', 'Next Followup', 'Notes', 'Google Maps Link'];
    const rows = leads.map(l => [
      `"${(l.businessName || '').replace(/"/g, '""')}"`,
      `"${(l.category || '').replace(/"/g, '""')}"`,
      `"${(l.contactPerson || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.email || '').replace(/"/g, '""')}"`,
      `"${(l.city || '').replace(/"/g, '""')}"`,
      `"${(l.address || '').replace(/"/g, '""')}"`,
      l.rating || 4.5,
      l.reviewsCount || 0,
      `"${l.stage || 'new'}"`,
      `"${(l.offeredProduct || '').replace(/"/g, '""')}"`,
      `"${l.nextFollowUp || ''}"`,
      `"${(l.notes || '').replace(/"/g, '""')}"`,
      `"${(l.mapsUrl || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `leads_export_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast('Leads exported successfully to CSV!', 'success');
  }

  function handleCsvImport(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const text = e.target.result;
        const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
        if (lines.length < 2) {
          showToast('CSV file is empty or invalid.', 'danger');
          return;
        }

        let importedCount = 0;
        // Parse rows (simple CSV parser handling quotes)
        for (let i = 1; i < lines.length; i++) {
          const rowText = lines[i];
          const cols = parseCsvLine(rowText);
          if (cols.length >= 4 && cols[0]) {
            const newLead = {
              id: 'lead_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
              businessName: cols[0],
              category: cols[1] || 'General Business',
              contactPerson: cols[2] || 'Business Owner',
              phone: cols[3],
              email: cols[4] || '',
              city: cols[5] || 'Local Area',
              address: cols[6] || '',
              rating: parseFloat(cols[7]) || 4.8,
              reviewsCount: parseInt(cols[8], 10) || 50,
              stage: cols[9] || 'new',
              offeredProduct: cols[10] || getRecommendedProductForCategory(cols[1] || 'General Business'),
              nextFollowUp: cols[11] || '',
              notes: cols[12] || '',
              mapsUrl: cols[13] || '',
              createdAt: new Date().toISOString().split('T')[0]
            };
            leads.unshift(newLead);
            importedCount++;
          }
        }

        saveLeads();
        renderAll();
        showToast(`Successfully imported ${importedCount} leads!`, 'success');
      } catch (err) {
        console.error(err);
        showToast('Error parsing CSV file format.', 'danger');
      }
    };
    reader.readAsText(file);
  }

  function parseCsvLine(line) {
    const result = [];
    let insideQuotes = false;
    let current = '';

    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"') {
        if (insideQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          insideQuotes = !insideQuotes;
        }
      } else if (c === ',' && !insideQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += c;
      }
    }
    result.push(current.trim());
    return result;
  }

  // --- EVENT LISTENERS SETUP ---
  function setupEventListeners() {
    // Nav view switching
    document.querySelectorAll('.nav-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentView = tab.getAttribute('data-view');

        document.querySelectorAll('.view-panel').forEach(p => p.classList.remove('active'));
        const targetViewEl = document.getElementById(`view${capitalize(currentView)}`);
        if (targetViewEl) targetViewEl.classList.add('active');

        renderFilteredView();
      });
    });

    // Search bar
    const searchInput = document.getElementById('searchInput');
    const clearSearchBtn = document.getElementById('btnClearSearch');
    searchInput.addEventListener('input', (e) => {
      filters.search = e.target.value;
      clearSearchBtn.style.display = filters.search ? 'block' : 'none';
      renderFilteredView();
    });
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      filters.search = '';
      clearSearchBtn.style.display = 'none';
      renderFilteredView();
    });

    // Category filter
    document.getElementById('categoryFilter').addEventListener('change', (e) => {
      filters.category = e.target.value;
      renderFilteredView();
    });

    // Stage filter
    document.getElementById('stageFilter').addEventListener('change', (e) => {
      filters.stage = e.target.value;
      renderFilteredView();
    });

    // Follow-up chip
    const followChip = document.getElementById('btnQuickPitchedFilter');
    followChip.addEventListener('click', () => {
      filters.onlyFollowUp = !filters.onlyFollowUp;
      followChip.setAttribute('data-active', filters.onlyFollowUp ? 'true' : 'false');
      renderFilteredView();
    });

    // Add Lead Button
    document.getElementById('btnAddNewLead').addEventListener('click', window.openAddLeadModal);

    // Auto suggest tailored SaaS solution when category is changed in Add Lead modal
    const formCat = document.getElementById('formCategory');
    if (formCat) {
      formCat.addEventListener('change', (e) => {
        const prodInput = document.getElementById('formOfferedProduct');
        if (prodInput) {
          prodInput.value = getRecommendedProductForCategory(e.target.value);
        }
      });
    }

    // Modal Close buttons
    document.getElementById('btnCloseLeadModal').addEventListener('click', () => {
      document.getElementById('leadModalOverlay').classList.remove('open');
    });
    document.getElementById('btnCancelLeadModal').addEventListener('click', () => {
      document.getElementById('leadModalOverlay').classList.remove('open');
    });

    // Lead Form Submit
    document.getElementById('leadForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const id = document.getElementById('formLeadId').value;
      const businessName = document.getElementById('formBusinessName').value.trim();
      const category = document.getElementById('formCategory').value;
      const contactPerson = document.getElementById('formContactPerson').value.trim();
      const phone = document.getElementById('formPhone').value.trim();
      const email = document.getElementById('formEmail').value.trim();
      const city = document.getElementById('formCity').value.trim();
      const address = document.getElementById('formAddress').value.trim();
      const mapsUrl = document.getElementById('formMapsUrl').value.trim();
      const rating = parseFloat(document.getElementById('formRating').value) || 4.8;
      const reviewsCount = parseInt(document.getElementById('formReviews').value, 10) || 0;
      const stage = document.getElementById('formStage').value;
      const offeredProduct = document.getElementById('formOfferedProduct').value.trim();
      const nextFollowUp = document.getElementById('formNextFollowUp').value;
      const notes = document.getElementById('formNotes').value.trim();

      if (id) {
        // Edit existing
        const idx = leads.findIndex(l => l.id === id);
        if (idx !== -1) {
          leads[idx] = {
            ...leads[idx],
            businessName, category, contactPerson, phone, email, city, address,
            mapsUrl, rating, reviewsCount, stage, offeredProduct, nextFollowUp, notes
          };
          showToast(`Updated "${businessName}"`, 'success');
        }
      } else {
        // Add new
        const newLead = {
          id: 'lead_' + Date.now(),
          businessName, category, contactPerson, phone, email, city, address,
          mapsUrl, rating, reviewsCount, stage, offeredProduct, nextFollowUp, notes,
          createdAt: new Date().toISOString().split('T')[0]
        };
        leads.unshift(newLead);
        showToast(`Added "${businessName}" successfully!`, 'success');
      }

      saveLeads();
      renderAll();
      document.getElementById('leadModalOverlay').classList.remove('open');
    });

    // --- SMART WEBSITE & GOOGLE MAPS TEXT ORGANISER ---
    const smartModal = document.getElementById('smartPasteModalOverlay');
    const smartInput = document.getElementById('smartPasteInput');
    const importLeadBtn = document.getElementById('btnImportParsedLead');
    const importAndWaBtn = document.getElementById('btnImportAndWhatsApp');
    const importAndEmailBtn = document.getElementById('btnImportAndEmail');
    const previewPanel = document.getElementById('extractedPreviewPanel');

    document.getElementById('btnSmartPaste').addEventListener('click', () => {
      smartModal.classList.add('open');
      smartInput.focus();
    });

    document.getElementById('btnCloseSmartPaste').addEventListener('click', () => {
      smartModal.classList.remove('open');
    });

    document.getElementById('btnCancelSmartPaste').addEventListener('click', () => {
      smartModal.classList.remove('open');
    });

    // Live auto-parse as user types or pastes
    smartInput.addEventListener('input', () => {
      handleLiveWebsiteParse();
    });

    // Paste from clipboard button
    document.getElementById('btnPasteClipboard').addEventListener('click', async () => {
      try {
        const clipText = await navigator.clipboard.readText();
        if (clipText && clipText.trim()) {
          smartInput.value = clipText;
          handleLiveWebsiteParse();
          showToast('Pasted content from clipboard!', 'info');
        } else {
          showToast('Clipboard is empty. Copy website text first!', 'warning');
        }
      } catch (err) {
        showToast('Please press Ctrl+V inside the text box to paste.', 'warning');
      }
    });

    // Multi-Industry Sample Businesses
    const SAMPLE_BUSINESSES = {
      dental: `SmileCraft Advanced Dental Care & Implant Center
Lead Doctor: Dr. Ananya Deshmukh (BDS, MDS Orthodontics)
Comprehensive Multi-Speciality Dental Clinic in Mumbai

Specialized Treatments:
- Painless Root Canal Treatment (Single Sitting)
- Laser Teeth Whitening & Cosmetic Smile Design
- Dental Implants & Invisible Clear Aligners
- Pediatric Dentistry & Full Mouth Rehabilitation

Clinic & Appointment Details:
Location: Shop 12, Ground Floor, Platinum Heights, Link Road, Andheri West, Mumbai - 400053
Appointments: +91 98204 88310 / +91 98204 88311
WhatsApp Desk: +91 98204 88310
Email: care@smilecraftdental.in / dr.ananya@smilecraftdental.in
Website: https://smilecraftdental.in
Google Rating: 4.9 ★★★★★ (320 patient reviews)
© 2026 SmileCraft Dental Clinic. All Rights Reserved.`,

      agency: `PulseWave Digital & Performance Marketing
Founder & CEO: Aryan Kapoor
Premier ROI-Driven Digital Marketing Agency in Bangalore

Our Core Services:
- Performance Marketing & Meta/Google Ads Scaling
- SEO & Search Visibility Optimization
- High-Converting Landing Page Design & Funnels
- Social Media Content & Influencer Strategy

Agency Office:
Address: 4th Floor, Indiranagar Hub, 100 Feet Road, Bengaluru - 560038
Business Inquiries: +91 98765 22100
WhatsApp Business: +91 98765 22100
Email: hello@pulsewavedigital.com / aryan@pulsewavedigital.com
Website: https://pulsewavedigital.com
Google Rating: 4.8 ★★★★★ (110 reviews)
© 2026 PulseWave Digital Agency. All Rights Reserved.`,

      realestate: `Skyline Prime Properties & Realty Consultants
Managing Director: Vikram Singhania
Premium Residential & Commercial Property Advisory in Gurgaon

Projects & Advisory:
- Luxury 3 & 4 BHK Apartments in Golf Course Extension
- Commercial Retail Shops & Pre-Leased Office Spaces
- Verified Luxury Villas & Freehold Residential Plots
- End-to-End Home Loan Assistance & Legal Registry

Office Address:
Tower B, 8th Floor, Signature Global Tower, Sector 65, Golf Course Road, Gurugram - 122018
Sales Desk: +91 99100 45220 / +91 99100 45221
WhatsApp Inquiry: +91 99100 45220
Email: sales@skylineprime.in / vikram@skylineprime.in
Website: https://skylineprime.in
Google Rating: 4.7 ★★★★★ (195 client reviews)
© 2026 Skyline Prime Properties. All Rights Reserved.`,

      restaurant: `The Rustic Hearth Cafe & Italian Bistro
Executive Chef & Owner: Chef Marco D'souza
Artisanal Wood-Fired Pizza & Specialty Coffee in Bandra

Menu Highlights & Offerings:
- Neapolitan Hand-Tossed Wood-Fired Pizzas
- Fresh Handmade Pasta & Ravioli
- Specialty Single-Origin Espresso & Cold Brews
- Outdoor Courtyard Dining & Private Party Bookings

Visit Us:
Address: 14/B, Waroda Road, Behind St. Andrew's Church, Bandra West, Mumbai - 400050
Table Reservations: +91 98330 67112
WhatsApp Delivery: +91 98330 67112
Email: contact@rustichearth.in / reservations@rustichearth.in
Website: https://rustichearth.in
Google Rating: 4.8 ★★★★★ (540 reviews)
© 2026 The Rustic Hearth Bistro. All Rights Reserved.`,

      tuition: `Zenith IIT & Medical Academy
Director: Dr. Arvind Patel (Ph.D Physics)
Ranked Coaching Institute in Pune for Engineering & Medical Entrances

Flagship Batches:
- 2-Year Integrated Classroom Program for IIT-JEE Main & Advanced
- NEET-UG Comprehensive Medical Batch with Weekly Mock Tests
- CBSE / State Board Foundation (Class 8th to 10th Maths & Science)
- Advanced Doubt Solving & All India Ranker Test Series

Campus Details:
Head Office: 201 Royal Arcade, FC Road, Shivaji Nagar, Pune - 411005
Admissions: +91 98201 55442 | WhatsApp: +91 98201 55442
Email: admissions@zenithacademy.in
Website: https://zenithacademy.in
Google Rating: 4.9 ★★★★★ (285 student reviews)
© 2026 Zenith IIT & Medical Academy. All Rights Reserved.`,

      wholesale: `Apex Global Traders & Bulk FMCG Wholesalers
Partner: Rameshwar Agrawal
Authorized Master Distributor for Food Products & Confectionery

Wholesale Catalog & Services:
- Bulk Edible Oils, Grains & Packaged Spices Supply
- Master Wholesale Distribution to Supermarkets & Retailers
- Pan-India Logistics & Prompt Dispatch
- Flexible Credit Terms & B2B GST Invoicing

Central Depot:
Godown No. 44, APMC Market-1, Vashi, Navi Mumbai - 400703
Trade Orders: +91 98210 33441 / +91 98210 33442
WhatsApp B2B Orders: +91 98210 33441
Email: orders@apextraders.in / rameshwar@apextraders.in
Website: https://apextraders.in
Google Rating: 4.6 ★★★★★ (85 wholesale partner reviews)
© 2026 Apex Global Traders. All Rights Reserved.`
    };

    document.querySelectorAll('.btn-industry-sample').forEach(btn => {
      btn.addEventListener('click', () => {
        const type = btn.getAttribute('data-sample');
        if (SAMPLE_BUSINESSES[type]) {
          smartInput.value = SAMPLE_BUSINESSES[type];
          handleLiveWebsiteParse();
          showToast(`Loaded sample ${btn.textContent.trim()} text!`, 'success');
        }
      });
    });

    // Clear paste button
    document.getElementById('btnClearPaste').addEventListener('click', () => {
      smartInput.value = '';
      previewPanel.style.display = 'none';
      importLeadBtn.disabled = true;
      importAndWaBtn.disabled = true;
      if (importAndEmailBtn) importAndEmailBtn.disabled = true;
      parsedLeadCandidate = null;
    });

    function handleLiveWebsiteParse() {
      const text = smartInput.value;
      if (!text || !text.trim()) {
        previewPanel.style.display = 'none';
        importLeadBtn.disabled = true;
        importAndWaBtn.disabled = true;
        if (importAndEmailBtn) importAndEmailBtn.disabled = true;
        parsedLeadCandidate = null;
        return;
      }

      try {
        parsedLeadCandidate = parseWebsiteAndMapsText(text);
        if (!parsedLeadCandidate || !parsedLeadCandidate.businessName) {
          return;
        }

        renderOrganizedPreview(parsedLeadCandidate);
      } catch (err) {
        console.error('Error during live website parse:', err);
      }
    }

    function renderOrganizedPreview(candidate) {
      let count = 0;
      if (candidate.businessName) count++;
      if (candidate.contactPerson) count++;
      if (candidate.phone) count++;
      if (candidate.email) count++;
      if (candidate.city) count++;
      if (candidate.address) count++;
      if (candidate.courses && candidate.courses.length > 0) count++;
      if (candidate.website) count++;

      document.getElementById('badgeDetectedCount').textContent = `${count} Details Organized`;

      // Phone selector / input
      let phoneFieldHtml = '';
      if (candidate.allPhones && candidate.allPhones.length > 1) {
        phoneFieldHtml = `
          <select id="parsedLeadPhone" class="detected-item-input">
            ${candidate.allPhones.map(p => `<option value="${escapeHtml(p)}" ${p === candidate.phone ? 'selected' : ''}>${escapeHtml(p)}</option>`).join('')}
          </select>
        `;
      } else {
        phoneFieldHtml = `<input type="tel" id="parsedLeadPhone" class="detected-item-input" value="${escapeHtml(candidate.phone || '')}" placeholder="+91 ...">`;
      }

      // Email selector / input
      let emailFieldHtml = '';
      if (candidate.allEmails && candidate.allEmails.length > 1) {
        emailFieldHtml = `
          <select id="parsedLeadEmail" class="detected-item-input">
            ${candidate.allEmails.map(e => `<option value="${escapeHtml(e)}" ${e === candidate.email ? 'selected' : ''}>${escapeHtml(e)}</option>`).join('')}
          </select>
        `;
      } else {
        emailFieldHtml = `<input type="email" id="parsedLeadEmail" class="detected-item-input" value="${escapeHtml(candidate.email || '')}" placeholder="contact@...">`;
      }

      const grid = document.getElementById('detectedFieldsGrid');
      grid.innerHTML = `
        <div class="detected-item">
          <label class="detected-item-key">Business Name</label>
          <input type="text" id="parsedLeadBusinessName" class="detected-item-input" value="${escapeHtml(candidate.businessName)}">
        </div>

        <div class="detected-item">
          <label class="detected-item-key">Owner / Decision Maker</label>
          <input type="text" id="parsedLeadContact" class="detected-item-input" value="${escapeHtml(candidate.contactPerson)}">
        </div>

        <div class="detected-item">
          <label class="detected-item-key">Primary Phone / WhatsApp (${candidate.allPhones ? candidate.allPhones.length : 1} found)</label>
          ${phoneFieldHtml}
        </div>

        <div class="detected-item">
          <label class="detected-item-key">Email Address (${candidate.allEmails ? candidate.allEmails.length : 1} found)</label>
          ${emailFieldHtml}
        </div>

        <div class="detected-item">
          <label class="detected-item-key">City / Locality</label>
          <input type="text" id="parsedLeadCity" class="detected-item-input" value="${escapeHtml(candidate.city || 'Local')}">
        </div>

        <div class="detected-item">
          <label class="detected-item-key">Industry Category</label>
          <select id="parsedLeadCategory" class="detected-item-input">
            <option value="Digital Marketing Agency" ${candidate.category === 'Digital Marketing Agency' ? 'selected' : ''}>Digital Marketing Agency</option>
            <option value="Dental & Healthcare Clinic" ${candidate.category === 'Dental & Healthcare Clinic' ? 'selected' : ''}>Dental & Healthcare Clinic</option>
            <option value="Real Estate & Property" ${candidate.category === 'Real Estate & Property' ? 'selected' : ''}>Real Estate & Property</option>
            <option value="Restaurant & Hospitality" ${candidate.category === 'Restaurant & Hospitality' ? 'selected' : ''}>Restaurant & Hospitality</option>
            <option value="Gym & Fitness Studio" ${candidate.category === 'Gym & Fitness Studio' ? 'selected' : ''}>Gym & Fitness Studio</option>
            <option value="Salon & Beauty Spa" ${candidate.category === 'Salon & Beauty Spa' ? 'selected' : ''}>Salon & Beauty Spa</option>
            <option value="Coaching & Education" ${candidate.category === 'Coaching & Education' ? 'selected' : ''}>Coaching & Education</option>
            <option value="Wholesale & Distribution" ${candidate.category === 'Wholesale & Distribution' ? 'selected' : ''}>Wholesale & Distribution</option>
            <option value="CA & Legal Services" ${candidate.category === 'CA & Legal Services' ? 'selected' : ''}>CA & Legal Services</option>
            <option value="Automobile & Detailing" ${candidate.category === 'Automobile & Detailing' ? 'selected' : ''}>Automobile & Detailing</option>
            <option value="Recruitment & Staffing" ${candidate.category === 'Recruitment & Staffing' ? 'selected' : ''}>Recruitment & Staffing</option>
            <option value="Manufacturing & Industrial" ${candidate.category === 'Manufacturing & Industrial' ? 'selected' : ''}>Manufacturing & Industrial</option>
            <option value="E-commerce & Retail" ${candidate.category === 'E-commerce & Retail' ? 'selected' : ''}>E-commerce & Retail</option>
            <option value="Interior Design & Architecture" ${candidate.category === 'Interior Design & Architecture' ? 'selected' : ''}>Interior Design & Architecture</option>
            <option value="Other" ${candidate.category === 'Other' ? 'selected' : ''}>Other / General Business</option>
          </select>
        </div>

        <div class="detected-item" style="grid-column: 1 / -1;">
          <label class="detected-item-key">Full Address / Location</label>
          <input type="text" id="parsedLeadAddress" class="detected-item-input" value="${escapeHtml(candidate.address || '')}">
        </div>
      `;

      // Live update pitch recommendation when category is changed manually
      const catSelect = document.getElementById('parsedLeadCategory');
      if (catSelect) {
        catSelect.addEventListener('change', (e) => {
          const newCat = e.target.value;
          candidate.category = newCat;
          candidate.offeredProduct = getRecommendedProductForCategory(newCat);
          const pitchText = document.getElementById('aiPitchText');
          if (pitchText) {
            pitchText.textContent = `${candidate.offeredProduct} (Aligned with ${newCat})`;
          }
        });
      }

      // Render detected services / offerings pills
      const coursesBox = document.getElementById('detectedCoursesBox');
      const coursesList = document.getElementById('detectedCoursesList');
      if (candidate.courses && candidate.courses.length > 0) {
        coursesList.innerHTML = candidate.courses.map(c => `<span class="detected-tag-pill">${escapeHtml(c)}</span>`).join('');
        coursesBox.style.display = 'flex';
      } else {
        coursesBox.style.display = 'none';
      }

      // Render AI recommended pitch tailored to this exact business
      const pitchBox = document.getElementById('aiPitchRecommendation');
      const pitchText = document.getElementById('aiPitchText');
      if (candidate.offeredProduct) {
        pitchText.textContent = `${candidate.offeredProduct} (Tailored for ${candidate.category})`;
        pitchBox.style.display = 'flex';
      } else {
        pitchBox.style.display = 'none';
      }

      previewPanel.style.display = 'flex';
      importLeadBtn.disabled = false;
      importAndWaBtn.disabled = false;
      if (importAndEmailBtn) importAndEmailBtn.disabled = false;
    }

    // Helper to extract current edited values from the organized card
    function getLeadFromOrganizedCard() {
      const bName = document.getElementById('parsedLeadBusinessName')?.value.trim() || parsedLeadCandidate.businessName;
      const contact = document.getElementById('parsedLeadContact')?.value.trim() || parsedLeadCandidate.contactPerson;
      const phone = document.getElementById('parsedLeadPhone')?.value.trim() || parsedLeadCandidate.phone;
      const email = document.getElementById('parsedLeadEmail')?.value.trim() || parsedLeadCandidate.email;
      const city = document.getElementById('parsedLeadCity')?.value.trim() || parsedLeadCandidate.city;
      const address = document.getElementById('parsedLeadAddress')?.value.trim() || parsedLeadCandidate.address;
      const category = document.getElementById('parsedLeadCategory')?.value || parsedLeadCandidate.category;

      const newLead = {
        id: 'lead_' + Date.now(),
        businessName: bName,
        category: category,
        contactPerson: contact,
        phone: phone,
        email: email,
        city: city,
        address: address,
        rating: parsedLeadCandidate.rating || 4.8,
        reviewsCount: parsedLeadCandidate.reviewsCount || 50,
        stage: 'new',
        offeredProduct: parsedLeadCandidate.offeredProduct || getRecommendedProductForCategory(category),
        nextFollowUp: new Date().toISOString().split('T')[0],
        notes: parsedLeadCandidate.courses && parsedLeadCandidate.courses.length > 0 
          ? `Offerings / Services: ${parsedLeadCandidate.courses.join(', ')}.`
          : 'Discovered via Google Maps / Website text.',
        mapsUrl: parsedLeadCandidate.mapsUrl || parsedLeadCandidate.website || '',
        createdAt: new Date().toISOString().split('T')[0]
      };

      return newLead;
    }

    // 1. Save as Organised Lead
    importLeadBtn.addEventListener('click', () => {
      if (!parsedLeadCandidate) return;
      const newLead = getLeadFromOrganizedCard();
      leads.unshift(newLead);
      saveLeads();
      renderAll();
      smartModal.classList.remove('open');
      showToast(`✨ Organised & saved "${newLead.businessName}" to CRM!`, 'success');
    });

    // 2. Save & Launch 1-Click WhatsApp Pitch
    importAndWaBtn.addEventListener('click', () => {
      if (!parsedLeadCandidate) return;
      const newLead = getLeadFromOrganizedCard();
      leads.unshift(newLead);
      saveLeads();
      renderAll();
      smartModal.classList.remove('open');

      showToast(`Organised "${newLead.businessName}"! Launching WhatsApp...`, 'success');
      setTimeout(() => {
        window.quickSendWhatsApp(newLead.id);
      }, 300);
    });

    // 3. Save & Launch 1-Click Gmail Pitch
    if (importAndEmailBtn) {
      importAndEmailBtn.addEventListener('click', () => {
        if (!parsedLeadCandidate) return;
        const newLead = getLeadFromOrganizedCard();
        leads.unshift(newLead);
        saveLeads();
        renderAll();
        smartModal.classList.remove('open');

        showToast(`Organised "${newLead.businessName}"! Opening 1-Click Gmail...`, 'success');
        setTimeout(() => {
          window.quickSendEmail(newLead.id);
        }, 300);
      });
    }

    // Outreach Modal Actions
    document.getElementById('btnCloseOutreachModal').addEventListener('click', () => {
      document.getElementById('outreachModalOverlay').classList.remove('open');
    });

    document.getElementById('outreachTemplateSelect').addEventListener('change', refreshOutreachModalFields);
    document.getElementById('outreachSenderName').addEventListener('input', refreshOutreachModalFields);

    document.getElementById('btnCopyOutreach').addEventListener('click', () => {
      const text = document.getElementById('outreachMessageText').value;
      navigator.clipboard.writeText(text).then(() => {
        showToast('Personalized pitch copied to clipboard! 📋', 'success');
      }).catch(() => {
        showToast('Failed to copy. Please manually copy text.', 'warning');
      });
    });

    document.getElementById('btnSendWhatsAppDirect').addEventListener('click', () => {
      if (!activeOutreachLead) return;
      const text = document.getElementById('outreachMessageText').value;
      const cleanPhone = cleanPhoneNumberForWhatsApp(activeOutreachLead.phone);
      if (!cleanPhone) {
        showToast('Phone number is missing or invalid!', 'warning');
        return;
      }
      const waUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
      window.open(waUrl, '_blank');

      if (activeOutreachLead.stage === 'new') {
        activeOutreachLead.stage = 'contacted';
        activeOutreachLead.lastContactDate = new Date().toISOString().split('T')[0];
        saveLeads();
        renderAll();
      }
      document.getElementById('outreachModalOverlay').classList.remove('open');
      showToast(`WhatsApp pitch opened for ${activeOutreachLead.businessName}!`, 'success');
    });

    // 1-Click Direct Gmail Web Compose Button
    const btnSendGmailWeb = document.getElementById('btnSendGmailWeb');
    if (btnSendGmailWeb) {
      btnSendGmailWeb.addEventListener('click', () => {
        if (!activeOutreachLead) return;
        if (!activeOutreachLead.email) {
          const enteredEmail = prompt(`Please enter the email address for "${activeOutreachLead.businessName}":`);
          if (!enteredEmail || !enteredEmail.trim()) {
            showToast('Email address is required for Gmail outreach.', 'warning');
            return;
          }
          activeOutreachLead.email = enteredEmail.trim();
          saveLeads();
          renderAll();
        }

        const subject = document.getElementById('outreachSubject').value || `Software & Automation Solutions for ${activeOutreachLead.businessName}`;
        const body = document.getElementById('outreachMessageText').value;
        const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(activeOutreachLead.email)}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        window.open(gmailUrl, '_blank');

        if (activeOutreachLead.stage === 'new') {
          activeOutreachLead.stage = 'contacted';
          activeOutreachLead.lastContactDate = new Date().toISOString().split('T')[0];
          saveLeads();
          renderAll();
        }
        document.getElementById('outreachModalOverlay').classList.remove('open');
        showToast(`1-Click Gmail opened for ${activeOutreachLead.email}!`, 'success');
      });
    }

    document.getElementById('btnSendEmailDirect').addEventListener('click', () => {
      if (!activeOutreachLead) return;
      if (!activeOutreachLead.email) {
        showToast('No email address saved for this lead.', 'warning');
        return;
      }
      const subject = document.getElementById('outreachSubject').value || `SaaS Solutions for ${activeOutreachLead.businessName}`;
      const body = document.getElementById('outreachMessageText').value;
      const mailtoUrl = `mailto:${encodeURIComponent(activeOutreachLead.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      window.open(mailtoUrl, '_blank');

      if (activeOutreachLead.stage === 'new') {
        activeOutreachLead.stage = 'contacted';
        activeOutreachLead.lastContactDate = new Date().toISOString().split('T')[0];
        saveLeads();
        renderAll();
      }
      document.getElementById('outreachModalOverlay').classList.remove('open');
      showToast(`Email opened for ${activeOutreachLead.email}!`, 'info');
    });

    // Template Editor Actions
    document.getElementById('tplBodyInput').addEventListener('input', (e) => {
      updateLiveTemplatePreview(e.target.value);
    });

    document.querySelectorAll('.token-tag').forEach(tag => {
      tag.addEventListener('click', () => {
        const token = tag.getAttribute('data-token');
        const bodyInput = document.getElementById('tplBodyInput');
        const start = bodyInput.selectionStart;
        const end = bodyInput.selectionEnd;
        const text = bodyInput.value;
        bodyInput.value = text.substring(0, start) + token + text.substring(end);
        bodyInput.focus();
        bodyInput.selectionStart = bodyInput.selectionEnd = start + token.length;
        updateLiveTemplatePreview(bodyInput.value);
      });
    });

    document.getElementById('btnSaveTemplate').addEventListener('click', () => {
      const tpl = templates.find(t => t.id === activeTemplateId);
      if (!tpl) return;

      tpl.name = document.getElementById('tplNameInput').value.trim() || 'Untitled Template';
      tpl.channel = document.getElementById('tplChannelInput').value;
      tpl.subject = document.getElementById('tplSubjectInput').value;
      tpl.body = document.getElementById('tplBodyInput').value;

      saveTemplates();
      renderTemplatesView();
      showToast('Template saved successfully! ✨', 'success');
    });

    document.getElementById('btnNewTemplate').addEventListener('click', () => {
      const newTpl = {
        id: 'tpl_' + Date.now(),
        name: 'New Custom SaaS Pitch',
        channel: 'whatsapp',
        subject: 'Quick question for {businessName}',
        body: `Hello {contactPerson}!\n\nI found {businessName} on Google Maps in {city} and love what you do!\n\nWe build modern software for tuitions and coaching centers...`
      };
      templates.push(newTpl);
      activeTemplateId = newTpl.id;
      saveTemplates();
      renderTemplatesView();
      showToast('Created new template. Start typing!', 'success');
    });

    document.getElementById('btnDeleteTemplate').addEventListener('click', () => {
      if (templates.length <= 1) {
        showToast('You must keep at least one template.', 'warning');
        return;
      }
      if (confirm('Are you sure you want to delete this template?')) {
        templates = templates.filter(t => t.id !== activeTemplateId);
        activeTemplateId = templates[0].id;
        saveTemplates();
        renderTemplatesView();
        showToast('Template deleted.', 'info');
      }
    });

    // More actions menu
    const moreMenu = document.getElementById('moreActionsMenu');
    document.getElementById('btnMoreActions').addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('show');
    });
    window.addEventListener('click', () => {
      moreMenu.classList.remove('show');
    });

    // Export CSV
    document.getElementById('btnExportCsv').addEventListener('click', exportLeadsToCsv);

    // Import CSV
    document.getElementById('importCsvInput').addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCsvImport(e.target.files[0]);
      }
    });

    // Clear All Leads
    document.getElementById('btnClearAllLeads').addEventListener('click', () => {
      if (leads.length === 0) {
        showToast('No leads to clear!', 'info');
        return;
      }
      if (confirm('Are you sure you want to delete all leads? This cannot be undone.')) {
        leads = [];
        saveLeads();
        renderAll();
        showToast('All leads have been cleared.', 'info');
      }
    });
  }

  // --- UTILS ---
  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  // Start app
  document.addEventListener('DOMContentLoaded', init);

})();
