# PowerPoint sync

`build_deck.py` rebuilds the design slides (Dashboard … Settings, plus a mobile slide) from the **running website**, as native
editable PowerPoint shapes. Run it after any UI change so the deck always matches the site.

1. `npm run build && npx vite preview --port 4173 --host 127.0.0.1` (do **not** start the receiver: the slides show the demo data and
   the script stops if it finds live data).
2. `python3 tools/ppt-sync/build_deck.py <previous-deck.pptx> <new-deck.pptx>`

Slides 1–2 (intro art, login) are carried over from the previous deck; slides 3+ are regenerated.
Needs `pip install playwright python-pptx cairosvg` and `playwright install chromium`.
Notes: only `/api/control` is stubbed (so the Controls card shows "controller offline" rather than an error); map base tiles are not captured.
