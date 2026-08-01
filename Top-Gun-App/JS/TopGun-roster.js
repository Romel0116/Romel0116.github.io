import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    getDoc,
    setDoc,
    updateDoc,
    serverTimestamp,
    writeBatch
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const rosterTeamName =
    document.getElementById("rosterTeamName");

const rosterMemberCount =
    document.getElementById("rosterMemberCount");

const rosterList =
    document.getElementById("rosterList");

const rosterOwnerControls =
    document.getElementById("rosterOwnerControls");

const invitePlayerBtn =
    document.getElementById("invitePlayerBtn");

const inviteCodeSection =
    document.getElementById("inviteCodeSection");

const inviteCodeDisplay =
    document.getElementById("inviteCodeDisplay");

const copyInviteCodeBtn =
    document.getElementById("copyInviteCodeBtn");

const backToTeamLink =
    document.getElementById("backToTeamLink");

const rosterLogoutBtn =
    document.getElementById("rosterLogoutBtn");

const rosterMessage =
    document.getElementById("rosterMessage");

const urlParameters =
    new URLSearchParams(window.location.search);

const teamId =
    urlParameters.get("teamId");

let currentUser = null;
let currentTeam = null;

function showRosterMessage(text, type = "error") {
    rosterMessage.textContent = text;

    rosterMessage.style.color =
        type === "success" ? "#0c6e3d" : "#b42318";
}

function showRosterError(message) {
    rosterTeamName.textContent = "Roster unavailable";
    rosterMemberCount.textContent = "";
    rosterList.innerHTML = `<p>${message}</p>`;
}

function displayInviteCode(inviteCode) {
    inviteCodeDisplay.textContent = inviteCode;
    inviteCodeSection.hidden = false;
    invitePlayerBtn.textContent = "Generate New Code";
}

function generateInviteCode() {
    const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code = "TG-";

    for (let index = 0; index < 6; index += 1) {
        const randomIndex =
            Math.floor(Math.random() * characters.length);

        code += characters[randomIndex];
    }

    return code;
}

async function createUniqueInviteCode() {
    const maximumAttempts = 5;

    for (
        let attempt = 0;
        attempt < maximumAttempts;
        attempt += 1
    ) {
        const candidateCode = generateInviteCode();

        const inviteSnapshot = await getDoc(
            doc(db, "teamInvites", candidateCode)
        );

        if (!inviteSnapshot.exists()) {
            return candidateCode;
        }
    }

    throw new Error(
        "Unable to create a unique invite code. Please try again."
    );
}

function createMemberCard(memberData, memberId, ownerId) {
    const memberCard =
        document.createElement("article");

    memberCard.classList.add("roster-member-card");

    const memberInitial =
        document.createElement("div");

    memberInitial.classList.add("member-avatar");

    const displayName =
        memberData.name ||
        memberData.email ||
        "Team member";

    memberInitial.textContent =
        displayName.charAt(0).toUpperCase();

    const memberInformation =
        document.createElement("div");

    memberInformation.classList.add("member-information");

    const memberName =
        document.createElement("h3");

    memberName.textContent = displayName;

    const memberRole =
        document.createElement("p");

    memberRole.textContent =
        memberId === ownerId
            ? "Team owner"
            : "Team member";

    memberInformation.append(
        memberName,
        memberRole
    );

    memberCard.append(
        memberInitial,
        memberInformation
    );

    return memberCard;
}

async function loadMemberProfile(memberId, ownerId) {
    try {
        const profileSnapshot = await getDoc(
            doc(db, "users", memberId)
        );

        if (!profileSnapshot.exists()) {
            return createMemberCard(
                { name: "Team member" },
                memberId,
                ownerId
            );
        }

        return createMemberCard(
            profileSnapshot.data(),
            memberId,
            ownerId
        );
    } catch (error) {
        console.error(
            `Unable to load member ${memberId}:`,
            error
        );

        return createMemberCard(
            {
                name:
                    memberId === currentUser.uid
                        ? currentUser.email
                        : "Team member"
            },
            memberId,
            ownerId
        );
    }
}

async function displayRoster(teamData) {
    const members =
        Array.isArray(teamData.members)
            ? teamData.members
            : [];

    rosterTeamName.textContent =
        teamData.teamName;

    rosterMemberCount.textContent =
        `${members.length} member${members.length === 1 ? "" : "s"}`;

    rosterList.innerHTML = "";

    if (members.length === 0) {
        rosterList.innerHTML =
            "<p>This team does not have any members.</p>";

        return;
    }

    for (const memberId of members) {
        const memberCard =
            await loadMemberProfile(
                memberId,
                teamData.createdBy
            );

        rosterList.appendChild(memberCard);
    }
}

async function loadRoster(user) {
    if (!teamId) {
        showRosterError(
            "No team was selected. Return to the dashboard."
        );

        return;
    }

    backToTeamLink.href =
        `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;

    try {
        const teamSnapshot = await getDoc(
            doc(db, "teams", teamId)
        );

        if (!teamSnapshot.exists()) {
            showRosterError("This team could not be found.");
            return;
        }

        const teamData = teamSnapshot.data();

        const members =
            Array.isArray(teamData.members)
                ? teamData.members
                : [];

        if (!members.includes(user.uid)) {
            showRosterError(
                "You do not have permission to view this roster."
            );

            return;
        }

        currentTeam = teamData;

        if (teamData.createdBy === user.uid) {
            rosterOwnerControls.hidden = false;

            if (teamData.inviteCode) {
                displayInviteCode(teamData.inviteCode);
            }
        }

        await displayRoster(teamData);
    } catch (error) {
        console.error("Unable to load roster:", error);

        showRosterError(
            "The roster could not be loaded."
        );

        showRosterMessage(
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

    await loadRoster(user);
});

invitePlayerBtn.addEventListener("click", async () => {
    if (!currentUser || !currentTeam || !teamId) {
        showRosterMessage(
            "The team information is not available."
        );

        return;
    }

    if (currentTeam.createdBy !== currentUser.uid) {
        showRosterMessage(
            "Only the team owner can generate invite codes."
        );

        return;
    }

    invitePlayerBtn.disabled = true;
    invitePlayerBtn.textContent = "Generating Code...";

    try {
        const inviteCode =
            await createUniqueInviteCode();

        const batch = writeBatch(db);

        const teamReference =
            doc(db, "teams", teamId);

        const inviteReference =
            doc(db, "teamInvites", inviteCode);

        batch.update(teamReference, {
            inviteCode,
            updatedAt: serverTimestamp()
        });

        batch.set(inviteReference, {
            teamId,
            teamName: currentTeam.teamName,
            createdBy: currentUser.uid,
            active: true,
            createdAt: serverTimestamp()
        });

        /*
         * Disable the previous code after the new code
         * has been prepared.
         */
        if (
            currentTeam.inviteCode &&
            currentTeam.inviteCode !== inviteCode
        ) {
            const previousInviteReference =
                doc(
                    db,
                    "teamInvites",
                    currentTeam.inviteCode
                );

            batch.set(
                previousInviteReference,
                {
                    active: false,
                    replacedAt: serverTimestamp()
                },
                { merge: true }
            );
        }

        await batch.commit();

        currentTeam.inviteCode = inviteCode;

        displayInviteCode(inviteCode);

        showRosterMessage(
            "Invite code created successfully.",
            "success"
        );
    } catch (error) {
        console.error(
            "Unable to generate invite code:",
            error
        );

        showRosterMessage(
            `${error.code || "Unknown error"}: ${error.message}`
        );

        invitePlayerBtn.textContent =
            currentTeam?.inviteCode
                ? "Generate New Code"
                : "Generate Invite Code";
    } finally {
        invitePlayerBtn.disabled = false;
    }
});

copyInviteCodeBtn.addEventListener("click", async () => {
    const inviteCode =
        inviteCodeDisplay.textContent.trim();

    if (!inviteCode) {
        return;
    }

    try {
        await navigator.clipboard.writeText(inviteCode);

        showRosterMessage(
            "Invite code copied.",
            "success"
        );
    } catch (error) {
        console.error(
            "Unable to copy invite code:",
            error
        );

        showRosterMessage(
            `Copy this code manually: ${inviteCode}`,
            "success"
        );
    }
});

rosterLogoutBtn.addEventListener("click", async () => {
    rosterLogoutBtn.disabled = true;
    rosterLogoutBtn.textContent = "Logging Out...";

    try {
        await signOut(auth);

        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);

        showRosterMessage(
            "Unable to log out. Please try again."
        );

        rosterLogoutBtn.disabled = false;
        rosterLogoutBtn.textContent = "Logout";
    }
});