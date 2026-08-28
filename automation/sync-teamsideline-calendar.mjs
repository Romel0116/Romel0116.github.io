import process from "node:process";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";

function credentials() {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) throw new Error("Missing FIREBASE_SERVICE_ACCOUNT GitHub secret.");
    try { return JSON.parse(raw); } catch { throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON."); }
}

initializeApp({ credential: cert(credentials()) });
const db = getFirestore();
const allowedHosts = new Set([
    "tmsdln.com", "www.tmsdln.com", "calendar.teamsideline.com",
    "teamsideline.com", "www.teamsideline.com"
]);

const normalized = (value) => String(value || "").trim().toLocaleLowerCase("en-US");
const unescapeIcal = (value = "") => value.replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\").trim();

function parseDate(value) {
    const match = String(value).match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z?)$/);
    if (!match) throw new Error(`Unsupported calendar date: ${value}`);
    const [, y, m, d, h, min, s, utc] = match;
    const date = new Date(`${y}-${m}-${d}T${h}:${min}:${s}${utc ? "Z" : "-05:00"}`);
    if (Number.isNaN(date.getTime())) throw new Error(`Invalid calendar date: ${value}`);
    return date;
}

function parseCalendar(text) {
    const unfolded = text.replace(/\r?\n[ \t]/g, "");
    const calendarName = unescapeIcal(
        unfolded.match(/^X-WR-CALNAME:(.*)$/mi)?.[1] || "TeamSideline calendar"
    );
    const events = (unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) || []).map((block) => {
        const fields = {};
        for (const line of block.split(/\r?\n/)) {
            const separator = line.indexOf(":");
            if (separator < 0) continue;
            fields[line.slice(0, separator).split(";")[0].toUpperCase()] = line.slice(separator + 1);
        }
        return {
            uid: unescapeIcal(fields.UID),
            summary: unescapeIcal(fields.SUMMARY),
            location: unescapeIcal(fields.LOCATION),
            description: unescapeIcal(fields.DESCRIPTION),
            startsAt: parseDate(fields.DTSTART)
        };
    });
    return { calendarName, events };
}

async function fetchCalendar(calendarUrl) {
    let url;
    try { url = new URL(calendarUrl); } catch { throw new Error("The saved TeamSideline calendar URL is invalid."); }
    if (!allowedHosts.has(url.hostname.toLowerCase())) {
        throw new Error("The saved URL is not a supported TeamSideline calendar link.");
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
        const response = await fetch(url, {
            redirect: "follow",
            headers: { Accept: "text/calendar, text/plain;q=0.9, */*;q=0.8" },
            signal: controller.signal
        });
        if (!response.ok) throw new Error(`TeamSideline calendar returned HTTP ${response.status}.`);
        const text = await response.text();
        if (!text.includes("BEGIN:VCALENDAR")) throw new Error("TeamSideline did not return a valid calendar.");
        return parseCalendar(text);
    } finally { clearTimeout(timeout); }
}

function matchup(summary, requestedName) {
    const teams = summary.split(/\s+vs\.?\s+/i).map((value) => value.trim());
    if (teams.length !== 2) return null;
    const index = teams.findIndex((team) => normalized(team) === normalized(requestedName));
    if (index < 0) return null;
    return {
        isHome: index === 0,
        teamName: teams[index],
        opponentName: teams[index === 0 ? 1 : 0],
        homeTeamName: teams[0],
        awayTeamName: teams[1]
    };
}

const eventId = (uid) => `teamsideline-${uid.replace(/[^a-zA-Z0-9._-]/g, "-").slice(0, 120)}`;

function payload(event, game, calendarName, ownerId) {
    return {
        type: "game", title: game.opponentName,
        startsAt: Timestamp.fromDate(event.startsAt), location: event.location.slice(0, 150),
        notes: [calendarName, game.isHome ? "Home game" : "Away game", event.description]
            .filter(Boolean).join("\n").slice(0, 1000),
        createdBy: ownerId, createdByName: "League Sync", source: "teamsideline",
        externalGameId: event.uid, externalTeamName: game.teamName,
        homeTeamName: game.homeTeamName, awayTeamName: game.awayTeamName,
        isHome: game.isHome, status: "Scheduled", result: "pending",
        leagueName: calendarName, lastSyncedAt: FieldValue.serverTimestamp()
    };
}

function comparable(data) {
    return {
        title: data.title || "", startsAt: data.startsAt?.toMillis?.() || 0,
        location: data.location || "", notes: data.notes || "",
        homeTeamName: data.homeTeamName || "", awayTeamName: data.awayTeamName || ""
    };
}

async function sync(teamRef, connectionRef, connection) {
    const team = await teamRef.get();
    if (!team.exists) throw new Error("The Top Gun team no longer exists.");
    const calendarUrl = connection.calendarUrl || connection.scheduleUrl;
    if (!calendarUrl) throw new Error("Save this team’s TeamSideline Subscribe calendar URL in Team Settings.");
    const calendar = await fetchCalendar(calendarUrl);
    const games = calendar.events.map((event) => ({
        event, game: matchup(event.summary, connection.requestedTeamName)
    })).filter((item) => item.game);
    if (!games.length) throw new Error(`No games for “${connection.requestedTeamName}” were found in this calendar.`);

    let added = 0;
    let updated = 0;
    for (const item of games) {
        const ref = teamRef.collection("scheduleEvents").doc(eventId(item.event.uid));
        const old = await ref.get();
        const data = payload(item.event, item.game, calendar.calendarName, team.data().createdBy);
        if (!old.exists) {
            await ref.set({ ...data, createdAt: FieldValue.serverTimestamp() });
            added += 1;
        } else if (JSON.stringify(comparable(old.data())) !== JSON.stringify(comparable(data))) {
            await ref.set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
            updated += 1;
        } else {
            await ref.set({ lastSyncedAt: FieldValue.serverTimestamp() }, { merge: true });
        }
    }

    const changes = added + updated;
    if (changes) {
        await teamRef.collection("notifications").add({
            feature: "schedule",
            title: connection.status === "active"
                ? `League schedule updated: ${changes} change${changes === 1 ? "" : "s"}`
                : `League schedule connected: ${games.length} games imported`,
            sourceId: `teamsideline-calendar-${teamRef.id}`,
            actorId: "league-sync", createdAt: FieldValue.serverTimestamp()
        });
    }
    await connectionRef.set({
        status: "active", calendarUrl, externalTeamName: connection.requestedTeamName,
        leagueName: calendar.calendarName, lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncMessage: `Sync complete: ${games.length} games checked, ${added} added, ${updated} updated.`
    }, { merge: true });
    console.log(`${teamRef.id}: ${games.length} checked, ${added} added, ${updated} updated.`);
}

async function main() {
    const teams = await db.collection("teams").get();
    let enabled = 0;
    let failures = 0;
    for (const team of teams.docs) {
        const ref = team.ref.collection("leagueConnection").doc("settings");
        const snapshot = await ref.get();
        if (!snapshot.exists || snapshot.data().enabled !== true) continue;
        enabled += 1;
        try { await sync(team.ref, ref, snapshot.data()); }
        catch (error) {
            failures += 1;
            console.error(`${team.id}: ${error.stack || error.message}`);
            await ref.set({
                status: "error", lastSyncAt: FieldValue.serverTimestamp(),
                lastSyncMessage: String(error.message || error).slice(0, 500)
            }, { merge: true });
        }
    }
    console.log(`Finished: ${enabled} enabled connection(s), ${failures} failure(s).`);
    if (failures) process.exitCode = 1;
}

await main();
