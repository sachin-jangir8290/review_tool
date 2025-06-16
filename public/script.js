async function fetchReviews() {
  const urlInput = document.getElementById("placeUrl");
  const reviewsContainer = document.getElementById("reviews-container");
  const url = urlInput.value.trim();

  if (!url) {
    alert("Please enter a Google Maps URL");
    return;
  }

  try {
    // Show loading state
    reviewsContainer.innerHTML = "<p>Loading reviews...</p>";

    // Fetch reviews from our Node.js backend
    const response = await fetch("/api/reviews", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      throw new Error("Failed to fetch reviews");
    }

    const data = await response.json();

    // Display reviews
    const reviews = data.reviews || [];
    if (reviews.length === 0) {
      reviewsContainer.innerHTML = "<p>No reviews found</p>";
      return;
    }

    // Add overall rating information
    const overallRating = data.rating || 0;
    const totalRatings = data.user_ratings_total || 0;

    let html = `
            <div class="overall-rating">
                <h2>Overall Rating: ${overallRating.toFixed(1)} ★</h2>
                <p>Total Reviews: ${totalRatings}</p>
            </div>
        `;

    html += reviews
      .map((review) => {
        // Format the date
        const reviewDate = new Date(review.time);
        const formattedDate = reviewDate.toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        });

        return `
                <div class="review-card">
                    <div class="review-header">
                        <img src="${review.profile_photo_url}" alt="${
          review.author_name
        }" class="reviewer-avatar">
                        <div class="reviewer-info">
                            <div class="reviewer-name">${
                              review.author_name
                            }</div>
                            <div class="review-date">${formattedDate}</div>
                        </div>
                    </div>
                    <div class="review-rating">
                        ${"★".repeat(review.rating)}${"☆".repeat(
          5 - review.rating
        )}
                    </div>
                    <div class="review-text">${review.text}</div>
                </div>
            `;
      })
      .join("");

    reviewsContainer.innerHTML = html;
  } catch (error) {
    console.error("Error:", error);
    reviewsContainer.innerHTML =
      "<p>Error fetching reviews. Please try again.</p>";
  }
}
