export const clampZoom = value => Math.max(.5, Math.min(4, Number.isFinite(value) ? value : 1));

export function attachTimelineZoom(scroll, { scale = 1, fullscreen = () => false, onChange = () => {}, topFraction = 7 / 24 } = {}) {
  const canvas = scroll.querySelector('.time-canvas');
  let zoom = clampZoom(scale), height = 1152, pinch = null, suppressUntil = 0;
  const minZoom = () => fullscreen() ? 1 : .5;
  function apply(next, focalY = scroll.clientHeight / 2, timeFraction = (scroll.scrollTop + focalY) / height, commit = true) {
    zoom = Math.max(minZoom(), clampZoom(next));
    height = Math.max(scroll.clientHeight, (fullscreen() ? scroll.clientHeight : 1152) * zoom);
    canvas.style.height = height + 'px';
    scroll.style.overflowY = height > scroll.clientHeight + 1 ? 'auto' : 'hidden';
    scroll.scrollTop = timeFraction * height - focalY;
    onChange(zoom, commit);
  }
  const touches = event => {
    const [a, b] = event.touches;
    return { distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), y: (a.clientY + b.clientY) / 2 - scroll.getBoundingClientRect().top };
  };
  function start(event) {
    if (event.touches.length !== 2) return;
    const point = touches(event);
    if (point.distance < 8) return;
    event.preventDefault();
    pinch = { distance: point.distance, scale: zoom, time: (scroll.scrollTop + point.y) / height };
    suppressUntil = Infinity;
  }
  function move(event) {
    if (!pinch || event.touches.length !== 2) return;
    event.preventDefault();
    const point = touches(event);
    apply(pinch.scale * point.distance / pinch.distance, point.y, pinch.time, false);
  }
  function end() {
    if (!pinch) return;
    pinch = null; suppressUntil = Date.now() + 350; onChange(zoom, true);
  }
  function click(event) { if (Date.now() < suppressUntil) { event.preventDefault(); event.stopPropagation(); } }
  scroll.addEventListener('touchstart', start, { passive: false });
  scroll.addEventListener('touchmove', move, { passive: false });
  scroll.addEventListener('touchend', end);
  scroll.addEventListener('touchcancel', end);
  scroll.addEventListener('click', click, true);
  apply(zoom, 0, topFraction, false);
  return {
    step: factor => apply(zoom * factor),
    reset: () => apply(1),
    snapshot: () => ({ topFraction: scroll.scrollTop / height }),
    resize: () => apply(zoom, scroll.clientHeight / 2),
    destroy: () => {
      scroll.removeEventListener('touchstart', start); scroll.removeEventListener('touchmove', move);
      scroll.removeEventListener('touchend', end); scroll.removeEventListener('touchcancel', end);
      scroll.removeEventListener('click', click, true);
    }
  };
}
