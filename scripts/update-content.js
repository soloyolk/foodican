/* =========================================================
   FOODICAN CONTENT UPDATER
   YouTube Atom Feed + Location Detection + Geocoding

   Node 20+
   No external npm packages required.
   ========================================================= */

const fs = require("fs");
const path = require("path");


/* =========================================================
   CONFIG
   ========================================================= */

const CHANNEL_ID =
  process.env.YOUTUBE_CHANNEL_ID ||
  "UCE6VXOmQeNKBqVspyX5qoWA";

const HANDLE =
  process.env.YOUTUBE_HANDLE ||
  "@thefoodican";

const MAX_ITEMS =
  Number(process.env.MAX_ITEMS || 100);

const FEED_URL =
  `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`;

const OUTPUT_FILE =
  path.join(
    process.cwd(),
    "data",
    "content.json"
  );

/*
  Nominatim is intentionally used very lightly.

  We only geocode videos that have a location but don't
  already have coordinates.
*/
const MAX_GEOCODES_PER_RUN = 4;

const GEOCODE_DELAY_MS = 15000;

const NOMINATIM_USER_AGENT =
  "Foodican/1.0 (automated content map updater)";


/* =========================================================
   MAIN
   ========================================================= */

async function main() {

  console.log("========================================");
  console.log("FOODICAN CONTENT UPDATE");
  console.log("========================================");

  console.log(`Channel: ${HANDLE}`);
  console.log(`Channel ID: ${CHANNEL_ID}`);
  console.log(`Feed: ${FEED_URL}`);

  const xml =
    await fetchText(FEED_URL);

  if (!xml.includes("<entry")) {
    throw new Error(
      "YouTube feed contains no entries."
    );
  }

  const feedItems =
    parseFeed(xml);

  console.log(
    `Feed returned ${feedItems.length} item(s).`
  );

  const existing =
    loadExistingContent();

  const existingItems =
    Array.isArray(existing.items)
      ? existing.items
      : [];

  const existingById =
    new Map(
      existingItems.map(item => [
        item.id,
        item
      ])
    );

  /*
    Start with existing content so older YouTube videos
    don't disappear when the Atom feed rotates.
  */
  const mergedById =
    new Map();

  existingItems.forEach(item => {

    if (item && item.id) {
      mergedById.set(
        item.id,
        item
      );
    }

  });


  /* =======================================================
     MERGE NEW FEED ITEMS
     ======================================================= */

  for (const feedItem of feedItems) {

    const old =
      existingById.get(
        feedItem.id
      );

    const merged =
      mergeItem(
        old,
        feedItem
      );

    mergedById.set(
      merged.id,
      merged
    );
  }


  /* =======================================================
     NORMALIZE LOCATIONS
     ======================================================= */

  let items =
    Array.from(
      mergedById.values()
    );

  items =
    items.map(item => {

      if (item.location) {

        item.location =
          normalizeLocation(
            item.location
          );
      }

      return item;
    });


  /* =======================================================
     GEOCODE
     ======================================================= */

  await geocodeMissingLocations(
    items
  );


  /* =======================================================
     SORT
     ======================================================= */

  items.sort(
    (a, b) =>
      new Date(b.publishedAt || 0) -
      new Date(a.publishedAt || 0)
  );


  /*
    MAX_ITEMS applies to the final retained history.
  */
  items =
    items.slice(
      0,
      MAX_ITEMS
    );


  /* =======================================================
     OUTPUT
     ======================================================= */

  const output = {

    generatedAt:
      new Date().toISOString(),

    source: {
      platform: "youtube",
      handle: HANDLE,
      channelId: CHANNEL_ID,

      channelUrl:
        `https://www.youtube.com/channel/${CHANNEL_ID}`,

      feedUrl: FEED_URL
    },

    itemCount:
      items.length,

    items
  };


  fs.mkdirSync(
    path.dirname(OUTPUT_FILE),
    {
      recursive: true
    }
  );

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      output,
      null,
      2
    ) + "\n",
    "utf8"
  );


  console.log("");
  console.log(
    `Saved ${items.length} item(s) to ${OUTPUT_FILE}`
  );

  console.log("");
  console.log("LOCATION SUMMARY");

  const mapped =
    items.filter(item =>
      Number.isFinite(item.latitude) &&
      Number.isFinite(item.longitude)
    );

  const unmapped =
    items.filter(item =>
      !Number.isFinite(item.latitude) ||
      !Number.isFinite(item.longitude)
    );

  console.log(
    `Mapped: ${mapped.length}`
  );

  console.log(
    `Unmapped: ${unmapped.length}`
  );

  if (unmapped.length) {

    console.log("");
    console.log(
      "Unmapped videos:"
    );

    unmapped
      .slice(0, 10)
      .forEach(item => {

        console.log(
          `- ${item.title} | ${item.location || "NO LOCATION"}`
        );

      });
  }

  console.log("");
  console.log("Done.");
}


/* =========================================================
   FETCH
   ========================================================= */

async function fetchText(url) {

  const response =
    await fetch(
      url,
      {
        headers: {
          "User-Agent":
            "Foodican/1.0 automated content updater"
        }
      }
    );

  if (!response.ok) {

    throw new Error(
      `HTTP ${response.status} while fetching ${url}`
    );
  }

  return response.text();
}


/* =========================================================
   LOAD EXISTING CONTENT
   ========================================================= */

function loadExistingContent() {

  if (!fs.existsSync(OUTPUT_FILE)) {

    return {
      items: []
    };
  }

  try {

    return JSON.parse(
      fs.readFileSync(
        OUTPUT_FILE,
        "utf8"
      )
    );

  } catch (error) {

    console.warn(
      "Could not parse existing content.json. Starting fresh."
    );

    return {
      items: []
    };
  }
}


/* =========================================================
   XML HELPERS
   ========================================================= */

function getTag(
  xml,
  tag
) {

  const escaped =
    tag.replace(
      /[-/\\^$*+?.()|[\]{}]/g,
      "\\$&"
    );

  const regex =
    new RegExp(
      `<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`,
      "i"
    );

  const match =
    xml.match(regex);

  return match
    ? decodeXml(match[1].trim())
    : "";
}


function decodeXml(value) {

  return String(value || "")
    .replace(
      /<!\[CDATA\[([\s\S]*?)\]\]>/g,
      "$1"
    )
    .replace(
      /&amp;/g,
      "&"
    )
    .replace(
      /&lt;/g,
      "<"
    )
    .replace(
      /&gt;/g,
      ">"
    )
    .replace(
      /&quot;/g,
      '"'
    )
    .replace(
      /&#39;/g,
      "'"
    )
    .replace(
      /&#x27;/gi,
      "'"
    );
}


/* =========================================================
   PARSE YOUTUBE ATOM FEED
   ========================================================= */

function parseFeed(xml) {

  const entries =
    xml.match(
      /<entry[\s\S]*?<\/entry>/gi
    ) || [];

  return entries
    .map(entry => {

      const id =
        getTag(
          entry,
          "yt:videoId"
        );

      if (!id) return null;

      const title =
        getTag(
          entry,
          "title"
        );

      const publishedAt =
        getTag(
          entry,
          "published"
        ) ||
        getTag(
          entry,
          "updated"
        );

      const description =
        getTag(
          entry,
          "media:description"
        );

      const url =
        getYouTubeUrl(
          entry,
          id
        );

      const thumbnail =
        `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

      const combinedText =
        `${title} ${description}`;

      const location =
        detectLocation(
          combinedText
        );

      const isShort =
        detectShort(
          title,
          description,
          url
        );

      const category =
        detectCategory(
          title,
          description
        );

      return {

        id,

        title,

        description,

        publishedAt,

        url,

        thumbnail,

        category,

        location,

        isShort,

        type:
          isShort
            ? "short"
            : "video",

        channel:
          "Foodican",

        channelId:
          CHANNEL_ID,

        duration: 0,

        viewCount: 0,

        likeCount: 0,

        tags: []
      };

    })
    .filter(Boolean);
}


/* =========================================================
   YOUTUBE URL
   ========================================================= */

function getYouTubeUrl(
  entry,
  id
) {

  /*
    The Atom feed normally exposes a standard watch URL.
    Shorts are converted later based on detection.
  */

  const linkMatch =
    entry.match(
      /<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/i
    );

  if (
    linkMatch &&
    linkMatch[1]
  ) {

    return linkMatch[1];

  }

  return `https://www.youtube.com/watch?v=${id}`;
}


/* =========================================================
   SHORT DETECTION
   ========================================================= */

function detectShort(
  title,
  description,
  url
) {

  const text =
    `${title} ${description} ${url}`
      .toLowerCase();

  return (
    text.includes("/shorts/") ||
    /\bshorts?\b/i.test(title)
  );
}


/* =========================================================
   CATEGORY DETECTION
   ========================================================= */

function detectCategory(
  title,
  description
) {

  const text =
    `${title} ${description}`
      .toLowerCase();

  const techTerms = [
    "iphone",
    "ipad",
    "macbook",
    "apple",
    "android",
    "pixel",
    "samsung",
    "google",
    "ai",
    "chatgpt",
    "computer",
    "laptop",
    "phone",
    "technology",
    "tech",
    "gadget",
    "keyboard",
    "mouse",
    "monitor",
    "software",
    "app"
  ];

  const lifeTerms = [
    "travel",
    "hotel",
    "trip",
    "vacation",
    "family",
    "home",
    "life",
    "experience",
    "adventure"
  ];

  if (
    techTerms.some(term =>
      text.includes(term)
    )
  ) {

    return "tech";
  }

  if (
    lifeTerms.some(term =>
      text.includes(term)
    )
  ) {

    return "life";
  }

  return "food";
}


/* =========================================================
   LOCATION DETECTION
   ========================================================= */

function detectLocation(
  text
) {

  if (!text) return "";

  const original =
    String(text);

  const lower =
    original.toLowerCase();


  /* -------------------------------------------------------
     ZIP CODE
  ------------------------------------------------------- */

  const zip =
    original.match(
      /\b\d{5}(?:-\d{4})?\b/
    );

  if (zip) {

    return zip[0];
  }


  /* -------------------------------------------------------
     HASHTAG CITY + STATE
     Example: #mckinneytx
  ------------------------------------------------------- */

  const hashtags =
    lower.match(
      /#[a-z0-9]+/g
    ) || [];

  for (const hashtag of hashtags) {

    const clean =
      hashtag
        .replace(
          "#",
          ""
        );

    const hashtagLocation =
      locationFromHashtag(
        clean
      );

    if (hashtagLocation) {
      return hashtagLocation;
    }
  }


  /* -------------------------------------------------------
     CITY, STATE ABBREVIATION
     Example: Houston, TX
  ------------------------------------------------------- */

  const cityState =
    original.match(
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4}),?\s+(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY)\b/i
    );

  if (cityState) {

    return (
      `${cleanCity(cityState[1])}, ` +
      `${cityState[2].toUpperCase()}`
    );
  }


  /* -------------------------------------------------------
     CITY, FULL STATE
  ------------------------------------------------------- */

  const fullState =
    original.match(
      /\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,4}),?\s+(Texas|California|Florida|New York|Illinois|Georgia|Arizona|Nevada|Washington|Colorado|Oregon|Virginia|Maryland|Pennsylvania|Ohio|Michigan|Tennessee|North Carolina|South Carolina|Massachusetts|New Jersey)\b/i
    );

  if (fullState) {

    const state =
      stateAbbreviation(
        fullState[2]
      );

    return (
      `${cleanCity(fullState[1])}, ${state}`
    );
  }


  /* -------------------------------------------------------
     KNOWN CITY NAMES
  ------------------------------------------------------- */

  const knownCities = [

    ["mckinney", "McKinney, TX"],
    ["frisco", "Frisco, TX"],
    ["plano", "Plano, TX"],
    ["allen", "Allen, TX"],
    ["dallas", "Dallas, TX"],
    ["fort worth", "Fort Worth, TX"],
    ["fortworth", "Fort Worth, TX"],
    ["richardson", "Richardson, TX"],
    ["garland", "Garland, TX"],
    ["carrollton", "Carrollton, TX"],
    ["irving", "Irving, TX"],
    ["arlington", "Arlington, TX"],
    ["denton", "Denton, TX"],
    ["houston", "Houston, TX"],
    ["austin", "Austin, TX"],
    ["san antonio", "San Antonio, TX"],
    ["el paso", "El Paso, TX"],
    ["las vegas", "Las Vegas, NV"],
    ["los angeles", "Los Angeles, CA"],
    ["san diego", "San Diego, CA"],
    ["san francisco", "San Francisco, CA"],
    ["chicago", "Chicago, IL"],
    ["new york", "New York, NY"],
    ["new york city", "New York, NY"],
    ["miami", "Miami, FL"],
    ["orlando", "Orlando, FL"],
    ["atlanta", "Atlanta, GA"],
    ["seattle", "Seattle, WA"],
    ["denver", "Denver, CO"],
    ["phoenix", "Phoenix, AZ"],
    ["boston", "Boston, MA"],
    ["philadelphia", "Philadelphia, PA"],
    ["nashville", "Nashville, TN"],
    ["charlotte", "Charlotte, NC"],
    ["tampa", "Tampa, FL"]
  ];

  /*
    Check longer names first.
  */
  knownCities.sort(
    (a, b) =>
      b[0].length -
      a[0].length
  );

  for (const [
    searchName,
    location
  ] of knownCities) {

    const pattern =
      new RegExp(
        `\\b${escapeRegExp(searchName)}\\b`,
        "i"
      );

    if (pattern.test(original)) {
      return location;
    }
  }

  return "";
}


/* =========================================================
   HASHTAG LOCATION
   ========================================================= */

function locationFromHashtag(
  hashtag
) {

  const map = {

    mckinneytx:
      "McKinney, TX",

    mckinney:
      "McKinney, TX",

    frisctx:
      "Frisco, TX",

    frisco:
      "Frisco, TX",

    planotx:
      "Plano, TX",

    dallas:
      "Dallas, TX",

    dallastx:
      "Dallas, TX",

    houston:
      "Houston, TX",

    houstontx:
      "Houston, TX",

    austin:
      "Austin, TX",

    austintx:
      "Austin, TX",

    sanantonio:
      "San Antonio, TX",

    lasvegas:
      "Las Vegas, NV",

    losangeles:
      "Los Angeles, CA",

    sandiego:
      "San Diego, CA",

    sanfrancisco:
      "San Francisco, CA",

    chicago:
      "Chicago, IL",

    newyork:
      "New York, NY",

    miami:
      "Miami, FL",

    atlanta:
      "Atlanta, GA",

    seattle:
      "Seattle, WA"
  };

  return map[hashtag] || "";
}


/* =========================================================
   NORMALIZE LOCATION
   ========================================================= */

function normalizeLocation(
  location
) {

  if (!location) return "";

  let value =
    String(location)
      .replace(
        /\s+/g,
        " "
      )
      .trim();

  /*
    Convert full state names.
  */

  const fullState =
    value.match(
      /^(.+?),?\s+(Texas|California|Florida|New York|Illinois|Georgia|Arizona|Nevada|Washington|Colorado|Oregon|Virginia|Maryland|Pennsylvania|Ohio|Michigan|Tennessee|North Carolina|South Carolina|Massachusetts|New Jersey)$/i
    );

  if (fullState) {

    return (
      `${cleanCity(fullState[1])}, ` +
      `${stateAbbreviation(fullState[2])}`
    );
  }


  /*
    Normalize state abbreviations.
  */

  const state =
    value.match(
      /^(.+?),?\s+([A-Za-z]{2})$/
    );

  if (state) {

    return (
      `${cleanCity(state[1])}, ` +
      `${state[2].toUpperCase()}`
    );
  }


  /*
    If it's a known city, make it city + state.
  */

  const known =
    detectLocation(
      value
    );

  if (
    known &&
    known.toLowerCase() !== value.toLowerCase()
  ) {

    return known;
  }

  return value;
}


/* =========================================================
   MERGE ITEMS
   ========================================================= */

function mergeItem(
  old,
  fresh
) {

  if (!old) {

    return fresh;
  }

  const freshLocation =
    fresh.location || "";

  const oldLocation =
    old.location || "";

  const normalizedFresh =
    normalizeLocation(
      freshLocation
    );

  const normalizedOld =
    normalizeLocation(
      oldLocation
    );

  /*
    If the location hasn't changed, preserve coordinates.
  */

  const sameLocation =
    normalizedFresh &&
    normalizedOld &&
    normalizedFresh.toLowerCase() ===
      normalizedOld.toLowerCase();


  const location =
    normalizedFresh ||
    normalizedOld ||
    "";


  return {

    ...old,

    ...fresh,

    location,

    latitude:
      sameLocation
        ? numberOrNull(
            fresh.latitude ??
            old.latitude
          )
        : numberOrNull(
            fresh.latitude
          ),

    longitude:
      sameLocation
        ? numberOrNull(
            fresh.longitude ??
            old.longitude
          )
        : numberOrNull(
            fresh.longitude
          ),

    locationPrecision:
      sameLocation
        ? (
            fresh.locationPrecision ||
            old.locationPrecision ||
            ""
          )
        : (
            fresh.locationPrecision ||
            ""
          ),

    locationSource:
      sameLocation
        ? (
            fresh.locationSource ||
            old.locationSource ||
            ""
          )
        : (
            fresh.locationSource ||
            ""
          )
  };
}


/* =========================================================
   GEOCODING
   ========================================================= */

async function geocodeMissingLocations(
  items
) {

  const pending =
    items.filter(item =>

      item.location &&

      (
        !Number.isFinite(item.latitude) ||
        !Number.isFinite(item.longitude)
      )

    );


  if (!pending.length) {

    console.log(
      "No new locations need geocoding."
    );

    return;
  }


  console.log("");
  console.log(
    `Locations needing geocoding: ${pending.length}`
  );


  /*
    In-memory cache prevents multiple requests for the
    same location during one run.
  */

  const cache =
    new Map();


  let requestsMade = 0;


  for (const item of pending) {

    if (
      requestsMade >=
      MAX_GEOCODES_PER_RUN
    ) {

      console.log(
        "Geocoding limit reached for this run."
      );

      break;
    }


    const cacheKey =
      item.location
        .toLowerCase()
        .trim();


    if (cache.has(cacheKey)) {

      applyGeocode(
        item,
        cache.get(cacheKey)
      );

      continue;
    }


    /*
      If the title looks like a restaurant/business,
      try the business name + location first.
    */

    const venueQuery =
      looksLikeVenue(
        item.title
      )
        ? `${item.title}, ${item.location}, USA`
        : "";


    let result = null;


    if (venueQuery) {

      console.log("");
      console.log(
        `Trying venue: ${venueQuery}`
      );

      result =
        await geocode(
          venueQuery
        );

      requestsMade++;

      if (result) {

        result.precision =
          "venue";

        result.source =
          "title+location";

      }
    }


    /*
      Fall back to the city/location.
    */

    if (!result) {

      if (
        requestsMade >=
        MAX_GEOCODES_PER_RUN
      ) {

        break;
      }


      const locationQuery =
        `${item.location}, USA`;


      console.log("");
      console.log(
        `Trying location: ${locationQuery}`
      );


      result =
        await geocode(
          locationQuery
        );

      requestsMade++;


      if (result) {

        result.precision =
          "city";

        result.source =
          "location";
      }
    }


    cache.set(
      cacheKey,
      result
    );


    if (result) {

      applyGeocode(
        item,
        result
      );

      console.log(
        `Mapped "${item.title}" → ` +
        `${result.latitude}, ${result.longitude} ` +
        `(${result.precision})`
      );

    } else {

      console.log(
        `Could not map "${item.title}"`
      );
    }


    /*
      Be polite to Nominatim.
    */

    if (
      requestsMade <
      MAX_GEOCODES_PER_RUN
    ) {

      await sleep(
        GEOCODE_DELAY_MS
      );
    }
  }
}


/* =========================================================
   NOMINATIM
   ========================================================= */

async function geocode(
  query
) {

  const url =
    new URL(
      "https://nominatim.openstreetmap.org/search"
    );

  url.searchParams.set(
    "format",
    "jsonv2"
  );

  url.searchParams.set(
    "limit",
    "1"
  );

  url.searchParams.set(
    "countrycodes",
    "us"
  );

  url.searchParams.set(
    "q",
    query
  );


  try {

    const response =
      await fetch(
        url,
        {
          headers: {
            "User-Agent":
              NOMINATIM_USER_AGENT,

            "Accept":
              "application/json"
          }
        }
      );


    if (!response.ok) {

      console.warn(
        `Nominatim returned HTTP ${response.status}`
      );

      return null;
    }


    const results =
      await response.json();


    if (
      !Array.isArray(results) ||
      !results.length
    ) {

      return null;
    }


    const result =
      results[0];


    const latitude =
      Number(
        result.lat
      );

    const longitude =
      Number(
        result.lon
      );


    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude)
    ) {

      return null;
    }


    return {

      latitude,

      longitude,

      precision: "",

      source: ""
    };


  } catch (error) {

    console.warn(
      `Geocoding failed for "${query}":`,
      error.message
    );

    return null;
  }
}


/* =========================================================
   APPLY GEOCODE
   ========================================================= */

function applyGeocode(
  item,
  result
) {

  if (!result) return;

  item.latitude =
    result.latitude;

  item.longitude =
    result.longitude;

  item.locationPrecision =
    result.precision || "";

  item.locationSource =
    result.source || "";
}


/* =========================================================
   VENUE DETECTION
   ========================================================= */

function looksLikeVenue(
  title
) {

  if (!title) return false;

  const text =
    title.toLowerCase();

  const venueTerms = [

    "restaurant",
    "sushi",
    "seafood",
    "grill",
    "buffet",
    "cafe",
    "café",
    "coffee",
    "bakery",
    "kitchen",
    "bar",
    "bbq",
    "steakhouse",
    "pizza",
    "tacos",
    "taco",
    "burger",
    "burgers",
    "noodles",
    "pho",
    "ramen",
    "chicken",
    "wings",
    "diner",
    "bistro",
    "eatery",
    "market",
    "food hall",
    "foodhall",
    "never ending pasta",
    "olive garden",
    "fish city",
    "kim sơn",
    "kim son",
    "yohe"
  ];

  return venueTerms.some(
    term =>
      text.includes(term)
  );
}


/* =========================================================
   STATE HELPERS
   ========================================================= */

function stateAbbreviation(
  state
) {

  const map = {

    texas: "TX",
    california: "CA",
    florida: "FL",
    "new york": "NY",
    illinois: "IL",
    georgia: "GA",
    arizona: "AZ",
    nevada: "NV",
    washington: "WA",
    colorado: "CO",
    oregon: "OR",
    virginia: "VA",
    maryland: "MD",
    pennsylvania: "PA",
    ohio: "OH",
    michigan: "MI",
    tennessee: "TN",
    "north carolina": "NC",
    "south carolina": "SC",
    massachusetts: "MA",
    "new jersey": "NJ"
  };

  return (
    map[
      String(state)
        .toLowerCase()
        .trim()
    ] ||
    String(state)
      .toUpperCase()
  );
}


function cleanCity(
  city
) {

  return String(city)
    .replace(
      /\s+/g,
      " "
    )
    .trim()
    .replace(
      /,\s*$/,
      ""
    );
}


function escapeRegExp(
  value
) {

  return String(value)
    .replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );
}


/* =========================================================
   GENERAL HELPERS
   ========================================================= */

function numberOrNull(
  value
) {

  const number =
    Number(value);

  return Number.isFinite(number)
    ? number
    : null;
}


function sleep(
  milliseconds
) {

  return new Promise(
    resolve =>
      setTimeout(
        resolve,
        milliseconds
      )
  );
}


/* =========================================================
   RUN
   ========================================================= */

main()
  .catch(error => {

    console.error("");
    console.error(
      "FOODICAN UPDATE FAILED"
    );

    console.error(
      error
    );

    process.exit(1);
  });