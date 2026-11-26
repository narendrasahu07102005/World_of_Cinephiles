from dotenv import dotenv_values
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

key = dotenv_values(".env").get("GEMINI_API_KEY", "").strip()

if not key:
    print("ERROR: API key not found in .env")
else:
    url = "https://generativelanguage.googleapis.com/v1beta/models"

    request = Request(
        url,
        headers={"x-goog-api-key": key},
        method="GET"
    )

    try:
        response = urlopen(request, timeout=20)
        print("SUCCESS! Google accepted your API key.")
        print("HTTP Status:", response.status)

    except HTTPError as e:
        print("API ERROR")
        print("HTTP Status:", e.code)
        print(e.read().decode()[:600])

    except URLError as e:
        print("CONNECTION ERROR")
        print(e.reason)
        