# Recurrence evidence experiment

These cases compare externally labeled target episodes with matched controls.
They test whether repeated windows carry consistent evidence across sources;
they do not discover the windows, merge observations, or define an event.
Each series keeps its dataset, exact query, and capture date beside its counts.
The target evidence must independently define the event windows.

The experiment reports continuous evidence per source:

- target and control support;
- target counts and how many lie in the aggregate direction relative to the
  control mean;
- mean and absolute difference;
- relative lift when the control mean is nonzero;
- direction of the observed difference.

Classification only describes directional agreement:

- `all-sources-positive`: every included source increased in aggregate;
- `single-source-positive`: one source increased, without corroboration;
- `mixed`: sources moved in different directions.

No magnitude threshold turns these labels into editorial significance.
CI checks arithmetic and classifications against frozen counts; it does not
requery DataSF or prove the labeled pattern still exists upstream. Episode
support is reported for review but does not change the aggregate direction.

Run:

```sh
pnpm eval:recurrence
```

## Cases

| Case | Purpose |
| --- | --- |
| `on-ellis-third-thursdays-2025` | Strong scheduled recurrence with operational dispatch context. |
| `giants-monday-home-games-2025` | Lower-volume scheduled recurrence held out from the initial design. |
| `treasure-island-world-cup-2026` | Real scheduled event whose two sources disagree. |
| `eviction-notices-h1-2025` | Six-month eviction-notice regime change with a pre-pandemic context check. |
| `july-fourth-evenings-2024-2026` | Repeated Fire/EMS and police lift with one severe 311 source miss. |
| `sf-pride-weekends-2024-2026` | Repeated public-safety lift with negative broad 311 evidence. |

Small cases remain in Git. Full historical background windows should move to
immutable, hash-addressed R2 objects only when their size makes repository
storage material.

DataSF can revise historical rows, so a later replay may differ from the frozen
counts. Snapshot raw results only when upstream drift or a published claim
requires exact preservation.
