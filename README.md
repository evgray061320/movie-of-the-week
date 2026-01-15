Movie Submission App

Overview
- Front-end: `index.html`, `script.js`, `styles.css`.
- Backend: `server.js` (Node/Express) provides endpoints to accept submissions, pick a weekly winner, reset, and record a history of past winners.

Quick start
1. Install dependencies:

```bash
cd "/Users/eleanorwalker/Desktop/Website mock up"
npm install
```

2. Configure environment variables:
- `OMDB_API_KEY` (server-side, optional): set this to enable server-side poster lookups at `/omdb` and avoid exposing keys in the browser.

3. Run the server:

```bash
npm start
```

4. Open the app in your browser:

- If server runs on the same machine and serves static files, go to http://localhost:3000/

Front-end notes
- Open `script.js` and replace `OMDB_API_KEY` with your OMDb API key, or set up a server-side proxy if you prefer not to expose the key.
- The front-end posts submissions to `/submit` and fetches `/submissions`.

Note: notification system removed — this app now focuses on submission UI/flows and weekly selection. Use the Reset button in the UI or POST `/reset` to clear stored submissions.

Persistence
- Submissions are stored in `submissions.json` in the project directory. This is a simple JSON-backed store for demonstration only.

Security and production
- Do NOT expose private API keys (Twilio auth tokens, OMDb API key) in public front-end code for production. Use a server-side proxy or store server-side secrets securely.
- This implementation is intentionally minimal for demonstration. For production, add validation, rate-limiting, authentication, and a real database.
