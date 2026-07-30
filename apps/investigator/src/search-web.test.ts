import { describe, expect, it } from "vitest";
import { parseSearchResults } from "../agent/.opencode/plugins/search-web.ts";

describe("web search results", () => {
  it("extracts the destination, title, and snippet from Yahoo results", () => {
    const html = `
      <a class="d-ib va-top result" href="https://r.search.yahoo.com/x/RU=https%3A%2F%2Fwww.sfmta.com%2Fmarathon/RK=2/RS=x">
        <h3><span>San Francisco Marathon &amp; transit</span></h3>
      </a></div><div class="compText aAbs"><p>Official street &amp; service changes.</p>
    `;

    expect(parseSearchResults(html)).toEqual([
      {
        title: "San Francisco Marathon & transit",
        url: "https://www.sfmta.com/marathon",
        snippet: "Official street & service changes.",
      },
    ]);
  });
});
