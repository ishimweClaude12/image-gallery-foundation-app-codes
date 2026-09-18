import { test } from 'node:test';
import assert from 'node:assert';
import { createApp } from '../src/app.js';

// These tests exercise the routes that do not depend on S3 or the database,
// so they run in CI without any AWS resources.

test('GET /health returns ok', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.status, 'ok');
  } finally {
    server.close();
  }
});

test('POST /api/photos without a file returns 400', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/photos`, { method: 'POST' });
    assert.strictEqual(res.status, 400);
  } finally {
    server.close();
  }
});

test('GET / serves the gallery page', async () => {
  const app = createApp();
  const server = app.listen(0);
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.strictEqual(res.status, 200);
    const html = await res.text();
    assert.ok(html.includes('Kivu Gallery'));
  } finally {
    server.close();
  }
});
