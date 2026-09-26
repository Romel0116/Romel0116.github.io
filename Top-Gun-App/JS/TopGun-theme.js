const THEME_STORAGE_KEY = "topGunColorTheme";
const DARK_THEME = "dark";
const LIGHT_THEME = "light";

const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

function savedTheme() {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === DARK_THEME || value === LIGHT_THEME
        ? value
        : null;
}

function preferredTheme() {
    return savedTheme() || (systemTheme.matches ? DARK_THEME : LIGHT_THEME);
}

function ensureThemeStylesheet() {
    if (document.getElementById("topGunDarkModeStyles")) {
        return;
    }

    const stylesheet = document.createElement("link");
    stylesheet.id = "topGunDarkModeStyles";
    stylesheet.rel = "stylesheet";
    stylesheet.href = "CSS/TopGun-dark-mode.css";
    document.head.appendChild(stylesheet);
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
}

ensureThemeStylesheet();
applyTheme(preferredTheme());

systemTheme.addEventListener("change", () => {
    if (!savedTheme()) {
        applyTheme(preferredTheme());
    }
});
