import { auth, db } from "./TopGun-firebase.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const element = id => document.getElementById(id);
const teamId = new URLSearchParams(location.search).get("teamId");
const listeners = [];
let connection = null;
let current = null;

function render() {
    const body = element("standingsRows");
    body.replaceChildren();
    const matchesConnection = current && connection && current.sourceUrl === connection.sourceUrl && current.teamName === connection.teamName;
    const rows = matchesConnection && Array.isArray(current.rows) ? current.rows : [];
    element("standingsStatus").textContent = connection?.status === "error"
        ? `Update failed. ${connection.message || "Please try again later."} Previous standings are kept when available.`
        : connection?.enabled === false ? "Automatic updates are paused."
        : connection?.status === "pending" ? "Waiting for the first update for this connection."
        : "Official standings from TeamSideline.";
    element("standingsEmpty").textContent = rows.length ? "" : "No standings imported yet. The team owner can connect the division page in Team Settings.";
    element("standingsUpdated").textContent = rows.length && current.updatedAt?.toDate ? `Last successful update: ${current.updatedAt.toDate().toLocaleString()}` : "";
    const own = rows.find(row => row.teamName.toLowerCase() === current.teamName.toLowerCase());
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
        const failure = error => { element("standingsStatus").textContent = `Unable to load standings: ${error.message}`; };
        listeners.push(onSnapshot(doc(db, "teams", teamId, "standingsConnection", "settings"), snapshot => { connection = snapshot.data() || null; render(); }, failure));
        listeners.push(onSnapshot(doc(db, "teams", teamId, "standings", "current"), snapshot => { current = snapshot.data() || null; render(); }, failure));
    } catch (error) { element("standingsTeam").textContent = "Standings unavailable"; element("standingsStatus").textContent = error.message; }
});
element("standingsLogout").addEventListener("click", async () => {
    try { await signOut(auth); } catch { element("standingsStatus").textContent = "Unable to log out. Please try again."; }
});
window.addEventListener("beforeunload", () => listeners.forEach(stop => stop()));
