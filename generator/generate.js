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
    const prompt = `
    TASK: You are an intelligence analyst for the 'Randall Preserve Watch' dashboard. 
    You must perform a Google Search for recent news or social chatter (within the last 7 to 14 days) regarding "Banning Ranch Newport Beach", "Randall Preserve", or "Newport Banning Land Trust". 
    To find community sentiment and social data, you should specifically include searches like: "site:reddit.com/r/orangecounty Banning Ranch" or "site:reddit.com/r/newportbeach Randall Preserve".

    If you find a new, factual, and relevant update or a notable community discussion on Reddit/public forums, generate 1 new intelligence feed item based strictly on that grounded search result. 
    - If it's a news article, use the categories: "OFFICIAL", "FUNDING", or "LOCAL".
    - If it's community chatter from Reddit or a forum, use the category: "SOCIAL".
    Return ONLY a valid JSON object. 
    If there is absolutely no new relevant news or social chatter, you still must return a valid JSON object, but you can omit adding a new feed item to the array.

    CRITICAL INSTRUCTION: You MUST return a JSON object with this exact structure:
    {
      "feed": [
        {
          "id": "unique-string-id",
          "category": "OFFICIAL" | "FUNDING" | "LOCAL" | "SOCIAL",
          "date": "Month DD, YYYY",
          "title": "A short descriptive title",
          "summary": "A 2-3 sentence factual summary of the grounded news update.",
          "source": "Name of the News Source or Agency you found via search",
          "sentiment": "POSITIVE" | "NEGATIVE" | "NEUTRAL" | "MIXED"
        }
      ],
      "timeline": [... existing timeline ...],
      "neighborWatch": [... existing neighborWatch ...]
    }

    Existing Data (Append your new feed item to the beginning of the 'feed' array if you found one):
    ${JSON.stringify(existingData)}
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

        let newJsonStr = response.text || response.candidates?.[0]?.content?.parts?.[0]?.text;
        console.log("Received text response from Gemini.");
        
        if (!newJsonStr) {
            throw new Error("No text returned from Gemini.");
        }

        // Handle possible markdown wrapping
        if (newJsonStr.includes('```json')) {
            newJsonStr = newJsonStr.match(/```json\n([\s\S]*?)\n```/)[1];
        } else if (newJsonStr.includes('```')) {
            newJsonStr = newJsonStr.match(/```\n([\s\S]*?)\n```/)[1];
        }

        const newData = JSON.parse(newJsonStr);
        
        // Validate with Zod
        const validatedData = preserveDataSchema.parse(newData);
        return validatedData;

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

async function main() {
    try {
        if (!process.env.GEMINI_API_KEY) {
            console.warn("WARNING: GEMINI_API_KEY is not set in generator/.env");
        }

        const data = await loadExistingData();
        
        // In a real environment, you'd fetch latest news or scrape here before passing to LLM
        // For demonstration, we just ask the LLM to invent a plausible update based on context
        const updatedData = process.env.GEMINI_API_KEY ? await generateUpdates(data) : data;

        // Save
        fs.writeFileSync(DATA_FILE_PATH, JSON.stringify(updatedData, null, 2));
        console.log(`Saved updated data to ${DATA_FILE_PATH}`);

        // Push
        await updateGit();
        
        console.log("Cron job finished successfully.");
    } catch (error) {
        console.error("Generator job failed:", error);
        process.exit(1);
    }
}

main();
