/**
 * GoodbyeYT — Instance Manager
 * Управляет пулом рабочих инстансов, автоматически переключается при сбое
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const NodeCache = require('node-cache');

const INSTANCES_FILE = path.join(__dirname, '../../data/instances.json');
const TIMEOUT = 5000;
const cache = new NodeCache({ stdTTL: 300 }); // кешируем на 5 минут

let currentPipedIndex = 0;
let currentCobaltIndex = 0;
let instancesData = null;

function loadInstances() {
  try {
    if (fs.existsSync(INSTANCES_FILE)) {
      const raw = fs.readFileSync(INSTANCES_FILE, 'utf8');
      instancesData = JSON.parse(raw);
      return instancesData;
    }
  } catch (e) {
    console.error('Ошибка загрузки instances.json:', e.message);
  }

  // Фоллбек — захардкоженные инстансы
  instancesData = {
    updatedAt: new Date().toISOString(),
    piped: [
      { url: 'https://pipedapi.kavin.rocks', latency: 200 },
      { url: 'https://piped-api.garudalinux.org', latency: 300 },
      { url: 'https://api.piped.yt', latency: 400 },
      { url: 'https://pipedapi.adminforge.de', latency: 350 },
      { url: 'https://piped-api.privacy.com.de', latency: 450 },
      { url: 'https://api.piped.projectsegfau.lt', latency: 500 },
    ],
    cobalt: [
      { url: 'https://co.wuk.sh', latency: 200 },
      { url: 'https://cobalt.catgirl.land', latency: 300 },
    ]
  };
  return instancesData;
}

function getInstances() {
  if (!instancesData) loadInstances();
  return instancesData;
}

async function getBestPipedInstance() {
  const cached = cache.get('best_piped');
  if (cached) return cached;

  const instances = getInstances();
  if (!instances.piped || instances.piped.length === 0) {
    throw new Error('Нет доступных Piped инстансов');
  }

  // Пробуем начиная с текущего индекса
  for (let i = 0; i < instances.piped.length; i++) {
    const idx = (currentPipedIndex + i) % instances.piped.length;
    const instance = instances.piped[idx];

    try {
      await axios.get(`${instance.url}/healthcheck`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT/1.0' }
      });
      currentPipedIndex = idx;
      cache.set('best_piped', instance.url);
      return instance.url;
    } catch {
      // Следующий инстанс
      console.log(`⚠️  Piped инстанс недоступен: ${instance.url}`);
    }
  }

  // Если все упали — вернём первый (возможно поднимется)
  return instances.piped[0].url;
}

async function getBestCobaltInstance() {
  const cached = cache.get('best_cobalt');
  if (cached) return cached;

  const instances = getInstances();
  if (!instances.cobalt || instances.cobalt.length === 0) return null;

  for (let i = 0; i < instances.cobalt.length; i++) {
    const idx = (currentCobaltIndex + i) % instances.cobalt.length;
    const instance = instances.cobalt[idx];

    try {
      await axios.get(`${instance.url}/api/serverInfo`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT/1.0' }
      });
      currentCobaltIndex = idx;
      cache.set('best_cobalt', instance.url);
      return instance.url;
    } catch {
      console.log(`⚠️  Cobalt инстанс недоступен: ${instance.url}`);
    }
  }
  return null;
}

function getInstancesStatus() {
  const instances = getInstances();
  return {
    updatedAt: instances.updatedAt,
    piped: {
      total: instances.piped?.length || 0,
      current: instances.piped?.[currentPipedIndex]?.url || null,
    },
    cobalt: {
      total: instances.cobalt?.length || 0,
      current: instances.cobalt?.[currentCobaltIndex]?.url || null,
    }
  };
}

function invalidateCache() {
  cache.flushAll();
  instancesData = null;
  currentPipedIndex = 0;
  currentCobaltIndex = 0;
}

module.exports = {
  loadInstances,
  getBestPipedInstance,
  getBestCobaltInstance,
  getInstancesStatus,
  invalidateCache,
};
