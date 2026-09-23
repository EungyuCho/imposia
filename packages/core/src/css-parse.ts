import type { Parser, Root } from "postcss";
import postcssParse from "postcss/lib/parse";

// Importing the parser alone keeps postcss's processor, LazyResult, and source
// map generator out of the Core bundle. The subpath is typed as returning
// `Root | Document`; plain CSS input always parses to a Root, which is how the
// package entry types `postcss.parse`.
export const parseCss = postcssParse as Parser<Root>;
