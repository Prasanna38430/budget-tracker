(function () {
  'use strict';

  var STORAGE_KEY = 'budget-tracker.v1';

  var DEFAULT_CATEGORIES = [
    'Rent', 'Groceries', 'Transport', 'Utilities',
    'Eating out', 'Shopping', 'Salary', 'Other'
  ];

  var NEW_CATEGORY = '__new__';

  // Byte order mark, so Excel opens the exported file as UTF-8.
  var BOM = String.fromCharCode(0xfeff);

  var money = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' });
  var longDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  var monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' });

  var el = {};
  var state = null;
  var editingId = null;
  var filters = { month: '', category: 'all' };

  // ----- storage -------------------------------------------------------

  function blankState() {
    return {
      startingBalance: 0,
      categories: DEFAULT_CATEGORIES.slice(),
      transactions: []
    };
  }

  function load() {
    var raw;
    try {
      raw = window.localStorage.getItem(STORAGE_KEY);
    } catch (err) {
      // private browsing, or storage blocked entirely
      return blankState();
    }
    if (!raw) return blankState();

    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      return blankState();
    }

    var next = blankState();
    if (typeof parsed.startingBalance === 'number' && isFinite(parsed.startingBalance)) {
      next.startingBalance = parsed.startingBalance;
    }
    if (Array.isArray(parsed.categories)) {
      var cats = parsed.categories.filter(function (c) {
        return typeof c === 'string' && c.trim() !== '';
      });
      if (cats.length) next.categories = cats;
    }
    if (Array.isArray(parsed.transactions)) {
      next.transactions = parsed.transactions.filter(isValidTransaction);
    }
    return next;
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.warn('Could not save to localStorage:', err);
    }
  }

  function isValidTransaction(t) {
    return t && typeof t === 'object' &&
      typeof t.id === 'string' &&
      isDateString(t.date) &&
      (t.type === 'expense' || t.type === 'credit') &&
      typeof t.amount === 'number' && isFinite(t.amount) && t.amount > 0 &&
      typeof t.category === 'string';
  }

  // ----- small helpers -------------------------------------------------

  function isDateString(v) {
    if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
    var parts = v.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.getFullYear() === Number(parts[0]) &&
           d.getMonth() === Number(parts[1]) - 1 &&
           d.getDate() === Number(parts[2]);
  }

  function toDate(dateString) {
    var p = dateString.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  }

  function todayString() {
    var now = new Date();
    return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function currentMonth() { return todayString().slice(0, 7); }

  function monthOf(t) { return t.date.slice(0, 7); }

  function monthLabel(key) {
    return monthName.format(new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1));
  }

  function fmt(n) { return money.format(n); }

  // Sum in cents so a long list of transactions does not drift.
  function sum(list) {
    var cents = 0;
    for (var i = 0; i < list.length; i++) cents += Math.round(list[i].amount * 100);
    return cents / 100;
  }

  function round2(n) { return Math.round(n * 100) / 100; }

  function newId() {
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  }

  function node(tag, className, text) {
    var n = document.createElement(tag);
    if (className) n.className = className;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(parent) {
    while (parent.firstChild) parent.removeChild(parent.firstChild);
  }

  function fillSelect(select, options, selected) {
    clear(select);
    options.forEach(function (opt) {
      var o = document.createElement('option');
      o.value = opt.value;
      o.textContent = opt.label;
      select.appendChild(o);
    });
    select.value = selected;
  }

  // ----- derived data --------------------------------------------------

  function sortedTransactions() {
    return state.transactions.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.createdAt || 0) - (a.createdAt || 0);
    });
  }

  function inSelectedMonth(t) {
    return filters.month === 'all' || monthOf(t) === filters.month;
  }

  function visibleTransactions() {
    return sortedTransactions().filter(function (t) {
      if (!inSelectedMonth(t)) return false;
      if (filters.category !== 'all' && t.category !== filters.category) return false;
      return true;
    });
  }

  function currentBalance() {
    var credits = sum(state.transactions.filter(function (t) { return t.type === 'credit'; }));
    var expenses = sum(state.transactions.filter(function (t) { return t.type === 'expense'; }));
    return round2(state.startingBalance + credits - expenses);
  }

  function knownMonths() {
    var seen = {};
    state.transactions.forEach(function (t) { seen[monthOf(t)] = true; });
    seen[currentMonth()] = true;
    return Object.keys(seen).sort().reverse();
  }

  function periodLabel() {
    return filters.month === 'all' ? 'All time' : monthLabel(filters.month);
  }

  // ----- rendering -----------------------------------------------------

  function render() {
    renderStartingBalance();
    renderSummary();
    renderCategoryOptions();
    renderFilters();
    renderList();
    renderBreakdown();
  }

  function renderStartingBalance() {
    el.startingValue.textContent = fmt(state.startingBalance);
  }

  function renderSummary() {
    var month = state.transactions.filter(inSelectedMonth);
    var credits = sum(month.filter(function (t) { return t.type === 'credit'; }));
    var expenses = sum(month.filter(function (t) { return t.type === 'expense'; }));

    el.balanceValue.textContent = fmt(currentBalance());
    el.creditsValue.textContent = fmt(credits);
    el.expensesValue.textContent = fmt(expenses);

    el.creditsNote.textContent = periodLabel();
    el.expensesNote.textContent = periodLabel();
    el.balanceNote.textContent = state.transactions.length
      ? 'All transactions, all time'
      : 'Starting balance only';
  }

  function renderCategoryOptions() {
    var options = state.categories.map(function (c) { return { value: c, label: c }; });
    options.push({ value: NEW_CATEGORY, label: 'Add a new category...' });

    var keep = el.category.value;
    var stillThere = options.some(function (o) { return o.value === keep; });
    fillSelect(el.category, options, stillThere ? keep : state.categories[0]);
  }

  function renderFilters() {
    var months = knownMonths().map(function (m) {
      return { value: m, label: monthLabel(m) };
    });
    months.unshift({ value: 'all', label: 'All time' });
    if (!months.some(function (m) { return m.value === filters.month; })) {
      filters.month = currentMonth();
    }
    fillSelect(el.monthFilter, months, filters.month);

    var cats = state.categories.map(function (c) { return { value: c, label: c }; });
    cats.unshift({ value: 'all', label: 'All categories' });
    if (!cats.some(function (c) { return c.value === filters.category; })) {
      filters.category = 'all';
    }
    fillSelect(el.categoryFilter, cats, filters.category);
  }

  function renderList() {
    var rows = visibleTransactions();
    clear(el.txnList);

    el.listCount.textContent = rows.length
      ? rows.length + (rows.length === 1 ? ' transaction' : ' transactions')
      : '';

    if (!rows.length) {
      el.txnList.appendChild(emptyState(
        state.transactions.length ? 'Nothing here' : 'No transactions yet',
        state.transactions.length
          ? 'No transactions match the month and category you picked. Try widening the filters.'
          : 'Add your first one with the form, or import a CSV you exported earlier.'
      ));
      return;
    }

    rows.forEach(function (t) {
      el.txnList.appendChild(transactionRow(t));
    });
  }

  function transactionRow(t) {
    var li = node('li', 'txn' + (t.id === editingId ? ' editing' : ''));

    var main = node('div', 'txn-main');
    var top = node('div', 'txn-top');
    top.appendChild(node('span', 'txn-category', t.category));
    if (t.type === 'credit') top.appendChild(node('span', 'tag', 'Credit'));
    main.appendChild(top);

    var meta = longDate.format(toDate(t.date));
    if (t.note) meta += ' · ' + t.note;
    main.appendChild(node('p', 'txn-meta', meta));

    var amount = node(
      'span',
      'txn-amount ' + (t.type === 'credit' ? 'pos' : 'neg'),
      (t.type === 'credit' ? '+' : '−') + fmt(t.amount)
    );

    var actions = node('div', 'txn-actions');

    var edit = node('button', 'icon-btn', 'Edit');
    edit.type = 'button';
    edit.dataset.action = 'edit';
    edit.dataset.id = t.id;
    edit.setAttribute('aria-label', 'Edit ' + t.category + ' on ' + t.date);

    var del = node('button', 'icon-btn danger', 'Delete');
    del.type = 'button';
    del.dataset.action = 'delete';
    del.dataset.id = t.id;
    del.setAttribute('aria-label', 'Delete ' + t.category + ' on ' + t.date);

    actions.appendChild(edit);
    actions.appendChild(del);

    // Amount and buttons sit side by side on a wide screen and stack on a phone.
    var side = node('div', 'txn-side');
    side.appendChild(amount);
    side.appendChild(actions);

    li.appendChild(main);
    li.appendChild(side);
    return li;
  }

  function emptyState(title, message, compact) {
    var wrap = node('div', compact ? 'empty compact' : 'empty');
    wrap.appendChild(node('h3', null, title));
    wrap.appendChild(node('p', null, message));
    return wrap;
  }

  function renderBreakdown() {
    var expenses = state.transactions.filter(function (t) {
      return t.type === 'expense' && inSelectedMonth(t);
    });

    el.breakdownPeriod.textContent = periodLabel();
    clear(el.breakdown);

    if (!expenses.length) {
      el.breakdown.appendChild(emptyState(
        'Nothing spent yet',
        'Log an expense in this period and the split by category shows up here.',
        true
      ));
      return;
    }

    var byCategory = {};
    expenses.forEach(function (t) {
      byCategory[t.category] = (byCategory[t.category] || 0) + Math.round(t.amount * 100);
    });

    var rows = Object.keys(byCategory).map(function (name) {
      return { name: name, cents: byCategory[name] };
    }).sort(function (a, b) { return b.cents - a.cents; });

    var total = rows.reduce(function (acc, r) { return acc + r.cents; }, 0);

    rows.forEach(function (r) {
      var share = r.cents / total;
      var row = node('div', 'bar-row');

      var head = node('div', 'bar-head');
      head.appendChild(node('span', null, r.name));
      head.appendChild(node('span', 'amt',
        fmt(r.cents / 100) + ' · ' + Math.round(share * 100) + '%'));
      row.appendChild(head);

      var track = node('div', 'bar-track');
      var fill = node('div', 'bar-fill');
      // Keep a sliver visible for categories that round down to nothing.
      fill.style.width = Math.max(share * 100, 2).toFixed(1) + '%';
      track.appendChild(fill);
      row.appendChild(track);

      el.breakdown.appendChild(row);
    });
  }

  // ----- transaction form ----------------------------------------------

  function showError(message) {
    el.formError.textContent = message;
    el.formError.hidden = false;
  }

  function clearError() {
    el.formError.textContent = '';
    el.formError.hidden = true;
  }

  function parseAmount(value) {
    var text = String(value).trim().replace(/[\s€]/g, '');
    if (!text) return null;
    // "12,50" is a normal way to write this in EUR-land
    if (text.indexOf(',') !== -1 && text.indexOf('.') === -1) text = text.replace(',', '.');
    var n = parseFloat(text);
    if (!isFinite(n)) return null;
    n = round2(n);
    return n > 0 ? n : null;
  }

  function resolveCategory() {
    if (el.category.value !== NEW_CATEGORY) return el.category.value;

    var name = el.newCategory.value.trim();
    if (!name) return null;

    var existing = state.categories.filter(function (c) {
      return c.toLowerCase() === name.toLowerCase();
    })[0];
    if (existing) return existing;

    state.categories.push(name);
    state.categories.sort(function (a, b) { return a.localeCompare(b); });
    return name;
  }

  function handleSubmit(e) {
    e.preventDefault();
    clearError();

    var amount = parseAmount(el.amount.value);
    if (amount === null) {
      showError('Enter an amount greater than zero.');
      el.amount.focus();
      return;
    }

    var date = el.date.value;
    if (!isDateString(date)) {
      showError('Pick a date for this transaction.');
      el.date.focus();
      return;
    }

    var category = resolveCategory();
    if (!category) {
      showError('Give the new category a name.');
      el.newCategory.focus();
      return;
    }

    var type = document.querySelector('input[name="type"]:checked').value;
    var note = el.note.value.trim();

    if (editingId) {
      state.transactions.forEach(function (t) {
        if (t.id !== editingId) return;
        t.amount = amount;
        t.date = date;
        t.type = type;
        t.category = category;
        t.note = note;
      });
    } else {
      state.transactions.push({
        id: newId(),
        date: date,
        type: type,
        amount: amount,
        category: category,
        note: note,
        createdAt: Date.now()
      });
      // Jump the month filter to wherever the new transaction landed, so it
      // does not silently vanish behind a filter.
      if (filters.month !== 'all') filters.month = date.slice(0, 7);
    }

    save();
    resetForm();
    render();
    goToView('list');
  }

  function resetForm() {
    editingId = null;
    el.txnForm.reset();
    el.date.value = todayString();
    el.newCategoryField.hidden = true;
    el.newCategory.value = '';
    el.typeExpense.checked = true;
    el.formTitle.textContent = 'Add a transaction';
    el.submitBtn.textContent = 'Add transaction';
    el.cancelEditBtn.hidden = true;
    clearError();
    renderCategoryOptions();
  }

  function startEdit(id) {
    var t = state.transactions.filter(function (x) { return x.id === id; })[0];
    if (!t) return;

    editingId = id;
    el.amount.value = t.amount.toFixed(2);
    el.date.value = t.date;
    el.note.value = t.note || '';
    if (t.type === 'credit') el.typeCredit.checked = true;
    else el.typeExpense.checked = true;

    if (state.categories.indexOf(t.category) === -1) state.categories.push(t.category);
    renderCategoryOptions();
    el.category.value = t.category;
    el.newCategoryField.hidden = true;

    el.formTitle.textContent = 'Edit transaction';
    el.submitBtn.textContent = 'Save changes';
    el.cancelEditBtn.hidden = false;
    clearError();

    renderList();
    if (!goToView('add')) el.txnForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.amount.focus();
  }

  function removeTransaction(id) {
    var t = state.transactions.filter(function (x) { return x.id === id; })[0];
    if (!t) return;

    var label = t.category + ' — ' + fmt(t.amount) + ' on ' + longDate.format(toDate(t.date));
    if (!window.confirm('Delete this transaction?\n\n' + label)) return;

    state.transactions = state.transactions.filter(function (x) { return x.id !== id; });
    if (editingId === id) resetForm();
    save();
    render();
  }

  // ----- starting balance ----------------------------------------------

  function openStartingEdit() {
    el.startingInput.value = state.startingBalance.toFixed(2);
    el.startingView.hidden = true;
    el.startingForm.hidden = false;
    el.startingInput.focus();
    el.startingInput.select();
  }

  function closeStartingEdit() {
    el.startingForm.hidden = true;
    el.startingView.hidden = false;
  }

  function saveStartingBalance(e) {
    e.preventDefault();
    var text = el.startingInput.value.trim().replace(/[\s€]/g, '');
    if (text.indexOf(',') !== -1 && text.indexOf('.') === -1) text = text.replace(',', '.');
    var n = parseFloat(text);
    if (!isFinite(n)) {
      el.startingInput.focus();
      return;
    }
    // A negative starting balance is legitimate here - you can start overdrawn.
    state.startingBalance = round2(n);
    save();
    closeStartingEdit();
    render();
  }

  // ----- phone views ---------------------------------------------------

  // Below this width the four panels become tabs instead of one long scroll.
  var phone = window.matchMedia('(max-width: 720px)');

  function setView(view) {
    document.body.dataset.view = view;
    [].forEach.call(el.tabbar.querySelectorAll('.tab'), function (button) {
      button.setAttribute('aria-current', button.dataset.view === view ? 'true' : 'false');
    });
  }

  // Only worth switching tabs when there are tabs to switch.
  function goToView(view) {
    if (!phone.matches) return false;
    setView(view);
    window.scrollTo(0, 0);
    return true;
  }

  // ----- CSV -----------------------------------------------------------

  var CSV_COLUMNS = ['date', 'type', 'amount', 'category', 'note', 'id'];

  function csvEscape(value) {
    var s = value == null ? '' : String(value);
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function buildCsv() {
    var lines = [CSV_COLUMNS.join(',')];
    sortedTransactions().forEach(function (t) {
      lines.push([
        t.date,
        t.type,
        t.amount.toFixed(2),
        csvEscape(t.category),
        csvEscape(t.note || ''),
        t.id
      ].join(','));
    });
    return lines.join('\r\n');
  }

  function exportCsv() {
    if (!state.transactions.length) {
      setImportStatus('There is nothing to export yet.', true);
      return;
    }
    var blob = new Blob([BOM + buildCsv()], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'budget-' + todayString() + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportStatus('Exported ' + state.transactions.length + ' transactions.');
  }

  // Field-by-field parse so quoted commas and newlines survive the round trip.
  function parseCsv(text) {
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { row.push(field); field = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }

    if (field !== '' || row.length) {
      row.push(field);
      rows.push(row);
    }

    return rows.filter(function (r) {
      return r.some(function (c) { return c.trim() !== ''; });
    });
  }

  function columnIndexes(header) {
    var map = {};
    var recognised = 0;
    header.forEach(function (name, i) {
      var key = name.trim().toLowerCase();
      if (CSV_COLUMNS.indexOf(key) !== -1) { map[key] = i; recognised++; }
    });
    // Without a usable header, fall back to the column order we export in.
    if (recognised < 3) {
      map = {};
      CSV_COLUMNS.forEach(function (name, i) { map[name] = i; });
      map.__noHeader = true;
    }
    return map;
  }

  function importCsv(text) {
    var rows = parseCsv(text);
    if (!rows.length) {
      setImportStatus('That file was empty.', true);
      return;
    }

    var cols = columnIndexes(rows[0]);
    var body = cols.__noHeader ? rows : rows.slice(1);

    var existingIds = {};
    state.transactions.forEach(function (t) { existingIds[t.id] = true; });

    var added = 0, duplicates = 0, skipped = 0;

    body.forEach(function (r) {
      var get = function (name) {
        var i = cols[name];
        return i == null || r[i] == null ? '' : r[i].trim();
      };

      var date = get('date');
      var type = get('type').toLowerCase();
      var amount = parseAmount(get('amount').replace(/^-/, ''));
      var category = get('category');
      var id = get('id');

      if (type === 'income' || type === 'credit (+)') type = 'credit';
      if (type === 'debit' || type === 'expense (-)') type = 'expense';

      if (!isDateString(date) || (type !== 'expense' && type !== 'credit') || amount === null) {
        skipped++;
        return;
      }

      if (id && existingIds[id]) { duplicates++; return; }
      if (!id) id = newId();
      existingIds[id] = true;

      if (!category) category = 'Other';
      if (state.categories.indexOf(category) === -1) state.categories.push(category);

      state.transactions.push({
        id: id,
        date: date,
        type: type,
        amount: amount,
        category: category,
        note: get('note'),
        createdAt: Date.now()
      });
      added++;
    });

    if (!added && !duplicates) {
      setImportStatus('No usable rows found. Expected columns: ' + CSV_COLUMNS.join(', ') + '.', true);
      return;
    }

    save();
    render();

    var parts = ['Imported ' + added + (added === 1 ? ' transaction' : ' transactions')];
    if (duplicates) parts.push(duplicates + ' already here');
    if (skipped) parts.push(skipped + ' skipped');
    setImportStatus(parts.join(', ') + '.');
  }

  function setImportStatus(message, isError) {
    el.importStatus.textContent = message;
    el.importStatus.className = 'import-status' + (isError ? ' error' : '');
    el.importStatus.hidden = false;
  }

  function handleFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () { importCsv(String(reader.result)); };
    reader.onerror = function () { setImportStatus('Could not read that file.', true); };
    reader.readAsText(file);
  }

  // ----- wiring --------------------------------------------------------

  function cacheElements() {
    [
      'startingView', 'startingValue', 'startingForm', 'startingInput',
      'editStartBtn', 'cancelStartBtn',
      'balanceValue', 'creditsValue', 'expensesValue', 'creditsNote', 'expensesNote',
      'txnForm', 'formTitle', 'amount', 'date', 'category', 'note',
      'newCategoryField', 'newCategory', 'formError', 'submitBtn', 'cancelEditBtn',
      'typeExpense', 'typeCredit',
      'monthFilter', 'categoryFilter', 'txnList', 'listCount',
      'breakdown', 'breakdownPeriod',
      'exportBtn', 'importBtn', 'importInput', 'importStatus', 'tabbar'
    ].forEach(function (id) { el[id] = document.getElementById(id); });

    el.balanceNote = document.querySelector('.cards .card:first-child .card-note');
  }

  function bindEvents() {
    el.txnForm.addEventListener('submit', handleSubmit);
    el.cancelEditBtn.addEventListener('click', function () {
      resetForm();
      goToView('list');
    });

    el.category.addEventListener('change', function () {
      var adding = el.category.value === NEW_CATEGORY;
      el.newCategoryField.hidden = !adding;
      if (adding) el.newCategory.focus();
    });

    el.txnList.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-action]');
      if (!button) return;
      if (button.dataset.action === 'edit') startEdit(button.dataset.id);
      else removeTransaction(button.dataset.id);
    });

    el.monthFilter.addEventListener('change', function () {
      filters.month = el.monthFilter.value;
      renderSummary();
      renderList();
      renderBreakdown();
    });

    el.categoryFilter.addEventListener('change', function () {
      filters.category = el.categoryFilter.value;
      renderList();
    });

    el.editStartBtn.addEventListener('click', openStartingEdit);
    el.cancelStartBtn.addEventListener('click', closeStartingEdit);
    el.startingForm.addEventListener('submit', saveStartingBalance);

    el.tabbar.addEventListener('click', function (e) {
      var tab = e.target.closest('.tab');
      if (tab) setView(tab.dataset.view);
    });

    el.exportBtn.addEventListener('click', exportCsv);
    el.importBtn.addEventListener('click', function () { el.importInput.click(); });
    el.importInput.addEventListener('change', function () {
      handleFile(el.importInput.files[0]);
      el.importInput.value = '';
    });
  }

  function init() {
    cacheElements();
    state = load();
    filters.month = currentMonth();
    bindEvents();
    resetForm();
    render();
  }

  document.addEventListener('DOMContentLoaded', init);
}());
