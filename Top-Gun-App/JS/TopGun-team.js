import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const teamPageName = document.getElementById("teamPageName");
const teamPageRole = document.getElementById("teamPageRole");
const teamSummary = document.getElementById("teamSummary");
const teamPageMessage = document.getElementById("teamPageMessage");
const teamLogoutBtn = document.getElementById("teamLogoutBtn");
const teamSettingsCard = document.getElementById("teamSettingsCard");

const featureCards =
    document.querySelectorAll(".team-feature-card");

const urlParameters =
    new URLSearchParams(window.location.search);

const teamId = urlParameters.get("teamId");

let currentUser = null;
let currentTeam = null;

function showTeamMessage(text, type = "error") {
    teamPageMessage.textContent = text;

    teamPageMessage.style.color =
        type === "success" ? "#0c6e3d" : "#b42318";
}

function disableTeamPage(message) {
    teamPageName.textContent = "Team unavailable";
    teamPageRole.textContent = "";
    teamSummary.textContent = message;

    featureCards.forEach((card) => {
        card.disabled = true;
    });
}

function displayTeam(teamData, user) {
    currentTeam = teamData;

    const isOwner =
        teamData.createdBy === user.uid;

    teamPageName.textContent = teamData.teamName;

    teamPageRole.textContent =
        isOwner
            ? "Your role: Team owner"
            : "Your role: Team member";

    const memberCount =
        Array.isArray(teamData.members)
            ? teamData.members.length
            : 0;

    teamSummary.textContent =
        `${teamData.teamName} currently has ` +
        `${memberCount} member${memberCount === 1 ? "" : "s"}.`;

    if (!isOwner) {
        teamSettingsCard.style.display = "none";
    }
}

async function loadTeam(user) {
    if (!teamId) {
        disableTeamPage(
            "No team was selected. Return to the dashboard and open a team."
        );

        return;
    }

    try {
        const teamReference =
            doc(db, "teams", teamId);

        const teamSnapshot =
            await getDoc(teamReference);

        if (!teamSnapshot.exists()) {
            disableTeamPage(
                "This team could not be found."
            );

            return;
        }

        const teamData = teamSnapshot.data();

        const members =
            Array.isArray(teamData.members)
                ? teamData.members
                : [];

        if (!members.includes(user.uid)) {
            disableTeamPage(
                "You do not have permission to view this team."
            );

            return;
        }

        displayTeam(teamData, user);

    } catch (error) {
        console.error("Unable to load team:", error);

        disableTeamPage(
            "The team could not be loaded."
        );

        showTeamMessage(
            `${error.code || "Unknown error"}: ${error.message}`
        );
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

featureCards.forEach((card) => {
    card.addEventListener("click", () => {
        if (!currentUser || !currentTeam) {
            return;
        }

        const feature = card.dataset.feature;

        if (feature === "schedule") {
    const encodedTeamId = encodeURIComponent(teamId);

    window.location.href =
        `TopGun-Schedule.html?teamId=${encodedTeamId}`;

    return;
}

        if (feature === "announcements") {
    const encodedTeamId =
        encodeURIComponent(teamId);

    window.location.href =
        `TopGun-Announcements.html?teamId=${encodedTeamId}`;

    return;
}



        if (feature === "roster") {
    const encodedTeamId =
        encodeURIComponent(teamId);

    window.location.href =
        `TopGun-Roster.html?teamId=${encodedTeamId}`;

    return;
}
        if (feature === "chat") {
            const encodedTeamId =
                encodeURIComponent(teamId);

            window.location.href =
                `TopGun-chat.html?teamId=${encodedTeamId}`;

            return;
        }

        const featureName =
            card.querySelector("strong").textContent;

        showTeamMessage(
            `${featureName} will be added in an upcoming step.`,
            "success"
        );
    });
});

teamLogoutBtn.addEventListener("click", async () => {
    teamLogoutBtn.disabled = true;
    teamLogoutBtn.textContent = "Logging Out...";

    try {
        await signOut(auth);

        window.location.href = "TopGun-Index.html";

    } catch (error) {
        console.error("Logout error:", error);

        showTeamMessage(
            "Unable to log out. Please try again."
        );

        teamLogoutBtn.disabled = false;
        teamLogoutBtn.textContent = "Logout";
    }
});