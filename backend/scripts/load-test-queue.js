#!/usr/bin/env node
/**
 * Load test: Simulate 15 concurrent image generation jobs via BullMQ
 * Usage: node scripts/load-test-queue.js [count]
 */

import 'dotenv/config';
import { initRedis, isRedisAvailable, closeRedis } from '../src/config/redis.js';
import { initQueues, getQueues, getQueueStatus } from '../src/services/jobQueue.js';

const JOB_COUNT = parseInt(process.argv[2] || '15');
const POLL_INTERVAL = 2000;

// Fake domains for testing
const fakeDomains = Array.from({ length: JOB_COUNT }, (_, i) => `loadtest${i + 1}.testdomain`);

// Real theme IDs from the themes index
const sampleThemes = [
  '01_restaurant', '02_coffee_shop', '03_bakery',
  '51_melting_clocks', '52_biolum_city', '53_floating_islands',
  '151_crimson_moon', '152_clockwork_birds', '153_cyber_orchid',
  'sp_01_nebula_nursery', 'sp_02_black_hole_horizon', 'sp_03_lunar_colony',
  '01_magical_girl', '02_mecha_pilot', '03_isekai_hero',
];

async function main() {
  console.log(`\n=== Load Test: ${JOB_COUNT} concurrent image generation jobs ===\n`);

  // Init Redis
  await initRedis();
  if (!isRedisAvailable()) {
    console.error('Redis not available!');
    process.exit(1);
  }
  console.log('Redis connected');

  // Init queues
  initQueues();
  console.log('Queues initialized\n');

  const queue = getQueues()['image-generation'];
  if (!queue) {
    console.error('image-generation queue not found!');
    process.exit(1);
  }

  // Enqueue all jobs at once
  console.log(`Enqueueing ${JOB_COUNT} jobs simultaneously...`);
  const startTime = Date.now();

  const jobs = await Promise.all(
    fakeDomains.map((domain, i) => {
      const themes = [];
      for (let t = 0; t < 5; t++) {
        themes.push(sampleThemes[(i * 5 + t) % sampleThemes.length]);
      }
      return queue.add('image-generation', {
        type: 'parallel',
        domain,
        themeIds: themes,
        customPrompt: null,
        artStyle: null,
        options: { skipWatermark: true },
      }, {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        timeout: 300000,
      });
    })
  );

  console.log(`All ${JOB_COUNT} jobs enqueued in ${Date.now() - startTime}ms`);
  console.log(`Job IDs: ${jobs.map(j => j.id).join(', ')}\n`);

  // Poll until all complete
  const jobIds = new Set(jobs.map(j => j.id));
  const completed = new Set();
  const failed = new Set();

  console.log('Waiting for jobs to complete...\n');

  while (completed.size + failed.size < JOB_COUNT) {
    const status = await getQueueStatus();
    const qs = status['image-generation'] || {};

    // Check individual jobs
    for (const job of jobs) {
      if (completed.has(job.id) || failed.has(job.id)) continue;
      const state = await job.getState();
      if (state === 'completed') {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${elapsed}s] Job ${job.id} (${job.data.domain}) COMPLETED`);
        completed.add(job.id);
      } else if (state === 'failed') {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`  [${elapsed}s] Job ${job.id} (${job.data.domain}) FAILED: ${job.failedReason}`);
        failed.add(job.id);
      }
    }

    const done = completed.size + failed.size;
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  [${elapsed}s] Progress: ${done}/${JOB_COUNT} done | Queue: waiting=${qs.waiting || 0} active=${qs.active || 0}    `);

    if (done < JOB_COUNT) {
      await new Promise(r => setTimeout(r, POLL_INTERVAL));
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n\n=== Results ===`);
  console.log(`Total time: ${totalTime}s`);
  console.log(`Completed: ${completed.size}`);
  console.log(`Failed: ${failed.size}`);
  console.log(`Avg per job: ${(parseFloat(totalTime) / JOB_COUNT).toFixed(1)}s`);
  console.log(`Throughput: ${(JOB_COUNT / parseFloat(totalTime) * 60).toFixed(1)} jobs/min\n`);

  await closeRedis();
  process.exit(0);
}

main().catch(err => {
  console.error('Load test error:', err);
  process.exit(1);
});
