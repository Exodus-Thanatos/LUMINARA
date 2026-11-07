# Phase 3: Help Center, tutorial, notifications, fault details, PZEM and Settings improvements

Frontend only. Not touched: `server/`, `firmware/`, API endpoints and request bodies. The commented-out copies in `App.jsx` are preserved.
Theme, sidebar, cards, buttons, colours and typography are reused as they were; every new screen uses the existing `Page`, `Header`, `Card`, `CardTitle` and button styles.

## Added
- **Help Center + User Manual** (sidebar, under a thin divider; main nav order unchanged). 10 sections as specified, searchable, breadcrumbs, previous/next, numbered steps. `src/HelpCenter.jsx`, `src/helpContent.js`.
- **First-time tutorial**: offered once after sign-in (Start / Skip, Next / Previous, Esc = skip), highlights the real sidebar items and the PZEM panel, opens the phone menu when needed, restartable from Help Center. `src/Tutorial.jsx`, `src/tutorialFlag.js`.
- **Contextual help icon** in every page header (opens that page's manual article).
- **Dashboard**: connection badge + "updated N s ago" + time, data-freshness counts, Alert Summary, loading skeletons while connecting, empty/disconnected wording. `src/DashboardStatus.jsx`, `src/dashboardStatus.js`.
- **Fault details** (Dashboard alerts, Alert Summary, Streetlights row action, notifications): severity (critical / warning / informational), problem, POSSIBLE causes marked "not confirmed", recommended actions, current status, last report time, link to the troubleshooting article. `src/FaultDetail.jsx`, `src/faultInfo.js`.
- **Notification Center** (bell): unread count, read/unread, timestamps, category filter, mark all read, clear all (with confirm). Built only from what this browser observed (faults, offline lamps, receiver link lost/restored). `src/NotificationCenter.jsx`, `src/notifications.js`.
- **PZEM**: status word beside each reading using guide thresholds (voltage 207-253 V, frequency 59-61 Hz, power factor only while a load draws power), one-line explanation per reading, "last known reading" labelling with timestamp, dash for unavailable (never zero), history chart selector (power / voltage / current / energy counter).
- **Settings**: Compact Map View is staged with Save Changes / Cancel and a confirmation dialog, then a success message; worker-account form and voltage threshold are validated; the preview items still say they save nothing. `src/Dialogs.jsx`.
- **Search / filters**: Streetlights gets a severity filter and Clear filters; Maintenance gets search and Clear filters; empty-result messages.
- **Accessibility**: skip link, labels on icon buttons and filters, focus outlines for inputs/links, `aria-current`, dialogs with focus trap and Esc, status always shown as words as well as colour.

## Small changes to existing files
`App.jsx` (nav, header, wiring), `useLiveLamps.js` (adds `receivedAt` to the hook state only), `usePzem.js` (adds `at`), `pzemFormat.js` (additions only), `PzemPanel.jsx`, `Settings.jsx`, `uiKit.jsx` (`Field` error prop), `index.css`, `package.json` (test list).

## Limits (needs backend or data that does not exist; NOT faked)
- Maintenance tickets are still sample data, so there are no maintenance notifications, and date filtering is not offered.
- Notifications and read state live in this browser only; the server keeps no event history, and "first detected" time is not recorded (only last report time).
- PZEM history has no frequency / power factor, no stored dates beyond the receiver's 24 h in-memory window.
- Alert, timezone and voltage-threshold settings remain previews (no server setting to save to). Dark theme: added afterwards, see DARK_MODE_CHANGES.md.
- Demo mode creates no notifications and no alert summary.

## Tests
`npm test`: 66 pass (51 before + 15 new). `npm run build`: OK. `npm run lint`: same 5 pre-existing problems, none new.
Headless-browser run against a real receiver with test telemetry: 40 checks (tutorial, dashboard, fault dialog, notifications, filters, PZEM, help search, settings confirm/validation, 390 px mobile) all pass, no console errors.
Test-data note: `send-test-data.js` / `send-test-pzem.js` default to key `dev-key-change-me` but the server defaults to `rophil1234`; set `DEVICE_KEY` on both (existing issue, unchanged).
