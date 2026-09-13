import { el, clear } from './utils.js';
import { t } from './i18n.js';

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = el('div', { class: 'modal-overlay', id: 'modal-overlay' });
  document.body.appendChild(overlayEl);
  overlayEl.addEventListener('click', (e) => {
    if (e.target === overlayEl) closeModal();
  });
  return overlayEl;
}

export function closeModal() {
  if (overlayEl) {
    clear(overlayEl);
    overlayEl.classList.remove('open');
  }
}

export function openModal({ title, body, actions = [], dismissible = true }) {
  const overlay = ensureOverlay();
  clear(overlay);
  const box = el('div', { class: 'modal-box', role: 'dialog', 'aria-modal': 'true' });
  const header = el('div', { class: 'modal-header' }, [
    el('h2', { text: title }),
    dismissible
      ? el('button', {
          class: 'icon-btn modal-close',
          type: 'button',
          'aria-label': t('close'),
          text: '✕',
          onClick: closeModal,
        })
      : null,
  ]);
  const bodyWrap = el('div', { class: 'modal-body' }, body);
  const footer = el(
    'div',
    { class: 'modal-footer' },
    actions.map((a) =>
      el('button', {
        class: `btn ${a.variant || 'btn-secondary'}`,
        type: 'button',
        text: a.label,
        onClick: () => a.onClick?.(),
      })
    )
  );
  box.appendChild(header);
  box.appendChild(bodyWrap);
  if (actions.length) box.appendChild(footer);
  overlay.appendChild(box);
  overlay.classList.add('open');
  return { close: closeModal, box };
}

export function toast(message) {
  const container = document.getElementById('toast-container') || (() => {
    const c = el('div', { id: 'toast-container', class: 'toast-container' });
    document.body.appendChild(c);
    return c;
  })();
  const item = el('div', { class: 'toast', text: message });
  container.appendChild(item);
  requestAnimationFrame(() => item.classList.add('show'));
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 300);
  }, 2600);
}
