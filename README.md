# World of Cinephiles

A Flask-powered movie discovery site with a curated JSON catalog, browser-based watchlist, local taste profile, and a server-side Gemini review endpoint.

## Features

- Search films by title, director, description, genre, or mood.
- Filter the catalog by genre and mood and open movie details.
- Save and remove watchlist films using browser LocalStorage.
- Generate a local Taste DNA profile from selected genres, moods, favorite films, storytelling preferences, and saved movies.
- Use the AI Review Studio through the Flask backend. Gemini credentials are read server-side and are never placed in frontend assets.
- Responsive layout with poster fallbacks and accessible navigation.

The catalog is stored in `Data/movies.json`. Ratings are not included in the current dataset and are not fabricated.

## Technology

- Python 3.13 and Flask
- Vanilla HTML, CSS, and JavaScript
- Google GenAI Python SDK and python-dotenv
- Gunicorn for production hosting
- JSON movie catalog and browser LocalStorage

## Local Setup

From the project directory, create and activate a virtual environment, then install dependencies:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

The project expects `GEMINI_API_KEY` in the existing `.env` file for AI review requests. Keep that file private; it is excluded by `.gitignore`. Do not add credentials to source code or commit them.

Start the local Flask server:

```powershell
python app.py
```

Open <http://127.0.0.1:5000>. The app reads `PORT` when set and otherwise uses port `5000`. Debug mode is disabled by default.

## Flask Routes

- `GET /` serves the website.
- `GET /api/movies` returns the JSON movie catalog.
- `POST /api/review` requests a Gemini-generated review.
- `POST /api/taste-profile` is the server-side profile endpoint; the current website Taste DNA experience is generated locally in the browser.

## Deploying to Render

The included `render.yaml` defines a Python web service, installs `requirements.txt`, and starts Gunicorn bound to Render's `PORT`. Automatic deploys are disabled in the blueprint.

1. Push the project to a private GitHub repository only when you are ready to publish it.
2. In Render, create a Blueprint instance from that repository and review the service settings before applying it.
3. Add `GEMINI_API_KEY` as a secret environment variable in the Render dashboard if you want AI review requests enabled. Do not commit `.env` or paste a key into `render.yaml`.
4. Render will build with `pip install -r requirements.txt` and serve with Gunicorn. The health check uses `/`.

No deployment is performed by preparing this repository.