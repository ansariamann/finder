/**
 * JobReach — Main Application Logic
 */
(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────
  const state = {
    jobs: [],
    selectedJobs: new Set(),
    recipients: [],
    currentCity: '',
    currentKeywords: 'fresher',
    currentPage: 1,
    emailTemplate: window.DEFAULT_EMAIL_TEMPLATE || '',
    resumeUploaded: false,
    resumeName: ''
  };

  // ─── DOM Cache ───────────────────────────────────────────
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
    recipientsList: $('#recipients-list'),
    recipientCount: $('#recipient-count'),
    bulkActions: $('#bulk-actions'),
    clearRecipientsBtn: $('#clear-recipients-btn'),
    sendAllBtn: $('#send-all-btn'),
    sendCount: $('#send-count'),
    resumeInput: $('#resume-input'),
    browseBtn: $('#browse-btn'),
    uploadArea: $('#upload-area'),
    uploadSuccess: $('#upload-success'),
    resumeNameEl: $('#resume-name'),
    resumeSizeEl: $('#resume-size'),
    removeResumeBtn: $('#remove-resume-btn'),
    emailSubject: $('#email-subject'),
    senderNameInput: $('#sender-name-input'),
    senderPhoneInput: $('#sender-phone-input'),
    tabVisual: $('#tab-visual'),
    tabCode: $('#tab-code'),
    templatePreview: $('#template-preview'),
    templateCode: $('#template-code'),
    resetTemplateBtn: $('#reset-template-btn'),
    previewEmailBtn: $('#preview-email-btn'),
    sendingProgress: $('#sending-progress'),
    progressBar: $('#progress-bar'),
    progressSubtitle: $('#progress-subtitle'),
    progSent: $('#prog-sent'),
    progFailed: $('#prog-failed'),
    progTotal: $('#prog-total'),
    progressLog: $('#progress-log'),
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

  // ─── Init ────────────────────────────────────────────────
  function init() {
    lucide.createIcons();
    setupNavTabs();
    setupSearch();
    setupJobSelection();
    setupOutreach();
    setupResumeUpload();
    setupEmailTemplate();
    setupSettings();
    setupModal();
    checkSmtpStatus();
    checkResumeStatus();
  }

  // ─── Navigation Tabs ────────────────────────────────────
  function setupNavTabs() {
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        $$('.nav-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $$('.tab-panel').forEach(p => p.classList.remove('active'));
        $(`#panel-${tab}`).classList.add('active');
        lucide.createIcons();
      });
    });
  }

  // ─── Search ──────────────────────────────────────────────
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
        dom.resultsTitle.textContent = `Jobs in ${state.currentCity} — ${state.jobs.length} found`;
        toast('success', `Found ${data.jobs.length} new companies!`);
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
        : `<p class="job-no-email">No email found — click to find</p>`;

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

      card.addEventListener('click', () => toggleJobSelection(job.id));
      fragment.appendChild(card);
    });

    if (!append) dom.jobsGrid.innerHTML = '';
    dom.jobsGrid.appendChild(fragment);
  }

  // ─── Job Selection ───────────────────────────────────────
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

    dom.addToOutreachBtn.addEventListener('click', () => {
      let added = 0;
      state.jobs.filter(j => state.selectedJobs.has(j.id) && j.email).forEach(job => {
        const exists = state.recipients.find(r => r.email === job.email);
        if (!exists) {
          state.recipients.push({
            company: job.company,
            email: job.email,
            position: job.title
          });
          added++;
        }
      });
      renderRecipients();
      toast('success', `Added ${added} contacts to outreach list.`);

      // Switch to outreach tab
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      $('#nav-outreach').classList.add('active');
      $$('.tab-panel').forEach(p => p.classList.remove('active'));
      $('#panel-outreach').classList.add('active');
      lucide.createIcons();
    });
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

  // ─── Outreach / Recipients ──────────────────────────────
  function setupOutreach() {
    dom.clearRecipientsBtn.addEventListener('click', () => {
      state.recipients = [];
      renderRecipients();
      toast('info', 'Recipient list cleared.');
    });

    dom.sendAllBtn.addEventListener('click', () => sendBulkEmails());
  }

  function renderRecipients() {
    if (state.recipients.length === 0) {
      dom.recipientsList.innerHTML = `
        <div class="empty-recipients">
          <i data-lucide="inbox"></i>
          <p>No contacts yet</p>
          <span>Search for jobs and add companies here</span>
        </div>`;
      dom.bulkActions.style.display = 'none';
      dom.recipientCount.textContent = '0 contacts added';
      lucide.createIcons();
      return;
    }

    dom.recipientCount.textContent = `${state.recipients.length} contacts added`;
    dom.sendCount.textContent = state.recipients.length;
    dom.bulkActions.style.display = 'flex';

    let html = '';
    state.recipients.forEach((r, i) => {
      const initials = r.company.substring(0, 2).toUpperCase();
      html += `
        <div class="recipient-item" data-index="${i}">
          <div class="recipient-avatar">${initials}</div>
          <div class="recipient-info">
            <strong>${esc(r.company)}</strong>
            <small>${esc(r.email)}</small>
          </div>
          <button class="btn-icon recipient-remove" data-index="${i}" title="Remove">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>`;
    });
    dom.recipientsList.innerHTML = html;

    dom.recipientsList.querySelectorAll('.recipient-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        state.recipients.splice(parseInt(btn.dataset.index), 1);
        renderRecipients();
      });
    });
  }

  // ─── Resume Upload ───────────────────────────────────────
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

  // ─── Email Template ──────────────────────────────────────
  function setupEmailTemplate() {
    state.emailTemplate = window.DEFAULT_EMAIL_TEMPLATE || '';
    dom.templateCode.value = state.emailTemplate;
    renderTemplatePreview();

    dom.tabVisual.addEventListener('click', () => {
      dom.tabVisual.classList.add('active');
      dom.tabCode.classList.remove('active');
      dom.templatePreview.style.display = '';
      dom.templateCode.style.display = 'none';
      state.emailTemplate = dom.templateCode.value;
      renderTemplatePreview();
    });

    dom.tabCode.addEventListener('click', () => {
      dom.tabCode.classList.add('active');
      dom.tabVisual.classList.remove('active');
      dom.templateCode.style.display = '';
      dom.templatePreview.style.display = 'none';
    });

    dom.templateCode.addEventListener('input', () => {
      state.emailTemplate = dom.templateCode.value;
    });

    dom.resetTemplateBtn.addEventListener('click', () => {
      state.emailTemplate = window.DEFAULT_EMAIL_TEMPLATE || '';
      dom.templateCode.value = state.emailTemplate;
      renderTemplatePreview();
      toast('info', 'Template reset to default.');
    });

    dom.previewEmailBtn.addEventListener('click', () => {
      const html = fillTemplate(state.emailTemplate);
      dom.modalBody.innerHTML = html;
      dom.modalOverlay.style.display = 'flex';
    });
  }

  function renderTemplatePreview() {
    dom.templatePreview.innerHTML = fillTemplate(state.emailTemplate);
  }

  function fillTemplate(html) {
    return html
      .replace(/{company}/g, 'Acme Corp')
      .replace(/{position}/g, 'Software Engineer - Fresher')
      .replace(/{name}/g, dom.senderNameInput.value || 'Your Name')
      .replace(/{phone}/g, dom.senderPhoneInput.value || '+91-XXXXXXXXXX')
      .replace(/{email}/g, 'your-email@gmail.com');
  }

  // ─── Bulk Email Sending ──────────────────────────────────
  async function sendBulkEmails() {
    if (state.recipients.length === 0) {
      toast('error', 'No recipients to send to.');
      return;
    }

    if (!dom.senderNameInput.value.trim()) {
      toast('error', 'Please enter your name in the Outreach tab.');
      return;
    }

    const subject = dom.emailSubject.value.trim();
    if (!subject) {
      toast('error', 'Please enter an email subject.');
      return;
    }

    // Show progress
    dom.sendingProgress.style.display = 'block';
    dom.progressBar.style.width = '0%';
    dom.progSent.textContent = '0';
    dom.progFailed.textContent = '0';
    dom.progTotal.textContent = state.recipients.length;
    dom.progressLog.innerHTML = '';
    dom.progressSubtitle.textContent = 'Sending emails...';
    dom.sendAllBtn.disabled = true;

    try {
      const res = await fetch('/api/send-emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipients: state.recipients,
          subject: subject,
          htmlBody: dom.templateCode.value || state.emailTemplate,
          senderName: dom.senderNameInput.value.trim(),
          senderPhone: dom.senderPhoneInput.value.trim()
        })
      });

      const data = await res.json();

      if (!res.ok) throw new Error(data.error);

      dom.progressBar.style.width = '100%';
      dom.progSent.textContent = data.sent;
      dom.progFailed.textContent = data.failed;
      dom.progressSubtitle.textContent = `Done! ${data.sent} sent, ${data.failed} failed.`;

      if (data.results) {
        data.results.forEach(r => {
          const cls = r.status === 'sent' ? 'success' : 'error';
          const icon = r.status === 'sent' ? '✓' : '✗';
          dom.progressLog.innerHTML += `<div class="log-entry ${cls}">${icon} ${esc(r.company)} — ${esc(r.email)} — ${r.status}${r.error ? ': ' + esc(r.error) : ''}</div>`;
        });
      }

      toast('success', `Emails sent: ${data.sent}/${data.total}`);
    } catch (err) {
      dom.progressSubtitle.textContent = 'Error: ' + err.message;
      toast('error', err.message);
    } finally {
      dom.sendAllBtn.disabled = false;
    }
  }

  // ─── Settings ────────────────────────────────────────────
  function setupSettings() {
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

    dom.clearHistoryBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/clear-history', { method: 'POST' });
        toast('success', 'Search history cleared. You can now re-discover companies.');
      } catch (e) {
        toast('error', 'Failed to clear history.');
      }
    });
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
    dom.smtpDot.className = 'status-dot ' + (online ? 'online' : 'offline');
    dom.smtpLabel.textContent = online ? 'SMTP Ready' : 'SMTP Not Set';
    dom.smtpStatusIcon.className = 'smtp-status-icon ' + (online ? 'ok' : 'err');
    dom.smtpStatusIcon.innerHTML = online
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>';
    dom.smtpStatusText.textContent = online ? 'Connected & Ready' : 'Not Configured';
    dom.smtpStatusEmail.textContent = email || 'Update .env to configure';
  }

  // ─── Modal ───────────────────────────────────────────────
  function setupModal() {
    dom.modalClose.addEventListener('click', () => { dom.modalOverlay.style.display = 'none'; });
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) dom.modalOverlay.style.display = 'none';
    });
  }

  // ─── Utilities ───────────────────────────────────────────
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
      error: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>',
      info: '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>'
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

  // ─── Boot ────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', init);
})();
