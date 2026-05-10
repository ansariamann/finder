/**
 * Default professional email template for fresher job applications.
 * Placeholders: {company}, {position}, {name}, {phone}, {email}
 */
const DEFAULT_EMAIL_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<style>
body{margin:0;padding:0;font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;background:#f4f4f8;color:#1a1a2e}
.wrapper{max-width:620px;margin:0 auto;background:#fff}
.header-bar{background:linear-gradient(135deg,#6366f1,#06b6d4);padding:32px 36px;text-align:center}
.header-bar h1{margin:0;color:#fff;font-size:22px;font-weight:700;letter-spacing:-.5px}
.header-bar p{margin:6px 0 0;color:rgba(255,255,255,.85);font-size:13px}
.body-content{padding:32px 36px}
.greeting{font-size:16px;font-weight:600;color:#1a1a2e;margin-bottom:16px}
.body-text{font-size:14px;line-height:1.75;color:#374151;margin-bottom:14px}
.highlight-box{background:linear-gradient(135deg,#f0f0ff,#e8fffe);border-left:4px solid #6366f1;padding:16px 20px;border-radius:0 8px 8px 0;margin:20px 0}
.highlight-box h3{margin:0 0 8px;font-size:14px;color:#6366f1}
.highlight-box ul{margin:0;padding-left:18px;font-size:13px;line-height:1.8;color:#374151}
.cta-section{text-align:center;margin:28px 0}
.cta-btn{display:inline-block;padding:12px 32px;background:linear-gradient(135deg,#6366f1,#818cf8);color:#fff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px}
.signature{border-top:1px solid #e5e7eb;padding-top:20px;margin-top:24px}
.sig-name{font-size:15px;font-weight:700;color:#1a1a2e;margin-bottom:2px}
.sig-detail{font-size:12px;color:#6b7280;margin:2px 0}
.footer{background:#f8f9fa;padding:20px 36px;text-align:center;font-size:11px;color:#9ca3af;border-top:1px solid #e5e7eb}
.footer a{color:#6366f1;text-decoration:none}
.attachment-note{display:inline-flex;align-items:center;gap:6px;background:#f0fdf4;border:1px solid #bbf7d0;padding:8px 14px;border-radius:6px;font-size:12px;color:#166534;margin:16px 0}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header-bar">
    <h1>Job Application</h1>
    <p>Applying for {position} at {company}</p>
  </div>
  <div class="body-content">
    <p class="greeting">Dear Hiring Manager,</p>
    <p class="body-text">
      I am writing to express my keen interest in the <strong>{position}</strong> role
      at <strong>{company}</strong>. As a recent graduate with a strong foundation in
      technology and a passion for continuous learning, I am excited about the opportunity
      to contribute to your team.
    </p>
    <div class="highlight-box">
      <h3>Why I'm a Great Fit:</h3>
      <ul>
        <li>Strong academic background with hands-on project experience</li>
        <li>Proficient in modern technologies and eager to learn new ones</li>
        <li>Excellent communication, teamwork, and problem-solving skills</li>
        <li>Passionate about building impactful solutions</li>
      </ul>
    </div>
    <p class="body-text">
      I am confident that my enthusiasm, technical aptitude, and willingness to go above
      and beyond will make me a valuable asset to {company}. I have attached my resume
      for your review and would welcome the opportunity to discuss how I can contribute
      to your team's success.
    </p>
    <div class="attachment-note">
      📎 Resume attached for your reference
    </div>
    <p class="body-text">
      Thank you for considering my application. I look forward to hearing from you.
    </p>
    <div class="signature">
      <p class="sig-name">{name}</p>
      <p class="sig-detail">📧 {email}</p>
      <p class="sig-detail">📱 {phone}</p>
    </div>
  </div>
  <div class="footer">
    <p>This email was sent as a job application. If received in error, please disregard.</p>
  </div>
</div>
</body>
</html>
`;

window.DEFAULT_EMAIL_TEMPLATE = DEFAULT_EMAIL_TEMPLATE;
