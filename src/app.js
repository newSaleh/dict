import { initI18n, t, setLang, getLang, SUPPORTED_LANGS, DICTS, onLangChange } from './i18n.js';
import {
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
import {
  getRole,
  isAdmin,
  onRoleChange,
  loginAsAdmin,
  logout,
  changeAdminPin,
  ensurePinInitialized,
  ensureCloudAdminGrant,
} from './auth.js';
import { getShowNamesToUsers, setShowNamesToUsers } from './settings.js';
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
let lastSearchQuery = ''; // للحفاظ على نص البحث عند إعادة رسم الصفحة (مثلًا بعد مزامنة في الخلفية)
let restoreFocusToSearch = false;

const appRoot = document.getElementById('app');

function canSeeNames() {
  return isAdmin() || getShowNamesToUsers();
}

let syncInProgress = false;
let anotherSyncRequested = false;

// مزامنة صامتة في الخلفية: لا تُقاطع المستخدم، وتُحدّث الشاشة فقط إن نجحت.
// تُستخدم بعد أي تعديل محلي (إن توفر إنترنت) وعند بدء التطبيق. إذا استُدعيت
// أثناء تنفيذ مزامنة سابقة، لا تُهمَل: تُعاد تلقائيًا بعد انتهاء الحالية حتى
// لا يضيع تعديل حدث في تلك اللحظة (مثل حفظ متأخر لطلب لم يُرفع بعد).
async function triggerBackgroundSync() {
  if (!navigator.onLine) return;
  if (syncInProgress) {
    anotherSyncRequested = true;
    return;
  }
  syncInProgress = true;
  try {
    const { syncNow } = await import('./sync.js');
    await syncNow();
    await refreshData();
    render();
  } catch {
    // لا بأس، التطبيق يعمل محليًا بدون مشاكل، سيُعاد المحاولة لاحقًا
  } finally {
    syncInProgress = false;
    if (anotherSyncRequested) {
      anotherSyncRequested = false;
      triggerBackgroundSync();
    }
  }
}

async function handleManualSync() {
  if (!navigator.onLine) {
    toast(t('syncOffline'));
    return;
  }
  if (syncInProgress) {
    toast(t('syncing'));
    return;
  }
  syncInProgress = true;
  toast(t('syncing'));
  try {
    const { syncNow } = await import('./sync.js');
    const result = await syncNow();
    await refreshData();
    render();
    if (result.errors.length && !result.pulledSuppliers && !result.pushedSuppliers && !result.pushedRequests) {
      showSyncErrorDetails(result.errors);
    } else {
      toast(t('syncDone'));
    }
  } catch (err) {
    showSyncErrorDetails([err]);
  } finally {
    syncInProgress = false;
  }
}

function showSyncErrorDetails(errors) {
  const messages = [...new Set(errors.map((e) => String(e?.message || e)))];
  openModal({
    title: t('syncFailed'),
    body: messages.map((m) => el('p', { class: 'sync-error-text', text: m })),
    actions: [{ label: t('close'), variant: 'btn-primary', onClick: closeModal }],
  });
}

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
  restoreFocusToSearch = !!document.activeElement?.classList?.contains('search-input');
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
      el('div', { class: 'status-sync-group' }, [
        el('span', { class: `status-dot ${online ? 'online' : 'offline'}`, text: online ? t('onlineBadge') : t('offlineBadge') }),
        el('button', { class: 'sync-btn', type: 'button', 'aria-label': t('syncButton'), onClick: handleManualSync }, [
          el('span', { text: '🔄' }),
          el('span', { text: t('syncLabel') }),
        ]),
      ]),
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
    value: lastSearchQuery,
    'aria-label': t('searchPlaceholder'),
  });
  const hint = el('div', { class: 'search-hint', text: t('searchHint') });
  const resultsContainer = el('div', { class: 'results-container' });

  searchWrap.appendChild(input);
  searchWrap.appendChild(hint);
  root.appendChild(searchWrap);
  root.appendChild(resultsContainer);

  if (restoreFocusToSearch) {
    setTimeout(() => {
      input.focus();
      const pos = input.value.length;
      input.setSelectionRange?.(pos, pos);
    }, 0);
  }

  function update() {
    lastSearchQuery = input.value;
    const active = suppliers.filter((s) => s.status !== 'deleted');
    const results = searchSuppliers(active, input.value);
    clear(resultsContainer);
    resultsContainer.appendChild(renderResultsCount(results.length));
    if (!results.length) {
      resultsContainer.appendChild(renderEmptyState(input.value.trim().length > 0));
      return;
    }
    resultsContainer.appendChild(
      renderListExportBar(getRole(), canSeeNames(), results.length, (options) => handleExportList(results, options))
    );
    const list = el('div', { class: 'cards-list' });
    for (const supplier of results) {
      list.appendChild(
        renderSupplierCard(supplier, {
          role: getRole(),
          canSeeName: canSeeNames(),
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
          triggerBackgroundSync();
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
    showName: isDirect || canSeeNames(),
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
  const { codeConflicts, nameConflicts, brandConflicts } = findDuplicates(suppliers, data, excludeId);

  if (codeConflicts.length || nameConflicts.length || brandConflicts.length) {
    showDuplicateWarning({ codeConflicts, nameConflicts, brandConflicts, onContinue: () => finalizeSubmit({ mode, data, target }) });
  } else {
    finalizeSubmit({ mode, data, target });
  }
}

function showDuplicateWarning({ codeConflicts, nameConflicts, brandConflicts, onContinue }) {
  const body = [];
  for (const c of codeConflicts) {
    body.push(el('p', { class: 'warning-text', text: t('possibleDuplicateCode', { code: c.code }) }));
    body.push(el('p', { class: 'warning-supplier', text: `${c.supplier.name}` }));
  }
  for (const n of nameConflicts) {
    body.push(el('p', { class: 'warning-text', text: t('possibleDuplicateName') }));
    body.push(el('p', { class: 'warning-supplier', text: n.supplier.name }));
  }
  for (const b of brandConflicts) {
    body.push(el('p', { class: 'warning-text', text: t('possibleDuplicateBrand', { brand: b.brand }) }));
    body.push(el('p', { class: 'warning-supplier', text: b.supplier.name || b.supplier.codes?.[0]?.code || '' }));
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
  triggerBackgroundSync();
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
          triggerBackgroundSync();
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
          triggerBackgroundSync();
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
            await ensureCloudAdminGrant(pinInput.value);
            triggerBackgroundSync();
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
    root.appendChild(el('h3', { class: 'section-title', text: t('privacySection') }));
    const showNamesCheckbox = el('input', {
      type: 'checkbox',
      class: 'hide-name-checkbox',
      checked: getShowNamesToUsers(),
    });
    root.appendChild(
      el('div', { class: 'settings-row' }, [
        el('label', { class: 'hide-name-label' }, [showNamesCheckbox, ' ' + t('showNamesToUsersOption')]),
      ])
    );
    root.appendChild(el('div', { class: 'hide-name-hint', text: t('showNamesToUsersHint') }));
    showNamesCheckbox.addEventListener('change', () => {
      setShowNamesToUsers(showNamesCheckbox.checked);
      render();
      triggerBackgroundSync();
    });

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
    if (!Array.isArray(data.suppliers)) throw new Error('Invalid data file');

    const conflicts = findImportConflicts(data.suppliers);
    if (conflicts.length) {
      showImportDuplicatesWarning(conflicts, () => finalizeImport(data));
    } else {
      await finalizeImport(data);
    }
  } catch (err) {
    console.error(err);
    toast(String(err.message || err));
  } finally {
    e.target.value = '';
  }
}

// يفحص كل مورد في ملف الاستيراد مقابل الموردين الحاليين ومقابل بعضهم البعض
// (حتى لا يفوتنا تكرار بين سجلين ضمن نفس الملف المستورَد)
function findImportConflicts(incomingSuppliers) {
  const conflicts = [];
  const referencePool = [...suppliers];
  const existingIds = new Set(suppliers.map((s) => s.id));
  for (const incoming of incomingSuppliers) {
    // معرّف موجود مسبقًا يعني هذا تحديث/استعادة نسخة احتياطية لنفس السجل،
    // وليس موردًا جديدًا يُحتمل أن يكون مكررًا
    if (!existingIds.has(incoming.id)) {
      const { codeConflicts, nameConflicts, brandConflicts } = findDuplicates(referencePool, incoming, incoming.id);
      if (codeConflicts.length || nameConflicts.length || brandConflicts.length) {
        conflicts.push({ incoming, codeConflicts, nameConflicts, brandConflicts });
      }
    }
    referencePool.push(incoming);
  }
  return conflicts;
}

function showImportDuplicatesWarning(conflicts, onContinue) {
  const body = [el('p', { class: 'warning-text', text: t('importDuplicatesFound', { count: conflicts.length }) })];
  for (const c of conflicts) {
    const label = c.incoming.name || c.incoming.codes?.[0]?.code || '';
    const reasons = [
      ...c.codeConflicts.map((x) => t('possibleDuplicateCode', { code: x.code })),
      ...c.nameConflicts.map(() => t('possibleDuplicateName')),
      ...c.brandConflicts.map((x) => t('possibleDuplicateBrand', { brand: x.brand })),
    ];
    body.push(el('p', { class: 'warning-supplier', text: label }));
    body.push(el('p', { class: 'warning-text', text: reasons.join(' / ') }));
  }
  openModal({
    title: t('possibleDuplicateTitle'),
    body,
    actions: [
      { label: t('cancel'), variant: 'btn-secondary', onClick: closeModal },
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

async function finalizeImport(data) {
  await importAllData(data);
  await refreshData();
  toast(t('save'));
  render();
  triggerBackgroundSync();
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
  await refreshData();
  onLangChange(() => render());
  onRoleChange(() => render());
  window.addEventListener('online', () => {
    render();
    triggerBackgroundSync();
  });
  window.addEventListener('offline', render);
  render();
  triggerBackgroundSync();

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((reg) => reg.update())
      .catch((err) => console.warn('SW registration failed', err));

    // بمجرد أن يتولى Service Worker جديد التحكم (بعد نشر تحديث)، أعد تحميل
    // الصفحة تلقائيًا مرة واحدة حتى يحصل المستخدم على أحدث نسخة دون أي إجراء
    // يدوي منه (تفريغ الذاكرة المؤقتة، إغلاق وإعادة فتح...).
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
  }
}

boot();
