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

function updateToggle(toggle, theme) {
    const usingDarkMode = theme === DARK_THEME;
    toggle.setAttribute("aria-pressed", String(usingDarkMode));
    toggle.setAttribute(
        "aria-label",
        usingDarkMode ? "Switch to light mode" : "Switch to dark mode"
    );
    toggle.title = usingDarkMode ? "Switch to light mode" : "Switch to dark mode";
    toggle.innerHTML = usingDarkMode
        ? '<span aria-hidden="true">☀️</span><span>Light Mode</span>'
        : '<span aria-hidden="true">🌙</span><span>Dark Mode</span>';
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;

    const toggle = document.getElementById("topGunThemeToggle");
    if (toggle) {
        updateToggle(toggle, theme);
    }
}

function createThemeToggle() {
    if (document.getElementById("topGunThemeToggle")) {
        return;
    }

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.id = "topGunThemeToggle";
    toggle.className = "top-gun-theme-toggle";

    toggle.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === DARK_THEME
            ? LIGHT_THEME
            : DARK_THEME;

        window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
    });

    document.body.appendChild(toggle);
    updateToggle(toggle, preferredTheme());
}

ensureThemeStylesheet();
applyTheme(preferredTheme());

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createThemeToggle, {
        once: true
    });
} else {
    createThemeToggle();
}

systemTheme.addEventListener("change", () => {
    if (!savedTheme()) {
        applyTheme(preferredTheme());
    }
});
