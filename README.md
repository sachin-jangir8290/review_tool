# Google Reviews Widget

A Node.js application that fetches and displays Google Reviews from a Google Maps URL.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file in the root directory and add your Google Places API key:

```
GOOGLE_PLACES_API_KEY=your_api_key_here
```

3. Start the server:

```bash
npm start
```

4. Open your browser and navigate to `http://localhost:3000`

## Usage

1. Enter a Google Maps URL in the input field
2. Click "Get Reviews" to fetch and display the reviews
3. The widget will show:
   - Overall rating
   - Total number of reviews
   - Individual reviews with:
     - Reviewer's profile photo
     - Reviewer's name
     - Review date
     - Star rating
     - Review text

## Requirements

- Node.js
- Google Places API key
- Internet connection

## Note

Make sure you have enabled the Places API in your Google Cloud Console and have a valid API key.
