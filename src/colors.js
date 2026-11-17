export function calendarColor(value) { return /^#[0-9a-f]{6}$/i.test(value || '') ? value : null; }
export function tintColor(hex) {
  return '#' + hex.slice(1).match(/../g).map(component => Math.round(parseInt(component, 16) * .15 + 255 * .85).toString(16).padStart(2, '0')).join('');
}
export function applyCalendarColors(root, colors) {
  root.querySelectorAll('[data-calendar]').forEach(element => {
    const color = calendarColor(colors[element.dataset.calendar]);
    if (!color) return;
    element.style.setProperty('--person', color);
    element.style.setProperty('--tint', tintColor(color));
    if (element.classList.contains('event')) element.style.color = '#202124';
  });
}
