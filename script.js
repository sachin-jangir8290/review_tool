// Replace 'YOUR_API_KEY' with your actual Google Places API key
const API_KEY = "YOUR_API_KEY";

function extractPlaceId(url) {
  try {
    // First try to extract from the data parameter
    const dataMatch = url.match(/data=!([^&]+)/);
    if (dataMatch) {
      const data = dataMatch[1];
      // The place ID is usually in the format after !4m
      const parts = data.split("!");
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].startsWith("1s")) {
          return parts[i].substring(2);
        }
      }
    }

    // If not found in data parameter, try the direct place ID format
    const placeMatch = url.match(/place\/[^\/]+\/([^\/]+)/);
    if (placeMatch) {
      return placeMatch[1];
    }

    return null;
  } catch (error) {
    console.error("Error extracting place ID:", error);
    return null;
  }
}

async function fetchReviews() {
  const urlInput = document.getElementById("placeUrl");
  const reviewsContainer = document.getElementById("reviews-container");
  const url = urlInput.value.trim();

  if (!url) {
    alert("Please enter a Google Maps URL");
    return;
  }

  const placeId = extractPlaceId(url);
  if (!placeId) {
    alert(
      "Could not extract place ID from the URL. Please make sure it's a valid Google Maps URL."
    );
    return;
  }

  try {
    // Show loading state
    reviewsContainer.innerHTML = "<p>Loading reviews...</p>";

    // Fetch place details using Places API
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=reviews,rating,user_ratings_total&key=${API_KEY}`
    );

    const data = await response.json();

    if (data.status !== "OK") {
      throw new Error(`Failed to fetch reviews: ${data.status}`);
    }

    // Display reviews
    const reviews = data.result.reviews || [];
    if (reviews.length === 0) {
      reviewsContainer.innerHTML = "<p>No reviews found</p>";
      return;
    }

    // Add overall rating information
    const overallRating = data.result.rating || 0;
    const totalRatings = data.result.user_ratings_total || 0;

    let html = `
      <div class="overall-rating">
        <h2>Overall Rating: ${overallRating.toFixed(1)} ★</h2>
        <p>Total Reviews: ${totalRatings}</p>
      </div>
    `;

    html += reviews
      .map(
        (review) => `
      <div class="review-card">
        <div class="review-header">
          <img src="${
            review.profile_photo_url
          }" alt="Reviewer" class="reviewer-avatar">
          <div>
            <div class="reviewer-name">${review.author_name}</div>
            <div class="review-date">${new Date(
              review.time * 1000
            ).toLocaleDateString()}</div>
          </div>
        </div>
        <div class="review-rating">
          ${"★".repeat(review.rating)}${"☆".repeat(5 - review.rating)}
        </div>
        <div class="review-text">${review.text}</div>
      </div>
    `
      )
      .join("");

    reviewsContainer.innerHTML = html;
  } catch (error) {
    console.error("Error:", error);
    reviewsContainer.innerHTML =
      "<p>Error fetching reviews. Please try again.</p>";
  }
}
