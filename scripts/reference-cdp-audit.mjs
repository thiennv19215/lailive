import path from 'node:path';
import { URL } from 'node:url';
import { chromium } from 'playwright-core';

/* global document */

const endpoint = process.env.REFERENCE_CDP_ENDPOINT ?? 'http://127.0.0.1:9223';
const targetPath = process.env.REFERENCE_TARGET_PATH ?? '/app.asar/dist/index.html';
const command = process.argv[2] ?? 'dump';
const argument = process.argv[3];
const argument2 = process.argv[4];
const browser = await chromium.connectOverCDP(endpoint);

try {
  const pages = browser.contexts().flatMap((context) => context.pages());
  const page = pages.find((candidate) => {
    const url = candidate.url();
    return url.includes('LivestreamAgent-1.4.0-win-setup-x64') && url.includes(targetPath);
  });
  if (!page) throw new Error('Reference renderer target was not found on the CDP endpoint.');

  if (command === 'dump') {
    const result = await page.evaluate(() => {
      const visible = (element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const controls = [...document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="tab"]')]
        .filter(visible)
        .slice(0, 250)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 180),
          ariaLabel: element.getAttribute('aria-label'),
          placeholder: element.getAttribute('placeholder'),
          type: element.getAttribute('type'),
          href: element.getAttribute('href'),
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
        }));
      const headings = [...document.querySelectorAll('h1, h2, h3, [role="heading"]')]
        .filter(visible)
        .slice(0, 80)
        .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '));
      const seen = new Set();
      const leafTexts = [...document.querySelectorAll('body *')]
        .filter(visible)
        .filter((element) => element.children.length === 0)
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' '),
          role: element.getAttribute('role'),
          className: typeof element.className === 'string' ? element.className.slice(0, 120) : '',
        }))
        .filter((item) => item.text.length > 0 && item.text.length <= 120)
        .filter((item) => !/\S+@\S+\.\S+/.test(item.text))
        .filter((item) => {
          if (seen.has(item.text)) return false;
          seen.add(item.text);
          return true;
        })
        .slice(0, 300);
      const pointerElements = [...document.querySelectorAll('body *')]
        .filter(visible)
        .filter((element) => globalThis.getComputedStyle(element).cursor === 'pointer')
        .map((element) => ({
          tag: element.tagName.toLowerCase(),
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 180),
          ariaLabel: element.getAttribute('aria-label'),
          className: typeof element.className === 'string' ? element.className.slice(0, 160) : '',
        }))
        .filter((item) => item.text || item.ariaLabel)
        .slice(0, 180);
      return { title: document.title, url: globalThis.location.href, headings, controls, leafTexts, pointerElements };
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'visible-errors') {
    const errors = await page.locator('.form-error, [role="alert"]').evaluateAll((elements) => elements
      .filter((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      })
      .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '))
      .filter(Boolean));
    console.log(JSON.stringify({ errors }, null, 2));
  } else if (command === 'click-text') {
    if (!argument) throw new Error('click-text requires exact visible text.');
    const locator = page.getByText(argument, { exact: true });
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one exact text match for "${argument}", found ${count}.`);
    await locator.click();
    await page.waitForTimeout(350);
    console.log(JSON.stringify({ clicked: argument, url: page.url() }));
  } else if (command === 'screenshot') {
    if (!argument) throw new Error('screenshot requires an output path.');
    const outputPath = path.resolve(argument);
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(outputPath);
  } else if (command === 'screenshot-viewport') {
    if (!argument) throw new Error('screenshot-viewport requires an output path.');
    const match = argument2?.match(/^(\d{3,4})x(\d{3,4})$/);
    if (!match) throw new Error('screenshot-viewport requires dimensions such as 390x844.');
    const width = Number(match[1]);
    const height = Number(match[2]);
    if (width < 320 || width > 2560 || height < 480 || height > 2560) {
      throw new Error('screenshot-viewport dimensions are outside the safe audit range.');
    }
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(500);
    const outputPath = path.resolve(argument);
    await page.screenshot({ path: outputPath, fullPage: false });
    console.log(JSON.stringify({ outputPath, width, height, url: page.url() }));
  } else if (command === 'press') {
    if (!argument) throw new Error('press requires a keyboard key.');
    await page.keyboard.press(argument);
    await page.waitForTimeout(250);
    console.log(JSON.stringify({ pressed: argument, url: page.url() }));
  } else if (command === 'click-selector') {
    if (!argument) throw new Error('click-selector requires a CSS selector.');
    const locator = page.locator(argument);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one selector match for "${argument}", found ${count}.`);
    await locator.click();
    await page.waitForTimeout(350);
    console.log(JSON.stringify({ clickedSelector: argument, url: page.url() }));
  } else if (command === 'fill-selector') {
    if (!argument) throw new Error('fill-selector requires a CSS selector.');
    if (argument2 === undefined) throw new Error('fill-selector requires a value.');
    const locator = page.locator(argument);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one selector match for "${argument}", found ${count}.`);
    await locator.fill(argument2);
    console.log(JSON.stringify({ filledSelector: argument, valueLength: argument2.length, url: page.url() }));
  } else if (command === 'form-state') {
    const state = await page.evaluate(() => ({
      forms: [...document.querySelectorAll('form')].map((form) => ({
        className: typeof form.className === 'string' ? form.className : '',
        valid: form.checkValidity(),
      })),
      inputs: [...document.querySelectorAll('input')].map((input) => ({
        type: input.type,
        placeholder: input.placeholder,
        required: input.required,
        disabled: input.disabled,
        checked: input.checked,
        valueLength: input.value.length,
        valid: input.checkValidity(),
        validationMessage: input.validationMessage,
        className: input.className,
      })),
      buttons: [...document.querySelectorAll('button')].map((button) => ({
        text: (button.textContent ?? '').trim().replace(/\s+/g, ' '),
        type: button.type,
        disabled: button.disabled,
        className: button.className,
      })),
    }));
    console.log(JSON.stringify(state, null, 2));
  } else if (command === 'probe-login-failure-ui') {
    const result = await page.evaluate(async () => {
      const userApi = globalThis.$mapi?.user;
      if (!userApi || typeof userApi.apiPost !== 'function') throw new Error('Reference user.apiPost bridge is unavailable.');
      const originalApiPost = userApi.apiPost;
      const snapshots = [];
      const capture = (label) => {
        const submit = document.querySelector('.form-submit');
        const visibleText = [...document.querySelectorAll('[role="alert"], .form-error, .arco-message, .arco-notification, [class*="error"]')]
          .filter((element) => {
            const style = globalThis.getComputedStyle(element);
            const rect = element.getBoundingClientRect();
            return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
          })
          .map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' '))
          .filter(Boolean);
        snapshots.push({
          label,
          buttonText: (submit?.textContent ?? '').trim().replace(/\s+/g, ' '),
          buttonDisabled: submit instanceof globalThis.HTMLButtonElement ? submit.disabled : null,
          visibleText,
          url: globalThis.location.href,
        });
      };
      try {
        userApi.apiPost = async () => { throw new Error('AUDIT_NETWORK_UNAVAILABLE'); };
        const email = document.querySelector('input[type="email"]');
        const password = document.querySelector('input[type="password"], input[placeholder="Nhập mật khẩu"]');
        if (!(email instanceof globalThis.HTMLInputElement) || !(password instanceof globalThis.HTMLInputElement)) {
          throw new Error('Reference login fields were not found.');
        }
        const setValue = (input, value) => {
          const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value')?.set;
          setter?.call(input, value);
          input.dispatchEvent(new globalThis.Event('input', { bubbles: true }));
          input.dispatchEvent(new globalThis.Event('change', { bubbles: true }));
        };
        setValue(email, 'phase1-audit@example.invalid');
        setValue(password, 'phase1-audit-password');
        capture('before');
        document.querySelector('.form-submit')?.click();
        capture('immediate');
        await new Promise((resolve) => globalThis.setTimeout(resolve, 100));
        capture('100ms');
        await new Promise((resolve) => globalThis.setTimeout(resolve, 900));
        capture('1000ms');
      } finally {
        userApi.apiPost = originalApiPost;
      }
      return snapshots;
    });
    console.log(JSON.stringify({ snapshots: result }, null, 2));
  } else if (command === 'goto-hash') {
    if (!argument?.startsWith('#/')) throw new Error('goto-hash requires a hash route starting with #/.');
    const target = new URL(page.url());
    target.hash = argument.slice(1);
    await page.goto(target.toString());
    await page.waitForTimeout(500);
    console.log(JSON.stringify({ navigated: argument, url: page.url() }));
  } else if (command === 'goto-standalone-page') {
    const allowedPages = new Set(['guide', 'feedback', 'log', 'monitor', 'payment', 'about', 'user', 'setup']);
    if (!argument || !allowedPages.has(argument)) throw new Error('goto-standalone-page requires an allowed page name.');
    const target = new URL(page.url());
    target.pathname = target.pathname.replace(/\/dist\/index\.html$/, `/dist/page/${argument}.html`);
    target.hash = '';
    await page.goto(target.toString());
    await page.waitForTimeout(800);
    console.log(JSON.stringify({ navigatedStandalone: argument, url: page.url() }));
  } else if (command === 'measure-selector') {
    if (!argument) throw new Error('measure-selector requires a CSS selector.');
    const locator = page.locator(argument);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one selector match for "${argument}", found ${count}.`);
    const measurement = await locator.evaluate((element) => {
      const style = globalThis.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName.toLowerCase(),
        className: typeof element.className === 'string' ? element.className : '',
        width: rect.width,
        height: rect.height,
        x: rect.x,
        y: rect.y,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        borderRadius: style.borderRadius,
        padding: style.padding,
        gap: style.gap,
      };
    });
    console.log(JSON.stringify({ selector: argument, measurement }, null, 2));
  } else if (command === 'window-metrics') {
    const metrics = await page.evaluate(() => ({
      innerWidth: globalThis.innerWidth,
      innerHeight: globalThis.innerHeight,
      outerWidth: globalThis.outerWidth,
      outerHeight: globalThis.outerHeight,
      devicePixelRatio: globalThis.devicePixelRatio,
      bodyClientWidth: document.body.clientWidth,
      bodyClientHeight: document.body.clientHeight,
      bodyScrollWidth: document.body.scrollWidth,
      bodyScrollHeight: document.body.scrollHeight,
    }));
    console.log(JSON.stringify({ url: page.url(), metrics }, null, 2));
  } else if (command === 'children-selector') {
    if (!argument) throw new Error('children-selector requires a CSS selector.');
    const locator = page.locator(argument);
    const count = await locator.count();
    if (count !== 1) throw new Error(`Expected one selector match for "${argument}", found ${count}.`);
    const children = await locator.evaluate((element) => [...element.children].slice(0, 80).map((child) => {
      const style = globalThis.getComputedStyle(child);
      const rect = child.getBoundingClientRect();
      return {
        tag: child.tagName.toLowerCase(),
        id: child.id,
        className: typeof child.className === 'string' ? child.className.slice(0, 200) : '',
        text: (child.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 160),
        width: rect.width,
        height: rect.height,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      };
    }));
    console.log(JSON.stringify({ selector: argument, children }, null, 2));
  } else if (command === 'select-source-index') {
    const index = Number(argument);
    if (!Number.isInteger(index) || index < 0 || index > 49) {
      throw new Error('select-source-index requires an integer from 0 to 49.');
    }
    const sources = page.locator('.editor-source');
    const count = await sources.count();
    if (index >= count) throw new Error(`Source index ${index} is outside the ${count}-item source list.`);
    await sources.nth(index).click();
    await page.waitForTimeout(250);
    console.log(JSON.stringify({ selectedSourceIndex: index, sourceCount: count, url: page.url() }));
  } else if (command === 'source-inspector') {
    const inspector = await page.evaluate(() => {
      const visible = (element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
      };
      const summarize = (element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className.slice(0, 240) : '',
          text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 240),
          role: element.getAttribute('role'),
          type: element.getAttribute('type'),
          ariaLabel: element.getAttribute('aria-label'),
          title: element.getAttribute('title'),
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          transform: style.transform === 'none' ? '' : style.transform,
          cursor: style.cursor,
        };
      };
      const sources = [...document.querySelectorAll('.editor-source')].map((element, index) => ({
        index,
        text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120),
        className: typeof element.className === 'string' ? element.className.slice(0, 220) : '',
        ariaSelected: element.getAttribute('aria-selected'),
      }));
      const controls = [...document.querySelectorAll('input, textarea, select, [contenteditable="true"], [role="slider"], [role="spinbutton"]')]
        .filter(visible)
        .map(summarize)
        .slice(0, 120);
      const transformElements = [...document.querySelectorAll('body *')]
        .filter(visible)
        .filter((element) => {
          const className = typeof element.className === 'string' ? element.className : '';
          const style = globalThis.getComputedStyle(element);
          return /moveable|transform|resize|rotate|control-box|selection|selected|inspector|property/i.test(className)
            || style.cursor === 'move'
            || style.cursor.includes('resize');
        })
        .map(summarize)
        .slice(0, 160);
      return { sources, controls, transformElements };
    });
    console.log(JSON.stringify(inspector, null, 2));
  } else if (command === 'hidden-modals') {
    const modals = await page.evaluate(() => [...document.querySelectorAll('.arco-modal-container')].map((container, index) => ({
      index,
      text: (container.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 1200),
      htmlClass: typeof container.className === 'string' ? container.className : '',
      controls: [...container.querySelectorAll('button, input, textarea, select, [role="button"], [role="checkbox"]')].map((element) => ({
        tag: element.tagName.toLowerCase(),
        text: (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 180),
        type: element.getAttribute('type'),
        placeholder: element.getAttribute('placeholder'),
        ariaLabel: element.getAttribute('aria-label'),
        className: typeof element.className === 'string' ? element.className.slice(0, 180) : '',
      })),
      labels: [...container.querySelectorAll('label')].map((element) => (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 180)),
    })));
    console.log(JSON.stringify({ modals }, null, 2));
  } else if (command === 'storage-schema') {
    const storageSchema = await page.evaluate(async () => {
      const describe = (value, depth = 0) => {
        if (depth >= 5) return typeof value;
        if (value === null) return 'null';
        if (Array.isArray(value)) {
          return {
            type: 'array',
            length: value.length,
            items: value.slice(0, 2).map((item) => describe(item, depth + 1)),
          };
        }
        if (typeof value === 'object') {
          return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, describe(item, depth + 1)]),
          );
        }
        return typeof value;
      };
      const summarizeStorage = (storage) => Object.fromEntries(
        [...Array(storage.length).keys()].map((index) => {
          const key = storage.key(index);
          if (!key) return [`unknown-${index}`, 'missing'];
          const rawValue = storage.getItem(key);
          try {
            return [key, describe(JSON.parse(rawValue ?? 'null'))];
          } catch {
            return [key, { type: 'string', length: rawValue?.length ?? 0 }];
          }
        }),
      );
      const databases = 'databases' in globalThis.indexedDB
        ? await globalThis.indexedDB.databases().then((items) => items.map(({ name, version }) => ({ name, version })))
        : [];
      return {
        localStorage: summarizeStorage(globalThis.localStorage),
        sessionStorage: summarizeStorage(globalThis.sessionStorage),
        indexedDB: databases,
      };
    });
    console.log(JSON.stringify(storageSchema, null, 2));
  } else if (command === 'auth-token-schema') {
    const tokenSchema = await page.evaluate(() => {
      const token = globalThis.localStorage.getItem('auth_token');
      if (!token) return { present: false };
      const describe = (value, depth = 0) => {
        if (depth >= 4) return typeof value;
        if (value === null) return 'null';
        if (Array.isArray(value)) return { type: 'array', items: value.slice(0, 2).map((item) => describe(item, depth + 1)) };
        if (typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, describe(item, depth + 1)]));
        }
        return typeof value;
      };
      try {
        const [, payload] = token.split('.');
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
        return { present: true, payload: describe(JSON.parse(globalThis.atob(normalized))) };
      } catch {
        return { present: true, payload: 'unreadable' };
      }
    });
    console.log(JSON.stringify(tokenSchema, null, 2));
  } else if (command === 'seed-synthetic-auth') {
    const result = await page.evaluate(() => {
      const encode = (value) => globalThis.btoa(JSON.stringify(value))
        .replace(/=/g, '')
        .replace(/\+/g, '-')
        .replace(/\//g, '_');
      const now = Math.floor(Date.now() / 1000);
      const token = [
        encode({ alg: 'none', typ: 'JWT' }),
        encode({
          userId: 'reference-audit-fixture',
          role: 'local-audit',
          deviceHash: '00000000-0000-4000-8000-000000000001',
          iat: now,
          exp: now + 3600,
        }),
        'synthetic',
      ].join('.');
      globalThis.localStorage.setItem('auth_token', token);
      globalThis.localStorage.setItem('app_device_id', '00000000-0000-4000-8000-000000000001');
      globalThis.location.hash = '#/';
      return { seeded: true };
    });
    await page.waitForTimeout(1200);
    console.log(JSON.stringify({ ...result, url: page.url() }, null, 2));
  } else if (command === 'global-api-schema') {
    const apiSchema = await page.evaluate(() => Object.fromEntries(
      Object.getOwnPropertyNames(globalThis)
        .filter((key) => /electron|ipc|bridge|api|window/i.test(key))
        .map((key) => {
          const value = globalThis[key];
          if ((typeof value === 'object' && value !== null) || typeof value === 'function') {
            try {
              return [key, Object.getOwnPropertyNames(value).filter((name) => name !== 'constructor').sort()];
            } catch {
              return [key, typeof value];
            }
          }
          return [key, typeof value];
        }),
    ));
    console.log(JSON.stringify(apiSchema, null, 2));
  } else if (command === 'mapi-schema') {
    const mapiSchema = await page.evaluate(() => {
      const describe = (value, depth = 0) => {
        if (depth >= 4) return typeof value;
        if (typeof value === 'function') return 'function';
        if (!value || typeof value !== 'object') return typeof value;
        return Object.fromEntries(
          Object.getOwnPropertyNames(value)
            .filter((key) => key !== 'constructor')
            .sort()
            .map((key) => {
              try {
                return [key, describe(value[key], depth + 1)];
              } catch {
                return [key, 'unreadable'];
              }
            }),
        );
      };
      return describe(globalThis.$mapi);
    });
    console.log(JSON.stringify(mapiSchema, null, 2));
  } else if (command === 'mapi-safe-info') {
    const safeInfo = await page.evaluate(async () => {
      const calls = [
        ['app.appEnv', () => globalThis.$mapi.app.appEnv()],
        ['app.getBuildInfo', () => globalThis.$mapi.app.getBuildInfo()],
        ['app.setupIsOk', () => globalThis.$mapi.app.setupIsOk()],
        ['app.setupList', () => globalThis.$mapi.app.setupList()],
        ['app.platformArch', () => globalThis.$mapi.app.platformArch()],
        ['app.platformName', () => globalThis.$mapi.app.platformName()],
      ];
      const results = {};
      for (const [name, call] of calls) {
        try {
          results[name] = await call();
        } catch (error) {
          results[name] = { error: error instanceof Error ? error.message : String(error) };
        }
      }
      const windowOpenDescriptor = Object.getOwnPropertyDescriptor(globalThis.$mapi.app, 'windowOpen');
      results['app.windowOpenMeta'] = {
        length: globalThis.$mapi.app.windowOpen.length,
        name: globalThis.$mapi.app.windowOpen.name,
        writable: windowOpenDescriptor?.writable ?? false,
        configurable: windowOpenDescriptor?.configurable ?? false,
      };
      return results;
    });
    console.log(JSON.stringify(safeInfo, null, 2));
  } else if (command === 'probe-window-open-empty') {
    const result = await page.evaluate(async () => {
      try {
        return { ok: true, value: await globalThis.$mapi.app.windowOpen() };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'probe-window-open') {
    const allowedWindows = new Set([
      'guide', 'feedback', 'logs', 'log', 'log_viewer', 'appLog', 'app_logs',
      'monitor', 'payment', 'about', 'appAbout', 'app_about', 'app-about', 'aboutApp',
      'about_us', 'about-us', 'info', 'appInfo', 'app_info', 'version', 'user', 'setup', 'autopin',
    ]);
    if (!argument || !allowedWindows.has(argument)) throw new Error('probe-window-open requires an allowed window name.');
    const result = await page.evaluate(async (windowName) => {
      try {
        const outcome = await Promise.race([
          globalThis.$mapi.app.windowOpen(windowName).then((value) => ({ type: 'resolved', value })),
          new Promise((resolve) => globalThis.setTimeout(() => resolve({ type: 'timeout' }), 1500)),
        ]);
        return outcome.type === 'timeout'
          ? { ok: true, timedOut: true }
          : { ok: true, value: outcome.value };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }, argument);
    console.log(JSON.stringify({ windowName: argument, ...result }, null, 2));
  } else if (command === 'capture-window-open-state') {
    const allowedWindows = new Set(['guide', 'feedback', 'log', 'monitor', 'payment', 'user', 'setup']);
    if (!argument || !allowedWindows.has(argument)) {
      throw new Error('capture-window-open-state requires an allowed window name.');
    }
    if (!argument2) throw new Error('capture-window-open-state requires an output path.');

    const bridgeResult = await page.evaluate(async (windowName) => {
      try {
        const outcome = await Promise.race([
          globalThis.$mapi.app.windowOpen(windowName).then((value) => ({ type: 'resolved', value })),
          new Promise((resolve) => globalThis.setTimeout(() => resolve({ type: 'timeout' }), 1500)),
        ]);
        return outcome.type === 'timeout'
          ? { ok: true, timedOut: true }
          : { ok: true, value: outcome.value };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    }, argument);

    const standaloneSuffix = `/dist/page/${argument}.html`;
    const deadline = Date.now() + 2500;
    let openedPage;
    while (Date.now() < deadline && !openedPage) {
      openedPage = browser.contexts().flatMap((context) => context.pages())
        .find((candidate) => candidate.url().includes(standaloneSuffix));
      if (!openedPage) await new Promise((resolve) => globalThis.setTimeout(resolve, 50));
    }
    if (!openedPage) throw new Error(`Opened ${argument} renderer target was not found.`);

    const outputPath = path.resolve(argument2);
    await openedPage.screenshot({ path: outputPath, fullPage: false });
    const state = await openedPage.evaluate(() => {
      const elements = [...document.body.querySelectorAll('*')].slice(0, 120).map((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          id: element.id,
          className: typeof element.className === 'string' ? element.className.slice(0, 240) : '',
          text: element.children.length === 0
            ? (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 160)
            : '',
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
          display: style.display,
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          padding: style.padding,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
        };
      });
      return {
        title: document.title,
        url: globalThis.location.href,
        metrics: {
          innerWidth: globalThis.innerWidth,
          innerHeight: globalThis.innerHeight,
          outerWidth: globalThis.outerWidth,
          outerHeight: globalThis.outerHeight,
          devicePixelRatio: globalThis.devicePixelRatio,
          bodyScrollWidth: document.body.scrollWidth,
          bodyScrollHeight: document.body.scrollHeight,
        },
        elements,
      };
    });
    const targets = browser.contexts().flatMap((context) => context.pages()).map((candidate) => ({
      title: '',
      url: candidate.url(),
    }));
    console.log(JSON.stringify({ windowName: argument, bridgeResult, outputPath, state, targets }, null, 2));
  } else if (command === 'probe-autopin-open') {
    const result = await page.evaluate(async () => {
      try {
        const outcome = await Promise.race([
          globalThis.$mapi.autopin.open().then((value) => ({ type: 'resolved', value })),
          new Promise((resolve) => globalThis.setTimeout(() => resolve({ type: 'timeout' }), 1500)),
        ]);
        return outcome.type === 'timeout'
          ? { ok: true, timedOut: true }
          : { ok: true, value: outcome.value };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'autopin-safe-info') {
    const result = await page.evaluate(async () => {
      let status;
      let statusError = '';
      let products;
      let productsError = '';
      try {
        status = await globalThis.$mapi.autopin.status();
      } catch (error) {
        statusError = error instanceof Error ? error.message : String(error);
      }
      try {
        products = await globalThis.$mapi.autopin.getProducts();
      } catch (error) {
        productsError = error instanceof Error ? error.message : String(error);
      }
      const productList = Array.isArray(products)
        ? products
        : Array.isArray(products?.products)
          ? products.products
          : [];
      const productKeys = [...new Set(productList.flatMap((product) => (
        product && typeof product === 'object' ? Object.keys(product) : []
      )))].sort();
      return {
        status: {
          running: Boolean(status?.running),
          windowOpen: Boolean(status?.windowOpen),
          context: typeof status?.context === 'string' ? status.context : typeof status?.context,
          hasLastError: Boolean(status?.lastError),
          liveManagerStatus: typeof status?.liveManagerStatus === 'string' ? status.liveManagerStatus : typeof status?.liveManagerStatus,
          liveManagerStatusText: typeof status?.liveManagerStatusText === 'string' ? status.liveManagerStatusText : typeof status?.liveManagerStatusText,
          hasCallError: Boolean(statusError),
        },
        products: {
          count: productList.length,
          keys: productKeys,
          containerType: Array.isArray(products) ? 'array' : typeof products,
          hasCallError: Boolean(productsError),
          errorCategory: productsError ? 'unavailable-or-empty' : '',
        },
      };
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === 'bridge-call-literals') {
    const bridgeCalls = await page.evaluate(async () => {
      const methods = ['windowOpen', 'setupOpen', 'autopin.open', 'user.open'];
      const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
      const findings = [];
      for (const source of scripts) {
        const content = await fetch(source).then((response) => response.text());
        for (const method of methods) {
          const methodName = method.split('.').at(-1);
          const matcher = new RegExp(`\\.${methodName}\\(([^)]{0,500})\\)`, 'g');
          for (const match of content.matchAll(matcher)) {
            const literals = [...match[1].matchAll(/(['"`])([^'"`]{1,240})\1/g)]
              .map((literal) => literal[2])
              .filter((literal) => !/token|cookie|bearer|@/i.test(literal));
            if (literals.length > 0) {
              findings.push({
                source: new URL(source).pathname.split('/').at(-1),
                method,
                literals: [...new Set(literals)],
              });
            }
          }
        }
      }
      return findings;
    });
    console.log(JSON.stringify({ bridgeCalls }, null, 2));
  } else if (command === 'bundle-token-literals') {
    if (!argument || !/^[a-zA-Z0-9_.-]+$/.test(argument)) {
      throw new Error('bundle-token-literals requires a simple token.');
    }
    const tokenFindings = await page.evaluate(async (token) => {
      const scripts = [...document.scripts].map((script) => script.src).filter(Boolean);
      const findings = [];
      for (const source of scripts) {
        const content = await fetch(source).then((response) => response.text());
        let offset = content.indexOf(token);
        while (offset !== -1 && findings.length < 100) {
          const nearby = content.slice(Math.max(0, offset - 350), offset + token.length + 350);
          const literals = [...nearby.matchAll(/(['"`])([^'"`]{1,240})\1/g)]
            .map((match) => match[2])
            .filter((literal) => !/token|cookie|bearer|@/i.test(literal));
          findings.push({
            source: new URL(source).pathname.split('/').at(-1),
            token,
            literals: [...new Set(literals)],
          });
          offset = content.indexOf(token, offset + token.length);
        }
      }
      return findings;
    }, argument);
    console.log(JSON.stringify({ tokenFindings }, null, 2));
  } else if (command === 'script-inventory') {
    const scripts = await page.evaluate(async () => Promise.all([...document.scripts].map(async (script) => ({
      source: script.src ? new URL(script.src).pathname.split('/').at(-1) : 'inline',
      external: Boolean(script.src),
      length: script.src
        ? await fetch(script.src).then((response) => response.text()).then((content) => content.length)
        : script.textContent?.length ?? 0,
    }))));
    console.log(JSON.stringify({ scripts }, null, 2));
  } else if (command === 'trace-click-text') {
    if (!argument) throw new Error('trace-click-text requires exact visible text.');
    const trace = await page.evaluate(async (text) => {
      const calls = [];
      const patches = [];
      const redact = (value) => {
        if (typeof value === 'string') {
          if (/\S+@\S+\.\S+/.test(value) || /token|cookie|bearer/i.test(value)) return '[redacted]';
          return value.slice(0, 500);
        }
        if (Array.isArray(value)) return value.map(redact);
        if (value && typeof value === 'object') {
          return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, redact(item)]));
        }
        return value;
      };
      const patch = (owner, ownerName, methodName) => {
        if (!owner || typeof owner[methodName] !== 'function') return;
        const original = owner[methodName];
        owner[methodName] = async (...args) => {
          calls.push({ method: `${ownerName}.${methodName}`, args: redact(args) });
          return null;
        };
        patches.push(() => { owner[methodName] = original; });
      };
      patch(globalThis.$mapi?.app, '$mapi.app', 'windowOpen');
      patch(globalThis.$mapi?.app, '$mapi.app', 'openExternal');
      patch(globalThis.$mapi?.app, '$mapi.app', 'setupOpen');
      patch(globalThis.$mapi?.user, '$mapi.user', 'open');
      patch(globalThis.$mapi?.user, '$mapi.user', 'openWebUrl');
      const matches = [...document.querySelectorAll('body *')].filter((element) => {
        const style = globalThis.getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.visibility !== 'hidden'
          && style.display !== 'none'
          && rect.width > 0
          && rect.height > 0
          && (element.textContent ?? '').trim() === text;
      });
      const target = matches.find((element) => ['A', 'BUTTON'].includes(element.tagName))
        ?? matches.find((element) => globalThis.getComputedStyle(element).cursor === 'pointer');
      if (!target) throw new Error(`No unique actionable element found for "${text}".`);
      target.click();
      await new Promise((resolve) => globalThis.setTimeout(resolve, 350));
      patches.reverse().forEach((restore) => restore());
      return { calls, url: globalThis.location.href };
    }, argument);
    console.log(JSON.stringify({ clicked: argument, ...trace }, null, 2));
  } else if (command === 'trace-reload-bridge') {
    await page.addInitScript(() => {
      globalThis.__referenceAuditBridgeCalls = [];
      const patch = (owner, ownerName, methodName) => {
        if (!owner || typeof owner[methodName] !== 'function') return;
        const original = owner[methodName];
        owner[methodName] = (...args) => {
          globalThis.__referenceAuditBridgeCalls.push({ method: `${ownerName}.${methodName}`, args });
          return original.apply(owner, args);
        };
      };
      patch(globalThis.$mapi?.app, '$mapi.app', 'setRenderAppEnv');
      patch(globalThis.$mapi?.app, '$mapi.app', 'windowOpen');
      patch(globalThis.$mapi?.event, '$mapi.event', 'init');
      patch(globalThis.$mapi?.ui, '$mapi.ui', 'init');
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1200);
    const calls = await page.evaluate(() => globalThis.__referenceAuditBridgeCalls ?? []);
    console.log(JSON.stringify({ calls, url: page.url() }, null, 2));
  } else {
    throw new Error(`Unknown command: ${command}`);
  }
} finally {
  await browser.close();
}
