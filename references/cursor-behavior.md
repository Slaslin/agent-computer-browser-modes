# Cursor Behavior

## States

The overlay uses three practical states:

1. Active inside page
   - Native page cursor: `none`
   - Virtual cursor: visible
   - Real pointer movement: immediate virtual cursor tracking
   - Agent movement: animated through `window.__codexVisualCursor.moveTo`

2. Outside page content
   - Native cursor: restored
   - Virtual cursor: hidden
   - Applies to browser tabs, address bar, toolbar, and the Windows taskbar

3. Agent-only action while the real pointer is elsewhere
   - Virtual cursor: visible for the action
   - Native cursor over browser chrome and Windows remains unaffected

## Movement Rules

- Real pointer movement inside the page must not be interpolated. Updating the
  transform immediately keeps the pointer responsive.
- Agent movement should use `moveTo(x, y, duration)` so the user can follow the
  action.
- Leaving a child element inside the page must not hide the cursor. Only a
  pointer leave from the document root changes the state.
- Starting agent movement cancels any previous animation.
- User takeover cancels pending animation and settle timers.

## Recording

The virtual cursor is DOM content. It is recorded when the page is recorded.
The native cursor is hidden while the pointer is over page content, but a
display recorder can still add its own cursor layer. For consistent recordings:

- Record the browser content area when possible.
- Disable cursor capture in the recorder when available.
- Keep browser chrome out of the frame if switching there should restore the
  system cursor.

## Debug API

```js
window.__codexVisualCursor.moveTo(x, y, duration)
window.__codexVisualCursor.pulse(x, y)
window.__codexVisualCursor.showFocus(element)
window.__codexVisualCursor.restoreSystemCursor()
window.__codexVisualCursor.suppressSystemCursor()
window.__codexVisualCursor.hide()
```

The overlay uses a closed visual layer with `pointer-events: none`; it does not
intercept page clicks.
