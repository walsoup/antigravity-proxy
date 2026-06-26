import { loadProxyConfig } from "../config/manager";
import { getImpersonationHeaders } from "../utils/headers";
import { readFileSync } from "fs";
import { join } from "path";

await loadProxyConfig();
const dbPath = join(process.cwd(), "antigravity-accounts.json");
let accounts = [];
try {
    const data = readFileSync(dbPath, "utf-8");
    const json = JSON.parse(data);
    accounts = Array.isArray(json) ? json : (json.accounts || []);
} catch (e) {
    console.error("Could not read antigravity-accounts.json");
    process.exit(1);
}

if (accounts.length === 0) {
    console.error("No accounts found in antigravity-accounts.json.");
    process.exit(1);
}
const account = accounts[0];

const url = "https://cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels";

try {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            ...getImpersonationHeaders(account.accessToken),
            "User-Agent": "antigravity", 
        },
        body: JSON.stringify({
            project: account.projectId
        })
    });
    
    if (!res.ok) {
        console.error("Error fetching models:", await res.text());
        process.exit(1);
    }
    
    const data = await res.json() as any;
    const models = data.models || {};
    
    console.log("=== Available Models ===");
    for (const [id, details] of Object.entries(models)) {
        const anyDetails = details as any;
        console.log(`- ID: ${id}`);
        console.log(`  Display Name: ${anyDetails.displayName || "Unknown"}`);
        console.log(`  Supports Thinking: ${anyDetails.supportsThinking ? "Yes" : "No"}`);
        console.log("");
    }
} catch (e) {
    console.error(e);
}
