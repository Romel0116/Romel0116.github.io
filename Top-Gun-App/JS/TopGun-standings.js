import { auth, db } from "./TopGun-firebase.js";
import { standingsSnapshot } from "./TopGun-standings-snapshot.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const element = id => document.getElementById(id);
const teamId = new URLSearchParams(location.search).get("teamId");
const listeners = [];
let connection = null;
let current = null;
let loadError = "";
let connectionLoaded = false;
let standingsLoaded = false;

function render() {
    const body = element("standingsRows");
    body.replaceChildren();
    const matchesConnection = current && connection && current.sourceUrl === connection.sourceUrl && current.teamName === connection.teamName;
    const importedRows = matchesConnection && Array.isArray(current.rows) ? current.rows : [];
    const useSnapshot = !importedRows.length && connection?.sourceUrl === standingsSnapshot.sourceUrl
        && connection?.teamName?.trim().toLowerCase() === standingsSnapshot.teamName.toLowerCase();
    const data = useSnapshot ? standingsSnapshot : current;
    const rows = useSnapshot ? standingsSnapshot.rows : importedRows;
    element("standingsTable").hidden = !rows.length || Boolean(loadError);
    element("standingsLegend").hidden = !rows.length || Boolean(loadError);
    if (loadError || !connectionLoaded || !standingsLoaded) {
        element("standingsStatus").textContent = loadError || "Loading league standings...";
        element("standingsEmpty").textContent = loadError
            ? "Standings are unavailable until the data access issue is resolved."
            : "Loading league standings...";
        element("standingsSummary").textContent = "";
        element("standingsUpdated").textContent = "";
        element("standingsSource").hidden = true;
        return;
    }
    element("standingsStatus").textContent = useSnapshot
        ? "Showing a saved snapshot of the official table. Automatic imports have not succeeded yet."
        : connection?.status === "error"
        ? `Update failed. ${connection.message || "Please try again later."} Previous standings are kept when available.`
        : connection?.enabled === false ? "Automatic updates are paused."
        : connection?.status === "pending" ? "Waiting for the first update for this connection."
        : "Official standings from TeamSideline.";
    element("standingsEmpty").textContent = rows.length ? "" : "No standings imported yet. The team owner can connect the division page in Team Settings.";
    element("standingsUpdated").textContent = useSnapshot
        ? `Snapshot captured: ${new Date(data.capturedAt).toLocaleString()}. Check the official page for newer results.`
        : rows.length && data.updatedAt?.toDate ? `Last successful update: ${data.updatedAt.toDate().toLocaleString()}` : "";
    const own = rows.find(row => row.teamName.toLowerCase() === data.teamName.toLowerCase());
    element("standingsSummary").textContent = own ? `${own.teamName} · Place ${own.place} · ${own.wins} W / ${own.losses} L / ${own.ties} T · ${own.points} points` : "";
    const source = element("standingsSource");
    source.hidden = true;
    try {
        const url = new URL(connection?.sourceUrl);
        if (url.protocol === "https:" && url.hostname === "thewoodlandstownship.teamsidelinesite.com") { source.href = url.href; source.hidden = false; }
    } catch { /* No connection yet. */ }
    for (const row of rows) {
        const tr = document.createElement("tr");
        if (row === own) tr.className = "standings-own-team";
        for (const key of ["place", "teamName", "played", "wins", "losses", "ties", "goalsFor", "goalsAgainst", "goalDifference", "points", "streak"]) {
            const cell = document.createElement("td");
            cell.textContent = row[key] ?? "—";
            tr.append(cell);
        }
        body.append(tr);
    }
}

onAuthStateChanged(auth, async user => {
    listeners.splice(0).forEach(stop => stop());
    connection = null; current = null; loadError = "";
    connectionLoaded = false; standingsLoaded = false;
    element("standingsContent").hidden = true;
    if (!user) { location.href = "TopGun-Login.html"; return; }
    try {
        if (!teamId) throw new Error("No team was selected.");
        const [team, profile] = await Promise.all([getDoc(doc(db, "teams", teamId)), getDoc(doc(db, "users", user.uid))]);
        if (!team.exists()) throw new Error("This team could not be found.");
        const data = team.data();
        if (!(data.members || []).includes(user.uid) && profile.data()?.appRole !== "admin") throw new Error("You do not have permission to view these standings.");
        element("standingsTeam").textContent = data.teamName || "Team Standings";
        element("standingsBack").href = `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;
        element("standingsContent").hidden = false;
        render();
        const failure = error => {
            loadError = error.code === "permission-denied"
                ? "Standings access is blocked by Firebase permissions. The standings database rules need to be updated."
                : `Unable to load standings: ${error.message}`;
            render();
        };
        listeners.push(onSnapshot(doc(db, "teams", teamId, "standingsConnection", "settings"), snapshot => { connection = snapshot.data() || null; connectionLoaded = true; render(); }, failure));
        listeners.push(onSnapshot(doc(db, "teams", teamId, "standings", "current"), snapshot => { current = snapshot.data() || null; standingsLoaded = true; render(); }, failure));
    } catch (error) { element("standingsTeam").textContent = "Standings unavailable"; element("standingsStatus").textContent = error.message; }
});
element("standingsLogout").addEventListener("click", async () => {
    try { await signOut(auth); } catch { element("standingsStatus").textContent = "Unable to log out. Please try again."; }
});
window.addEventListener("beforeunload", () => listeners.forEach(stop => stop()));
