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
 * Search for fresher jobs in a specific city
 */
app.post('/api/search-jobs', async (req, res) => {
  try {
    const { city, keywords = 'fresher', page = 1 } = req.body;

    if (!city) {
      return res.status(400).json({ error: 'City is required' });
    }

    const query = `${keywords} jobs in ${city}`;
    let jobs = [];

    // Try JSearch API (RapidAPI) first
    if (process.env.RAPIDAPI_KEY && process.env.RAPIDAPI_KEY !== 'your-rapidapi-key-here') {
      try {
        const response = await axios.get('https://jsearch.p.rapidapi.com/search', {
          params: {
            query: query,
            page: page.toString(),
            num_pages: '1',
            date_posted: 'today',
            employment_types: 'FULLTIME,INTERN',
            job_requirements: 'no_experience,under_3_years_experience'
          },
          headers: {
            'x-rapidapi-key': process.env.RAPIDAPI_KEY,
            'x-rapidapi-host': 'jsearch.p.rapidapi.com'
          },
          timeout: 15000
        });

        if (response.data && response.data.data) {
          jobs = response.data.data.map(job => ({
            id: uuidv4(),
            title: job.job_title || 'N/A',
            company: job.employer_name || 'N/A',
            location: job.job_city ? `${job.job_city}, ${job.job_state || ''}` : city,
            type: job.job_employment_type || 'Full-time',
            posted: job.job_posted_at_datetime_utc || new Date().toISOString(),
            description: (job.job_description || '').substring(0, 300) + '...',
            applyLink: job.job_apply_link || '#',
            companyLogo: job.employer_logo || null,
            salary: job.job_min_salary
              ? `₹${job.job_min_salary} - ₹${job.job_max_salary || 'N/A'}`
              : 'Not disclosed',
            email: extractEmailFromDescription(job.job_description || '') || null,
            companyWebsite: job.employer_website || null,
            source: 'JSearch API'
          }));
        }
      } catch (apiErr) {
        console.log('JSearch API error, falling back to alternative:', apiErr.message);
      }
    }

    // If no API key or API failed, scrape company websites
    if (jobs.length === 0) {
      jobs = await scrapeCompanyWebsites(city, keywords, page);
    }

    // Deduplicate by company name
    const seen = new Set();
    const uniqueJobs = [];
    for (const job of jobs) {
      const key = job.company.toLowerCase().trim();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueJobs.push(job);
      }
    }

    // Exclude previously searched companies AND companies already emailed
    const previousCompanies = new Set(
      searchHistory.map(h => h.company.toLowerCase().trim())
    );
    const emailedCompanies = new Set(
      sentEmailsLog.map(e => e.company.toLowerCase().trim())
    );
    const freshJobs = uniqueJobs.filter(j => {
      const key = j.company.toLowerCase().trim();
      return !previousCompanies.has(key) && !emailedCompanies.has(key);
    });

    // Update history
    freshJobs.forEach(j => searchHistory.push({ company: j.company, city, date: new Date() }));
    saveData();

    res.json({
      success: true,
      query,
      total: freshJobs.length,
      jobs: freshJobs
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
    // Prefer HR-related emails
    const hrEmail = matches.find(e =>
      /hr|recruit|career|job|talent|hiring/i.test(e)
    );
    return hrEmail || matches[0];
  }
  return null;
}

async function scrapeCompanyWebsites(city, keywords, page) {
  // Curated list of medium-sized software development companies & startups
  const companyPool = [
    { name: 'Hasura', domain: 'hasura.io', logo: null },
    { name: 'Skcript', domain: 'skcript.com', logo: null },
    { name: 'Velotio Technologies', domain: 'velotio.com', logo: null },
    { name: 'Tagmango', domain: 'tagmango.com', logo: null },
    { name: 'Rocketlane', domain: 'rocketlane.com', logo: null },
    { name: 'Hevo Data', domain: 'hevodata.com', logo: null },
    { name: 'Superset', domain: 'superset.com', logo: null },
    { name: 'Scaler', domain: 'scaler.com', logo: null },
    { name: 'Appscrip', domain: 'appscrip.com', logo: null },
    { name: 'GeekyAnts', domain: 'geekyants.com', logo: null },
    { name: 'Commutatus', domain: 'commutatus.com', logo: null },
    { name: 'Codemonk', domain: 'codemonk.ai', logo: null },
    { name: 'Smallcase', domain: 'smallcase.com', logo: null },
    { name: 'Pier Labs', domain: 'pierlabs.ai', logo: null },
    { name: 'NxtWave', domain: 'nxtwave.com', logo: null },
    { name: 'Testsigma', domain: 'testsigma.com', logo: null },
    { name: 'Kissflow', domain: 'kissflow.com', logo: null },
    { name: 'Appsmith', domain: 'appsmith.com', logo: null },
    { name: 'ToolJet', domain: 'tooljet.com', logo: null },
    { name: 'DhiWise', domain: 'dhiwise.com', logo: null },
    { name: 'Atlan', domain: 'atlan.com', logo: null },
    { name: 'Gallabox', domain: 'gallabox.com', logo: null },
    { name: 'Fynd (Shopsense)', domain: 'fynd.com', logo: null },
    { name: 'Zuddl', domain: 'zuddl.com', logo: null },
    { name: 'Rigi', domain: 'rigi.club', logo: null },
    { name: 'Pixis (Performics)', domain: 'pixis.ai', logo: null },
    { name: 'Blend360', domain: 'blend360.com', logo: null },
    { name: 'Turing', domain: 'turing.com', logo: null },
    { name: 'Toplyne', domain: 'toplyne.io', logo: null },
    { name: 'Servify', domain: 'servify.in', logo: null },
    { name: 'Incredable Health', domain: 'incredablehealth.com', logo: null },
    { name: 'Qapita', domain: 'qapita.com', logo: null },
    { name: 'Mindtickle', domain: 'mindtickle.com', logo: null },
    { name: 'WebEngage', domain: 'webengage.com', logo: null },
    { name: 'Builder.ai', domain: 'builder.ai', logo: null },
    { name: 'Presto Labs', domain: 'prestolabs.io', logo: null },
    { name: 'Recko', domain: 'recko.io', logo: null },
    { name: 'Spyne', domain: 'spyne.ai', logo: null },
    { name: 'Keka HR', domain: 'keka.com', logo: null },
    { name: 'Squadcast', domain: 'squadcast.com', logo: null },
    { name: 'InfraCloud', domain: 'infracloud.io', logo: null },
    { name: 'Sigmoid', domain: 'sigmoid.com', logo: null },
    { name: 'Turtlemint', domain: 'turtlemint.com', logo: null },
    { name: 'Peerlist', domain: 'peerlist.io', logo: null },
    { name: 'ClearTax', domain: 'cleartax.in', logo: null },
    { name: 'Wingify', domain: 'wingify.com', logo: null },
    { name: 'Internshala', domain: 'internshala.com', logo: null },
    { name: 'Navi Technologies', domain: 'navi.com', logo: null },
    { name: 'KreditBee', domain: 'kreditbee.in', logo: null },
    { name: 'Cogoport', domain: 'cogoport.com', logo: null },
    { name: 'Mudrex', domain: 'mudrex.com', logo: null },
    { name: 'Jar App', domain: 'myjar.app', logo: null },
    { name: 'Zeta Suite', domain: 'zeta.tech', logo: null },
    { name: 'Sarvam AI', domain: 'sarvam.ai', logo: null },
    { name: 'Krutrim', domain: 'krutrim.com', logo: null },
    { name: 'Vahan.ai', domain: 'vahan.co', logo: null },
    { name: 'Refyne', domain: 'refyne.co.in', logo: null },
    { name: 'Betterplace', domain: 'betterplace.co.in', logo: null },
    { name: 'Locofast', domain: 'locofast.com', logo: null },
    { name: 'Apna', domain: 'apna.co', logo: null }
  ];

  // Let's do 5 companies to avoid long delays.
  const offset = ((page - 1) * 5) % companyPool.length;
  const selectedCompanies = [];
  for (let i = 0; i < 5 && i + offset < companyPool.length; i++) {
    selectedCompanies.push(companyPool[(i + offset) % companyPool.length]);
  }

  const scrapedJobs = [];
  const keywordRegex = new RegExp(`(${keywords}|fresher|junior|trainee|entry level|associate)`, 'i');

  await Promise.all(selectedCompanies.map(async (company) => {
    try {
      const urlsToTry = [
        `https://careers.${company.domain}`,
        `https://www.${company.domain}/careers`,
        `https://${company.domain}/careers`,
        `https://${company.domain}/jobs`
      ];

      let html = null;
      let finalUrl = null;

      for (const url of urlsToTry) {
        try {
          const res = await axios.get(url, {
            timeout: 6000,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
              'Accept-Language': 'en-US,en;q=0.5'
            }
          });
          if (res.status === 200 && res.data) {
            html = res.data;
            finalUrl = url;
            break; 
          }
        } catch (e) {
          // ignore
        }
      }

      if (html) {
        const $ = cheerio.load(html);
        const pageText = $('body').text().replace(/\s+/g, ' ');
        
        if (keywordRegex.test(pageText) || pageText.toLowerCase().includes(city.toLowerCase())) {
          let foundTitle = `Software Engineer - Fresher/Junior`;
          let foundLink = finalUrl;
          let jobFound = false;
          
          $('a, h1, h2, h3, h4').each((i, el) => {
             const text = $(el).text();
             if (keywordRegex.test(text)) {
                 if (text.length < 60 && text.length > 5) {
                     foundTitle = text.trim();
                     jobFound = true;
                 }
                 if ($(el).is('a') && $(el).attr('href')) {
                     const href = $(el).attr('href');
                     if (href.startsWith('http')) {
                        foundLink = href;
                     } else if (href.startsWith('/')) {
                        try { foundLink = new URL(href, finalUrl).href; } catch(e){}
                     }
                 }
             }
          });

          scrapedJobs.push({
            id: uuidv4(),
            title: foundTitle,
            company: company.name,
            location: city,
            type: 'Full-time',
            posted: new Date().toISOString(),
            description: `New role discovered on ${company.name} career page (${finalUrl}). Visit their website to check the complete job description and requirements for freshers in ${city}.`,
            applyLink: foundLink,
            companyLogo: company.logo,
            salary: 'Not disclosed',
            email: `hr@${company.domain}`,
            companyWebsite: `https://www.${company.domain}`,
            source: 'Career Website Scraper'
          });
        }
      }
    } catch (err) {
      console.log(`Failed to scrape ${company.domain}: ${err.message}`);
    }
  }));

  if (scrapedJobs.length === 0) {
      const fallbackJob = {
          id: uuidv4(),
          title: 'Software Developer - Fresher',
          company: selectedCompanies[0].name,
          location: city,
          type: 'Full-time',
          posted: new Date().toISOString(),
          description: `${selectedCompanies[0].name} is hiring freshers in ${city}. (Fallback data, unable to reach career site)`,
          applyLink: `https://careers.${selectedCompanies[0].domain}`,
          companyLogo: selectedCompanies[0].logo,
          salary: 'Not disclosed',
          email: `hr@${selectedCompanies[0].domain}`,
          companyWebsite: `https://www.${selectedCompanies[0].domain}`,
          source: 'Database'
      };
      scrapedJobs.push(fallbackJob);
  }

  return scrapedJobs;
}

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Fresher Job Finder running at http://localhost:${PORT}`);
  console.log(`📧 SMTP: ${process.env.SMTP_USER === 'your-email@gmail.com' ? '❌ Not configured' : '✅ Configured'}`);
  console.log(`🔑 RapidAPI: ${process.env.RAPIDAPI_KEY === 'your-rapidapi-key-here' ? '❌ Not configured (using demo data)' : '✅ Configured'}\n`);
});
