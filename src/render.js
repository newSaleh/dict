import { el, clear, formatDate } from './utils.js';
import { t, getLang } from './i18n.js';

export function renderListExportBar(role, count, onExport) {
  let hideNamesCheckbox = null;
  const children = [];
  if (role === 'admin') {
    hideNamesCheckbox = el('input', { type: 'checkbox', class: 'hide-name-checkbox' });
    children.push(el('label', { class: 'hide-name-label' }, [hideNamesCheckbox, ' ' + t('hideNamesOnExport')]));
  }
  children.push(
    el('button', {
      class: 'btn btn-outline btn-export-list',
      type: 'button',
      text: t('exportListImage'),
      onClick: () => onExport({ hideName: hideNamesCheckbox?.checked || false }),
    })
  );
  return el('div', { class: 'list-export-bar' }, children);
}

export function renderSupplierCard(supplier, { role, onSuggestEdit, onEdit, onDelete }) {
  const codesBlock = el('div', { class: 'card-field' }, [
    el('div', { class: 'field-label', text: t('fieldSupplierCodes') }),
    el(
      'div',
      { class: 'codes-list' },
      (supplier.codes || []).map((c) =>
        el('span', { class: 'code-chip' }, [
          el('span', { class: 'code-chip-code', text: c.code }),
          c.city ? el('span', { class: 'code-chip-city', text: c.city }) : null,
        ])
      )
    ),
  ]);

  const nameBlock = el('div', { class: 'card-field' }, [
    el('div', { class: 'field-label', text: t('fieldSupplierName') }),
    el('div', { class: 'field-value supplier-name', text: supplier.name }),
  ]);

  const brandsBlock = el('div', { class: 'card-field' }, [
    el('div', { class: 'field-label', text: t('fieldBrands') }),
    el(
      'div',
      { class: 'brands-list' },
      (supplier.brands || []).map((b) => el('span', { class: 'brand-chip', text: b }))
    ),
  ]);

  const actions = el('div', { class: 'card-actions' }, [
    role === 'admin'
      ? el('button', {
          class: 'btn btn-outline',
          type: 'button',
          text: t('editSupplierTitleAdmin'),
          onClick: () => onEdit(supplier),
        })
      : el('button', {
          class: 'btn btn-outline',
          type: 'button',
          text: t('suggestEdit'),
          onClick: () => onSuggestEdit(supplier),
        }),
    role === 'admin'
      ? el('button', {
          class: 'btn btn-danger-outline',
          type: 'button',
          text: t('delete'),
          onClick: () => onDelete(supplier),
        })
      : null,
  ]);

  return el('article', { class: 'card supplier-card' }, [codesBlock, nameBlock, brandsBlock, actions]);
}

export function renderResultsCount(count) {
  return el('div', { class: 'results-count', text: t('resultsCount', { count }) });
}

export function renderEmptyState(hasQuery) {
  return el('div', { class: 'empty-state' }, [
    el('div', { class: 'empty-icon', text: '🔎' }),
    el('div', { class: 'empty-title', text: hasQuery ? t('noResults') : t('noSuppliersYet') }),
    hasQuery ? el('div', { class: 'empty-hint', text: t('noResultsHint') }) : null,
  ]);
}

// ------- نموذج إضافة / تعديل مورد -------

export function buildSupplierForm({ initial, onSubmit, submitLabel }) {
  const nameInput = el('input', {
    type: 'text',
    class: 'input',
    placeholder: t('addNamePlaceholder'),
    value: initial?.name || '',
    required: true,
  });

  const codesContainer = el('div', { class: 'dynamic-rows' });
  const brandsContainer = el('div', { class: 'dynamic-rows' });

  function addCodeRow(code = '', city = '') {
    const codeInput = el('input', {
      type: 'text',
      class: 'input input-code',
      placeholder: t('addCodePlaceholder'),
      value: code,
    });
    const cityInput = el('input', {
      type: 'text',
      class: 'input input-city',
      placeholder: t('addCityPlaceholder'),
      value: city,
    });
    const removeBtn = el('button', {
      class: 'icon-btn remove-row-btn',
      type: 'button',
      'aria-label': t('removeItem'),
      text: '✕',
      onClick: () => {
        if (codesContainer.children.length > 1) row.remove();
      },
    });
    const row = el('div', { class: 'dynamic-row' }, [codeInput, cityInput, removeBtn]);
    row._get = () => ({ code: codeInput.value.trim(), city: cityInput.value.trim() });
    row._cityInput = cityInput;
    codesContainer.appendChild(row);
  }

  // معظم الموردين الذين لديهم أكثر من رقم لديهم رقم في الرياض وآخر في جدة،
  // فنقترح ذلك تلقائيًا عند إضافة رقم ثانٍ فقط (دون المساس بما كتبه المستخدم بالفعل)،
  // وما بعده يُكتب يدويًا لأنه لا يوجد نمط افتراضي واضح.
  function addCodeRowWithSmartDefault() {
    const rows = Array.from(codesContainer.children);
    if (rows.length === 1) {
      const firstCity = rows[0]._cityInput;
      if (!firstCity.value.trim()) firstCity.value = 'الرياض';
      addCodeRow('', 'جدة');
    } else {
      addCodeRow();
    }
  }

  function addBrandRow(brand = '') {
    const brandInput = el('input', {
      type: 'text',
      class: 'input',
      placeholder: t('addBrandPlaceholder'),
      value: brand,
    });
    const removeBtn = el('button', {
      class: 'icon-btn remove-row-btn',
      type: 'button',
      'aria-label': t('removeItem'),
      text: '✕',
      onClick: () => {
        if (brandsContainer.children.length > 1) row.remove();
      },
    });
    const row = el('div', { class: 'dynamic-row' }, [brandInput, removeBtn]);
    row._get = () => brandInput.value.trim();
    brandsContainer.appendChild(row);
  }

  const initialCodes = initial?.codes?.length ? initial.codes : [{ code: '', city: '' }];
  initialCodes.forEach((c) => addCodeRow(c.code, c.city));
  const initialBrands = initial?.brands?.length ? initial.brands : [''];
  initialBrands.forEach((b) => addBrandRow(b));

  const errorBox = el('div', { class: 'form-error', hidden: true });

  const form = el('form', { class: 'supplier-form' }, [
    el('label', { class: 'form-label', text: t('fieldSupplierName') }),
    nameInput,

    el('label', { class: 'form-label', text: t('fieldSupplierCodes') }),
    codesContainer,
    el('button', {
      class: 'btn btn-link',
      type: 'button',
      text: t('addAnotherCode'),
      onClick: () => addCodeRowWithSmartDefault(),
    }),

    el('label', { class: 'form-label', text: t('fieldBrands') }),
    brandsContainer,
    el('button', {
      class: 'btn btn-link',
      type: 'button',
      text: t('addAnotherBrand'),
      onClick: () => addBrandRow(),
    }),

    errorBox,

    el('div', { class: 'form-actions' }, [
      el('button', { class: 'btn btn-primary', type: 'submit', text: submitLabel }),
    ]),
  ]);

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    const codes = Array.from(codesContainer.children)
      .map((row) => row._get())
      .filter((c) => c.code);
    const brands = Array.from(brandsContainer.children)
      .map((row) => row._get())
      .filter(Boolean);

    if (!name) return showError(t('requiredField'));
    if (!codes.length) return showError(t('atLeastOneCode'));
    if (!brands.length) return showError(t('atLeastOneBrand'));
    hideError();
    onSubmit({ name, codes, brands });
  });

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }
  function hideError() {
    errorBox.hidden = true;
  }

  return form;
}

// ------- عرض الفروقات لطلب تعديل -------

function codesToStrings(codes) {
  return (codes || []).map((c) => (c.city ? `${c.code} — ${c.city}` : c.code));
}

export function renderDiff(original, proposed) {
  const rows = [];
  if ((original.name || '') !== (proposed.name || '')) {
    rows.push(diffRow(t('fieldSupplierName'), original.name, proposed.name));
  }
  const oCodes = codesToStrings(original.codes).join(' | ');
  const pCodes = codesToStrings(proposed.codes).join(' | ');
  if (oCodes !== pCodes) {
    rows.push(diffRow(t('fieldSupplierCodes'), oCodes, pCodes));
  }
  const oBrands = (original.brands || []).join(' | ');
  const pBrands = (proposed.brands || []).join(' | ');
  if (oBrands !== pBrands) {
    rows.push(diffRow(t('fieldBrands'), oBrands, pBrands));
  }
  if (!rows.length) return el('div', { class: 'diff-empty', text: t('editDiffNoChange') });
  return el('div', { class: 'diff-table' }, rows);
}

function diffRow(label, oldVal, newVal) {
  return el('div', { class: 'diff-row' }, [
    el('div', { class: 'diff-label', text: label }),
    el('div', { class: 'diff-values' }, [
      el('div', { class: 'diff-old' }, [
        el('span', { class: 'diff-tag', text: t('currentValue') }),
        el('span', { text: oldVal || '—' }),
      ]),
      el('div', { class: 'diff-new' }, [
        el('span', { class: 'diff-tag', text: t('proposedValue') }),
        el('span', { text: newVal || '—' }),
      ]),
    ]),
  ]);
}

export function renderRequestCard(request, { onApprove, onReject }) {
  const meta = el('div', { class: 'request-meta' }, [
    request.createdBy ? el('span', { text: `${t('requestedBy')}: ${request.createdBy}` }) : null,
    el('span', { text: `${t('requestedAt')}: ${formatDate(request.createdAt, getLang())}` }),
  ]);

  let body;
  if (request.type === 'add') {
    body = el('div', { class: 'request-body' }, [
      el('div', { class: 'card-field' }, [
        el('div', { class: 'field-label', text: t('fieldSupplierCodes') }),
        el('div', { class: 'field-value', text: codesToStrings(request.proposedData.codes).join(' | ') }),
      ]),
      el('div', { class: 'card-field' }, [
        el('div', { class: 'field-label', text: t('fieldSupplierName') }),
        el('div', { class: 'field-value', text: request.proposedData.name }),
      ]),
      el('div', { class: 'card-field' }, [
        el('div', { class: 'field-label', text: t('fieldBrands') }),
        el('div', { class: 'field-value', text: (request.proposedData.brands || []).join(' | ') }),
      ]),
    ]);
  } else {
    body = renderDiff(request.originalData || {}, request.proposedData || {});
  }

  const actions = el('div', { class: 'card-actions' }, [
    el('button', { class: 'btn btn-primary', type: 'button', text: t('approve'), onClick: () => onApprove(request) }),
    el('button', { class: 'btn btn-danger-outline', type: 'button', text: t('reject'), onClick: () => onReject(request) }),
  ]);

  return el('article', { class: 'card request-card' }, [
    el('div', { class: 'request-type-badge', text: t(`requestType_${request.type}`) }),
    meta,
    body,
    actions,
  ]);
}
