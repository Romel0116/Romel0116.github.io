import { auth } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

const THEME_STORAGE_KEY = "topGunColorTheme";
const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");

const settingsAccountStatus = document.getElementById("settingsAccountStatus");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
const settingsPageMessage = document.getElementById("settingsPageMessage");
const themeButtons = [...document.querySelectorAll("[data-theme-choice]")];

function storedChoice() {
    const value = window.localStorage.getItem(THEME_STORAGE_KEY);
    return value === "light" || value === "dark" ? value : "system";
}

function effectiveTheme(choice) {
    if (choice === "system") {
        return systemTheme.matches ? "dark" : "light";
    }

    return choice;
}

function displayChoice(choice) {
    themeButtons.forEach((button) => {
        const selected = button.dataset.themeChoice === choice;
        button.classList.toggle("selected", selected);
        button.setAttribute("aria-pressed", String(selected));
    });
}

function selectTheme(choice) {
    if (choice === "system") {
        window.localStorage.removeItem(THEME_STORAGE_KEY);
    } else {
        window.localStorage.setItem(THEME_STORAGE_KEY, choice);
    }

    const theme = effectiveTheme(choice);
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    displayChoice(choice);

    const label = choice === "system"
        ? `Device setting selected. The app is currently using ${theme} mode.`
        : `${choice === "dark" ? "Dark" : "Light"} Mode selected.`;

    settingsPageMessage.textContent = label;
}

themeButtons.forEach((button) => {
    button.addEventListener("click", () => {
        selectTheme(button.dataset.themeChoice);
    });
});

displayChoice(storedChoice());

systemTheme.addEventListener("change", () => {
    if (storedChoice() === "system") {
        selectTheme("system");
    }
});

onAuthStateChanged(auth, (user) => {
    if (!user) {
        window.location.replace("TopGun-Login.html");
        return;
    }

    settingsAccountStatus.textContent = user.email || "Signed in";
});

settingsLogoutBtn.addEventListener("click", async () => {
    settingsLogoutBtn.disabled = true;
    settingsLogoutBtn.textContent = "Logging Out...";

    try {
        await signOut(auth);
        window.location.replace("TopGun-Login.html");
    } catch (error) {
        console.error("Logout error:", error);
        settingsPageMessage.textContent = "Unable to log out. Please try again.";
        settingsLogoutBtn.disabled = false;
        settingsLogoutBtn.textContent = "Logout";
    }
});
