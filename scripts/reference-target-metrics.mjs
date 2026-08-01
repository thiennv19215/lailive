import { Buffer } from 'node:buffer';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

const endpoint = process.env.REFERENCE_CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
const targetPath = process.env.REFERENCE_TARGET_PATH;
const command = process.argv[2] ?? 'metrics';
const argument = process.argv[3];
const argument2 = process.argv[4];

if (!targetPath) throw new Error('REFERENCE_TARGET_PATH is required.');

const targets = await fetch(`${endpoint}/json/list`).then((response) => response.json());
const target = targets.find((candidate) => candidate.type === 'page' && candidate.url.includes(targetPath));

if (!target?.webSocketDebuggerUrl) {
  throw new Error(`Reference target was not found for path: ${targetPath}`);
}

const socket = new globalThis.WebSocket(target.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', () => reject(new Error('Could not connect to the target CDP socket.')), {
    once: true,
  });
});

let sequence = 0;
function send(method, params = {}) {
  const id = ++sequence;

  return new Promise((resolve, reject) => {
    const timeout = globalThis.setTimeout(() => {
      socket.removeEventListener('message', onMessage);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 5_000);
    const onMessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (message.id !== id) return;
      globalThis.clearTimeout(timeout);
      socket.removeEventListener('message', onMessage);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    };

    socket.addEventListener('message', onMessage);
    socket.send(JSON.stringify({ id, method, params }));
  });
}

async function run() {
  try {
    if (command === 'screenshot') {
    if (!argument) throw new Error('screenshot requires an output path.');
    const match = argument2?.match(/^(\d{3,4})x(\d{3,4})$/);
    if (!match) throw new Error('screenshot requires dimensions such as 1240x670.');
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 320 || width > 2560 || height < 480 || height > 2560) {
      throw new Error('Screenshot dimensions are outside the safe audit range.');
    }

    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 1.25,
      mobile: false,
      screenWidth: width,
      screenHeight: height,
    });
    try {
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        fromSurface: true,
        captureBeyondViewport: false,
      });
      const outputPath = path.resolve(argument);
      await writeFile(outputPath, Buffer.from(result.data, 'base64'));
      console.log(JSON.stringify({ outputPath, width, height, deviceScaleFactor: 1.25 }, null, 2));
    } finally {
      await send('Emulation.clearDeviceMetricsOverride');
    }
      process.exitCode = 0;
      return;
    }

    const expression = `JSON.stringify({
    title: document.title,
    url: location.href,
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    devicePixelRatio,
    bodyClientWidth: document.body.clientWidth,
    bodyClientHeight: document.body.clientHeight,
    bodyScrollWidth: document.body.scrollWidth,
    bodyScrollHeight: document.body.scrollHeight
  })`;
    const result = await send('Runtime.evaluate', { expression, returnByValue: true });
    const value = result.result?.value;
    if (typeof value !== 'string') throw new Error('Target metrics did not return JSON.');
    console.log(JSON.stringify(JSON.parse(value), null, 2));
  } finally {
    socket.close();
  }
}

await run();
