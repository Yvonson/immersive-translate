"use strict";
const readingShortcuts = (() => {
  function chord(event) {
    if (!/^(Key[A-Z]|Digit[0-9])$/.test(event.code)) return "";
    return [event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift", event.metaKey && "Command", event.code.replace(/^(Key|Digit)/, "")].filter(Boolean).join("+");
  }
  function editable(node) { return !!(node && (node.isContentEditable || node.closest("input,textarea,select,[contenteditable]:not([contenteditable=false]),[role=textbox]"))); }
  return { chord, editable };
})();
