import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const temporaryProfile = await mkdtemp(join(tmpdir(), "oxc-recovery-smoke-"));
const processes = [];

async function stop(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

async function unusedPort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  await new Promise((resolve) => server.close(resolve));
  return address.port;
}

async function poll(description, check, timeout = 20_000) {
  const deadline = Date.now() + timeout;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const result = await check();
      if (result) return result;
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${description}`, { cause: lastError });
}

class DevToolsSession {
  #nextId = 1;
  #pending = new Map();

  constructor(url) {
    this.socket = new WebSocket(url);
    this.socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      if (!message.id) return;
      const pending = this.#pending.get(message.id);
      if (!pending) return;
      this.#pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
  }

  send(method, params = {}) {
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function evaluate(session, expression) {
  const response = await session.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result.value;
}

function chromeExecutable() {
  const candidates = [
    process.env.CHROME_BIN,
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean);
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) {
    throw new Error("Chrome was not found; set CHROME_BIN to run the recovery browser smoke test");
  }
  return executable;
}

try {
  const previewPort = await unusedPort();
  const preview = spawn(
    "pnpm",
    ["exec", "vp", "preview", "--host", "127.0.0.1", "--port", String(previewPort)],
    {
      cwd: root,
      env: { ...process.env, NO_COLOR: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  processes.push(preview);
  const pageUrl = `http://127.0.0.1:${previewPort}/`;
  await poll("the playground preview", async () => (await fetch(pageUrl)).ok);

  const chrome = spawn(
    chromeExecutable(),
    [
      "--headless=new",
      "--no-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage",
      "--remote-debugging-port=0",
      `--user-data-dir=${temporaryProfile}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  processes.push(chrome);

  let chromeErrors = "";
  chrome.stderr.setEncoding("utf8");
  chrome.stderr.on("data", (chunk) => {
    chromeErrors += chunk;
  });
  const browserWebSocket = await poll("Chrome DevTools", () => {
    const match = chromeErrors.match(/DevTools listening on (ws:\/\/\S+)/);
    return match?.[1];
  });
  const browserOrigin = new URL(browserWebSocket);
  const target = await fetch(
    `http://${browserOrigin.host}/json/new?${encodeURIComponent(pageUrl)}`,
    { method: "PUT" },
  ).then((response) => response.json());
  const session = new DevToolsSession(target.webSocketDebuggerUrl);
  await session.open();
  await session.send("Runtime.enable");
  await session.send("Page.enable");
  await session.send("Page.bringToFront");
  await session.send("Emulation.setFocusEmulationEnabled", { enabled: true });

  await poll("the recovered comparison", () =>
    evaluate(
      session,
      `(() => {
        const normal = document.querySelector('[data-recovery-mode="normal"]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        const missing = editor?.querySelector('[data-recovery-kind="MissingExpression"]');
        const bindings = editor?.querySelector('[data-recovery-summary="bindings"]');
        return normal?.dataset.recoveryStatus === 'aborted' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          missing?.matches('[data-recovery-leaf="true"]') &&
          Boolean(missing.querySelector('[data-recovery-leaf-marker]')) &&
          bindings?.textContent?.includes('2 bindings');
      })()`,
    ),
  );

  const insertionPoint = await poll("the missing initializer insertion point", () =>
    evaluate(
      session,
      `(() => {
      const line = [...document.querySelectorAll('.monaco-editor .view-line')]
        .find((candidate) => candidate.textContent?.includes('='));
      if (!line) return undefined;
      const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
      let textNode;
      while ((textNode = walker.nextNode())) {
        const equals = textNode.data.lastIndexOf('=');
        if (equals >= 0) {
          const range = document.createRange();
          range.setStart(textNode, equals + 1);
          range.collapse(true);
          const caret = range.getBoundingClientRect();
          const lineRect = line.getBoundingClientRect();
          return { x: caret.left, y: lineRect.top + lineRect.height / 2 };
        }
      }
    })()`,
    ),
  );
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: insertionPoint.x,
    y: insertionPoint.y,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x: insertionPoint.x,
    y: insertionPoint.y,
    button: "left",
    clickCount: 1,
  });
  await session.send("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: insertionPoint.x,
    y: insertionPoint.y,
    button: "left",
    clickCount: 1,
  });
  const focusState = await evaluate(
    session,
    `({
      focused: document.activeElement?.tagName === 'TEXTAREA' ||
        document.activeElement?.classList.contains('native-edit-context'),
      activeTag: document.activeElement?.tagName,
      activeClass: document.activeElement?.className,
    })`,
  );
  assert.equal(
    focusState.focused,
    true,
    `Clicking Monaco at ${JSON.stringify(insertionPoint)} should focus its edit context; active element was ${JSON.stringify(focusState)}`,
  );
  await poll("the inline AST recovery lens", () =>
    evaluate(
      session,
      `(() => {
        const tags = [...document.querySelectorAll('.monaco-editor .ast-lens-tag')]
          .map((tag) => tag.textContent);
        const selected = document.querySelector('[data-ast-lens-selected-kind]')?.textContent?.trim();
        return tags.some((tag) => tag?.includes('Missing')) && selected === 'MissingExpression';
      })()`,
    ),
  );
  await session.send("Input.insertText", { text: "1" });

  let finalState;
  try {
    await poll("the completed clean comparison", async () => {
      finalState = await evaluate(
        session,
        `(() => {
          const cards = [...document.querySelectorAll('[data-recovery-mode]')];
          return {
            clean: cards.length === 2 &&
              cards.every((card) => card.dataset.recoveryStatus === 'clean') &&
              !document.querySelector('[data-recovery-kind="MissingExpression"]'),
            statuses: cards.map((card) => [card.dataset.recoveryMode, card.dataset.recoveryStatus]),
            editorText: document.querySelector('.monaco-editor .view-lines')?.textContent,
            inputValue: document.querySelector('.monaco-editor textarea')?.value,
          };
        })()`,
      );
      return finalState.clean;
    });
  } catch (error) {
    throw new Error(`Recovery comparison did not become clean: ${JSON.stringify(finalState)}`, {
      cause: error,
    });
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-object-property-value`,
  });
  await poll("the named object-property recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        return example?.value === 'missing-object-property-value' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          Boolean(editor.querySelector('[data-recovery-kind="MissingExpression"]')) &&
          document.querySelector('.monaco-editor .view-lines')?.textContent?.includes('missing');
      })()`,
    ),
  );
  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-array-operand`,
  });
  await poll("the named array-operand recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        return example?.value === 'missing-array-operand' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          Boolean(editor.querySelector('[data-recovery-kind="MissingExpression"]')) &&
          document.querySelector('.monaco-editor .view-lines')?.textContent?.includes('target');
      })()`,
    ),
  );
  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-call-argument`,
  });
  await poll("the named call-argument recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        return example?.value === 'missing-call-argument' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          Boolean(editor.querySelector('[data-recovery-kind="MissingExpression"]')) &&
          editor.textContent?.includes('Argument expression expected.');
      })()`,
    ),
  );
  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-list-delimiters`,
  });
  let delimiterState;
  try {
    await poll("the named list-delimiter recovery example", async () => {
      delimiterState = await evaluate(
        session,
        `(() => {
          const example = document.querySelector('[data-recovery-example-select]');
          const editor = document.querySelector('[data-recovery-mode="editor"]');
          const kinds = editor
            ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
            : [];
          return {
            ready: example?.value === 'missing-list-delimiters' &&
              editor?.dataset.recoveryStatus === 'recovered' &&
              kinds.includes('MissingComma') &&
              kinds.includes('MissingClosingBracket') &&
              editor.textContent?.includes("',' expected."),
            example: example?.value,
            status: editor?.dataset.recoveryStatus,
            kinds,
            text: editor?.textContent,
          };
        })()`,
      );
      return delimiterState.ready;
    });
  } catch (error) {
    throw new Error(`List-delimiter example did not recover: ${JSON.stringify(delimiterState)}`, {
      cause: error,
    });
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-parameter-delimiter`,
  });
  await poll("the named parameter-delimiter recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        const kinds = editor
          ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
          : [];
        return example?.value === 'missing-parameter-delimiter' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          kinds.includes('MissingComma') &&
          editor.textContent?.includes("',' expected.") &&
          editor.textContent?.includes('3 bindings');
      })()`,
    ),
  );

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-function-body-closer`,
  });
  await poll("the named function-body recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        const kinds = editor
          ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
          : [];
        return example?.value === 'missing-function-body-closer' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          kinds.includes('MissingClosingBrace') &&
          editor.textContent?.includes("'}' expected.") &&
          editor.textContent?.includes('2 bindings');
      })()`,
    ),
  );

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-return-expression-operand`,
  });
  await poll("the named return-expression recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        return example?.value === 'missing-return-expression-operand' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          Boolean(editor.querySelector('[data-recovery-kind="MissingExpression"]')) &&
          editor.textContent?.includes('Expression expected.') &&
          editor.textContent?.includes('2 bindings');
      })()`,
    ),
  );

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=function-interface-edits`,
  });
  let stageThreeState;
  try {
    await poll("the named function/interface recovery example", async () => {
      stageThreeState = await evaluate(
        session,
        `(() => {
          const example = document.querySelector('[data-recovery-example-select]');
          const editor = document.querySelector('[data-recovery-mode="editor"]');
          const kinds = editor
            ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
            : [];
          return {
            ready: example?.value === 'function-interface-edits' &&
              editor?.dataset.recoveryStatus === 'recovered' &&
              kinds.includes('MissingSemicolon') &&
              kinds.includes('MissingParameter') &&
              kinds.includes('MissingClosingBrace') &&
              editor.querySelectorAll('[data-recovery-kind="MissingMemberExpression"]').length === 2 &&
              editor.textContent?.includes('Identifier expected.'),
            example: example?.value,
            status: editor?.dataset.recoveryStatus,
            kinds,
            text: editor?.textContent,
          };
        })()`,
      );
      return stageThreeState.ready;
    });
  } catch (error) {
    throw new Error(
      `Function/interface example did not recover: ${JSON.stringify(stageThreeState)}`,
      {
        cause: error,
      },
    );
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-class-member-separator`,
  });
  let classState;
  try {
    await poll("the named class-member recovery example", async () => {
      classState = await evaluate(
        session,
        `(() => {
          const example = document.querySelector('[data-recovery-example-select]');
          const editor = document.querySelector('[data-recovery-mode="editor"]');
          const kinds = editor
            ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
            : [];
          return {
            ready: example?.value === 'missing-class-member-separator' &&
              editor?.dataset.recoveryStatus === 'recovered' &&
              kinds.includes('MissingSemicolon') &&
              kinds.includes('MissingClosingBrace') &&
              editor.textContent?.includes("';' expected.") &&
              editor.textContent?.includes('5 bindings'),
            example: example?.value,
            status: editor?.dataset.recoveryStatus,
            kinds,
            text: editor?.textContent,
          };
        })()`,
      );
      return classState.ready;
    });
  } catch (error) {
    throw new Error(`Class-member example did not recover: ${JSON.stringify(classState)}`, {
      cause: error,
    });
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=stage-five-deletion-recovery`,
  });
  let stageFiveState;
  try {
    await poll("the named Stage 5 deletion-recovery example", async () => {
      stageFiveState = await evaluate(
        session,
        `(() => {
          const example = document.querySelector('[data-recovery-example-select]');
          const editor = document.querySelector('[data-recovery-mode="editor"]');
          const kinds = editor
            ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
            : [];
          return {
            ready: example?.value === 'stage-five-deletion-recovery' &&
              editor?.dataset.recoveryStatus === 'recovered' &&
              kinds.includes('MissingClosingParenthesis') &&
              kinds.includes('MissingDeclarationName') &&
              kinds.includes('UnexpectedVariableInitializer') &&
              editor.textContent?.includes('Argument expression expected.') &&
              editor.textContent?.includes('Variable declaration expected.') &&
              editor.textContent?.includes('2 bindings'),
            example: example?.value,
            status: editor?.dataset.recoveryStatus,
            kinds,
            text: editor?.textContent,
          };
        })()`,
      );
      return stageFiveState.ready;
    });
  } catch (error) {
    throw new Error(
      `Stage 5 deletion-recovery example did not recover: ${JSON.stringify(stageFiveState)}`,
      { cause: error },
    );
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=missing-type-annotation`,
  });
  let typeState;
  try {
    await poll("the named missing-type recovery example", async () => {
      typeState = await evaluate(
        session,
        `(() => {
          const example = document.querySelector('[data-recovery-example-select]');
          const editor = document.querySelector('[data-recovery-mode="editor"]');
          const kinds = editor
            ? [...editor.querySelectorAll('[data-recovery-site-kind]')].map((site) => site.dataset.recoverySiteKind)
            : [];
          return {
            ready: example?.value === 'missing-type-annotation' &&
              editor?.dataset.recoveryStatus === 'recovered' &&
              Boolean(editor.querySelector('[data-recovery-kind="MissingType"]')) &&
              kinds.includes('MissingClosingBracket') &&
              editor.textContent?.includes('Type expected.'),
            example: example?.value,
            status: editor?.dataset.recoveryStatus,
            kinds,
            text: editor?.textContent,
          };
        })()`,
      );
      return typeState.ready;
    });
  } catch (error) {
    throw new Error(`Missing-type example did not recover: ${JSON.stringify(typeState)}`, {
      cause: error,
    });
  }

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=malformed-expression`,
  });
  await poll("the named malformed-expression recovery example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const editor = document.querySelector('[data-recovery-mode="editor"]');
        const site = editor?.querySelector('[data-recovery-kind="MalformedExpression"]');
        return example?.value === 'malformed-expression' &&
          editor?.dataset.recoveryStatus === 'recovered' &&
          Boolean(site) &&
          site?.textContent?.includes('MalformedExpression') &&
          editor.textContent?.includes('Expression expected.');
      })()`,
    ),
  );

  await session.send("Page.navigate", {
    url: `${pageUrl}?example=tsrs-callable-expressions`,
  });
  await poll("the named tsrs callable-expression example", () =>
    evaluate(
      session,
      `(() => {
        const example = document.querySelector('[data-recovery-example-select]');
        const panel = document.querySelector('[data-tsrs-panel]');
        const argumentErrors = panel?.querySelectorAll('[data-tsrs-diagnostic="TS2345"]');
        const arityErrors = panel?.querySelectorAll('[data-tsrs-diagnostic="TS2554"]');
        return example?.value === 'tsrs-callable-expressions' &&
          Boolean(panel) && argumentErrors?.length === 3 && arityErrors?.length === 1;
      })()`,
    ),
  );

  await evaluate(session, `document.querySelector('[data-tsrs-diagnostic="TS2554"]')?.click()`);
  await poll("the tsrs source highlight", () =>
    evaluate(session, `Boolean(document.querySelector('.monaco-editor .ast-highlight'))`),
  );

  session.close();
  console.log(
    "Playground browser smoke passed: recovery examples remain interactive and the tsrs callable example reports argument/arity diagnostics with source highlighting.",
  );
} finally {
  for (const child of processes.reverse()) await stop(child);
  await rm(temporaryProfile, {
    recursive: true,
    force: true,
    maxRetries: 5,
    retryDelay: 100,
  });
}

// Node's built-in WebSocket may retain a closed DevTools handle after Chrome has exited. All
// cleanup above is awaited, so terminate the successful smoke run instead of leaving CI hanging.
process.exit(0);
