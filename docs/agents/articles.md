# Site articles

Articles live in the separate Fumadocs MDX collection under `site/content/articles/`.
They are editorial pages, not documentation sidebar entries. The public index is
`/:lang/blog`; each article is `/:lang/blog/:slug`.

## Add an article

1. Add `site/content/articles/<slug>.en.mdx`. Use a lowercase, hyphenated slug.
   English is required because it is the explicit fallback for untranslated
   locales. Add `<slug>.ko.mdx`, `<slug>.ja.mdx`, or `<slug>.zh-CN.mdx` when a
   reviewed translation is ready.
2. Include `title`, `description`, `date` (`YYYY-MM-DD`), and `category` in YAML
   frontmatter. The MDX collection validates these fields at build time. Every
   translation of one article must use the same publication date.
3. Write one `h2` section per major idea. The article page builds its table of
   contents from these headings. Put reusable illustrations in
   `site/app/articles/` and import them directly from the MDX file.
   Put static image assets under `site/public/images/` and write descriptive alt
   text. The first article's diagram source is
   `design/articles/how-imposia-works-visual.html`; regenerate its English and
   Korean desktop/mobile PNGs with `pnpm site:article-visual`.
4. Run `pnpm site:typecheck`, `pnpm site:build`, and `pnpm test:site`.

The index discovers articles from the MDX collection and sorts them by date,
newest first. `site/prerender-paths.ts` discovers slugs from English filenames,
then prerenders the index and every article URL for all four site locales. No
route registry needs manual editing when a post is added. If a translation is
missing, that locale's URL displays the English article with a visible notice,
an English `lang` attribute on the article, and a canonical URL pointing at
the English article. The index also labels the article as English.
Only authored translations appear in `sitemap.xml` and article `hreflang` links;
fallback URLs keep the English canonical URL.

Technical claims should cite the relevant product contract or reproducible
benchmark. A benchmark number needs its fixture, browser, hardware, date, and
measurement boundary; comparisons across different harnesses are not
interchangeable. `docs/benchmarks.md` is the measurement protocol and
`docs/compatibility.md` defines the supported CSS boundary.
