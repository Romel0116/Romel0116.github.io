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

const TEAMSIDELINE_ORGANIZATION_ID = 222;
const SUPPORTED_HOST = "thewoodlandstownship.teamsidelinesite.com";

let currentUser = null;
let currentTeam = null;
let currentConnection = null;
let unsubscribeFromConnection = null;

function showSettingsMessage(text, type = "error") {
    teamSettingsPageMessage.textContent = text;
    teamSettingsPageMessage.classList.toggle("success", type === "success");
}

function disableSettingsPage(message) {
    settingsTeamName.textContent = "Team Settings unavailable";
    settingsStatus.textContent = message;
    leagueConnectionCard.hidden = true;
}

function parseScheduleUrl(value) {
    let parsedUrl;

    try {
        parsedUrl = new URL(value);
    } catch {
        throw new Error("Please enter a complete TeamSideline schedule URL.");
    }

    if (parsedUrl.protocol !== "https:") {
        throw new Error("The league schedule URL must begin with https://.");
    }

    if (parsedUrl.hostname.toLowerCase() !== SUPPORTED_HOST) {
        throw new Error("This version supports The Woodlands Township TeamSideline site.");
    }

    if (parsedUrl.pathname.toLowerCase() !== "/schedule") {
        throw new Error("Please use the division Schedule page URL.");
    }

    const divisionIdText = parsedUrl.searchParams.get("divisionid");

    if (!divisionIdText || !/^\d+$/.test(divisionIdText)) {
        throw new Error("The URL is missing a valid divisionid value.");
    }

    const divisionId = Number(divisionIdText);

    if (!Number.isSafeInteger(divisionId) || divisionId <= 0) {
        throw new Error("The division ID in the URL is invalid.");
    }

    return {
        divisionId,
        normalizedUrl:
            `https://${SUPPORTED_HOST}/schedule?divisionid=${divisionId}`
    };
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
            `${connection.leagueName || "TeamSideline league"} · ` +
            `${connection.divisionName || `Division ${connection.divisionId}`} · ` +
            `${connection.externalTeamName || connection.requestedTeamName}`;
    } else if (status === "error") {
        heading.textContent = "Connection needs attention";
        detail.textContent = connection.lastSyncMessage ||
            "The background sync could not validate this connection.";
    } else {
        heading.textContent = "Waiting for validation";
        detail.textContent =
            `Division ${connection.divisionId} · ${connection.requestedTeamName}`;
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
        settingsStatus.textContent = "Manage this team’s league schedule connection.";
        leagueConnectionCard.hidden = false;
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
            organizationId: TEAMSIDELINE_ORGANIZATION_ID,
            divisionId: scheduleInformation.divisionId,
            requestedTeamName,
            scheduleUrl: scheduleInformation.normalizedUrl,
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
});
