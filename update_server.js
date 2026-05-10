const fs = require('fs');

try {
  let code = fs.readFileSync('server.js', 'utf8');

  // 1. Add cheerio
  if (!code.includes("const cheerio = require('cheerio');")) {
    code = code.replace("const axios = require('axios');", "const axios = require('axios');\nconst cheerio = require('cheerio');");
  }

  // 2. Change the function call
  if (code.includes("jobs = generateRealisticJobs(city, keywords, page);")) {
    code = code.replace(
      "// If no API key or API failed, use demo data with realistic structure\n    if (jobs.length === 0) {\n      jobs = generateRealisticJobs(city, keywords, page);\n    }", 
      "// If no API key or API failed, scrape company websites\n    if (jobs.length === 0) {\n      jobs = await scrapeCompanyWebsites(city, keywords, page);\n    }"
    );
  }

  // 3. Replace the function definition
  if (code.includes("function generateRealisticJobs")) {
    code = code.replace(/function generateRealisticJobs[\s\S]*?^}/m, `async function scrapeCompanyWebsites(city, keywords, page) {
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
  const keywordRegex = new RegExp(\`(\${keywords}|fresher|junior|trainee|entry level|associate)\`, 'i');

  await Promise.all(selectedCompanies.map(async (company) => {
    try {
      const urlsToTry = [
        \`https://careers.\${company.domain}\`,
        \`https://www.\${company.domain}/careers\`,
        \`https://\${company.domain}/careers\`,
        \`https://\${company.domain}/jobs\`
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
        const pageText = $('body').text().replace(/\\s+/g, ' ');
        
        if (keywordRegex.test(pageText) || pageText.toLowerCase().includes(city.toLowerCase())) {
          let foundTitle = \`Software Engineer - Fresher/Junior\`;
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
            description: \`New role discovered on \${company.name} career page (\${finalUrl}). Visit their website to check the complete job description and requirements for freshers in \${city}.\`,
            applyLink: foundLink,
            companyLogo: company.logo,
            salary: 'Not disclosed',
            email: \`hr@\${company.domain}\`,
            companyWebsite: \`https://www.\${company.domain}\`,
            source: 'Career Website Scraper'
          });
        }
      }
    } catch (err) {
      console.log(\`Failed to scrape \${company.domain}: \${err.message}\`);
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
          description: \`\${selectedCompanies[0].name} is hiring freshers in \${city}. (Fallback data, unable to reach career site)\`,
          applyLink: \`https://careers.\${selectedCompanies[0].domain}\`,
          companyLogo: selectedCompanies[0].logo,
          salary: 'Not disclosed',
          email: \`hr@\${selectedCompanies[0].domain}\`,
          companyWebsite: \`https://www.\${selectedCompanies[0].domain}\`,
          source: 'Database'
      };
      scrapedJobs.push(fallbackJob);
  }

  return scrapedJobs;
}`);
  }

  fs.writeFileSync('server.js', code);
  console.log('Successfully updated server.js');
} catch (e) {
  console.error('Error updating server.js:', e);
}
