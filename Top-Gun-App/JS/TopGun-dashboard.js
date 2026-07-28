import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    collection,
    addDoc,
    doc,
    getDoc,
    query,
    where,
    onSnapshot,
    serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const welcomeMessage = document.getElementById("welcomeMessage");
const logoutBtn = document.getElementById("logoutBtn");
const createTeamBtn = document.getElementById("createTeamBtn");
const teamNameInput = document.getElementById("teamName");
const teamsList = document.getElementById("teamsList");
const dashboardMessage = document.getElementById("dashboardMessage");

let currentUser = null;
let unsubscribeFromTeams = null;

function showDashboardMessage(text, type = "error") {
    dashboardMessage.textContent = text;
    dashboardMessage.style.color =
        type === "success" ? "#0c6e3d" : "#b42318";
}

function createTeamCard(teamId, teamData) {
    const card = document.createElement("article");
    card.classList.add("team-card");

    const teamName = document.createElement("h3");
    teamName.textContent = teamData.teamName;

    const role = document.createElement("p");
    role.textContent =
        teamData.createdBy === currentUser.uid
            ? "Role: Team owner"
            : "Role: Team member";

    const openButton = document.createElement("button");
    openButton.type = "button";
    openButton.textContent = "Open Team";

    openButton.addEventListener("click", () => {
        const encodedTeamId = encodeURIComponent(teamId);

        window.location.href =
    `TopGun-Team.html?teamId=${encodedTeamId}`;
    });

    card.append(teamName, role, openButton);

    return card;
}

function loadTeams(userId) {
    const teamsQuery = query(
        collection(db, "teams"),
        where("members", "array-contains", userId)
    );

    unsubscribeFromTeams = onSnapshot(
        teamsQuery,
        (snapshot) => {
            teamsList.innerHTML = "";

            if (snapshot.empty) {
                teamsList.innerHTML =
                    "<p>You do not have any teams yet.</p>";
                return;
            }

            snapshot.forEach((teamDocument) => {
                const teamCard = createTeamCard(
                    teamDocument.id,
                    teamDocument.data()
                );

                teamsList.appendChild(teamCard);
            });
        },
        (error) => {
            console.error("Unable to load teams:", error);

            teamsList.innerHTML =
                "<p>Unable to load your teams.</p>";

            showDashboardMessage(
                `${error.code || "Unknown error"}: ${error.message}`
            );
        }
    );
}

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "TopGun-Index.html";
        return;
    }

    currentUser = user;

    try {
        const userDocument = await getDoc(
            doc(db, "users", user.uid)
        );

        if (userDocument.exists()) {
            const userData = userDocument.data();

            welcomeMessage.textContent =
                `Welcome, ${userData.name} — ${user.email}`;
        } else {
            welcomeMessage.textContent =
                `Welcome — ${user.email}`;
        }

        loadTeams(user.uid);
    } catch (error) {
        console.error("Unable to load user profile:", error);

        welcomeMessage.textContent =
            `Welcome — ${user.email}`;

        loadTeams(user.uid);
    }
});

createTeamBtn.addEventListener("click", async () => {
    const teamName = teamNameInput.value.trim();

    if (!currentUser) {
        showDashboardMessage(
            "Your session has expired. Please log in again."
        );
        return;
    }

    if (!teamName) {
        showDashboardMessage("Please enter a team name.");
        teamNameInput.focus();
        return;
    }

    createTeamBtn.disabled = true;
    createTeamBtn.textContent = "Creating Team...";

    try {
        await addDoc(collection(db, "teams"), {
            teamName,
            createdBy: currentUser.uid,
            members: [currentUser.uid],
            createdAt: serverTimestamp()
        });

        teamNameInput.value = "";

        showDashboardMessage(
            `${teamName} was created successfully.`,
            "success"
        );
    } catch (error) {
        console.error("Unable to create team:", error);

        showDashboardMessage(
            `${error.code || "Unknown error"}: ${error.message}`
        );
    } finally {
        createTeamBtn.disabled = false;
        createTeamBtn.textContent = "Create Team";
    }
});

teamNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        createTeamBtn.click();
    }
});

logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Logging Out...";

    try {
        if (unsubscribeFromTeams) {
            unsubscribeFromTeams();
        }

        await signOut(auth);

        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);

        showDashboardMessage(
            "Unable to log out. Please try again."
        );

        logoutBtn.disabled = false;
        logoutBtn.textContent = "Logout";
    }
});