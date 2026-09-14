import { initI18n, t, setLang, getLang, SUPPORTED_LANGS, DICTS, onLangChange } from './i18n.js';
import {
  ensureSeeded,
  getAllSuppliers,
  getAllRequests,
  createSupplierApproved,
  updateSupplierApproved,
  deleteSupplier,
  createRequest,
  reviewRequest,
  exportAllData,
  importAllData,
  resetToSeed,
} from './db.js';
import { getRole, isAdmin, onRoleChange, loginAsAdmin, logout, changeAdminPin, ensurePinInitialized } from './auth.js';
import { searchSuppliers } from './search.js';
import { findDuplicates } from './duplicates.js';
import { exportSuppliersListAsImages } from './export-image.js';
import { el, clear, debounce } from './utils.js';
import {
  renderSupplierCard,
  renderResultsCount,
  renderEmptyState,
  buildSupplierForm,
  renderRequestCard,
  renderListExportBar,
} from './render.js';
import { openModal, closeModal, toast } from './modal.js';

const ACTOR_NAME_KEY = 'sdc_last_actor_name';

let suppliers = [];
let requests = [];
let currentView = 'search';
let editingSupplier = null; // للمسؤول: تعديل مباشر
let suggestingEditFor = null; // للمستخدم: اقتراح تعديل

const appRoot = document.getElementById('app');

async function refreshData() {
  [suppliers, requests] = await Promise.all([getAllSuppliers(), getAllRequests()]);
}

function getActorName() {
  return localStorage.getItem(ACTOR_NAME_KEY) || '';
}
function setActorName(v) {
  if (v) localStorage.setItem(ACTOR_NAME_KEY, v);
}

function navigate(view) {
  currentView = view;
  editingSupplier = null;
  suggestingEditFor = null;
  render();
}

function render() {
  clear(appRoot);
  appRoot.appendChild(renderHeader());
  appRoot.appendChild(renderNav());
  const viewRoot = el('main', { class: 'view-root', id: 'view-root' });
  appRoot.appendChild(viewRoot);
  renderCurrentView(viewRoot);
}

function renderHeader() {
  const online = navigator.onLine;
  const langBtns = el(
    'div',
    { class: 'lang-switch' },
    SUPPORTED_LANGS.map((code) =>
      el('button', {
        class: `lang-btn ${getLang() === code ? 'active' : ''}`,
        type: 'button',
        text: DICTS[code].langName,
        onClick: () => setLang(code),
      })
    )
  );

  const roleControls = el('div', { class: 'role-controls' }, [
    el('span', { class: `role-badge ${isAdmin() ? 'admin' : ''}`, text: isAdmin() ? t('adminMode') : t('userMode') }),
    isAdmin()
      ? el('button', { class: 'btn btn-link', type: 'button', text: t('logout'), onClick: handleLogout })
      : el('button', { class: 'btn btn-link', type: 'button', text: t('loginAsAdmin'), onClick: handleLoginPrompt }),
  ]);

  return el('header', { class: 'app-header' }, [
    el('div', { class: 'app-header-top' }, [
      el('span', { class: `status-dot ${online ? 'online' : 'offline'}`, text: online ? t('onlineBadge') : t('offlineBadge') }),
      langBtns,
    ]),
    el('h1', { class: 'app-title', text: t('appTitle') }),
    roleControls,
  ]);
}

function renderNav() {
  const items = [
    { id: 'search', label: t('navSearch') },
    { id: 'add', label: t('navAdd') },
  ];
  if (isAdmin()) items.push({ id: 'review', label: t('navReview'), badge: requests.filter((r) => r.status === 'pending').length });
  items.push({ id: 'settings', label: t('navSettings') });

  return el(
    'nav',
    { class: 'app-nav' },
    items.map((it) =>
      el('button', {
        class: `nav-btn ${currentView === it.id ? 'active' : ''}`,
        type: 'button',
        onClick: () => navigate(it.id),
      }, [
        it.label,
        it.badge ? el('span', { class: 'nav-badge', text: String(it.badge) }) : null,
      ])
    )
  );
}

function renderCurrentView(root) {
  if (currentView === 'search') return renderSearchView(root);
  if (currentView === 'add') return renderAddView(root);
  if (currentView === 'edit') return renderEditView(root);
  if (currentView === 'review') return isAdmin() ? renderReviewView(root) : navigate('search');
  if (currentView === 'settings') return renderSettingsView(root);
}

// ---------------- البحث ----------------

function renderSearchView(root) {
  const searchWrap = el('div', { class: 'search-wrap' });
  const input = el('input', {
    type: 'search',
    class: 'search-input',
    placeholder: t('searchPlaceholder'),
    autofocus: true,
    'aria-label': t('searchPlaceholder'),
  });
  const hint = el('div', { class: 'search-hint', text: t('searchHint') });
  const resultsContainer = el('div', { class: 'results-container' });

  searchWrap.appendChild(input);
  searchWrap.appendChild(hint);
  root.appendChild(searchWrap);
  root.appendChild(resultsContainer);

  function update() {
    const active = suppliers.filter((s) => s.status !== 'deleted');
    const results = searchSuppliers(active, input.value);
    clear(resultsContainer);
    resultsContainer.appendChild(renderResultsCount(results.length));
    if (!results.length) {
      resultsContainer.appendChild(renderEmptyState(input.value.trim().length > 0));
      return;
    }
    resultsContainer.appendChild(
      renderListExportBar(getRole(), results.length, (options) => handleExportList(results, options))
    );
    const list = el('div', { class: 'cards-list' });
    for (const supplier of results) {
      list.appendChild(
        renderSupplierCard(supplier, {
          role: getRole(),
          onSuggestEdit: (s) => {
            suggestingEditFor = s;
            currentView = 'edit';
            render();
          },
          onEdit: (s) => {
            editingSupplier = s;
            currentView = 'edit';
            render();
          },
          onDelete: handleDeleteSupplier,
        })
      );
    }
    resultsContainer.appendChild(list);
  }

  input.addEventListener('input', debounce(update, 80));
  update();
}

async function handleExportList(results, options) {
  try {
    toast(t('generatingImages'));
    await exportSuppliersListAsImages(results, options);
    toast(t('imagesReady'));
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  }
}

async function handleDeleteSupplier(supplier) {
  openModal({
    title: t('delete'),
    body: [el('p', { text: t('deleteConfirm') })],
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('delete'),
        variant: 'btn-danger',
        onClick: async () => {
          await deleteSupplier(supplier.id);
          await refreshData();
          closeModal();
          toast(t('approved'));
          render();
        },
      },
    ],
  });
}

// ---------------- إضافة مورد ----------------

function renderAddView(root) {
  root.appendChild(el('h2', { class: 'view-title', text: isAdmin() ? t('addSupplierTitle') : t('addRequestTitle') }));
  const wrap = el('div', { class: 'form-wrap' });
  if (!isAdmin()) wrap.appendChild(buildActorNameField());
  const form = buildSupplierForm({
    initial: null,
    submitLabel: isAdmin() ? t('saveDirectly') : t('submitRequest'),
    onSubmit: (data) => handleSupplierSubmit({ mode: 'add', data, target: null }),
  });
  wrap.appendChild(form);
  root.appendChild(wrap);
}

function buildActorNameField() {
  const input = el('input', {
    type: 'text',
    class: 'input',
    placeholder: t('yourNameOptional'),
    value: getActorName(),
    id: 'actor-name-input',
  });
  return el('div', { class: 'actor-name-field' }, [
    el('label', { class: 'form-label', text: t('yourNameOptional') }),
    input,
  ]);
}

function renderEditView(root) {
  const supplier = editingSupplier || suggestingEditFor;
  if (!supplier) return navigate('search');
  const isDirect = !!editingSupplier;
  root.appendChild(el('h2', { class: 'view-title', text: isDirect ? t('editSupplierTitleAdmin') : t('editRequestTitle') }));
  const wrap = el('div', { class: 'form-wrap' });
  if (!isDirect) wrap.appendChild(buildActorNameField());
  const form = buildSupplierForm({
    initial: supplier,
    submitLabel: isDirect ? t('save') : t('submitRequest'),
    showName: isDirect,
    onSubmit: (data) => handleSupplierSubmit({ mode: 'edit', data, target: supplier }),
  });
  wrap.appendChild(form);
  root.appendChild(
    el('button', { class: 'btn btn-link', type: 'button', text: t('back'), onClick: () => navigate('search') })
  );
  root.appendChild(wrap);
}

function handleSupplierSubmit({ mode, data, target }) {
  const excludeId = mode === 'edit' ? target.id : null;
  const { codeConflicts, nameConflicts } = findDuplicates(suppliers, data, excludeId);

  if (codeConflicts.length || nameConflicts.length) {
    showDuplicateWarning({ codeConflicts, nameConflicts, onContinue: () => finalizeSubmit({ mode, data, target }) });
  } else {
    finalizeSubmit({ mode, data, target });
  }
}

function showDuplicateWarning({ codeConflicts, nameConflicts, onContinue }) {
  const body = [];
  for (const c of codeConflicts) {
    body.push(el('p', { class: 'warning-text', text: t('possibleDuplicateCode', { code: c.code }) }));
    body.push(el('p', { class: 'warning-supplier', text: `${c.supplier.name}` }));
  }
  for (const n of nameConflicts) {
    body.push(el('p', { class: 'warning-text', text: t('possibleDuplicateName') }));
    body.push(el('p', { class: 'warning-supplier', text: n.supplier.name }));
  }
  openModal({
    title: t('possibleDuplicateTitle'),
    body,
    actions: [
      { label: t('goBackAndEdit'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('continueAnyway'),
        variant: 'btn-primary',
        onClick: () => {
          closeModal();
          onContinue();
        },
      },
    ],
  });
}

async function finalizeSubmit({ mode, data, target }) {
  const actorInput = document.getElementById('actor-name-input');
  const actorName = actorInput ? actorInput.value.trim() : '';
  setActorName(actorName);
  const admin = isAdmin();

  if (mode === 'add') {
    if (admin) {
      await createSupplierApproved({ ...data, actor: 'admin' });
    } else {
      await createRequest({ type: 'add', proposedData: data, actor: actorName });
    }
  } else {
    if (admin) {
      await updateSupplierApproved(target.id, data, 'admin');
    } else {
      const originalData = { name: target.name, codes: target.codes, brands: target.brands };
      await createRequest({ type: 'edit', targetSupplierId: target.id, proposedData: data, originalData, actor: actorName });
    }
  }

  await refreshData();
  showSubmitConfirmation(admin);
}

function showSubmitConfirmation(admin) {
  openModal({
    title: admin ? t('approved') : t('requestSubmittedTitle'),
    body: [el('p', { text: admin ? t('savedDirectlyBody') : t('requestSubmittedBody') })],
    actions: [
      {
        label: t('close'),
        variant: 'btn-primary',
        onClick: () => {
          closeModal();
          navigate('search');
        },
      },
    ],
  });
}

// ---------------- المراجعة ----------------

function renderReviewView(root) {
  root.appendChild(el('h2', { class: 'view-title', text: t('reviewTitle') }));
  const pending = requests.filter((r) => r.status === 'pending');
  const adds = pending.filter((r) => r.type === 'add');
  const edits = pending.filter((r) => r.type === 'edit');

  if (!pending.length) {
    root.appendChild(el('div', { class: 'empty-state' }, [el('div', { class: 'empty-title', text: t('reviewEmpty') })]));
    return;
  }

  if (adds.length) {
    root.appendChild(el('h3', { class: 'section-title', text: t('reviewPendingAdds') }));
    const list = el('div', { class: 'cards-list' });
    for (const r of adds) list.appendChild(renderRequestCard(r, { onApprove: handleApprove, onReject: handleReject }));
    root.appendChild(list);
  }
  if (edits.length) {
    root.appendChild(el('h3', { class: 'section-title', text: t('reviewPendingEdits') }));
    const list = el('div', { class: 'cards-list' });
    for (const r of edits) list.appendChild(renderRequestCard(r, { onApprove: handleApprove, onReject: handleReject }));
    root.appendChild(list);
  }
}

function handleApprove(request) {
  openModal({
    title: t('approve'),
    body: [el('p', { text: t('confirmApprove') })],
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('approve'),
        variant: 'btn-primary',
        onClick: async () => {
          await reviewRequest(request.id, { approve: true, reviewer: 'admin' });
          await refreshData();
          closeModal();
          toast(t('approved'));
          render();
        },
      },
    ],
  });
}

function handleReject(request) {
  const noteInput = el('input', { type: 'text', class: 'input', placeholder: t('rejectReasonPrompt') });
  openModal({
    title: t('reject'),
    body: [el('p', { text: t('confirmReject') }), noteInput],
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('reject'),
        variant: 'btn-danger',
        onClick: async () => {
          await reviewRequest(request.id, { approve: false, reviewer: 'admin', note: noteInput.value.trim() });
          await refreshData();
          closeModal();
          toast(t('rejected'));
          render();
        },
      },
    ],
  });
}

// ---------------- تسجيل الدخول كمسؤول ----------------

function handleLoginPrompt() {
  const pinInput = el('input', { type: 'password', class: 'input', placeholder: t('pin'), inputmode: 'numeric' });
  const errorMsg = el('p', { class: 'form-error', hidden: true, text: t('wrongPin') });
  openModal({
    title: t('loginAsAdmin'),
    body: [pinInput, errorMsg],
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('submit'),
        variant: 'btn-primary',
        onClick: async () => {
          const ok = await loginAsAdmin(pinInput.value);
          if (ok) {
            closeModal();
            render();
          } else {
            errorMsg.hidden = false;
          }
        },
      },
    ],
  });
  setTimeout(() => pinInput.focus(), 50);
}

function handleLogout() {
  logout();
  navigate('search');
}

// ---------------- الإعدادات ----------------

function renderSettingsView(root) {
  root.appendChild(el('h2', { class: 'view-title', text: t('settingsTitle') }));

  root.appendChild(el('h3', { class: 'section-title', text: t('language') }));
  root.appendChild(
    el(
      'div',
      { class: 'lang-switch lang-switch-settings' },
      SUPPORTED_LANGS.map((code) =>
        el('button', {
          class: `lang-btn ${getLang() === code ? 'active' : ''}`,
          type: 'button',
          text: DICTS[code].langName,
          onClick: () => setLang(code),
        })
      )
    )
  );

  if (isAdmin()) {
    root.appendChild(el('h3', { class: 'section-title', text: t('changePin') }));
    const newPinInput = el('input', { type: 'password', class: 'input', placeholder: t('newPin'), inputmode: 'numeric' });
    root.appendChild(
      el('div', { class: 'settings-row' }, [
        newPinInput,
        el('button', {
          class: 'btn btn-primary',
          type: 'button',
          text: t('save'),
          onClick: async () => {
            if (!newPinInput.value.trim()) return;
            await changeAdminPin(newPinInput.value.trim());
            toast(t('pinChanged'));
            newPinInput.value = '';
          },
        }),
      ])
    );

    root.appendChild(el('h3', { class: 'section-title', text: t('dataManagement') }));
    root.appendChild(
      el('div', { class: 'settings-row' }, [
        el('button', {
          class: 'btn btn-outline',
          type: 'button',
          text: t('exportData'),
          onClick: handleExportData,
        }),
        el('input', {
          type: 'file',
          accept: 'application/json',
          id: 'import-file-input',
          class: 'hidden-file-input',
          onChange: handleImportData,
        }),
        el('button', {
          class: 'btn btn-outline',
          type: 'button',
          text: t('importData'),
          onClick: () => document.getElementById('import-file-input').click(),
        }),
        el('button', {
          class: 'btn btn-danger-outline',
          type: 'button',
          text: t('seedReset'),
          onClick: handleSeedReset,
        }),
      ])
    );
  }
}

async function handleExportData() {
  const data = await exportAllData();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: `supplier-data-${Date.now()}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

async function handleImportData(e) {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await importAllData(data);
    await refreshData();
    toast(t('save'));
    render();
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  }
}

function handleSeedReset() {
  openModal({
    title: t('seedReset'),
    body: [el('p', { text: t('deleteConfirm') })],
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
      {
        label: t('seedReset'),
        variant: 'btn-danger',
        onClick: async () => {
          await resetToSeed();
          await refreshData();
          closeModal();
          render();
        },
      },
    ],
  });
}

// ---------------- التشغيل ----------------

async function boot() {
  initI18n();
  await ensurePinInitialized();
  await ensureSeeded();
  await refreshData();
  onLangChange(() => render());
  onRoleChange(() => render());
  window.addEventListener('online', render);
  window.addEventListener('offline', render);
  render();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch((err) => console.warn('SW registration failed', err));
  }
}

boot();
