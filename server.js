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

    // ── Filter: keep only fresher-friendly jobs (0–1 yr experience) ──
    const beforeFilter = allJobs.length;
    allJobs = allJobs.filter(isFresherFriendly);
    console.log(`🎯 After fresher filter: ${allJobs.length} (removed ${beforeFilter - allJobs.length} senior/experienced roles)`);

    // ── Filter: keep only jobs matching the searched city ──
    const beforeLocationFilter = allJobs.length;
    allJobs = allJobs.filter(job => isLocationMatch(job.location, city));
    console.log(`📍 After location filter: ${allJobs.length} (removed ${beforeLocationFilter - allJobs.length} jobs from other locations)`);

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
    console.log(`\n📨 Attempting to send ${recipients?.length || 0} emails...`);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: 'No recipients provided' });
    }

    if (!subject || !htmlBody) {
      return res.status(400).json({ error: 'Subject and email body are required' });
    }

    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
      console.log('❌ Error: SMTP_USER is not configured in environment variables.');
      return res.status(400).json({
        error: 'SMTP not configured. Please update .env file with your email credentials.'
      });
    }

    const transporter = createTransporter();

    // Verify SMTP connection
    try {
      await transporter.verify();
      console.log('✅ SMTP connection verified successfully.');
    } catch (verifyErr) {
      console.log('❌ SMTP Verification Failed:', verifyErr.message);
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
    console.log('\n🔌 Testing SMTP connection...');
    if (!process.env.SMTP_USER || process.env.SMTP_USER === 'your-email@gmail.com') {
      console.log('❌ Error: SMTP not configured.');
      return res.status(400).json({
        error: 'SMTP not configured. Update your .env file.'
      });
    }

    const transporter = createTransporter();
    await transporter.verify();

    console.log('✅ SMTP test successful!');
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
 * GET /api/sender-info
 * Return sender name and phone from environment variables
 */
app.get('/api/sender-info', (req, res) => {
  res.json({
    name:  process.env.SENDER_NAME  || '',
    phone: process.env.SENDER_PHONE || '',
    email: process.env.SMTP_USER    || ''
  });
});

/**
 * POST /api/quick-send
 * Accept only a company email. Derive company name from domain,
 * build the HTML body, and fire the email — fully automatic.
 * Body: { companyEmail: string }
 */
app.post('/api/quick-send', async (req, res) => {
  try {
    const { companyEmail, position: requestedPosition } = req.body;
    if (!companyEmail || !companyEmail.includes('@')) {
      return res.status(400).json({ error: 'A valid company email is required.' });
    }

    // Derive company name from domain
    const domain = companyEmail.split('@')[1] || '';
    const skipParts = new Set(['com','co','in','org','net','io','ai','app','dev','tech','gov','edu','uk','us','au']);
    const parts = domain.split('.');
    const namePart = parts.find(p => !skipParts.has(p.toLowerCase())) || parts[0];
    const companyName = namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();

    const position    = (requestedPosition && requestedPosition.trim()) || 'Software Developer';
    const senderName  = process.env.SENDER_NAME  || 'Applicant';
    const senderPhone = process.env.SENDER_PHONE  || '';
    const senderEmail = process.env.SMTP_USER     || '';

    if (!senderEmail || senderEmail === 'your-email@gmail.com') {
      return res.status(400).json({ error: 'SMTP not configured. Please update .env file.' });
    }

    // Build email subject
    const subject = `Application for ${position} Position – ${senderName}`;

    // Build HTML body (inline — no external template file needed server-side)
    const htmlBody = buildApplicationEmail({
      company:  companyName,
      hrName:   'Hiring Manager',
      position,
      name:     senderName,
      phone:    senderPhone,
      email:    senderEmail
    });

    const transporter = createTransporter();
    try { await transporter.verify(); } catch (ve) {
      return res.status(400).json({ error: 'SMTP connection failed.', details: ve.message });
    }

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to:   companyEmail,
      subject,
      html: htmlBody,
      attachments: []
    };

    if (uploadedResumePath && fs.existsSync(uploadedResumePath)) {
      mailOptions.attachments.push({
        filename: uploadedResumeOriginalName || 'Resume.pdf',
        path:     uploadedResumePath
      });
    }

    // Retry logic for transient SMTP errors
    const SERVER_MAX_RETRIES = 2;
    const SERVER_RETRY_DELAYS = [3000, 6000];
    let lastErr = null;

    for (let attempt = 0; attempt <= SERVER_MAX_RETRIES; attempt++) {
      try {
        await transporter.sendMail(mailOptions);
        lastErr = null;
        break; // success
      } catch (sendErr) {
        lastErr = sendErr;
        const isTransient = /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|too many|rate/i.test(sendErr.message);
        if (isTransient && attempt < SERVER_MAX_RETRIES) {
          console.log(`  ⟳ Transient SMTP error for ${companyEmail}, retrying (${attempt + 1}/${SERVER_MAX_RETRIES})...`);
          await new Promise(r => setTimeout(r, SERVER_RETRY_DELAYS[attempt] || 6000));
          continue;
        }
        throw sendErr; // non-transient or retries exhausted
      }
    }

    sentEmailsLog.push({
      email:   companyEmail,
      company: companyName,
      subject,
      sentAt:  new Date().toISOString(),
      status:  'sent'
    });
    saveData();

    console.log(`✅ Quick-sent to ${companyEmail} (${companyName})`);
    res.json({ success: true, company: companyName, email: companyEmail });

  } catch (error) {
    console.error('Quick-send error:', error);
    res.status(500).json({ error: 'Failed to send email', details: error.message });
  }
});

/**
 * Build a professional HTML application email (server-side mirror of the client template)
 */
function buildApplicationEmail({ company, hrName, position, name, phone, email }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Job Application</title>
<style>
  body { margin: 0; padding: 0; background: #f5f5f5; font-family: 'Segoe UI', Arial, sans-serif; }
  .wrap { max-width: 580px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .body { padding: 36px 40px; color: #222222; font-size: 15px; line-height: 1.75; }
  .body p { margin: 0 0 16px; }
  .body a { color: #4f46e5; text-decoration: none; }
  .divider { border: none; border-top: 1px solid #e5e5e5; margin: 28px 0; }
  .sig-name { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
  .sig-line { font-size: 13px; color: #666666; margin: 2px 0; }
  .footer { background: #f9f9f9; padding: 16px 40px; border-top: 1px solid #e5e5e5; font-size: 11px; color: #aaaaaa; text-align: center; }
</style>
</head>
<body>
<div class="wrap">
  <div class="body">
    <p>Dear ${hrName},</p>

    <p>I hope you are doing well. I am writing to express my interest in the <strong>${position}</strong> role at <strong>${company}</strong>. I came across your company and was genuinely impressed by your work — I would love the opportunity to contribute as a fresher.</p>

    <p>I am a recent Computer Science graduate with a solid foundation in programming, data structures, and web development. I am a quick learner, a team player, and I am eager to grow with a company that values innovation and quality.</p>

    <p>I have attached my resume for your review. I would be happy to connect for a quick call at your convenience.</p>

    <p>Thank you for your time and consideration. I look forward to hearing from you.</p>

    <hr class="divider"/>

    <div class="sig-name">${name}</div>
    <div class="sig-line">&#9993; ${email}</div>
    ${phone ? `<div class="sig-line">&#128222; ${phone}</div>` : ''}
  </div>
  <div class="footer">This email was sent as a job application enquiry. If received in error, please disregard.</div>
</div>
</body>
</html>`;
}


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
 * Check if a job's location matches the searched city.
 * - Exact or partial match on city name (case-insensitive).
 * - Also allows "Remote", "India", "Anywhere", "Work from home" through.
 * - Handles common variations like "Bengaluru" / "Bangalore".
 */
function isLocationMatch(jobLocation, searchedCity) {
  if (!jobLocation || !searchedCity) return true; // no data → keep

  const loc  = jobLocation.toLowerCase().trim();
  const city = searchedCity.toLowerCase().trim();

  // Always allow remote / nationwide / unspecified
  if (/\b(remote|anywhere|worldwide|global|india|work\s*from\s*home|wfh|pan\s*india|multiple|various)\b/.test(loc)) {
    return true;
  }

  // Direct substring match (covers "Mumbai, Maharashtra" matching "Mumbai")
  if (loc.includes(city) || city.includes(loc)) return true;

  // Common Indian city aliases
  const cityAliases = {
    'bangalore':  ['bengaluru', 'blr', 'bangalore'],
    'bengaluru':  ['bangalore', 'blr', 'bengaluru'],
    'mumbai':     ['bombay', 'mumbai'],
    'bombay':     ['mumbai', 'bombay'],
    'chennai':    ['madras', 'chennai'],
    'madras':     ['chennai', 'madras'],
    'kolkata':    ['calcutta', 'kolkata'],
    'calcutta':   ['kolkata', 'calcutta'],
    'delhi':      ['new delhi', 'ncr', 'delhi', 'noida', 'gurgaon', 'gurugram', 'faridabad', 'ghaziabad'],
    'ncr':        ['new delhi', 'ncr', 'delhi', 'noida', 'gurgaon', 'gurugram'],
    'noida':      ['ncr', 'delhi', 'noida'],
    'gurgaon':    ['gurugram', 'gurgaon', 'ncr', 'delhi'],
    'gurugram':   ['gurgaon', 'gurugram', 'ncr', 'delhi'],
    'hyderabad':  ['hyderabad', 'hyd'],
    'pune':       ['pune', 'puna'],
    'ahmedabad':  ['ahmedabad', 'amdavad'],
    'thiruvananthapuram': ['trivandrum', 'thiruvananthapuram'],
    'trivandrum': ['thiruvananthapuram', 'trivandrum'],
    'kochi':      ['cochin', 'kochi'],
    'cochin':     ['kochi', 'cochin'],
    'vizag':      ['visakhapatnam', 'vizag'],
    'visakhapatnam': ['vizag', 'visakhapatnam'],
  };

  const aliases = cityAliases[city] || [];
  for (const alias of aliases) {
    if (loc.includes(alias)) return true;
  }

  return false;
}

/**
 * Filter jobs to only those suitable for freshers (0–1 year experience).
 * Strategy:
 *   1. If the title or description explicitly mentions 2+ years required → REJECT.
 *   2. If the title or description says "fresher", "entry level", "0-1", "graduate",
 *      "trainee", "intern", "junior", or no experience mentioned → KEEP.
 */
function isFresherFriendly(job) {
  const text = `${job.title || ''} ${job.description || ''}`.toLowerCase();

  // ── REJECT patterns: explicit 2+ years requirement ──
  // Matches patterns like "2+ years", "3-5 years", "5 years", "minimum 2 years", etc.
  const rejectPatterns = [
    /\b([2-9]|[1-9]\d)\+?\s*(?:to|-|–)?\s*\d*\s*(?:years?|yrs?)\b/,           // "2+ years", "3-5 years", "5 years"
    /\b(?:minimum|min|at\s*least)\s*(?:of\s+)?([2-9]|[1-9]\d)\s*(?:years?|yrs?)\b/, // "minimum 2 years"
    /\bexperience\s*(?:of\s+)?([2-9]|[1-9]\d)\s*(?:years?|yrs?)\b/,            // "experience of 3 years"
    /\b([2-9]|[1-9]\d)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)\b/,    // "3 years of experience"
    /\bsenior\b/,                                                               // "Senior" roles
    /\blead\b/,                                                                 // "Lead" roles
    /\bstaff\b/,                                                                // "Staff" roles
    /\bprincipal\b/,                                                            // "Principal" roles
    /\barchitect\b/,                                                            // "Architect" roles
    /\bdirector\b/,                                                             // "Director" roles
    /\bmanager\b.*\bengineering\b/,                                             // "Engineering Manager"
    /\bvp\b/,                                                                   // VP roles
  ];

  for (const pat of rejectPatterns) {
    if (pat.test(text)) {
      // Exception: if job title itself says "fresher" or "entry" or "junior", keep it
      const title = (job.title || '').toLowerCase();
      if (/fresher|entry.?level|junior|trainee|intern|graduate|apprentice/i.test(title)) {
        return true;
      }
      return false;
    }
  }

  // ── ACCEPT patterns: explicitly fresher-friendly ──
  const acceptPatterns = [
    /\bfresher/,
    /\bentry[\s-]?level/,
    /\bjunior\b/,
    /\btrainee\b/,
    /\bintern\b/,
    /\bgraduate\b/,
    /\bapprentice\b/,
    /\b0\s*(?:to|-|–)\s*1\s*(?:years?|yrs?)\b/,   // "0-1 years"
    /\b0\s*(?:to|-|–)\s*2\s*(?:years?|yrs?)\b/,   // "0-2 years" (still fresher-friendly)
    /\b1\s*(?:to|-|–)\s*2\s*(?:years?|yrs?)\b/,   // "1-2 years" (still ok for freshers)
    /\bno\s+(?:prior\s+)?experience\s+(?:required|needed|necessary)\b/,
    /\b(?:0|zero|nil)\s*(?:years?|yrs?)\s*(?:experience|exp)\b/,
    /\b1\s*(?:years?|yrs?)\s*(?:experience|exp)\b/, // "1 year experience"
    /\bexperience\s*(?::|-)\s*(?:0|1)\b/,
  ];

  for (const pat of acceptPatterns) {
    if (pat.test(text)) return true;
  }

  // No experience mentioned at all → assume it could be fresher-friendly, KEEP
  const mentionsExperience = /\b(?:experience|years?|yrs?)\b/.test(text);
  if (!mentionsExperience) return true;

  // Mentions experience but no specific number → keep (benefit of the doubt)
  const mentionsSpecificYears = /\b\d+\s*\+?\s*(?:years?|yrs?)\b/.test(text);
  if (!mentionsSpecificYears) return true;

  return false;
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
      date_posted: 'month',
      employment_types: 'FULLTIME,PARTTIME,INTERN,CONTRACTOR',
      job_requirements: 'no_experience,under_3_years_experience,no_degree',
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
 * Optimised for fresher / 0–1 year experience roles.
 */
async function fetchJSearchJobs(city, keywords, page) {
  if (!process.env.RAPIDAPI_KEY || process.env.RAPIDAPI_KEY === 'your-rapidapi-key-here') {
    return [];
  }

  // Build varied search queries targeting 0–1 year / fresher roles
  const baseKeyword = keywords.trim();
  const queries = [
    `${baseKeyword} jobs in ${city}`,
    `fresher developer jobs in ${city}`,
    `fresher software engineer jobs in ${city}`,
    `junior software engineer jobs in ${city}`,
    `entry level developer jobs in ${city}`,
    `0-1 years experience developer ${city}`,
    `software trainee jobs in ${city}`,
    `graduate software engineer ${city}`,
    `fresher IT jobs in ${city}`,
    `intern developer jobs in ${city}`,
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
          what: `${keywords} fresher junior entry level trainee 0-1 years`,
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
