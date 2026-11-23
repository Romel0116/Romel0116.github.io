import { auth, db } from "./TopGun-firebase.js";
import { standingsSnapshot } from "./TopGun-standings-snapshot.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const element = id => document.getElementById(id);
const teamId = new URLSearchParams(location.search).get("teamId");
const normalize = value => value?.trim().toLowerCase();
const gameDate = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
});
let leagueTeam = "";

function renderScores() {
    const list = element("scoresList");
    list.replaceChildren();
    const isTeamGame = game => [game.home, game.away].some(name => normalize(name) === leagueTeam);
    const games = (standingsSnapshot.scores?.games || [])
        .filter(game => Number.isInteger(game.homeScore) && game.homeScore >= 0 &&
            Number.isInteger(game.awayScore) && game.awayScore >= 0 &&
            (element("scoresFilter").value === "division" || isTeamGame(game)))
        .sort((a, b) => b.date.localeCompare(a.date));

    if (!games.length) {
        list.textContent = "No final scores have been posted for this view.";
        return;
    }

    for (const game of games) {
        const card = document.createElement("article");
        card.className = "playoff-match score-match";
        if (isTeamGame(game)) card.classList.add("playoff-own-team");

        const date = document.createElement("span");
        date.textContent = `${game.round} · ${gameDate.format(new Date(game.date))}`;
        const score = document.createElement("strong");
        score.textContent = `${game.home} ${game.homeScore} – ${game.awayScore} ${game.away}`;
        card.append(date, score);
        list.append(card);
    }
}

element("scoresFilter").addEventListener("change", renderScores);
onAuthStateChanged(auth, async user => {
    element("scoresContent").hidden = true;
    if (!user) {
        location.href = "TopGun-Login.html";
        return;
    }

    try {
        if (!teamId) throw new Error("No team was selected.");
        const [team, profile] = await Promise.all([
            getDoc(doc(db, "teams", teamId)),
            getDoc(doc(db, "users", user.uid))
        ]);
        const teamData = team.data();
        if (!teamData) throw new Error("This team could not be found.");
        if (!teamData.members?.includes(user.uid) && profile.data()?.appRole !== "admin") {
            throw new Error("You do not have permission to view this team's scores.");
        }

        element("scoresTeam").textContent = teamData.teamName || "Team Scores";
        element("scoresBack").href = `TopGun-Team.html?teamId=${encodeURIComponent(teamId)}`;
        const settings = await getDoc(doc(db, "teams", teamId, "standingsConnection", "settings"));
        const connection = settings.data();
        if (connection?.sourceUrl !== standingsSnapshot.sourceUrl || !normalize(connection?.teamName)) {
            element("scoresStatus").textContent = "No scores are available for this team's league connection.";
            return;
        }

        leagueTeam = normalize(connection.teamName);
        element("scoresSource").href = standingsSnapshot.sourceUrl;
        const capture = standingsSnapshot.scores?.capturedAt;
        element("scoresUpdated").textContent = capture ? `Scores checked ${new Date(capture).toLocaleDateString()}` : "";
        renderScores();
        element("scoresStatus").textContent = "Final results posted by TeamSideline.";
        element("scoresContent").hidden = false;
    } catch (error) {
        console.error("Unable to load scores:", error);
        element("scoresStatus").textContent = error.code ? "Unable to load league scores." : error.message;
    }
});
