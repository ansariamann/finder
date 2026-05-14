/**
 * Fresher Job Finder - Backend Server
 * Handles job search, email extraction, resume upload, and bulk emailing.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const nodemailer = require('nodemailer');
const axios = require('axios');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── File Upload Config ──────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resume-${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, DOC, and DOCX files are allowed'));
    }
  }
});
// ─── Persistent Store ────────────────────────────────────────
const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, 'utf-8');
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log('Could not load data file, starting fresh:', e.message);
  }
  return { searchHistory: [], sentEmailsLog: [], uploadedResumePath: null, uploadedResumeOriginalName: null };
}

function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify({
      searchHistory,
      sentEmailsLog,
      uploadedResumePath,
      uploadedResumeOriginalName
    }, null, 2));
  } catch (e) {
    console.error('Failed to save data:', e.message);
  }
}

const stored = loadData();
let searchHistory = stored.searchHistory;
let sentEmailsLog = stored.sentEmailsLog;
let uploadedResumePath = stored.uploadedResumePath;
let uploadedResumeOriginalName = stored.uploadedResumeOriginalName;

// ─── SMTP Transporter ────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
}

// ─── Routes ──────────────────────────────────────────────────

/**
 * POST /api/search-jobs
 * Search for fresher jobs in a specific city using multiple real job APIs
 */
app.post('/api/search-jobs', async (req, res) => {
  try {
    const { city, keywords = 'fresher', page = 1 } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    console.log(`\n🔍 Searching jobs: "${keywords}" in "${city}" (page ${page})`);

    // Run ALL sources in parallel for maximum coverage
    const [jsearchJobs, adzunaJobs, remotiveJobs, museJobs, arbeitnowJobs] = await Promise.allSettled([
      fetchJSearchJobs(city, keywords, page),
      fetchAdzunaJobs(city, keywords, page),
      fetchRemotiveJobs(keywords),
      fetchTheMuseJobs(keywords, page),
      fetchArbeitnowJobs(keywords, page)
    ]);

    let allJobs = [
      ...(jsearchJobs.status  === 'fulfilled' ? jsearchJobs.value  : []),
      ...(adzunaJobs.status   === 'fulfilled' ? adzunaJobs.value   : []),
      ...(remotiveJobs.status === 'fulfilled' ? remotiveJobs.value : []),
      ...(museJobs.status     === 'fulfilled' ? museJobs.value     : []),
      ...(arbeitnowJobs.status=== 'fulfilled' ? arbeitnowJobs.value: []),
    ];

    console.log(`📊 Total raw results: ${allJobs.length}`);

    // Deduplicate by apply-link then by company+title combo
    const seenLinks = new Set();
    const seenKeys  = new Set();
    const uniqueJobs = [];
    for (const job of allJobs) {
      const linkKey  = (job.applyLink || '').toLowerCase().trim();
      const comboKey = `${job.company}|${job.title}`.toLowerCase().trim();
      if (linkKey && linkKey !== '#' && seenLinks.has(linkKey)) continue;
      if (seenKeys.has(comboKey)) continue;
      if (linkKey && linkKey !== '#') seenLinks.add(linkKey);
      seenKeys.add(comboKey);
      uniqueJobs.push(job);
    }

    // Sort: newest first
    uniqueJobs.sort((a, b) => new Date(b.posted) - new Date(a.posted));

    // Paginate (30 per page)
    const pageSize = 30;
    const startIdx = (page - 1) * pageSize;
    const pageJobs = uniqueJobs.slice(startIdx, startIdx + pageSize);

    console.log(`✅ Returning ${pageJobs.length} unique jobs (${uniqueJobs.length} total available)`);

    res.json({
      success: true,
      query: `${keywords} jobs in ${city}`,
      total: pageJobs.length,
      totalAvailable: uniqueJobs.length,
      jobs: pageJobs
    });

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Failed to search jobs', details: error.message });
  }
});

/**
 * POST /api/find-email
 * Attempt to find HR email for a company domain
 */
app.post('/api/find-email', async (req, res) => {
  try {
    const { company, domain } = req.body;

    if (!company) {
      return res.status(400).json({ error: 'Company name is required' });
    }

    let emails = [];

    // Try Hunter.io if API key is set
    if (process.env.HUNTER_API_KEY && domain) {
      try {
        const hunterRes = await axios.get('https://api.hunter.io/v2/domain-search', {
          params: {
            domain: domain,
            api_key: process.env.HUNTER_API_KEY,
            department: 'human_resources',
            limit: 5
          },
          timeout: 10000
        });

        if (hunterRes.data && hunterRes.data.data && hunterRes.data.data.emails) {
          emails = hunterRes.data.data.emails.map(e => ({
            email: e.value,
            confidence: e.confidence,
            name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
            position: e.position || 'HR'
          }));
        }
      } catch (hunterErr) {
        console.log('Hunter.io error:', hunterErr.message);
      }
    }

    // Generate HR email patterns if no API results
    if (emails.length === 0 && domain) {
      const cleanDomain = domain.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
      emails = [
        { email: `hr@${cleanDomain}`, confidence: 70, name: 'HR Department', position: 'HR' },
        { email: `careers@${cleanDomain}`, confidence: 65, name: 'Careers', position: 'Recruitment' },
        { email: `recruitment@${cleanDomain}`, confidence: 60, name: 'Recruitment', position: 'Recruitment' },
        { email: `jobs@${cleanDomain}`, confidence: 55, name: 'Jobs', position: 'HR' },
        { email: `info@${cleanDomain}`, confidence: 40, name: 'General', position: 'General' }
      ];
    }

    res.json({ success: true, company, emails });

  } catch (error) {
    console.error('Email finder error:', error);
    res.status(500).json({ error: 'Failed to find emails', details: error.message });
  }
});

/**
 * POST /api/upload-resume
 * Upload resume file
 */
app.post('/api/upload-resume', upload.single('resume'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Remove old resume if exists
    if (uploadedResumePath && fs.existsSync(uploadedResumePath)) {
      fs.unlinkSync(uploadedResumePath);
    }

    uploadedResumePath = req.file.path;
    uploadedResumeOriginalName = req.file.originalname;
    saveData();

    res.json({
      success: true,
      filename: req.file.originalname,
      size: (req.file.size / 1024).toFixed(1) + ' KB',
      path: req.file.path
    });

  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Failed to upload resume', details: error.message });
  }
});

/**
 * GET /api/resume-status
 * Check if a resume is uploaded
 */
app.get('/api/resume-status', (req, res) => {
  res.json({
    uploaded: !!uploadedResumePath && fs.existsSync(uploadedResumePath),
    filename: uploadedResumeOriginalName || null
  });
});

/**
 * POST /api/send-emails
 * Send bulk emails with resume attachment
 */
app.post('/api/send-emails', async (req, res) => {
  try {
    const { recipients, subject, htmlBody, senderName, senderPhone } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }

    if (!subject || !htmlBody) {
      return res.status(400).json({ error: 'Subject and email body are required' });
    }

    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
      return res.status(400).json({
        error: 'SMTP not configured. Please update .env file with your email credentials.'
      });
    }

    const transporter = createTransporter();

    // Verify SMTP connection
    try {
      await transporter.verify();
    } catch (verifyErr) {
      return res.status(400).json({
        error: 'SMTP connection failed. Check your email credentials in .env',
        details: verifyErr.message
      });
    }

    const delay = parseInt(process.env.EMAIL_DELAY_MS || '3000');
    const maxBatch = parseInt(process.env.MAX_EMAILS_PER_BATCH || '50');
    const batch = recipients.slice(0, maxBatch);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batch.length; i++) {
      const recipient = batch[i];

      try {
        const mailOptions = {
          from: `"${senderName || process.env.SENDER_NAME || 'Job Seeker'}" <${process.env.SMTP_USER}>`,
          to: recipient.email,
          subject: subject.replace('{company}', recipient.company || 'Your Company'),
          html: htmlBody
            .replace(/{company}/g, recipient.company || 'Your Company')
            .replace(/{position}/g, recipient.position || 'Fresher Position')
            .replace(/{name}/g, senderName || process.env.SENDER_NAME || 'Applicant')
            .replace(/{phone}/g, senderPhone || process.env.SENDER_PHONE || '')
            .replace(/{email}/g, process.env.SMTP_USER || ''),
          attachments: []
        };

        // Attach resume if uploaded
        if (uploadedResumePath && fs.existsSync(uploadedResumePath)) {
          mailOptions.attachments.push({
            filename: uploadedResumeOriginalName || 'Resume.pdf',
            path: uploadedResumePath
          });
        }

        await transporter.sendMail(mailOptions);
        successCount++;
        results.push({
          email: recipient.email,
          company: recipient.company,
          status: 'sent',
          timestamp: new Date().toISOString()
        });

        sentEmailsLog.push({
          email: recipient.email,
          company: recipient.company,
          subject,
          sentAt: new Date().toISOString(),
          status: 'sent'
        });
        saveData();

      } catch (sendErr) {
        failCount++;
        results.push({
          email: recipient.email,
          company: recipient.company,
          status: 'failed',
          error: sendErr.message
        });
      }

      // Delay between emails to avoid rate limiting
      if (i < batch.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    res.json({
      success: true,
      total: batch.length,
      sent: successCount,
      failed: failCount,
      results
    });

  } catch (error) {
    console.error('Email sending error:', error);
    res.status(500).json({ error: 'Failed to send emails', details: error.message });
  }
});

/**
 * POST /api/test-smtp
 * Test SMTP connection
 */
app.post('/api/test-smtp', async (req, res) => {
  try {
    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
      return res.status(400).json({
        error: 'SMTP not configured. Update your .env file.'
      });
    }

    const transporter = createTransporter();
    await transporter.verify();

    res.json({ success: true, message: 'SMTP connection successful!' });

  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'SMTP connection failed',
      details: error.message
    });
  }
});

/**
 * GET /api/email-log
 * Get sent emails history
 */
app.get('/api/email-log', (req, res) => {
  res.json({ success: true, log: sentEmailsLog });
});

/**
 * POST /api/clear-history
 * Clear search history to allow re-fetching companies
 */
app.post('/api/clear-history', (req, res) => {
  searchHistory = [];
  saveData();
  res.json({ success: true, message: 'Search history cleared' });
});

/**
 * GET /api/smtp-status
 * Check if SMTP is configured
 */
app.get('/api/smtp-status', (req, res) => {
  const configured = process.env.SMTP_USER &&
    process.env.SMTP_USER !== 'your-email@gmail.com' &&
    process.env.SMTP_PASS &&
    process.env.SMTP_PASS !== 'your-app-password';

  res.json({
    configured: !!configured,
    email: configured ? process.env.SMTP_USER : null
  });
});

// ─── Helpers ─────────────────────────────────────────────────

function extractEmailFromDescription(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  if (matches && matches.length > 0) {
    const hrEmail = matches.find(e => /hr|recruit|career|job|talent|hiring/i.test(e));
    return hrEmail || matches[0];
  }
  return null;
}

/**
 * Build a normalised job object from raw JSearch data
 */
function mapJSearchJob(job, city) {
  return {
    id: uuidv4(),
    title: job.job_title || 'N/A',
    company: job.employer_name || 'N/A',
    location: job.job_city
      ? `${job.job_city}, ${job.job_state || ''}`.replace(/, $/, '')
      : city,
    type: job.job_employment_type || 'Full-time',
    posted: job.job_posted_at_datetime_utc || new Date().toISOString(),
    description: (job.job_description || '').substring(0, 400) + '...',
    applyLink: job.job_apply_link || '#',
    companyLogo: job.employer_logo || null,
    salary: job.job_min_salary
      ? `${job.job_salary_currency || '₹'}${job.job_min_salary} – ${job.job_max_salary || 'N/A'}`
      : 'Not disclosed',
    email: extractEmailFromDescription(job.job_description || '') || null,
    companyWebsite: job.employer_website || null,
    source: 'JSearch'
  };
}

/**
 * Single JSearch query helper
 */
async function jsearchQuery(query, page, numPages = '3') {
  const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
    params: {
      query,
      page: String(page),
      num_pages: numPages,
      date_posted: 'month',           // broad window — more results
      employment_types: 'FULLTIME,PARTTIME,INTERN,CONTRACTOR',
    },
    headers: {
      'x-rapidapi-key': process.env.RAPIDAPI_KEY,
      'x-rapidapi-host': 'jsearch.p.rapidapi.com'
    },
    timeout: 20000
  });
  return (response.data && response.data.data) ? response.data.data : [];
}

/**
 * Fetch jobs from JSearch API using MULTIPLE keyword variations in parallel.
 * One RapidAPI key, up to 5 queries × 3 pages = ~150 raw results.
 */
async function fetchJSearchJobs(city, keywords, page) {
  if (!process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY === 'your-rapidapi-key-here') {
    return [];
  }

  // Build varied search queries for maximum coverage
  const baseKeyword = keywords.trim();
  const queries = [
    `${baseKeyword} jobs in ${city}`,
    `fresher developer jobs in ${city}`,
    `junior software engineer jobs in ${city}`,
    `entry level programmer jobs in ${city}`,
    `software trainee jobs in ${city}`,
    `graduate software engineer ${city}`,
    `0 year experience software developer ${city}`,
  ];

  // Run all queries in parallel (fire-and-forget errors)
  const results = await Promise.allSettled(
    queries.map(q => jsearchQuery(q, page))
  );

  const allRaw = results.flatMap(r => r.status === 'fulfilled' ? r.value : []);
  console.log(`  JSearch raw hits: ${allRaw.length} across ${queries.length} queries`);
  return allRaw.map(job => mapJSearchJob(job, city));
}

/**
 * Fetch jobs from Adzuna API (free, 250 calls/month on free tier)
 * Sign up at https://developer.adzuna.com
 */
async function fetchAdzunaJobs(city, keywords, page) {
  const appId  = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || appId === 'your-adzuna-app-id') {
    console.log('Adzuna: no credentials set, skipping.');
    return [];
  }
  try {
    const country = process.env.ADZUNA_COUNTRY || 'in';
    const resp = await axios.get(
      `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
      {
        params: {
          app_id: appId,
          app_key: appKey,
          what: `${keywords} fresher junior`,
          where: city,
          results_per_page: 50,
          max_days_old: 30,
          content_type: 'application/json'
        },
        timeout: 12000
      }
    );
    if (!resp.data || !resp.data.results) return [];
    console.log(`  Adzuna hits: ${resp.data.results.length}`);
    return resp.data.results.map(job => ({
      id: uuidv4(),
      title: job.title || 'N/A',
      company: (job.company && job.company.display_name) || 'N/A',
      location: (job.location && job.location.display_name) || city,
      type: job.contract_time === 'part_time' ? 'Part-time' : 'Full-time',
      posted: job.created || new Date().toISOString(),
      description: (job.description || '').substring(0, 400) + '...',
      applyLink: job.redirect_url || '#',
      companyLogo: null,
      salary: job.salary_min
        ? `₹${Math.round(job.salary_min)} – ₹${Math.round(job.salary_max || job.salary_min)}`
        : 'Not disclosed',
      email: null,
      companyWebsite: null,
      source: 'Adzuna'
    }));
  } catch (err) {
    console.log('Adzuna error:', err.message);
    return [];
  }
}

/**
 * Fetch from Remotive (free, no key, remote tech jobs)
 * Broadened: no strict date filter, multiple category searches
 */
async function fetchRemotiveJobs(keywords) {
  try {
    const searches = [
      `${keywords}`,
      'software developer',
      'software engineer',
      'web developer',
      'backend developer',
      'frontend developer',
    ];
    const results = await Promise.allSettled(
      searches.map(s =>
        axios.get('https://remotive.com/api/remote-jobs', {
          params: { search: s, limit: 50 },
          timeout: 10000
        })
      )
    );
    const allJobs = results.flatMap(r =>
      r.status === 'fulfilled' && r.value.data && r.value.data.jobs
        ? r.value.data.jobs
        : []
    );
    console.log(`  Remotive raw hits: ${allJobs.length}`);
    // Keep jobs from last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return allJobs
      .filter(job => new Date(job.publication_date).getTime() > thirtyDaysAgo)
      .map(job => ({
        id: uuidv4(),
        title: job.title || 'N/A',
        company: job.company_name || 'N/A',
        location: job.candidate_required_location || 'Remote',
        type: job.job_type === 'full_time' ? 'Full-time' : (job.job_type || 'Remote'),
        posted: job.publication_date || new Date().toISOString(),
        description: (job.description || '').replace(/<[^>]+>/g, '').substring(0, 400) + '...',
        applyLink: job.url || '#',
        companyLogo: job.company_logo || null,
        salary: job.salary || 'Not disclosed',
        email: null,
        companyWebsite: null,
        source: 'Remotive'
      }));
  } catch (err) {
    console.log('Remotive error:', err.message);
    return [];
  }
}

/**
 * Fetch from The Muse API — 100% free, no API key needed
 * https://www.themuse.com/developers/api/v2
 * Returns entry-level tech jobs globally
 */
async function fetchTheMuseJobs(keywords, page) {
  try {
    const resp = await axios.get('https://www.themuse.com/api/public/jobs', {
      params: {
        category: 'Software Engineer',
        level: 'Entry Level',
        page: page - 1,   // Muse is 0-indexed
        descended: true
      },
      timeout: 10000
    });
    if (!resp.data || !resp.data.results) return [];
    console.log(`  The Muse hits: ${resp.data.results.length}`);
    return resp.data.results.map(job => ({
      id: uuidv4(),
      title: (job.name || 'N/A'),
      company: (job.company && job.company.name) || 'N/A',
      location: (job.locations && job.locations[0] && job.locations[0].name) || 'Remote',
      type: (job.type) || 'Full-time',
      posted: job.publication_date || new Date().toISOString(),
      description: (job.contents || '').replace(/<[^>]+>/g, '').substring(0, 400) + '...',
      applyLink: job.refs && job.refs.landing_page ? job.refs.landing_page : '#',
      companyLogo: job.company && job.company.refs && job.company.refs.logo_image
        ? job.company.refs.logo_image
        : null,
      salary: 'Not disclosed',
      email: null,
      companyWebsite: null,
      source: 'The Muse'
    }));
  } catch (err) {
    console.log('The Muse error:', err.message);
    return [];
  }
}

/**
 * Fetch from Arbeitnow (free, no key, global remote/EU jobs)
 * https://arbeitnow.com/api/job-board-api
 */
async function fetchArbeitnowJobs(keywords, page) {
  try {
    const resp = await axios.get('https://arbeitnow.com/api/job-board-api', {
      params: { page },
      timeout: 10000
    });
    if (!resp.data || !resp.data.data) return [];
    const kw = keywords.toLowerCase();
    // Filter to tech/software related
    const filtered = resp.data.data.filter(job => {
      const text = `${job.title} ${job.tags ? job.tags.join(' ') : ''}`.toLowerCase();
      return text.includes('software') || text.includes('developer') ||
             text.includes('engineer') || text.includes(kw);
    });
    console.log(`  Arbeitnow hits: ${filtered.length}`);
    return filtered.map(job => ({
      id: uuidv4(),
      title: job.title || 'N/A',
      company: job.company_name || 'N/A',
      location: job.location || 'Remote',
      type: job.remote ? 'Remote' : 'Full-time',
      posted: job.created_at
        ? new Date(job.created_at * 1000).toISOString()
        : new Date().toISOString(),
      description: (job.description || '').replace(/<[^>]+>/g, '').substring(0, 400) + '...',
      applyLink: job.url || '#',
      companyLogo: null,
      salary: 'Not disclosed',
      email: null,
      companyWebsite: null,
      source: 'Arbeitnow'
    }));
  } catch (err) {
    console.log('Arbeitnow error:', err.message);
    return [];
  }
}

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Fresher Job Finder running at http://localhost:${PORT}`);
  console.log(`📧 SMTP: ${process.env.SMTP_USER === 'your-email@gmail.com' ? '❌ Not configured' : '✅ Configured'}`);
  console.log(`🔑 RapidAPI: ${process.env.RAPIDAPI_KEY === 'your-rapidapi-key-here' ? '❌ Not configured (using demo data)' : '✅ Configured'}\n`);
});
