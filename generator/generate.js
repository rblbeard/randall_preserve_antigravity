import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import simpleGit from 'simple-git';
import dotenv from 'dotenv';
import { z } from 'zod';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to the frontend's static data file
const DATA_FILE_PATH = path.join(__dirname, '..', 'frontend', 'public', 'data.json');

// Ensure the directory exists
if (!fs.existsSync(path.dirname(DATA_FILE_PATH))) {
    fs.mkdirSync(path.dirname(DATA_FILE_PATH), { recursive: true });
}

// Zod schema for validation
const feedItemSchema = z.object({
    id: z.string(),
    category: z.enum(['OFFICIAL', 'FUNDING', 'LOCAL', 'SOCIAL']),
    date: z.string(),
    title: z.string(),
    summary: z.string(),
    source: z.string(),
    sentiment: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'])
});
const feedItemsSchema = z.array(feedItemSchema);

const preserveDataSchema = z.object({
  feed: z.array(z.object({
    id: z.string(),
    category: z.enum(['OFFICIAL', 'FUNDING', 'LOCAL', 'SOCIAL']),
    date: z.string(),
    title: z.string(),
    summary: z.string(),
    source: z.string(),
    sentiment: z.enum(['POSITIVE', 'NEGATIVE', 'NEUTRAL', 'MIXED'])
  })),
  timeline: z.array(z.object({
    id: z.string(),
    year: z.string(),
    month: z.string().optional(),
    title: z.string(),
    description: z.string(),
    status: z.enum(['completed', 'in-progress', 'future'])
  })),
  neighborWatch: z.array(z.object({
    id: z.string(),
    type: z.string(),
    title: z.string(),
    description: z.string()
  }))
});

// API Key Check
const API_KEY = process.env.GEMINI_API_KEY;

async function loadExistingData() {
    try {
        if (fs.existsSync(DATA_FILE_PATH)) {
            const rawData = fs.readFileSync(DATA_FILE_PATH, 'utf-8');
            return JSON.parse(rawData);
        }
    } catch (e) {
        console.log("No existing data found or error reading, starting fresh.");
    }
    
    // Default fallback
    return {
        feed: [],
        timeline: [
            { id: "t1", year: "2022", month: "Dec", title: "Acquisition", description: "387 acres protected.", status: "completed" },
            { id: "t2", year: "2023 - 2027", title: "Cleanup (Oil Remediation)", description: "Capping 300+ wells.", status: "in-progress" },
            { id: "t3", year: "2024 - 2026", title: "Restoration Planning", description: "Resource & Resilience plans.", status: "in-progress" },
            { id: "t4", year: "2027+", title: "Public Access Construction", description: "Trails and gateways.", status: "future" }
        ],
        neighborWatch: [
            { id: "nw1", type: "FIRE", title: "Fuel Modification", description: "Spring Clearance Scheduled: Late April" }
        ]
    };
}

async function generateUpdates(existingData) {
    console.log("Contacting Gemini for intelligence updates with Google Search Grounding...");
    
    // Create a strict boundary between what we want it to search, and what it should output.
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    // Only the headlines go to the model. Sending the whole data.json and asking for it back
    // grew past what Gemini would return (empty reply, finishReason OTHER) from 9/15/2026.
    const existingTitles = (existingData.feed || []).map(f => `    - ${f.date}: ${f.title}`).join('\n');
    const prompt = `
    TODAY'S DATE: ${today}

    TASK: You are an intelligence analyst for the 'Randall Preserve Watch' dashboard.
    TODAY IS ${today}. You do NOT know anything current — you MUST use Google Search to find news published in the last 30 days.

    Search for ALL of the following queries and report what you find:
    1. "Randall Preserve" Newport Beach 2025 OR 2026
    2. "Banning Ranch" Newport Beach conservation 2025 OR 2026
    3. "Coastal Corridor Alliance" Newport Beach
    4. site:reddit.com "Randall Preserve" OR "Banning Ranch"
    5. "Newport Banning Land Trust" OR "MRCA" Randall Preserve
    6. Randall Preserve trails restoration update

    If you find ANY new, factual, and relevant update or notable community discussion, generate 1-3 new intelligence feed items based strictly on those grounded search results.
    - News articles: use category "OFFICIAL", "FUNDING", or "LOCAL"
    - Reddit/forum posts: use category "SOCIAL"

    These headlines are ALREADY on the dashboard. Do NOT repeat them or report the same story again:
${existingTitles}

    OUTPUT: Return ONLY a JSON array of the NEW feed items (0 to 3 items). Return [] if there is nothing new.
    Do NOT return the existing data. Each item must have exactly this shape:
    {
      "id": "unique-string-id",
      "category": "OFFICIAL" | "FUNDING" | "LOCAL" | "SOCIAL",
      "date": "Month DD, YYYY",
      "title": "A short descriptive title",
      "summary": "A 2-3 sentence factual summary of the grounded news update.",
      "source": "Name of the News Source or Agency you found via search",
      "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED"
    }
    `;

    try {
        console.log("Sending request to Gemini API via @google/genai SDK (with Google Search Grounding)...");
        const ai = new GoogleGenAI({ apiKey: API_KEY });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        // Log grounding metadata to ensure it's actually searching!
        const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
        if (groundingMetadata) {
            console.log("✅ Google Search Grounding was utilized!");
            const chunks = groundingMetadata.groundingChunks || [];
            console.log(`Search chunks found: ${chunks.length}`);
            if (chunks.length > 0) {
                console.log("Source URLs:");
                chunks.forEach((chunk, i) => {
                    if (chunk.web?.uri) {
                        console.log(`  ${i + 1}. ${chunk.web.uri} (${chunk.web.title || 'No Title'})`);
                    }
                });
            }
        } else {
            console.log("⚠️ No grounding metadata returned (LLM may have answered from memory).");
        }

        const finishReason = response.candidates?.[0]?.finishReason;
        let newJsonStr = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log(`Received response from Gemini (finishReason: ${finishReason}).`);

        if (!newJsonStr) {
            throw new Error(`No text returned from Gemini (finishReason: ${finishReason}).`);
        }

        // Handle possible markdown wrapping
        const fenced = newJsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
        if (fenced) newJsonStr = fenced[1];

        let newItems = feedItemsSchema.parse(JSON.parse(newJsonStr.trim()));

        // Public site: only publish items backed by actual search results, never the model's memory
        const sourceCount = response.candidates?.[0]?.groundingMetadata?.groundingChunks?.length || 0;
        if (sourceCount === 0 && newItems.length) {
            console.log(`Discarding ${newItems.length} item(s): Gemini returned no web sources this run.`);
            newItems = [];
        }

        // Merge in code: new items first, skipping anything already on the feed
        const seen = new Set((existingData.feed || []).flatMap(f => [f.id, f.title.trim().toLowerCase()]));
        const fresh = newItems.filter(f => !seen.has(f.id) && !seen.has(f.title.trim().toLowerCase()));
        console.log(`New feed items: ${fresh.length} (of ${newItems.length} returned).`);
        return preserveDataSchema.parse({ ...existingData, feed: [...fresh, ...(existingData.feed || [])] });

    } catch (error) {
        console.error("AI Generation or Validation failed:", error);
        throw error;
    }
}

async function updateGit() {
    if (!fs.existsSync(path.join(__dirname, '..', '.git'))) {
        console.log("Skipping git operations: Not a git repository.");
        return;
    }
    console.log("Committing and pushing changes to GitHub via simple-git...");
    const git = simpleGit(path.join(__dirname, '..'));

    try {
        await git.add(['frontend/public/data.json']);
        
        const status = await git.status();
        if (status.staged.length === 0) {
            console.log("No changes to commit.");
            return;
        }

        await git.commit(`Automated Intelligence Update: ${new Date().toISOString()}`);
        console.log("Committed successfully.");
        
        await git.push('origin', 'main');
        console.log("Pushed to origin/main successfully!");
    } catch (e) {
        console.error("Git automation failed:", e);
    }
}

// ── Live bird sightings from eBird (Cornell Lab of Ornithology) ──
const EBIRD_TOKEN = process.env.EBIRD_API_TOKEN;
const PRESERVE_LAT = 33.635;   // Randall Preserve / Banning Ranch, Newport Beach
const PRESERVE_LNG = -117.958;

// Fetch a representative species photo from Wikipedia (free, no key)
async function birdImage(commonName) {
    try {
        const title = encodeURIComponent(commonName.replace(/ /g, '_'));
        const r = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${title}`, {
            headers: { 'User-Agent': 'RandallPreserveWatch/1.0 (https://randallpreserve.news; rb@varx1.com)', 'accept': 'application/json' },
        });
        if (!r.ok) return null;
        const j = await r.json();
        return (j.thumbnail && j.thumbnail.source) || null;
    } catch { return null; }
}

async function fetchBirds() {
    if (!EBIRD_TOKEN) {
        console.warn("No EBIRD_API_TOKEN set — skipping bird sightings.");
        return null;
    }
    const headers = { 'X-eBirdApiToken': EBIRD_TOKEN };
    const fmt = (o, notable) => ({
        species: o.comName,
        sciName: o.sciName,
        location: o.locName,
        date: o.obsDt,
        count: (o.howMany ?? null),
        lat: o.lat,
        lng: o.lng,
        notable: !!notable,
    });
    try {
        // Recent observations within ~5km of the preserve (last 14 days)
        const recRes = await fetch(`https://api.ebird.org/v2/data/obs/geo/recent?lat=${PRESERVE_LAT}&lng=${PRESERVE_LNG}&dist=5&back=14&maxResults=40`, { headers });
        const recentRaw = recRes.ok ? await recRes.json() : [];
        // Notable / rare sightings within ~15km (the "special bird" feed)
        const notRes = await fetch(`https://api.ebird.org/v2/data/obs/geo/recent/notable?lat=${PRESERVE_LAT}&lng=${PRESERVE_LNG}&dist=15&detail=simple&back=14&maxResults=25`, { headers });
        const notableRaw = notRes.ok ? await notRes.json() : [];

        // De-dupe recent by species, keep most recent first
        const seen = new Set();
        const recentSightings = [];
        for (const o of recentRaw) {
            if (!seen.has(o.comName)) { seen.add(o.comName); recentSightings.push(fmt(o, false)); }
        }
        const notableSightings = notableRaw.map(o => fmt(o, true)).slice(0, 12);
        const recentTop = recentSightings.slice(0, 24);

        // Attach a Wikipedia photo for each unique species (parallel)
        const speciesList = [...new Set([...notableSightings, ...recentTop].map(b => b.species))];
        const imgMap = {};
        await Promise.all(speciesList.map(async (s) => { imgMap[s] = await birdImage(s); }));
        for (const b of notableSightings) b.imageUrl = imgMap[b.species] || null;
        for (const b of recentTop) b.imageUrl = imgMap[b.species] || null;
        const withImg = Object.values(imgMap).filter(Boolean).length;

        console.log(`eBird: ${recentSightings.length} recent species, ${notableSightings.length} notable; ${withImg}/${speciesList.length} with photos.`);
        return {
            recentSightings: recentTop,
            notableSightings,
            speciesCount: recentSightings.length,
            lastBirdUpdate: new Date().toISOString(),
            source: "eBird · Cornell Lab of Ornithology",
        };
    } catch (e) {
        console.error("eBird fetch failed (non-fatal):", e.message);
        return null;
    }
}

async function main() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("WARNING: GEMINI_API_KEY is not set in generator/.env");
        }

        const data = await loadExistingData();
        
        // In a real environment, you'd fetch latest news or scrape here before passing to LLM
        // For demonstration, we just ask the LLM to invent a plausible update based on context
        let updatedData = data;
        let feedError = null;
        if (process.env.GEMINI_API_KEY) {
            try {
                updatedData = await generateUpdates(data);
            } catch (e) {
                feedError = e;
                console.error("News feed update failed; keeping the existing feed so birds still update:", e.message);
                updatedData = { ...data };
            }
        }

        // Preserve the curated Restoration timeline + Neighbor Watch (the AI only updates the feed)
        if (data.timeline && data.timeline.length) updatedData.timeline = data.timeline;
        if (data.neighborWatch && data.neighborWatch.length) updatedData.neighborWatch = data.neighborWatch;

        // Fetch live bird sightings from eBird (non-fatal; keeps prior data if it fails)
        const birds = await fetchBirds();
        if (birds) {
            updatedData.birds = birds;
            // Preserve the curated signature-species list across daily runs
            if (data.birds && data.birds.signatureSpecies) {
                updatedData.birds.signatureSpecies = data.birds.signatureSpecies;
            }
        } else if (data.birds) {
            updatedData.birds = data.birds;
        }

        // Save
        updatedData.lastUpdated = new Date().toISOString();
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(updatedData, null, 2));
        console.log(`Saved updated data to ${DATA_FILE_PATH}`);

        // Push
        await updateGit();
        
        if (feedError) {
            console.error("Finished, but the news feed was NOT updated (see error above).");
            process.exit(1);
        }
        console.log("Cron job finished successfully.");
    } catch (error) {
        console.error("Generator job failed:", error);
        process.exit(1);
    }
}

main();
