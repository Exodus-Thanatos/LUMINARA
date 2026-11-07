// Light / dark switch at the bottom of the sidebar (same setting as Settings > Appearance > Dark Theme Mode).
import { Moon, Sun } from 'lucide-react';
import { setTheme, useTheme } from './theme.js';

const ThemeSwitch = () => {
  const dark = useTheme() === 'dark';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label="Dark mode"
      title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}
      className="mx-4 mt-2 w-[calc(100%-2rem)] h-11 px-4 rounded-lg flex items-center gap-3 text-sm text-[#d5deea] hover:bg-[#1b2e4b] transition-colors"
    >
      {dark ? <Sun className="w-5 h-5 opacity-80" aria-hidden="true" /> : <Moon className="w-5 h-5 opacity-80" aria-hidden="true" />}
      <span className="flex-1 text-left">{dark ? 'Light mode' : 'Dark mode'}</span>
      <span aria-hidden="true" className={`relative w-9 h-5 rounded-full transition-colors ${dark ? 'bg-[#27a85a]' : 'bg-[#3a4e70]'}`}>
        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${dark ? 'translate-x-4' : ''}`} />
      </span>
    </button>
  );
};

export default ThemeSwitch;
