export type SearchResult = { title: string; url: string; content: string };

/** Web search, behind a seam so tests can substitute canned results. */
export interface SearchClient {
  search(query: string): Promise<SearchResult[]>;
}

export class SearchUnavailableError extends Error {}

const TAVILY_URL = "https://api.tavily.com/search";

/** Tavily's free tier: ~1,000 basic searches a month. Returns null when no key is configured. */
export function createTavilyClient(env: NodeJS.ProcessEnv = process.env): SearchClient | null {
  const apiKey = env.TAVILY_API_KEY;
  if (!apiKey) return null;

  return {
    async search(query) {
      let response: Response;
      try {
        response = await fetch(TAVILY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: false }),
          signal: AbortSignal.timeout(20_000),
        });
      } catch (error) {
        throw new SearchUnavailableError("Web search could not be reached", { cause: error });
      }
      if (!response.ok) {
        const reason = response.status === 429 || response.status === 432 ? "is over its quota" : `failed (${response.status})`;
        throw new SearchUnavailableError(`Web search ${reason}`);
      }
      const body = (await response.json()) as { results?: { title?: string; url?: string; content?: string }[] };
      return (body.results ?? [])
        .filter((result) => result.url && result.content)
        .map((result) => ({ title: result.title ?? result.url!, url: result.url!, content: result.content! }));
    },
  };
}
