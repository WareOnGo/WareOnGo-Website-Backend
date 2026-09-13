# Service pages

The CMS owns drafts and approved revisions for four fixed service URLs:
`warehouse-search`, `build-to-suit`, `lease-negotiation` and
`compliance-procurement`.

`GET /service-pages` returns `{ "data": [...] }` containing only approved
revisions with written paragraph, list or table content. `GET
/service-pages/:slug` returns one such revision or HTTP 404. Both responses use
`Cache-Control: no-store`; neither exposes private drafts, deploy snapshots or
blog metadata. An empty collection is valid. Database failures return HTTP 500,
so a website build cannot mistake an outage for content removal.

Apply `scripts/sql/20260913_service_pages.sql` before deploying this endpoint,
then deploy the CMS and website. The migration adds only the `ServicePage`
table, limits slugs and enables RLS. It inserts no service copy. It was applied
and verified on production on 13 September 2026 with zero service rows.

`npm run test:services` tests response privacy, empty content, missing routes
and database failures. The integrated CMS evaluation also tested these actual
routes against an isolated PostgreSQL database through save, publish, private
edit, removal and republication.
