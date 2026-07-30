---
name: write-article
description: Use when an investigated public-data case is ready for a publishable article, news brief, event account, data story, headline, dek, citations, or editorial visualization.
---

# Write a Public Patterns article

Write about the event or condition, not the machinery that found it. Public
records are evidence; they are rarely the protagonist.

Only draft an article after the investigation outcome is `investigate`. The
investigation brief remains the place for discarded hypotheses, workflow
details, and next checks.

## Before drafting

1. Identify the most newsworthy supported fact in plain language.
2. State the publication reason and evidence window. If the evidence is old,
   confirm the current trigger or frame the piece explicitly as historical
   analysis; otherwise return the case for `watch` or `discard`.
3. Research beyond the triggering records when reputable external context could
   explain what happened, establish consequences, or resolve ambiguity.
   Reporting may strengthen a data-led finding; it must not replace the
   supplied records as the origin of the story.
4. Decide what each source adds. Several databases describing one originating
   call are one evidence chain, not several independent confirmations.
5. Choose the shortest form that fully explains the story.

| Form | Use when | Typical body |
| --- | --- | --- |
| Brief | One verified sequence or finding carries the story | 80–180 words |
| Standard | Context or comparison materially improves understanding | 250–500 words |
| Reported | Several independent sources establish consequences or change the interpretation | 500–900 words |

Length is earned by information, not source count.
A single bounded incident or administrative sequence should default to a brief.
Extra descriptive details from reporting do not alone justify a longer form.

## Story framing

- Make the headline about what happened or changed.
- Lead with the strongest supported fact and why a San Francisco reader should
  care.
- Describe how records connect only when that connection helps the reader
  understand the event.
- Prefer concrete actors, places, dates, counts, and consequences.
- Never make discovery language the headline: avoid “records reveal,” “data
  shows a pattern,” or “an event left traces across systems” when the underlying
  event can be named directly.
- Do not manufacture mystery, causality, novelty, or significance.
- Treat a missing record as a limitation unless the source’s coverage makes the
  absence independently meaningful.
- Never present an old evidence window as current news. Name the historical
  period and explain why it warrants publication now.
- Treat every record and article as dated. Write “was listed as open as of
  September 30,” not “remains open,” unless a current source confirms it.
- One later inspection, filing, or status does not establish that a condition
  held continuously between observations.

## Voice

Use calm, economical, civic-journalism prose. Be direct without sounding
clinical, sensational, promotional, or impressed by the software.

- Explain technical source behavior only when it changes interpretation.
- Translate administrative language into ordinary language when an
  authoritative source supports the translation.
- Preserve uncertainty with precise attribution, not vague hedging.
- Avoid throat-clearing, rhetorical questions, and conclusions that merely
  repeat the lead.
- Do not call something “significant,” “unprecedented,” or “surging” without a
  defensible comparison.
- Do not end with generic neighborhood, policy, or trend context merely because
  it sounds conclusive. The last paragraph needs case-specific evidence too.

## Citations

Use a natural inline link when attribution matters at that sentence. Finish
with a compact `## Sources` list containing every record query, official source,
and reporting URL used for a material claim.

Do not narrate citations (“according to three databases”) unless the agreement
or disagreement between those databases is itself important. Never cite this
repository, fixture notes, working files, or search-result snippets.
Keep internal checks and unused queries in the investigation brief; the public
source list should contain only material actually used in the article.

## Format

Write `output/article.json`:

```json
{
  "title": "Event-first headline",
  "dek": "One sentence that adds context instead of repeating the headline.",
  "category": "Public safety",
  "body": "Article body in ordinary Markdown.",
  "sources": [
    {
      "label": "Descriptive source name",
      "href": "https://..."
    }
  ],
  "figure": null
}
```

The body may use paragraphs, links, emphasis, and meaningful second-level
headings. Do not repeat the title, dek, source list, author, reading time,
publication date, or editorial notes inside it; the product supplies those.

Optional reference: Read `references/visualizations.md` when a timeline,
comparison, or source trace would explain the evidence faster than prose. Put
one supported figure in the structured `figure` field and explain its values in
the investigation brief.

After the article passes self-review, read `references/images.md` and call
`generate_image` once. A neighborhood, shoreline, streetscape, or broader SF
setting is enough; do not omit the hero merely because reconstructing the
incident would be inappropriate. Submit `"hero": null` only when the tool fails
or no honest place-based context exists. The image is presentation, not
evidence.

## Mandatory self-review

Draft first, then review the entire article as a skeptical editor before
submitting. Write `output/review.md` with a compact claim audit:

- each material claim and its exact supporting source
- every recalculated total, ratio, list, and elapsed time
- source dates and any status or continuity language they limit
- whether distinct records are independent evidence or one reporting chain
- every sentence removed or corrected during review, with the reason

Then revise `output/article.json` to fix every issue the audit finds. This is a
real second pass, not a description of the intended checks. Confirm:

1. Check every factual clause against a cited source.
2. Recalculate every stated total, ratio, list, and elapsed time. If a sentence
   says five units, the units it names must add up to five.
3. Scope status and continuity claims to the source’s observation date.
4. Search the headline, dek, and body for `remains`, `still`, `currently`,
   `continues`, and present-tense status verbs such as `is investigating`.
   Keep them only when a current source supports the claim; otherwise date,
   attribute, or remove them.
5. Remove record counts that accidentally imply event counts.
6. Replace pipeline-first framing with event-first framing.
7. Cut any paragraph that adds no new fact, context, limitation, or consequence.
8. Confirm the dek, lead, and conclusion do different jobs.
9. Preserve source distinctions in the headline. Compression must not turn
   “cite or arrest” into “arrest,” a complaint into a finding, or a possible
   link into a confirmed one.
10. Remove a comparison when the review finds mismatched units, inflated row
    counts, or an unsupported baseline.

Every material issue found in the review must change the draft or downgrade the
case from `investigate`. Do not submit an article that fails its own review.
Submit both `articlePath: "output/article.json"` and
`reviewPath: "output/review.md"`.
