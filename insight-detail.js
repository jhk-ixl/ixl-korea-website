(function () {
    const DATA_URL = 'insightscontent/insights-data.json';
    const REGISTRY_URL = 'insightscontent/asset-registry.json';
    const USAGE_URL = 'insightscontent/asset-usage.json';

    const LEGACY_ARTICLE_BODY = {
        'identifying-and-developing-innovation-talent': {
            source: 'GIM Institute · Innovation Potential Assessment · May 2024',
            body: [
                '## 01 · Why Innovation Talent Matters',
                'Innovation depends on more than technical expertise. Organizations need to understand the behaviors, mindset and practical innovation capabilities of their people in order to identify who can lead, join or prepare for innovation work.',
                '',
                '## 02 · Mindset + Knowledge & Tools',
                "The Innovation Potential Assessment evaluates two dimensions: Innovation Mindset and Knowledge & Tools. Together they provide a quantitative view of an individual's readiness to contribute to innovation outcomes.",
                '',
                '## 03 · Seven Innovation Profiles',
                'The combination of mindset and innovation know-how maps individuals into seven profiles — from Rule Follower and Rule Executor to Diamond in the Rough, Optimistic Executor, Rule Challenger, Rule Breaker and Rule Maker.',
                '',
                '## 04 · Put the Aces in the Right Places',
                'Assessment results can help organizations identify who is ready to lead innovation projects, who can join innovation teams and who would benefit most from additional training.',
                '',
                '## 05 · Build Customized Development Journeys',
                'Individual and aggregate results can be translated into tailored development paths by profile, role and seniority — helping organizations build capability while improving innovation results.'
            ].join('\\n')
        }
    };

    let registry = [];
    let usages = [];

    function slugify(value) {
        return String(value || '')
            .toLowerCase().trim()
            .replace(/&/g, ' and ')
            .replace(/[^a-z0-9가-힣]+/g, '-')
            .replace(/^-+|-+$/g, '');
    }

    function escapeHtml(value) {
        return String(value || '').replace(/[&<>"']/g, ch => ({
            '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'
        }[ch]));
    }

    function assetUrl(item) {
        if (item.assetKey) {
            const a = registry.find(x => x.key === item.assetKey);
            if (a) return a.url || a.pathname || item.asset || item.url || '';
        }
        return item.asset || item.url || '';
    }

    function isPdf(url) {
        return /\.pdf(?:$|[?#])/i.test(url || '');
    }

    function sourceHtml(item, fallback) {
        const source = item.source || (fallback && fallback.source) || '';
        const url = assetUrl(item);
        const sourceLink = url && !isPdf(url) ? url : '';
        if (!source && !sourceLink) return '';

        return `
          <section class="knowledge-source">
            <p class="knowledge-reference-label">SOURCE</p>
            ${source ? `<p>${escapeHtml(source)}</p>` : ''}
            ${sourceLink ? `<a href="${escapeHtml(sourceLink)}" target="_blank" rel="noopener noreferrer">Visit Source ↗</a>` : ''}
          </section>`;
    }

    function insightsPanelForType(type) {
        const map = {
            news: 'news',
            article: 'article',
            blog: 'article',
            video: 'video',
            external: 'links',
            links: 'links',
            books: 'books'
        };
        return map[String(type || '').toLowerCase()] || 'news';
    }

    function backLabelForType(type) {
        const panel = insightsPanelForType(type);
        const labels = {
            news: '← Back to News',
            books: '← Back to Books',
            article: '← Back to Articles',
            video: '← Back to Videos',
            links: '← Back to External Links'
        };
        return labels[panel] || '← Back to Insights';
    }

    function backLinkHtml(item) {
        return `<a class="knowledge-back-link"
                   href="index.html#insights"
                   data-history-back="true">${backLabelForType(item && item.type)}</a>`;
    }

    function resolveUsageLinks() {
        document.querySelectorAll('[data-asset-usage]').forEach(el => {
            const u = usages.find(x => x.usageKey === el.dataset.assetUsage);
            if (!u) return;
            const a = registry.find(x => x.key === u.assetKey);
            if (!a) return;
            const url = a.url || a.pathname;
            if (!url) return;
            if (el.tagName === 'IMG') el.src = url;
            else el.href = url;
        });
    }

    async function loadJson(url, fallback) {
        try {
            const r = await fetch(url, {cache:'no-store'});
            if (!r.ok) throw new Error(`${url}: ${r.status}`);
            return await r.json();
        } catch (e) {
            console.warn(e);
            return fallback;
        }
    }

    async function init() {
        const root = document.getElementById('knowledge-article');
        const params = new URLSearchParams(location.search);
        const requestedSlug = params.get('slug') || '';

        const [data, reg, use] = await Promise.all([
            loadJson(DATA_URL, {items:[]}),
            loadJson(REGISTRY_URL, {assets:[]}),
            loadJson(USAGE_URL, {usages:[]})
        ]);

        registry = Array.isArray(reg) ? reg : (reg.assets || []);
        usages = Array.isArray(use) ? use : (use.usages || []);
        resolveUsageLinks();

        const items = Array.isArray(data) ? data : (data.items || []);
        const item = items.find(x => (x.slug || slugify(x.title)) === requestedSlug);

        if (!item) {
            root.innerHTML = `
              <div class="knowledge-not-found">
                <p class="eyebrow">INSIGHT</p>
                <h1>Content not found</h1>
                <p>The requested Insight could not be found.</p>
                <a href="index.html#insights">← Back to Insights</a>
              </div>`;
            return;
        }

        const slug = item.slug || slugify(item.title);
        const fallback = LEGACY_ARTICLE_BODY[slug];
        const body = (typeof item.body === 'string' && item.body.trim())
            ? item.body.trim()
            : (fallback ? fallback.body : '');

        // A detail URL should normally be exposed only when body exists.
        if (!body) {
            root.innerHTML = `
              <div class="knowledge-not-found">
                <p class="eyebrow">${escapeHtml((item.type || 'INSIGHT').toUpperCase())}</p>
                <h1>${escapeHtml(item.title)}</h1>
                <p>${escapeHtml(item.summary || '')}</p>
                ${backLinkHtml(item)}
              </div>`;
            return;
        }

        root.innerHTML = `
          <header class="knowledge-article-header">
            <p class="eyebrow">${escapeHtml((item.type || 'INSIGHT').toUpperCase())}</p>
            <div class="knowledge-meta">
              <time>${escapeHtml(item.dateLabel || item.date || '')}</time>
              ${item.author ? `<span>${escapeHtml(item.author)}</span>` : ''}
            </div>
            <h1>${escapeHtml(item.title)}</h1>
            ${item.summary ? `<p class="knowledge-lead">${escapeHtml(item.summary)}</p>` : ''}
          </header>
          <div class="knowledge-body">${IXLMarkdown.render(body)}</div>
          ${sourceHtml(item, fallback)}
          ${backLinkHtml(item)}
        `;
    }

    document.addEventListener('click', function (event) {
        const link = event.target.closest('[data-history-back]');
        if (!link) return;

        /*
         * Same behavior as the browser Back button:
         * restore the original tab, selected item and scroll position.
         * If there is no usable previous history entry, the href remains
         * as a fallback to index.html#insights.
         */
        if (window.history.length > 1) {
            event.preventDefault();
            window.history.back();
        }
    });

    document.addEventListener('DOMContentLoaded', init);
})();
