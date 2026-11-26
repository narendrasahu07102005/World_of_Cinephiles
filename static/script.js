"use strict";

const MOVIES_URL = "/api/movies";
const WATCHLIST_KEY = "worldOfCinephiles.watchlist.v1";

const state = {
	movies: [],
	activeGenre: "All",
	activeMood: "",
	searchTerm: "",
	activeMovieId: null,
	searchIndex: new Map(),
};

const elements = {
	catalogStatus: document.getElementById("catalog-status"),
	heroPoster: document.getElementById("hero-poster"),
	heroFilmTitle: document.getElementById("hero-film-title"),
	heroFilmDetails: document.getElementById("hero-film-details"),
	featuredGrid: document.getElementById("featured-grid"),
	movieGrid: document.getElementById("movie-grid"),
	genreFilters: document.getElementById("genre-filters"),
	moodFilter: document.getElementById("mood-filter"),
	movieSearch: document.getElementById("movie-search"),
	resultsCount: document.getElementById("results-count"),
	clearFilters: document.getElementById("clear-filters"),
	noResults: document.getElementById("no-results"),
	watchlistGrid: document.getElementById("watchlist-grid"),
	watchlistEmpty: document.getElementById("watchlist-empty"),
	watchlistCount: document.getElementById("watchlist-count"),
	movieDialog: document.getElementById("movie-dialog"),
	dialogContent: document.getElementById("dialog-content"),
	reviewForm: document.getElementById("review-form"),
	reviewOutput: document.getElementById("review-output"),
	reviewResult: document.getElementById("review-result"),
	tasteForm: document.getElementById("taste-form"),
	genreChoices: document.getElementById("genre-choices"),
	moodChoices: document.getElementById("mood-choices"),
	tasteMessage: document.getElementById("taste-message"),
	tasteResult: document.getElementById("taste-result"),
	primaryNav: document.getElementById("primary-nav"),
	menuToggle: document.getElementById("menu-toggle"),
};

function escapeHtml(value) {
	return String(value ?? "").replace(/[&<>"']/g, (character) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		'"': "&quot;",
		"'": "&#39;",
	})[character]);
}

function readWatchlist() {
	try {
		const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "[]");
		return Array.isArray(saved) ? [...new Set(saved.filter((id) => typeof id === "string"))] : [];
	} catch {
		return [];
	}
}

function saveWatchlist(ids) {
	try {
		localStorage.setItem(WATCHLIST_KEY, JSON.stringify(ids));
		return true;
	} catch {
		return false;
	}
}

async function postJson(url, payload) {
	let response;
	try {
		response = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(payload),
		});
	} catch {
		throw new Error("Could not reach the server. Check that the Flask app is running and try again.");
	}

	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		const error = new Error(data.error || "The request could not be completed.");
		error.status = response.status;
		throw error;
	}
	return data;
}

function fallbackPoster(title) {
	const safeTitle = String(title || "Cinema").replace(/[&<>"']/g, "");
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 570"><rect width="400" height="570" fill="#22221e"/><path d="M38 40h324v490H38z" fill="none" stroke="#886b3e" stroke-width="2"/><path d="M58 60h284v450H58z" fill="none" stroke="#534832"/><text x="200" y="267" fill="#d3aa67" font-family="Georgia,serif" font-size="50" text-anchor="middle">W/C</text><text x="200" y="320" fill="#d6d0c4" font-family="Arial,sans-serif" font-size="18" text-anchor="middle">${safeTitle.slice(0, 26)}</text></svg>`;
	return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function attachPosterFallbacks(root = document) {
	root.querySelectorAll("img[data-fallback]").forEach((image) => {
		image.addEventListener("error", () => {
			if (image.dataset.failed) return;
			image.dataset.failed = "true";
			image.src = fallbackPoster(image.dataset.title);
		}, { once: true });
	});
}

function movieById(id) {
	return state.movies.find((movie) => movie.id === id);
}

function genreLine(movie) {
	return (Array.isArray(movie.genres) ? movie.genres : []).slice(0, 2).join(" · ") || "Genre not listed";
}

function movieCard(movie, mode, savedIds) {
	const saved = savedIds.has(movie.id);
	const isWatchlist = mode === "watchlist";
	const buttonText = isWatchlist ? "Remove" : saved ? "Saved" : "Add to list";
	const buttonAction = isWatchlist ? "remove" : "toggle";
	const title = escapeHtml(movie.title);

	return `
		<article class="movie-card">
			<button class="movie-art-button" type="button" data-action="details" data-id="${escapeHtml(movie.id)}" aria-label="View details for ${title}">
				<img src="${escapeHtml(movie.poster_url)}" alt="${title} poster" loading="lazy" data-fallback="true" data-title="${title}">
				<span class="card-view-label">VIEW FILM ↗</span>
			</button>
			<div class="movie-card-topline">
				<h3 title="${title}">${title}</h3>
				<span class="card-year">${escapeHtml(movie.year)}</span>
			</div>
			<div class="movie-card-meta">
				<span class="card-genre">${escapeHtml(genreLine(movie))}</span>
				<span class="card-rating">Not rated</span>
			</div>
			<div class="card-actions">
				<button class="card-detail-link" type="button" data-action="details" data-id="${escapeHtml(movie.id)}">Film details <span aria-hidden="true">↗</span></button>
				<button class="watch-button${saved && !isWatchlist ? " is-saved" : ""}" type="button" data-action="${buttonAction}" data-id="${escapeHtml(movie.id)}" aria-label="${isWatchlist ? "Remove" : saved ? "Remove" : "Add"} ${title} ${isWatchlist || saved ? "from" : "to"} watchlist">
					<span class="watch-symbol" aria-hidden="true">${isWatchlist || saved ? "−" : "+"}</span>${buttonText}
				</button>
			</div>
		</article>`;
}

function renderHero() {
	const featured = state.movies.find((movie) => movie.featured) || state.movies[0];
	if (!featured) return;
	elements.heroPoster.src = featured.poster_url || fallbackPoster(featured.title);
	elements.heroPoster.alt = `${featured.title} poster`;
	elements.heroPoster.dataset.title = featured.title;
	elements.heroFilmTitle.textContent = featured.title;
	elements.heroFilmDetails.dataset.id = featured.id;
	elements.catalogStatus.textContent = `${state.movies.length} films to set your imagination in motion`;
	attachPosterFallbacks(document.getElementById("hero-feature"));
}

function renderFeatured() {
	const featured = state.movies.filter((movie) => movie.featured).slice(0, 4);
	const savedIds = new Set(readWatchlist());
	elements.featuredGrid.innerHTML = featured.length
		? featured.map((movie) => movieCard(movie, "discover", savedIds)).join("")
		: state.movies.slice(0, 4).map((movie) => movieCard(movie, "discover", savedIds)).join("");
	attachPosterFallbacks(elements.featuredGrid);
	elements.featuredGrid.setAttribute("aria-busy", "false");
}

function renderGenreFilters() {
	const genres = [...new Set(state.movies.flatMap((movie) => movie.genres || []))].sort((a, b) => a.localeCompare(b));
	elements.genreFilters.innerHTML = ["All", ...genres].map((genre) => `
		<button class="genre-chip" type="button" data-genre="${escapeHtml(genre)}" aria-pressed="${state.activeGenre === genre}">${escapeHtml(genre)}</button>
	`).join("");

	const moods = [...new Set(state.movies.flatMap((movie) => movie.moods || []))].sort((a, b) => a.localeCompare(b));
	elements.moodFilter.innerHTML = '<option value="">Any mood</option>' + moods.map((mood) => (
		`<option value="${escapeHtml(mood)}">${escapeHtml(mood.replaceAll("-", " "))}</option>`
	)).join("");

	elements.genreChoices.innerHTML = genres.map((genre) => `
		<label class="genre-choice">
			<input type="checkbox" name="favorite-genre" value="${escapeHtml(genre)}">
			<span>${escapeHtml(genre)}</span>
		</label>
	`).join("");

	elements.moodChoices.innerHTML = moods.map((mood) => `
		<label class="genre-choice">
			<input type="checkbox" name="favorite-mood" value="${escapeHtml(mood)}">
			<span>${escapeHtml(mood.replaceAll("-", " "))}</span>
		</label>
	`).join("");
}

function getFilteredMovies() {
	const query = state.searchTerm.trim().toLocaleLowerCase();
	return state.movies.filter((movie) => {
		const matchesGenre = state.activeGenre === "All" || (movie.genres || []).includes(state.activeGenre);
		const matchesMood = !state.activeMood || (movie.moods || []).includes(state.activeMood);
		const searchable = state.searchIndex.get(movie.id) || "";
		return matchesGenre && matchesMood && (!query || searchable.includes(query));
	});
}

function renderMovies() {
	const movies = getFilteredMovies();
	const savedIds = new Set(readWatchlist());
	elements.movieGrid.innerHTML = movies.map((movie) => movieCard(movie, "discover", savedIds)).join("");
	elements.resultsCount.textContent = `${movies.length} ${movies.length === 1 ? "film" : "films"} in the frame`;
	elements.noResults.classList.toggle("hidden", movies.length !== 0);
	elements.movieGrid.classList.toggle("hidden", movies.length === 0);
	elements.clearFilters.classList.toggle("hidden", state.activeGenre === "All" && !state.activeMood && !state.searchTerm.trim());
	elements.movieGrid.setAttribute("aria-busy", "false");
	attachPosterFallbacks(elements.movieGrid);
}

function renderWatchlist() {
	const savedIds = readWatchlist();
	const savedMovies = savedIds.map(movieById).filter(Boolean);
	elements.watchlistCount.textContent = String(savedMovies.length);
	const savedIdSet = new Set(savedIds);
	elements.watchlistGrid.innerHTML = savedMovies.map((movie) => movieCard(movie, "watchlist", savedIdSet)).join("");
	elements.watchlistGrid.classList.toggle("hidden", savedMovies.length === 0);
	elements.watchlistEmpty.classList.toggle("hidden", savedMovies.length !== 0);
	elements.watchlistGrid.setAttribute("aria-busy", "false");
	attachPosterFallbacks(elements.watchlistGrid);
}

function openMovieDetails(id) {
	const movie = movieById(id);
	if (!movie) return;
	state.activeMovieId = id;
	const genres = (movie.genres || []).map((genre) => `<span>${escapeHtml(genre)}</span>`).join("");
	const moods = (movie.moods || []).map((mood) => `<span>${escapeHtml(mood.replaceAll("-", " "))}</span>`).join("");
	const saved = readWatchlist().includes(movie.id);

	elements.dialogContent.innerHTML = `
		<div class="dialog-layout">
			<img class="dialog-poster" src="${escapeHtml(movie.poster_url)}" alt="${escapeHtml(movie.title)} poster" data-fallback="true" data-title="${escapeHtml(movie.title)}">
			<div class="dialog-copy">
				<p class="eyebrow">A FILM TO DISCOVER</p>
				<h2 id="dialog-title">${escapeHtml(movie.title)}</h2>
				<p class="dialog-meta">${escapeHtml(movie.year)}${movie.director ? ` · Directed by ${escapeHtml(movie.director)}` : ""}</p>
				<p>${escapeHtml(movie.description)}</p>
				<div class="dialog-tags">${genres}${moods}</div>
				<button class="button button-gold" type="button" data-action="toggle" data-id="${escapeHtml(movie.id)}">
					${saved ? "Remove from watchlist" : "Add to watchlist"}<span aria-hidden="true">${saved ? "−" : "+"}</span>
				</button>
			</div>
		</div>`;

	attachPosterFallbacks(elements.dialogContent);
	if (!elements.movieDialog.open) elements.movieDialog.showModal();
	document.body.classList.add("dialog-open");
}

function closeMovieDetails() {
	if (elements.movieDialog.open) elements.movieDialog.close();
	document.body.classList.remove("dialog-open");
}

function toggleWatchlist(id, forceRemove = false) {
	const movie = movieById(id);
	if (!movie) return;
	const saved = readWatchlist();
	const exists = saved.includes(id);
	const updated = forceRemove || exists ? saved.filter((savedId) => savedId !== id) : [...saved, id];
	if (!saveWatchlist(updated)) {
		window.alert("Your browser could not save this watchlist. Check its storage settings and try again.");
		return;
	}
	renderFeatured();
	renderMovies();
	renderWatchlist();
	if (elements.movieDialog.open && state.activeMovieId === id) openMovieDetails(id);
}

function buildLocalTasteProfile(genres, moods, favoriteMovie, storytellingStyle) {
	const savedIds = readWatchlist();
	const savedMovies = savedIds.map(movieById).filter(Boolean);
	const favoriteMatch = state.movies.find((movie) => movie.title.toLocaleLowerCase() === favoriteMovie.toLocaleLowerCase());
	const genreWeights = new Map();
	const moodWeights = new Map();

	genres.forEach((genre) => genreWeights.set(genre, (genreWeights.get(genre) || 0) + 3));
	moods.forEach((mood) => moodWeights.set(mood, (moodWeights.get(mood) || 0) + 2));
	[...savedMovies, ...(favoriteMatch ? [favoriteMatch] : [])].forEach((movie) => {
		(movie.genres || []).forEach((genre) => genreWeights.set(genre, (genreWeights.get(genre) || 0) + 1));
		(movie.moods || []).forEach((mood) => moodWeights.set(mood, (moodWeights.get(mood) || 0) + 1));
	});

	const preferredGenres = [...genreWeights.entries()].sort((a, b) => b[1] - a[1]).map(([genre]) => genre);
	const preferredMoods = [...moodWeights.entries()].sort((a, b) => b[1] - a[1]).map(([mood]) => mood);
	const genreSummary = preferredGenres.slice(0, 3).join(", ").toLowerCase();
	const moodSummary = preferredMoods.slice(0, 3).map((mood) => mood.replaceAll("-", " ")).join(", ");
	const paragraphs = [];

	if (genreSummary) {
		paragraphs.push(genres.length
			? `Your choices lean toward ${genreSummary}, with your saved films adding their own shades to that picture.`
			: `Your watchlist suggests a pull toward ${genreSummary}.`);
	}
	if (moodSummary) {
		paragraphs.push(moods.length
			? `For atmosphere, you are drawn to ${moodSummary}.`
			: `The moods in your watchlist tend toward ${moodSummary}.`);
	}
	if (favoriteMovie) {
		paragraphs.push(favoriteMatch
			? `${favoriteMatch.title} is already in this collection, so its listed genres and moods also inform your recommendations.`
			: `You named “${favoriteMovie}” as a favourite; it is included as your personal reference point, without adding unverified film details.`);
	}
	const styleNotes = {
		"character-led": "You value intimate, character-led storytelling.",
		"slow-burn": "You enjoy patient stories that let their reveals gather naturally.",
		"visually-bold": "You are drawn to visually bold, inventive storytelling.",
		"big-ideas": "You like films that make room for expansive worlds and big ideas.",
		unexpected: "You appreciate stories that take an unexpected turn.",
	};
	paragraphs.push(styleNotes[storytellingStyle] || styleNotes["character-led"]);
	if (savedMovies.length) {
		paragraphs.push(`Your ${savedMovies.length} saved ${savedMovies.length === 1 ? "film adds" : "films add"} another signal to this profile.`);
	}

	const savedSet = new Set(savedIds);
	const candidates = state.movies
		.filter((movie) => !savedSet.has(movie.id) && movie.id !== favoriteMatch?.id)
		.map((movie) => {
			const genreScore = (movie.genres || []).reduce((score, genre) => score + (genreWeights.get(genre) || 0), 0);
			const moodScore = (movie.moods || []).reduce((score, mood) => score + (moodWeights.get(mood) || 0), 0);
			return { movie, score: genreScore + moodScore };
		})
		.filter((candidate) => candidate.score > 0)
		.sort((a, b) => b.score - a.score || a.movie.title.localeCompare(b.movie.title));

	return {
		profile: paragraphs.join("\n\n"),
		recommendations: candidates.slice(0, 3).map(({ movie }) => movie),
		preferredGenres: preferredGenres.slice(0, 3),
		preferredMoods: preferredMoods.slice(0, 3),
	};
}

function renderCatalogError() {
	elements.catalogStatus.textContent = "The collection could not be loaded";
	elements.resultsCount.textContent = "The movie collection is unavailable.";
	const retryMessage = '<p class="collection-message" role="alert">The film collection could not be loaded. Check your connection and try again.<br><button class="button button-outline" type="button" data-action="retry-catalog">Retry</button></p>';
	elements.featuredGrid.innerHTML = retryMessage;
	elements.movieGrid.innerHTML = retryMessage;
	elements.featuredGrid.setAttribute("aria-busy", "false");
	elements.movieGrid.setAttribute("aria-busy", "false");
	elements.movieGrid.classList.remove("hidden");
	elements.noResults.classList.add("hidden");
	elements.clearFilters.classList.add("hidden");
	elements.watchlistGrid.innerHTML = '<p class="collection-message" role="alert">Your saved films are still stored in this browser, but could not be displayed. Retry to reload the collection.</p>';
	elements.watchlistGrid.classList.remove("hidden");
	elements.watchlistGrid.setAttribute("aria-busy", "false");
	elements.watchlistEmpty.classList.add("hidden");
}

async function loadCatalog() {
	elements.catalogStatus.textContent = "Loading the film collection...";
	elements.resultsCount.textContent = "Finding your next film...";
	elements.featuredGrid.setAttribute("aria-busy", "true");
	elements.movieGrid.setAttribute("aria-busy", "true");
	elements.watchlistGrid.setAttribute("aria-busy", "true");
	try {
		const response = await fetch(MOVIES_URL);
		if (!response.ok) throw new Error(`Catalog request failed: ${response.status}`);
		const movies = await response.json();
		if (!Array.isArray(movies)) throw new Error("Movie catalog must be a JSON array.");
		state.movies = movies.filter((movie) => movie && movie.id && movie.title);
		state.searchIndex = new Map(state.movies.map((movie) => [
			movie.id,
			[movie.title, movie.director, movie.description, ...(movie.genres || []), ...(movie.moods || [])]
				.join(" ").toLocaleLowerCase(),
		]));
		renderHero();
		renderFeatured();
		renderGenreFilters();
		renderMovies();
		renderWatchlist();
	} catch (error) {
		console.error("Unable to load the movie catalog.", error);
		renderCatalogError();
	}
}

elements.genreFilters.addEventListener("click", (event) => {
	const button = event.target.closest("[data-genre]");
	if (!button) return;
	state.activeGenre = button.dataset.genre;
	elements.genreFilters.querySelectorAll("[data-genre]").forEach((chip) => {
		chip.setAttribute("aria-pressed", String(chip === button));
	});
	renderMovies();
});

elements.movieSearch.addEventListener("input", (event) => {
	state.searchTerm = event.target.value;
	renderMovies();
});

elements.moodFilter.addEventListener("change", (event) => {
	state.activeMood = event.target.value;
	renderMovies();
});

document.getElementById("clear-filters").addEventListener("click", () => {
	state.activeGenre = "All";
	state.activeMood = "";
	state.searchTerm = "";
	elements.movieSearch.value = "";
	elements.moodFilter.value = "";
	elements.genreFilters.querySelectorAll("[data-genre]").forEach((chip) => {
		chip.setAttribute("aria-pressed", String(chip.dataset.genre === "All"));
	});
	renderMovies();
});

document.body.addEventListener("click", (event) => {
	const action = event.target.closest("[data-action]");
	if (!action) return;
	const { id } = action.dataset;
	if (action.dataset.action === "details") openMovieDetails(id);
	if (action.dataset.action === "toggle") toggleWatchlist(id);
	if (action.dataset.action === "remove") toggleWatchlist(id, true);
	if (action.dataset.action === "retry-catalog") loadCatalog();
});

elements.heroFilmDetails.addEventListener("click", () => openMovieDetails(elements.heroFilmDetails.dataset.id));
document.getElementById("dialog-close").addEventListener("click", closeMovieDetails);
elements.movieDialog.addEventListener("close", () => document.body.classList.remove("dialog-open"));
elements.movieDialog.addEventListener("click", (event) => {
	if (event.target === elements.movieDialog) closeMovieDetails();
});

elements.menuToggle.addEventListener("click", () => {
	const isExpanded = elements.menuToggle.getAttribute("aria-expanded") === "true";
	elements.menuToggle.setAttribute("aria-expanded", String(!isExpanded));
	elements.menuToggle.setAttribute("aria-label", isExpanded ? "Open navigation" : "Close navigation");
	elements.primaryNav.classList.toggle("is-open", !isExpanded);
});

elements.primaryNav.addEventListener("click", (event) => {
	if (!event.target.closest("a")) return;
	elements.primaryNav.classList.remove("is-open");
	elements.menuToggle.setAttribute("aria-expanded", "false");
	elements.menuToggle.setAttribute("aria-label", "Open navigation");
});

document.addEventListener("keydown", (event) => {
	if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
		event.preventDefault();
		elements.movieSearch.focus();
	}
});

elements.reviewForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const movie = document.getElementById("review-movie").value.trim();
	const reviewType = document.getElementById("review-type").value;
	if (!movie) {
		elements.reviewResult.className = "output-placeholder is-error";
		elements.reviewResult.innerHTML = '<span class="output-symbol" aria-hidden="true">!</span><p class="eyebrow">ONE SMALL THING</p><h3>Add a film title to begin.</h3><p>Your review workspace is ready when you are.</p>';
		document.getElementById("review-movie").focus();
		return;
	}

	const submitButton = elements.reviewForm.querySelector('button[type="submit"]');
	const originalButtonText = submitButton.innerHTML;
	submitButton.disabled = true;
	elements.reviewOutput.setAttribute("aria-busy", "true");
	elements.reviewOutput.classList.add("is-loading");
	elements.reviewResult.className = "output-placeholder";
	elements.reviewResult.innerHTML = '<div class="loading-mark" aria-hidden="true"></div><p class="eyebrow">SETTING THE SCENE</p><h3>Writing your review...</h3><p>Gathering a thoughtful perspective on your film.</p>';

	try {
		const data = await postJson("/api/review", { movie, review_type: reviewType });
		elements.reviewResult.innerHTML = `
			<p class="eyebrow">${escapeHtml(reviewType.replaceAll("-", " ").toUpperCase())}</p>
			<h3>${escapeHtml(data.movie || movie)}</h3>
			<p class="review-body">${escapeHtml(data.review || "No review was returned.")}</p>`;
	} catch (error) {
		elements.reviewResult.className = "output-placeholder is-error";
		const message = [502, 503].includes(error.status)
			? "Gemini is unavailable while its connection is pending. No review was generated; try again when the service is ready."
			: error.message;
		elements.reviewResult.innerHTML = `
			<span class="output-symbol" aria-hidden="true">!</span>
			<p class="eyebrow">REVIEW UNAVAILABLE</p>
			<h3>We couldn't complete that review.</h3>
			<p>${escapeHtml(message)}</p>`;
	} finally {
		elements.reviewOutput.setAttribute("aria-busy", "false");
		elements.reviewOutput.classList.remove("is-loading");
		submitButton.disabled = false;
		submitButton.innerHTML = originalButtonText;
	}
});

elements.tasteForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	const genres = [...elements.tasteForm.querySelectorAll('input[name="favorite-genre"]:checked')].map((input) => input.value);
	const moods = [...elements.tasteForm.querySelectorAll('input[name="favorite-mood"]:checked')].map((input) => input.value);
	const favoriteMovie = document.getElementById("favorite-movie").value.trim();
	const storytellingStyle = document.getElementById("story-style").value;
	const savedMovies = readWatchlist().map(movieById).filter(Boolean);
	if (!genres.length && !moods.length && !savedMovies.length && !favoriteMovie) {
		elements.tasteMessage.textContent = "Choose a genre or mood, name a favourite, or save a film first.";
		elements.tasteMessage.classList.add("is-error");
		elements.tasteResult.classList.add("hidden");
		return;
	}

	const result = buildLocalTasteProfile(genres, moods, favoriteMovie, storytellingStyle);
	elements.tasteMessage.textContent = "Generated locally from your choices and saved films.";
	elements.tasteMessage.classList.remove("is-error");
	const recommendationMarkup = result.recommendations.length
		? `<div class="taste-recommendations"><p class="eyebrow">A FEW FROM THE COLLECTION</p>${result.recommendations.map((movie) => `
			<button class="taste-recommendation" type="button" data-action="details" data-id="${escapeHtml(movie.id)}">${escapeHtml(movie.title)} <span>${escapeHtml(movie.year)} ↗</span></button>`).join("")}</div>`
		: '<p class="taste-no-recommendations">No unwatched matches in this collection yet. Try another mood or genre.</p>';
	const tags = [...new Set([...result.preferredGenres, ...result.preferredMoods.map((mood) => mood.replaceAll("-", " "))])];
	const profileHeading = genres.length || moods.length
		? "A profile shaped by your choices."
		: savedMovies.length
			? "A profile shaped by your watchlist."
			: "A profile shaped by your favourite film.";
	elements.tasteResult.innerHTML = `
		<p class="eyebrow">YOUR CURRENT FILM DNA</p>
		<h3>${profileHeading}</h3>
		<p class="taste-profile-copy">${escapeHtml(result.profile)}</p>
		<div class="taste-tags">${tags.map((tag) => `<span>${escapeHtml(tag)}</span>`).join("")}</div>
		${recommendationMarkup}`;
	elements.tasteResult.classList.remove("hidden");
});

window.addEventListener("storage", (event) => {
	if (event.key !== WATCHLIST_KEY && event.key !== null) return;
	renderFeatured();
	renderMovies();
	renderWatchlist();
	if (!elements.tasteResult.classList.contains("hidden")) {
		elements.tasteMessage.textContent = "Your watchlist changed in another tab. Generate your profile again to refresh it.";
	}
});

loadCatalog();
renderWatchlist();
