const axios = require('axios');
const cheerio = require('cheerio');

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Common non-personal email patterns to skip
const SKIP_PATTERNS = [
  /noreply@/i, /no-reply@/i, /mailer-daemon@/i,
  /example\.com$/i, /sentry\.io$/i, /wixpress\.com$/i,
  /@.*\.png$/i, /@.*\.jpg$/i,
];

function extractEmailsFromHtml(html) {
  const emails = new Set();

  // Extract from mailto: links
  const $ = cheerio.load(html);
  $('a[href^="mailto:"]').each((_, el) => {
    const href = $(el).attr('href');
    const match = href.match(/mailto:([^?&]+)/);
    if (match) emails.add(match[1].toLowerCase().trim());
  });

  // Extract from raw text
  const text = $.text() + ' ' + html;
  const matches = text.match(EMAIL_REGEX) || [];
  for (const email of matches) {
    emails.add(email.toLowerCase().trim());
  }

  // Filter out junk
  return [...emails].filter(email => {
    return !SKIP_PATTERNS.some(p => p.test(email));
  });
}

async function scrapeEmailsFromUrl(url) {
  if (!url) return [];

  // Ensure URL has protocol
  if (!url.startsWith('http')) url = 'https://' + url;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
      maxRedirects: 3,
    });

    const emails = extractEmailsFromHtml(response.data);

    // Also try /contact page if no emails found
    if (emails.length === 0) {
      try {
        const contactUrl = new URL('/contact', url).href;
        const contactResp = await axios.get(contactUrl, {
          timeout: 10000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LeadBot/1.0)' },
          maxRedirects: 3,
        });
        return extractEmailsFromHtml(contactResp.data);
      } catch {
        // contact page doesn't exist, that's fine
      }
    }

    return emails;
  } catch (err) {
    console.error(`Failed to scrape ${url}:`, err.message);
    return [];
  }
}

module.exports = { scrapeEmailsFromUrl, extractEmailsFromHtml };
