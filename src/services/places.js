const axios = require('axios');
const config = require('../config');
const db = require('../db');

const COST_PER_CALL = config.costPerPlacesCall;

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
  const results = [];
  let pageToken = null;

  while (results.length < maxResults) {

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

/**
 * Geocode a city name to get viewport bounds.
 * Returns { northeast: { lat, lng }, southwest: { lat, lng } }
 */
async function geocodeCity(city) {
  const params = {
    address: city,
    key: config.googlePlacesApiKey,
  };

  const response = await axios.get('https://maps.googleapis.com/maps/api/geocode/json', { params });
  trackApiCall();

  const data = response.data;
  if (data.status !== 'OK' || !data.results.length) {
    throw new Error(`Geocoding failed for "${city}": ${data.status}`);
  }

  const viewport = data.results[0].geometry.viewport;
  return {
    northeast: viewport.northeast,
    southwest: viewport.southwest,
  };
}


/**
 * Search a single area for a keyword, fetching all pages (up to 60 results).
 * @param {string} keyword - Search keyword
 * @param {number} lat - Center latitude
 * @param {number} lng - Center longitude
 * @param {number} radiusMeters - Search radius in meters
 * @param {object} budget - { remaining, callsMade } (mutated in place)
 * @param {Map} visited - place_id → place data (dedup)
 */
async function searchSingleArea(keyword, lat, lng, radiusMeters, budget, visited) {
  let pageToken = null;
  let newResults = 0;

  while (true) {
    if (budget.remaining <= 0) break;

    const params = {
      query: keyword,
      location: `${lat},${lng}`,
      radius: Math.min(radiusMeters, 50000),
      key: config.googlePlacesApiKey,
    };
    if (pageToken) params.pagetoken = pageToken;

    const response = await axios.get('https://maps.googleapis.com/maps/api/place/textsearch/json', { params });
    trackApiCall();
    budget.remaining -= COST_PER_CALL;
    budget.callsMade++;

    const data = response.data;
    if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
      console.error(`Places API error: ${data.status} - ${data.error_message || ''}`);
      break;
    }

    for (const place of (data.results || [])) {
      if (!visited.has(place.place_id)) {
        visited.set(place.place_id, {
          place_id: place.place_id,
          name: place.name,
          address: place.formatted_address,
          rating: place.rating || null,
          category: (place.types || []).join(', '),
        });
        newResults++;
      }
    }

    pageToken = data.next_page_token;
    if (!pageToken) break;

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log(`[Search] "${keyword}" at (${lat.toFixed(3)},${lng.toFixed(3)}) r=${radiusMeters}m → ${newResults} new results (${visited.size} total)`);
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

module.exports = { searchPlaces, getPlaceDetails, getTodayUsage, geocodeCity, searchSingleArea, COST_PER_CALL };
