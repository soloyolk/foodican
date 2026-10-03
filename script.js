(async function () {
  const $ = (selector) =>
    document.querySelector(selector);

  $('#year').textContent =
    new Date().getFullYear();

  const menu =
    $('.menu-btn');

  const nav =
    $('.nav');

  menu?.addEventListener(
    'click',
    () => {
      const open =
        nav.classList.toggle('open');

      menu.setAttribute(
        'aria-expanded',
        String(open)
      );
    }
  );

  nav?.querySelectorAll('a')
    .forEach(a =>
      a.addEventListener(
        'click',
        () =>
          nav.classList.remove('open')
      )
    );

  let data;

  try {
    const response =
      await fetch(
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

    data =
      await response.json();

  } catch (error) {
    console.error(
      'Could not load Foodican content:',
      error
    );

    renderError();
    return;
  }

  const items =
    Array.isArray(data.items)
      ? data.items
          .filter(item =>
            item &&
            item.title &&
            item.url
          )
          .sort(
            (a, b) =>
              new Date(b.publishedAt || 0) -
              new Date(a.publishedAt || 0)
          )
      : [];

  render(
    'latest-grid',
    items,
    'latest'
  );

  render(
    'food-grid',
    items.filter(
      item =>
        item.category === 'food'
    ),
    'food'
  );

  render(
    'tech-grid',
    items.filter(
      item =>
        item.category === 'tech'
    ),
    'tech'
  );

  render(
    'life-grid',
    items.filter(
      item =>
        item.category === 'life'
    ),
    'life'
  );

  function render(
    id,
    list,
    type
  ) {
    const element =
      document.getElementById(id);

    if (!element) {
      return;
    }

    if (!list.length) {
      element.innerHTML =
        emptyState(type);

      return;
    }

    element.innerHTML =
      list
        .slice(0, 6)
        .map(card)
        .join('');
  }

  function card(item) {
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
    }[
      item.category
    ] || '✦';

    const type =
      item.isShort
        ? 'Short'
        : 'Video';

    const location =
      item.location
        ? ` · ${item.location}`
        : '';

    return `
      <article class="content-card">

        <a
          class="thumb"
          href="${esc(item.url)}"
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
                item.category || 'life'
              )
            )}
            ·
            ${type}
            ${date ? ` · ${esc(date)}` : ''}
            ${esc(location)}
          </div>

          <h3>
            ${esc(item.title)}
          </h3>

          <p>
            ${esc(
              shorten(
                item.description || '',
                140
              )
            )}
          </p>

          <a
            class="card-link"
            href="${esc(item.url)}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Watch / explore ↗
          </a>

        </div>

      </article>
    `;
  }

  function emptyState(type) {
    const messages = {
      latest:
        'Publish a video to YouTube and Foodican will automatically pick it up.',

      food:
        'Foodican food discoveries will appear here automatically.',

      tech:
        'Tech finds and reviews will appear here automatically.',

      life:
        'Life discoveries and adventures will appear here automatically.'
    };

    return `
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
            More Foodican adventures are on the way.
          </h3>

          <p>
            ${esc(
              messages[type] ||
              messages.latest
            )}
          </p>

        </div>

      </div>
    `;
  }

  function renderError() {
    [
      'latest-grid',
      'food-grid',
      'tech-grid',
      'life-grid'
    ].forEach(id => {
      const element =
        document.getElementById(id);

      if (!element) {
        return;
      }

      element.innerHTML = `
        <div class="content-card">

          <div class="thumb">
            <span class="placeholder">
              ↻
            </span>
          </div>

          <div class="card-body">

            <div class="card-meta">
              Content temporarily unavailable
            </div>

            <h3>
              Foodican is still here.
            </h3>

            <p>
              The latest content could not be loaded.
              Please check back shortly.
            </p>

          </div>

        </div>
      `;
    });
  }

  function esc(value) {
    return String(value)
      .replace(
        /[&<>"']/g,
        char => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[char]
      );
  }

  function cap(value) {
    return value
      ? value.charAt(0).toUpperCase() +
          value.slice(1)
      : '';
  }

  function shorten(value, length) {
    if (!value) {
      return '';
    }

    return value.length > length
      ? value.slice(0, length - 1).trim() + '…'
      : value;
  }
})();