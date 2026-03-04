const axios = require('axios');
const config = require('../config');
const db = require('../db');

const COST_PER_CALL = 0.032; // Google Places Text Search ~$32/1000

function getTodayUsage() {
  const today = new Date().toISOString().slice(0, 10);
  let row = db.prepare('SELECT * FROM daily_usage WHERE date = ?').get(today);
  if (!row) {
    db.prepare('INSERT OR IGNORE INTO daily_usage (date) VALUES (?)').run(today);
    row = db.prepare('SELECT * FROM daily_usage WHERE date = ?').get(today);
  }
  return row;
}

function trackApiCall() {
  const today = new Date().toISOString().slice(0, 10);
  db.prepare(`
    UPDATE daily_usage
    SET places_api_calls = places_api_calls + 1,
        places_api_cost = places_api_cost + ?
    WHERE date = ?
  `).run(COST_PER_CALL, today);
}

async function searchPlaces(query, maxResults = 20) {
  const usage = getTodayUsage();
  if (usage.places_api_cost >= config.googlePlacesDailyBudget) {
    throw new Error('Daily Places API budget exceeded');
  }

  const results = [];
  let pageToken = null;

  while (results.length < maxResults) {
    if (usage.places_api_cost + (results.length / 20 + 1) * COST_PER_CALL >= config.googlePlacesDailyBudget) {
      break;
    }

    const params = {
      query,
      key: config.googlePlacesApiKey,
    };
    if (pageToken) params.pagetoken = pageToken;

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params });
    trackApiCall();

    const data = response.data;
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      throw new Error(`Places API error: ${data.status} - ${data.error_message || ''}`);
    }

    for (const place of (data.results || [])) {
      if (results.length >= maxResults) break;
      results.push({
        place_id: place.place_id,
        name: place.name,
        address: place.formatted_address,
        rating: place.rating || null,
        category: (place.types || []).join(', '),
      });
    }

    pageToken = data.next_page_token;
    if (!pageToken) break;

    // Google requires a short delay before using next_page_token
    await new Promise(r => setTimeout(r, 2000));
  }

  return results;
}

async function getPlaceDetails(placeId) {
  const params = {
    place_id: placeId,
    fields: 'formatted_phone_number,website',
    key: config.googlePlacesApiKey,
  };

  const response = await axios.get('https://maps.googleapis.com/maps/api/place/details/json', { params });
  trackApiCall();

  const result = response.data.result || {};
  return {
    phone: result.formatted_phone_number || null,
    website: result.website || null,
  };
}

module.exports = { searchPlaces, getPlaceDetails, getTodayUsage };
