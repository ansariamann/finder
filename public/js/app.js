/**
 * JobReach - Main Application Logic
 * Quick-send mode: user only enters a company email — everything else is automatic.
 */
(function () {
  'use strict';

  // --- State ---
  const state = {
    jobs: [],
    selectedJobs: new Set(),
    recipients: [],
    currentCity: '',
    currentKeywords: 'fresher',
    currentPage: 1,
    emailTemplate: window.DEFAULT_EMAIL_TEMPLATE || '',
    resumeUploaded: false,
    resumeName: '',
    sentLog: []
  };

  // --- DOM Cache ---
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => document.querySelectorAll(s);

  const dom = {
    searchForm: $('#search-form'),
    cityInput: $('#city-input'),
    keywordsInput: $('#keywords-input'),
    searchBtn: $('#search-btn'),
    jobsGrid: $('#jobs-grid'),
    statsRow: $('#stats-row'),
    statTotal: $('#stat-total'),
    statEmails: $('#stat-emails'),
    statSelected: $('#stat-selected'),
    resultsSection: $('#results-section'),
    resultsTitle: $('#results-title'),
    emptyState: $('#empty-state'),
    loadingState: $('#loading-state'),
    loadMoreWrap: $('#load-more-wrap'),
    loadMoreBtn: $('#load-more-btn'),
    selectAllBtn: $('#select-all-btn'),
    addToOutreachBtn: $('#add-to-outreach-btn'),
    // Bulk send
    tagEmailInput: $('#tag-email-input'),
    tagChips: $('#tag-chips'),
    tagInputWrap: $('#tag-input-wrap'),
    bulkPositionInput: $('#bulk-position-input'),
    bulkSendBtn: $('#bulk-send-btn'),
    bulkSendLabel: $('#bulk-send-label'),
    bulkClearBtn: $('#bulk-clear-btn'),
    bulkSendMeta: $('#bulk-send-meta'),
    bulkCountBadge: $('#bulk-count-badge'),
    bulkProgressWrap: $('#bulk-progress-wrap'),
    bulkProgressBar: $('#bulk-progress-bar'),
    bulkProgLabel: $('#bulk-prog-label'),
    bulkProgPct: $('#bulk-prog-pct'),
    bulkProgSent: $('#bulk-prog-sent'),
    bulkProgFailed: $('#bulk-prog-failed'),
    bulkProgTotal: $('#bulk-prog-total'),
    bulkLog: $('#bulk-log'),
    sentLogList: $('#sent-log-list'),
    sentLogCount: $('#sent-log-count'),
    sentLogEmpty: $('#sent-log-empty'),
    // Resume
    resumeInput: $('#resume-input'),
    browseBtn: $('#browse-btn'),
    uploadArea: $('#upload-area'),
    uploadSuccess: $('#upload-success'),
    resumeNameEl: $('#resume-name'),
    resumeSizeEl: $('#resume-size'),
    removeResumeBtn: $('#remove-resume-btn'),
    // Template (right panel - kept for advanced users)
    emailSubject: $('#email-subject'),
    senderNameInput: $('#sender-name-input'),
    senderPhoneInput: $('#sender-phone-input'),
    templateBody: $('#template-body'),
    resetTemplateBtn: $('#reset-template-btn'),
    previewEmailBtn: $('#preview-email-btn'),
    // Settings
    testSmtpBtn: $('#test-smtp-btn'),
    clearHistoryBtn: $('#clear-history-btn'),
    smtpDot: $('#smtp-dot'),
    smtpLabel: $('#smtp-label'),
    smtpStatusCard: $('#smtp-status-card'),
    smtpStatusIcon: $('#smtp-status-icon'),
    smtpStatusText: $('#smtp-status-text'),
    smtpStatusEmail: $('#smtp-status-email'),
    toastContainer: $('#toast-container'),
    modalOverlay: $('#modal-overlay'),
    modalBody: $('#modal-body'),
    modalClose: $('#modal-close')
  };

  // --- Init ---
  function init() {
    lucide.createIcons();
    setupNavTabs();
    setupSearch();
    setupJobSelection();
    setupBulkSend();
    setupResumeUpload();
    setupEmailTemplate();
    setupSettings();
    setupModal();
    checkSmtpStatus();
    checkResumeStatus();
    loadSenderInfo();
    loadSentLog();
  }

  // --- Load sender info from .env via server ---
  async function loadSenderInfo() {
    try {
      const res = await fetch('/api/sender-info');
      const data = await res.json();
      if (data.name  && dom.senderNameInput)  dom.senderNameInput.value  = data.name;
      if (data.phone && dom.senderPhoneInput) dom.senderPhoneInput.value = data.phone;
    } catch (e) { /* silent */ }
  }

  // --- Navigation Tabs ---
  function setupNavTabs() {
    function switchTab(tab) {
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      const topBtn = $(`[data-tab="${tab}"].nav-btn`);
      if (topBtn) topBtn.classList.add('active');
      $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
      const botBtn = $(`[data-tab="${tab}"].bottom-nav-btn`);
      if (botBtn) botBtn.classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $(`#panel-${tab}`).classList.add('active');
      lucide.createIcons();
    }

    $$('.nav-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );
    $$('.bottom-nav-btn').forEach(btn =>
      btn.addEventListener('click', () => switchTab(btn.dataset.tab))
    );
  }

  // --- Search ---
  function setupSearch() {
    dom.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      state.currentPage = 1;
      state.currentCity = dom.cityInput.value.trim();
      state.currentKeywords = dom.keywordsInput.value.trim() || 'fresher';
      searchJobs();
    });

    dom.loadMoreBtn.addEventListener('click', () => {
      state.currentPage++;
      searchJobs(true);
    });
  }

  async function searchJobs(append = false) {
    if (!state.currentCity) return;

    showLoading(true);
    if (!append) {
      dom.jobsGrid.innerHTML = '';
      state.jobs = [];
      state.selectedJobs.clear();
    }

    try {
      const res = await fetch('/api/search-jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: state.currentCity,
          keywords: state.currentKeywords,
          page: state.currentPage
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error || 'Search failed');

      if (data.jobs && data.jobs.length > 0) {
        state.jobs = append ? [...state.jobs, ...data.jobs] : data.jobs;
        renderJobs(data.jobs, append);
        updateStats();
        dom.resultsSection.style.display = 'block';
        dom.emptyState.style.display = 'none';
        dom.loadMoreWrap.style.display = 'block';
        const totalAvail = data.totalAvailable || data.total;
        dom.resultsTitle.textContent = `Jobs in ${state.currentCity} - ${state.jobs.length} shown of ${totalAvail} found`;
        dom.loadMoreBtn.textContent = `Load More (${totalAvail - state.jobs.length} remaining)`;
        toast('success', `Found ${data.jobs.length} new job listings!`);
      } else {
        if (!append) {
          dom.emptyState.style.display = 'block';
          dom.resultsSection.style.display = 'none';
        }
        dom.loadMoreWrap.style.display = 'none';
        toast('info', 'No more new companies found. Try clearing history.');
      }
    } catch (err) {
      toast('error', err.message);
    } finally {
      showLoading(false);
    }
  }

  function renderJobs(jobs, append) {
    const fragment = document.createDocumentFragment();
    jobs.forEach(job => {
      const card = document.createElement('div');
      card.className = 'job-card';
      card.dataset.id = job.id;

      const emailHtml = job.email
        ? `<div class="job-email"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>${job.email}</div>`
        : `<p class="job-no-email">No email found - click to find</p>`;

      const posted = timeAgo(job.posted);

      card.innerHTML = `
        <div class="job-card-check"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg></div>
        <div class="job-company">${esc(job.company)}</div>
        <div class="job-title">${esc(job.title)}</div>
        <div class="job-meta">
          <span class="job-tag"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>${esc(job.location)}</span>
          <span class="job-tag">${esc(job.type)}</span>
          <span class="job-tag">${posted}</span>
        </div>
        ${emailHtml}
        <p class="job-desc">${esc(job.description)}</p>
      `;

      // Click on card → add email to bulk list or toggle selection
      card.addEventListener('click', () => {
        if (job.email) {
          prefillBulkEmail(job.email);
        } else {
          toggleJobSelection(job.id);
        }
      });
      fragment.appendChild(card);
    });

    if (!append) dom.jobsGrid.innerHTML = '';
    dom.jobsGrid.appendChild(fragment);
  }

  function setupJobSelection() {
    dom.selectAllBtn.addEventListener('click', () => {
      const allSelected = state.selectedJobs.size === state.jobs.length;
      if (allSelected) {
        state.selectedJobs.clear();
      } else {
        state.jobs.forEach(j => state.selectedJobs.add(j.id));
      }
      refreshJobCardSelections();
      updateStats();
    });

    if (dom.addToOutreachBtn) {
      dom.addToOutreachBtn.addEventListener('click', () => {
        const jobsWithEmail = state.jobs.filter(j => state.selectedJobs.has(j.id) && j.email);
        if (jobsWithEmail.length === 0) {
          toast('info', 'No selected jobs have email addresses.');
          return;
        }
        // Add all emails to the bulk list with their position from job title
        let added = 0;
        jobsWithEmail.forEach(j => {
          if (!bulkEntries.some(e => e.email === j.email.toLowerCase())) {
            bulkEntries.push({ email: j.email.toLowerCase(), position: j.title || 'Software Developer' });
            added++;
          }
        });
        renderChips();
        updateBulkMeta();
        // Switch to outreach tab
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        $('#nav-outreach').classList.add('active');
        $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
        const bot = $('[data-tab="outreach"].bottom-nav-btn');
        if (bot) bot.classList.add('active');
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        $('#panel-outreach').classList.add('active');
        lucide.createIcons();
        toast('success', `Added ${added} email${added !== 1 ? 's' : ''} to bulk list!`);
      });
    }
  }

  function toggleJobSelection(id) {
    if (state.selectedJobs.has(id)) {
      state.selectedJobs.delete(id);
    } else {
      state.selectedJobs.add(id);
    }
    refreshJobCardSelections();
    updateStats();
  }

  function refreshJobCardSelections() {
    $$('.job-card').forEach(card => {
      if (state.selectedJobs.has(card.dataset.id)) {
        card.classList.add('selected');
      } else {
        card.classList.remove('selected');
      }
    });
  }

  function updateStats() {
    const emailCount = state.jobs.filter(j => j.email).length;
    dom.statTotal.textContent = state.jobs.length;
    dom.statEmails.textContent = emailCount;
    dom.statSelected.textContent = state.selectedJobs.size;
    dom.statsRow.style.display = state.jobs.length > 0 ? 'flex' : 'none';
  }

  // ══════════════════════════════════════════════════
  //  BULK SEND — Tag-input multi-email system
  // ══════════════════════════════════════════════════

  // Holds all queued entries as {email, position} objects (deduped by email)
  const bulkEntries = [];

  function setupBulkSend() {
    if (!dom.tagEmailInput) return;

    // Click on the wrapper → focus the input
    if (dom.tagInputWrap) {
      dom.tagInputWrap.addEventListener('click', () => dom.tagEmailInput.focus());
    }

    // Helper to read inputs and add entry
    function addCurrentEntry() {
      const emailVal = dom.tagEmailInput.value.trim();
      const posVal = (dom.bulkPositionInput && dom.bulkPositionInput.value.trim()) || '';
      if (emailVal) {
        addChip(emailVal, posVal || 'Software Developer');
      }
    }

    dom.tagEmailInput.addEventListener('keydown', (e) => {
      const val = dom.tagEmailInput.value.trim();

      // Enter or comma → add chip
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        addCurrentEntry();
        return;
      }

      // Backspace on empty input → remove last entry
      if (e.key === 'Backspace' && !val && bulkEntries.length > 0) {
        removeChip(bulkEntries[bulkEntries.length - 1].email);
      }
    });

    // Also allow Enter from position field
    if (dom.bulkPositionInput) {
      dom.bulkPositionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          addCurrentEntry();
        }
      });
    }

    // Add button (+)
    const addChipBtn = $('#add-chip-btn');
    if (addChipBtn) {
      addChipBtn.addEventListener('click', (e) => {
        e.preventDefault();
        addCurrentEntry();
      });
    }

    // Also handle paste — split by comma/newline/semicolon and add all
    dom.tagEmailInput.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasted = (e.clipboardData || window.clipboardData).getData('text');
      const posVal = (dom.bulkPositionInput && dom.bulkPositionInput.value.trim()) || 'Software Developer';
      const parts = pasted.split(/[,;\n\r]+/);
      parts.forEach(p => { const t = p.trim(); if (t) addChip(t, posVal); });
    });

    // Send All button
    if (dom.bulkSendBtn) {
      dom.bulkSendBtn.addEventListener('click', startBulkSend);
    }

    // Clear All
    if (dom.bulkClearBtn) {
      dom.bulkClearBtn.addEventListener('click', () => {
        bulkEntries.length = 0;
        renderChips();
        updateBulkMeta();
      });
    }
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function addChip(email, position) {
    const cleanEmail = email.toLowerCase().trim();
    const cleanPos = (position || 'Software Developer').trim();
    if (!isValidEmail(cleanEmail)) {
      toast('error', `"${email}" doesn't look like a valid email.`);
      return;
    }
    if (bulkEntries.some(e => e.email === cleanEmail)) {
      toast('info', `${email} is already in the list.`);
      dom.tagEmailInput.value = '';
      return;
    }
    bulkEntries.push({ email: cleanEmail, position: cleanPos });
    dom.tagEmailInput.value = '';
    if (dom.bulkPositionInput) dom.bulkPositionInput.value = '';
    dom.tagEmailInput.focus();
    renderChips();
    updateBulkMeta();
  }

  function removeChip(email) {
    const idx = bulkEntries.findIndex(e => e.email === email);
    if (idx !== -1) bulkEntries.splice(idx, 1);
    renderChips();
    updateBulkMeta();
  }

  function renderChips() {
    if (!dom.tagChips) return;
    const wrap = $('#tag-chips-wrap');
    dom.tagChips.innerHTML = '';
    if (bulkEntries.length === 0) {
      if (wrap) wrap.style.display = 'none';
      return;
    }
    if (wrap) wrap.style.display = 'block';
    bulkEntries.forEach(entry => {
      const chip = document.createElement('div');
      chip.className = 'email-chip';
      chip.title = `${entry.email} — ${entry.position}`;
      chip.innerHTML = `
        <div class="chip-content">
          <span class="chip-email">${esc(entry.email)}</span>
          <span class="chip-position">${esc(entry.position)}</span>
        </div>
        <button class="chip-remove" aria-label="Remove">&times;</button>`;
      chip.querySelector('.chip-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        removeChip(entry.email);
      });
      dom.tagChips.appendChild(chip);
    });
  }

  function updateBulkMeta() {
    const n = bulkEntries.length;
    if (dom.bulkSendBtn) dom.bulkSendBtn.disabled = n === 0;
    if (dom.bulkClearBtn) dom.bulkClearBtn.style.display = n > 0 ? '' : 'none';
    if (dom.bulkSendMeta) dom.bulkSendMeta.style.display = n > 0 ? '' : 'none';
    if (dom.bulkCountBadge) dom.bulkCountBadge.textContent = `${n} email${n !== 1 ? 's' : ''} queued`;
    if (dom.bulkSendLabel) dom.bulkSendLabel.textContent = n > 0 ? `Send All (${n})` : 'Send All';
  }

  /** Fire all queued emails one-by-one with live progress + automatic retry */
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [5000, 10000, 20000]; // 5s, 10s, 20s exponential backoff

  async function sendOneEmail(email, position) {
    const res = await fetch('/api/quick-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyEmail: email, position })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Send failed');
    return data;
  }

  async function startBulkSend() {
    if (bulkEntries.length === 0) return;

    const total = bulkEntries.length;
    // Snapshot the entries to send (clone so clearing doesn't affect in-progress)
    const toSend = bulkEntries.map(e => ({ ...e }));
    let sent = 0, failed = 0;

    // Lock UI
    if (dom.bulkSendBtn) { dom.bulkSendBtn.disabled = true; dom.bulkSendLabel.textContent = 'Sending…'; }
    if (dom.tagEmailInput) dom.tagEmailInput.disabled = true;
    if (dom.bulkPositionInput) dom.bulkPositionInput.disabled = true;
    if (dom.bulkClearBtn) dom.bulkClearBtn.disabled = true;
    const addChipBtn = $('#add-chip-btn');
    if (addChipBtn) addChipBtn.disabled = true;

    // Show progress section
    if (dom.bulkProgressWrap) dom.bulkProgressWrap.style.display = 'block';
    if (dom.bulkLog) dom.bulkLog.innerHTML = '';
    if (dom.bulkProgSent) dom.bulkProgSent.textContent = '0';
    if (dom.bulkProgFailed) dom.bulkProgFailed.textContent = '0';
    if (dom.bulkProgTotal) dom.bulkProgTotal.textContent = total;
    if (dom.bulkProgPct) dom.bulkProgPct.textContent = '0%';
    if (dom.bulkProgLabel) dom.bulkProgLabel.textContent = `Sending 1 of ${total}…`;
    if (dom.bulkProgressBar) dom.bulkProgressBar.style.width = '0%';

    // Track log entry elements for retry updates
    const logEntries = new Map();

    // Send emails sequentially — each with its own position
    for (let i = 0; i < toSend.length; i++) {
      const { email, position } = toSend[i];
      const companyName = deriveName(email);

      if (dom.bulkProgLabel) dom.bulkProgLabel.textContent = `Sending ${i + 1} of ${total} — ${companyName} (${position})…`;

      let ok = false;
      let errMsg = '';
      let attempts = 0;

      // Try up to MAX_RETRIES + 1 times (initial + retries)
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        attempts = attempt + 1;
        try {
          const data = await sendOneEmail(email, position);
          ok = true;
          sent++;
          addToSentLog({ email, company: data.company || companyName, status: 'sent', ts: new Date() });
          break; // success, no retry
        } catch (err) {
          errMsg = err.message;

          if (attempt < MAX_RETRIES) {
            // Show retry status in the log
            const retryDelay = RETRY_DELAYS[attempt] || 20000;
            const retryNum = attempt + 1;

            if (dom.bulkProgLabel) {
              dom.bulkProgLabel.textContent = `⟳ Retry ${retryNum}/${MAX_RETRIES} for ${companyName} in ${retryDelay / 1000}s…`;
            }

            // Create or update log entry to show retrying state
            if (dom.bulkLog) {
              let entry = logEntries.get(email);
              if (!entry) {
                entry = document.createElement('div');
                entry.className = 'bulk-log-entry retrying';
                dom.bulkLog.prepend(entry);
                logEntries.set(email, entry);
              }
              entry.className = 'bulk-log-entry retrying';
              entry.innerHTML = `
                <div class="bulk-log-dot retrying-dot"></div>
                <div class="bulk-log-company">${esc(companyName)}</div>
                <div class="bulk-log-email">${esc(email)}</div>
                <span class="bulk-log-status retrying-status">⟳ Retry ${retryNum}/${MAX_RETRIES}</span>
                <span style="font-size:.68rem;color:var(--yellow, #eab308);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="${esc(errMsg)}">${esc(errMsg)}</span>
              `;
            }

            toast('info', `Retrying ${companyName} (attempt ${retryNum}/${MAX_RETRIES})…`);

            // Wait with countdown effect
            await new Promise(r => setTimeout(r, retryDelay));
          } else {
            // All retries exhausted
            failed++;
            addToSentLog({ email, company: companyName, status: 'failed', error: `Failed after ${MAX_RETRIES} retries: ${errMsg}`, ts: new Date() });
          }
        }
      }

      // Update progress
      const done = i + 1;
      const pct = Math.round((done / total) * 100);
      if (dom.bulkProgressBar) dom.bulkProgressBar.style.width = pct + '%';
      if (dom.bulkProgPct) dom.bulkProgPct.textContent = pct + '%';
      if (dom.bulkProgSent) dom.bulkProgSent.textContent = sent;
      if (dom.bulkProgFailed) dom.bulkProgFailed.textContent = failed;

      // Update or create final log entry
      if (dom.bulkLog) {
        let entry = logEntries.get(email);
        if (!entry) {
          entry = document.createElement('div');
          dom.bulkLog.prepend(entry);
          logEntries.set(email, entry);
        }
        entry.className = `bulk-log-entry ${ok ? 'ok' : 'fail'}`;
        const retryTag = attempts > 1
          ? `<span class="bulk-log-retry-badge">${ok ? '✓' : '✗'} ${attempts} attempt${attempts !== 1 ? 's' : ''}</span>`
          : '';
        entry.innerHTML = `
          <div class="bulk-log-dot"></div>
          <div class="bulk-log-company">${esc(companyName)}</div>
          <div class="bulk-log-email">${esc(email)}</div>
          <span class="bulk-log-status">${ok ? 'Sent ✓' : 'Failed'}</span>
          ${retryTag}
        `;
        if (!ok) {
          const errEl = document.createElement('span');
          errEl.style.cssText = 'font-size:.68rem;color:var(--red);margin-left:auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px';
          errEl.title = errMsg;
          errEl.textContent = `After ${attempts} attempts: ${errMsg}`;
          entry.appendChild(errEl);
        }
      }

      lucide.createIcons();

      // Delay between emails (rate limiting)
      if (i < toSend.length - 1) {
        await new Promise(r => setTimeout(r, 3200));
      }
    }

    // Done!
    if (dom.bulkProgLabel) dom.bulkProgLabel.textContent = `✅ Done! ${sent} sent, ${failed} failed.`;
    toast(failed === 0 ? 'success' : 'info', `Bulk send complete: ${sent} sent, ${failed} failed.`);

    // Clear the entries & reset UI
    bulkEntries.length = 0;
    renderChips();
    updateBulkMeta();

    if (dom.tagEmailInput) dom.tagEmailInput.disabled = false;
    if (dom.bulkPositionInput) dom.bulkPositionInput.disabled = false;
    if (dom.bulkClearBtn) { dom.bulkClearBtn.disabled = false; }
    if (addChipBtn) addChipBtn.disabled = false;
  }

  // Keep clicking a job with email → adds to bulk list instead of old quick-send
  function prefillBulkEmail(email) {
    if (!email) return;
    addChip(email, 'Software Developer');
    // Switch to outreach tab
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    $('#nav-outreach').classList.add('active');
    $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
    const bot = $('[data-tab="outreach"].bottom-nav-btn');
    if (bot) bot.classList.add('active');
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    $('#panel-outreach').classList.add('active');
    lucide.createIcons();
    if (dom.tagEmailInput) dom.tagEmailInput.focus();
    toast('info', `Added ${email} to bulk list. Add more or hit Send All!`);
  }

  // --- Sent Log UI ---
  function addToSentLog(entry) {
    state.sentLog.unshift(entry); // newest first
    renderSentLog();
  }

  function renderSentLog() {
    if (!dom.sentLogList) return;
    if (state.sentLog.length === 0) {
      dom.sentLogList.innerHTML = `<div class="empty-recipients" id="sent-log-empty"><i data-lucide="inbox"></i><p>No emails sent yet</p></div>`;
      if (dom.sentLogCount) dom.sentLogCount.textContent = '';
      lucide.createIcons();
      return;
    }
    if (dom.sentLogCount) dom.sentLogCount.textContent = state.sentLog.length;
    let html = '';
    state.sentLog.forEach((entry, i) => {
      const initials = (entry.company || 'CO').substring(0, 2).toUpperCase();
      const timeStr  = entry.ts ? entry.ts.toLocaleTimeString() : '';
      const ok = entry.status === 'sent';
      html += `
        <div class="recipient-item sent-log-item ${ok ? '' : 'log-failed'}">
          <div class="recipient-avatar" style="background: ${ok ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'}; color: ${ok ? 'var(--green)' : '#ef4444'};">${initials}</div>
          <div class="recipient-info">
            <strong>${esc(entry.company || entry.email)}</strong>
            <small>${esc(entry.email)}</small>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:2px;min-width:70px;">
            <span class="recipient-status ${ok ? 'ok' : 'err'}">${ok ? 'Sent ✓' : 'Failed'}</span>
            <small style="color:var(--muted);font-size:10px;">${timeStr}</small>
          </div>
        </div>`;
    });
    dom.sentLogList.innerHTML = html;
  }

  async function loadSentLog() {
    try {
      const res = await fetch('/api/email-log');
      const data = await res.json();
      if (data.success && data.log && data.log.length > 0) {
        state.sentLog = data.log.map(entry => ({
          email: entry.email,
          company: entry.company,
          status: entry.status || 'sent',
          error: entry.error || null,
          ts: entry.sentAt ? new Date(entry.sentAt) : null
        })).reverse(); // newest first
        renderSentLog();
      }
    } catch (e) { /* silent */ }
  }
  /** Derive company name from an email domain client-side (mirrors server logic) */
  function deriveName(email) {
    try {
      const domain = email.split('@')[1];
      const skip = new Set(['com','co','in','org','net','io','ai','app','dev','tech','gov','edu','uk','us','au']);
      const parts = domain.split('.');
      const name = parts.find(p => !skip.has(p.toLowerCase())) || parts[0];
      return name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
    } catch (_) { return ''; }
  }

  // --- Resume Upload ---
  function setupResumeUpload() {
    dom.browseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dom.resumeInput.click();
    });
    dom.uploadArea.addEventListener('click', () => dom.resumeInput.click());

    dom.uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.uploadArea.style.borderColor = 'var(--primary)';
    });
    dom.uploadArea.addEventListener('dragleave', () => {
      dom.uploadArea.style.borderColor = '';
    });
    dom.uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.uploadArea.style.borderColor = '';
      if (e.dataTransfer.files.length) {
        dom.resumeInput.files = e.dataTransfer.files;
        uploadResume(e.dataTransfer.files[0]);
      }
    });

    dom.resumeInput.addEventListener('change', () => {
      if (dom.resumeInput.files.length) uploadResume(dom.resumeInput.files[0]);
    });

    dom.removeResumeBtn.addEventListener('click', () => {
      state.resumeUploaded = false;
      state.resumeName = '';
      dom.uploadArea.style.display = '';
      dom.uploadSuccess.style.display = 'none';
      toast('info', 'Resume removed.');
    });
  }

  async function uploadResume(file) {
    const fd = new FormData();
    fd.append('resume', file);
    try {
      const res = await fetch('/api/upload-resume', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      state.resumeUploaded = true;
      state.resumeName = data.filename;
      dom.resumeNameEl.textContent = data.filename;
      dom.resumeSizeEl.textContent = data.size;
      dom.uploadArea.style.display = 'none';
      dom.uploadSuccess.style.display = 'flex';
      toast('success', 'Resume uploaded successfully!');
    } catch (err) {
      toast('error', 'Upload failed: ' + err.message);
    }
  }

  async function checkResumeStatus() {
    try {
      const res = await fetch('/api/resume-status');
      const data = await res.json();
      if (data.uploaded) {
        state.resumeUploaded = true;
        state.resumeName = data.filename;
        dom.resumeNameEl.textContent = data.filename;
        dom.resumeSizeEl.textContent = '';
        dom.uploadArea.style.display = 'none';
        dom.uploadSuccess.style.display = 'flex';
      }
    } catch (e) { /* silent */ }
  }

  // --- Email Template (right panel — advanced use) ---
  const DEFAULT_TEMPLATE = window.DEFAULT_EMAIL_TEMPLATE ||
`Dear {hr_name},

I hope this message finds you well. I came across {company} and was genuinely impressed by your work. I am a recent Computer Science graduate eager to start my career in software development.

I am writing to express my interest in any fresher or entry-level software developer positions at {company}. I have strong fundamentals in programming, data structures, and web development, and I am a quick learner who is enthusiastic and committed.

I have attached my resume for your consideration. I would love the opportunity to discuss how I can contribute to your team.

Thank you for your time. I look forward to hearing from you.

Warm regards,
{name}
{email}
{phone}`;

  function setupEmailTemplate() {
    if (dom.templateBody) dom.templateBody.value = DEFAULT_TEMPLATE;

    if (dom.resetTemplateBtn) {
      dom.resetTemplateBtn.addEventListener('click', () => {
        dom.templateBody.value = DEFAULT_TEMPLATE;
        toast('info', 'Template reset to default.');
      });
    }

    if (dom.previewEmailBtn) {
      dom.previewEmailBtn.addEventListener('click', () => {
        const filled = buildHtmlBody(dom.templateBody.value);
        if (filled.trim().startsWith('<')) {
          dom.modalBody.innerHTML = filled;
        } else {
          dom.modalBody.innerHTML = `<div style="padding:24px;font-family:Arial,sans-serif;font-size:14px;line-height:1.8;white-space:pre-wrap;">${filled}</div>`;
        }
        dom.modalOverlay.style.display = 'flex';
      });
    }
  }

  function fillTemplate(text, recipient) {
    const r = recipient || {};
    return text
      .replace(/{company}/g,  r.company  || 'Your Company')
      .replace(/{hr_name}/g,  r.name     || 'Hiring Manager')
      .replace(/{position}/g, r.position || 'Software Developer')
      .replace(/{name}/g,     (dom.senderNameInput  && dom.senderNameInput.value)  || 'Your Name')
      .replace(/{phone}/g,    (dom.senderPhoneInput && dom.senderPhoneInput.value) || '+91-XXXXXXXXXX')
      .replace(/{email}/g,    'your-email@gmail.com');
  }

  function buildHtmlBody(templateText, recipient) {
    const filled = fillTemplate(templateText || (dom.templateBody && dom.templateBody.value), recipient);
    if (filled.trim().startsWith('<')) return filled;
    return `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">${filled.replace(/\n/g, '<br>')}</div>`;
  }

  // --- Settings ---
  function setupSettings() {
    if (dom.testSmtpBtn) {
      dom.testSmtpBtn.addEventListener('click', async () => {
        dom.testSmtpBtn.disabled = true;
        try {
          const res = await fetch('/api/test-smtp', { method: 'POST' });
          const data = await res.json();
          if (data.success) {
            toast('success', 'SMTP connection successful!');
            setSmtpOnline(true, '');
          } else {
            throw new Error(data.error || data.details);
          }
        } catch (err) {
          toast('error', 'SMTP test failed: ' + err.message);
          setSmtpOnline(false, '');
        } finally {
          dom.testSmtpBtn.disabled = false;
        }
      });
    }

    if (dom.clearHistoryBtn) {
      dom.clearHistoryBtn.addEventListener('click', async () => {
        try {
          await fetch('/api/clear-history', { method: 'POST' });
          toast('success', 'Search history cleared. You can now re-discover companies.');
        } catch (e) {
          toast('error', 'Failed to clear history.');
        }
      });
    }
  }

  async function checkSmtpStatus() {
    try {
      const res = await fetch('/api/smtp-status');
      const data = await res.json();
      setSmtpOnline(data.configured, data.email || '');
    } catch (e) {
      setSmtpOnline(false, '');
    }
  }

  function setSmtpOnline(online, email) {
    if (dom.smtpDot) dom.smtpDot.className = 'status-dot ' + (online ? 'online' : 'offline');
    if (dom.smtpLabel) dom.smtpLabel.textContent = online ? 'SMTP Ready' : 'SMTP Not Set';
    if (dom.smtpStatusIcon) {
      dom.smtpStatusIcon.className = 'smtp-status-icon ' + (online ? 'ok' : 'err');
      dom.smtpStatusIcon.innerHTML = online
        ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
    }
    if (dom.smtpStatusText)  dom.smtpStatusText.textContent  = online ? 'Connected & Ready' : 'Not Configured';
    if (dom.smtpStatusEmail) dom.smtpStatusEmail.textContent = email || 'Update .env to configure';
  }

  // --- Modal ---
  function setupModal() {
    if (dom.modalClose) {
      dom.modalClose.addEventListener('click', () => { dom.modalOverlay.style.display = 'none'; });
    }
    if (dom.modalOverlay) {
      dom.modalOverlay.addEventListener('click', (e) => {
        if (e.target === dom.modalOverlay) dom.modalOverlay.style.display = 'none';
      });
    }
  }

  // --- Utilities ---
  function showLoading(show) {
    dom.loadingState.style.display = show ? 'block' : 'none';
    if (show) {
      dom.emptyState.style.display = 'none';
      dom.searchBtn.disabled = true;
    } else {
      dom.searchBtn.disabled = false;
    }
  }

  function toast(type, message) {
    const icons = {
      success: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
      error:   '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
      info:    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
    };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `${icons[type] || ''}<span>${message}</span>`;
    dom.toastContainer.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 4000);
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  function timeAgo(dateStr) {
    if (!dateStr) return 'Recent';
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return hours + 'h ago';
    const days = Math.floor(hours / 24);
    return days + 'd ago';
  }

  // --- Boot ---
  document.addEventListener('DOMContentLoaded', init);
})();
