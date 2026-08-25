import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    limit,
    onSnapshot,
    orderBy,
    query
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const teamPageName = document.getElementById("teamPageName");
const teamPageRole = document.getElementById("teamPageRole");
const teamSummary = document.getElementById("teamSummary");
const teamPageMessage = document.getElementById("teamPageMessage");
const teamLogoutBtn = document.getElementById("teamLogoutBtn");
const teamSettingsCard = document.getElementById("teamSettingsCard");
const featureCards = document.querySelectorAll(".team-feature-card");

const urlParameters = new URLSearchParams(window.location.search);
const teamId = urlParameters.get("teamId");

let currentUser = null;
let currentTeam = null;
let notifications = [];
let readStatus = {};
let unsubscribeFromNotifications = null;
let unsubscribeFromReadStatus = null;

function showTeamMessage(text, type = "error") {
    teamPageMessage.textContent = text;
    teamPageMessage.style.color = type === "success" ? "#0c6e3d" : "#b42318";
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
    const isOwner = teamData.createdBy === user.uid;
    const members = Array.isArray(teamData.members) ? teamData.members : [];

    teamPageName.textContent = teamData.teamName;
    teamPageRole.textContent = isOwner
        ? "Your role: Team owner"
        : "Your role: Team member";
    teamSummary.textContent =
        `${teamData.teamName} currently has ${members.length} ` +
        `member${members.length === 1 ? "" : "s"}.`;

    if (!isOwner) {
        teamSettingsCard.style.display = "none";
    }
}

function timestampMillis(timestamp) {
    if (!timestamp) {
        return 0;
    }

    if (typeof timestamp.toMillis === "function") {
        return timestamp.toMillis();
    }

    return new Date(timestamp).getTime() || 0;
}

function unreadCount(feature) {
    const seenField = feature === "announcements"
        ? "announcementsSeenAt"
        : "scheduleSeenAt";
    const seenAt = timestampMillis(readStatus[seenField]);

    return notifications.filter((notification) =>
        notification.feature === feature &&
        notification.actorId !== currentUser?.uid &&
        timestampMillis(notification.createdAt) > seenAt
    ).length;
}

function renderUnreadIndicators() {
    ["announcements", "schedule"].forEach((feature) => {
        const card = document.querySelector(
            `.team-feature-card[data-feature="${feature}"]`
        );

        if (!card) {
            return;
        }

        let badge = card.querySelector(".team-unread-badge");

        if (!badge) {
            badge = document.createElement("span");
            badge.className = "team-unread-badge";
            badge.setAttribute("aria-live", "polite");
            card.appendChild(badge);
        }

        const count = unreadCount(feature);
        const hasUnread = count > 0;

        card.classList.toggle("team-feature-has-unread", hasUnread);
        badge.hidden = !hasUnread;
        badge.textContent = count > 99 ? "99+ New" : `${count} New`;
        card.setAttribute(
            "aria-label",
            hasUnread
                ? `${card.querySelector("strong").textContent}, ${count} new`
                : card.querySelector("strong").textContent
        );
    });
}

function listenForUnreadActivity(user) {
    const notificationsQuery = query(
        collection(db, "teams", teamId, "notifications"),
        orderBy("createdAt", "desc"),
        limit(100)
    );

    unsubscribeFromNotifications = onSnapshot(
        notificationsQuery,
        (snapshot) => {
            notifications = snapshot.docs.map((notificationDocument) =>
                notificationDocument.data()
            );
            renderUnreadIndicators();
        },
        (error) => {
            console.error("Unable to load team notifications:", error);
        }
    );

    unsubscribeFromReadStatus = onSnapshot(
        doc(db, "teams", teamId, "memberReadStatus", user.uid),
        (snapshot) => {
            readStatus = snapshot.exists() ? snapshot.data() : {};
            renderUnreadIndicators();
        },
        (error) => {
            console.error("Unable to load read status:", error);
        }
    );
}

async function loadTeam(user) {
    if (!teamId) {
        disableTeamPage("No team was selected. Return to the dashboard and open a team.");
        return;
    }

    try {
        const teamSnapshot = await getDoc(doc(db, "teams", teamId));

        if (!teamSnapshot.exists()) {
            disableTeamPage("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();
        const members = Array.isArray(teamData.members) ? teamData.members : [];

        if (!members.includes(user.uid)) {
            disableTeamPage("You do not have permission to view this team.");
            return;
        }

        displayTeam(teamData, user);
        listenForUnreadActivity(user);
    } catch (error) {
        console.error("Unable to load team:", error);
        disableTeamPage("The team could not be loaded.");
        showTeamMessage(`${error.code || "Unknown error"}: ${error.message}`);
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
        const encodedTeamId = encodeURIComponent(teamId);
        const destinations = {
            schedule: "TopGun-Schedule.html",
            announcements: "TopGun-Announcements.html",
            roster: "TopGun-Roster.html",
            chat: "TopGun-chat.html"
        };

        if (destinations[feature]) {
            window.location.href =
                `${destinations[feature]}?teamId=${encodedTeamId}`;
            return;
        }

        const featureName = card.querySelector("strong").textContent;
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
        if (unsubscribeFromNotifications) {
            unsubscribeFromNotifications();
        }

        if (unsubscribeFromReadStatus) {
            unsubscribeFromReadStatus();
        }

        await signOut(auth);
        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showTeamMessage("Unable to log out. Please try again.");
        teamLogoutBtn.disabled = false;
        teamLogoutBtn.textContent = "Logout";
    }
});

window.addEventListener("beforeunload", () => {
    if (unsubscribeFromNotifications) {
        unsubscribeFromNotifications();
    }

    if (unsubscribeFromReadStatus) {
        unsubscribeFromReadStatus();
    }
});
