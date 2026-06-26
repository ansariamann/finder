/**
 * Fresher Job Finder - Backend Server
 * Handles job search, email extraction, resume upload, and bulk emailing.
 */

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const nodemailer = require("nodemailer");
const axios = require("axios");
const cheerio = require("cheerio");
const path = require("path");
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, "public")));

// ─── File Upload Config ──────────────────────────────────────
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `resume-${uuidv4()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = [".pdf", ".doc", ".docx"];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOC, and DOCX files are allowed"));
    }
  },
});
// ─── Persistent Store ────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const raw = fs.readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (e) {
    console.log("Could not load data file, starting fresh:", e.message);
  }
  return {
    searchHistory: [],
    uploadedResumePath: null,
    uploadedResumeOriginalName: null,
  };
}

function saveData() {
  try {
    fs.writeFileSync(
      DATA_FILE,
      JSON.stringify(
        {
          searchHistory,
          uploadedResumePath,
          uploadedResumeOriginalName,
        },
        null,
        2
      )
    );
  } catch (e) {
    console.error("Failed to save data:", e.message);
  }
}

const stored = loadData();
let searchHistory = stored.searchHistory;
let uploadedResumePath = stored.uploadedResumePath;
let uploadedResumeOriginalName = stored.uploadedResumeOriginalName;

// Cache full search results so pagination returns consistent pages
const searchResultCache = new Map();
const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000;

// ─── SMTP Transporter ────────────────────────────────────────
function createTransporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ─── Routes ──────────────────────────────────────────────────

/**
 * POST /api/search-jobs
 * Search for fresher jobs in a specific city using multiple real job APIs
 */
app.post("/api/search-jobs", async (req, res) => {
  try {
    const { city, keywords = "fresher", page = 1 } = req.body;

    if (!city) {
      return res.status(400).json({ error: "City is required" });
    }

    const cacheKey = `${city.toLowerCase().trim()}|${keywords
      .toLowerCase()
      .trim()}`;
    const cached = searchResultCache.get(cacheKey);
    let uniqueJobs;

    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
      uniqueJobs = cached.jobs;
      console.log(
        `\n🔍 Cache hit: "${keywords}" in "${city}" (page ${page}, ${uniqueJobs.length} cached)`
      );
    } else {
      console.log(
        `\n🔍 Searching jobs: "${keywords}" in "${city}" (page ${page})`
      );

      // City searches rely on location-aware APIs; global boards add remote noise
      const [jsearchJobs, adzunaJobs] = await Promise.allSettled([
        fetchJSearchJobs(city, keywords),
        fetchAdzunaJobs(city, keywords, 1),
      ]);

      let allJobs = [
        ...(jsearchJobs.status === "fulfilled" ? jsearchJobs.value : []),
        ...(adzunaJobs.status === "fulfilled" ? adzunaJobs.value : []),
      ];

      console.log(`📊 Total raw results: ${allJobs.length}`);

      const beforeJunk = allJobs.length;
      allJobs = allJobs.filter((job) => !isJunkListing(job));
      if (beforeJunk !== allJobs.length) {
        console.log(
          `🗑️  After junk filter: ${allJobs.length} (removed ${
            beforeJunk - allJobs.length
          } spam listings)`
        );
      }

      const beforeFilter = allJobs.length;
      allJobs = allJobs.filter(isFresherFriendly);
      console.log(
        `🎯 After fresher filter: ${allJobs.length} (removed ${
          beforeFilter - allJobs.length
        } senior/experienced roles)`
      );

      const beforeKeyword = allJobs.length;
      allJobs = allJobs.filter((job) => matchesKeywords(job, keywords));
      if (beforeKeyword !== allJobs.length) {
        console.log(
          `🔎 After keyword filter: ${allJobs.length} (removed ${
            beforeKeyword - allJobs.length
          } unrelated roles)`
        );
      }

      const beforeLocationFilter = allJobs.length;
      allJobs = allJobs.filter((job) => isLocationMatch(job.location, city));
      console.log(
        `📍 After location filter: ${allJobs.length} (removed ${
          beforeLocationFilter - allJobs.length
        } jobs from other locations)`
      );

      const seenLinks = new Set();
      const seenKeys = new Set();
      uniqueJobs = [];
      for (const job of allJobs) {
        const linkKey = (job.applyLink || "").toLowerCase().trim();
        const comboKey = `${job.company}|${job.title}`.toLowerCase().trim();
        if (linkKey && linkKey !== "#" && seenLinks.has(linkKey)) continue;
        if (seenKeys.has(comboKey)) continue;
        if (linkKey && linkKey !== "#") seenLinks.add(linkKey);
        seenKeys.add(comboKey);
        uniqueJobs.push(sanitizeJobForClient(job));
      }

      uniqueJobs.sort((a, b) => new Date(b.posted) - new Date(a.posted));
      searchResultCache.set(cacheKey, {
        jobs: uniqueJobs,
        timestamp: Date.now(),
      });

      if (uniqueJobs.length === 0) {
        const hasJSearch =
          process.env.RAPIDAPI_KEY &&
          process.env.RAPIDAPI_KEY !== "your-rapidapi-key-here";
        const hasAdzuna =
          process.env.ADZUNA_APP_ID &&
          process.env.ADZUNA_APP_ID !== "your-adzuna-app-id";
        console.log(
          `⚠️  No jobs found. JSearch: ${
            hasJSearch ? "OK" : "missing key"
          }, Adzuna: ${hasAdzuna ? "OK" : "missing key"}`
        );
      }
    }

    const pageSize = 30;
    const startIdx = (page - 1) * pageSize;
    const pageJobs = uniqueJobs.slice(startIdx, startIdx + pageSize);

    console.log(
      `✅ Returning ${pageJobs.length} unique jobs (${uniqueJobs.length} total available)`
    );

    res.json({
      success: true,
      query: `${keywords} jobs in ${city}`,
      total: pageJobs.length,
      totalAvailable: uniqueJobs.length,
      jobs: pageJobs,
      hasMore: startIdx + pageJobs.length < uniqueJobs.length,
    });
  } catch (error) {
    console.error("Search error:", error);
    res
      .status(500)
      .json({ error: "Failed to search jobs", details: error.message });
  }
});

/**
 * POST /api/find-email
 * Attempt to find HR email for a company domain
 */
app.post("/api/find-email", async (req, res) => {
  try {
    const { company, domain } = req.body;

    if (!company) {
      return res.status(400).json({ error: "Company name is required" });
    }

    let emails = [];

    // Try Hunter.io if API key is set
    if (process.env.HUNTER_API_KEY && domain) {
      try {
        const hunterRes = await axios.get(
          "https://api.hunter.io/v2/domain-search",
          {
            params: {
              domain: domain,
              api_key: process.env.HUNTER_API_KEY,
              department: "human_resources",
              limit: 5,
            },
            timeout: 10000,
          }
        );

        if (
          hunterRes.data &&
          hunterRes.data.data &&
          hunterRes.data.data.emails
        ) {
          emails = hunterRes.data.data.emails.map((e) => ({
            email: e.value,
            confidence: e.confidence,
            name: `${e.first_name || ""} ${e.last_name || ""}`.trim(),
            position: e.position || "HR",
          }));
        }
      } catch (hunterErr) {
        console.log("Hunter.io error:", hunterErr.message);
      }
    }

    // Generate HR email patterns if no API results
    if (emails.length === 0 && domain) {
      const cleanDomain = domain
        .replace(/^(https?:\/\/)?(www\.)?/, "")
        .split("/")[0];
      emails = [
        {
          email: `hr@${cleanDomain}`,
          confidence: 70,
          name: "HR Department",
          position: "HR",
        },
        {
          email: `careers@${cleanDomain}`,
          confidence: 65,
          name: "Careers",
          position: "Recruitment",
        },
        {
          email: `recruitment@${cleanDomain}`,
          confidence: 60,
          name: "Recruitment",
          position: "Recruitment",
        },
        {
          email: `jobs@${cleanDomain}`,
          confidence: 55,
          name: "Jobs",
          position: "HR",
        },
        {
          email: `info@${cleanDomain}`,
          confidence: 40,
          name: "General",
          position: "General",
        },
      ];
    }

    res.json({ success: true, company, emails });
  } catch (error) {
    console.error("Email finder error:", error);
    res
      .status(500)
      .json({ error: "Failed to find emails", details: error.message });
  }
});

/**
 * POST /api/upload-resume
 * Upload resume file
 */
app.post("/api/upload-resume", upload.single("resume"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
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
      size: (req.file.size / 1024).toFixed(1) + " KB",
      path: req.file.path,
    });
  } catch (error) {
    console.error("Upload error:", error);
    res
      .status(500)
      .json({ error: "Failed to upload resume", details: error.message });
  }
});

/**
 * GET /api/resume-status
 * Check if a resume is uploaded
 */
app.get("/api/resume-status", (req, res) => {
  res.json({
    uploaded: !!uploadedResumePath && fs.existsSync(uploadedResumePath),
    filename: uploadedResumeOriginalName || null,
  });
});

function markdownToHtml(text) {
  if (!text) return "";
  // Basic markdown-to-HTML for bold and newlines
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br>");
}

/**
 * POST /api/send-emails
 * Send bulk emails with resume attachment
 */
app.post("/api/send-emails", async (req, res) => {
  try {
    const { recipients, subject, textBody, senderName, senderPhone } = req.body;
    console.log(`\n📨 Attempting to send ${recipients?.length || 0} emails...`);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ error: "No recipients provided" });
    }

    if (!subject || !textBody) {
      return res
        .status(400)
        .json({ error: "Subject and email body are required" });
    }

    if (
      !process.env.SMTP_USER ||
      process.env.SMTP_USER === "your-email@gmail.com"
    ) {
      console.log(
        "❌ Error: SMTP_USER is not configured in environment variables."
      );
      return res.status(400).json({
        error:
          "SMTP not configured. Please update .env file with your email credentials.",
      });
    }

    const transporter = createTransporter();

    // Verify SMTP connection
    try {
      await transporter.verify();
      console.log("✅ SMTP connection verified successfully.");
    } catch (verifyErr) {
      console.log("❌ SMTP Verification Failed:", verifyErr.message);
      return res.status(400).json({
        error: "SMTP connection failed. Check your email credentials in .env",
        details: verifyErr.message,
      });
    }

    const delay = parseInt(process.env.EMAIL_DELAY_MS || "3000");
    const maxBatch = parseInt(process.env.MAX_EMAILS_PER_BATCH || "50");
    const batch = recipients.slice(0, maxBatch);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < batch.length; i++) {
      const recipient = batch[i];

      // Fill placeholders and convert to HTML
      const filledText = textBody
        .replace(/{company}/g, recipient.company || "Your Company")
        .replace(/{position}/g, recipient.position || "Fresher Position")
        .replace(
          /{name}/g,
          senderName || process.env.SENDER_NAME || "Applicant"
        )
        .replace(/{phone}/g, senderPhone || process.env.SENDER_PHONE || "")
        .replace(/{email}/g, process.env.SMTP_USER || "");

      const htmlVersion = markdownToHtml(filledText);

      try {
        const mailOptions = {
          from: `"${senderName || process.env.SENDER_NAME || "Job Seeker"}" <${
            process.env.SMTP_USER
          }>`,
          to: recipient.email,
          subject: subject.replace(
            "{company}",
            recipient.company || "Your Company"
          ),
          html: htmlVersion,
          attachments: [],
        };

        // Attach resume if uploaded
        if (uploadedResumePath && fs.existsSync(uploadedResumePath)) {
          mailOptions.attachments.push({
            filename: uploadedResumeOriginalName || "Resume.pdf",
            path: uploadedResumePath,
          });
        }

        await transporter.sendMail(mailOptions);
        successCount++;
        results.push({
          email: recipient.email,
          company: recipient.company,
          status: "sent",
          timestamp: new Date().toISOString(),
        });
      } catch (sendErr) {
        failCount++;
        results.push({
          email: recipient.email,
          company: recipient.company,
          status: "failed",
          error: sendErr.message,
        });
      }

      // Delay between emails to avoid rate limiting
      if (i < batch.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    res.json({
      success: true,
      total: batch.length,
      sent: successCount,
      failed: failCount,
      results,
    });
  } catch (error) {
    console.error("Email sending error:", error);
    res
      .status(500)
      .json({ error: "Failed to send emails", details: error.message });
  }
});

/**
 * POST /api/test-smtp
 * Test SMTP connection
 */
app.post("/api/test-smtp", async (req, res) => {
  try {
    console.log("\n🔌 Testing SMTP connection...");
    if (
      !process.env.SMTP_USER ||
      process.env.SMTP_USER === "your-email@gmail.com"
    ) {
      console.log("❌ Error: SMTP not configured.");
      return res.status(400).json({
        error: "SMTP not configured. Update your .env file.",
      });
    }

    const transporter = createTransporter();
    await transporter.verify();

    console.log("✅ SMTP test successful!");
    res.json({ success: true, message: "SMTP connection successful!" });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: "SMTP connection failed",
      details: error.message,
    });
  }
});

/**
 * GET /api/sender-info
 * Return sender name and phone from environment variables
 */
app.get("/api/sender-info", (req, res) => {
  res.json({
    name: process.env.SENDER_NAME || "",
    phone: process.env.SENDER_PHONE || "",
    email: process.env.SMTP_USER || "",
  });
});

/**
 * POST /api/quick-send
 * Accept only a company email. Derive company name from domain,
 * build the HTML body, and fire the email — fully automatic.
 * Body: { companyEmail: string }
 */
app.post("/api/quick-send", async (req, res) => {
  try {
    const {
      companyEmail,
      position: requestedPosition,
      subject: subjectTemplate,
      textBody: bodyTemplate,
      companyName: providedCompanyName,
    } = req.body;
    if (!companyEmail || !companyEmail.includes("@")) {
      return res
        .status(400)
        .json({ error: "A valid company email is required." });
    }

    // Use provided company name, or derive it from domain as a fallback
    let companyName = providedCompanyName;
    if (!companyName) {
      const domain = companyEmail.split("@")[1] || "";
      const skipParts = new Set([
        "com",
        "co",
        "in",
        "org",
        "net",
        "io",
        "ai",
        "app",
        "dev",
        "tech",
        "gov",
        "edu",
        "uk",
        "us",
        "au",
      ]);
      const parts = domain.split(".");
      const namePart =
        parts.find((p) => !skipParts.has(p.toLowerCase())) || parts[0];
      companyName =
        namePart.charAt(0).toUpperCase() + namePart.slice(1).toLowerCase();
    }

    const position =
      (requestedPosition && requestedPosition.trim()) || "Software Developer";
    const senderName = process.env.SENDER_NAME || "Applicant";
    const senderPhone = process.env.SENDER_PHONE || "";
    const senderEmail = process.env.SMTP_USER || "";

    if (!senderEmail || senderEmail === "your-email@gmail.com") {
      return res
        .status(400)
        .json({ error: "SMTP not configured. Please update .env file." });
    }

    // Derive greeting name from the email address
    const hrName = deriveGreetingName(companyEmail);

    // Fill placeholders in subject and body templates from client
    const subject = (
      subjectTemplate || `Application for {position} Position – {name}`
    )
      .replace(/{company}/g, companyName)
      .replace(/{position}/g, position)
      .replace(/{name}/g, senderName);

    const filledTextBody = (
      bodyTemplate || "Please find my resume attached for the {position} role."
    )
      .replace(/{company}/g, companyName)
      .replace(/{hr_name}/g, hrName)
      .replace(/{position}/g, position)
      .replace(/{name}/g, senderName)
      .replace(/{phone}/g, senderPhone)
      .replace(/{email}/g, senderEmail);
    const htmlVersion = markdownToHtml(filledTextBody);

    const transporter = createTransporter();
    try {
      await transporter.verify();
    } catch (ve) {
      return res
        .status(400)
        .json({ error: "SMTP connection failed.", details: ve.message });
    }

    const mailOptions = {
      from: `"${senderName}" <${senderEmail}>`,
      to: companyEmail,
      subject,
      html: htmlVersion,
      attachments: [],
    };

    if (uploadedResumePath && fs.existsSync(uploadedResumePath)) {
      mailOptions.attachments.push({
        filename: uploadedResumeOriginalName || "Resume.pdf",
        path: uploadedResumePath,
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
        const isTransient =
          /ETIMEDOUT|ECONNRESET|ECONNREFUSED|ESOCKET|too many|rate/i.test(
            sendErr.message
          );
        if (isTransient && attempt < SERVER_MAX_RETRIES) {
          console.log(
            `  ⟳ Transient SMTP error for ${companyEmail}, retrying (${
              attempt + 1
            }/${SERVER_MAX_RETRIES})...`
          );
          await new Promise((r) =>
            setTimeout(r, SERVER_RETRY_DELAYS[attempt] || 6000)
          );
          continue;
        }
        throw sendErr; // non-transient or retries exhausted
      }
    }

    console.log(`✅ Quick-sent to ${companyEmail} (${companyName})`);
    res.json({ success: true, company: companyName, email: companyEmail });
  } catch (error) {
    console.error("Quick-send error:", error);
    res
      .status(500)
      .json({ error: "Failed to send email", details: error.message });
  }
});

/**
 * POST /api/clear-history
 * Clear search history to allow re-fetching companies
 */
app.post("/api/clear-history", (req, res) => {
  searchHistory = [];
  searchResultCache.clear();
  saveData();
  res.json({ success: true, message: "Search history cleared" });
});

/**
 * GET /api/smtp-status
 * Check if SMTP is configured
 */
app.get("/api/smtp-status", (req, res) => {
  const configured =
    process.env.SMTP_USER &&
    process.env.SMTP_USER !== "your-email@gmail.com" &&
    process.env.SMTP_PASS &&
    process.env.SMTP_PASS !== "your-app-password";

  res.json({
    configured: !!configured,
    email: configured ? process.env.SMTP_USER : null,
  });
});

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Derive a greeting name from the email address.
 * - If the email contains "hr" or "career" → "Hiring Manager"
 * - If the local part looks like a person's name (e.g. john.doe@) → "John Doe"
 * - Otherwise (info@, contact@, jobs@, etc.) → "Sir/Madam"
 */
function deriveGreetingName(email) {
  if (!email) return "Sir/Madam";

  const lower = email.toLowerCase();
  const localPart = lower.split("@")[0] || "";

  // Use "Hiring Manager" only for HR / career / recruitment emails
  if (
    /\b(hr|career|careers|recruit|recruitment|hiring|talent)\b/.test(localPart)
  ) {
    return "Hiring Manager";
  }

  // Generic / non-person local parts → neutral greeting
  const genericPrefixes = new Set([
    "info",
    "contact",
    "support",
    "admin",
    "hello",
    "team",
    "jobs",
    "office",
    "enquiry",
    "enquiries",
    "mail",
    "general",
    "sales",
    "help",
    "noreply",
    "no-reply",
    "webmaster",
    "postmaster",
  ]);
  if (genericPrefixes.has(localPart)) {
    return "Sir/Madam";
  }

  // Try to extract a person name from the local part
  // Patterns: john.doe, john_doe, john-doe, johndoe (if short enough)
  const nameParts = localPart.split(/[._\-+]+/).filter(Boolean);
  if (nameParts.length >= 2) {
    // Likely a person name like "john.doe"
    const formatted = nameParts
      .slice(0, 2) // take first two parts (first + last name)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
      .join(" ");
    // Sanity check: each part should be alphabetic and reasonable length
    if (nameParts.slice(0, 2).every((p) => /^[a-z]{2,}$/.test(p))) {
      return formatted;
    }
  }

  // Single-word local part that looks like a first name (3-12 alpha chars)
  if (/^[a-z]{3,12}$/.test(localPart) && !genericPrefixes.has(localPart)) {
    return localPart.charAt(0).toUpperCase() + localPart.slice(1).toLowerCase();
  }

  return "Sir/Madam";
}

function extractEmailFromDescription(text) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  const matches = text.match(emailRegex);
  if (matches && matches.length > 0) {
    const hrEmail = matches.find((e) =>
      /hr|recruit|career|job|talent|hiring/i.test(e)
    );
    return hrEmail || matches[0];
  }
  return null;
}

/**
 * Check if a job's location matches the searched city.
 * Strict matching: remote/worldwide jobs only pass if they also mention the city.
 */
function isLocationMatch(jobLocation, searchedCity) {
  if (!searchedCity) return true;
  if (!jobLocation) return false;

  const loc = jobLocation.toLowerCase().trim();
  const city = searchedCity.toLowerCase().trim();

  const cityAliases = getCityAliases();
  const aliases = cityAliases[city] || [city];
  const matchesCity = aliases.some((alias) => loc.includes(alias));

  if (matchesCity) return true;

  // WFH / hybrid only counts if the listing also names the searched city
  if (/\b(remote|work\s*from\s*home|wfh|hybrid)\b/.test(loc)) {
    return false;
  }

  // Reject broad / foreign locations that aren't the searched city
  if (
    /\b(worldwide|anywhere|global|usa|united states|uk|europe|canada|australia)\b/.test(
      loc
    )
  ) {
    return false;
  }

  // "India" alone is too broad for a city-specific search
  if (/\bindia\b/.test(loc) && !matchesCity) {
    return false;
  }

  return false;
}

function getCityAliases() {
  return {
    bangalore: ["bengaluru", "blr", "bangalore"],
    bengaluru: ["bangalore", "blr", "bengaluru"],
    mumbai: ["bombay", "mumbai"],
    bombay: ["mumbai", "bombay"],
    chennai: ["madras", "chennai"],
    madras: ["chennai", "madras"],
    kolkata: ["calcutta", "kolkata"],
    calcutta: ["kolkata", "calcutta"],
    delhi: [
      "new delhi",
      "ncr",
      "delhi",
      "noida",
      "gurgaon",
      "gurugram",
      "faridabad",
      "ghaziabad",
    ],
    "new delhi": ["new delhi", "ncr", "delhi", "noida", "gurgaon", "gurugram"],
    ncr: [
      "new delhi",
      "ncr",
      "delhi",
      "noida",
      "gurgaon",
      "gurugram",
      "faridabad",
      "ghaziabad",
    ],
    noida: ["ncr", "delhi", "noida", "greater noida"],
    gurgaon: ["gurugram", "gurgaon", "ncr", "delhi"],
    gurugram: ["gurgaon", "gurugram", "ncr", "delhi"],
    hyderabad: ["hyderabad", "hyd", "secunderabad"],
    secunderabad: ["hyderabad", "secunderabad"],
    pune: [
      "pune",
      "puna",
      "hinjewadi",
      "hinjewadi phase",
      "kharadi",
      "viman nagar",
      "wakad",
      "baner",
    ],
    ahmedabad: ["ahmedabad", "amdavad"],
    indore: ["indore"],
    lucknow: ["lucknow"],
    nagpur: ["nagpur"],
    jaipur: ["jaipur"],
    chandigarh: ["chandigarh", "mohali", "panchkula"],
    coimbatore: ["coimbatore"],
    kochi: ["cochin", "kochi", "ernakulam"],
    cochin: ["kochi", "cochin", "ernakulam"],
    thiruvananthapuram: ["trivandrum", "thiruvananthapuram"],
    trivandrum: ["thiruvananthapuram", "trivandrum"],
    vizag: ["visakhapatnam", "vizag"],
    visakhapatnam: ["vizag", "visakhapatnam"],
    bhopal: ["bhopal"],
    surat: ["surat"],
    vadodara: ["vadodara", "baroda"],
    baroda: ["vadodara", "baroda"],
    mysore: ["mysore", "mysuru"],
    mysuru: ["mysore", "mysuru"],
  };
}

function getJobText(job) {
  return `${job.title || ""} ${
    job.fullDescription || job.description || ""
  }`.toLowerCase();
}

function isJunkListing(job) {
  const text = getJobText(job);
  const link = (job.applyLink || "").toLowerCase();

  if (link.includes("olx.in")) {
    if (
      /\b(indigo|airline|airport|cabin crew|ground staff|air hostess|movie audition)\b/.test(
        text
      )
    ) {
      return true;
    }
  }

  return false;
}

function matchesKeywords(job, keywords) {
  const kw = (keywords || "").toLowerCase().trim();
  if (!kw || kw === "fresher") return true;

  const text = getJobText(job);
  const terms = kw.split(/[\s,+/]+/).filter(Boolean);
  return terms.some((term) => text.includes(term));
}

function sanitizeJobForClient(job) {
  const full = job.fullDescription || job.description || "";
  const { fullDescription, ...rest } = job;
  return {
    ...rest,
    description: full.length > 400 ? full.substring(0, 400) + "..." : full,
  };
}

/**
 * Filter jobs to only those suitable for freshers (0–1 year experience).
 * Strategy:
 *   1. If the title or description explicitly mentions 2+ years required → REJECT.
 *   2. If the title or description says "fresher", "entry level", "0-1", "graduate",
 *      "trainee", "intern", "junior", or no experience mentioned → KEEP.
 */
function isFresherFriendly(job) {
  const text = getJobText(job);

  // ── REJECT patterns: explicit 2+ years requirement ──
  // Matches patterns like "2+ years", "3-5 years", "5 years", "minimum 2 years", etc.
  const rejectPatterns = [
    /\b([2-9]|[1-9]\d)\+?\s*(?:to|-|–)?\s*\d*\s*(?:years?|yrs?)\b/, // "2+ years", "3-5 years", "5 years"
    /\b(?:minimum|min|at\s*least)\s*(?:of\s+)?([2-9]|[1-9]\d)\s*(?:years?|yrs?)\b/, // "minimum 2 years"
    /\bexperience\s*(?:of\s+)?([2-9]|[1-9]\d)\s*(?:years?|yrs?)\b/, // "experience of 3 years"
    /\b([2-9]|[1-9]\d)\s*(?:years?|yrs?)\s*(?:of\s+)?(?:experience|exp)\b/, // "3 years of experience"
    /\bsenior\b/, // "Senior" roles
    /\blead\b/, // "Lead" roles
    /\bstaff\b/, // "Staff" roles
    /\bprincipal\b/, // "Principal" roles
    /\barchitect\b/, // "Architect" roles
    /\bdirector\b/, // "Director" roles
    /\bmanager\b.*\bengineering\b/, // "Engineering Manager"
    /\bvp\b/, // VP roles
  ];

  for (const pat of rejectPatterns) {
    if (pat.test(text)) {
      // Exception: if job title itself says "fresher" or "entry" or "junior", keep it
      const title = (job.title || "").toLowerCase();
      if (
        /fresher|entry.?level|junior|trainee|intern|graduate|apprentice/i.test(
          title
        )
      ) {
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
    /\b0\s*(?:to|-|–)\s*1\s*(?:years?|yrs?)\b/, // "0-1 years"
    /\b0\s*(?:to|-|–)\s*2\s*(?:years?|yrs?)\b/, // "0-2 years" (still fresher-friendly)
    /\b1\s*(?:to|-|–)\s*2\s*(?:years?|yrs?)\b/, // "1-2 years" (still ok for freshers)
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
function mapJSearchJob(job) {
  const fullDescription = job.job_description || "";
  const locationParts = [job.job_city, job.job_state, job.job_country].filter(
    Boolean
  );
  return {
    id: uuidv4(),
    title: job.job_title || "N/A",
    company: job.employer_name || "N/A",
    location: locationParts.length ? locationParts.join(", ") : null,
    type: job.job_employment_type || "Full-time",
    posted: job.job_posted_at_datetime_utc || new Date().toISOString(),
    fullDescription,
    applyLink: job.job_apply_link || "#",
    companyLogo: job.employer_logo || null,
    salary: job.job_min_salary
      ? `${job.job_salary_currency || "₹"}${job.job_min_salary} – ${
          job.job_max_salary || "N/A"
        }`
      : "Not disclosed",
    email: extractEmailFromDescription(fullDescription) || null,
    companyWebsite: job.employer_website || null,
    source: "JSearch",
  };
}

/**
 * Single JSearch query helper
 */
async function jsearchQuery(query, page, numPages = "3") {
  const response = await axios.get("https://jsearch.p.rapidapi.com/search", {
    params: {
      query,
      page: String(page),
      num_pages: numPages,
      date_posted: "month",
      employment_types: "FULLTIME,PARTTIME,INTERN,CONTRACTOR",
      job_requirements: "no_experience,under_3_years_experience,no_degree",
    },
    headers: {
      "x-rapidapi-key": process.env.RAPIDAPI_KEY,
      "x-rapidapi-host": "jsearch.p.rapidapi.com",
    },
    timeout: 20000,
  });
  return response.data && response.data.data ? response.data.data : [];
}

/**
 * Fetch jobs from JSearch API using MULTIPLE keyword variations in parallel.
 * Optimised for fresher / 0–1 year experience roles.
 */
async function fetchJSearchJobs(city, keywords) {
  if (
    !process.env.RAPIDAPI_KEY ||
    process.env.RAPIDAPI_KEY === "your-rapidapi-key-here"
  ) {
    return [];
  }

  const baseKeyword = keywords.trim();
  const queries = [
    `${baseKeyword} jobs in ${city}`,
    `fresher developer jobs in ${city}`,
    `fresher software engineer jobs in ${city}`,
    `junior software engineer jobs in ${city}`,
    `entry level developer jobs in ${city}`,
    `graduate trainee software ${city}`,
    `software trainee jobs in ${city}`,
    `fresher IT jobs in ${city}`,
    `intern developer jobs in ${city}`,
    `0-1 years experience developer ${city}`,
    `fresher jobs ${city} India`,
    `campus hire software engineer ${city}`,
  ];

  const results = await Promise.allSettled(
    queries.map((q) => jsearchQuery(q, 1, "5"))
  );

  const allRaw = results.flatMap((r) =>
    r.status === "fulfilled" ? r.value : []
  );
  console.log(
    `  JSearch raw hits: ${allRaw.length} across ${queries.length} queries`
  );
  return allRaw.map((job) => mapJSearchJob(job));
}

/**
 * Fetch jobs from Adzuna API (free, 250 calls/month on free tier)
 * Sign up at https://developer.adzuna.com
 */
async function fetchAdzunaJobs(city, keywords, _page) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || appId === "your-adzuna-app-id") {
    console.log("Adzuna: no credentials set, skipping.");
    return [];
  }

  const country = process.env.ADZUNA_COUNTRY || "in";
  const pages = await Promise.allSettled(
    [1, 2, 3].map((page) =>
      axios.get(
        `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}`,
        {
          params: {
            app_id: appId,
            app_key: appKey,
            what: `${keywords} fresher junior entry level trainee graduate intern`,
            where: city,
            results_per_page: 50,
            max_days_old: 30,
            content_type: "application/json",
          },
          timeout: 12000,
        }
      )
    )
  );

  try {
    const allResults = pages.flatMap((r) =>
      r.status === "fulfilled" && r.value.data && r.value.data.results
        ? r.value.data.results
        : []
    );
    if (!allResults.length) return [];
    console.log(`  Adzuna hits: ${allResults.length}`);
    return allResults.map((job) => {
      const fullDescription = job.description || "";
      return {
        id: uuidv4(),
        title: job.title || "N/A",
        company: (job.company && job.company.display_name) || "N/A",
        location: (job.location && job.location.display_name) || null,
        type: job.contract_time === "part_time" ? "Part-time" : "Full-time",
        posted: job.created || new Date().toISOString(),
        fullDescription,
        applyLink: job.redirect_url || "#",
        companyLogo: null,
        salary: job.salary_min
          ? `₹${Math.round(job.salary_min)} – ₹${Math.round(
              job.salary_max || job.salary_min
            )}`
          : "Not disclosed",
        email: null,
        companyWebsite: null,
        source: "Adzuna",
      };
    });
  } catch (err) {
    console.log("Adzuna error:", err.message);
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
      "software developer",
      "software engineer",
      "web developer",
      "backend developer",
      "frontend developer",
    ];
    const results = await Promise.allSettled(
      searches.map((s) =>
        axios.get("https://remotive.com/api/remote-jobs", {
          params: { search: s, limit: 50 },
          timeout: 10000,
        })
      )
    );
    const allJobs = results.flatMap((r) =>
      r.status === "fulfilled" && r.value.data && r.value.data.jobs
        ? r.value.data.jobs
        : []
    );
    console.log(`  Remotive raw hits: ${allJobs.length}`);
    // Keep jobs from last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    return allJobs
      .filter((job) => new Date(job.publication_date).getTime() > thirtyDaysAgo)
      .map((job) => ({
        id: uuidv4(),
        title: job.title || "N/A",
        company: job.company_name || "N/A",
        location: job.candidate_required_location || "Remote",
        type:
          job.job_type === "full_time" ? "Full-time" : job.job_type || "Remote",
        posted: job.publication_date || new Date().toISOString(),
        description:
          (job.description || "").replace(/<[^>]+>/g, "").substring(0, 400) +
          "...",
        applyLink: job.url || "#",
        companyLogo: job.company_logo || null,
        salary: job.salary || "Not disclosed",
        email: null,
        companyWebsite: null,
        source: "Remotive",
      }));
  } catch (err) {
    console.log("Remotive error:", err.message);
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
    const resp = await axios.get("https://www.themuse.com/api/public/jobs", {
      params: {
        category: "Software Engineer",
        level: "Entry Level",
        page: page - 1, // Muse is 0-indexed
        descended: true,
      },
      timeout: 10000,
    });
    if (!resp.data || !resp.data.results) return [];
    console.log(`  The Muse hits: ${resp.data.results.length}`);
    return resp.data.results.map((job) => ({
      id: uuidv4(),
      title: job.name || "N/A",
      company: (job.company && job.company.name) || "N/A",
      location:
        (job.locations && job.locations[0] && job.locations[0].name) ||
        "Remote",
      type: job.type || "Full-time",
      posted: job.publication_date || new Date().toISOString(),
      description:
        (job.contents || "").replace(/<[^>]+>/g, "").substring(0, 400) + "...",
      applyLink:
        job.refs && job.refs.landing_page ? job.refs.landing_page : "#",
      companyLogo:
        job.company && job.company.refs && job.company.refs.logo_image
          ? job.company.refs.logo_image
          : null,
      salary: "Not disclosed",
      email: null,
      companyWebsite: null,
      source: "The Muse",
    }));
  } catch (err) {
    console.log("The Muse error:", err.message);
    return [];
  }
}

/**
 * Fetch from Arbeitnow (free, no key, global remote/EU jobs)
 * https://arbeitnow.com/api/job-board-api
 */
async function fetchArbeitnowJobs(keywords, page) {
  try {
    const resp = await axios.get("https://arbeitnow.com/api/job-board-api", {
      params: { page },
      timeout: 10000,
    });
    if (!resp.data || !resp.data.data) return [];
    const kw = keywords.toLowerCase();
    // Filter to tech/software related
    const filtered = resp.data.data.filter((job) => {
      const text = `${job.title} ${
        job.tags ? job.tags.join(" ") : ""
      }`.toLowerCase();
      return (
        text.includes("software") ||
        text.includes("developer") ||
        text.includes("engineer") ||
        text.includes(kw)
      );
    });
    console.log(`  Arbeitnow hits: ${filtered.length}`);
    return filtered.map((job) => ({
      id: uuidv4(),
      title: job.title || "N/A",
      company: job.company_name || "N/A",
      location: job.location || "Remote",
      type: job.remote ? "Remote" : "Full-time",
      posted: job.created_at
        ? new Date(job.created_at * 1000).toISOString()
        : new Date().toISOString(),
      description:
        (job.description || "").replace(/<[^>]+>/g, "").substring(0, 400) +
        "...",
      applyLink: job.url || "#",
      companyLogo: null,
      salary: "Not disclosed",
      email: null,
      companyWebsite: null,
      source: "Arbeitnow",
    }));
  } catch (err) {
    console.log("Arbeitnow error:", err.message);
    return [];
  }
}

// ─── Start Server ────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Fresher Job Finder running at http://localhost:${PORT}`);
  console.log(
    `📧 SMTP: ${
      process.env.SMTP_USER === "your-email@gmail.com"
        ? "❌ Not configured"
        : "✅ Configured"
    }`
  );
  console.log(
    `🔑 RapidAPI: ${
      process.env.RAPIDAPI_KEY === "your-rapidapi-key-here" ||
      !process.env.RAPIDAPI_KEY
        ? "❌ Not configured"
        : "✅ Configured"
    }`
  );
  console.log(
    `🔑 Adzuna: ${
      !process.env.ADZUNA_APP_ID ||
      process.env.ADZUNA_APP_ID === "your-adzuna-app-id"
        ? "❌ Not configured"
        : "✅ Configured"
    }\n`
  );
});
