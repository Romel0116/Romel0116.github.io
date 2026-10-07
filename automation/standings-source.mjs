export function validateStandingsUrl(value) {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.hostname !== "thewoodlandstownship.teamsidelinesite.com" ||
        url.pathname !== "/schedule" || !/^\d+$/.test(url.searchParams.get("divisionid") || "") ||
        url.username || url.password || url.port) {
        throw new Error("Use the public Woodlands TeamSideline division schedule URL.");
    }
    return url.href;
}

export function parseStandings(headers, rows) {
    const required = ["Place", "Team", "W", "L", "T", "GP", "GD", "GA", "GF", "PTS"];
    if (required.some(key => !headers.includes(key)) || !rows.length) throw new Error("No complete standings table found.");
    const fields = { Place: "place", W: "wins", L: "losses", T: "ties", GP: "played", GD: "goalDifference", GA: "goalsAgainst", GF: "goalsFor", PTS: "points" };
    return rows.map(cells => {
        const row = { teamName: cells[headers.indexOf("Team")]?.trim(), streak: cells[headers.indexOf("Streak")] || "" };
        if (!row.teamName) throw new Error("Missing league team name.");
        for (const [label, field] of Object.entries(fields)) {
            const text = cells[headers.indexOf(label)]?.trim();
            if (!/^-?\d+$/.test(text || "")) throw new Error(`Invalid ${label} for ${row.teamName}.`);
            row[field] = Number(text);
            if (field !== "goalDifference" && row[field] < 0) throw new Error(`Negative ${label}.`);
        }
        return row;
    });
}

export async function readStandings(browser, value) {
    const url = validateStandingsUrl(value);
    const page = await browser.newPage();
    let widgetBlocked = false;
    page.on("response", response => {
        if (response.url().startsWith("https://teamsideline.com/widgets/") &&
            (response.status() === 403 || response.headers()["cf-mitigated"] === "challenge")) {
            widgetBlocked = true;
        }
    });
    try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
        // Bring the embedded widget into view before waiting for its table.
        await page.mouse.move(200, 200);
        await page.getByRole("heading", { name: "Standings", exact: true }).first().scrollIntoViewIfNeeded();
        const table = page.locator("table").filter({ hasText: "PTS" }).first();
        await table.locator("tbody tr").first().waitFor({ timeout: 60000 });
        const headers = (await table.locator("th").allTextContents()).map(text => text.trim());
        const rows = await table.locator("tbody tr").evaluateAll(elements => elements.map(row => Array.from(row.querySelectorAll("td")).map(cell => cell.textContent.trim())));
        return { sourceUrl: url, rows: parseStandings(headers, rows) };
    } catch (error) {
        if (widgetBlocked) {
            throw new Error("TeamSideline blocked its public widget with browser verification. Automatic standings import is unavailable; the previous table is preserved.");
        }
        const detail = (await page.locator("body").innerText().catch(() => "")).slice(0, 700);
        throw new Error(`Unable to read public standings: ${error.message}. Page text: ${detail}`);
    } finally { await page.close(); }
}
