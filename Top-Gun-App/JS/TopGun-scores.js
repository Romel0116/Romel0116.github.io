import { auth, db } from "./TopGun-firebase.js";
import { standingsSnapshot, recreation2Snapshot } from "./TopGun-standings-snapshot.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js";

const element = id => document.getElementById(id);
const teamId = new URLSearchParams(location.search).get("teamId");
const normalize = value => value?.trim().toLowerCase();
const gameDate = new Intl.DateTimeFormat(undefined, {
    month: "short", day: "numeric", year: "numeric", timeZone: "UTC"
});
let leagueTeam = "";
let finalGames = [];

function populateTeamFilter() {
    const teams = new Map();
    for (const game of finalGames) {
        for (const name of [game.home, game.away]) {
            const normalized = normalize(name);
            if (normalized && normalized !== leagueTeam) teams.set(normalized, name.trim());
        }
    }

    const filter = element("scoresFilter");
    filter.length = 2;
    for (const [normalized, name] of [...teams].sort((a, b) => a[1].localeCompare(b[1]))) {
        const option = document.createElement("option");
        option.value = "club:" + normalized;
        option.textContent = name;
        filter.append(option);
    }
}

function renderScores() {
    const list = element("scoresList");
    list.replaceChildren();
    const count = element("scoresCount");
    const teamFilter = element("scoresFilter").value;
    const selectedTeam = teamFilter === "team" ? leagueTeam : teamFilter.slice("club:".length);
    const stage = element("scoresStage").value;
    const from = element("scoresFrom").value;
    const through = element("scoresThrough").value;
    const oldestFirst = element("scoresSort").value === "oldest";
    const includesTeam = (game, team) => [game.home, game.away].some(name => normalize(name) === team);

    if (from && through && from > through) {
        count.textContent = "Choose an end date on or after the start date.";
        return;
    }

    const games = finalGames.filter(game => {
        const gameStage = /\bplay[\s-]?offs?\b/i.test(game.round) ? "playoffs" : "regular";
        return (teamFilter === "division" || includesTeam(game, selectedTeam)) &&
            (stage === "all" || stage === gameStage) &&
            (!from || game.date >= from) && (!through || game.date <= through);
    }).sort((a, b) => oldestFirst ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date));

    if (!games.length) {
        count.textContent = finalGames.length
            ? "No final scores match these filters."
            : "No final scores have been posted yet.";
        return;
    }

    count.textContent = games.length + (games.length === 1 ? " game" : " games");
    for (const game of games) {
        const card = document.createElement("article");
        card.className = "playoff-match score-match";
        if (includesTeam(game, leagueTeam)) card.classList.add("playoff-own-team");

        const date = document.createElement("span");
        date.textContent = `${game.round} · ${gameDate.format(new Date(game.date))}`;
        const score = document.createElement("strong");
        score.textContent = `${game.home} ${game.homeScore} – ${game.awayScore} ${game.away}`;
        card.append(date, score);
        list.append(card);
    }
}

const filters = element("scoresFilters");
filters.addEventListener("submit", event => event.preventDefault());
filters.addEventListener("change", renderScores);
function resetFilters() {
    filters.reset();
    renderScores();
}
element("scoresReset").addEventListener("click", resetFilters);
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
        const scoreSnapshot = [standingsSnapshot, recreation2Snapshot].find(entry =>
            entry.sourceUrl === connection?.sourceUrl);
        if (!scoreSnapshot || !normalize(connection?.teamName)) {
            element("scoresStatus").textContent = "No scores are available for this team's league connection.";
            return;
        }

        leagueTeam = normalize(connection.teamName);
        finalGames = (scoreSnapshot.scores?.games || []).filter(game =>
            Number.isInteger(game.homeScore) && game.homeScore >= 0 &&
            Number.isInteger(game.awayScore) && game.awayScore >= 0);
        populateTeamFilter();
        resetFilters();
        element("scoresSource").href = scoreSnapshot.sourceUrl;
        const capture = scoreSnapshot.scores?.capturedAt;
        element("scoresUpdated").textContent = capture ? `Scores checked ${new Date(capture).toLocaleDateString()}` : "";
        element("scoresStatus").textContent = "Final results posted by TeamSideline.";
        element("scoresContent").hidden = false;
    } catch (error) {
        console.error("Unable to load scores:", error);
        element("scoresStatus").textContent = error.code ? "Unable to load league scores." : error.message;
    }
});
