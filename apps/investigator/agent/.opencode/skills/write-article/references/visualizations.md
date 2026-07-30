# Editorial visualizations

Recommend a visualization only when it makes evidence easier to understand than
one clear sentence. The public article should still make sense without it.

## Choose the smallest useful form

| Evidence | Prefer |
| --- | --- |
| A short regulatory or response sequence | Timeline |
| A few categories or matched periods | Comparison |
| Source agreement or response sequence | Source trace |

The first renderer supports timelines, comparisons, and source traces. Leave
`figure` null when those forms do not fit; do not approximate an unsupported
map or chart.

## Evidence discipline

- State the unit, denominator, time window, and source.
- Deduplicate operational rows before labeling them as events.
- Keep absent or incomplete coverage visually distinct from zero.
- Do not imply causality through arrows unless the evidence establishes a
  sequence.
- Use direct labels and restrained color. Highlight the finding, not every
  value.
- Preserve the source query or snapshot supporting every plotted value.

Put the supported figure directly in `output/article.json`:

```json
{
  "title": "Three days from closure to passing reinspection",
  "caption": "San Francisco Department of Public Health inspection records.",
  "detail": {
    "kind": "timeline",
    "duration": "3 days",
    "events": [
      {
        "date": "May 2",
        "label": "Closed",
        "detail": "Routine inspection",
        "tone": "alert"
      },
      {
        "date": "May 5",
        "label": "Passed",
        "detail": "Reinspection",
        "tone": "clear"
      }
    ]
  }
}
```

Comparison details use `previousLabel`, `currentLabel`, and at least two
`groups` shaped as `{ "label", "previous", "current" }`. Source traces use at
least two `events` shaped as `{ "source", "time", "detail" }`, with optional
`duration` and `note`.
