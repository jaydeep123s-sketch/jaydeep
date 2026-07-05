const express = require('express');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY; // optional — free tier at https://console.cloud.google.com

router.post('/', requireAuth, async (req, res) => {
  try {
    const { query } = req.body || {};
    const q = (query || '').trim().slice(0, 100);
    if (!q) return res.json({ videos: [] });

    // If a YouTube Data API key is configured, fetch real results (title + thumbnail + link).
    if (YOUTUBE_API_KEY) {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=3&q=${encodeURIComponent(
        q + ' devops tutorial'
      )}&key=${YOUTUBE_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (Array.isArray(data.items)) {
        const videos = data.items.map((item) => ({
          title: item.snippet.title,
          channel: item.snippet.channelTitle,
          thumbnail: item.snippet.thumbnails?.default?.url,
          url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        }));
        return res.json({ videos });
      }
    }

    // Fallback (no API key needed): a direct YouTube search link for the topic.
    return res.json({
      videos: [
        {
          title: `Search YouTube for "${q}"`,
          channel: 'YouTube',
          thumbnail: null,
          url: `https://www.youtube.com/results?search_query=${encodeURIComponent(q + ' devops tutorial')}`,
        },
      ],
    });
  } catch (err) {
    res.json({ videos: [] }); // never break the chat UI over a video-lookup failure
  }
});

module.exports = router;
