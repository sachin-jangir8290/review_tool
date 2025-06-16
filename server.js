const express = require("express");
const path = require("path");
const fs = require("fs").promises;
const { v4: uuidv4 } = require("uuid");

let puppeteer;
let chromium;

try {
  chromium = require("@sparticuz/chromium");
  puppeteer = require("puppeteer-core");
} catch (e) {
  puppeteer = require("puppeteer");
}

const app = express();
const port = process.env.PORT || 3001;

const CACHE_FILE = "reviews_cache.json";
const WIDGET_CONFIGS_FILE = "widget_configs.json";
const CACHE_LIFETIME = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const MIN_DELAY = 1000; // Minimum delay in ms
const MAX_DELAY = 3000; // Maximum delay in ms
const MAX_REVIEWS_TO_FETCH = 50; // Limit the number of reviews to fetch per scrape

// Serve static files
app.use(express.static("public"));
app.use(express.json());

// Function to generate random delay
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Function to read cache
async function readCache() {
  try {
    const data = await fs.readFile(CACHE_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {}; // Cache file does not exist, return empty object
    }
    console.error("Error reading cache file:", error.message);
    return {};
  }
}

// Function to write cache
async function writeCache(data) {
  try {
    await fs.writeFile(CACHE_FILE, JSON.stringify(data, null, 2), "utf8");
  } catch (error) {
    console.error("Error writing cache file:", error.message);
  }
}

// Function to read widget configurations
async function readWidgetConfigs() {
  try {
    const data = await fs.readFile(WIDGET_CONFIGS_FILE, "utf8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === "ENOENT") {
      return {}; // Configs file does not exist, return empty object
    }
    console.error("Error reading widget configs file:", error.message);
    return {};
  }
}

// Function to write widget configurations
async function writeWidgetConfigs(data) {
  try {
    await fs.writeFile(
      WIDGET_CONFIGS_FILE,
      JSON.stringify(data, null, 2),
      "utf8"
    );
  } catch (error) {
    console.error("Error writing widget configs file:", error.message);
  }
}

// Helper function to scroll and load more reviews
async function autoScroll(page, maxReviews) {
  await page.evaluate(async (maxReviews) => {
    const scrollableSection =
      document.querySelector(".m6QErb.DxyBCb.kA9KIf.dS8AEf") || // Main reviews container
      document.querySelector('[role="main"] > div:nth-child(2)"') || // Alternative main content area
      document.querySelector(".section-layout-root") || // Broader section root
      document.querySelector(".review-dialog-list"); // Specific dialog for reviews

    if (!scrollableSection) {
      console.error(
        "Could not find the scrollable reviews section in autoScroll."
      );
      return;
    }

    let lastHeight = scrollableSection.scrollHeight;
    let noChangeCount = 0;
    const maxNoChangeAttempts = 15; // Increased attempts to load more reviews
    let reviewsCount = 0;

    while (noChangeCount < maxNoChangeAttempts && reviewsCount < maxReviews) {
      scrollableSection.scrollTop = scrollableSection.scrollHeight; // Scroll to bottom
      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * (3000 - 1000) + 1000)
      ); // Random delay for scrolling

      let newHeight = scrollableSection.scrollHeight;
      let currentReviews = document.querySelectorAll(
        ".jftiEf.fontBodyMedium, .gws-localreviews__google-review"
      ).length;

      if (newHeight === lastHeight) {
        noChangeCount++;
      } else {
        noChangeCount = 0;
      }
      lastHeight = newHeight;
      reviewsCount = currentReviews; // Update reviews count
      console.log(
        `Scrolling: lastHeight=${lastHeight}, newHeight=${newHeight}, noChangeCount=${noChangeCount}, reviewsCount=${reviewsCount}`
      );
    }
  }, maxReviews);
}

// API endpoint to save widget configuration
app.post("/api/widgets/save", async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ error: "Name and URL are required" });
    }

    const configs = await readWidgetConfigs();
    const id = uuidv4(); // Generate a unique ID

    configs[id] = { name, url };
    await writeWidgetConfigs(configs);

    res.status(201).json({ id, name, url });
  } catch (error) {
    console.error("Error saving widget configuration:", error.message);
    res
      .status(500)
      .json({ error: "Failed to save widget configuration: " + error.message });
  }
});

// API endpoint to get widget URL by ID
app.get("/api/widgets/get-url/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const configs = await readWidgetConfigs();

    if (!configs[id]) {
      return res.status(404).json({ error: "Widget not found" });
    }

    res.json({ url: configs[id].url });
  } catch (error) {
    console.error("Error getting widget URL:", error.message);
    res
      .status(500)
      .json({ error: "Failed to retrieve widget URL: " + error.message });
  }
});

// API endpoint to get all widget configurations
app.get("/api/widgets", async (req, res) => {
  try {
    const configs = await readWidgetConfigs();
    // Convert object to array for easier consumption on frontend
    const widgetList = Object.keys(configs).map((id) => ({
      id,
      ...configs[id],
    }));
    res.json(widgetList);
  } catch (error) {
    console.error("Error getting all widgets:", error.message);
    res
      .status(500)
      .json({ error: "Failed to retrieve widgets: " + error.message });
  }
});

// API endpoint to fetch reviews
app.post("/api/reviews", async (req, res) => {
  let browser;
  try {
    const { url } = req.body;

    // Check cache first
    const cache = await readCache();
    if (cache[url] && Date.now() - cache[url].timestamp < CACHE_LIFETIME) {
      console.log("Serving reviews from cache for URL:", url);
      return res.json(cache[url].data);
    }

    // Add random delay before launching browser
    await new Promise((resolve) =>
      setTimeout(resolve, getRandomDelay(MIN_DELAY, MAX_DELAY))
    );

    // If not in cache or expired, proceed with scraping
    browser = await puppeteer.launch({
      executablePath: await chromium.executablePath(),
      args: chromium.args,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
    );

    console.log("Navigating to URL:", url);
    await page.goto(url, {
      waitUntil: "networkidle0",
      timeout: 90000, // Increased timeout for page navigation
    });

    // Add random delay after page navigation
    await new Promise((resolve) =>
      setTimeout(resolve, getRandomDelay(MIN_DELAY, MAX_DELAY))
    );

    console.log("Waiting for reviews section to load...");

    // Try to click on the reviews button first, if it exists and is not already on reviews
    try {
      const reviewsButton = await page.waitForSelector(
        "button[data-tab-index='1']",
        {
          timeout: 15000,
        }
      );
      // Check if the button is visible and active
      const isReviewsActive = await page.evaluate(
        (btn) => btn.getAttribute("aria-selected") === "true",
        reviewsButton
      );

      if (reviewsButton && !isReviewsActive) {
        console.log("Clicking on reviews tab...");
        await reviewsButton.click();
        await new Promise((resolve) =>
          setTimeout(resolve, getRandomDelay(MIN_DELAY, MAX_DELAY))
        ); // Random delay after click
      } else {
        console.log(
          "Reviews tab already active or button not found/clickable, proceeding to scrape."
        );
      }
    } catch (e) {
      console.warn(
        "Could not click on reviews tab or locate it, attempting to find reviews directly. Error:",
        e.message
      );
    }

    // Wait for at least one review element to be present after trying to navigate/click
    await page.waitForSelector(
      ".jftiEf.fontBodyMedium, .gws-localreviews__google-review",
      { timeout: 30000 }
    ); // Increased timeout and added more common review selectors

    // Add random delay before starting scroll
    await new Promise((resolve) =>
      setTimeout(resolve, getRandomDelay(MIN_DELAY, MAX_DELAY))
    );

    console.log("Starting auto-scroll to load all reviews...");
    await autoScroll(page, MAX_REVIEWS_TO_FETCH);

    // Extract reviews
    console.log("Extracting reviews...");
    const reviewsData = await page.evaluate(async (MAX_REVIEWS_TO_FETCH) => {
      // Revert to Google-specific selectors for review elements
      const reviewElements = document.querySelectorAll(
        ".jftiEf.fontBodyMedium, .gws-localreviews__google-review"
      );

      // First, click all 'More' buttons and wait for content to load
      for (const review of reviewElements) {
        const moreButton = review.querySelector("button.w8nwRe.kyuRq, .w8nwRe");
        if (moreButton) {
          moreButton.click();
          // Wait a bit for the text to expand
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }

      const uniqueReviews = new Map(); // Use a Map to store unique reviews, keyed by text

      Array.from(reviewElements).forEach((review) => {
        try {
          // Use more specific selectors for author name
          const authorElement = review.querySelector(
            ".d4r55, .TSUbDb, .section-review-title, .xYciQ, .WNxzHc, .jJcsV"
          );
          // Get the rating with more specific selector
          const ratingElement = review.querySelector(
            ".kvMYJc, .section-review-stars, .q0P1t.fontTitleSmall, .EBe2gf, .MyEned > div:nth-child(2) > span[aria-label], .F7nice"
          );
          // Get the review text with more specific selector to avoid duplicates
          const textElement = review.querySelector(
            ".wiI7pd, .section-review-text, .gws-localreviews__google-review-text, .Jtu6Td, .yIgCRd, .review-full-text, ._gj4l"
          );
          const timeElement = review.querySelector(
            ".rsqaWe, .section-review-publish-date, .dehC8, .pqsRP, .ioQyN, .eyb5Ce"
          );
          const profilePhotoElement = review.querySelector(
            "img.NBa7we, img.Qx7uS,.NBa7we, ._7QSPW, .lDY1rd, .RwYf6d img, .MvC4if img, img[src*='/a/'], img[data-photo-id], img[src*='googleusercontent.com'], .jgXp4c img"
          );

          // Convert relative time string to approximate timestamp
          const timeAgoText = timeElement ? timeElement.textContent.trim() : "";
          let timestamp = Date.now(); // Default to current time

          if (timeAgoText.includes("year")) {
            const years = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - years * 365 * 24 * 60 * 60 * 1000;
          } else if (timeAgoText.includes("month")) {
            const months = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - months * 30 * 24 * 60 * 60 * 1000;
          } else if (timeAgoText.includes("week")) {
            const weeks = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - weeks * 7 * 24 * 60 * 60 * 1000;
          } else if (timeAgoText.includes("day")) {
            const days = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - days * 24 * 60 * 60 * 1000;
          } else if (timeAgoText.includes("hour")) {
            const hours = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - hours * 60 * 60 * 1000;
          } else if (timeAgoText.includes("minute")) {
            const minutes = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - minutes * 60 * 1000;
          } else if (timeAgoText.includes("second")) {
            const seconds = parseInt(timeAgoText.split(" ")[0]);
            timestamp = Date.now() - seconds * 1000;
          } else {
            // Try to parse as a direct date string if not relative
            const parsedDate = new Date(timeAgoText);
            if (!isNaN(parsedDate.getTime())) {
              timestamp = parsedDate.getTime();
            }
          }

          // Extract author name with better handling
          let authorName = "Anonymous";
          if (authorElement) {
            const nameText = authorElement.textContent.trim();
            if (nameText && nameText !== "") {
              authorName = nameText.replace(/\s+/g, " ");
            }
          }

          const extractedReview = {
            author_name: authorName,
            rating: ratingElement
              ? parseInt(ratingElement.getAttribute("aria-label").split(" ")[0])
              : 0,
            text: textElement ? textElement.textContent.trim() : "",
            profile_photo_url: profilePhotoElement
              ? profilePhotoElement.src
              : "https://lh3.googleusercontent.com/a/default-user",
          };

          // Add review to map, prioritizing reviews with a real name over 'Anonymous'
          if (
            !uniqueReviews.has(extractedReview.text) ||
            uniqueReviews.get(extractedReview.text).author_name === "Anonymous"
          ) {
            uniqueReviews.set(extractedReview.text, extractedReview);
          }
        } catch (error) {
          console.error("Error processing review:", error.message);
        }
      });

      return Array.from(uniqueReviews.values()).slice(0, MAX_REVIEWS_TO_FETCH);
    }, MAX_REVIEWS_TO_FETCH);

    // Get overall rating
    const overallRating = await page.evaluate(() => {
      const ratingElement =
        document.querySelector(
          ".F7nice span[aria-hidden='true'] .fontDisplayLarge"
        ) ||
        document.querySelector(".PPCwl .fontDisplayLarge") ||
        document.querySelector("span.Aq14fc");
      return ratingElement ? parseFloat(ratingElement.textContent) : 0;
    });

    // Get total reviews count
    const totalReviews = await page.evaluate(() => {
      const reviewsElement =
        document.querySelector(".F7nice span:nth-child(2)") ||
        document.querySelector(".PPCwl .fontBodySmall") ||
        document.querySelector("span.z5jxId");
      return reviewsElement
        ? parseInt(reviewsElement.textContent.replace(/[^0-9]/g, ""))
        : 0;
    });

    if (!reviewsData || reviewsData.length === 0) {
      return res
        .status(404)
        .json({ error: "No reviews found or failed to extract reviews." });
    }

    console.log(
      `Found ${reviewsData.length} reviews out of ${totalReviews} total reviews`
    );

    // Save to cache
    cache[url] = {
      data: {
        reviews: reviewsData,
        rating: overallRating,
        user_ratings_total: totalReviews,
      },
      timestamp: Date.now(),
    };
    await writeCache(cache);

    res.json({
      reviews: reviewsData,
      rating: overallRating,
      user_ratings_total: totalReviews,
    });
  } catch (error) {
    console.error("Error during review fetching:", error.message);
    res
      .status(500)
      .json({ error: "Failed to fetch reviews: " + error.message });
  } finally {
    if (browser) {
      await browser.close();
    }
  }
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
