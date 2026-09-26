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
    serverTimestamp,
    updateDoc,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const welcomeMessage =
    document.getElementById("welcomeMessage");

const logoutBtn =
    document.getElementById("logoutBtn");

const createTeamBtn =
    document.getElementById("createTeamBtn");

const teamNameInput =
    document.getElementById("teamName");

const teamsList =
    document.getElementById("teamsList");

const dashboardMessage =
    document.getElementById("dashboardMessage");

const teamInviteCodeInput =
    document.getElementById("teamInviteCode");

const joinTeamBtn =
    document.getElementById("joinTeamBtn");

const dashboardRoleBadge =
    document.getElementById("dashboardRoleBadge");

const teamsHeading =
    document.getElementById("teamsHeading");

const teamsIntroduction =
    document.getElementById("teamsIntroduction");

const adminToolsCard =
    document.getElementById("adminToolsCard");

const openExpenseSheetBtn =
    document.getElementById("openExpenseSheetBtn");

const openAppSettingsBtn =
    document.getElementById("openAppSettingsBtn");

let currentUser = null;
let currentUserIsAdmin = false;
let unsubscribeFromTeams = null;

function showDashboardMessage(text, type = "error") {
    dashboardMessage.textContent = text;

    dashboardMessage.style.color =
        type === "success"
            ? "#0c6e3d"
            : "#b42318";
}

function createTeamCard(teamId, teamData) {
    const card =
        document.createElement("article");

    card.classList.add("team-card");

    const teamName =
        document.createElement("h3");

    teamName.textContent =
        teamData.teamName || "Unnamed Team";

    const role =
        document.createElement("p");

    const captainId = teamData.captainId || teamData.createdBy;

    if (currentUserIsAdmin) {
        role.textContent = captainId === currentUser.uid
            ? "Role: Team Admin and Team Captain"
            : "Role: Team Admin";
    } else {
        role.textContent = captainId === currentUser.uid
            ? "Role: Team Captain"
            : "Role: Team Member";
    }

    const openButton =
        document.createElement("button");

    openButton.type = "button";
    openButton.textContent = "Open Team";

    openButton.addEventListener("click", () => {
        const encodedTeamId =
            encodeURIComponent(teamId);

        window.location.href =
            `TopGun-Team.html?teamId=${encodedTeamId}`;
    });

    card.append(
        teamName,
        role,
        openButton
    );

    return card;
}

function loadTeams(userId, isAdmin) {
    if (unsubscribeFromTeams) {
        unsubscribeFromTeams();
    }

    const teamsQuery = isAdmin
        ? query(collection(db, "teams"))
        : query(
            collection(db, "teams"),
            where(
                "members",
                "array-contains",
                userId
            )
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
                const teamCard =
                    createTeamCard(
                        teamDocument.id,
                        teamDocument.data()
                    );

                teamsList.appendChild(teamCard);
            });
        },

        (error) => {
            console.error(
                "Unable to load teams:",
                error
            );

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
        window.location.href =
            "TopGun-Login.html";

        return;
    }

    currentUser = user;

    try {
        const userDocument = await getDoc(
            doc(db, "users", user.uid)
        );

        if (userDocument.exists()) {
            const userData =
                userDocument.data();

            const displayName =
                userData.name ||
                user.email ||
                "Team Member";

            currentUserIsAdmin =
                userData.appRole === "admin";

            welcomeMessage.textContent =
                `Welcome, ${displayName} — ${user.email}`;
        } else {
            welcomeMessage.textContent =
                `Welcome — ${user.email}`;
        }
    } catch (error) {
        console.error(
            "Unable to load user profile:",
            error
        );

        welcomeMessage.textContent =
            `Welcome — ${user.email}`;
    }

    dashboardRoleBadge.hidden = !currentUserIsAdmin;
    adminToolsCard.hidden = !currentUserIsAdmin;
    teamsHeading.textContent = currentUserIsAdmin
        ? "All Teams"
        : "My Teams";
    teamsIntroduction.textContent = currentUserIsAdmin
        ? "Team Admin access lets you view every team in the organization."
        : "Create a team, join with an invite code, or open one of your teams.";

    loadTeams(user.uid, currentUserIsAdmin);
});

openExpenseSheetBtn.addEventListener("click", () => {
    if (!currentUserIsAdmin) {
        return;
    }

    window.location.href = "TopGun-Expenses.html";
});

openAppSettingsBtn.addEventListener("click", () => {
    window.location.href = "TopGun-Settings.html";
});

createTeamBtn.addEventListener(
    "click",
    async () => {
        const teamName =
            teamNameInput.value.trim();

        if (!currentUser) {
            showDashboardMessage(
                "Your session has expired. Please log in again."
            );

            return;
        }

        if (!teamName) {
            showDashboardMessage(
                "Please enter a team name."
            );

            teamNameInput.focus();
            return;
        }

        createTeamBtn.disabled = true;
        createTeamBtn.textContent =
            "Creating Team...";

        try {
            await addDoc(
                collection(db, "teams"),
                {
                    teamName,
                    createdBy: currentUser.uid,
                    members: [
                        currentUser.uid
                    ],
                    createdAt:
                        serverTimestamp(),
                    updatedAt:
                        serverTimestamp()
                }
            );

            teamNameInput.value = "";

            showDashboardMessage(
                `${teamName} was created successfully.`,
                "success"
            );
        } catch (error) {
            console.error(
                "Unable to create team:",
                error
            );

            showDashboardMessage(
                `${error.code || "Unknown error"}: ${error.message}`
            );
        } finally {
            createTeamBtn.disabled = false;
            createTeamBtn.textContent =
                "Create Team";
        }
    }
);

teamNameInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            createTeamBtn.click();
        }
    }
);

joinTeamBtn.addEventListener(
    "click",
    async () => {
        const inviteCode =
            teamInviteCodeInput.value
                .trim()
                .toUpperCase();

        if (!currentUser) {
            showDashboardMessage(
                "Your session has expired. Please log in again."
            );

            return;
        }

        if (!inviteCode) {
            showDashboardMessage(
                "Please enter a team invite code."
            );

            teamInviteCodeInput.focus();
            return;
        }

        joinTeamBtn.disabled = true;
        joinTeamBtn.textContent =
            "Joining Team...";

        try {
            const inviteReference = doc(
                db,
                "teamInvites",
                inviteCode
            );

            const inviteSnapshot =
                await getDoc(inviteReference);

            if (!inviteSnapshot.exists()) {
                throw new Error(
                    "That invite code does not exist."
                );
            }

            const inviteData =
                inviteSnapshot.data();

            if (inviteData.active !== true) {
                throw new Error(
                    "That invite code is no longer active."
                );
            }

            if (!inviteData.teamId) {
                throw new Error(
                    "This invite code is missing its team information."
                );
            }

            const teamReference = doc(
                db,
                "teams",
                inviteData.teamId
            );

            await updateDoc(teamReference, {
                members:
                    arrayUnion(currentUser.uid),

                updatedAt:
                    serverTimestamp()
            });

            teamInviteCodeInput.value = "";

            showDashboardMessage(
                `You joined ${
                    inviteData.teamName ||
                    "the team"
                } successfully.`,
                "success"
            );
        } catch (error) {
            console.error(
                "Unable to join team:",
                error
            );

            showDashboardMessage(
                error.message ||
                "Unable to join the team."
            );
        } finally {
            joinTeamBtn.disabled = false;
            joinTeamBtn.textContent =
                "Join Team";
        }
    }
);

teamInviteCodeInput.addEventListener(
    "keydown",
    (event) => {
        if (event.key === "Enter") {
            joinTeamBtn.click();
        }
    }
);

logoutBtn.addEventListener(
    "click",
    async () => {
        logoutBtn.disabled = true;
        logoutBtn.textContent =
            "Logging Out...";

        try {
            if (unsubscribeFromTeams) {
                unsubscribeFromTeams();
            }

            await signOut(auth);

            window.location.href =
                "TopGun-Login.html";
        } catch (error) {
            console.error(
                "Logout error:",
                error
            );

            showDashboardMessage(
                "Unable to log out. Please try again."
            );

            logoutBtn.disabled = false;
            logoutBtn.textContent =
                "Logout";
        }
    }
);
