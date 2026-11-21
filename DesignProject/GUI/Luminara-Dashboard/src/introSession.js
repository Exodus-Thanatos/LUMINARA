// Decides whether the opening city animation should play.
// PLAY_EVERY_LOAD = true  -> plays every time the page is opened or refreshed.
// PLAY_EVERY_LOAD = false -> plays once per browser session (a refresh skips it;
//                            add ?intro=1 to the address to force it again).
export const PLAY_EVERY_LOAD = true;
export const INTRO_SEEN_KEY = 'luminara.intro.seen.v1';

export const shouldPlayIntro = () => {
  if (PLAY_EVERY_LOAD) return true;
  try {
    if (new URLSearchParams(window.location.search).get('intro') === '1') return true;
    return window.sessionStorage.getItem(INTRO_SEEN_KEY) !== '1';
  } catch {
    return true; // storage blocked: just play it
  }
};

export const markIntroSeen = () => {
  try {
    window.sessionStorage.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    /* storage unavailable */
  }
};
