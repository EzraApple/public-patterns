# Editorial visualizations

Recommend a visualization only when it makes evidence easier to understand than
one clear sentence. The public article should still make sense without it.

## Choose the smallest useful form

| Evidence | Prefer |
| --- | --- |
| A short regulatory or response sequence | Timeline |
| A few categories or matched periods | Bars |
| Change across many ordered periods | Line |
| Geography is central to the claim | Map |
| Source agreement or disagreement | Compact evidence table |

Avoid a map when location is merely descriptive, a line for two points, or a
chart whose only purpose is visual variety.

## Evidence discipline

- State the unit, denominator, time window, and source.
- Deduplicate operational rows before labeling them as events.
- Keep absent or incomplete coverage visually distinct from zero.
- Do not imply causality through arrows unless the evidence establishes a
  sequence.
- Use direct labels and restrained color. Highlight the finding, not every
  value.
- Preserve the source query or snapshot supporting every plotted value.

Put a recommendation in the internal brief using plain JSON so a later renderer
can interpret it without reading prose:

```json
{
  "kind": "timeline",
  "title": "Three days from closure to passing reinspection",
  "unit": "inspection result",
  "values": [
    { "label": "May 2", "value": "Closure" },
    { "label": "May 5", "value": "Pass" }
  ],
  "sourceUrls": ["https://..."]
}
```

This is an editorial recommendation, not a durable application schema. Include
only the fields the proposed graphic needs.
