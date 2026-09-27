import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { siteUrl } from "../site/lib/site-url";
import { SITE_INDEXABLE_ROUTES } from "../site/prerender-paths";

const urls = SITE_INDEXABLE_ROUTES.map((route) => `  <url><loc>${siteUrl(route)}</loc></url>`);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>\n`;

await writeFile(join("site", "build", "client", "sitemap.xml"), sitemap);
console.log(`Generated sitemap for ${urls.length} canonical site routes.`);
