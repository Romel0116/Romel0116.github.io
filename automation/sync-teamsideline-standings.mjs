import { chromium } from "playwright";
import { readStandings } from "./standings-source.mjs";

const browser = await chromium.launch({ headless: true });
try {
    if (process.argv.includes("--probe")) {
        console.log(JSON.stringify(await readStandings(browser, process.argv.at(-1)), null, 2));
    } else {
        const { cert, initializeApp } = await import("firebase-admin/app");
        const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
        initializeApp({ credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || "null")) });
        const db = getFirestore();
        const teams = await db.collection("teams").get();
        for (const team of teams.docs) {
            const ref = team.ref.collection("standingsConnection").doc("settings");
            const snapshot = await ref.get();
            const connection = snapshot.data();
            if (!connection?.enabled) continue;
            try {
                const data = await readStandings(browser, connection.sourceUrl);
                if (!data.rows.some(row => row.teamName.toLowerCase() === connection.teamName.trim().toLowerCase())) throw new Error("The saved league team name was not found in the standings.");
                const batch = db.batch();
                batch.set(team.ref.collection("standings").doc("current"), { ...data, teamName: connection.teamName, updatedAt: FieldValue.serverTimestamp() });
                batch.set(ref, { status: "active", message: "Standings updated.", lastAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
                await batch.commit();
                console.log(`${team.id}: imported ${data.rows.length} standings rows.`);
            } catch (error) {
                await ref.set({ status: "error", message: String(error.message).slice(0, 500), lastAttemptAt: FieldValue.serverTimestamp() }, { merge: true });
                console.error(`${team.id}: ${error.message}`);
                process.exitCode = 1;
            }
        }
    }
} finally { await browser.close(); }
