/**
 * GoodbyeYT — Stream Proxy
 * Проксируем стримы через Piped инстанс (обходим блокировки)
 */

const express = require('express');
const axios = require('axios');
const { getBestPipedInstance } = require('../utils/instanceManager');

const router = express.Router();

// Прокси для видео/аудио стримов
router.get('/proxy', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({ error: 'URL не указан' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    // Только разрешённые домены
    const allowed = [
      'googlevideo.com',
      'youtube.com',
      'ytimg.com',
      'piped',
      'pipedapi',
    ];

    const isAllowed = allowed.some(d => decodedUrl.includes(d));
    if (!isAllowed) {
      return res.status(403).json({ error: 'Домен не разрешён' });
    }

    const range = req.headers.range;
    const headers = {
      'User-Agent': 'Mozilla/5.0 (compatible; GoodbyeYT/1.0)',
      ...(range ? { Range: range } : {}),
    };

    const upstream = await axios({
      method: 'GET',
      url: decodedUrl,
      headers,
      responseType: 'stream',
      timeout: 30000,
    });

    const status = range ? 206 : upstream.status;
    res.status(status);
    res.set('Content-Type', upstream.headers['content-type'] || 'video/mp4');
    res.set('Accept-Ranges', 'bytes');
    if (upstream.headers['content-length']) {
      res.set('Content-Length', upstream.headers['content-length']);
    }
    if (upstream.headers['content-range']) {
      res.set('Content-Range', upstream.headers['content-range']);
    }

    upstream.data.pipe(res);
  } catch (err) {
    console.error('Stream proxy error:', err.message);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Не удалось загрузить поток' });
    }
  }
});

// Получить стримы для видео напрямую через Piped
router.get('/sources/:videoId', async (req, res) => {
  const { videoId } = req.params;

  try {
    const pipedBase = await getBestPipedInstance();
    const resp = await axios.get(`${pipedBase}/streams/${videoId}`, {
      timeout: 8000,
      headers: { 'User-Agent': 'GoodbyeYT/1.0' }
    });

    const data = resp.data;

    // Возвращаем только что нужно плееру
    res.json({
      hls: data.hls,
      dash: data.dash,
      liveStream: data.liveStream,
      videoStreams: (data.videoStreams || []).map(s => ({
        url: s.url,
        quality: s.quality,
        fps: s.fps,
        mimeType: s.mimeType,
        videoOnly: s.videoOnly,
        codec: s.codec,
      })),
      audioStreams: (data.audioStreams || []).map(s => ({
        url: s.url,
        quality: s.quality,
        bitrate: s.bitrate,
        mimeType: s.mimeType,
      })),
      subtitles: data.subtitles || [],
    });
  } catch (err) {
    console.error(`Stream sources error for ${videoId}:`, err.message);
    res.status(502).json({ error: 'Не удалось получить источники видео' });
  }
});

module.exports = router;
