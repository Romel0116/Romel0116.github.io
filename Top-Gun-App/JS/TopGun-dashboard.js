import { auth, db } from "./TopGun-firebase.js";

import {
    onAuthStateChanged,
    signOut
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";

import {
    doc,
    getDoc
} from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const welcomeMessage = document.getElementById("welcomeMessage");
const logoutBtn = document.getElementById("logoutBtn");
const createTeamBtn = document.getElementById("createTeamBtn");
const dashboardMessage = document.getElementById("dashboardMessage");

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "TopGun-Index.html";
        return;
    }

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
    } catch (error) {
        console.error("Unable to load user profile:", error);

        welcomeMessage.textContent =
            `Welcome — ${user.email}`;
    }
});

logoutBtn.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = "Logging Out...";

    try {
        await signOut(auth);

        window.location.href = "TopGun-Index.html";
    } catch (error) {
        console.error("Logout error:", error);

        dashboardMessage.style.color = "red";
        dashboardMessage.textContent =
            "Unable to log out. Please try again.";

        logoutBtn.disabled = false;
        logoutBtn.textContent = "Logout";
    }
});

createTeamBtn.addEventListener("click", () => {
    dashboardMessage.style.color = "#0c6e3d";
    dashboardMessage.textContent =
        "The Create Team feature will be added next.";
});