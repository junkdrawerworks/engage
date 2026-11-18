// Sending a link to something in Engage: a creature, a course. The phone's own share sheet where there is one;
// otherwise the link is copied and the button says so for a moment; and where neither is allowed (some embedded
// viewers), the link is shown, selected, ready to copy by hand.

// Links always point at the live site, so the single-file copies share the real thing and not themselves.
export const LIVE = 'https://junkdrawer.works/engage/';

// `button` is the button that was pressed: it carries the "Link copied" note. Resolves to how it went:
// 'shared', 'cancelled', 'copied' or 'shown'.
export async function share(button, { title, text, url }) {
  if (navigator.share) {
    try { await navigator.share({ title, text, url }); return 'shared'; } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled'; // the person closed the sheet
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    note(button, 'Link copied');
    return 'copied';
  } catch { /* no clipboard here either */ }
  let field = button.parentNode.querySelector('.share-link');
  if (!field) {
    field = document.createElement('input');
    field.className = 'share-link';
    field.readOnly = true;
    field.setAttribute('aria-label', 'Link to copy');
    button.after(field);
  }
  field.value = url;
  field.focus({ preventScroll: true });
  field.select();
  return 'shown';
}

// The button reads `text` for two seconds, then what it read before.
function note(button, text) {
  button.dataset.label ??= button.textContent;
  button.textContent = text;
  clearTimeout(button.noteTimer);
  button.noteTimer = setTimeout(() => { button.textContent = button.dataset.label; delete button.dataset.label; }, 2000);
}
