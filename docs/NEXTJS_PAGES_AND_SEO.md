# Next.js fallbacks and SEO

- `app/not-found.tsx`: branded missing-page screen, return link, noindex metadata.
- `app/error.tsx`: recoverable route/server failure UI, including payment-pending guidance.
- `app/global-error.tsx`: root-layout failure fallback with its own HTML, body and inline styles; hard navigation remains available when the router fails.
- Admin and reward boundaries include retry actions and safe generic messages. Raw exception text is never displayed.
- `loading.tsx` is the Next.js convention (not `load.ts`). Root, admin and reward routes use accessible, reduced-motion-aware skeletons. Admin client authentication and section queries also show skeletons.
- App Router handles server failures through these boundaries; a standalone `/500` route would not catch failures. Streaming responses may already have HTTP 200 headers before an error or missing page is resolved. Next.js adds noindex for missing pages.

## Search and sharing

`/sitemap.xml` lists the homepage and five permanent milestone URLs. Information overlays and their redirect aliases are deliberately omitted. No private/admin/API/token URLs are listed. Milestone metadata has a canonical URL and individual Open Graph title, description and URL. Homepage overlays share the homepage canonical. Existing Open Graph image and favicon assets are preserved.

`/robots.txt` excludes admin, reward, API and purchase-return URLs, and blocks all crawling on Vercel nonproduction environments. Private routes retain independent noindex metadata and response headers; robots directives are not authentication.

`/manifest.webmanifest` includes the existing 192/512 icons, brand colors and homepage start URL. This does not implement offline support.

Set `NEXT_PUBLIC_SITE_URL` to the chosen public HTTPS origin on Vercel before building. It controls canonical, sitemap and Open Graph origin resolution. Blank or malformed values fall back to https://takethewall.com. Local builds may intentionally use localhost. Match the selected origin to Vercel's canonical-domain redirect. Submit `/sitemap.xml` in the site's search-console account after deployment.

## Verification

Lint, TypeScript, 107 existing tests and the production build passed. Playwright checked desktop (1440×900) and mobile (390×844) missing-page rendering, no horizontal overflow, bottom footer placement, noindex and return-home navigation. Generated sitemap, robots and manifest endpoints returned 200 with expected content. Browser plugin was unavailable; regular Playwright was used. Runtime 500/global-error recovery has not been induced in production.
