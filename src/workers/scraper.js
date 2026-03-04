const db = require('../db');
const { searchPlaces, getPlaceDetails } = require('../services/places');
const { addJob } = require('../queue');

async function scraperWorker(payload) {
  const { query, maxResults = 20 } = payload;

  console.log(`Scraping places: "${query}" (max ${maxResults})`);
  const places = await searchPlaces(query, maxResults);

  const insertBiz = db.prepare(`
    INSERT OR IGNORE INTO businesses (place_id, name, address, category, rating)
    VALUES (?, ?, ?, ?, ?)
  `);

  const updateBiz = db.prepare(`
    UPDATE businesses SET phone = ?, website = ? WHERE place_id = ?
  `);

  for (const place of places) {
    insertBiz.run(place.place_id, place.name, place.address, place.category, place.rating);

    // Get phone & website details
    try {
      const details = await getPlaceDetails(place.place_id);
      updateBiz.run(details.phone, details.website, place.place_id);

      // Auto-queue email scraping if website found
      if (details.website) {
        const biz = db.prepare('SELECT id FROM businesses WHERE place_id = ?').get(place.place_id);
        if (biz) {
          addJob('email_scrape', { businessId: biz.id, website: details.website });
        }
      }
    } catch (err) {
      console.error(`Failed to get details for ${place.name}:`, err.message);
    }

    // Small delay between detail requests
    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Scraped ${places.length} places for "${query}"`);
}

module.exports = scraperWorker;
