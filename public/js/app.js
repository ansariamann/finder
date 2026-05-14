/**
 * JobReach â€” Main Application Logic
 */
(function () {
  'use strict';

  // â”€â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ DOM Cache â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    templateBody: $('#template-body'),
    resetTemplateBtn: $('#reset-template-btn'),
    previewEmailBtn: $('#preview-email-btn'),
    // manual add
    addName: $('#add-name'),
    addEmail: $('#add-email'),
    addCompany: $('#add-company'),
    addRecipientBtn: $('#add-recipient-btn'),
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

  // â”€â”€â”€ Init â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Navigation Tabs â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setupNavTabs() {
    function switchTab(tab) {
      // top nav
      $$('.nav-btn').forEach(b => b.classList.remove('active'));
      const topBtn = $(`[data-tab="${tab}"].nav-btn`);
      if (topBtn) topBtn.classList.add('active');
      // bottom nav
      $$('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
      const botBtn = $(`[data-tab="${tab}"].bottom-nav-btn`);
      if (botBtn) botBtn.classList.add('active');
      // panels
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

  // â”€â”€â”€ Search â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
        dom.resultsTitle.textContent = `Jobs in ${state.currentCity} â€” ${state.jobs.length} shown of ${totalAvail} found`;
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
        : `<p class="job-no-email">No email found â€” click to find</p>`;

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

  // â”€â”€â”€ Job Selection â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Outreach / Recipients â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setupOutreach() {
    // Manual add
    dom.addRecipientBtn.addEventListener('click', () => {
      const email   = dom.addEmail.value.trim();
      const company = dom.addCompany.value.trim();
      const name    = dom.addName.value.trim();

      if (!email || !company) {
        toast('error', 'Email and company name are required.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        toast('error', 'Please enter a valid email address.');
        return;
      }
      if (state.recipients.find(r => r.email === email)) {
        toast('info', 'This email is already in the list.');
        return;
      }
      state.recipients.push({ email, company, name: name || 'HR Team', position: 'Software Developer' });
      dom.addEmail.value   = '';
      dom.addCompany.value = '';
      dom.addName.value    = '';
      renderRecipients();
      toast('success', `Added ${company} to outreach list.`);
    });

    // Allow pressing Enter in email field to add
    dom.addEmail.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); dom.addRecipientBtn.click(); }
    });

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
          <span>Add manually above or from job search results</span>
        </div>`;
      dom.bulkActions.style.display = 'none';
      dom.recipientCount.textContent = '0 contacts';
      lucide.createIcons();
      return;
    }

    dom.recipientCount.textContent = `${state.recipients.length} contact${state.recipients.length > 1 ? 's' : ''}`;
    dom.sendCount.textContent = state.recipients.length;
    dom.bulkActions.style.display = 'flex';

    let html = '';
    state.recipients.forEach((r, i) => {
      const initials = r.company.substring(0, 2).toUpperCase();
      html += `
        <div class="recipient-item" data-index="${i}" id="recipient-row-${i}">
          <div class="recipient-avatar">${initials}</div>
          <div class="recipient-info">
            <strong>${esc(r.company)}</strong>
            <small>${esc(r.email)}</small>
          </div>
          <span class="recipient-status" id="rstat-${i}"></span>
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

  // â”€â”€â”€ Resume Upload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Email Template â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const DEFAULT_TEMPLATE =
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
    dom.templateBody.value = DEFAULT_TEMPLATE;

    dom.resetTemplateBtn.addEventListener('click', () => {
      dom.templateBody.value = DEFAULT_TEMPLATE;
      toast('info', 'Template reset to default.');
    });

    dom.previewEmailBtn.addEventListener('click', () => {
      const filled = fillTemplate(dom.templateBody.value);
      // Convert plain text to HTML for preview
      dom.modalBody.innerHTML = `<pre style="white-space:pre-wrap;font-family:inherit;font-size:14px;line-height:1.7;">${esc(filled)}</pre>`;
      dom.modalOverlay.style.display = 'flex';
    });
  }

  function fillTemplate(text, recipient) {
    const r = recipient || {};
    return text
      .replace(/{company}/g,  r.company  || 'Your Company')
      .replace(/{hr_name}/g,  r.name     || 'Hiring Manager')
      .replace(/{position}/g, r.position || 'Software Developer')
      .replace(/{name}/g,     dom.senderNameInput.value  || 'Your Name')
      .replace(/{phone}/g,    dom.senderPhoneInput.value || '+91-XXXXXXXXXX')
      .replace(/{email}/g,    'your-email@gmail.com');
  }

  // â”€â”€â”€ Bulk Email Sending â€” one email per recipient â”€â”€â”€â”€â”€â”€â”€â”€
  async function sendBulkEmails() {
    if (state.recipients.length === 0) {
      toast('error', 'No recipients to send to.');
      return;
    }
    if (!dom.senderNameInput.value.trim()) {
      toast('error', 'Please enter your name in the template section.');
      return;
    }
    const subject = dom.emailSubject.value.trim();
    if (!subject) {
      toast('error', 'Please enter an email subject.');
      return;
    }

    const total = state.recipients.length;
    let sent = 0, failed = 0;

    dom.sendingProgress.style.display = 'block';
    dom.progressBar.style.width = '0%';
    dom.progSent.textContent   = '0';
    dom.progFailed.textContent = '0';
    dom.progTotal.textContent  = total;
    dom.progressLog.innerHTML  = '';
    dom.progressSubtitle.textContent = `Sending 1 of ${total}...`;
    dom.sendAllBtn.disabled = true;

    for (let i = 0; i < state.recipients.length; i++) {
      const r = state.recipients[i];
      const rstatEl = document.getElementById(`rstat-${i}`);

      // Mark sending
      if (rstatEl) { rstatEl.textContent = 'â³'; rstatEl.className = 'recipient-status sending'; }
      dom.progressSubtitle.textContent = `Sending ${i + 1} of ${total}: ${r.company}...`;

      // Build individual plain-text body, convert newlines to <br> for email
      const plainBody = fillTemplate(dom.templateBody.value, r);
      const htmlBody  = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.8;color:#222;max-width:600px;">${plainBody.replace(/\n/g, '<br>')}</div>`;
      const subjectFilled = subject
        .replace(/{company}/g,  r.company  || 'Your Company')
        .replace(/{name}/g,     dom.senderNameInput.value || 'Applicant')
        .replace(/{hr_name}/g,  r.name     || 'Hiring Manager');

      try {
        const res = await fetch('/api/send-emails', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            recipients: [r],          // ONE recipient at a time
            subject: subjectFilled,
            htmlBody,
            senderName:  dom.senderNameInput.value.trim(),
            senderPhone: dom.senderPhoneInput.value.trim()
          })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error);

        const result = data.results && data.results[0];
        if (result && result.status === 'sent') {
          sent++;
          if (rstatEl) { rstatEl.textContent = 'âœ“ Sent'; rstatEl.className = 'recipient-status ok'; }
          dom.progressLog.innerHTML += `<div class="log-entry success">âœ“ ${esc(r.company)} â€” ${esc(r.email)}</div>`;
        } else {
          throw new Error(result ? result.error : 'Unknown error');
        }
      } catch (err) {
        failed++;
        if (rstatEl) { rstatEl.textContent = 'âœ— Failed'; rstatEl.className = 'recipient-status err'; }
        dom.progressLog.innerHTML += `<div class="log-entry error">âœ— ${esc(r.company)} â€” ${esc(r.email)}: ${esc(err.message)}</div>`;
      }

      dom.progSent.textContent   = sent;
      dom.progFailed.textContent = failed;
      dom.progressBar.style.width = `${Math.round(((i + 1) / total) * 100)}%`;
      dom.progressLog.scrollTop   = dom.progressLog.scrollHeight;
    }

    dom.progressSubtitle.textContent = `Done! ${sent} sent, ${failed} failed.`;
    dom.sendAllBtn.disabled = false;
    toast(failed === 0 ? 'success' : 'info', `Emails sent: ${sent}/${total}`);
  }

  // â”€â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
    dom.smtpStatusText.textContent  = online ? 'Connected & Ready' : 'Not Configured';
    dom.smtpStatusEmail.textContent = email || 'Update .env to configure';
  }

  // â”€â”€â”€ Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  function setupModal() {
    dom.modalClose.addEventListener('click', () => { dom.modalOverlay.style.display = 'none'; });
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) dom.modalOverlay.style.display = 'none';
    });
  }

  // â”€â”€â”€ Utilities â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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

  // â”€â”€â”€ Boot â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  document.addEventListener('DOMContentLoaded', init);
})();
