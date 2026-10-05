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

const FULL_HISTORY_IMPORT =
  String(process.env.YOUTUBE_FULL_HISTORY || 'false').toLowerCase() === 'true';

const HISTORY_MARKER_FILE =
  path.join(
    process.cwd(),
    'data',
    '.youtube-history-imported'
  );

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

const YOUTUBE_PLAYLIST_ITEMS_URL =
  'https://www.googleapis.com/youtube/v3/playlistItems';

const YOUTUBE_CHANNELS_URL =
  'https://www.googleapis.com/youtube/v3/channels';

const FEED_RETRIES = 3;
const FEED_RETRY_DELAY_MS = 2500;

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


// ============================================================
// FOODICAN VIDEO CATEGORIZATION
// ============================================================

const CATEGORY_KEYWORDS = {
  food: {
    // Strong food / restaurant signals
    strong: [
      "restaurant",
      "restaurants",
      "buffet",
      "all you can eat",
      "ayce",
      "food review",
      "restaurant review",
      "food tasting",
      "taste test",
      "food hall",
      "food court",
      "food truck",
      "steakhouse",
      "bakery",
      "cafe",
      "café",
      "coffee shop",
      "tea shop",
      "boba",
      "brunch",
      "dinner",
      "lunch",
      "breakfast",
      "chef",
      "menu",
      "dish",
      "meal",
      "cuisine",
      "recipe",
      "cooking"
    ],

    // Cuisines
    cuisine: [
      "vietnamese",
      "chinese",
      "korean",
      "japanese",
      "thai",
      "indian",
      "mexican",
      "italian",
      "french",
      "taiwanese",
      "filipino",
      "indonesian",
      "malaysian",
      "cambodian",
      "laotian",
      "hawaiian",
      "persian",
      "mediterranean",
      "greek",
      "turkish",
      "ethiopian",
      "caribbean",
      "soul food",
      "southern",
      "tex mex",
      "tex-mex",
      "cajun",
      "creole"
    ],

    // Dishes / ingredients
    dishes: [
      "pho",
      "ramen",
      "sushi",
      "sashimi",
      "dim sum",
      "dumplings",
      "noodles",
      "fried rice",
      "rice",
      "banh mi",
      "bánh mì",
      "spring rolls",
      "egg rolls",
      "wings",
      "chicken",
      "burger",
      "burgers",
      "cheeseburger",
      "pizza",
      "pasta",
      "taco",
      "tacos",
      "burrito",
      "burritos",
      "quesadilla",
      "quesadillas",
      "nachos",
      "steak",
      "brisket",
      "ribs",
      "seafood",
      "shrimp",
      "crab",
      "lobster",
      "oyster",
      "oysters",
      "fish",
      "salmon",
      "soup",
      "sandwich",
      "sandwiches",
      "dessert",
      "desserts",
      "cake",
      "ice cream",
      "donut",
      "donuts",
      "doughnut",
      "doughnuts",
      "pastry",
      "pastries",
      "chocolate",
      "bubble tea"
    ],

    // General food terminology
    general: [
      "food",
      "foodie",
      "eats",
      "eat",
      "eating",
      "dining",
      "delicious",
      "yummy",
      "tasty",
      "meal",
      "meals",
      "taste",
      "tasting"
    ],

    hashtags: [
      "#food",
      "#foodie",
      "#foodreview",
      "#restaurant",
      "#restaurants",
      "#eats",
      "#eat",
      "#dining",
      "#buffet",
      "#foodlover",
      "#foodlovers",
      "#foodblogger",
      "#foodblog",
      "#yummy",
      "#delicious"
    ]
  },

  tech: {
    // Strong consumer-tech signals
    strong: [
      "smart home",
      "home automation",
      "smart lighting",
      "smart lights",
      "smart lock",
      "smart locks",
      "smart thermostat",
      "smart thermostats",
      "smart doorbell",
      "smart doorbells",
      "home security",
      "security camera",
      "security cameras",
      "doorbell camera",
      "doorbell cameras",
      "camera gear",
      "action camera",
      "action cameras",
      "mirrorless camera",
      "mirrorless cameras",
      "dslr",
      "webcam",
      "webcams",
      "smartphone",
      "smartphones",
      "phone review",
      "tech review",
      "product review",
      "gadget",
      "gadgets",
      "electronics"
    ],

    // General technology
    general: [
      "technology",
      "technology review",
      "tech",
      "device",
      "devices",
      "gear",
      "consumer electronics",
      "consumer tech",
      "computer",
      "computers",
      "laptop",
      "laptops",
      "desktop",
      "desktop pc",
      "pc",
      "tablet",
      "tablets",
      "software",
      "app",
      "apps",
      "artificial intelligence",
      "ai",
      "automation",
      "robot",
      "robotics"
    ],

    // Cameras / photography / video
    cameras: [
      "camera",
      "cameras",
      "digital camera",
      "photography",
      "photography gear",
      "videography",
      "video gear",
      "drone",
      "drones",
      "gimbal",
      "microphone",
      "microphones",
      "lighting",
      "camera lens",
      "camera lenses"
    ],

    // Phones / mobile
    phones: [
      "phone",
      "phones",
      "mobile",
      "mobile phone",
      "iphone",
      "android",
      "google pixel",
      "pixel",
      "galaxy",
      "samsung",
      "oneplus"
    ],

    // Computers
    computers: [
      "macbook",
      "ipad",
      "computer",
      "laptop",
      "desktop",
      "pc",
      "monitor",
      "monitors",
      "keyboard",
      "keyboards",
      "mouse",
      "mechanical keyboard"
    ],

    // Accessories / gear
    gear: [
      "headphones",
      "headphone",
      "earbuds",
      "earbud",
      "smartwatch",
      "smartwatches",
      "fitness tracker",
      "fitness trackers",
      "wearable",
      "wearables",
      "charger",
      "chargers",
      "power bank",
      "power banks",
      "usb",
      "dock",
      "docking station",
      "accessory",
      "accessories"
    ],

    // AI
    ai: [
      "ai",
      "artificial intelligence",
      "chatgpt",
      "generative ai",
      "machine learning",
      "ai tools",
      "ai tool"
    ],

    hashtags: [
      "#tech",
      "#technology",
      "#gadgets",
      "#gear",
      "#smarthome",
      "#smart home",
      "#camera",
      "#cameras",
      "#photography",
      "#videography",
      "#iphone",
      "#android",
      "#techreview",
      "#productreview",
      "#electronics"
    ]
  },

  travel: {
    strong: [
      "hotel",
      "hotels",
      "resort",
      "resorts",
      "airport",
      "airline",
      "flight",
      "flights",
      "vacation",
      "road trip",
      "cruise",
      "cruising",
      "airbnb",
      "travel guide",
      "travel vlog",
      "traveling",
      "travelling",
      "travel",
      "trip",
      "trips"
    ],

    general: [
      "destination",
      "destinations",
      "tour",
      "touring",
      "visiting",
      "exploring",
      "explore",
      "getaway",
      "weekend getaway",
      "roadtrip"
    ],

    hashtags: [
      "#travel",
      "#traveling",
      "#travelling",
      "#travelvlog",
      "#vacation",
      "#roadtrip",
      "#travelguide",
      "#traveling"
    ]
  },

  life: {
    // Events
    events: [
      "event",
      "events",
      "festival",
      "festivals",
      "fair",
      "fairs",
      "expo",
      "exhibition",
      "concert",
      "concerts",
      "show",
      "shows",
      "party",
      "parties",
      "birthday party",
      "celebration",
      "celebrations",
      "community event",
      "local event",
      "special event",
      "pop up",
      "popup",
      "grand opening",
      "opening day",
      "conference",
      "convention",
      "meetup",
      "meet up"
    ],

    // Things to do / experiences
    experiences: [
      "things to do",
      "things to do in",
      "fun things to do",
      "activity",
      "activities",
      "experience",
      "experiences",
      "what to do",
      "weekend activity",
      "weekend activities",
      "family activity",
      "family activities",
      "indoor activity",
      "outdoor activity",
      "attraction",
      "attractions"
    ],

    // Life hacks / useful information
    hacks: [
      "life hack",
      "life hacks",
      "lifehack",
      "lifehacks",
      "hack",
      "hacks",
      "tip",
      "tips",
      "trick",
      "tricks",
      "tips and tricks",
      "how to",
      "how-to",
      "guide",
      "easy way",
      "easiest way",
      "best way",
      "save time",
      "save money",
      "money saving",
      "time saving",
      "organization",
      "organizing",
      "productivity",
      "shortcut",
      "shortcuts",
      "smart trick",
      "useful tips",
      "helpful tips",
      "things you need to know",
      "things you should know",
      "did you know"
    ],

    // Discoveries / recommendations
    discoveries: [
      "hidden gem",
      "hidden gems",
      "local gem",
      "local gems",
      "must try",
      "must see",
      "worth it",
      "worth checking out",
      "check this out",
      "you need to know",
      "you need to see",
      "you need to try"
    ],

    hashtags: [
      "#lifehack",
      "#lifehacks",
      "#hack",
      "#hacks",
      "#tips",
      "#tipsandtricks",
      "#howto",
      "#events",
      "#event",
      "#festival",
      "#thingstodo",
      "#activities",
      "#experience",
      "#weekend",
      "#weekendactivities"
    ]
  }
};


// ============================================================
// CATEGORY HELPERS
// ============================================================

function normalizeText(value = "") {
  return String(value)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function containsKeyword(text, keyword) {
  const normalizedKeyword = normalizeText(keyword);

  if (!normalizedKeyword) return false;

  // For phrases, simple includes() works well.
  if (normalizedKeyword.includes(" ")) {
    return text.includes(normalizedKeyword);
  }

  // For individual words, use word boundaries so things like
  // "tech" don't accidentally match unrelated words.
  const escaped = normalizedKeyword.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "i").test(text);
}

function countMatches(text, keywords) {
  return keywords.reduce((count, keyword) => {
    return count + (containsKeyword(text, keyword) ? 1 : 0);
  }, 0);
}


// ============================================================
// CATEGORY ENGINE
// ============================================================

function categorizeVideo(video) {
  const title = normalizeText(video.title || "");
  const description = normalizeText(video.description || "");

  // YouTube can return tags as an array.
  const tags = Array.isArray(video.tags)
    ? video.tags.map(normalizeText).join(" ")
    : normalizeText(video.tags || "");

  const hashtags = [
    ...(title.match(/#[a-z0-9_-]+/gi) || []),
    ...(description.match(/#[a-z0-9_-]+/gi) || [])
  ]
    .map(normalizeText)
    .join(" ");

  // Title gets the most influence.
  const titleText = title;

  // Description + tags provide supporting evidence.
  const bodyText = `${description} ${tags}`;

  const scores = {
    food: 0,
    tech: 0,
    travel: 0,
    life: 0
  };

  // ----------------------------------------------------------
  // FOOD
  // ----------------------------------------------------------

  scores.food += countMatches(
    titleText,
    CATEGORY_KEYWORDS.food.strong
  ) * 8;

  scores.food += countMatches(
    titleText,
    CATEGORY_KEYWORDS.food.cuisine
  ) * 7;

  scores.food += countMatches(
    titleText,
    CATEGORY_KEYWORDS.food.dishes
  ) * 6;

  scores.food += countMatches(
    titleText,
    CATEGORY_KEYWORDS.food.general
  ) * 4;

  scores.food += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.food.strong
  ) * 4;

  scores.food += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.food.cuisine
  ) * 5;

  scores.food += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.food.dishes
  ) * 3;

  scores.food += countMatches(
    hashtags,
    CATEGORY_KEYWORDS.food.hashtags
  ) * 5;


  // ----------------------------------------------------------
  // TECH
  // ----------------------------------------------------------

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.strong
  ) * 8;

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.cameras
  ) * 7;

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.phones
  ) * 7;

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.gear
  ) * 6;

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.ai
  ) * 7;

  scores.tech += countMatches(
    titleText,
    CATEGORY_KEYWORDS.tech.general
  ) * 4;

  scores.tech += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.tech.strong
  ) * 4;

  scores.tech += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.tech.cameras
  ) * 4;

  scores.tech += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.tech.phones
  ) * 4;

  scores.tech += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.tech.gear
  ) * 3;

  scores.tech += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.tech.ai
  ) * 4;

  scores.tech += countMatches(
    hashtags,
    CATEGORY_KEYWORDS.tech.hashtags
  ) * 5;


  // ----------------------------------------------------------
  // TRAVEL
  // ----------------------------------------------------------

  scores.travel += countMatches(
    titleText,
    CATEGORY_KEYWORDS.travel.strong
  ) * 8;

  scores.travel += countMatches(
    titleText,
    CATEGORY_KEYWORDS.travel.general
  ) * 4;

  scores.travel += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.travel.strong
  ) * 4;

  scores.travel += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.travel.general
  ) * 2;

  scores.travel += countMatches(
    hashtags,
    CATEGORY_KEYWORDS.travel.hashtags
  ) * 5;


  // ----------------------------------------------------------
  // LIFE
  // ----------------------------------------------------------

  scores.life += countMatches(
    titleText,
    CATEGORY_KEYWORDS.life.events
  ) * 8;

  scores.life += countMatches(
    titleText,
    CATEGORY_KEYWORDS.life.experiences
  ) * 8;

  scores.life += countMatches(
    titleText,
    CATEGORY_KEYWORDS.life.hacks
  ) * 8;

  scores.life += countMatches(
    titleText,
    CATEGORY_KEYWORDS.life.discoveries
  ) * 6;

  scores.life += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.life.events
  ) * 4;

  scores.life += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.life.experiences
  ) * 4;

  scores.life += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.life.hacks
  ) * 4;

  scores.life += countMatches(
    bodyText,
    CATEGORY_KEYWORDS.life.discoveries
  ) * 3;

  scores.life += countMatches(
    hashtags,
    CATEGORY_KEYWORDS.life.hashtags
  ) * 5;


  // ----------------------------------------------------------
  // IMPORTANT CONTEXT RULES
  // ----------------------------------------------------------

  // A city name by itself should NOT make something Travel.
  // We intentionally don't include cities in the keyword lists.

  // Restaurant/food-specific content gets a strong boost.
  if (
    /restaurant|buffet|steakhouse|food hall|food truck|cafe|café/.test(title)
  ) {
    scores.food += 10;
  }

  // Cuisine + restaurant/food context is an especially strong
  // indicator that the video belongs in Food.
  if (
    /vietnamese|chinese|korean|japanese|thai|indian|mexican|italian|taiwanese|filipino/.test(title) &&
    /restaurant|buffet|food|dining|eat|eats|cuisine|meal/.test(title)
  ) {
    scores.food += 12;
  }

  // Smart-home content is specifically Tech.
  if (
    /smart home|smart lock|smart thermostat|smart lighting|smart doorbell|security camera|home automation/.test(title)
  ) {
    scores.tech += 12;
  }

  // Camera/video gear is specifically Tech.
  if (
    /camera|cameras|camera gear|photography|videography|gimbal|webcam|microphone/.test(title)
  ) {
    scores.tech += 10;
  }

  // Phone content is specifically Tech.
  if (
    /iphone|android|smartphone|phone review|pixel|galaxy/.test(title)
  ) {
    scores.tech += 10;
  }


  // ----------------------------------------------------------
  // CHOOSE CATEGORY
  // ----------------------------------------------------------

  const sorted = Object.entries(scores)
    .sort((a, b) => b[1] - a[1]);

  const [winner, winningScore] = sorted[0];
  const [, secondScore] = sorted[1];

  // If absolutely nothing meaningful matched, default to Life.
  // This avoids pretending we know the category when we don't.
  if (winningScore === 0) {
    return "life";
  }

  // If the winner has a meaningful lead, use it.
  if (winningScore >= secondScore + 3) {
    return winner;
  }

  // For close calls, favor highly specific categories based
  // on the strongest evidence rather than a generic fallback.

  if (scores.food >= 8) {
    return "food";
  }

  if (scores.tech >= 8) {
    return "tech";
  }

  if (scores.travel >= 8) {
    return "travel";
  }

  if (scores.life >= 8) {
    return "life";
  }

  return winner;
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

  let lastError = null;

  for (let attempt = 1; attempt <= FEED_RETRIES; attempt++) {
    try {
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

      const xml = await response.text();

      if (!xml.includes('<entry>')) {
        throw new Error(
          'YouTube feed contained no entries'
        );
      }

      console.log(
        `YouTube feed succeeded on attempt ${attempt}.`
      );

      return xml;
    } catch (error) {
      lastError = error;

      console.warn(
        `YouTube feed attempt ${attempt}/${FEED_RETRIES} failed: ${error.message}`
      );

      if (attempt < FEED_RETRIES) {
        await sleep(FEED_RETRY_DELAY_MS);
      }
    }
  }

  console.warn(
    'YouTube public feed is temporarily unavailable. Falling back to the YouTube Data API.'
  );

  return null;
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

async function youtubeApiRequest(endpoint, params) {
  if (!API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY is not configured.'
    );
  }

  const url = new URL(endpoint);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set('key', API_KEY);

  const response = await fetch(url);
  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `YouTube Data API returned HTTP ${response.status}: ${body}`
    );
  }

  return JSON.parse(body);
}


async function getUploadsPlaylistId() {
  const data = await youtubeApiRequest(
    YOUTUBE_CHANNELS_URL,
    {
      part: 'contentDetails',
      id: CHANNEL_ID
    }
  );

  const channel = data.items?.[0];

  if (!channel) {
    throw new Error(
      `YouTube channel ${CHANNEL_ID} could not be found through the Data API.`
    );
  }

  const uploadsPlaylistId =
    channel.contentDetails?.relatedPlaylists?.uploads;

  if (!uploadsPlaylistId) {
    throw new Error(
      'YouTube channel does not expose an uploads playlist.'
    );
  }

  return uploadsPlaylistId;
}


async function fetchUploadVideoIds({ all = false } = {}) {
  const uploadsPlaylistId = await getUploadsPlaylistId();

  const ids = [];
  let pageToken = '';
  const maxVideos = all ? Number.MAX_SAFE_INTEGER : MAX_ITEMS;

  console.log(
    all
      ? 'Scanning the full YouTube uploads history...'
      : `Scanning up to ${MAX_ITEMS} recent YouTube uploads through the API...`
  );

  do {
    const params = {
      part: 'contentDetails',
      playlistId: uploadsPlaylistId,
      maxResults: '50'
    };

    if (pageToken) {
      params.pageToken = pageToken;
    }

    const data = await youtubeApiRequest(
      YOUTUBE_PLAYLIST_ITEMS_URL,
      params
    );

    for (const item of data.items || []) {
      const id = item.contentDetails?.videoId;

      if (id && !ids.includes(id)) {
        ids.push(id);
      }

      if (ids.length >= maxVideos) {
        break;
      }
    }

    if (ids.length >= maxVideos) {
      break;
    }

    pageToken = data.nextPageToken || '';
  } while (pageToken);

  console.log(
    `YouTube API upload scan found ${ids.length} video ID(s).`
  );

  return ids;
}


async function fetchYouTubeVideoDetails(videoIds) {
  const videos = new Map();

  if (!videoIds.length) {
    return videos;
  }

  const BATCH_SIZE = 50;

  for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
    const batch = videoIds.slice(i, i + BATCH_SIZE);

    const data = await youtubeApiRequest(
      YOUTUBE_API_URL,
      {
        part: 'snippet,recordingDetails',
        id: batch.join(',')
      }
    );

    for (const video of data.items || []) {
      videos.set(video.id, video);
    }
  }

  return videos;
}


function videoApiItemToContentItem(video, existing = null) {
  const snippet = video.snippet || {};
  const recording = video.recordingDetails || {};
  const coordinates = recording.location;

  const item = {
    id: video.id,
    title: cleanText(snippet.title),
    description: cleanText(snippet.description),
    url: `https://www.youtube.com/watch?v=${video.id}`,
    thumbnail:
      snippet.thumbnails?.high?.url ||
      snippet.thumbnails?.medium?.url ||
      snippet.thumbnails?.default?.url ||
      `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
    publishedAt: snippet.publishedAt || '',
    updatedAt: existing?.updatedAt || snippet.publishedAt || '',
    isShort: detectShort(
      {
        id: video.id,
        title: snippet.title,
        url: `https://www.youtube.com/watch?v=${video.id}`
      },
      existing
    ),
    category: categorizeVideo({
      title: snippet.title,
      description: snippet.description
    }),
    location: '',
    latitude: null,
    longitude: null,
    locationPrecision: null,
    locationSource: null
  };

  if (
    coordinates &&
    Number.isFinite(Number(coordinates.latitude)) &&
    Number.isFinite(Number(coordinates.longitude))
  ) {
    item.location =
      cleanText(recording.locationDescription) ||
      cleanText(snippet.title);
    item.latitude = Number(coordinates.latitude);
    item.longitude = Number(coordinates.longitude);
    item.locationPrecision = 'exact';
    item.locationSource = 'youtube';
  } else if (existing) {
    item.location = existing.location || '';
    item.latitude =
      typeof existing.latitude === 'number'
        ? existing.latitude
        : null;
    item.longitude =
      typeof existing.longitude === 'number'
        ? existing.longitude
        : null;
    item.locationPrecision = existing.locationPrecision || null;
    item.locationSource = existing.locationSource || null;
  }

  return item;
}


async function fetchYouTubeLocations(videoIds) {
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

  const videos = await fetchYouTubeVideoDetails(videoIds);
  const locations = new Map();

  for (const [id, video] of videos) {
    const recording = video.recordingDetails;
    const coordinates = recording?.location;
    const description = cleanText(
      recording?.locationDescription
    );

    if (
      coordinates &&
      Number.isFinite(Number(coordinates.latitude)) &&
      Number.isFinite(Number(coordinates.longitude))
    ) {
      locations.set(id, {
        location:
          description ||
          cleanText(video.snippet?.title),
        latitude: Number(coordinates.latitude),
        longitude: Number(coordinates.longitude),
        locationPrecision: 'exact',
        locationSource: 'youtube'
      });
    }
  }

  console.log(
    `YouTube locations found: ${locations.size}`
  );

  return locations;
}


function historyImportComplete() {
  return fs.existsSync(HISTORY_MARKER_FILE);
}


function markHistoryImportComplete() {
  fs.writeFileSync(
    HISTORY_MARKER_FILE,
    `${new Date().toISOString()}\n`
  );
}


async function fullHistoryImport(existingById) {
  if (!API_KEY) {
    throw new Error(
      'YOUTUBE_API_KEY is required for the full YouTube history import.'
    );
  }

  const videoIds = await fetchUploadVideoIds({ all: true });
  const videos = await fetchYouTubeVideoDetails(videoIds);
  const imported = [];

  for (const video of videos.values()) {
    imported.push(
      videoApiItemToContentItem(
        video,
        existingById.get(video.id) || null
      )
    );
  }

  console.log(
    `Full history import processed ${imported.length} video(s).`
  );

  return imported;
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
  const existing = loadExistingContent();

  const existingById = new Map(
    existing.items.map(item => [item.id, item])
  );

  let feedItems = [];
  let apiRecentVideos = new Map();
  const feedXml = await fetchFeed();

  if (feedXml) {
    feedItems = parseFeed(feedXml);

    console.log(
      `Found ${feedItems.length} videos in the public feed.`
    );
  } else if (API_KEY) {
    const recentIds = await fetchUploadVideoIds({ all: false });
    apiRecentVideos = await fetchYouTubeVideoDetails(recentIds);

    feedItems = Array.from(apiRecentVideos.values()).map(video => ({
      id: video.id,
      title: cleanText(video.snippet?.title),
      publishedAt: video.snippet?.publishedAt || '',
      updatedAt: video.snippet?.publishedAt || '',
      description: cleanText(video.snippet?.description),
      thumbnail:
        video.snippet?.thumbnails?.high?.url ||
        video.snippet?.thumbnails?.medium?.url ||
        video.snippet?.thumbnails?.default?.url ||
        `https://i.ytimg.com/vi/${video.id}/hqdefault.jpg`,
      url: `https://www.youtube.com/watch?v=${video.id}`
    }));

    console.log(
      `Using YouTube API fallback with ${feedItems.length} recent video(s).`
    );
  } else {
    throw new Error(
      'YouTube public feed is unavailable and YOUTUBE_API_KEY is not configured.'
    );
  }

  if (!feedItems.length) {
    throw new Error(
      'No YouTube videos were discovered.'
    );
  }

  /* --------------------------------------------------------------
     ONE-TIME FULL HISTORY IMPORT
     -------------------------------------------------------------- */

  let items = existing.items.map(item => ({ ...item }));

  if (FULL_HISTORY_IMPORT && !historyImportComplete()) {
    console.log('');
    console.log('========================================');
    console.log('   STARTING ONE-TIME FULL HISTORY IMPORT');
    console.log('========================================');
    console.log('');

    const imported = await fullHistoryImport(existingById);
    const byId = new Map();

    for (const item of items) {
      byId.set(item.id, item);
    }

    for (const item of imported) {
      byId.set(item.id, item);
    }

    items = Array.from(byId.values());

    /*
     * Mark the import only after all API work has completed.
     * The workflow will commit this marker with content.json.
     */
    markHistoryImportComplete();

    console.log(
      'Full YouTube history import completed and marked as done.'
    );
  }

  /* --------------------------------------------------------------
     NORMAL INCREMENTAL UPDATE
     -------------------------------------------------------------- */

  const knownIds = new Set(items.map(item => item.id));

  const newFeedItems = feedItems.filter(
    item => !knownIds.has(item.id)
  );

  console.log(
    `New videos discovered: ${newFeedItems.length}`
  );

  let youtubeLocations = new Map();

  if (apiRecentVideos.size && newFeedItems.length) {
    /*
     * The API fallback already fetched snippet + recordingDetails,
     * so reuse that response instead of making a second videos.list
     * request for the same videos.
     */
    for (const item of newFeedItems) {
      const video = apiRecentVideos.get(item.id);
      const coordinates = video?.recordingDetails?.location;

      if (
        coordinates &&
        Number.isFinite(Number(coordinates.latitude)) &&
        Number.isFinite(Number(coordinates.longitude))
      ) {
        youtubeLocations.set(item.id, {
          location:
            cleanText(video.recordingDetails?.locationDescription) ||
            cleanText(video.snippet?.title),
          latitude: Number(coordinates.latitude),
          longitude: Number(coordinates.longitude),
          locationPrecision: 'exact',
          locationSource: 'youtube'
        });
      }
    }

    console.log(
      `Reused API metadata for ${youtubeLocations.size} YouTube-mapped video(s).`
    );
  } else {
    youtubeLocations =
      await fetchYouTubeLocations(
        newFeedItems.map(item => item.id)
      );
  }

  /*
   * Re-run category detection locally for every known video.
   */
  for (const item of items) {
    item.category = categorizeVideo(item);
  }

  let geocodesUsed = 0;

  for (const feedItem of newFeedItems) {
    const youtubeLocation = youtubeLocations.get(feedItem.id);

    const item = {
      id: feedItem.id,
      title: feedItem.title,
      description: feedItem.description,
      url: feedItem.url,
      thumbnail:
        feedItem.thumbnail ||
        `https://i.ytimg.com/vi/${feedItem.id}/hqdefault.jpg`,
      publishedAt: feedItem.publishedAt,
      updatedAt: feedItem.updatedAt,
      isShort: detectShort(feedItem, null),
      category: categorizeVideo(feedItem),
      location: '',
      latitude: null,
      longitude: null,
      locationPrecision: null,
      locationSource: null
    };

    /* Priority 1: YouTube place tag */
    if (youtubeLocation) {
      Object.assign(item, youtubeLocation);
    } else {
      /* Priority 2: text-based location detection */
      const detected = detectLocation(
        feedItem.title,
        feedItem.description
      );

      if (detected) {
        item.location = detected;
      }
    }

    /* Priority 3: geocoding fallback */
    if (
      item.location &&
      typeof item.latitude !== 'number' &&
      geocodesUsed < MAX_GEOCODES_PER_RUN
    ) {
      const result = await geocodeLocation(item.location);
      geocodesUsed++;

      if (result) {
        Object.assign(item, result);

        console.log(
          `Geocoded: ${item.location} → ${result.latitude}, ${result.longitude}`
        );
      } else {
        console.log(
          `Could not geocode: ${item.location}`
        );
      }

      if (geocodesUsed < MAX_GEOCODES_PER_RUN) {
        await sleep(GEOCODE_DELAY_MS);
      }
    }

    items.push(item);
  }

  items.sort(
    (a, b) =>
      new Date(b.publishedAt || 0) -
      new Date(a.publishedAt || 0)
  );

  const mapped = items.filter(
    item =>
      typeof item.latitude === 'number' &&
      typeof item.longitude === 'number'
  );

  const youtubeMapped = items.filter(
    item => item.locationSource === 'youtube'
  );

  console.log('');
  console.log('Foodican update complete.');
  console.log('');
  console.log(`Total videos: ${items.length}`);
  console.log(`New videos processed: ${newFeedItems.length}`);
  console.log(`Mapped videos: ${mapped.length}`);
  console.log(`YouTube-mapped videos: ${youtubeMapped.length}`);
  console.log(`Unmapped videos: ${items.length - mapped.length}`);
  console.log('');

  const candidate = {
    generatedAt:
      existing.generatedAt ||
      new Date().toISOString(),
    channelId: CHANNEL_ID,
    channelHandle: HANDLE,
    items
  };

  const existingComparable = normalizeForComparison(existing);
  const candidateComparable = normalizeForComparison(candidate);

  /*
   * The one-time history marker is intentionally not part of
   * content.json. The workflow commits it separately.
   */
  if (existingComparable === candidateComparable) {
    console.log(
      'No actual content changes detected.'
    );

    return existing;
  }

  candidate.generatedAt = new Date().toISOString();

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