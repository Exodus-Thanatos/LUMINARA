# Dark mode

Light stays the default and is unchanged (checked by pixel comparison against the previous build on the Controls, Help and Maintenance pages; the Settings page differs only in the Dark Theme row).

## How to use
- Sidebar: the Dark mode / Light mode switch above the Admin User card.
- Settings > Appearance Preferences > Dark Theme Mode (same setting; it applies immediately, no Save needed).
- The choice is saved in this browser (localStorage key `luminara.theme.v1`) and applied before the page paints, so there is no light flash on reload.

## Files
New:
- `src/theme.js`: theme state (`useTheme`, `setTheme`). Adds/removes the `dark` class on `<html>`.
- `src/dark.css`: every dark colour. Nothing in it applies unless `<html>` has the `dark` class. It re-maps the fixed hex colour classes the app already uses (backgrounds, text, borders, hover states), and themes the charts (axes, grid, tooltips) and the map (popups, zoom buttons; the map tiles are darkened with a CSS filter).
- `src/ThemeSwitch.jsx`: the sidebar switch.

Edited (small):
- `index.html`: 3-line script that applies the saved theme before first paint.
- `src/index.css`: one `@import "./dark.css";` line.
- `src/App.jsx`: imports `ThemeSwitch` and places it above the sign-out card in `Sidebar`.
- `src/Settings.jsx`: the Dark Theme Mode row was a disabled placeholder; it is now live.
- `src/helpContent.js`: Settings Guide sentence updated ("Dark Theme is not available yet" no longer true).
- `PHASE3_CHANGES.md`: stale "Dark theme not available" line updated.

Not touched: server, firmware, data hooks, layouts, spacing, fonts, light colours, the opening city animation (already a night scene).

## Notes
- Brand green, the solid red/amber/blue status colours and the dark sidebar/header keep their colours in both themes.
- The map tile darkening could not be viewed in the build sandbox (no internet for map tiles); everything around the map was checked.
- To follow the device's own dark setting on first visit instead of defaulting to light, change `read()` in `src/theme.js`.
