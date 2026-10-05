/**
 * Guide articles: short, truthful pages for what people search before they
 * find the town (社交電量, 睡不著找人聊天, 匿名聊天安全). Copy lives under
 * `lbt.articles.items.<slug>` in both bundles; this file holds the slugs and
 * dates that the sitemap and the Article structured data share.
 */
export const ARTICLES = [
  { slug: "social-battery", published: "2026-10-05", updated: "2026-10-05" },
  { slug: "cant-sleep", published: "2026-10-05", updated: "2026-10-05" },
  { slug: "anonymous-chat-safety", published: "2026-10-05", updated: "2026-10-05" },
] as const;

export type ArticleSlug = (typeof ARTICLES)[number]["slug"];
export const ARTICLE_SLUGS: readonly ArticleSlug[] = ARTICLES.map((a) => a.slug);

export function findArticle(slug: string) {
  return ARTICLES.find((a) => a.slug === slug);
}

export interface ArticleCopy {
  nav: string;
  title: string;
  description: string;
  intro: string;
  /** Paragraphs (`p`) or a bulleted list (`li`). */
  sections: { h: string; p?: string[]; li?: string[] }[];
}
