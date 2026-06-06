    const COUNTRIES = window.COUNTRIES;
    const TOTAL = COUNTRIES.length;
    const guessed = new Set();
    let current = null;
    let lastIndex = -1;
    let streak = 0;
    let attempts = 0;
    let correctAnswers = 0;
    let flagSelectionToken = 0;

    const flagWrap = document.getElementById("flagWrap");
    const counter = document.getElementById("counter");
    const remaining = document.getElementById("remaining");
    const streakStat = document.getElementById("streakStat");
    const accuracyStat = document.getElementById("accuracyStat");
    const progressText = document.getElementById("progressText");
    const statusPill = document.getElementById("statusPill");
    const progressFill = document.getElementById("progressFill");
    const feedback = document.getElementById("feedback");
    const guessedBody = document.getElementById("guessedBody");
    const guessForm = document.getElementById("guessForm");
    const guessInput = document.getElementById("guessInput");
    const hintButton = document.getElementById("hintButton");
    const skipButton = document.getElementById("skipButton");
    const resetButton = document.getElementById("resetButton");
    const CONTINENT_ORDER = ["Africa","Asia","Europe","North America","Oceania","South America"];
    const flagCache = new Map();

    function setControlsEnabled(enabled) {
      guessInput.disabled = !enabled;
      hintButton.disabled = !enabled;
      skipButton.disabled = !enabled;
    }

    function preloadFlag(country) {
      if (flagCache.has(country.src)) {
        return flagCache.get(country.src);
      }

      const promise = new Promise((resolve) => {
        const image = new Image();
        image.decoding = "async";
        image.loading = "eager";
        image.onload = async () => {
          try {
            if (image.decode) await image.decode();
          } catch {
            // The image is still usable if decode() rejects after onload.
          }
          resolve(image);
        };
        image.onerror = () => resolve(null);
        image.src = country.src;
      });

      flagCache.set(country.src, promise);
      return promise;
    }

    function warmFlagCache() {
      const queue = [...COUNTRIES];
      let cursor = 0;
      let loaded = 0;
      const workerCount = Math.min(10, queue.length);

      async function worker() {
        while (cursor < queue.length) {
          const country = queue[cursor++];
          await preloadFlag(country);
          loaded += 1;
          if (statusPill && loaded % 24 === 0) {
            statusPill.textContent = loaded + " / " + TOTAL + " flags cached";
          }
        }
      }

      Promise.all(Array.from({ length: workerCount }, worker)).then(() => {
        if (statusPill && current) statusPill.textContent = "Flags cached";
      });
    }

    function normalize(value) {
      return String(value)
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/\b(st|saint)\./g, " saint ")
        .replace(/[^a-z0-9]+/g, " ")
        .replace(/\b(the|republic|state|kingdom|federal|democratic|people|peoples|islamic|commonwealth|plurinational|bolivarian|united|of|and)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    }

    function aliasesFor(country) {
      const values = [country.name, country.code, ...country.aliases];
      return new Set(values.map(normalize).filter(Boolean));
    }

    function fullNameFor(country) {
      return normalize(country.name);
    }

    function setFeedback(text, type = "") {
      feedback.textContent = text;
      feedback.className = "feedback" + (type ? " " + type : "");
    }

    async function pickNext() {
      const token = ++flagSelectionToken;
      const available = COUNTRIES
        .map((country, index) => ({ country, index }))
        .filter(({ country }) => !guessed.has(country.name));

      if (!available.length) {
        current = null;
        flagWrap.innerHTML = "";
        flagWrap.setAttribute("aria-label", "All countries complete");
        setControlsEnabled(false);
        if (statusPill) statusPill.textContent = "World complete";
        setFeedback("Complete. All 196 countries have been guessed.", "good");
        return;
      }

      let choice = available[Math.floor(Math.random() * available.length)];
      if (available.length > 1) {
        while (choice.index === lastIndex) {
          choice = available[Math.floor(Math.random() * available.length)];
        }
      }
      const nextCountry = choice.country;
      setControlsEnabled(false);
      if (statusPill) statusPill.textContent = "Loading flag...";

      const loadedImage = await preloadFlag(nextCountry);
      if (token !== flagSelectionToken) return;

      current = nextCountry;
      lastIndex = choice.index;
      flagWrap.classList.remove("is-changing");
      void flagWrap.offsetWidth;
      flagWrap.classList.add("is-changing");
      flagWrap.innerHTML = '<img class="flag-image" src="' + current.src + '" alt="Flag to guess">';
      flagWrap.setAttribute("aria-label", "Flag to guess");
      if (statusPill) statusPill.textContent = loadedImage ? "Mystery flag selected" : "Flag selected";
      setControlsEnabled(true);
      guessInput.focus();
    }

    function compareByContinentThenName(a, b) {
      const continentDelta = CONTINENT_ORDER.indexOf(a.continent) - CONTINENT_ORDER.indexOf(b.continent);
      if (continentDelta !== 0) return continentDelta;
      return a.name.localeCompare(b.name);
    }

    function renderGuessed() {
      const guessedCountries = COUNTRIES
        .filter((country) => guessed.has(country.name))
        .sort(compareByContinentThenName);
      const continentSlots = [...COUNTRIES].sort(compareByContinentThenName);

      counter.textContent = guessedCountries.length + " / " + TOTAL;
      remaining.textContent = String(TOTAL - guessedCountries.length);
      if (progressText) progressText.textContent = guessedCountries.length + " guessed, " + (TOTAL - guessedCountries.length) + " still hidden";
      if (streakStat) streakStat.textContent = String(streak);
      if (accuracyStat) accuracyStat.textContent = attempts ? Math.round((correctAnswers / attempts) * 100) + "%" : "100%";
      if (progressFill) progressFill.style.width = ((guessedCountries.length / TOTAL) * 100).toFixed(1) + "%";

      let activeContinent = "";
      guessedBody.innerHTML = continentSlots
        .flatMap((country, index) => {
          const rows = [];
          if (country.continent !== activeContinent) {
            activeContinent = country.continent;
            const continentCountries = continentSlots.filter((item) => item.continent === activeContinent);
            const continentGuessed = continentCountries.filter((item) => guessed.has(item.name)).length;
            rows.push('<tr class="continent-row"><td colspan="3">' + activeContinent + '<span> - ' + continentGuessed + ' / ' + continentCountries.length + '</span></td></tr>');
          }

          if (!guessed.has(country.name)) {
            rows.push('<tr class="empty-slot"><td class="slot-number">' + (index + 1) + '</td><td aria-label="Blank country slot"></td><td aria-label="Blank code slot"></td></tr>');
            return rows;
          }

          rows.push('<tr><td class="slot-number">' + (index + 1) + '</td><td><span class="mini-flag" aria-hidden="true"><img src="' + country.src + '" alt=""></span>' + country.name + '</td><td>' + country.code + '</td></tr>');
          return rows;
        })
        .join("");
    }

    function checkGuess({ showWrong = false, fullNameOnly = false } = {}) {
      if (!current) return;

      const answer = normalize(guessInput.value);
      if (!answer) return;

      const accepted = aliasesFor(current);
      if ((fullNameOnly && answer === fullNameFor(current)) || (!fullNameOnly && accepted.has(answer))) {
        guessed.add(current.name);
        streak += 1;
        attempts += 1;
        correctAnswers += 1;
        guessInput.value = "";
        renderGuessed();
        setFeedback("Correct: " + current.name + ". Streak now " + streak + ".", "good");
        pickNext();
      } else if (showWrong) {
        attempts += 1;
        streak = 0;
        renderGuessed();
        setFeedback("Not quite. Streak reset, but the flag is still live.", "bad");
        guessInput.select();
      }
    }

    guessInput.addEventListener("input", () => {
      checkGuess({ fullNameOnly: true });
    });

    guessForm.addEventListener("submit", (event) => {
      event.preventDefault();
      checkGuess({ showWrong: true });
    });

    hintButton.addEventListener("click", () => {
      if (!current) return;
      if (statusPill) statusPill.textContent = "Hint unlocked";
      const letterCount = current.name.replace(/[^A-Za-z]/g, "").length;
      const wordCount = current.name.split(/\s+/).filter(Boolean).length;
      const wordLabel = wordCount === 1 ? "word" : "words";
      setFeedback("Hint: starts with " + current.name.charAt(0) + ", " + letterCount + " letters, " + wordCount + " " + wordLabel + ".");
    });

    skipButton.addEventListener("click", () => {
      streak = 0;
      renderGuessed();
      setFeedback("Skipped. Streak reset — new flag incoming.");
      pickNext();
    });

    resetButton.addEventListener("click", () => {
      guessed.clear();
      streak = 0;
      attempts = 0;
      correctAnswers = 0;
      guessInput.value = "";
      setControlsEnabled(true);
      renderGuessed();
      if (statusPill) statusPill.textContent = "Mystery flag selected";
      setFeedback("Game reset. Fresh flags, fresh glory.");
      pickNext();
    });

    if (TOTAL !== 196) {
      setFeedback("Dataset error: expected 196 countries, found " + TOTAL + ".", "bad");
    } else {
      renderGuessed();
      pickNext();
      warmFlagCache();
    }
