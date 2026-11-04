(() => {
  const INSTALL_KEY = "__codexVisualCursorOverlay";
  if (window[INSTALL_KEY]) return;
  Object.defineProperty(window, INSTALL_KEY, { value: true });

  const HOST_ID = "codex-visual-cursor-host";
  let host = null;
  let shadow = null;
  let cursor = null;
  let focusRing = null;
  let animationFrame = 0;
  let focusTimer = 0;
  let settleTimer = 0;
  let virtualCursorActive = false;
  let boundaryListenersAttached = false;
  let currentX = window.innerWidth / 2;
  let currentY = window.innerHeight / 2;
  let targetX = currentX;
  let targetY = currentY;

  const styles = `
    :host {
      all: initial;
      contain: layout style paint;
    }
    .codex-cursor-layer {
      position: fixed;
      inset: 0;
      z-index: 2147483647;
      overflow: hidden;
      pointer-events: none;
    }
    .codex-cursor {
      position: absolute;
      left: 0;
      top: 0;
      width: 24px;
      height: 30px;
      opacity: 0;
      transform: translate3d(-3px, -3px, 0);
      transform-origin: 3px 3px;
      filter: drop-shadow(0 2px 2px rgba(0, 0, 0, 0.38));
      will-change: transform, opacity;
      transition: opacity 120ms ease-out;
    }
    .codex-cursor svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    .codex-trail {
      position: absolute;
      width: 9px;
      height: 9px;
      border-radius: 999px;
      opacity: 0;
      background: rgba(25, 112, 255, 0.78);
      box-shadow: 0 0 0 3px rgba(25, 112, 255, 0.16);
      transform: translate(-50%, -50%);
      will-change: transform, opacity;
    }
    .codex-click-ring {
      position: absolute;
      width: 18px;
      height: 18px;
      border: 2px solid rgba(25, 112, 255, 0.95);
      border-radius: 999px;
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.35);
      will-change: transform, opacity;
    }
    .codex-focus-ring {
      position: absolute;
      border: 2px solid rgba(25, 112, 255, 0.9);
      border-radius: 6px;
      background: rgba(25, 112, 255, 0.09);
      box-shadow: 0 0 0 3px rgba(25, 112, 255, 0.12);
      opacity: 0;
      transform: scale(0.985);
      transition: opacity 120ms ease-out, transform 120ms ease-out;
      will-change: transform, opacity, width, height;
    }
    .codex-focus-ring.visible {
      opacity: 1;
      transform: scale(1);
    }
  `;

  function ensureHost() {
    if (host?.isConnected) return true;
    if (!document.documentElement) return false;

    const nativeCursorStyle = document.createElement("style");
    nativeCursorStyle.id = "codex-visual-cursor-native-cursor";
    nativeCursorStyle.textContent = `
      html.codex-visual-cursor-active,
      html.codex-visual-cursor-active body,
      html.codex-visual-cursor-active body * {
        cursor: none !important;
      }
    `;
    (document.head ?? document.documentElement).append(nativeCursorStyle);

    host = document.createElement("div");
    host.id = HOST_ID;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
      "all:initial;position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
    shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = styles;

    const layer = document.createElement("div");
    layer.className = "codex-cursor-layer";

    focusRing = document.createElement("div");
    focusRing.className = "codex-focus-ring";

    cursor = document.createElement("div");
    cursor.className = "codex-cursor";
    cursor.innerHTML = `
      <svg viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M3 2.5 20.4 17.1l-8.2.9-4.5 7.3L3 2.5Z"
          fill="#ffffff"
          stroke="#111827"
          stroke-width="1.7"
          stroke-linejoin="round"
        />
      </svg>
    `;

    layer.append(focusRing, cursor);
    shadow.append(style, layer);
    document.documentElement.append(host);
    attachBoundaryListeners();
    return true;
  }

  function attachBoundaryListeners() {
    if (boundaryListenersAttached || !document.documentElement) return;
    boundaryListenersAttached = true;

    document.documentElement.addEventListener(
      "pointerenter",
      (event) => {
        suppressSystemCursor();
        setCursorPosition(event.clientX, event.clientY);
      },
      { passive: true },
    );

    document.documentElement.addEventListener(
      "pointerleave",
      () => {
        hideVirtualCursor();
      },
      { passive: true },
    );
  }

  function restoreSystemCursor() {
    document.documentElement?.classList.remove("codex-visual-cursor-active");
  }

  function suppressSystemCursor() {
    if (!ensureHost()) return;
    document.documentElement.classList.add("codex-visual-cursor-active");
  }

  function setCursorPosition(x, y) {
    virtualCursorActive = true;
    currentX = x;
    currentY = y;
    if (!cursor) return;
    cursor.style.opacity = "1";
    cursor.style.transform = `translate3d(${x - 3}px, ${y - 3}px, 0)`;
  }

  function hideVirtualCursor() {
    cancelAnimationFrame(animationFrame);
    clearTimeout(settleTimer);
    animationFrame = 0;
    settleTimer = 0;
    virtualCursorActive = false;
    if (cursor) cursor.style.opacity = "0";
    focusRing?.classList.remove("visible");
    restoreSystemCursor();
  }

  function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
  }

  function moveTo(x, y, duration = 180) {
    if (!ensureHost()) return;
    cancelAnimationFrame(animationFrame);
    clearTimeout(settleTimer);
    virtualCursorActive = true;
    suppressSystemCursor();

    const safeX = Number.isFinite(x) ? x : currentX;
    const safeY = Number.isFinite(y) ? y : currentY;
    const fromX = currentX;
    const fromY = currentY;
    const distance = Math.hypot(safeX - fromX, safeY - fromY);
    const durationMs = Math.max(0, Number(duration) || 0);
    targetX = safeX;
    targetY = safeY;

    // Reveal the cursor synchronously. Animation frames can be paused when the
    // browser loses focus, but the virtual cursor must remain observable.
    setCursorPosition(fromX, fromY);

    const canAnimate =
      document.visibilityState === "visible" &&
      document.hasFocus() &&
      !document.hidden;

    if (durationMs === 0 || distance < 2 || !canAnimate) {
      setCursorPosition(safeX, safeY);
      return;
    }

    settleTimer = window.setTimeout(() => {
      setCursorPosition(targetX, targetY);
    }, durationMs + 80);

    const startedAt = performance.now();
    const startX = fromX;
    const startY = fromY;

    function tick(now) {
      const elapsed = Math.min(1, (now - startedAt) / durationMs);
      const eased = easeOutCubic(elapsed);
      setCursorPosition(
        startX + (safeX - startX) * eased,
        startY + (safeY - startY) * eased,
      );
      if (elapsed < 1) {
        animationFrame = requestAnimationFrame(tick);
      }
    }

    animationFrame = requestAnimationFrame(tick);
  }

  function addTrail(x, y) {
    if (!ensureHost()) return;
    const dot = document.createElement("div");
    dot.className = "codex-trail";
    dot.style.left = `${x}px`;
    dot.style.top = `${y}px`;
    shadow.querySelector(".codex-cursor-layer").append(dot);
    const animation = dot.animate(
      [
        { opacity: 0.62, transform: "translate(-50%, -50%) scale(1)" },
        {
          opacity: 0,
          transform: "translate(-50%, -50%) scale(0.2)",
        },
      ],
      { duration: 420, easing: "ease-out" },
    );
    animation.addEventListener("finish", () => dot.remove(), { once: true });
  }

  function pulse(x, y) {
    if (!ensureHost()) return;
    moveTo(x, y, 0);

    const ring = document.createElement("div");
    ring.className = "codex-click-ring";
    ring.style.left = `${x}px`;
    ring.style.top = `${y}px`;
    shadow.querySelector(".codex-cursor-layer").append(ring);

    const animation = ring.animate(
      [
        {
          opacity: 0.95,
          transform: "translate(-50%, -50%) scale(0.35)",
        },
        {
          opacity: 0,
          transform: "translate(-50%, -50%) scale(2.3)",
        },
      ],
      { duration: 460, easing: "ease-out" },
    );
    animation.addEventListener("finish", () => ring.remove(), { once: true });
  }

  function showFocus(element) {
    if (!(element instanceof Element) || !ensureHost()) return;
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;

    clearTimeout(focusTimer);
    focusRing.style.left = `${Math.max(0, rect.left - 3)}px`;
    focusRing.style.top = `${Math.max(0, rect.top - 3)}px`;
    focusRing.style.width = `${Math.max(4, rect.width + 6)}px`;
    focusRing.style.height = `${Math.max(4, rect.height + 6)}px`;
    focusRing.classList.add("visible");
    focusTimer = window.setTimeout(() => {
      focusRing?.classList.remove("visible");
    }, 1100);
  }

  window.addEventListener(
    "pointermove",
    (event) => {
      cancelAnimationFrame(animationFrame);
      clearTimeout(settleTimer);
      targetX = event.clientX;
      targetY = event.clientY;
      suppressSystemCursor();
      setCursorPosition(event.clientX, event.clientY);
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "pointerdown",
    (event) => {
      addTrail(event.clientX, event.clientY);
      pulse(event.clientX, event.clientY);
    },
    { capture: true, passive: true },
  );

  window.addEventListener(
    "click",
    (event) => {
      pulse(event.clientX, event.clientY);
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    "focusin",
    (event) => {
      showFocus(event.target);
    },
    true,
  );

  window.addEventListener(
    "resize",
    () => {
      currentX = Math.min(currentX, window.innerWidth);
      currentY = Math.min(currentY, window.innerHeight);
    },
    { passive: true },
  );

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && virtualCursorActive) {
      setCursorPosition(targetX, targetY);
    }
  });

  window.addEventListener("focus", () => {
    if (virtualCursorActive) {
      setCursorPosition(targetX, targetY);
    }
  });

  Object.defineProperty(window, "__codexVisualCursor", {
    configurable: false,
    enumerable: false,
    value: Object.freeze({
      hide() {
        hideVirtualCursor();
      },
      moveTo,
      pulse,
      restoreSystemCursor,
      showFocus,
      suppressSystemCursor,
    }),
  });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureHost, { once: true });
  } else {
    ensureHost();
  }
})();
