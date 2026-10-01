import { icon } from './icons.js';

export function qs(selector, root = document) {
  return root.querySelector(selector);
}

export function qsa(selector, root = document) {
  return [...root.querySelectorAll(selector)];
}

export function escapeHtml(value) {
  return String(value ?? '').replace(
    /[&<>'"]/g,
    (character) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character],
  );
}

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const padded = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${padded}`;
}

export function coverMarkup(song, size = '') {
  const url = song?.coverUrl;
  const classes = `cover ${size}`.trim();
  const glyph = icon('music');
  if (url)
    return `<span class="${classes} cover-image"><span class="cover-glyph">${glyph}</span><img src="${escapeHtml(
      url,
    )}" alt="" loading="lazy" onerror="this.remove()"/></span>`;
  return `<span class="${classes} cover-fallback">${glyph}</span>`;
}

/** Material ripple: attach to any element with the .ripple class via delegation. */
export function installRipple() {
  document.addEventListener('pointerdown', (event) => {
    const target = event.target instanceof Element ? event.target.closest('.ripple') : null;
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const diameter = Math.max(rect.width, rect.height) * 2;
    const span = document.createElement('span');
    span.className = 'ripple-wave';
    span.style.width = `${diameter}px`;
    span.style.height = `${diameter}px`;
    span.style.left = `${event.clientX - rect.left - diameter / 2}px`;
    span.style.top = `${event.clientY - rect.top - diameter / 2}px`;
    target.appendChild(span);
    window.setTimeout(() => span.remove(), 650);
  });
}

let snackbarTimer = 0;
export function snackbar(message, action) {
  let layer = qs('#snackbar-layer');
  if (!layer) {
    layer = document.createElement('div');
    layer.id = 'snackbar-layer';
    document.body.appendChild(layer);
  }
  layer.innerHTML = `<div class="snackbar" role="status"><span>${escapeHtml(message)}</span>${
    action
      ? `<button type="button" class="snackbar-action text-button">${escapeHtml(action.label)}</button>`
      : ''
  }</div>`;
  if (action) qs('.snackbar-action', layer)?.addEventListener('click', () => action.run());
  window.clearTimeout(snackbarTimer);
  snackbarTimer = window.setTimeout(() => {
    const current = qs('.snackbar', layer);
    if (current) {
      current.classList.add('is-leaving');
      window.setTimeout(() => (layer.innerHTML = ''), 200);
    }
  }, 3600);
}

/**
 * M3 dialog helper. Returns the dialog element on confirm (or when an element
 * matching `pickSelector` is clicked), null on dismiss.
 */
export function openDialog({
  eyebrow,
  title,
  body,
  confirmLabel = '确定',
  cancelLabel,
  danger,
  pickSelector,
  onOpen,
}) {
  return new Promise((resolve) => {
    const layer = document.createElement('div');
    layer.className = 'dialog-layer';
    layer.innerHTML = `<div class="dialog" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      ${eyebrow ? `<div class="eyebrow">${escapeHtml(eyebrow)}</div>` : ''}
      <h2>${escapeHtml(title)}</h2>
      <div class="dialog-body">${body}</div>
      <div class="dialog-actions">
        ${cancelLabel ? `<button type="button" class="text-button" data-dialog-cancel>${escapeHtml(cancelLabel)}</button>` : ''}
        <button type="button" class="${danger ? 'danger-button' : 'filled-button'}" data-dialog-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    </div>`;
    const close = (value) => {
      layer.classList.add('is-leaving');
      window.setTimeout(() => layer.remove(), 180);
      document.removeEventListener('keydown', onKey, true);
      resolve(value);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        close(null);
      }
    };
    layer.addEventListener('click', (event) => {
      if (event.target === layer) close(null);
    });
    if (pickSelector)
      layer.addEventListener('click', (event) => {
        const picked = event.target instanceof Element ? event.target.closest(pickSelector) : null;
        if (picked) close(picked);
      });
    qs('[data-dialog-confirm]', layer).addEventListener('click', () => close(layer));
    qs('[data-dialog-cancel]', layer)?.addEventListener('click', () => close(null));
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(layer);
    onOpen?.(layer);
    const focusable = qs('input, textarea, select', layer) ?? qs('[data-dialog-confirm]', layer);
    focusable?.focus();
  });
}

export async function confirmDialog(title, body, confirmLabel = '删除') {
  return Boolean(
    await openDialog({ title, body, confirmLabel, cancelLabel: '取消', danger: true }),
  );
}

export function setBusy(bar, busy) {
  if (!bar) return;
  bar.hidden = !busy;
}
