/**
 * Default PLAIN TEXT email template for fresher job applications.
 * Placeholders: {company}, {position}, {name}, {phone}, {email}, {hr_name}
 *
 * The HTML wrapping (styling, header, footer, etc.) is applied automatically
 * on the server side when sending. The user only writes/sees the message.
 */
const DEFAULT_EMAIL_TEMPLATE = `Dear {hr_name},

I hope this email finds you well. I recently came across {company} and was truly impressed by your work and vision. I am reaching out to express my sincere interest in any {position} opportunities at your organisation.

As a recent Computer Science graduate, I bring a solid foundation in software engineering principles combined with genuine enthusiasm to contribute from day one.

Why I am a great fit:
• Strong academic background with real-world project experience
• Proficient in modern programming languages and frameworks
• Quick learner — always up to date with emerging technologies
• Excellent problem-solving, communication, and teamwork skills
• Passionate about building impactful, scalable software solutions

I am confident that my technical aptitude, eagerness to learn, and strong work ethic will make me a valuable addition to the {company} team.

My resume is attached to this email for your review. I would welcome the opportunity to discuss how my background aligns with your team's needs.

Thank you very much for your time and consideration.

Warm regards,
{name}
{email}
{phone}`;

window.DEFAULT_EMAIL_TEMPLATE = DEFAULT_EMAIL_TEMPLATE;
