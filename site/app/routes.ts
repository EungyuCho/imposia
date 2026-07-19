import { index, type RouteConfig, route } from "@react-router/dev/routes";

export default [
  index("routes/redirect.tsx"),
  route(":lang", "routes/home.tsx"),
  route(":lang/docs/*", "routes/docs.tsx"),
] satisfies RouteConfig;
