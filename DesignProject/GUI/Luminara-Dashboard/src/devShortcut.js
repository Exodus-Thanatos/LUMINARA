// The sign-in page opens the developer registration form with a keyboard shortcut instead of a visible link.
// This only hides a door: it is NOT security. The server still refuses anything without a valid administrator-issued key.
export const DEV_SHORTCUT_LABEL = 'Ctrl+Shift+D'; // change the letter here (and nowhere else) to use another shortcut
const DEV_SHORTCUT_KEY = 'd';

// Works for Ctrl (Windows/Linux) and Cmd (Mac). Extra modifiers such as Alt do not count.
export const isDevShortcut = (e) => !!e && !e.altKey && !!e.shiftKey && !!(e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === DEV_SHORTCUT_KEY;
