#!/usr/bin/env node
/**
 * GoodbyeYT — Instance Updater
 * Автоматически находит рабочие Piped и Cobalt инстансы
 * Запускается через GitHub Actions каждые 24 часа
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const INSTANCES_FILE = path.join(__dirname, '../../data/instances.json');
const TIMEOUT = 6000;

// Официальные источники списков инстансов
const INSTANCE_SOURCES = {
  piped: [
    'https://piped-instances.kavin.rocks/',         // официальный список Piped
    'https://raw.githubusercontent.com/TeamPiped/piped-uptime/master/README.md',
  ],
  cobalt: [
    'https://instances.cobalt.tools/instances.json',  // официальный список Cobalt
  ]
};

// Известные надёжные инстансы для бутстрапа
const BOOTSTRAP_INSTANCES = {
  piped: [
    'https://pipedapi.kavin.rocks',
    'https://piped-api.garudalinux.org',
    'https://api.piped.yt',
    'https://piped.video/api',
    'https://pipedapi.adminforge.de',
    'https://piped-api.privacy.com.de',
    'https://pipedapi.darkness.services',
    'https://piped.lunar.icu/api',
    'https://api.piped.projectsegfau.lt',
    'https://piped-api.codespanish.com',
    'https://pipedapi.leptons.xyz',
    'https://piped.syncapod.com/api',
    'https://pipedapi.drgns.space',
    'https://piped-api.hostux.net',
    'https://piped.yt/api',
    'https://pipedapi.tokhmi.xyz',
    'https://pipedapi.moomoo.me',
    'https://eu-piped.moomoo.me/api',
    'https://piped.ggtyler.dev/api',
    'https://piped.moomoo.me/api',
  ],
  cobalt: [
    'https://co.wuk.sh',
    'https://cobalt.api.lostrechka.net',
    'https://coapi.erzberger.dev',
    'https://cobalt.catgirl.land',
    'https://dl.thjread.dev',
    'https://cobalt-api.ayo.tf',
  ]
};

async function checkPipedInstance(url) {
  try {
    const start = Date.now();
    const resp = await axios.get(`${url}/healthcheck`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-InstanceChecker/1.0' }
    });
    const latency = Date.now() - start;
    if (resp.status === 200) {
      return { url, latency, healthy: true };
    }
    return null;
  } catch {
    // Попробуем другой endpoint если /healthcheck не работает
    try {
      const start = Date.now();
      const resp = await axios.get(`${url}/trending?region=US`, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': 'GoodbyeYT-InstanceChecker/1.0' }
      });
      const latency = Date.now() - start;
      if (resp.status === 200 && Array.isArray(resp.data)) {
        return { url, latency, healthy: true };
      }
    } catch {}
    return null;
  }
}

async function checkCobaltInstance(url) {
  try {
    const start = Date.now();
    const resp = await axios.get(`${url}/api/serverInfo`, {
      timeout: TIMEOUT,
      headers: { 'User-Agent': 'GoodbyeYT-InstanceChecker/1.0' }
    });
    const latency = Date.now() - start;
    if (resp.status === 200 && resp.data) {
      return { url, latency, healthy: true };
    }
    return null;
  } catch {
    return null;
  }
}

async function fetchOfficialPipedInstances() {
  try {
    const resp = await axios.get('https://piped-instances.kavin.rocks/', {
      timeout: 10000,
      headers: { 'Accept': 'application/json', 'User-Agent': 'GoodbyeYT-InstanceChecker/1.0' }
    });
    if (Array.isArray(resp.data)) {
      return resp.data
        .filter(i => i.api_url)
        .map(i => i.api_url.replace(/\/$/, ''));
    }
  } catch (e) {
    console.log('⚠️  Не удалось получить официальный список Piped, используем bootstrap');
  }
  return [];
}

async function fetchOfficialCobaltInstances() {
  try {
    const resp = await axios.get('https://instances.cobalt.tools/instances.json', {
      timeout: 10000,
      headers: { 'User-Agent': 'GoodbyeYT-InstanceChecker/1.0' }
    });
    if (Array.isArray(resp.data)) {
      return resp.data
        .filter(i => i.api && i.api.url)
        .map(i => i.api.url.replace(/\/$/, ''));
    }
  } catch (e) {
    console.log('⚠️  Не удалось получить официальный список Cobalt, используем bootstrap');
  }
  return [];
}

async function updateInstances() {
  console.log('🔍 GoodbyeYT Instance Updater запущен...');
  console.log(`📅 ${new Date().toISOString()}\n`);

  // Получаем официальные списки
  console.log('📡 Загружаем официальные списки инстансов...');
  const [officialPiped, officialCobalt] = await Promise.all([
    fetchOfficialPipedInstances(),
    fetchOfficialCobaltInstances()
  ]);

  // Объединяем с bootstrap
  const allPiped = [...new Set([...officialPiped, ...BOOTSTRAP_INSTANCES.piped])];
  const allCobalt = [...new Set([...officialCobalt, ...BOOTSTRAP_INSTANCES.cobalt])];

  console.log(`📋 Piped для проверки: ${allPiped.length} инстансов`);
  console.log(`📋 Cobalt для проверки: ${allCobalt.length} инстансов\n`);

  // Проверяем все параллельно
  console.log('⚡ Проверяем Piped инстансы...');
  const pipedResults = await Promise.all(allPiped.map(url => checkPipedInstance(url)));
  const workingPiped = pipedResults
    .filter(Boolean)
    .sort((a, b) => a.latency - b.latency);

  console.log(`✅ Рабочих Piped: ${workingPiped.length}/${allPiped.length}`);

  console.log('⚡ Проверяем Cobalt инстансы...');
  const cobaltResults = await Promise.all(allCobalt.map(url => checkCobaltInstance(url)));
  const workingCobalt = cobaltResults
    .filter(Boolean)
    .sort((a, b) => a.latency - b.latency);

  console.log(`✅ Рабочих Cobalt: ${workingCobalt.length}/${allCobalt.length}\n`);

  // Сохраняем результат
  const dataDir = path.dirname(INSTANCES_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const result = {
    updatedAt: new Date().toISOString(),
    piped: workingPiped.map(i => ({ url: i.url, latency: i.latency })),
    cobalt: workingCobalt.map(i => ({ url: i.url, latency: i.latency })),
    stats: {
      pipedTotal: allPiped.length,
      pipedWorking: workingPiped.length,
      cobaltTotal: allCobalt.length,
      cobaltWorking: workingCobalt.length,
    }
  };

  fs.writeFileSync(INSTANCES_FILE, JSON.stringify(result, null, 2));

  console.log('💾 Результаты сохранены в', INSTANCES_FILE);
  console.log('\n📊 Топ-5 Piped инстансов по скорости:');
  workingPiped.slice(0, 5).forEach((i, idx) => {
    console.log(`  ${idx + 1}. ${i.url} (${i.latency}ms)`);
  });

  if (workingPiped.length === 0) {
    console.error('\n❌ КРИТИЧНО: Нет рабочих Piped инстансов!');
    process.exit(1);
  }

  console.log('\n✨ Обновление завершено успешно!');
  return result;
}

// Запуск если вызван напрямую
if (require.main === module) {
  updateInstances().catch(err => {
    console.error('❌ Ошибка:', err.message);
    process.exit(1);
  });
}

module.exports = { updateInstances, checkPipedInstance, checkCobaltInstance };
