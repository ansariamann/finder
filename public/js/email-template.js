/**
 * Default professional HTML email template for fresher job applications.
 * Placeholders: {company}, {position}, {name}, {phone}, {email}, {hr_name}
 *
 * Design: Premium dark-header card layout with gradient accents,
 * skill highlights, clean signature block, and responsive layout.
 */
const DEFAULT_EMAIL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>Job Application</title>
<style>
  /* Reset */
  body,table,td,p,a{margin:0;padding:0;border:0;font-size:100%;vertical-align:baseline}
  body{background:#f0f2f8;font-family:'Segoe UI',Arial,sans-serif;-webkit-font-smoothing:antialiased}
  img{display:block;border:0;outline:none;text-decoration:none}
  /* Wrapper */
  .wrapper{max-width:600px;margin:32px auto;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(0,0,0,.12)}
  /* Header */
  .email-header{background:linear-gradient(135deg,#1e1b4b 0%,#312e81 50%,#0e7490 100%);padding:40px 36px 36px;text-align:center;position:relative}
  .email-header::after{content:'';display:block;position:absolute;bottom:0;left:0;right:0;height:4px;background:linear-gradient(90deg,#6366f1,#06b6d4,#10b981)}
  .header-badge{display:inline-block;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:rgba(255,255,255,.9);font-size:11px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;padding:5px 14px;border-radius:20px;margin-bottom:16px}
  .header-title{color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-.5px;margin-bottom:8px;line-height:1.2}
  .header-subtitle{color:rgba(255,255,255,.75);font-size:13px;line-height:1.5}
  .header-subtitle strong{color:rgba(255,255,255,.95)}
  /* Body */
  .email-body{background:#ffffff;padding:36px 36px 28px}
  .greeting{font-size:17px;font-weight:700;color:#111827;margin-bottom:18px}
  .para{font-size:14px;line-height:1.8;color:#374151;margin-bottom:16px}
  .para strong{color:#1e1b4b}
  /* Highlight box */
  .highlight{background:linear-gradient(135deg,#eef2ff 0%,#e0f2fe 100%);border-left:4px solid #6366f1;border-radius:0 10px 10px 0;padding:20px 22px;margin:24px 0}
  .highlight-title{font-size:13px;font-weight:700;color:#4f46e5;text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px}
  .highlight ul{margin:0;padding:0 0 0 16px;list-style:disc}
  .highlight ul li{font-size:13px;color:#374151;line-height:1.7;margin-bottom:4px}
  /* Skills chips */
  .chips{margin:20px 0;line-height:2}
  .chip{display:inline-block;background:#f3f4f6;border:1px solid #e5e7eb;color:#374151;font-size:12px;font-weight:500;padding:4px 12px;border-radius:20px;margin:3px}
  /* Resume note */
  .resume-note{display:table;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:12px 16px;margin:20px 0;font-size:13px;color:#166534}
  .resume-note-icon{display:table-cell;vertical-align:middle;padding-right:10px;font-size:18px}
  .resume-note-text{display:table-cell;vertical-align:middle}
  /* CTA */
  .cta-wrap{text-align:center;margin:28px 0 8px}
  .cta-btn{display:inline-block;background:linear-gradient(135deg,#4f46e5,#06b6d4);color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:14px 36px;border-radius:8px;letter-spacing:.3px}
  /* Signature */
  .signature{border-top:1px solid #f3f4f6;padding-top:24px;margin-top:24px}
  .sig-name{font-size:16px;font-weight:700;color:#111827;margin-bottom:4px}
  .sig-row{display:table;margin-bottom:5px}
  .sig-icon{display:table-cell;width:20px;vertical-align:middle;color:#6366f1;font-size:14px}
  .sig-text{display:table-cell;vertical-align:middle;font-size:13px;color:#6b7280}
  /* Footer */
  .email-footer{background:#f8fafc;padding:20px 36px;text-align:center;border-top:1px solid #e5e7eb}
  .footer-text{font-size:11px;color:#9ca3af;line-height:1.6}
</style>
</head>
<body>
<div class="wrapper">

  <!-- HEADER -->
  <div class="email-header">
    <div class="header-badge">Job Application</div>
    <div class="header-title">Fresher Software Developer</div>
    <div class="header-subtitle">Applying for <strong>{position}</strong> at <strong>{company}</strong></div>
  </div>

  <!-- BODY -->
  <div class="email-body">

    <p class="greeting">Dear {hr_name},</p>

    <p class="para">
      I hope this email finds you well. I recently came across <strong>{company}</strong> and was
      truly impressed by your work and vision. I am reaching out to express my sincere interest
      in any <strong>fresher or entry-level software developer</strong> opportunities at your organisation.
    </p>

    <p class="para">
      As a recent <strong>Computer Science graduate</strong>, I bring a solid foundation in
      software engineering principles combined with genuine enthusiasm to contribute from day one.
    </p>

    <div class="highlight">
      <div class="highlight-title">Why I am a great fit</div>
      <ul>
        <li>Strong academic background with real-world project experience</li>
        <li>Proficient in modern programming languages and frameworks</li>
        <li>Quick learner — always up to date with emerging technologies</li>
        <li>Excellent problem-solving, communication, and teamwork skills</li>
        <li>Passionate about building impactful, scalable software solutions</li>
      </ul>
    </div>

    <div class="chips">
      <span class="chip">Java / Python</span>
      <span class="chip">JavaScript</span>
      <span class="chip">React / Node.js</span>
      <span class="chip">SQL & NoSQL</span>
      <span class="chip">Git & GitHub</span>
      <span class="chip">REST APIs</span>
    </div>

    <p class="para">
      I am confident that my technical aptitude, eagerness to learn, and strong work ethic
      will make me a valuable addition to the <strong>{company}</strong> team.
    </p>

    <div class="resume-note">
      <span class="resume-note-icon">&#128206;</span>
      <span class="resume-note-text">My <strong>resume is attached</strong> to this email for your review.</span>
    </div>

    <p class="para">
      I would welcome the opportunity to discuss how my background aligns with your
      team's needs. Thank you very much for your time and consideration.
    </p>

    <!-- Signature -->
    <div class="signature">
      <div class="sig-name">{name}</div>
      <div class="sig-row">
        <span class="sig-icon">&#9993;</span>
        <span class="sig-text">{email}</span>
      </div>
      <div class="sig-row">
        <span class="sig-icon">&#128222;</span>
        <span class="sig-text">{phone}</span>
      </div>
    </div>

  </div>

  <!-- FOOTER -->
  <div class="email-footer">
    <p class="footer-text">
      This email was sent as a job application enquiry.<br/>
      If you received this in error, please disregard it. Thank you.
    </p>
  </div>

</div>
</body>
</html>`;

window.DEFAULT_EMAIL_TEMPLATE = DEFAULT_EMAIL_TEMPLATE;
