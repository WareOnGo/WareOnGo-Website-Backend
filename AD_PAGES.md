# Ad pages

The Bangalore campaign page at `/bangalore` uses the `AdPage` table. Editors
manage it in the CMS under **Ad pages → Bangalore**. The existing page layout,
contact forms, listing selection, size filters and map interactions stay in the
website. Copy, figures, area recommendations, service and audience cards, CTA
labels and page photos are editable in the CMS.

## Initial rollout

1. Run the additive SQL from this backend checkout:

   ```sh
   npx prisma db execute --schema prisma/schema.prisma --file scripts/sql/20260926_ad_pages.sql
   npx prisma generate
   ```

   It creates only `AdPage`, enables row-level security and imports the current
   Bangalore content. Re-running it never replaces existing CMS edits. Never run
   schema push or migrations from the CMS's partial Prisma schema.
2. Deploy the backend with `GET /ad-pages` before building the website.
3. Build and deploy the website. `scripts/generate-ad-pages.mjs` fetches approved
   content into `src/data/adPages.generated.ts` before prerendering. It fails the
   build if the endpoint, page or required content is missing; it never silently
   substitutes the initial import over an editor's changes.
4. Generate the CMS Prisma client and deploy the CMS editor after the website's
   `/preview/ad-pages/bangalore` route is available.

No new environment variable or scheduled job is required. The existing shared
database, upload service and website build hook are used. The website continues
to mark this campaign URL `noindex`.

## Revisions and editing

- **Save draft** changes only `draftContent`. It stays private even if a website
  build runs while the page is being edited.
- **Save for next build** validates and copies the revision to
  `publishedContent`. This is the only content returned by the public API.
- **Deploy** and the nightly job use the existing website build workflow.
  `deployedContent` records what was included in the last build request, not a
  confirmation that the deployment finished successfully.
- Saves require authentication and the revision timestamp originally loaded by
  the editor. A stale tab cannot overwrite a newer edit.
- A failed save request leaves edits in place. An identical retry of an already
  committed save is acknowledged without rewriting the record. Build snapshots
  preserve the content revision timestamp and skip rows edited since their read.

The CMS preview embeds the website's real renderer, including unsaved edits,
with desktop, mobile and full-screen controls. Draft content stays in browser
memory; links, form submissions and analytics are disabled in the preview.
`WEBSITE_PREVIEW_ORIGIN` optionally selects a local website server; production
defaults to `https://wareongo.com`. Warehouse details and micromarket counts are
not manually editable through this section. Remaining overview placeholders and
blank benefit descriptions are retained for editors to complete.

The hero uses four editable process steps in place of its earlier introduction
and figures. The shared content reader supplies those steps for older saved
revisions and drops the removed fields. No database rewrite is needed.

“Why choose WareOnGo” uses six benefit cards and a section image. Older revisions
retain their three existing benefits and gain the new placeholder cards and image
when read. All six titles, descriptions and the image are editable in the CMS.

The first version supports the existing Bangalore template. Adding a new ad page
requires a route/template, a registered slug, its initial content and a database
constraint update; the editor does not invent unsupported city URLs.

## Content contract and checks

The initial JSON in `data/ad-pages/bangalore.json` is mirrored in the CMS's
`content/ad-pages/` and the website's `src/data/ad-pages/`. It defines the field
shape and is used only for initial import and validation, not to overwrite saved
content. `services/adPageContent.js` is mirrored as CMS
`lib/ad-page-content.mjs` and website `scripts/lib/ad-page-content.mjs`; keep
these contracts in sync. Known fields are selected explicitly, so private
metadata never enters the public response.

Run `npm run test:ad-pages` in all three checkouts. Also run `npm run test:deploy`
in the CMS and `npm run test:card-links` in the website when changing their
shared build/card integrations. `npm run build:spa` checks the website bundle
without fetching content, publishing assets or notifying search engines.
