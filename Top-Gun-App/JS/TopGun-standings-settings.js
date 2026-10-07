import { auth, db } from "./TopGun-firebase.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";
const teamId = new URLSearchParams(location.search).get("teamId");
const el = id => document.getElementById(id);
let reference = null;
let stop = null;
let owner = null;

onAuthStateChanged(auth, async user => {
    stop?.(); reference = null; owner = null; el("standingsSettings").hidden = true;
    if (!user || !teamId) return;
    try {
        const team = await getDoc(doc(db, "teams", teamId));
        if (team.data()?.createdBy !== user.uid) return;
        owner = user;
        reference = doc(db, "teams", teamId, "standingsConnection", "settings");
        el("standingsSettings").hidden = false;
        stop = onSnapshot(reference, snapshot => {
            const data = snapshot.data();
            if (data) {
                el("standingsUrl").value = data.sourceUrl || "";
                el("standingsLeagueTeam").value = data.teamName || "";
                el("standingsEnabled").checked = data.enabled !== false;
            }
            el("standingsSettingsStatus").textContent = data ? `${data.status || "pending"}: ${data.message || "Waiting for weekly import."}` : "No standings connection saved.";
        }, error => { el("standingsSettingsStatus").textContent = error.message; });
    } catch (error) { el("standingsSettingsStatus").textContent = error.message; }
});

el("standingsForm").addEventListener("submit", async event => {
    event.preventDefault();
    if (!reference || auth.currentUser?.uid !== owner?.uid) return;
    const button = el("saveStandings");
    try {
        const url = new URL(el("standingsUrl").value.trim());
        if (url.protocol !== "https:" || url.hostname !== "thewoodlandstownship.teamsidelinesite.com" || url.pathname !== "/schedule" || !/^\d+$/.test(url.searchParams.get("divisionid") || "") || url.port || url.username || url.password) throw new Error("Use the full public Woodlands division schedule URL, rather than the QR short link.");
        const teamName = el("standingsLeagueTeam").value.trim();
        if (!teamName) throw new Error("Enter the league team name.");
        button.disabled = true;
        await setDoc(reference, { sourceUrl: url.href, teamName, enabled: el("standingsEnabled").checked, status: "pending", message: "Waiting for the next standings import.", updatedAt: serverTimestamp(), updatedBy: owner.uid });
        el("standingsSettingsStatus").textContent = "Connection saved. The next weekly import will validate it.";
    } catch (error) { el("standingsSettingsStatus").textContent = error.message; }
    finally { button.disabled = false; }
});
window.addEventListener("beforeunload", () => stop?.());
