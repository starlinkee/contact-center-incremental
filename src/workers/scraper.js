const db = require('../db');
const { searchPlaces, getPlaceDetails, searchSingleArea, COST_PER_CALL } = require('../services/places');
const { addJob } = require('../queue');

async function scraperWorker(payload) {
  if (payload.lat != null && payload.lng != null && payload.keywords) {
    return coordScrape(payload);
  }
  return legacyScrape(payload);
}

async function coordScrape(payload) {
  const { lat, lng, radiusKm, keywords, budget } = payload;
  const radiusMeters = radiusKm * 1000;

  console.log(`[Scrape] Starting: (${lat},${lng}) radius=${radiusKm}km, keywords=${JSON.stringify(keywords)}, budget=$${budget}`);

  const budgetTracker = { remaining: budget, callsMade: 0 };
  const allPlaces = new Map();

  for (const keyword of keywords) {
    if (budgetTracker.remaining <= 0) {
      console.log(`[Scrape] Budget exhausted, skipping keyword "${keyword}"`);
      break;
    }

    console.log(`[Scrape] Searching keyword: "${keyword}"`);
    await searchSingleArea(keyword, lat, lng, radiusMeters, budgetTracker, allPlaces);
  }

  console.log(`[Scrape] Found ${allPlaces.size} unique places, used ${budgetTracker.callsMade} API calls ($${(budgetTracker.callsMade * COST_PER_CALL).toFixed(2)})`);

  const insertBiz = db.prepare(`
    INSERT OR IGNORE INTO businesses (place_id, name, address, category, rating, phone, website)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let detailsFetched = 0;
  let emailsQueued = 0;

  for (const place of allPlaces.values()) {
    let phone = null;
    let website = null;

    if (budgetTracker.remaining > 0) {
      try {
        const details = await getPlaceDetails(place.place_id);
        budgetTracker.remaining -= COST_PER_CALL;
        budgetTracker.callsMade++;
        phone = details.phone;
        website = details.website;
        detailsFetched++;
        await new Promise(r => setTimeout(r, 200));
      } catch (err) {
        console.error(`[Scrape] Failed to get details for ${place.name}:`, err.message);
      }
    } else {
      console.warn(`[Scrape] Budget exhausted, skipping details for "${place.name}" (no website will be fetched)`);
    }

    insertBiz.run(place.place_id, place.name, place.address, place.category, place.rating, phone, website);

    if (website) {
      const biz = db.prepare('SELECT id FROM businesses WHERE place_id = ?').get(place.place_id);
      if (biz) {
        addJob('email_scrape', { businessId: biz.id, website });
        emailsQueued++;
      }
    }
  }

  console.log(`[Scrape] Complete. ${allPlaces.size} places, ${detailsFetched} details fetched, ${emailsQueued} email scrapes queued, ${budgetTracker.callsMade} total API calls`);

  return {
    businessesFound: allPlaces.size,
    detailsFetched,
    emailsQueued,
    apiCalls: budgetTracker.callsMade,
    costUsed: +(budgetTracker.callsMade * COST_PER_CALL).toFixed(2),
  };
}

async function legacyScrape(payload) {
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

    try {
      const details = await getPlaceDetails(place.place_id);
      updateBiz.run(details.phone, details.website, place.place_id);

      if (details.website) {
        const biz = db.prepare('SELECT id FROM businesses WHERE place_id = ?').get(place.place_id);
        if (biz) {
          addJob('email_scrape', { businessId: biz.id, website: details.website });
        }
      }
    } catch (err) {
      console.error(`Failed to get details for ${place.name}:`, err.message);
    }

    await new Promise(r => setTimeout(r, 200));
  }

  console.log(`Scraped ${places.length} places for "${query}"`);
  return { businessesFound: places.length };
}

module.exports = scraperWorker;
