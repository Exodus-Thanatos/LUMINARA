// One flag in this browser so the first-time tutorial is offered once. Values: 'done' | 'skipped' | null (never offered).
export const TUTORIAL_KEY = 'luminara.tutorial.v1';
export const readTutorialFlag = () => {
  try {
    return localStorage.getItem(TUTORIAL_KEY);
  } catch {
    return null;
  }
};
export const writeTutorialFlag = (v) => {
  try {
    localStorage.setItem(TUTORIAL_KEY, v);
  } catch {
    /* private mode: the tutorial may be offered again next visit */
  }
};
