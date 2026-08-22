# IXL Korea v18 — A/S Control Guide

The shared values below are all declared once at the top of `style.css` inside `:root`.

- Desktop page first-line height: `--page-top-padding`
- Mobile page first-line height: `--mobile-page-top-padding`
- Whole-site left/right start point: `--page-side-padding`
- Desktop header height/side padding: `--header-height`, `--header-side-padding`
- Desktop main-menu gap: `--header-nav-gap`
- Desktop About popup item gap: `--about-popup-item-padding-y`
- Desktop About popup outer top/bottom space: `--about-popup-shell-padding-y`
- Mobile About popup item gap: `--mobile-about-popup-item-padding-y`
- Mobile About popup outer top/bottom space: `--mobile-about-popup-shell-padding-y`

The desktop main-menu selector is deliberately limited to direct nav links and the About trigger. Popup links are not descendants of that spacing rule, so changing the main-menu padding cannot enlarge the popup again.


## V19 — Shared header for standalone Insights articles
- `index.html` and `innovation5.html` use the same `.header` / nav markup and the same `header-nav.js`.
- Mobile fixed-header behavior and About tap popup are therefore maintained in one JavaScript file.
- The standalone Innovation 5.0 article no longer uses `article-simple-header`.
- `Innovation 5.0` band and article page horizontal padding use `--page-side-padding`.
- Article and Innovation 5.0 vertical spacing are controlled from the A/S control panel variables in `style.css`.


## Insights sub-navigation
- NEWS / BOOKS / ARTICLE / VIDEO / EXTERNAL LINKS uses one shared horizontal menu on PC and mobile.
- It never wraps; narrow screens scroll horizontally, matching the main navigation behavior.
- Maintain spacing in `.insights-menu`; maintain tab typography/state in `.insights-tab`.

## Offerings cards (v22)
- Desktop: 4-column grid (7 cards render 4 + 3).
- <=1100px: existing responsive rule changes to 2 columns.
- <=700px: existing responsive rule changes to 1 column.
- Card background uses Home navy #071b33.


## CMS — Insights

Insights content is now sourced from `insightscontent/insights-data.json`. Use `/admin/` after the GitHub backend is connected. Do not manually maintain both JSON and the legacy JS data file.
