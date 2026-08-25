import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    collection,
    doc,
    getDoc,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const announcementsTeamName = document.getElementById("announcementsTeamName");
const announcementsStatus = document.getElementById("announcementsStatus");
const announcementComposer = document.getElementById("announcementComposer");
const announcementTitle = document.getElementById("announcementTitle");
const announcementMessage = document.getElementById("announcementMessage");
const postAnnouncementBtn = document.getElementById("postAnnouncementBtn");
const announcementsList = document.getElementById("announcementsList");
const backToTeamFromAnnouncements = document.getElementById("backToTeamFromAnnouncements");
const announcementsLogoutBtn = document.getElementById("announcementsLogoutBtn");
const announcementsPageMessage = document.getElementById("announcementsPageMessage");

const urlParameters = new URLSearchParams(window.location.search);
const teamId = urlParameters.get("teamId");

let currentUser = null;
let currentUserName = "";
let currentTeam = null;
let unsubscribeFromAnnouncements = null;

function showAnnouncementsMessage(text, type = "error") {
    announcementsPageMessage.textContent = text;
    announcementsPageMessage.style.color =
        type === "success" ? "#0c6e3d" : "#b42318";
}

function disableAnnouncementsPage(message) {
    announcementsTeamName.textContent = "Announcements unavailable";
    announcementsStatus.textContent = "";
    announcementComposer.hidden = true;
    announcementsList.innerHTML = "";

    const emptyMessage = document.createElement("p");
    emptyMessage.className = "announcements-empty-message";
    emptyMessage.textContent = message;
    announcementsList.appendChild(emptyMessage);
}

function formatAnnouncementDate(timestamp) {
    if (!timestamp) {
        return "Posting...";
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

function createAnnouncementCard(announcementData) {
    const card = document.createElement("article");
    card.className = "announcement-card";

    const header = document.createElement("div");
    header.className = "announcement-card-header";

    const icon = document.createElement("div");
    icon.className = "announcement-card-icon";
    icon.textContent = "📢";

    const heading = document.createElement("div");
    heading.className = "announcement-card-heading";

    const title = document.createElement("h3");
    title.textContent = announcementData.title || "Team Announcement";

    const author = document.createElement("p");
    author.textContent =
        `Posted by ${announcementData.authorName ||
        announcementData.authorEmail || "Team owner"}`;

    heading.append(title, author);

    const timestamp = document.createElement("time");
    timestamp.textContent = formatAnnouncementDate(announcementData.createdAt);

    header.append(icon, heading, timestamp);

    const message = document.createElement("p");
    message.className = "announcement-card-message";
    message.textContent = announcementData.message || "";

    card.append(header, message);
    return card;
}

async function markAnnouncementsSeen() {
    try {
        await setDoc(
            doc(db, "teams", teamId, "memberReadStatus", currentUser.uid),
            {
                userId: currentUser.uid,
                announcementsSeenAt: serverTimestamp()
            },
            { merge: true }
        );
    } catch (error) {
        console.error("Unable to mark Announcements as viewed:", error);
    }
}

function loadAnnouncements() {
    const announcementsQuery = query(
        collection(db, "teams", teamId, "announcements"),
        orderBy("createdAt", "desc")
    );

    unsubscribeFromAnnouncements = onSnapshot(
        announcementsQuery,
        (snapshot) => {
            markAnnouncementsSeen();
            announcementsList.innerHTML = "";

            if (snapshot.empty) {
                announcementsList.innerHTML =
                    '<p class="announcements-empty-message">No announcements have been posted yet.</p>';
                return;
            }

            snapshot.forEach((announcementDocument) => {
                announcementsList.appendChild(
                    createAnnouncementCard(announcementDocument.data())
                );
            });
        },
        (error) => {
            console.error("Unable to load announcements:", error);
            announcementsList.innerHTML =
                '<p class="announcements-empty-message">Unable to load announcements.</p>';
            showAnnouncementsMessage(`${error.code || "Unknown error"}: ${error.message}`);
        }
    );
}

async function loadUserProfile(user) {
    try {
        const userSnapshot = await getDoc(doc(db, "users", user.uid));
        currentUserName = userSnapshot.exists()
            ? userSnapshot.data().name || user.email || "Team owner"
            : user.email || "Team owner";
    } catch (error) {
        console.error("Unable to load user profile:", error);
        currentUserName = user.email || "Team owner";
    }
}

async function loadTeam(user) {
    if (!teamId) {
        disableAnnouncementsPage("No team was selected. Return to the dashboard.");
        return;
    }

    backToTeamFromAnnouncements.href =
        `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;

    try {
        const teamSnapshot = await getDoc(doc(db, "teams", teamId));

        if (!teamSnapshot.exists()) {
            disableAnnouncementsPage("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();
        const members = Array.isArray(teamData.members) ? teamData.members : [];

        if (!members.includes(user.uid)) {
            disableAnnouncementsPage(
                "You do not have permission to view these announcements."
            );
            return;
        }

        currentTeam = teamData;
        announcementsTeamName.textContent = teamData.teamName;

        if (teamData.createdBy === user.uid) {
            announcementsStatus.textContent =
                "You can post and view team announcements.";
            announcementComposer.hidden = false;
        } else {
            announcementsStatus.textContent =
                "Important updates from your team owner.";
            announcementComposer.hidden = true;
        }

        await markAnnouncementsSeen();
        loadAnnouncements();
    } catch (error) {
        console.error("Unable to load announcement page:", error);
        disableAnnouncementsPage("The announcements could not be loaded.");
        showAnnouncementsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    }
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "TopGun-Index.html";
        return;
    }

    currentUser = user;
    await loadUserProfile(user);
    await loadTeam(user);
});

postAnnouncementBtn.addEventListener("click", async () => {
    const title = announcementTitle.value.trim();
    const message = announcementMessage.value.trim();

    if (!currentUser || !currentTeam || !teamId) {
        showAnnouncementsMessage("The announcement page is not ready.");
        return;
    }

    if (currentTeam.createdBy !== currentUser.uid) {
        showAnnouncementsMessage("Only the team owner can post announcements.");
        return;
    }

    if (!title) {
        showAnnouncementsMessage("Please enter an announcement title.");
        announcementTitle.focus();
        return;
    }

    if (!message) {
        showAnnouncementsMessage("Please enter an announcement message.");
        announcementMessage.focus();
        return;
    }

    postAnnouncementBtn.disabled = true;
    postAnnouncementBtn.textContent = "Posting...";

    try {
        const batch = writeBatch(db);
        const announcementReference = doc(
            collection(db, "teams", teamId, "announcements")
        );
        const notificationReference = doc(
            collection(db, "teams", teamId, "notifications")
        );

        batch.set(announcementReference, {
            title,
            message,
            authorId: currentUser.uid,
            authorName: currentUserName,
            authorEmail: currentUser.email || "",
            createdAt: serverTimestamp()
        });

        batch.set(notificationReference, {
            feature: "announcements",
            title: title.slice(0, 150),
            sourceId: announcementReference.id,
            actorId: currentUser.uid,
            createdAt: serverTimestamp()
        });

        await batch.commit();

        announcementTitle.value = "";
        announcementMessage.value = "";
        showAnnouncementsMessage("Announcement posted successfully.", "success");
        announcementTitle.focus();
    } catch (error) {
        console.error("Unable to post announcement:", error);
        showAnnouncementsMessage(`${error.code || "Unknown error"}: ${error.message}`);
    } finally {
        postAnnouncementBtn.disabled = false;
        postAnnouncementBtn.textContent = "Post Announcement";
    }
});

announcementMessage.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        postAnnouncementBtn.click();
    }
});

announcementsLogoutBtn.addEventListener("click", async () => {
    announcementsLogoutBtn.disabled = true;
    announcementsLogoutBtn.textContent = "Logging Out...";

    try {
        if (unsubscribeFromAnnouncements) {
            unsubscribeFromAnnouncements();
        }

        await signOut(auth);
        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);
        showAnnouncementsMessage("Unable to log out. Please try again.");
        announcementsLogoutBtn.disabled = false;
        announcementsLogoutBtn.textContent = "Logout";
    }
});
