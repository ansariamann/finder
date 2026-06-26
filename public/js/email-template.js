/**
 * Default PLAIN TEXT email template for fresher job applications.
 * Placeholders: {company}, {position}, {name}, {phone}, {email}, {hr_name}
 */
const DEFAULT_EMAIL_TEMPLATE = `Dear {hr_name},

I hope you're doing well. I am writing to express my interest in opportunities at **{company}**.

As a recent Computer Science graduate, I am proficient in backend technologies like **Java, Spring Boot, and Microservices**, along with **Python, Machine Learning (Scikit-learn, PyTorch), and Generative AI**.

I am actively looking for fresher/junior opportunities as a Java Backend Developer, Software Engineer, or Junior ML Engineer. I am particularly interested in roles that allow me to work on scalable systems and AI-powered applications.

I have attached my resume for your reference and would be grateful to discuss how I can contribute to your team.

Thank you for your time.

Best regards,
{name}
{email}
{phone}`;

window.DEFAULT_EMAIL_TEMPLATE = DEFAULT_EMAIL_TEMPLATE;
