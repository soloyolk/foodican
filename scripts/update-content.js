const fs = require('fs');
const path = require('path');

const CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID ||
  'UCE6VXOmQeNKBqVspyX5qoWA';

const HANDLE =
  process.env.YOUTUBE_HANDLE ||
  '@thefoodican';

const API_KEY =
  process.env.YOUTUBE_API_KEY;

const MAX_ITEMS =
  Number(process.env.MAX_ITEMS || 100);

const OUTPUT_FILE =
  path.join(
    process.cwd(),
    'data',
    'content.json'
  );

const FEED_URL =
  `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const YOUTUBE_API_URL =
  'https://www.googleapis.com/youtube/v3/videos';

const NOMINATIM_URL =
  'https://nominatim.openstreetmap.org/search';

const USER_AGENT =
  'Foodican/1.0 (automated content map updater)';

const GEOCODE_DELAY_MS = 15000;
const MAX_GEOCODES_PER_RUN = 4;


/* ================================================================
   HELPERS
   ================================================================ */

function sleep(ms) {
  return new Promise(resolve =>
    setTimeout(resolve, ms)
  );
}


function cleanText(value) {
  if (!value) return '';

  return String(value)
    .replace(/\s+/g, ' ')
    .trim();
}


function escapeXml(value) {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}


function getXmlValue(xml, tag) {
  const regex =
    new RegExp(
      `<${tag}>([\\s\\S]*?)<\\/${tag}>`
    );

  const match = xml.match(regex);

  return match
    ? escapeXml(match[1])
    : '';
}


function getXmlAttribute(xml, tag, attribute) {
  const regex =
    new RegExp(
      `<${tag}[^>]*\\s${attribute}="([^"]*)"[^>]*>`
    );

  const match = xml.match(regex);

  return match
    ? escapeXml(match[1])
    : '';
}


function detectShort(item, existing) {
  /*
   * Preserve the previously detected value when available.
   * This is important because the public Atom feed may expose
   * Shorts through a regular watch URL.
   */
  if (
    existing &&
    typeof existing.isShort === 'boolean'
  ) {
    return existing.isShort;
  }

  const url =
    item.url || '';

  return (
    url.includes('/shorts/') ||
    item.title?.toLowerCase().includes('#shorts')
  );
}


/* ================================================================
   CATEGORY DETECTION
   ================================================================ */

function detectCategory(title, description) {
  const text =
    `${title} ${description}`.toLowerCase();

  /*
   * Food gets priority over generic lifestyle words.
   */
  const foodKeywords = [
    'restaurant',
    'food',
    'eat',
    'eating',
    'menu',
    'dish',
    'pizza',
    'burger',
    'sushi',
    'ramen',
    'noodle',
    'seafood',
    'steak',
    'bbq',
    'barbecue',
    'chicken',
    'pasta',
    'taco',
    'tacos',
    'pho',
    'buffet',
    'bakery',
    'cafe',
    'café',
    'coffee',
    'dessert',
    'ice cream',
    'boba',
    'brunch',
    'lunch',
    'dinner',
    'breakfast',
    'chef',
    'kitchen',
    'grill',
    'olive garden',
    'kim son',
    'kim sơn'
  ];

  const techKeywords = [
    'tech',
    'technology',
    'iphone',
    'android',
    'apple',
    'samsung',
    'computer',
    'laptop',
    'phone',
    'software',
    ' ai ',
    'gadget',
    'device',
    'keyboard',
    'monitor',
    'camera'
  ];

  const travelKeywords = [
    'travel',
    'trip',
    'hotel',
    'vacation',
    'airport',
    'flight',
    'resort',
    'tour',
    'visit',
    'destination'
  ];

  if (
    foodKeywords.some(keyword =>
      text.includes(keyword)
    )
  ) {
    return 'food';
  }

  if (
    techKeywords.some(keyword =>
      text.includes(keyword)
    )
  ) {
    return 'tech';
  }

  if (
    travelKeywords.some(keyword =>
      text.includes(keyword)
    )
  ) {
    return 'travel';
  }

  return 'life';
}


/* ================================================================
   LOCATION FALLBACK DETECTION
   ================================================================ */

function looksLikeVenue(value) {
  if (!value) return false;

  const text =
    cleanText(value);

  if (text.length < 3) {
    return false;
  }

  const venueWords = [
    'restaurant',
    'grill',
    'cafe',
    'café',
    'bar',
    'bakery',
    'market',
    'kitchen',
    'buffet',
    'pizza',
    'sushi',
    'seafood',
    'steak',
    'coffee',
    'brew',
    'bbq',
    'barbecue',
    'garden'
  ];

  const lower =
    text.toLowerCase();

  return venueWords.some(
    word =>
      lower.includes(word)
  );
}


function detectLocation(title, description) {
  const combined =
    `${title}\n${description}`;

  /*
   * City, ST
   *
   * Require the city to begin with a capital letter.
   * This prevents prose such as:
   *
   * "Craving some seafood, IN"
   *
   * from becoming a fake location.
   */
  const cityStateRegex =
    /\b([A-Z][A-Za-zÀ-ÿ'’.\- ]{2,40}),\s*([A-Z]{2})\b/g;

  let match;

  while (
    (match = cityStateRegex.exec(combined))
  ) {
    const city =
      cleanText(match[1]);

    const state =
      cleanText(match[2]);

    if (
      city.length < 3 ||
      city.split(' ').length > 6
    ) {
      continue;
    }

    return `${city}, ${state}`;
  }

  /*
   * Explicit "in CITY" or "at VENUE".
   */
  const inRegex =
    /\b(?:in|at)\s+([A-Z][A-Za-zÀ-ÿ'’.\- ]{2,50})/;

  const inMatch =
    combined.match(inRegex);

  if (inMatch) {
    const candidate =
      cleanText(inMatch[1]);

    if (
      candidate &&
      candidate.length <= 60
    ) {
      return candidate;
    }
  }

  /*
   * If the title itself clearly looks like a venue,
   * use it as a final fallback.
   */
  if (
    looksLikeVenue(title)
  ) {
    return cleanText(title);
  }

  return '';
}


/* ================================================================
   YOUTUBE PUBLIC ATOM FEED
   ================================================================ */

async function fetchFeed() {
  console.log(
    `Fetching YouTube feed for ${HANDLE}...`
  );

  const response =
    await fetch(
      FEED_URL,
      {
        headers: {
          'User-Agent':
            'Foodican GitHub Action/1.0'
        }
      }
    );

  if (!response.ok) {
    throw new Error(
      `YouTube feed returned HTTP ${response.status}`
    );
  }

  return response.text();
}


function parseFeed(xml) {
  const entries =
    xml.match(
      /<entry>[\s\S]*?<\/entry>/g
    ) || [];

  return entries
    .slice(0, MAX_ITEMS)
    .map(entry => {
      const id =
        getXmlValue(
          entry,
          'yt:videoId'
        );

      const title =
        getXmlValue(
          entry,
          'title'
        );

      const publishedAt =
        getXmlValue(
          entry,
          'published'
        );

      const updatedAt =
        getXmlValue(
          entry,
          'updated'
        );

      const description =
        getXmlValue(
          entry,
          'media:description'
        );

      const thumbnail =
        getXmlAttribute(
          entry,
          'media:thumbnail',
          'url'
        );

      const link =
        getXmlAttribute(
          entry,
          'link',
          'href'
        );

      return {
        id,

        title:
          cleanText(title),

        publishedAt,

        updatedAt,

        description,

        thumbnail,

        url:
          link ||
          `https://www.youtube.com/watch?v=${id}`
      };
    })
    .filter(
      item => item.id
    );
}


/* ================================================================
   EXISTING CONTENT
   ================================================================ */

function loadExistingContent() {
  if (
    !fs.existsSync(
      OUTPUT_FILE
    )
  ) {
    return {
      generatedAt: null,
      channelId: CHANNEL_ID,
      channelHandle: HANDLE,
      items: []
    };
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        OUTPUT_FILE,
        'utf8'
      )
    );
  } catch (error) {
    console.warn(
      `Could not parse existing content.json: ${error.message}`
    );

    return {
      generatedAt: null,
      channelId: CHANNEL_ID,
      channelHandle: HANDLE,
      items: []
    };
  }
}


/* ================================================================
   YOUTUBE DATA API
   ================================================================ */

async function fetchYouTubeLocations(videoIds) {
  /*
   * CRITICAL OPTIMIZATION:
   *
   * This function is NEVER called unless there are new videos.
   */
  if (!videoIds.length) {
    console.log(
      'No new videos. Skipping YouTube Data API.'
    );

    return new Map();
  }

  if (!API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY is not configured.'
    );
  }

  console.log(
    `Checking YouTube location metadata for ${videoIds.length} new video(s)...`
  );

  const locations =
    new Map();

  /*
   * YouTube supports multiple video IDs in a single request.
   */
  const BATCH_SIZE = 50;

  for (
    let i = 0;
    i < videoIds.length;
    i += BATCH_SIZE
  ) {
    const batch =
      videoIds.slice(
        i,
        i + BATCH_SIZE
      );

    const url =
      new URL(
        YOUTUBE_API_URL
      );

    url.searchParams.set(
      'part',
      'snippet,recordingDetails'
    );

    url.searchParams.set(
      'id',
      batch.join(',')
    );

    url.searchParams.set(
      'key',
      API_KEY
    );

    const response =
      await fetch(url);

    if (!response.ok) {
      const body =
        await response.text();

      throw new Error(
        `YouTube Data API returned HTTP ${response.status}: ${body}`
      );
    }

    const data =
      await response.json();

    for (
      const video
      of data.items || []
    ) {
      const recording =
        video.recordingDetails;

      const coordinates =
        recording?.location;

      const description =
        cleanText(
          recording?.locationDescription
        );

      if (
        coordinates &&
        Number.isFinite(
          Number(
            coordinates.latitude
          )
        ) &&
        Number.isFinite(
          Number(
            coordinates.longitude
          )
        )
      ) {
        locations.set(
          video.id,
          {
            location:
              description ||
              cleanText(
                video.snippet?.title
              ),

            latitude:
              Number(
                coordinates.latitude
              ),

            longitude:
              Number(
                coordinates.longitude
              ),

            locationPrecision:
              'exact',

            locationSource:
              'youtube'
          }
        );
      }
    }
  }

  console.log(
    `YouTube locations found: ${locations.size}`
  );

  for (
    const [
      id,
      location
    ]
    of locations
  ) {
    console.log(
      `  ${id}: ${location.location} (${location.latitude}, ${location.longitude})`
    );
  }

  return locations;
}


/* ================================================================
   GEOCODING FALLBACK
   ================================================================ */

async function geocodeLocation(location) {
  if (!location) {
    return null;
  }

  const url =
    new URL(
      NOMINATIM_URL
    );

  url.searchParams.set(
    'q',
    location
  );

  url.searchParams.set(
    'format',
    'jsonv2'
  );

  url.searchParams.set(
    'limit',
    '1'
  );

  const response =
    await fetch(
      url,
      {
        headers: {
          'User-Agent':
            USER_AGENT
        }
      }
    );

  if (!response.ok) {
    console.warn(
      `Geocoding failed for "${location}": HTTP ${response.status}`
    );

    return null;
  }

  const results =
    await response.json();

  if (
    !results.length
  ) {
    return null;
  }

  const result =
    results[0];

  const latitude =
    Number(result.lat);

  const longitude =
    Number(result.lon);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude)
  ) {
    return null;
  }

  return {
    latitude,

    longitude,

    locationPrecision:
      'city',

    locationSource:
      'geocoding'
  };
}


/* ================================================================
   CONTENT COMPARISON
   ================================================================ */

function normalizeForComparison(data) {
  /*
   * generatedAt is intentionally excluded.
   *
   * This allows us to determine whether the actual content
   * changed without causing a deployment every six hours.
   */
  return JSON.stringify(
    {
      channelId:
        data.channelId,

      channelHandle:
        data.channelHandle,

      items:
        data.items
    }
  );
}


/* ================================================================
   BUILD CONTENT
   ================================================================ */

async function buildContent() {
  const existing =
    loadExistingContent();

  const existingById =
    new Map(
      existing.items.map(
        item => [
          item.id,
          item
        ]
      )
    );

  /*
   * STEP 1:
   * Free YouTube Atom feed.
   */
  const feedXml =
    await fetchFeed();

  const feedItems =
    parseFeed(feedXml);

  if (
    !feedItems.length
  ) {
    throw new Error(
      'YouTube feed contained zero videos.'
    );
  }

  console.log(
    `Found ${feedItems.length} videos in the public feed.`
  );


  /*
   * STEP 2:
   * Identify ONLY videos that aren't already known.
   *
   * Existing videos do not trigger API calls.
   */
  const newFeedItems =
    feedItems.filter(
      item =>
        !existingById.has(
          item.id
        )
    );

  console.log(
    `New videos discovered: ${newFeedItems.length}`
  );


  /*
   * STEP 3:
   * Only now call YouTube Data API.
   *
   * Zero new videos = zero API calls.
   */
  const youtubeLocations =
    await fetchYouTubeLocations(
      newFeedItems.map(
        item => item.id
      )
    );


  /*
   * STEP 4:
   * Start with existing content.
   *
   * This means videos outside the Atom feed are preserved.
   */
  const items =
    existing.items.map(
      item => ({
        ...item
      })
    );


  let geocodesUsed = 0;


  /*
   * STEP 5:
   * Process ONLY new videos.
   */
  for (
    const feedItem
    of newFeedItems
  ) {
    const item = {
      id:
        feedItem.id,

      title:
        feedItem.title,

      description:
        feedItem.description,

      url:
        feedItem.url,

      thumbnail:
        feedItem.thumbnail ||
        `https://i.ytimg.com/vi/${feedItem.id}/hqdefault.jpg`,

      publishedAt:
        feedItem.publishedAt,

      updatedAt:
        feedItem.updatedAt,

      isShort:
        detectShort(
          feedItem,
          null
        ),

      category:
        detectCategory(
          feedItem.title,
          feedItem.description
        ),

      location:
        '',

      latitude:
        null,

      longitude:
        null,

      locationPrecision:
        null,

      locationSource:
        null
    };


    /* ------------------------------------------------------------
       Priority 1: YouTube place tag
       ------------------------------------------------------------ */

    const youtubeLocation =
      youtubeLocations.get(
        feedItem.id
      );

    if (
      youtubeLocation
    ) {
      Object.assign(
        item,
        youtubeLocation
      );
    }


    /* ------------------------------------------------------------
       Priority 2: text-based location detection
       ------------------------------------------------------------ */

    else {
      const detected =
        detectLocation(
          feedItem.title,
          feedItem.description
        );

      if (
        detected
      ) {
        item.location =
          detected;
      }
    }


    /* ------------------------------------------------------------
       Priority 3: geocoding fallback
       ------------------------------------------------------------ */

    if (
      item.location &&
      typeof item.latitude !== 'number' &&
      geocodesUsed <
        MAX_GEOCODES_PER_RUN
    ) {
      const result =
        await geocodeLocation(
          item.location
        );

      geocodesUsed++;

      if (
        result
      ) {
        Object.assign(
          item,
          result
        );

        console.log(
          `Geocoded: ${item.location} → ${result.latitude}, ${result.longitude}`
        );
      } else {
        console.log(
          `Could not geocode: ${item.location}`
        );
      }

      /*
       * Respect Nominatim's rate limit.
       */
      if (
        geocodesUsed <
        MAX_GEOCODES_PER_RUN
      ) {
        await sleep(
          GEOCODE_DELAY_MS
        );
      }
    }


    items.push(
      item
    );
  }


  /*
   * STEP 6:
   * Sort newest first.
   */
  items.sort(
    (a, b) =>
      new Date(
        b.publishedAt || 0
      ) -
      new Date(
        a.publishedAt || 0
      )
  );


  /*
   * STEP 7:
   * Calculate statistics.
   */
  const mapped =
    items.filter(
      item =>
        typeof item.latitude === 'number' &&
        typeof item.longitude === 'number'
    );

  const youtubeMapped =
    items.filter(
      item =>
        item.locationSource ===
        'youtube'
    );

  console.log('');
  console.log(
    'Foodican update complete.'
  );
  console.log('');

  console.log(
    `Total videos: ${items.length}`
  );

  console.log(
    `New videos processed: ${newFeedItems.length}`
  );

  console.log(
    `Mapped videos: ${mapped.length}`
  );

  console.log(
    `YouTube-mapped videos: ${youtubeMapped.length}`
  );

  console.log(
    `Unmapped videos: ${items.length - mapped.length}`
  );

  console.log('');


  /*
   * IMPORTANT:
   *
   * If nothing actually changed, preserve the previous
   * generatedAt value.
   */
  const candidate = {
    generatedAt:
      existing.generatedAt ||
      new Date().toISOString(),

    channelId:
      CHANNEL_ID,

    channelHandle:
      HANDLE,

    items
  };

  const existingComparable =
    normalizeForComparison(
      existing
    );

  const candidateComparable =
    normalizeForComparison(
      candidate
    );

  if (
    existingComparable ===
    candidateComparable
  ) {
    console.log(
      'No actual content changes detected.'
    );

    return existing;
  }

  /*
   * Actual content changed.
   */
  candidate.generatedAt =
    new Date().toISOString();

  console.log(
    'Actual content changes detected.'
  );

  return candidate;
}


/* ================================================================
   WRITE FILE
   ================================================================ */

async function main() {
  const data =
    await buildContent();

  fs.mkdirSync(
    path.dirname(
      OUTPUT_FILE
    ),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      data,
      null,
      2
    ) + '\n'
  );

  console.log(
    `Output: ${OUTPUT_FILE}`
  );
}


main().catch(error => {
  console.error('');
  console.error(
    'Foodican content update failed:'
  );
  console.error(
    error.message
  );
  console.error('');

  process.exit(1);
});