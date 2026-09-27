import {
  defineCollections,
  defineConfig,
  defineDocs,
  frontmatterSchema,
} from "fumadocs-mdx/config";
import { z } from "zod";

export const docs = defineDocs({
  dir: "content/docs",
});

export const articles = defineCollections({
  type: "doc",
  dir: "content/articles",
  schema: frontmatterSchema.extend({
    title: z.string().min(1),
    description: z.string().min(1),
    date: z.iso.date(),
    category: z.string().min(1),
  }),
});

export default defineConfig();
