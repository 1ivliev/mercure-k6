import { browser } from 'k6/browser';
import { sleep } from 'k6';
import { Trend } from 'k6/metrics';

const mercure_latency = new Trend('mercure_latency');

export const options = {
  scenarios: {
    mercure_users: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        // Поднимаем уровень посетителей с 0 до требуемого за установленное время
        { duration: '20s', target: 10 },
        // Держим нагрузку установленное время
        { duration: '20s', target: 10 },
        // Скидываем нагрузку за установленное время
        { duration: '10s', target: 0 },
      ],
      options: { browser: { type: 'chromium' } },
    },
  },
  thresholds: {
    mercure_latency: ['p(95)<500'],
  },
};

const BASE_URL = ''
const MERCURE_URL = ''

export default async function () {
  const page = await browser.newPage();
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' });

  await page.evaluate((url) => {
    window.mercureEvents = [];
    const evtSource = new EventSource(url);

    evtSource.onmessage = (event) => {
      const now = Date.now();
      let sentAt = now;
      try {
        const data = JSON.parse(event.data || '{}');
        if (data.timestamp) sentAt = data.timestamp;
      } catch (e) {}
      window.mercureEvents.push({ data: event.data, latency: now - sentAt });
    };

    evtSource.onerror = (err) => console.error('Mercure error', err);

    window.mercure = evtSource;
  }, MERCURE_URL);

  await sleep(5);

  const events = await page.evaluate(() => window.mercureEvents || []);
  events.forEach((e) => {
    console.log(`Received Mercure event: ${e.data}, latency: ${e.latency}ms`);
    mercure_latency.add(e.latency);
  });

  await page.evaluate(() => {
    if (window.mercure) window.mercure.close();
  });

  await page.close();
}
