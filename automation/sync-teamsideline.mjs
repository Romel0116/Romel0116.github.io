import process from "node:process";
import { cert, initializeApp } from "firebase-admin/app";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { DateTime } from "luxon";

const API_BASE = "https://cms-api.teamsideline.com/api";
const LEAGUE_TIME_ZONE = "America/Chicago";
const TEAMSIDELINE_ORGANIZATION_ID = 222;

function loadServiceAccount() {
    const rawCredentials = process.env.FIREBASE_SERVICE_ACCOUNT;

    if (!rawCredentials) {
        throw new Error("Missing FIREBASE_SERVICE_ACCOUNT GitHub secret.");
    }

    try {
        return JSON.parse(rawCredentials);
    } catch {
        throw new Error("FIREBASE_SERVICE_ACCOUNT is not valid JSON.");
    }
}

initializeApp({
    credential: cert(loadServiceAccount())
});

const db = getFirestore();

async function fetchJson(path, parameters) {
    const url = new URL(`${API_BASE}${path}`);

    Object.entries(parameters).forEach(([key, value]) => {
        url.searchParams.set(key, String(value));
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
        const response = await fetch(url, {
            headers: {
                Accept: "application/json",
                "User-Agent": "Top-Gun-Soccer-App-League-Sync/1.0"
            },
            signal: controller.signal
        });

        if (!response.ok) {
            throw new Error(`TeamSideline returned HTTP ${response.status}.`);
        }

        return await response.json();
    } finally {
        clearTimeout(timeout);
    }
}

function normalizedName(value) {
    return String(value || "").trim().toLocaleLowerCase("en-US");
}

function gameDate(value) {
    const parsed = DateTime.fromISO(value, {
        zone: LEAGUE_TIME_ZONE
    });

    if (!parsed.isValid) {
        throw new Error(`Invalid TeamSideline game date: ${value}`);
    }

    return parsed.toJSDate();
}

function scheduleTypes(division) {
    const types = [];

    if (division.hasRegularSchedule) types.push(1);
    if (division.has2ndHalfSchedule) types.push(2);
    if (division.hasPlayoffSchedule) types.push(3);
    if (division.has2ndPlayoffSchedule) types.push(4);
    if (division.has3rdPlayoffSchedule) types.push(6);
    if (division.has4thPlayoffSchedule) types.push(7);

    return types.length > 0 ? types : [1];
}

function locationText(location) {
    if (!location) {
        return "";
    }

    const address = [
        location.streetAddress,
        location.city,
        location.state,
        location.zip
    ].filter(Boolean).join(", ");

    return [location.locationShortName, address]
        .filter(Boolean)
        .join(" — ")
        .slice(0, 150);
}

function resultForTeam(game, externalTeamId) {
    const item = game.scheduleItem;
    const status = item.dispositionDescription || "Scheduled";
    const isFinished = status === "Played" ||
        status.toLocaleLowerCase("en-US").includes("forfeit");

    if (!isFinished) {
        return "pending";
    }

    const teamScore = item.homeTeamId === externalTeamId
        ? item.result1Home
        : item.result1Away;
    const opponentScore = item.homeTeamId === externalTeamId
        ? item.result1Away
        : item.result1Home;

    if (teamScore > opponentScore) return "win";
    if (teamScore < opponentScore) return "loss";
    return "draw";
}

function gamePayload(game, connection, division, ownerId) {
    const item = game.scheduleItem;
    const externalTeamId = Number(connection.externalTeamId);
    const isHome = item.homeTeamId === externalTeamId;
    const opponentName = isHome ? item.awayTeamName : item.homeTeamName;
    const leagueLabel = division.leagueName || "TeamSideline league";
    const divisionLabel = division.divisionName || `Division ${connection.divisionId}`;

    return {
        type: "game",
        title: opponentName || "League Game",
        startsAt: Timestamp.fromDate(gameDate(item.itemDateTime)),
        location: locationText(item.location),
        notes: `${leagueLabel}\n${divisionLabel}\n${isHome ? "Home" : "Away"} game`.slice(0, 1000),
        createdBy: ownerId,
        createdByName: "League Sync",
        source: "teamsideline",
        externalGameId: String(item.id),
        organizationId: TEAMSIDELINE_ORGANIZATION_ID,
        divisionId: Number(connection.divisionId),
        externalTeamId,
        scheduleTypeId: Number(item.scheduleItemTypeId || 1),
        weekNumber: Number(game.weekNumber || item.weekNumber || 0),
        homeTeamId: Number(item.homeTeamId || 0),
        awayTeamId: Number(item.awayTeamId || 0),
        homeTeamName: item.homeTeamName || "",
        awayTeamName: item.awayTeamName || "",
        isHome,
        status: item.dispositionDescription || "Scheduled",
        homeScore: Number.isFinite(item.result1Home) ? item.result1Home : null,
        awayScore: Number.isFinite(item.result1Away) ? item.result1Away : null,
        result: resultForTeam(game, externalTeamId),
        leagueName: leagueLabel,
        divisionName: divisionLabel,
        lastSyncedAt: FieldValue.serverTimestamp()
    };
}

function materialValues(data) {
    return {
        title: data.title || "",
        startsAt: data.startsAt?.toMillis?.() || 0,
        location: data.location || "",
        notes: data.notes || "",
        status: data.status || "",
        homeScore: data.homeScore ?? null,
        awayScore: data.awayScore ?? null,
        result: data.result || "pending",
        homeTeamName: data.homeTeamName || "",
        awayTeamName: data.awayTeamName || ""
    };
}

function hasMaterialChange(existing, incoming) {
    return JSON.stringify(materialValues(existing)) !==
        JSON.stringify(materialValues(incoming));
}

async function resolveConnection(connectionReference, connection) {
    if (Number(connection.organizationId) !== TEAMSIDELINE_ORGANIZATION_ID) {
        throw new Error("Unsupported TeamSideline organization.");
    }

    const divisionId = Number(connection.divisionId);
    const divisions = await fetchJson("/v1/Schedules/Divisions", {
        externalUId: TEAMSIDELINE_ORGANIZATION_ID,
        divisionId
    });
    const division = Array.isArray(divisions) ? divisions[0] : null;

    if (!division || Number(division.divisionId) !== divisionId) {
        throw new Error("The TeamSideline division could not be found.");
    }

    const teams = await fetchJson("/v1/Teams", {
        externalUId: TEAMSIDELINE_ORGANIZATION_ID,
        divisionId,
        scheduleTypeId: 1,
        teamId: 0
    });
    const requestedName = normalizedName(connection.requestedTeamName);
    const matches = teams.filter((team) =>
        normalizedName(team.teamName) === requestedName ||
        normalizedName(team.longTeamName) === requestedName
    );

    if (matches.length === 0) {
        throw new Error(
            `No exact team match was found for “${connection.requestedTeamName}”.`
        );
    }

    if (matches.length > 1) {
        throw new Error("More than one league team has that name.");
    }

    const matchedTeam = matches[0];

    await connectionReference.set({
        externalTeamId: Number(matchedTeam.id),
        externalTeamName: matchedTeam.teamName,
        leagueName: division.leagueName || "",
        divisionName: division.divisionName || "",
        status: "active",
        lastSyncMessage: "Connection validated successfully.",
        lastValidatedAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return {
        ...connection,
        externalTeamId: Number(matchedTeam.id),
        externalTeamName: matchedTeam.teamName
    };
}

async function loadTeamGames(connection, division) {
    const responses = await Promise.all(
        scheduleTypes(division).map(async (scheduleTypeId) => {
            const games = await fetchJson("/v1/Schedules/Games", {
                externalUId: TEAMSIDELINE_ORGANIZATION_ID,
                divisionId: connection.divisionId,
                scheduleTypeId
            });

            return games.map((game) => ({
                ...game,
                requestedScheduleTypeId: scheduleTypeId
            }));
        })
    );

    const externalTeamId = Number(connection.externalTeamId);

    return responses.flat().filter((game) =>
        game.scheduleItem &&
        (
            Number(game.scheduleItem.homeTeamId) === externalTeamId ||
            Number(game.scheduleItem.awayTeamId) === externalTeamId
        )
    );
}

async function syncConnection(teamReference, connectionReference, connection) {
    const teamSnapshot = await teamReference.get();

    if (!teamSnapshot.exists) {
        throw new Error("The Top Gun team no longer exists.");
    }

    const teamData = teamSnapshot.data();
    const wasPending = !connection.externalTeamId || connection.status !== "active";
    const resolvedConnection = wasPending
        ? await resolveConnection(connectionReference, connection)
        : connection;

    const divisions = await fetchJson("/v1/Schedules/Divisions", {
        externalUId: TEAMSIDELINE_ORGANIZATION_ID,
        divisionId: resolvedConnection.divisionId
    });
    const division = Array.isArray(divisions) ? divisions[0] : null;

    if (!division) {
        throw new Error("The connected division is no longer available.");
    }

    const games = await loadTeamGames(resolvedConnection, division);
    let createdCount = 0;
    let updatedCount = 0;

    for (const game of games) {
        const eventId = `teamsideline-${game.scheduleItem.id}`;
        const eventReference = teamReference.collection("scheduleEvents").doc(eventId);
        const eventSnapshot = await eventReference.get();
        const payload = gamePayload(
            game,
            resolvedConnection,
            division,
            teamData.createdBy
        );

        if (!eventSnapshot.exists) {
            await eventReference.set({
                ...payload,
                createdAt: FieldValue.serverTimestamp()
            });
            createdCount += 1;
        } else if (hasMaterialChange(eventSnapshot.data(), payload)) {
            await eventReference.set({
                ...payload,
                updatedAt: FieldValue.serverTimestamp()
            }, { merge: true });
            updatedCount += 1;
        } else {
            await eventReference.set({
                lastSyncedAt: FieldValue.serverTimestamp()
            }, { merge: true });
        }
    }

    const changeCount = createdCount + updatedCount;

    if (changeCount > 0) {
        const notificationTitle = wasPending
            ? `League schedule connected: ${games.length} games imported`
            : `League schedule updated: ${changeCount} change${changeCount === 1 ? "" : "s"}`;

        await teamReference.collection("notifications").add({
            feature: "schedule",
            title: notificationTitle,
            sourceId: `teamsideline-${resolvedConnection.divisionId}`,
            actorId: "league-sync",
            createdAt: FieldValue.serverTimestamp()
        });
    }

    await connectionReference.set({
        status: "active",
        externalTeamId: Number(resolvedConnection.externalTeamId),
        externalTeamName: resolvedConnection.externalTeamName,
        leagueName: division.leagueName || "",
        divisionName: division.divisionName || "",
        scheduleRevisionDate: division.scheduleRevisionDate || null,
        playoffScheduleRevisionDate: division.playoffScheduleRevisionDate || null,
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncMessage:
            `Sync complete: ${games.length} games checked, ` +
            `${createdCount} added, ${updatedCount} updated.`
    }, { merge: true });

    console.log(
        `${teamReference.id}: ${games.length} checked, ` +
        `${createdCount} added, ${updatedCount} updated.`
    );
}

async function markConnectionError(connectionReference, error) {
    await connectionReference.set({
        status: "error",
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncMessage: String(error.message || error).slice(0, 500)
    }, { merge: true });
}

async function main() {
    const teamsSnapshot = await db.collection("teams").get();
    let enabledConnections = 0;
    let failedConnections = 0;

    for (const teamDocument of teamsSnapshot.docs) {
        const connectionReference = teamDocument.ref
            .collection("leagueConnection")
            .doc("settings");
        const connectionSnapshot = await connectionReference.get();

        if (!connectionSnapshot.exists || connectionSnapshot.data().enabled !== true) {
            continue;
        }

        enabledConnections += 1;

        try {
            await syncConnection(
                teamDocument.ref,
                connectionReference,
                connectionSnapshot.data()
            );
        } catch (error) {
            failedConnections += 1;
            console.error(`${teamDocument.id}: ${error.stack || error.message}`);
            await markConnectionError(connectionReference, error);
        }
    }

    console.log(
        `Finished: ${enabledConnections} enabled connection(s), ` +
        `${failedConnections} failure(s).`
    );

    if (failedConnections > 0) {
        process.exitCode = 1;
    }
}

await main();
