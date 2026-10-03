(async function(){

  const $ = (s) => document.querySelector(s);

  $('#year').textContent = new Date().getFullYear();

  const menu = $('.menu-btn');
  const nav = $('.nav');

  menu?.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });

  nav?.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () =>
      nav.classList.remove('open')
    )
  );

  /*
   * ---------------------------------------------------------
   * Load content
   * ---------------------------------------------------------
   */

  let data;

  try {
    const response = await fetch(
      'data/content.json',
      {
        cache: 'no-store'
      }
    );

    if (!response.ok) {
      throw new Error(
        `HTTP ${response.status}`
      );
    }

    data = await response.json();

  } catch (error) {

    console.error(
      'Could not load Foodican content:',
      error
    );

    data = {
      items: []
    };
  }


  /*
   * ---------------------------------------------------------
   * Normalize + sort
   * ---------------------------------------------------------
   */

  const items =
    (data.items || [])
      .filter(item =>
        item &&
        item.title &&
        item.url
      )
      .map(item => {

        /*
         * Make sure older content.json files
         * still work even if they don't have
         * the newer type/isShort fields.
         */
        const isShort =
          Boolean(item.isShort) ||
          item.type === 'short' ||
          String(item.url || '')
            .toLowerCase()
            .includes('/shorts/');

        return {
          ...item,
          isShort,
          type:
            isShort
              ? 'short'
              : 'video'
        };
      })
      .sort(
        (a, b) =>
          new Date(b.publishedAt || 0) -
          new Date(a.publishedAt || 0)
      );


  /*
   * ---------------------------------------------------------
   * Card
   * ---------------------------------------------------------
   */

  const card = (item) => {

    const date =
      item.publishedAt
        ? new Date(
            item.publishedAt
          ).toLocaleDateString(
            undefined,
            {
              month: 'short',
              day: 'numeric',
              year: 'numeric'
            }
          )
        : '';

    const emoji = {
      food: '🍜',
      tech: '📱',
      life: '✨'
    }[item.category] || '✦';


    /*
     * Determine the correct YouTube URL.
     *
     * Shorts use:
     *   /shorts/VIDEO_ID
     *
     * Regular videos use:
     *   /watch?v=VIDEO_ID
     */

    let watchUrl = item.url || '#';

    if (
      item.isShort &&
      item.id
    ) {
      watchUrl =
        `https://www.youtube.com/shorts/${item.id}`;
    }


    return `
      <article class="content-card">

        <a
          class="thumb"
          href="${esc(watchUrl)}"
          target="_blank"
          rel="noopener noreferrer"
        >

          ${
            item.thumbnail
              ? `
                <img
                  src="${esc(item.thumbnail)}"
                  alt=""
                  loading="lazy"
                >
              `
              : `
                <span class="placeholder">
                  ${emoji}
                </span>
              `
          }

          ${
            item.isShort
              ? `
                <span class="short-badge">
                  SHORT
                </span>
              `
              : ''
          }

        </a>


        <div class="card-body">

          <div class="card-meta">

            ${emoji}

            ${esc(
              cap(
                item.category ||
                'find'
              )
            )}

            ${
              item.isShort
                ? ' · Short'
                : ''
            }

            ${
              date
                ? ' · ' + esc(date)
                : ''
            }

          </div>


          <h3>
            ${esc(item.title)}
          </h3>


          <p>
            ${esc(
              shorten(
                item.description || '',
                120
              )
            )}
          </p>


          <a
            class="card-link"
            href="${esc(watchUrl)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            ${
              item.isShort
                ? 'Watch Short ↗'
                : 'Watch / explore ↗'
            }
          </a>

        </div>

      </article>
    `;
  };


  /*
   * ---------------------------------------------------------
   * Render grids
   * ---------------------------------------------------------
   */

  const render = (
    id,
    list
  ) => {

    const el =
      document.getElementById(id);

    if (!el) {
      return;
    }

    if (!list.length) {

      el.innerHTML = `
        <div class="content-card">

          <div class="thumb">
            <span class="placeholder">
              ✦
            </span>
          </div>

          <div class="card-body">

            <div class="card-meta">
              Coming soon
            </div>

            <h3>
              New Foodican adventures are on the way.
            </h3>

            <p>
              Publish a video or Short to YouTube
              and the site can automatically pick it up.
            </p>

          </div>

        </div>
      `;

      return;
    }

    el.innerHTML =
      list
        .slice(0, 6)
        .map(card)
        .join('');
  };


  /*
   * Latest
   */

  render(
    'latest-grid',
    items
  );


  /*
   * Food
   */

  render(
    'food-grid',
    items.filter(
      item =>
        item.category === 'food'
    )
  );


  /*
   * Tech
   */

  render(
    'tech-grid',
    items.filter(
      item =>
        item.category === 'tech'
    )
  );


  /*
   * Life
   */

  render(
    'life-grid',
    items.filter(
      item =>
        item.category === 'life'
    )
  );


  /*
   * ---------------------------------------------------------
   * Helpers
   * ---------------------------------------------------------
   */

  function esc(value) {

    return String(value)
      .replace(
        /[&<>"']/g,
        character => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        }[character])
      );
  }


  function cap(value) {

    return value
      ? value.charAt(0).toUpperCase() +
        value.slice(1)
      : '';
  }


  function shorten(
    value,
    length
  ) {

    return value.length > length
      ? value
          .slice(0, length - 1)
          .trim() + '…'
      : value;
  }

})();