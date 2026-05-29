# Randall Preserve Watcher Mandates

This file contains foundational mandates for the Gemini CLI when operating within this project.

## Engineering Standards
- **Frontend (React + Vite):**
  - Follow the existing React and Vite architecture.
  - Use `npm run dev` to start the local development server.
  - Adhere to the provided ESLint rules.
- **Generator (Node.js):**
  - The `generate.js` script fetches and summarizes intelligence about the Randall Preserve.
  - Output is formatted as JSON.
  - Use `npm install` for dependencies.
- **Automation:**
  - Changes are committed and pushed automatically by the generator.
  - GitHub Pages reconstructs the static frontend on push.

## Security & Environment
- **Secrets:** NEVER commit the `.env` file or hardcode API keys.
- **API Key:** Use the `GEMINI_API_KEY` environment variable.

## Workflow
- **Daily Intelligence:** The generator is designed to be run as a cron job.
- **Git:** Use `simple-git` for automated commits and pushes.
- **Verification:** When modifying the generator, ensure it correctly fetches and formats the intelligence. When modifying the frontend, verify it correctly displays the JSON data.
