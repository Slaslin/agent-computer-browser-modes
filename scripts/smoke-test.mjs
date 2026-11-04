import { mkdir } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const { chromium } = await import("playwright");

const here = path.dirname(fileURLToPath(import.meta.url));
const overlayPath = path.join(here, "cursor-overlay.js");
const pagePath = path.join(here, "smoke-test.html");
const screenshotPath = path.join(here, "..", "test-output", "smoke-test.png");
await mkdir(path.dirname(screenshotPath), { recursive: true });

const browser = await chromium.launch({ channel: "msedge", headless: true });
const context = await browser.newContext({ viewport: { width: 900, height: 640 } });
await context.addInitScript({ path: overlayPath });
const page = await context.newPage();
await page.goto(pathToFileURL(pagePath).href);

const button = page.locator("#action");
const box = await button.boundingBox();
if (!box) throw new Error("Smoke-test button has no bounding box");

const buttonX = box.x + box.width / 2;
const buttonY = box.y + box.height / 2;
await page.evaluate(
  ({ x, y }) => window.__codexVisualCursor.moveTo(x, y, 260),
  { x: buttonX, y: buttonY },
);
await page.waitForTimeout(320);
await page.mouse.click(buttonX, buttonY);
await page.waitForTimeout(450);

const state = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    actionText: document.querySelector("#result")?.textContent ?? "",
    bodyCursor: getComputedStyle(document.body).cursor,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    cursorTransform: cursor ? getComputedStyle(cursor).transform : null,
    hostExists: Boolean(host),
    nativeCursorHidden: document.documentElement.classList.contains(
      "codex-visual-cursor-active",
    ),
    overlayApiExists: Boolean(window.__codexVisualCursor),
  };
});

if (!state.hostExists) throw new Error("Cursor overlay host was not installed");
if (!state.overlayApiExists) throw new Error("Cursor overlay API was not exposed");
if (state.cursorOpacity !== "1") {
  throw new Error(`Cursor should be visible, got opacity ${state.cursorOpacity}`);
}
if (!state.actionText.includes("Action ran for")) {
  throw new Error("Visible pointer click did not activate the test button");
}
if (state.bodyCursor !== "none" || !state.nativeCursorHidden) {
  throw new Error("Native page cursor was not suppressed during agent input");
}

await page.screenshot({ path: screenshotPath });

await page.evaluate(() => {
  window.dispatchEvent(
    new PointerEvent("pointermove", {
      bubbles: true,
      clientX: 120,
      clientY: 140,
    }),
  );
});
await page.waitForTimeout(180);

const pointerInsideState = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    bodyCursor: getComputedStyle(document.body).cursor,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    cursorTransform: cursor ? getComputedStyle(cursor).transform : null,
    nativeCursorHidden: document.documentElement.classList.contains(
      "codex-visual-cursor-active",
    ),
  };
});

if (
  pointerInsideState.bodyCursor !== "none" ||
  !pointerInsideState.nativeCursorHidden ||
  pointerInsideState.cursorOpacity !== "1"
) {
  throw new Error(
    `Real pointer movement inside the page should stay on the virtual cursor: ${JSON.stringify(pointerInsideState)}`,
  );
}

await page.evaluate(() => {
  document.querySelector("#action")?.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: false }),
  );
});
await page.waitForTimeout(120);

const childLeaveState = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    bodyCursor: getComputedStyle(document.body).cursor,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    nativeCursorHidden: document.documentElement.classList.contains(
      "codex-visual-cursor-active",
    ),
  };
});

if (
  childLeaveState.bodyCursor !== "none" ||
  !childLeaveState.nativeCursorHidden ||
  childLeaveState.cursorOpacity !== "1"
) {
  throw new Error(
    `Leaving a child element must not hide the page cursor: ${JSON.stringify(childLeaveState)}`,
  );
}

await page.evaluate(() => {
  document.documentElement.dispatchEvent(
    new PointerEvent("pointerleave", { bubbles: false }),
  );
});
await page.waitForTimeout(180);

const pointerLeftState = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    bodyCursor: getComputedStyle(document.body).cursor,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    nativeCursorHidden: document.documentElement.classList.contains(
      "codex-visual-cursor-active",
    ),
  };
});

if (
  pointerLeftState.bodyCursor !== "auto" ||
  pointerLeftState.nativeCursorHidden ||
  pointerLeftState.cursorOpacity !== "0"
) {
  throw new Error(
    `Leaving the page should restore the native cursor: ${JSON.stringify(pointerLeftState)}`,
  );
}

await page.evaluate(() => {
  document.documentElement.dispatchEvent(
    new PointerEvent("pointerenter", {
      bubbles: false,
      clientX: 300,
      clientY: 200,
    }),
  );
});
await page.waitForTimeout(180);

const pointerReturnedState = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    bodyCursor: getComputedStyle(document.body).cursor,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    nativeCursorHidden: document.documentElement.classList.contains(
      "codex-visual-cursor-active",
    ),
  };
});

if (
  pointerReturnedState.bodyCursor !== "none" ||
  !pointerReturnedState.nativeCursorHidden ||
  pointerReturnedState.cursorOpacity !== "1"
) {
  throw new Error(
    `Returning to the page should restore the virtual cursor: ${JSON.stringify(pointerReturnedState)}`,
  );
}

const backgroundPage = await context.newPage();
await backgroundPage.goto("about:blank");
await backgroundPage.bringToFront();
await page.evaluate(() => window.__codexVisualCursor.moveTo(210, 160, 0));
await page.waitForTimeout(260);

const backgroundState = await page.evaluate(() => {
  const host = document.querySelector("#codex-visual-cursor-host");
  const cursor = host?.shadowRoot?.querySelector(".codex-cursor");
  return {
    hasFocus: document.hasFocus(),
    visibilityState: document.visibilityState,
    cursorOpacity: cursor ? getComputedStyle(cursor).opacity : null,
    cursorTransform: cursor ? getComputedStyle(cursor).transform : null,
  };
});

if (Number(backgroundState.cursorOpacity) < 0.95) {
  throw new Error(
    `Background cursor should be visible immediately, got ${backgroundState.cursorOpacity}`,
  );
}

console.log(
  JSON.stringify(
    {
      ...state,
      pointerInsideState,
      childLeaveState,
      pointerLeftState,
      pointerReturnedState,
      backgroundState,
      screenshotPath,
    },
    null,
    2,
  ),
);
await browser.close();
