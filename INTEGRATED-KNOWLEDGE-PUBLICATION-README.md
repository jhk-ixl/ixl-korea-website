# IXL Korea — Integrated Knowledge Publication v1

This package implements the two agreed changes together:

1. CMS Markdown Article → stable Knowledge Version reference
2. Knowledge Master → automatic Public Website Insights publication

## Publication rule

Only Knowledge with both conditions is shown on Website Insights:

- `access = Public`
- `publicationStatus = Published`

`Draft` items remain in Knowledge but are not publicly displayed.

## CMS Markdown reference

Decap CMS continues to create real Markdown files under `insightscontent/articles/*.md`.
The CMS front matter now includes:

- `contentRef` (stable identifier)
- `knowledgeId` (optional until linked)
- `language` (`ko` / `other`)

Each Knowledge language version supports:

```json
"contentSource": {
  "type": "builder-markdown" | "cms-markdown",
  "ref": "article-...",
  "path": "insightscontent/articles/...md"
}
```

When `cms-markdown` is selected, the Knowledge Builder stores the reference/path instead of duplicating the long-form Markdown body.

## Public Insights source of truth

`index.html` and `insight.html` read governed public Knowledge through `/api/insights-library?resource=public-knowledge`.
The API filters server-side to `access = Public` and `publicationStatus = Published`, so Draft/private Knowledge is not exposed through the public detail flow.
`insightscontent/insights-data.json` remains legacy/compatibility data for Manager overview and the manager-only `insights` resource; it is not the public website source of truth.

## Book migration

- `Book` was added to Knowledge Types.
- Existing website book content was migrated into Knowledge records.
- Book cover Asset Keys are reused.
- Public Books renders from Published Public Book Knowledge.

## Existing Knowledge migration

All 11 existing Knowledge items matched the 11 legacy Public Insights items by `knowledgeId`; therefore they were marked `Published` and their former `featured` values were copied into Knowledge so the public site remains equivalent after switching source of truth.

## Files changed

- `admin/config.yml`
- `api/insights-library.js`
- `manager/insights-library.html`
- `index.html`
- `insight.html` (new self-contained detail reader)
- `insightscontent/knowledge-data.json`
- `insightscontent/knowledge-types.json`

## Production verification order

1. Open Manager → Knowledge Builder.
2. Confirm Publication Status and Featured fields.
3. Confirm each language version can choose Builder Markdown or CMS Markdown.
4. Open `/admin/`, create a test Markdown Article with `contentRef`, language and optional `knowledgeId`.
5. Return to Builder, select CMS Markdown and link the article.
6. Save as Draft: verify it does not appear on public Insights.
7. Change to Published + Public: verify it appears in the correct tab automatically.
8. Open the Article Read action and verify `insight.html` loads the CMS Markdown body.
9. Verify News, Books, Article, Video and External Links tabs.
10. Keep `insights-data.json` until its remaining Manager/compatibility consumers are intentionally migrated.
