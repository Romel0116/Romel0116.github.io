import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    deleteDoc,
    doc,
    getDoc,
    onSnapshot,
    serverTimestamp,
    setDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const settingsTeamName = document.getElementById("settingsTeamName");
const settingsStatus = document.getElementById("settingsStatus");
const paymentSettingsCard = document.getElementById("paymentSettingsCard");
const teamVenmoUrl = document.getElementById("teamVenmoUrl");
const savePaymentSettingsBtn = document.getElementById("savePaymentSettingsBtn");
const removePaymentSettingsBtn = document.getElementById("removePaymentSettingsBtn");
const leagueConnectionCard = document.getElementById("leagueConnectionCard");
const leagueConnectionSummary = document.getElementById("leagueConnectionSummary");
const leagueScheduleUrl = document.getElementById("leagueScheduleUrl");
const leagueTeamName = document.getElementById("leagueTeamName");
const leagueSyncEnabled = document.getElementById("leagueSyncEnabled");
const saveLeagueConnectionBtn = document.getElementById("saveLeagueConnectionBtn");
const removeLeagueConnectionBtn = document.getElementById("removeLeagueConnectionBtn");
const backToTeamFromSettings = document.getElementById("backToTeamFromSettings");
const settingsLogoutBtn = document.getElementById("settingsLogoutBtn");
const teamSettingsPageMessage = document.getElementById("teamSettingsPageMessage");

const urlParameters = new URLSearchParams(window.location.search);
const teamId = urlParameters.get("teamId");

const SUPPORTED_CALENDAR_HOSTS = new Set([
    "tmsdln.com",
    "www.tmsdln.com",
    "calendar.teamsideline.com",
    "teamsideline.com",
    "www.teamsideline.com"
]);

let currentUser = null;
let currentTeam = null;
let currentConnection = null;
let unsubscribeFromConnection = null;
let unsubscribeFromPaymentSettings = null;

function showSettingsMessage(text, type = "error") {
    teamSettingsPageMessage.textContent = text;
    teamSettingsPageMessage.classList.toggle("success", type === "success");
}

function disableSettingsPage(message) {
    settingsTeamName.textContent = "Team Settings unavailable";
    settingsStatus.textContent = message;
    leagueConnectionCard.hidden = true;
    paymentSettingsCard.hidden = true;
}

function normalizeVenmoUrl(value) {
    let parsedUrl;
    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error("Please enter a complete public Venmo profile link.");
    }

    const host = parsedUrl.hostname.toLowerCase();
    if (parsedUrl.protocol !== "https:" || !["venmo.com", "www.venmo.com"].includes(host)) {
        throw new Error("The Venmo profile link must begin with https://venmo.com/.");
    }
    if (!/^\/u\/[a-z0-9_-]+\/?$/i.test(parsedUrl.pathname)) {
        throw new Error("Use the public Venmo profile link in the format https://venmo.com/u/username.");
    }
    parsedUrl.search = "";
    parsedUrl.hash = "";
    return parsedUrl.toString();
}

function listenForPaymentSettings() {
    const reference = doc(db, "teams", teamId, "paymentSettings", "settings");
    unsubscribeFromPaymentSettings = onSnapshot(reference, (snapshot) => {
        const settings = snapshot.exists() ? snapshot.data() : null;
        teamVenmoUrl.value = settings?.venmoUrl || "";
        removePaymentSettingsBtn.hidden = !settings;
    }, (error) => {
        console.error("Unable to load payment settings:", error);
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    });
}

function parseScheduleUrl(value) {
    let parsedUrl;

    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error("Please enter the TeamSideline team calendar URL.");
    }

    if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
        throw new Error("The calendar URL must begin with http:// or https://.");
    }

    if (!SUPPORTED_CALENDAR_HOSTS.has(parsedUrl.hostname.toLowerCase())) {
        throw new Error("Please use the calendar link provided by TeamSideline.");
    }

    if (parsedUrl.hostname.toLowerCase().endsWith("tmsdln.com")) {
        if (!/^\/[a-z0-9]+\/?$/i.test(parsedUrl.pathname)) {
            throw new Error("This TeamSideline short calendar link is invalid.");
        }
    } else if (!parsedUrl.pathname.toLowerCase().includes("ical")) {
        throw new Error("Please use the Subscribe calendar link, not the division page URL.");
    }

    parsedUrl.protocol = "https:";
    return parsedUrl.toString();
}

function formatSyncDate(timestamp) {
    if (!timestamp) {
        return "Not synced yet";
    }

    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString([], {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });
}

function renderConnection(connection) {
    currentConnection = connection;
    leagueConnectionSummary.innerHTML = "";

    if (!connection) {
        const heading = document.createElement("strong");
        heading.textContent = "No league connection yet";
        const detail = document.createElement("span");
        detail.textContent = "Enter the current season information below.";
        leagueConnectionSummary.append(heading, detail);
        leagueConnectionSummary.className = "league-connection-summary";
        removeLeagueConnectionBtn.hidden = true;
        return;
    }

    const status = connection.status || "pending";
    const heading = document.createElement("strong");
    const detail = document.createElement("span");
    const syncDetail = document.createElement("span");

    if (status === "active") {
        heading.textContent = "League connection active";
        detail.textContent =
            `${connection.leagueName || "TeamSideline calendar"} · ` +
            `${connection.externalTeamName || connection.requestedTeamName}`;
    } else if (status === "error") {
        heading.textContent = "Connection needs attention";
        detail.textContent = connection.lastSyncMessage ||
            "The background sync could not validate this connection.";
    } else {
        heading.textContent = "Waiting for validation";
        detail.textContent =
            connection.requestedTeamName;
    }

    syncDetail.textContent = `Last sync: ${formatSyncDate(connection.lastSyncAt)}`;
    leagueConnectionSummary.append(heading, detail, syncDetail);
    leagueConnectionSummary.className =
        `league-connection-summary league-connection-${status}`;

    leagueScheduleUrl.value = connection.scheduleUrl || "";
    leagueTeamName.value = connection.requestedTeamName || "";
    leagueSyncEnabled.checked = connection.enabled !== false;
    removeLeagueConnectionBtn.hidden = false;
}

function listenForConnection() {
    const connectionReference = doc(
        db,
        "teams",
        teamId,
        "leagueConnection",
        "settings"
    );

    unsubscribeFromConnection = onSnapshot(
        connectionReference,
        (snapshot) => {
            renderConnection(snapshot.exists() ? snapshot.data() : null);
        },
        (error) => {
            console.error("Unable to load league connection:", error);
            showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
        }
    );
}

async function loadTeam(user) {
    if (!teamId) {
        disableSettingsPage("No team was selected.");
        return;
    }

    backToTeamFromSettings.href =
        `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;

    try {
        const teamSnapshot = await getDoc(doc(db, "teams", teamId));

        if (!teamSnapshot.exists()) {
            disableSettingsPage("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();

        if (teamData.createdBy !== user.uid) {
            disableSettingsPage("Only the team owner can manage Team Settings.");
            return;
        }

        currentTeam = teamData;
        settingsTeamName.textContent = teamData.teamName || "Team Settings";
        settingsStatus.textContent = "Manage this team’s payments and league schedule connection.";
        leagueConnectionCard.hidden = false;
        paymentSettingsCard.hidden = false;
        listenForPaymentSettings();
        listenForConnection();
    } catch (error) {
        console.error("Unable to load Team Settings:", error);
        disableSettingsPage("Team Settings could not be loaded.");
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "TopGun-Index.html";
        return;
    }

    currentUser = user;
    await loadTeam(user);
});

savePaymentSettingsBtn.addEventListener("click", async () => {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) {
        showSettingsMessage("Only the team owner can save payment settings.");
        return;
    }

    let venmoUrl;
    try {
        venmoUrl = normalizeVenmoUrl(teamVenmoUrl.value.trim());
    } catch (error) {
        showSettingsMessage(error.message);
        teamVenmoUrl.focus();
        return;
    }

    savePaymentSettingsBtn.disabled = true;
    savePaymentSettingsBtn.textContent = "Saving...";
    try {
        await setDoc(doc(db, "teams", teamId, "paymentSettings", "settings"), {
            venmoUrl,
            updatedBy: currentUser.uid,
            updatedAt: serverTimestamp()
        });
        showSettingsMessage("Team payment settings saved.", "success");
    } catch (error) {
        console.error("Unable to save payment settings:", error);
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        savePaymentSettingsBtn.disabled = false;
        savePaymentSettingsBtn.textContent = "Save Payment Settings";
    }
});

removePaymentSettingsBtn.addEventListener("click", async () => {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) return;
    if (!window.confirm("Remove this team’s Venmo link? Existing payment records will remain.")) return;

    removePaymentSettingsBtn.disabled = true;
    try {
        await deleteDoc(doc(db, "teams", teamId, "paymentSettings", "settings"));
        showSettingsMessage("Venmo link removed.", "success");
    } catch (error) {
        console.error("Unable to remove payment settings:", error);
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        removePaymentSettingsBtn.disabled = false;
    }
});

saveLeagueConnectionBtn.addEventListener("click", async () => {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) {
        showSettingsMessage("Only the team owner can save this connection.");
        return;
    }

    const requestedTeamName = leagueTeamName.value.trim();
    let scheduleInformation;

    try {
        scheduleInformation = parseScheduleUrl(leagueScheduleUrl.value.trim());
    } catch (error) {
        showSettingsMessage(error.message);
        leagueScheduleUrl.focus();
        return;
    }

    if (!requestedTeamName) {
        showSettingsMessage("Enter the team name exactly as shown by the league.");
        leagueTeamName.focus();
        return;
    }

    saveLeagueConnectionBtn.disabled = true;
    saveLeagueConnectionBtn.textContent = "Saving...";

    try {
        const connectionReference = doc(
            db,
            "teams",
            teamId,
            "leagueConnection",
            "settings"
        );

        const payload = {
            provider: "teamsideline",
            requestedTeamName,
            calendarUrl: scheduleInformation,
            scheduleUrl: scheduleInformation,
            enabled: leagueSyncEnabled.checked,
            status: "pending",
            createdBy: currentUser.uid,
            updatedAt: serverTimestamp()
        };

        if (!currentConnection?.createdAt) {
            payload.createdAt = serverTimestamp();
        }

        await setDoc(connectionReference, payload, { merge: true });
        showSettingsMessage(
            "League connection saved. It will be validated by the next background sync.",
            "success"
        );
    } catch (error) {
        console.error("Unable to save league connection:", error);
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        saveLeagueConnectionBtn.disabled = false;
        saveLeagueConnectionBtn.textContent = "Save League Connection";
    }
});

removeLeagueConnectionBtn.addEventListener("click", async () => {
    if (!currentUser || currentTeam?.createdBy !== currentUser.uid) {
        showSettingsMessage("Only the team owner can remove this connection.");
        return;
    }

    const confirmed = window.confirm(
        "Remove this league connection? Previously imported events will remain."
    );

    if (!confirmed) {
        return;
    }

    removeLeagueConnectionBtn.disabled = true;

    try {
        await deleteDoc(
            doc(db, "teams", teamId, "leagueConnection", "settings")
        );
        leagueScheduleUrl.value = "";
        leagueTeamName.value = "";
        leagueSyncEnabled.checked = true;
        showSettingsMessage("League connection removed.", "success");
    } catch (error) {
        console.error("Unable to remove league connection:", error);
        showSettingsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        removeLeagueConnectionBtn.disabled = false;
    }
});

settingsLogoutBtn.addEventListener("click", async () => {
    settingsLogoutBtn.disabled = true;
    settingsLogoutBtn.textContent = "Logging Out...";

    try {
        if (unsubscribeFromConnection) {
            unsubscribeFromConnection();
        }
        if (unsubscribeFromPaymentSettings) {
            unsubscribeFromPaymentSettings();
        }

        await signOut(auth);
        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showSettingsMessage("Unable to log out. Please try again.");
        settingsLogoutBtn.disabled = false;
        settingsLogoutBtn.textContent = "Logout";
    }
});

window.addEventListener("beforeunload", () => {
    if (unsubscribeFromConnection) {
        unsubscribeFromConnection();
    }
    if (unsubscribeFromPaymentSettings) {
        unsubscribeFromPaymentSettings();
    }
});
