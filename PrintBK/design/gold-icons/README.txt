PrintBK premium gold icon set (reference implementation)

Files
- icons/gold-*.svg   12 badges: theme, presets, phone, notifications, language, privacy, clear, help, about, contact, shop, history
- preview.png        how they should look on light and dark backgrounds

Style (matches the supplied reference image)
- Glossy metallic gold ring, black glass disc with a soft reflection, gold glyph with a dark offset for depth, small four-point sparkle at the upper right.
- Flat SVG paint (SVG gradients and a small blur for the glint only). No CSS gradients.
- Use sparkle only at 56px and larger. At 48px or smaller hide the sparkle.

Important when you build the component
- Each file uses unique gradient ids. In the app, define the gradients once in a hidden SVG sprite with <symbol> and use <use>, otherwise duplicate ids across badges on one page can break the paint.

Glyph licence
- Glyph outlines are based on Material Icons (Apache License 2.0). Keep this note in the repo.
