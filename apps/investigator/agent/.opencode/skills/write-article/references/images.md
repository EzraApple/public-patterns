# Contextual article images

Generate one wide hero after the article has passed claim review. Prefer a
quiet San Francisco establishing image that is near the story in place,
subject, or mood without pretending to show the reported event.

## Choose the scene

Use the nearest honest layer of context:

1. The actual public place when it is visually recognizable and supported.
2. The surrounding neighborhood, shoreline, streetscape, or civic setting.
3. A broader San Francisco place associated with the subject.

Do not invent a literal scene merely to make the image more relevant. A
fog-softened shoreline can accompany a marine response; it must not depict an
unobserved rescue. A neighborhood facade can accompany housing data; it must
not imply that a pictured home received a notice.

## Prompt shape

Give `generate_image` a compact `scene` covering:

- setting and grounded SF details;
- wide, asymmetrical composition with crop-safe edges;
- ordinary Bay Area weather and natural light;
- a restrained color palette;
- story-specific subjects to exclude.

The tool supplies the shared documentary style and global safety constraints.
Do not repeat them or ask for a news reenactment.

Good:

> Rugged coastal rocks and cold blue-gray water west of the Golden Gate,
> low summer fog, with only a partial bridge silhouette in the distance.
> Strong foreground texture and open water; slate blue, fog gray, and muted
> rust. Exclude boats, responders, memorials, and dramatic weather.

Weak:

> Firefighters recover a body near the Golden Gate Bridge.

Landmarks should establish place, not dominate like tourism advertising.
Incidental neighborhood details often feel more credible than a postcard view.

## Metadata

Write literal alt text describing only what is visible. The tool supplies the
standard disclosure caption.

Copy the returned `hero` object into `output/article.json`. Call the tool at
most once. If it fails, submit the reviewed article with `"hero": null`; image
failure never downgrades or blocks a supported story.
