// Whether a canvas is on the screen. A room's animation loop asks before it draws, so a picture scrolled out of sight
// (a long file read to the end, the notebook under a viewscreen) costs nothing while nobody can see it.
// The answer is an object whose `on` is kept up to date: true while any of the canvas is on the screen or within
// 120 px of it, so it is already moving when it scrolls back in. A browser without IntersectionObserver always
// says yes, and draws as it always did.
export function onScreen(canvas) {
  const seen = { on: true };
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { seen.on = entries[entries.length - 1].isIntersecting; }, { rootMargin: '120px' }).observe(canvas);
  }
  return seen;
}
