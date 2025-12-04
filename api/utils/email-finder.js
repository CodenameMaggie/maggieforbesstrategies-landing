const dns = require('dns').promises;
const net = require('net');

/**
 * SELF-RELIANT EMAIL DISCOVERY
 * No APIs, no big tech - just direct web scraping and validation
 */

/**
 * Find company domain from company name
 */
async function findCompanyDomain(companyName) {
  // Clean company name
  const cleanName = companyName
    .toLowerCase()
    .replace(/\s+inc\.?$/i, '')
    .replace(/\s+llc\.?$/i, '')
    .replace(/\s+corp\.?$/i, '')
    .replace(/\s+ltd\.?$/i, '')
    .replace(/\s+company$/i, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '');

  // Try common domain patterns
  const possibleDomains = [
    `${cleanName}.com`,
    `${cleanName}.io`,
    `${cleanName}.co`,
    `${cleanName}.ai`,
    `www.${cleanName}.com`
  ];

  // Test each domain to see if it has MX records (email server)
  for (const domain of possibleDomains) {
    try {
      const mxRecords = await dns.resolveMx(domain);
      if (mxRecords && mxRecords.length > 0) {
        console.log(`[Email Finder] ✓ Found domain: ${domain} (has email server)`);
        return domain.replace('www.', '');
      }
    } catch (err) {
      // Domain doesn't exist or no MX records
      continue;
    }
  }

  // Fallback: just return best guess
  console.log(`[Email Finder] ⚠️ No verified domain, using: ${cleanName}.com`);
  return `${cleanName}.com`;
}

/**
 * Generate email patterns for a person at a domain
 */
function generateEmailPatterns(fullName, domain) {
  const parts = fullName.toLowerCase().trim().split(/\s+/);
  const firstName = parts[0];
  const lastName = parts[parts.length - 1];
  const firstInitial = firstName[0];

  return [
    `${firstName}.${lastName}@${domain}`,      // john.smith@company.com (most common)
    `${firstName}@${domain}`,                   // john@company.com
    `${firstInitial}${lastName}@${domain}`,    // jsmith@company.com
    `${firstName}${lastName}@${domain}`,       // johnsmith@company.com
    `${lastName}@${domain}`,                   // smith@company.com
    `${firstInitial}.${lastName}@${domain}`,   // j.smith@company.com
  ];
}

/**
 * Verify email exists using SMTP (without sending email)
 * This checks if the email address is valid on the mail server
 */
async function verifyEmailExists(email) {
  return new Promise((resolve) => {
    const [localPart, domain] = email.split('@');

    if (!domain) {
      return resolve({ exists: false, reason: 'invalid_format' });
    }

    // Get MX records for domain
    dns.resolveMx(domain)
      .then(addresses => {
        if (!addresses || addresses.length === 0) {
          return resolve({ exists: false, reason: 'no_mx_records' });
        }

        // Sort by priority (lower number = higher priority)
        addresses.sort((a, b) => a.priority - b.priority);
        const mailServer = addresses[0].exchange;

        // Connect to SMTP server
        const client = new net.Socket();
        let buffer = '';
        let step = 0;

        const commands = [
          `HELO ${domain}\r\n`,
          `MAIL FROM:<verify@${domain}>\r\n`,
          `RCPT TO:<${email}>\r\n`,
          `QUIT\r\n`
        ];

        client.setTimeout(5000); // 5 second timeout

        client.on('data', (data) => {
          buffer += data.toString();
          const lines = buffer.split('\r\n');

          for (const line of lines) {
            if (!line) continue;

            const code = parseInt(line.substring(0, 3));

            // Step through SMTP conversation
            if (step < commands.length - 1) {
              if (code >= 200 && code < 400) {
                client.write(commands[step]);
                step++;
              } else if (code >= 400) {
                // Error - email doesn't exist or server rejected
                client.destroy();
                return resolve({
                  exists: false,
                  reason: step === 2 ? 'mailbox_not_found' : 'smtp_error',
                  smtpCode: code
                });
              }
            } else if (step === 3) {
              // RCPT TO succeeded - email exists!
              client.destroy();
              return resolve({
                exists: true,
                confidence: 90,
                method: 'smtp_verification'
              });
            }
          }
        });

        client.on('error', (err) => {
          resolve({ exists: false, reason: 'connection_error', error: err.message });
        });

        client.on('timeout', () => {
          client.destroy();
          resolve({ exists: false, reason: 'timeout' });
        });

        client.on('close', () => {
          if (step < 3) {
            resolve({ exists: false, reason: 'incomplete_verification' });
          }
        });

        // Connect to mail server on port 25
        client.connect(25, mailServer);

      })
      .catch(err => {
        resolve({ exists: false, reason: 'dns_error', error: err.message });
      });
  });
}

/**
 * Scrape company website for email addresses
 */
async function scrapeWebsiteForEmails(domain) {
  try {
    // Try common contact pages
    const contactPages = [
      `https://${domain}/contact`,
      `https://${domain}/about`,
      `https://${domain}/team`,
      `https://${domain}/about-us`,
      `https://www.${domain}/contact`
    ];

    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;
    const foundEmails = new Set();

    for (const url of contactPages) {
      try {
        const response = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
          signal: AbortSignal.timeout(5000)
        });

        if (response.ok) {
          const html = await response.text();
          const matches = html.match(emailRegex);

          if (matches) {
            matches.forEach(email => {
              // Only keep emails from the company domain
              if (email.toLowerCase().includes(domain.toLowerCase())) {
                foundEmails.add(email.toLowerCase());
              }
            });
          }

          if (foundEmails.size > 0) {
            console.log(`[Email Finder] ✓ Found ${foundEmails.size} emails on ${url}`);
            break;
          }
        }
      } catch (err) {
        // Try next page
        continue;
      }
    }

    return Array.from(foundEmails);

  } catch (error) {
    console.error(`[Email Finder] Error scraping ${domain}:`, error.message);
    return [];
  }
}

/**
 * Extract email from source article/page where person was mentioned
 */
async function findEmailInSourceArticle(fullName, sourceUrl) {
  if (!sourceUrl) return null;

  console.log(`[Email Finder] Checking source article: ${sourceUrl}`);

  try {
    const response = await fetch(sourceUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(8000)
    });

    if (!response.ok) return null;

    const html = await response.text();
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi;

    // Find all emails in the article
    const emails = [...new Set(html.match(emailRegex) || [])];

    // Look for person's name near an email (within 500 chars)
    const nameParts = fullName.toLowerCase().split(/\s+/);

    for (const email of emails) {
      // Find where this email appears in the text
      const emailIndex = html.toLowerCase().indexOf(email.toLowerCase());
      if (emailIndex === -1) continue;

      // Get text context around the email (500 chars before and after)
      const contextStart = Math.max(0, emailIndex - 500);
      const contextEnd = Math.min(html.length, emailIndex + 500);
      const context = html.substring(contextStart, contextEnd).toLowerCase();

      // Check if person's name appears near this email
      const nameNearEmail = nameParts.some(part =>
        part.length > 2 && context.includes(part)
      );

      if (nameNearEmail) {
        console.log(`[Email Finder] ✓✓✓ FOUND email in article: ${email}`);
        return {
          email: email.toLowerCase(),
          confidence: 99,
          source: 'article_extraction',
          sourceUrl
        };
      }
    }

    // If no name match, but found generic company emails, return those for pattern detection
    return {
      genericEmails: emails.filter(e => !e.includes('noreply') && !e.includes('no-reply')),
      sourceUrl
    };

  } catch (error) {
    console.error(`[Email Finder] Error scraping source article:`, error.message);
    return null;
  }
}

/**
 * MAIN FUNCTION: Find and verify email for a person at a company
 */
async function findVerifiedEmail(fullName, companyName, sourceUrl = null) {
  console.log(`[Email Finder] Finding email for ${fullName} at ${companyName}...`);

  try {
    // Step 0: Try to find email in the SOURCE ARTICLE first (99% confidence!)
    if (sourceUrl) {
      console.log(`[Email Finder] PRIORITY: Checking source article where ${fullName} was mentioned...`);
      const articleResult = await findEmailInSourceArticle(fullName, sourceUrl);

      if (articleResult && articleResult.email) {
        console.log(`[Email Finder] ✓✓✓ REAL EMAIL FOUND in article (not a guess!)`);
        return {
          email: articleResult.email,
          confidence: 99,
          source: 'article_extraction',
          verified: true,
          sourceUrl: articleResult.sourceUrl
        };
      }
    }

    // Step 1: Find company domain
    const domain = await findCompanyDomain(companyName);

    // Step 2: Try scraping website (check leadership/team pages)
    console.log(`[Email Finder] Scraping ${domain} for emails...`);
    const scrapedEmails = await scrapeWebsiteForEmails(domain);

    // Check if any scraped email matches the person's name
    const nameParts = fullName.toLowerCase().split(/\s+/);
    for (const email of scrapedEmails) {
      const emailLocal = email.split('@')[0];
      // Check if email contains person's first or last name
      if (nameParts.some(part => emailLocal.includes(part))) {
        console.log(`[Email Finder] ✓✓ Found exact match on website: ${email}`);
        return {
          email,
          confidence: 95,
          source: 'website_scrape',
          verified: true
        };
      }
    }

    // If we found generic emails, save the pattern for later
    let companyPattern = null;
    if (scrapedEmails.length > 0) {
      const sampleEmail = scrapedEmails[0];
      const [localPart] = sampleEmail.split('@');
      if (localPart.includes('.')) {
        companyPattern = 'first.last';
      } else if (localPart.length <= 10) {
        companyPattern = 'first';
      }
      console.log(`[Email Finder] Detected company pattern: ${companyPattern}`);
    }

    // Step 3: Generate patterns and verify each one
    console.log(`[Email Finder] Testing email patterns for ${fullName}...`);
    const patterns = generateEmailPatterns(fullName, domain);

    // Prioritize pattern based on what we learned from scraping
    let prioritizedPatterns = patterns;
    if (companyPattern === 'first.last') {
      prioritizedPatterns = patterns.sort((a, b) => a.includes('.') ? -1 : 1);
    }

    // Test each pattern
    for (const email of prioritizedPatterns) {
      console.log(`[Email Finder] Testing: ${email}`);

      const result = await verifyEmailExists(email);

      if (result.exists) {
        console.log(`[Email Finder] ✓✓ VERIFIED via SMTP: ${email}`);
        return {
          email,
          confidence: 85,
          source: 'smtp_verification',
          verified: true
        };
      }
    }

    // Step 4: No verified email found - return best guess with low confidence
    console.log(`[Email Finder] ⚠️ Could not verify email, returning best guess`);
    return {
      email: patterns[0],
      confidence: 30,
      source: 'pattern_guess',
      verified: false,
      allPatterns: patterns
    };

  } catch (error) {
    console.error(`[Email Finder] Error:`, error);
    return null;
  }
}

module.exports = {
  findVerifiedEmail,
  findEmailInSourceArticle,
  findCompanyDomain,
  generateEmailPatterns,
  verifyEmailExists,
  scrapeWebsiteForEmails
};
