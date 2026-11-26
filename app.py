
import json
import os
import re
from pathlib import Path

from dotenv import dotenv_values, load_dotenv
from flask import Flask, jsonify, render_template, request
from google import genai


PROJECT_ROOT = Path(__file__).resolve().parent
MOVIES_FILE = PROJECT_ROOT / "Data" / "movies.json"
MODEL_NAME = "gemini-3.8-flash"

DOTENV_API_KEY = str(dotenv_values(PROJECT_ROOT / ".env").get("GEMINI_API_KEY") or "").strip()
PROCESS_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
load_dotenv(PROJECT_ROOT / ".env")

app = Flask(__name__)

if PROCESS_API_KEY and DOTENV_API_KEY and PROCESS_API_KEY != DOTENV_API_KEY:
    app.logger.warning(
        "A process-level GEMINI_API_KEY differs from the project .env value; "
        "the process value takes precedence. Restart the terminal or clear the "
        "process variable to use the .env value."
    )

REVIEW_TYPES = {
    "spoiler-free": "Write a spoiler-free review. Do not reveal plot twists or late-film events.",
    "detailed": "Write a thoughtful, detailed review of the film's craft and overall impact.",
    "character-analysis": "Focus on character motivations, relationships, and development.",
    "themes-symbolism": "Explore the film's themes and visual symbolism without presenting speculation as fact.",
}

STORY_STYLES = {
    "character-led": "character-led and intimate",
    "slow-burn": "patient, slow-burn reveals",
    "visually-bold": "visually bold and inventive storytelling",
    "big-ideas": "big ideas and expansive worlds",
    "unexpected": "unpredictable stories with a twist",
}


def load_movies():
    with MOVIES_FILE.open("r", encoding="utf-8") as movie_file:
        movies = json.load(movie_file)
    if not isinstance(movies, list):
        raise ValueError("The movie catalog must be a JSON list.")
    return movies


def json_error(message, status_code):
    return jsonify({"error": message}), status_code


def redact_gemini_value(value):
    if isinstance(value, dict):
        redacted = {}
        for key, item in value.items():
            normalized_key = re.sub(r"[^a-z]", "", str(key).lower())
            is_sensitive = any(
                marker in normalized_key
                for marker in ("key", "header", "authorization", "token", "secret", "password", "cookie", "credential")
            )
            redacted[key] = "[REDACTED]" if is_sensitive else redact_gemini_value(item)
        return redacted
    if isinstance(value, (list, tuple)):
        return [redact_gemini_value(item) for item in value]
    if not isinstance(value, str):
        return value

    detail = value
    for api_key in (DOTENV_API_KEY, PROCESS_API_KEY, os.getenv("GEMINI_API_KEY", "").strip()):
        if api_key:
            detail = detail.replace(api_key, "[REDACTED]")
    detail = re.sub(
        r"(?i)(x-goog-api-key|api[_-]?key|authorization|access[_-]?token)\s*['\"]?\s*[:=]\s*['\"]?[^'\"\s,;}]+",
        r"\1=[REDACTED]",
        detail,
    )
    detail = re.sub(r"(?i)\bbearer\s+[^\"'\s,;}]+", "Bearer [REDACTED]", detail)
    detail = re.sub(r"(?i)AIza[0-9a-z_-]{20,}", "[REDACTED]", detail)
    detail = re.sub(r"(?i)\bya29\.[a-z0-9._~-]+", "[REDACTED]", detail)
    detail = re.sub(r"(https?://[^\s?]+)\?[^\s]+", r"\1?[REDACTED]", detail)
    return detail


def sanitize_gemini_detail(value):
    redacted = redact_gemini_value(value)
    if isinstance(redacted, (dict, list)):
        detail = json.dumps(redacted, ensure_ascii=False, default=str)
    else:
        detail = str(redacted or "No provider details were supplied.")
    return detail[:500]


def generate_text(prompt):
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        app.logger.warning("Gemini request skipped: GEMINI_API_KEY is not configured.")
        return None, json_error(
            "AI features are unavailable because GEMINI_API_KEY is not configured.",
            503,
        )

    try:
        client = genai.Client(api_key=api_key)
        app.logger.info("Gemini generate_content request started: model=%s", MODEL_NAME)
        response = client.models.generate_content(
            model=MODEL_NAME,
            contents=prompt,
        )
    except Exception as error:
        error_code = getattr(error, "code", None)
        response = getattr(error, "response", None)
        http_status = error_code if isinstance(error_code, int) else getattr(response, "status_code", None)
        api_status = getattr(error, "status", None)
        if not api_status and isinstance(error_code, str):
            api_status = error_code
        provider_message = getattr(error, "message", None) or "No provider message was supplied."
        structured_details = getattr(error, "details", None) or str(error)
        diagnostic_text = f"{api_status or ''} {provider_message} {structured_details}".upper()
        unsupported_credential = "ACCESS_TOKEN_TYPE_UNSUPPORTED" in diagnostic_text
        app.logger.error(
            "Gemini request failed: exception=%s http_status=%s api_status=%s "
            "provider_message=%s structured_details=%s",
            type(error).__name__,
            sanitize_gemini_detail(http_status) if http_status is not None else "unavailable",
            sanitize_gemini_detail(api_status) if api_status else "unavailable",
            sanitize_gemini_detail(provider_message),
            sanitize_gemini_detail(structured_details),
        )
        if unsupported_credential:
            message = "The configured credential is not accepted as a Gemini API key. Generate a Gemini API key in Google AI Studio and replace GEMINI_API_KEY in .env."
        elif error_code in (401, 403, "UNAUTHENTICATED", "PERMISSION_DENIED"):
            message = "Gemini rejected the configured credential or its permissions. Verify GEMINI_API_KEY in Google AI Studio."
        elif error_code == 429:
            message = "Gemini is receiving too many requests right now. Please try again shortly."
        else:
            message = "Gemini could not complete the request. Please try again shortly."
        return None, json_error(message, 502)

    text = (response.text or "").strip()
    if not text:
        return None, json_error("Gemini returned an empty response. Please try again.", 502)
    return text, None


def select_recommendations(movies, genres, favorite_movie):
    favorite = favorite_movie.casefold()
    ranked_movies = []
    for movie in movies:
        if movie.get("title", "").casefold() == favorite:
            continue
        overlap = len(set(genres).intersection(movie.get("genres", [])))
        ranked_movies.append((overlap, movie))

    ranked_movies.sort(key=lambda item: (-item[0], item[1].get("title", "").casefold()))
    return [movie for _, movie in ranked_movies[:3]]


@app.get("/")
def home():
    return render_template("index.html")


@app.get("/api/movies")
def movies_api():
    try:
        return jsonify(load_movies())
    except (OSError, json.JSONDecodeError, ValueError):
        app.logger.exception("The movie catalog could not be loaded.")
        return json_error("The movie collection is temporarily unavailable.", 500)


@app.post("/api/review")
def review_api():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return json_error("Send the review details as a JSON object.", 400)

    movie_title = payload.get("movie", "")
    review_type = payload.get("review_type", "spoiler-free")
    if not isinstance(movie_title, str) or not movie_title.strip():
        return json_error("Enter a movie title to generate a review.", 400)
    if len(movie_title.strip()) > 120:
        return json_error("Movie titles must be 120 characters or fewer.", 400)
    if not isinstance(review_type, str) or review_type not in REVIEW_TYPES:
        return json_error("Choose a valid review type.", 400)

    title = movie_title.strip()
    try:
        catalog = load_movies()
    except (OSError, json.JSONDecodeError, ValueError):
        catalog = []
    catalog_movie = next(
        (movie for movie in catalog if movie.get("title", "").casefold() == title.casefold()),
        None,
    )
    known_details = json.dumps(catalog_movie, ensure_ascii=False) if catalog_movie else "No matching catalog entry."

    prompt = f"""You are a thoughtful film critic. Write a useful, specific movie review.
Requested film: {title}
Review type: {review_type}
Instructions: {REVIEW_TYPES[review_type]}
Known catalog details (treat as the only verified facts for this request): {known_details}

Do not invent ratings, awards, cast, release details, or plot facts. When details are not verified in the supplied catalog, keep the critique focused on broad cinematic qualities and clearly qualify uncertain claims. Use short titled sections where useful. Do not claim to have watched the film."""

    review, error_response = generate_text(prompt)
    if error_response:
        return error_response
    return jsonify({"movie": title, "review_type": review_type, "review": review})


@app.post("/api/taste-profile")
def taste_profile_api():
    payload = request.get_json(silent=True)
    if not isinstance(payload, dict):
        return json_error("Send your taste preferences as a JSON object.", 400)

    try:
        catalog = load_movies()
    except (OSError, json.JSONDecodeError, ValueError):
        app.logger.exception("The movie catalog could not be loaded.")
        return json_error("The movie collection is temporarily unavailable.", 500)

    available_genres = {genre for movie in catalog for genre in movie.get("genres", [])}
    submitted_genres = payload.get("genres", [])
    if not isinstance(submitted_genres, list):
        return json_error("Genres must be sent as a list.", 400)
    genres = list(dict.fromkeys(
        genre for genre in submitted_genres
        if isinstance(genre, str) and genre in available_genres
    ))
    if not genres:
        return json_error("Choose at least one genre from the movie collection.", 400)

    favorite_movie = payload.get("favorite_movie", "")
    if not isinstance(favorite_movie, str) or len(favorite_movie.strip()) > 120:
        return json_error("The favourite movie must be 120 characters or fewer.", 400)
    favorite_movie = favorite_movie.strip()

    story_style = payload.get("storytelling_style", "character-led")
    if not isinstance(story_style, str) or story_style not in STORY_STYLES:
        return json_error("Choose a valid storytelling style.", 400)

    prompt = f"""Create a warm, concise personalized cinematic taste profile in two short paragraphs.
The viewer's selected genres are: {", ".join(genres)}.
Their preferred storytelling style is: {STORY_STYLES[story_style]}.
Their favourite movie, provided by the viewer, is: {favorite_movie or "not provided"}.

Describe what these preferences suggest about the kinds of stories and experiences they enjoy. Do not claim facts about the favourite movie, invent film titles, invent ratings, or provide recommendations. Do not restate the prompt as a list. Address the viewer directly."""

    profile, error_response = generate_text(prompt)
    if error_response:
        return error_response

    return jsonify({
        "profile": profile,
        "recommendations": select_recommendations(catalog, genres, favorite_movie),
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False)
