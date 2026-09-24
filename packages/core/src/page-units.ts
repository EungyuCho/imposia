/**
 * Page dimensions and the CSS pixel formatter shared by pagination and the
 * canonical frame stylesheet. Kept apart from `page-media.ts` so the frame
 * (and every Viewer route that reaches it) does not carry the `@page` parser.
 */
export const A4_WIDTH_CSS_PX = (210 * 96) / 25.4;
export const A4_HEIGHT_CSS_PX = (297 * 96) / 25.4;
export const LETTER_WIDTH_CSS_PX = 8.5 * 96;
export const LETTER_HEIGHT_CSS_PX = 11 * 96;
export const DEFAULT_PAGE_MARGIN_CSS_PX = (20 * 96) / 25.4;

export function cssPx(value: number): string {
  return `${Number(value.toFixed(6))}px`;
}
