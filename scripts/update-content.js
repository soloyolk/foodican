const fs = require('fs');
const path = require('path');

const CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID || 'UCE6VXOmQeNKBqVspyX5qoWA';

const HANDLE =
  process.env.YOUTUBE_HANDLE || '@thefoodican';

const API_KEY = process.env.YOUTUBE_API_KEY;

const MAX_ITEMS =
  Number(process.env.MAX_ITEMS || 100);

const FEED_URL =
  `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const OUTPUT_FILE =
  path.join(__dirname, '..', 'data', 'content.json');

const MAX_GEOCODES_PER_RUN = 4;
const GEOCODE_DELAY_MS = 15000;

const NOMINATIM_USER_AGENT =
  'Foodican/1.0 (automated content map updater)';

if (!API_KEY) {
  throw new Error(
    'YOUTUBE_API_KEY is missing. Add it as a GitHub Actions secret.'
  );
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'Foodican GitHub Action/1.0',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(
      `HTTP ${response.status} while fetching ${url}`
    );
  }

  return response.text();
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      'User-Agent': 'Foodican GitHub Action/1.0',
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `HTTP ${response.status} while fetching ${url}: ${body.slice(0, 500)}`
    );
  }

  return response.json();
}

function decodeXml(value = '') {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'");
}

function getXmlValue(entry, tag) {
  const match = entry.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`)
  );

  return match ? decodeXml(match[1].trim()) : '';
}

function getXmlAttribute(entry, tag, attribute) {
  const match = entry.match(
    new RegExp(`<${tag}\\b[^>]*\\b${attribute}="([^"]*)"`)
  );

  return match ? decodeXml(match[1]) : '';
}

function parseFeed(xml) {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];

  return entries
    .map(entry => {
      const videoId = getXmlValue(entry, 'yt:videoId');
      const title = getXmlValue(entry, 'media:title');
      const description = getXmlValue(entry, 'media:description');
      const published = getXmlValue(entry, 'published');

      const url =
        getXmlAttribute(entry, 'link', 'href') ||
        `https://www.youtube.com/watch?v=${videoId}`;

      return {
        id: videoId,
        title,
        description,
        published,
        url
      };
    })
    .filter(item => item.id && item.title)
    .slice(0, MAX_ITEMS);
}

function detectShort(item) {
  const text =
    `${item.url || ''} ${item.title || ''} ${item.description || ''}`
      .toLowerCase();

  return (
    text.includes('/shorts/') ||
    /\bshorts?\b/.test(text)
  );
}

function detectCategory(item) {
  const text =
    `${item.title || ''} ${item.description || ''}`
      .toLowerCase();

  const foodTerms = [
    'restaurant',
    'food',
    'eat',
    'eating',
    'menu',
    'dish',
    'dishes',
    'pizza',
    'burger',
    'sushi',
    'seafood',
    'noodle',
    'ramen',
    'bbq',
    'barbecue',
    'buffet',
    'pasta',
    'taco',
    'tacos',
    'korean',
    'vietnamese',
    'chinese',
    'japanese',
    'italian',
    'mexican',
    'cafe',
    'coffee',
    'bakery',
    'grill',
    'steak',
    'brunch',
    'lunch',
    'dinner',
    'breakfast'
  ];

  const techTerms = [
    'iphone',
    'android',
    'apple',
    'google',
    'computer',
    'laptop',
    'phone',
    'technology',
    'tech',
    'gadget',
    'ai',
    'software'
  ];

  const travelTerms = [
    'travel',
    'hotel',
    'resort',
    'airport',
    'flight',
    'vacation',
    'trip',
    'tour'
  ];

  const lifeTerms = [
    'life',
    'family',
    'home',
    'adventure',
    'daily'
  ];

  if (foodTerms.some(term => text.includes(term))) {
    return 'food';
  }

  if (techTerms.some(term => text.includes(term))) {
    return 'tech';
  }

  if (travelTerms.some(term => text.includes(term))) {
    return 'travel';
  }

  if (lifeTerms.some(term => text.includes(term))) {
    return 'life';
  }

  return 'food';
}

function locationFromHashtag(text) {
  const hashtags = text.match(/#[a-z0-9_-]+/gi) || [];

  for (const hashtag of hashtags) {
    const value = hashtag
      .replace(/^#/, '')
      .replace(/_/g, ' ')
      .replace(/-/g, ' ')
      .trim();

    if (
      /\b(tx|texas|ca|california|ny|new york|fl|florida)\b/i.test(value)
    ) {
      return value;
    }

    if (/^[a-z]+tx$/i.test(value)) {
      return value.replace(/tx$/i, '') + ', TX';
    }

    if (/^[a-z]+ca$/i.test(value)) {
      return value.replace(/ca$/i, '') + ', CA';
    }
  }

  return '';
}

function detectLocation(text = '') {
  // ZIP code
  const zipMatch = text.match(/\b\d{5}(?:-\d{4})?\b/);

  if (zipMatch) {
    return zipMatch[0];
  }

  // Explicit hashtags
  const hashtagLocation = locationFromHashtag(text);

  if (hashtagLocation) {
    return hashtagLocation;
  }

  // City + state patterns.
  //
  // Deliberately require the city portion to begin with a capital letter
  // so prose such as "Craving some seafood, IN" is not treated as
  // "some seafood, Indiana".
  const cityStateMatch = text.match(
    /\b([A-Z][A-Za-z.'’-]*(?:\s+[A-Z][A-Za-z.'’-]*){0,4}),\s*(TX|CA|NY|FL|AZ|CO|WA|IL|GA|NC|SC|VA|TN|OK|PA|NJ|MA|MI|OH|IN|MD|MO|MN|WI|OR|NV|UT|KS|AR|AL|LA|MS|KY|CT|IA|NE|NM|ID|HI|AK)\b/
  );

  if (cityStateMatch) {
    return `${cityStateMatch[1]}, ${cityStateMatch[2]}`;
  }

  // Full state names
  const stateMatch = text.match(
    /\b(Texas|California|New York|Florida|Arizona|Colorado|Washington|Illinois|Georgia|North Carolina|South Carolina|Virginia|Tennessee|Oklahoma|Pennsylvania|New Jersey|Massachusetts|Michigan|Ohio|Maryland|Missouri|Minnesota|Wisconsin|Oregon|Nevada|Utah|Kansas|Arkansas|Alabama|Louisiana|Mississippi|Kentucky|Connecticut|Iowa|Nebraska|New Mexico|Idaho|Hawaii|Alaska)\b/i
  );

  if (stateMatch) {
    return stateMatch[1];
  }

  // Common cities
  const cities = [
    'McKinney',
    'Frisco',
    'Plano',
    'Dallas',
    'Houston',
    'Austin',
    'San Antonio',
    'Fort Worth',
    'Arlington',
    'Irving',
    'Richardson',
    'Allen',
    'Prosper',
    'Carrollton',
    'Lewisville',
    'Denton',
    'Atlanta',
    'Chicago',
    'Los Angeles',
    'San Diego',
    'San Francisco',
    'New York',
    'Miami',
    'Orlando',
    'Tampa',
    'Las Vegas',
    'Seattle',
    'Boston',
    'Philadelphia',
    'Phoenix',
    'Denver'
  ];

  const lower = text.toLowerCase();

  for (const city of cities) {
    if (lower.includes(city.toLowerCase())) {
      return city;
    }
  }

  return '';
}

function normalizeLocation(location = '') {
  return location
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .trim();
}

function normalizeYouTubeLocation(description = '') {
  return normalizeLocation(description);
}

async function fetchYouTubeLocations(videoIds) {
  const results = new Map();

  if (!videoIds.length) {
    return results;
  }

  // YouTube allows up to 50 IDs per videos.list request.
  for (let i = 0; i < videoIds.length; i += 50) {
    const batch = videoIds.slice(i, i + 50);

    const params = new URLSearchParams({
      part: 'snippet,recordingDetails',
      id: batch.join(','),
      key: API_KEY
    });

    const url =
      `https://www.googleapis.com/youtube/v3/videos?${params}`;

    const data = await fetchJson(url);

    for (const video of data.items || []) {
      const recording = video.recordingDetails || {};
      const location = recording.location;

      if (
        location &&
        Number.isFinite(Number(location.latitude)) &&
        Number.isFinite(Number(location.longitude))
      ) {
        results.set(video.id, {
          location: normalizeYouTubeLocation(
            recording.locationDescription || ''
          ),
          latitude: Number(location.latitude),
          longitude: Number(location.longitude),
          locationPrecision: 'exact',
          locationSource: 'youtube'
        });
      }
    }
  }

  return results;
}

function mergeItem(oldItem, freshItem, youtubeLocations) {
  const youtubeLocation = youtubeLocations.get(freshItem.id);

  if (youtubeLocation) {
    return {
      ...oldItem,
      ...freshItem,
      ...youtubeLocation
    };
  }

  const detectedLocation =
    normalizeLocation(
      detectLocation(
        `${freshItem.title || ''}\n${freshItem.description || ''}`
      )
    );

  const oldLocation =
    normalizeLocation(oldItem?.location || '');

  const sameLocation =
    detectedLocation &&
    oldLocation &&
    detectedLocation.toLowerCase() === oldLocation.toLowerCase();

  return {
    ...oldItem,
    ...freshItem,
    location:
      detectedLocation ||
      oldItem?.location ||
      '',
    latitude:
      sameLocation && Number.isFinite(oldItem?.latitude)
        ? oldItem.latitude
        : oldItem?.latitude ?? null,
    longitude:
      sameLocation && Number.isFinite(oldItem?.longitude)
        ? oldItem.longitude
        : oldItem?.longitude ?? null,
    locationPrecision:
      sameLocation && oldItem?.locationPrecision
        ? oldItem.locationPrecision
        : oldItem?.locationPrecision || null,
    locationSource:
      sameLocation && oldItem?.locationSource
        ? oldItem.locationSource
        : oldItem?.locationSource || null
  };
}

function looksLikeVenue(title = '') {
  const text = title.toLowerCase();

  const venueTerms = [
    'restaurant',
    'grill',
    'cafe',
    'café',
    'kitchen',
    'buffet',
    'sushi',
    'seafood',
    'steakhouse',
    'barbecue',
    'bbq',
    'pizza',
    'bakery',
    'olive garden',
    'fish city',
    'yohe',
    'kim sơn',
    'kim son'
  ];

  return venueTerms.some(term => text.includes(term));
}

async function geocode(query) {
  const url =
    'https://nominatim.openstreetmap.org/search?' +
    new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      addressdetails: '1'
    });

  const data = await fetchJson(url, {
    headers: {
      'User-Agent': NOMINATIM_USER_AGENT
    }
  });

  if (!Array.isArray(data) || !data.length) {
    return null;
  }

  const result = data[0];

  const latitude = Number(result.lat);
  const longitude = Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,
    longitude,
    locationPrecision: 'geocoded',
    locationSource: 'nominatim'
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function geocodeMissingLocations(items) {
  let geocodesUsed = 0;

  for (const item of items) {
    if (geocodesUsed >= MAX_GEOCODES_PER_RUN) {
      break;
    }

    if (!item.location) {
      continue;
    }

    if (
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
    ) {
      continue;
    }

    let result = null;

    if (looksLikeVenue(item.title)) {
      const venueQuery =
        `${item.title}, ${item.location}, USA`;

      console.log(
        `Geocoding venue: ${venueQuery}`
      );

      result = await geocode(venueQuery);

      geocodesUsed++;

      if (result) {
        Object.assign(item, result);
        continue;
      }

      await sleep(GEOCODE_DELAY_MS);
    }

    const locationQuery =
      `${item.location}, USA`;

    console.log(
      `Geocoding location: ${locationQuery}`
    );

    result = await geocode(locationQuery);

    geocodesUsed++;

    if (result) {
      Object.assign(item, result);
    }

    if (geocodesUsed < MAX_GEOCODES_PER_RUN) {
      await sleep(GEOCODE_DELAY_MS);
    }
  }

  return items;
}

async function main() {
  console.log(`Fetching YouTube feed for ${HANDLE}...`);

  const xml = await fetchText(FEED_URL);

  const feedItems = parseFeed(xml);

  console.log(
    `Found ${feedItems.length} videos in the public feed.`
  );

  if (!feedItems.length) {
    throw new Error('YouTube feed contained no videos.');
  }

  let existing = {
    generatedAt: null,
    channel: HANDLE,
    channelId: CHANNEL_ID,
    itemCount: 0,
    items: []
  };

  if (fs.existsSync(OUTPUT_FILE)) {
    try {
      existing = JSON.parse(
        fs.readFileSync(OUTPUT_FILE, 'utf8')
      );
    } catch (error) {
      console.warn(
        'Could not parse existing content.json. Starting fresh.'
      );
    }
  }

  const existingById = new Map(
    (existing.items || []).map(item => [item.id, item])
  );

  const videoIds = feedItems.map(item => item.id);

  console.log(
    `Checking YouTube location metadata for ${videoIds.length} videos...`
  );

  const youtubeLocations =
    await fetchYouTubeLocations(videoIds);

  console.log(
    `YouTube locations found: ${youtubeLocations.size}`
  );

  for (const [videoId, location] of youtubeLocations) {
    console.log(
      `  ${videoId}: ${location.location || 'YouTube location'} ` +
      `(${location.latitude}, ${location.longitude})`
    );
  }

  const mergedById = new Map();

  for (const feedItem of feedItems) {
    const oldItem =
      existingById.get(feedItem.id) || {};

    const merged =
      mergeItem(
        oldItem,
        {
          ...feedItem,
          isShort: oldItem.isShort ?? detectShort(feedItem),
          category:
            oldItem.category ||
            detectCategory(feedItem)
        },
        youtubeLocations
      );

    mergedById.set(feedItem.id, merged);
  }

  // Preserve older videos that aren't currently present in the
  // limited public Atom feed.
  for (const oldItem of existing.items || []) {
    if (!mergedById.has(oldItem.id)) {
      mergedById.set(oldItem.id, oldItem);
    }
  }

  let items = Array.from(mergedById.values());

  // Newest first.
  items.sort((a, b) => {
    const aDate = new Date(a.published || 0).getTime();
    const bDate = new Date(b.published || 0).getTime();

    return bDate - aDate;
  });

  items = await geocodeMissingLocations(items);

  const output = {
    generatedAt: new Date().toISOString(),
    channel: HANDLE,
    channelId: CHANNEL_ID,
    itemCount: items.length,
    items
  };

  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    { recursive: true }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(output, null, 2) + '\n',
    'utf8'
  );

  const mapped = items.filter(
    item =>
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
  );

  const youtubeMapped = items.filter(
    item => item.locationSource === 'youtube'
  );

  console.log('');
  console.log('Foodican update complete.');
  console.log(`Total videos: ${items.length}`);
  console.log(`Mapped videos: ${mapped.length}`);
  console.log(`YouTube-mapped videos: ${youtubeMapped.length}`);
  console.log(
    `Unmapped videos: ${items.length - mapped.length}`
  );
  console.log(`Output: ${OUTPUT_FILE}`);
}

main().catch(error => {
  console.error('');
  console.error('Foodican update failed:');
  console.error(error);
  process.exit(1);
});