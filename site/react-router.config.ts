import type { Config } from "@react-router/dev/config";
import { SITE_PRERENDER_ROUTES } from "./prerender-paths";

export default {
  prerender: SITE_PRERENDER_ROUTES,
  ssr: false,
} satisfies Config;
