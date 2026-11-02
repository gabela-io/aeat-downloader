// Theme preference shared by the extension pages. `data-theme` is the page
// contract (tests, custom styles); `wa-light`/`wa-dark` select Web Awesome's theme.
export type ThemeChoice = "system" | "light" | "dark";

const preference = matchMedia("(prefers-color-scheme: dark)");

export function readTheme(key: string): ThemeChoice {
  try {
    const saved = localStorage.getItem(key);
    if (saved === "light" || saved === "dark" || saved === "system")
      return saved;
  } catch {
    /* Theme selection still works when storage is unavailable. */
  }
  return "system";
}

export function applyTheme(choice: ThemeChoice): void {
  const theme =
    choice === "system" ? (preference.matches ? "dark" : "light") : choice;
  const root = document.documentElement;
  root.dataset.theme = theme;
  root.classList.toggle("wa-dark", theme === "dark");
  root.classList.toggle("wa-light", theme === "light");
}

export function saveTheme(key: string, choice: ThemeChoice): void {
  applyTheme(choice);
  try {
    localStorage.setItem(key, choice);
  } catch {
    /* Session only. */
  }
}

/** Applies the stored choice now and follows system changes while "system". */
export function initializeTheme(key: string, current: () => ThemeChoice): void {
  applyTheme(readTheme(key));
  preference.addEventListener("change", () => applyTheme(current()));
}
