// Light / dark theme. Light is the default (the original LUMINARA look, untouched).
// Dark is switched on by the `dark` class on <html>; src/dark.css holds every dark colour.
// The choice is saved in this browser. index.html applies it before the first paint so the page never flashes.
import { useSyncExternalStore } from 'react';

export const THEME_KEY = 'luminara.theme.v1';

const read = () => {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light'; // storage blocked: stay light
  }
};

const apply = (t) => {
  const root = document.documentElement;
  root.classList.toggle('dark', t === 'dark');
  root.style.colorScheme = t === 'dark' ? 'dark' : ''; // dark scrollbars and native form controls
};

let current = typeof window === 'undefined' ? 'light' : read();
if (typeof window !== 'undefined') apply(current);

const subs = new Set();
const subscribe = (f) => {
  subs.add(f);
  return () => subs.delete(f);
};

export const setTheme = (t) => {
  current = t === 'dark' ? 'dark' : 'light';
  apply(current);
  try {
    localStorage.setItem(THEME_KEY, current);
  } catch {
    /* private mode: the choice just will not persist */
  }
  subs.forEach((f) => f());
};

export const useTheme = () => useSyncExternalStore(subscribe, () => current, () => 'light');
