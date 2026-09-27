import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/redirect.tsx"),
  route(":lang", "routes/home.tsx"),
  route(":lang/docs/*", "routes/docs.tsx"),
  route(":lang/blog", "routes/blog-index.tsx"),
  route(":lang/blog/:slug", "routes/blog-post.tsx"),
] satisfies RouteConfig;
