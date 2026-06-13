const { invoke } = window.__TAURI__.core;
const { listen } = window.__TAURI__.event;

let itemsState = [];
let activeFilter = 'all';
let searchQuery = '';
let currentSort = 'newest';
let currentView = 'grid'; // grid or list
let isMonitoring = true;
let selectedTab = 'text'; // text, link, code in add modal
let renderLimit = 40;
let filteredLength = 0;
let draggedItemId = null;
let lastCopiedFromApp = '';
let isBulkMode = false;
let selectedItemIds = new Set();

// Elements
const bulkModeBtn = document.getElementById('bulkModeBtn');
const bulkBar = document.getElementById('bulkBar');
const bulkCount = document.getElementById('bulkCount');
const bulkTagBtn = document.getElementById('bulkTagBtn');
const bulkFavBtn = document.getElementById('bulkFavBtn');
const bulkPinBtn = document.getElementById('bulkPinBtn');
const bulkDelBtn = document.getElementById('bulkDelBtn');
const bulkCancelBtn = document.getElementById('bulkCancelBtn');

const cardsContainer = document.getElementById('cardsContainer');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const sortDropdown = document.getElementById('sortDropdown');
const sortDropdownBtn = document.getElementById('sortDropdownBtn');
const sortDropdownVal = document.getElementById('sortDropdownVal');
const sortDropdownOptions = document.getElementById('sortDropdownOptions');
const sortOptItems = document.querySelectorAll('.sort-opt-item');
const viewButtons = document.querySelectorAll('.vt-btn');
const navItems = document.querySelectorAll('.nav-item[data-filter]');
const clearBtn = document.getElementById('clearBtn');
const addBtn = document.getElementById('addBtn');
const addModal = document.getElementById('addModal');
const modalClose = document.getElementById('modalClose');
const modalCancel = document.getElementById('modalCancel');
const modalSubmit = document.getElementById('modalSubmit');
const mtabs = document.querySelectorAll('.mtab');
const itemTitle = document.getElementById('itemTitle');
const itemContent = document.getElementById('itemContent');
const sidebarToggle = document.getElementById('sidebarToggle');
const sidebar = document.getElementById('sidebar');
const toastContainer = document.getElementById('toastContainer');
const contextMenu = document.getElementById('contextMenu');
const ctxPinText = document.getElementById('ctxPinText');

// Rename Modal elements
const renameModal = document.getElementById('renameModal');
const renameModalClose = document.getElementById('renameModalClose');
const renameModalCancel = document.getElementById('renameModalCancel');
const renameModalSubmit = document.getElementById('renameModalSubmit');
const renameInput = document.getElementById('renameInput');
let renameTargetId = null;

// Category Modal elements
const categoryModal = document.getElementById('categoryModal');
const categoryModalClose = document.getElementById('categoryModalClose');
const categoryModalCancel = document.getElementById('categoryModalCancel');
const categoryModalSubmit = document.getElementById('categoryModalSubmit');
const categoryCheckboxList = document.getElementById('categoryCheckboxList');
const newCategoryInput = document.getElementById('newCategoryInput');
const createCategoryBtn = document.getElementById('createCategoryBtn');
const addCategoryBtn = document.getElementById('addCategoryBtn');
const sidebarCategories = document.getElementById('sidebarCategories');
let categoryTargetId = null;

// Manage Categories Modal elements
const manageCategoriesBtn = document.getElementById('manageCategoriesBtn');
const manageCategoriesModal = document.getElementById('manageCategoriesModal');
const manageCategoriesModalClose = document.getElementById('manageCategoriesModalClose');
const manageCategoriesModalCloseBtn = document.getElementById('manageCategoriesModalCloseBtn');
const manageCategoriesDeleteBtn = document.getElementById('manageCategoriesDeleteBtn');
const manageCategoriesList = document.getElementById('manageCategoriesList');

// Add Category Modal elements
const addCategoryModal = document.getElementById('addCategoryModal');
const addCategoryModalClose = document.getElementById('addCategoryModalClose');
const addCategoryModalCancel = document.getElementById('addCategoryModalCancel');
const addCategoryModalSubmit = document.getElementById('addCategoryModalSubmit');
const newCategorySidebarInput = document.getElementById('newCategorySidebarInput');

// Confirm Modal elements
const confirmModal = document.getElementById('confirmModal');
const confirmModalClose = document.getElementById('confirmModalClose');
const confirmModalCancel = document.getElementById('confirmModalCancel');
const confirmModalSubmit = document.getElementById('confirmModalSubmit');

// Badge elements
const badgeAll = document.getElementById('badgeAll');
const badgeText = document.getElementById('badgeText');
const badgeCode = document.getElementById('badgeCode');
const badgeLink = document.getElementById('badgeLink');
const badgeImage = document.getElementById('badgeImage');
const badgePinned = document.getElementById('badgePinned');

// Stat elements
const statStorage = document.getElementById('statStorage');
const statTotal = document.getElementById('statTotal');

let contextMenuTargetId = null;

// Helpers
function formatBytes(bytes) {
  if (bytes === 0 || !bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatTime(dateStr) {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Şimdi';
    if (diffMins < 60) return `${diffMins} dk önce`;
    if (diffHours < 24) return `${diffHours} sa önce`;

    return date.toLocaleDateString('tr-TR', {
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    return '';
  }
}

function getTypeIcon(type) {
  switch (type) {
    case 'text': return 'fa-solid fa-font';
    case 'code': return 'fa-solid fa-code';
    case 'link': return 'fa-solid fa-link';
    case 'image': return 'fa-solid fa-image';
    default: return 'fa-solid fa-file';
  }
}

function getTypeLabel(type) {
  switch (type) {
    case 'text': return 'Metin';
    case 'code': return 'Kod';
    case 'link': return 'Bağlantı';
    case 'image': return 'Görsel';
    default: return 'Öğe';
  }
}

function escapeHTML(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Display toast message
function showToast(message, type = 'info') {
  const notificationsEnabled = localStorage.getItem('quickstack_notifications_enabled') !== 'false';
  if (!notificationsEnabled) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  
  let iconClass = 'fa-info-circle';
  if (type === 'success') iconClass = 'fa-check-circle';
  if (type === 'error') iconClass = 'fa-exclamation-circle';

  toast.innerHTML = `
    <div class="toast-icon"><i class="fa-solid ${iconClass}"></i></div>
    <span class="toast-msg">${message}</span>
  `;
  
  toastContainer.appendChild(toast);

  // Animate out
  setTimeout(() => {
    toast.classList.add('out');
    setTimeout(() => {
      toast.remove();
    }, 300);
  }, 1200);
}

function toggleCardCategoryDropdown(e, item, tagBtn) {
  e.stopPropagation();
  
  // Close any existing dropdowns first
  document.querySelectorAll('.card-tag-dropdown').forEach(d => d.remove());
  
  const cats = getCategories();
  if (cats.length === 0) {
    showToast('Henüz kategori oluşturmadınız. Sol menüden "Kategori Ekle" diyerek oluşturabilirsiniz.', 'info');
    return;
  }
  
  const dropdown = document.createElement('div');
  dropdown.className = 'card-tag-dropdown';
  
  cats.forEach(cat => {
    const isChecked = item.tags && item.tags.includes(cat);
    const row = document.createElement('div');
    row.className = 'card-tag-dropdown-item';
    row.innerHTML = `
      <i class="fa-solid ${isChecked ? 'fa-square-check' : 'fa-square'}"></i>
      <span>${escapeHTML(cat)}</span>
    `;
    row.addEventListener('click', async (event) => {
      event.stopPropagation();
      let newTags = item.tags ? [...item.tags] : [];
      if (isChecked) {
        newTags = newTags.filter(t => t !== cat);
      } else {
        newTags.push(cat);
      }
      
      try {
        const success = await invoke('update_item_tags', { id: item.id, tags: newTags });
        if (success) {
          item.tags = newTags;
          render();
          updateBadges();
          showToast(`"${item.title}" kategorileri güncellendi.`, 'success');
          // Re-open dropdown for seamless toggling!
          const newBtn = document.querySelector(`.card[data-id="${item.id}"] .tag-btn`);
          if (newBtn) {
            setTimeout(() => {
              const freshBtn = document.querySelector(`.card[data-id="${item.id}"] .tag-btn`);
              if (freshBtn) {
                const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
                freshBtn.dispatchEvent(clickEvent);
              }
            }, 50);
          }
        }
      } catch (err) {
        showToast('Kategori güncellenemedi: ' + err, 'error');
      }
    });
    dropdown.appendChild(row);
  });
  
  document.body.appendChild(dropdown);
  const rect = tagBtn.getBoundingClientRect();
  dropdown.style.left = `${rect.left + window.scrollX}px`;
  dropdown.style.top = `${rect.bottom + window.scrollY + 6}px`;
  
  const closeHandler = (event) => {
    if (!dropdown.contains(event.target) && event.target !== tagBtn && !tagBtn.contains(event.target)) {
      dropdown.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => document.addEventListener('click', closeHandler), 10);
}

// Render dynamic card list
function render() {
  // 1. Filter items
  let filtered = itemsState.filter(item => {
    // Nav bar filter
    if (activeFilter === 'pinned' && !item.favorite) return false;
    if (activeFilter.startsWith('category:')) {
      const catName = activeFilter.substring(9);
      if (!item.tags || !item.tags.includes(catName)) return false;
    } else if (activeFilter !== 'all' && activeFilter !== 'pinned' && item.type !== activeFilter) {
      return false;
    }

    // Search query filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const inTitle = item.title && item.title.toLowerCase().includes(q);
      const inContent = item.content && item.content.toLowerCase().includes(q);
      const inLang = item.language && item.language.toLowerCase().includes(q);
      const inTags = item.tags && item.tags.some(tag => tag.toLowerCase().includes(q));
      return inTitle || inContent || inLang || inTags;
    }
    
    return true;
  });

  // 2. Sort items (pinned/favorites always stay at the top)
  filtered.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;

    if (currentSort === 'newest') {
      return new Date(b.createdAt) - new Date(a.createdAt);
    } else if (currentSort === 'oldest') {
      return new Date(a.createdAt) - new Date(b.createdAt);
    } else if (currentSort === 'name') {
      return (a.title || '').localeCompare(b.title || '');
    }
    return 0;
  });

  filteredLength = filtered.length;
  const sliced = filtered.slice(0, renderLimit);

  // 3. Clear container
  cardsContainer.innerHTML = '';

  // 4. Update empty state
  if (filtered.length === 0) {
    emptyState.classList.add('visible');
  } else {
    emptyState.classList.remove('visible');
  }

  // 5. Render cards
  sliced.forEach(item => {
    const card = document.createElement('div');
    const isNew = (new Date() - new Date(item.createdAt)) < 2000;
    const isSelected = selectedItemIds.has(item.id);
    card.className = `card ${isNew ? 'new-card' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = item.id;
    card.dataset.type = item.type;

    // Drag & Drop
    card.setAttribute('draggable', 'true');
    card.addEventListener('dragstart', (e) => {
      draggedItemId = item.id;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', item.id);
      document.body.classList.add('dragging-active');
      card.classList.add('dragging');
    });
    card.addEventListener('dragend', () => {
      draggedItemId = null;
      document.body.classList.remove('dragging-active');
      card.classList.remove('dragging');
    });
    
    // Set color indicators
    if (item.color) {
      card.style.setProperty('--accent', item.color);
      card.style.setProperty('--accent-l', item.color);
      card.style.borderLeftColor = item.color;
    }

    const isCode = item.type === 'code';
    const isLink = item.type === 'link';
    const isImage = item.type === 'image';
    const isText = item.type === 'text';

    let bodyHTML = '';
    if (isText) {
      bodyHTML = `<div class="card-content">${escapeHTML(item.content)}</div>`;
    } else if (isCode) {
      bodyHTML = `<div class="card-content code">${escapeHTML(item.content)}</div>`;
    } else if (isLink) {
      bodyHTML = `
        <div class="card-link">
          <i class="fa-solid fa-arrow-up-right-from-square"></i>
          <span>${escapeHTML(item.content)}</span>
        </div>
      `;
    } else if (isImage) {
      bodyHTML = `<img src="${item.content}" class="card-img" alt="Görsel Önizleme" />`;
    }

    let tagsHTML = '';
    if (item.tags && item.tags.length > 0) {
      tagsHTML = item.tags.map(tag => `<span class="card-tag"><i class="fa-solid fa-tag"></i> ${escapeHTML(tag)}</span>`).join('');
    }

    card.innerHTML = `
      <div class="card-select-overlay">
        <input type="checkbox" class="card-select-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''}>
      </div>
      <div class="card-head">
        <div class="card-type-icon">
          <i class="${getTypeIcon(item.type)}"></i>
        </div>
        <span class="card-title" title="${escapeHTML(item.title)}">${escapeHTML(item.title)}</span>
        ${item.language ? `<span class="card-lang">${escapeHTML(item.language)}</span>` : ''}
        <span class="card-time">${formatTime(item.createdAt)}</span>
        <div class="card-actions">
          <button class="card-btn pin-btn ${item.pinned ? 'pinned' : ''}" title="${item.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle'}">
            <i class="fa-solid fa-thumbtack"></i>
          </button>
          <button class="card-btn fav-btn ${item.favorite ? 'favorited' : ''}" title="${item.favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}">
            <i class="${item.favorite ? 'fa-solid' : 'fa-regular'} fa-star"></i>
          </button>
          <button class="card-btn tag-btn ${item.tags && item.tags.length > 0 ? 'active-tag' : ''}" title="Kategori Ekle">
            <i class="fa-solid fa-tag"></i>
          </button>
          <button class="card-btn del-btn del" title="Sil">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
      <div class="card-body">
        ${bodyHTML}
      </div>
      <div class="card-foot">
        <div class="card-tags-container">
          ${tagsHTML}
        </div>
        <span class="card-badge">${getTypeLabel(item.type)}</span>
      </div>
    `;

    // Listeners for card actions
    const pinBtn = card.querySelector('.pin-btn');
    pinBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePinItem(item.id);
    });

    const favBtn = card.querySelector('.fav-btn');
    favBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavoriteItem(item.id);
    });

    const tagBtn = card.querySelector('.tag-btn');
    tagBtn.addEventListener('click', (e) => {
      toggleCardCategoryDropdown(e, item, tagBtn);
    });

    const delBtn = card.querySelector('.del-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.add('deleting');
      setTimeout(() => {
        deleteItem(item.id);
      }, 300);
    });

    // Click Handler (Instantly copies the content or toggles selection in bulk mode)
    card.addEventListener('click', (e) => {
      // Ignore clicks on header action buttons
      if (e.target.closest('.card-actions') || e.target.closest('.card-btn')) {
        return;
      }
      if (isBulkMode) {
        e.preventDefault();
        toggleCardSelection(item.id);
        return;
      }
      copyContent(item.content, card);
    });

    // Checkbox Click Listener
    const selectCheckbox = card.querySelector('.card-select-checkbox');
    selectCheckbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleCardSelection(item.id);
    });

    // Double Click Handler (Only for images and links to open preview/external link, disabled in bulk mode)
    if (item.type === 'image' || item.type === 'link') {
      card.addEventListener('dblclick', (e) => {
        if (isBulkMode) return;
        if (e.target.closest('.card-actions') || e.target.closest('.card-btn')) {
          return;
        }
        if (item.type === 'image') {
          openImagePreview(item.content);
        } else if (item.type === 'link') {
          invoke('open_link', { url: item.content }).catch(err => {
            showToast('Bağlantı açılamadı: ' + err, 'error');
          });
        }
      });
    }

    // Context Menu
    card.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      openContextMenu(e, item);
    });

    cardsContainer.appendChild(card);
  });
}

function openImagePreview(src) {
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.inset = '0';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
  overlay.style.zIndex = '4000';
  overlay.style.display = 'flex';
  overlay.style.alignItems = 'center';
  overlay.style.justifyContent = 'center';
  overlay.style.cursor = 'zoom-out';
  overlay.style.backdropFilter = 'blur(10px)';
  overlay.style.animation = 'mIn 0.25s ease';

  const img = document.createElement('img');
  img.src = src;
  img.style.maxWidth = '90%';
  img.style.maxHeight = '90%';
  img.style.borderRadius = '12px';
  img.style.boxShadow = '0 20px 50px rgba(0,0,0,0.5)';
  img.style.animation = 'mSlide 0.3s ease';

  overlay.appendChild(img);
  document.body.appendChild(overlay);

  overlay.addEventListener('click', () => {
    overlay.style.animation = 'mIn 0.2s ease reverse';
    setTimeout(() => overlay.remove(), 200);
  });
}

function updateBadges() {
  badgeAll.textContent = itemsState.length;
  badgeText.textContent = itemsState.filter(i => i.type === 'text').length;
  badgeCode.textContent = itemsState.filter(i => i.type === 'code').length;
  badgeLink.textContent = itemsState.filter(i => i.type === 'link').length;
  badgeImage.textContent = itemsState.filter(i => i.type === 'image').length;
  badgePinned.textContent = itemsState.filter(i => i.favorite).length;
  updateCategoriesSidebar();
}

// Category Helpers & Sidebar logic
function getCategories() {
  let customCats = [];
  try {
    const stored = localStorage.getItem('quickstack_custom_categories');
    if (stored) {
      customCats = JSON.parse(stored);
    }
  } catch (e) {
    console.error(e);
  }
  const itemTags = itemsState.flatMap(item => item.tags || []);
  return [...new Set([...customCats, ...itemTags])].filter(Boolean);
}

function saveCategory(name) {
  const trimmed = name.trim();
  if (!trimmed) return;
  let cats = getCategories();
  if (!cats.includes(trimmed)) {
    cats.push(trimmed);
    localStorage.setItem('quickstack_custom_categories', JSON.stringify(cats));
  }
}

function updateCategoriesSidebar() {
  if (!sidebarCategories) return;
  const cats = getCategories();
  sidebarCategories.innerHTML = '';
  
  cats.forEach(cat => {
    const count = itemsState.filter(item => item.tags && item.tags.includes(cat)).length;
    const a = document.createElement('a');
    a.href = '#';
    const isCurrent = activeFilter === `category:${cat}`;
    a.className = `nav-item ${isCurrent ? 'active' : ''}`;
    a.dataset.category = cat;
    a.innerHTML = `
      <i class="fa-solid fa-tag"></i>
      <span>${escapeHTML(cat)}</span>
      <span class="nav-badge">${count}</span>
      <button class="category-delete-btn" title="Kategoriyi Sil"><i class="fa-solid fa-trash-can"></i></button>
    `;
    a.addEventListener('click', (e) => {
      e.preventDefault();
      selectFilter(`category:${cat}`, a);
    });

    // Drag over and drop targeting
    a.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    });
    a.addEventListener('dragenter', (e) => {
      e.preventDefault();
      a.classList.add('drag-over');
    });
    a.addEventListener('dragleave', () => {
      a.classList.remove('drag-over');
    });
    a.addEventListener('drop', async (e) => {
      e.preventDefault();
      a.classList.remove('drag-over');
      const itemId = draggedItemId || e.dataTransfer.getData('text/plain');
      if (!itemId) return;
      
      const targetItem = itemsState.find(i => i.id === itemId);
      if (!targetItem) return;
      
      if (!targetItem.tags) targetItem.tags = [];
      if (!targetItem.tags.includes(cat)) {
        const newTags = [...targetItem.tags, cat];
        try {
          const success = await invoke('update_item_tags', { id: itemId, tags: newTags });
          if (success) {
            targetItem.tags = newTags;
            render();
            updateBadges();
            showToast(`"${targetItem.title}" öğesi "${cat}" kategorisine eklendi.`, 'success');
          }
        } catch (err) {
          showToast('Kategoriye eklenirken hata oluştu: ' + err, 'error');
        }
      } else {
        showToast('Bu öğe zaten bu kategoride!', 'info');
      }
    });

    // Delete category
    const delBtn = a.querySelector('.category-delete-btn');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        e.preventDefault();
        
        const confirmed = await showCustomConfirm(
          'Kategoriyi Sil',
          `"${cat}" kategorisini silmek istediğinize emin misiniz? Bu kategoriye ait öğeler kategoriden çıkarılacaktır.`,
          'Evet, Sil'
        );
        if (confirmed) {
          let customCats = [];
          try {
            const stored = localStorage.getItem('quickstack_custom_categories');
            if (stored) {
              customCats = JSON.parse(stored);
            }
          } catch (err) {}
          customCats = customCats.filter(c => c !== cat);
          localStorage.setItem('quickstack_custom_categories', JSON.stringify(customCats));
          
          for (let item of itemsState) {
            if (item.tags && item.tags.includes(cat)) {
              const newTags = item.tags.filter(t => t !== cat);
              try {
                await invoke('update_item_tags', { id: item.id, tags: newTags });
                item.tags = newTags;
              } catch (err) {
                console.error(err);
              }
            }
          }
          
          if (activeFilter === `category:${cat}`) {
            const allBtn = document.querySelector('.nav-item[data-filter="all"]');
            selectFilter('all', allBtn);
          } else {
            render();
            updateBadges();
          }
          showToast('Kategori silindi', 'success');
        }
      });
    }

    sidebarCategories.appendChild(a);
  });
}

function selectFilter(filterValue, element) {
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (element) {
    element.classList.add('active');
  }
  activeFilter = filterValue;
  renderLimit = 40;
  render();
}

// Category Modal Logic
function openCategoryModal(item) {
  categoryTargetId = item.id;
  newCategoryInput.value = '';
  renderCategoryCheckboxes(item);
  categoryModal.classList.add('visible');
}

function closeCategoryModal() {
  categoryModal.classList.remove('visible');
  categoryTargetId = null;
}

function renderCategoryCheckboxes(item) {
  categoryCheckboxList.innerHTML = '';
  const cats = getCategories();
  
  if (cats.length === 0) {
    categoryCheckboxList.innerHTML = '<span style="font-size:0.75rem; color:var(--text4); padding: 4px 0; display: block;">Henüz kategori yok. Aşağıdan oluşturun.</span>';
    return;
  }
  
  cats.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'category-checkbox-item custom-checkbox-container';
    const isChecked = item.tags && item.tags.includes(cat);
    label.innerHTML = `
      <input type="checkbox" data-category="${escapeHTML(cat)}" ${isChecked ? 'checked' : ''}>
      <span class="checkmark"></span>
      <span>${escapeHTML(cat)}</span>
    `;
    categoryCheckboxList.appendChild(label);
  });
}

createCategoryBtn.addEventListener('click', () => {
  const catName = newCategoryInput.value.trim();
  if (!catName) {
    showToast('Lütfen geçerli bir kategori adı girin!', 'error');
    newCategoryInput.focus();
    return;
  }
  
  saveCategory(catName);
  newCategoryInput.value = '';
  
  if (categoryTargetId === 'bulk') {
    const checkedBoxes = categoryCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
    const checkedCats = Array.from(checkedBoxes).map(cb => cb.dataset.category);
    renderCategoryCheckboxes({ tags: checkedCats });
  } else {
    const item = itemsState.find(i => i.id === categoryTargetId);
    if (item) {
      renderCategoryCheckboxes(item);
    }
  }
  showToast('Kategori oluşturuldu', 'success');
});

newCategoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    createCategoryBtn.click();
  }
});

categoryModalSubmit.addEventListener('click', async () => {
  if (!categoryTargetId) return;
  const checkedCheckboxes = categoryCheckboxList.querySelectorAll('input[type="checkbox"]:checked');
  const selectedTags = Array.from(checkedCheckboxes).map(cb => cb.dataset.category);
  
  if (categoryTargetId === 'bulk') {
    const count = selectedItemIds.size;
    let successCount = 0;
    for (const id of selectedItemIds) {
      try {
        const success = await invoke('update_item_tags', { id, tags: selectedTags });
        if (success) {
          const item = itemsState.find(i => i.id === id);
          if (item) item.tags = selectedTags;
          successCount++;
        }
      } catch (err) {}
    }
    
    toggleBulkMode(false);
    render();
    updateBadges();
    closeCategoryModal();
    showToast(`${successCount} öğenin kategorileri güncellendi.`, 'success');
    return;
  }
  
  try {
    const success = await invoke('update_item_tags', { id: categoryTargetId, tags: selectedTags });
    if (success) {
      const item = itemsState.find(i => i.id === categoryTargetId);
      if (item) {
        item.tags = selectedTags;
        render();
        updateBadges();
        closeCategoryModal();
        showToast('Kategoriler başarıyla güncellendi', 'success');
      }
    }
  } catch (err) {
    showToast('Kategoriler güncellenemedi: ' + err, 'error');
  }
});

categoryModalClose.addEventListener('click', closeCategoryModal);
categoryModalCancel.addEventListener('click', closeCategoryModal);
categoryModal.addEventListener('click', (e) => {
  if (e.target === categoryModal) closeCategoryModal();
});

// Add Category Modal Helpers
function openAddCategoryModal() {
  newCategorySidebarInput.value = '';
  addCategoryModal.classList.add('visible');
  newCategorySidebarInput.focus();
}

function closeAddCategoryModal() {
  addCategoryModal.classList.remove('visible');
  newCategorySidebarInput.value = '';
}

addCategoryBtn.addEventListener('click', (e) => {
  e.preventDefault();
  openAddCategoryModal();
});

addCategoryModalClose.addEventListener('click', closeAddCategoryModal);
addCategoryModalCancel.addEventListener('click', closeAddCategoryModal);
addCategoryModal.addEventListener('click', (e) => {
  if (e.target === addCategoryModal) closeAddCategoryModal();
});

addCategoryModalSubmit.addEventListener('click', () => {
  const catName = newCategorySidebarInput.value.trim();
  if (!catName) {
    showToast('Lütfen geçerli bir kategori adı girin!', 'error');
    newCategorySidebarInput.focus();
    return;
  }
  
  saveCategory(catName);
  updateCategoriesSidebar();
  closeAddCategoryModal();
  showToast('Kategori başarıyla eklendi', 'success');
});

newCategorySidebarInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    addCategoryModalSubmit.click();
  }
});

// Manage Categories Modal Actions
function openManageCategoriesModal() {
  renderManageCategoriesList();
  manageCategoriesModal.classList.add('visible');
}

function closeManageCategoriesModal() {
  manageCategoriesModal.classList.remove('visible');
}

function renderManageCategoriesList() {
  manageCategoriesList.innerHTML = '';
  const cats = getCategories();
  
  if (cats.length === 0) {
    manageCategoriesList.innerHTML = '<span style="font-size:0.75rem; color:var(--text4); padding: 4px 0; display: block;">Henüz hiç kategori oluşturulmadı.</span>';
    return;
  }
  
  cats.forEach(cat => {
    const label = document.createElement('label');
    label.className = 'category-checkbox-item custom-checkbox-container';
    label.innerHTML = `
      <input type="checkbox" data-category="${escapeHTML(cat)}">
      <span class="checkmark"></span>
      <span>${escapeHTML(cat)}</span>
    `;
    manageCategoriesList.appendChild(label);
  });
}

if (manageCategoriesBtn) {
  manageCategoriesBtn.addEventListener('click', (e) => {
    e.preventDefault();
    openManageCategoriesModal();
  });
}

if (manageCategoriesModalClose) {
  manageCategoriesModalClose.addEventListener('click', closeManageCategoriesModal);
}
if (manageCategoriesModalCloseBtn) {
  manageCategoriesModalCloseBtn.addEventListener('click', closeManageCategoriesModal);
}
if (manageCategoriesModal) {
  manageCategoriesModal.addEventListener('click', (e) => {
    if (e.target === manageCategoriesModal) closeManageCategoriesModal();
  });
}

if (manageCategoriesDeleteBtn) {
  manageCategoriesDeleteBtn.addEventListener('click', async () => {
    const checkedBoxes = manageCategoriesList.querySelectorAll('input[type="checkbox"]:checked');
    const selectedCats = Array.from(checkedBoxes).map(cb => cb.dataset.category);
    
    if (selectedCats.length === 0) {
      showToast('Lütfen silmek için en az bir kategori seçin!', 'error');
      return;
    }
    
    const confirmed = await showCustomConfirm(
      'Kategorileri Sil',
      `Seçilen ${selectedCats.length} kategoriyi silmek istediğinize emin misiniz? Bu kategorilere ait tüm öğeler bu kategorilerden çıkarılacaktır.`,
      'Evet, Hepsini Sil'
    );
    
    if (confirmed) {
      let customCats = [];
      try {
        const stored = localStorage.getItem('quickstack_custom_categories');
        if (stored) {
          customCats = JSON.parse(stored);
        }
      } catch (err) {}
      
      customCats = customCats.filter(c => !selectedCats.includes(c));
      localStorage.setItem('quickstack_custom_categories', JSON.stringify(customCats));
      
      // Update tags on itemsState and backend
      for (let item of itemsState) {
        if (item.tags && item.tags.some(t => selectedCats.includes(t))) {
          const newTags = item.tags.filter(t => !selectedCats.includes(t));
          try {
            await invoke('update_item_tags', { id: item.id, tags: newTags });
            item.tags = newTags;
          } catch (err) {
            console.error(err);
          }
        }
      }
      
      // Switch view if current category filter was deleted
      if (activeFilter.startsWith('category:')) {
        const currentViewedCat = activeFilter.substring(9);
        if (selectedCats.includes(currentViewedCat)) {
          const allBtn = document.querySelector('.nav-item[data-filter="all"]');
          selectFilter('all', allBtn);
        }
      }
      
      render();
      updateBadges();
      renderManageCategoriesList();
      showToast('Seçilen kategoriler silindi', 'success');
    }
  });
}

async function fetchItems() {
  try {
    itemsState = await invoke('get_items');
    renderLimit = 40;
    render();
    updateBadges();
    await updateStats();
  } catch (err) {
    showToast('Öğeler yüklenirken hata oluştu: ' + err, 'error');
  }
}

async function updateStats() {
  try {
    const stats = await invoke('get_stats');
    statTotal.textContent = stats.total;
    statStorage.textContent = formatBytes(stats.storageBytes);
  } catch (err) {
    console.error('İstatistikler güncellenemedi:', err);
  }
}

async function copyContent(content, cardEl) {
  try {
    lastCopiedFromApp = content;
    await invoke('copy_to_clipboard', { content });
    
    cardEl.classList.add('copied');
    showToast('İçerik panoya kopyalandı', 'success');

    setTimeout(() => {
      cardEl.classList.remove('copied');
    }, 1500);
  } catch (err) {
    showToast('Kopyalama başarısız: ' + err, 'error');
  }
}

async function togglePinItem(id) {
  try {
    const isPinned = await invoke('toggle_pin', { id });
    const item = itemsState.find(i => i.id === id);
    if (item) {
      item.pinned = isPinned;
      render();
      updateBadges();
      updateStats();
      showToast(isPinned ? 'Öğe sabitlendi' : 'Öğenin sabitlemesi kaldırıldı', 'success');
    }
  } catch (err) {
    showToast('Sabitleme işlemi başarısız: ' + err, 'error');
  }
}

async function toggleFavoriteItem(id) {
  try {
    const isFavorite = await invoke('toggle_favorite', { id });
    const item = itemsState.find(i => i.id === id);
    if (item) {
      item.favorite = isFavorite;
      render();
      updateBadges();
      updateStats();
      showToast(isFavorite ? 'Öğe favorilere eklendi' : 'Öğe favorilerden çıkarıldı', 'success');
    }
  } catch (err) {
    showToast('Favori işlemi başarısız: ' + err, 'error');
  }
}

async function deleteItem(id) {
  try {
    const success = await invoke('remove_item', { id });
    if (success) {
      itemsState = itemsState.filter(i => i.id !== id);
      render();
      updateBadges();
      updateStats();
      showToast('Öğe silindi', 'success');
    }
  } catch (err) {
    showToast('Öğe silinemedi: ' + err, 'error');
  }
}

let confirmResolve = null;

function showCustomConfirm(title, body, submitText = 'Evet, Hepsini Sil') {
  const headerEl = confirmModal.querySelector('.modal-header h2');
  const bodyEl = confirmModal.querySelector('.modal-body p');
  const submitBtn = confirmModal.querySelector('#confirmModalSubmit');

  if (headerEl) {
    headerEl.innerHTML = `<i class="fa-solid fa-triangle-exclamation" style="color: var(--rose);"></i> ${title}`;
  }
  if (bodyEl) {
    bodyEl.textContent = body;
  }
  if (submitBtn) {
    submitBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> ${submitText}`;
  }

  confirmModal.classList.add('visible');
  return new Promise((resolve) => {
    confirmResolve = resolve;
  });
}

function closeConfirm(value) {
  confirmModal.classList.remove('visible');
  if (confirmResolve) {
    confirmResolve(value);
    confirmResolve = null;
  }
}

confirmModalClose.addEventListener('click', () => closeConfirm(false));
confirmModalCancel.addEventListener('click', () => closeConfirm(false));
confirmModalSubmit.addEventListener('click', () => closeConfirm(true));
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) closeConfirm(false);
});

async function clearAll() {
  const confirmed = await showCustomConfirm(
    'Pano Geçmişini Temizle',
    'Kopyalanan tüm öğeleri (favoriler dahil) kalıcı olarak silmek istediğinize emin misiniz? Bu işlem geri alınamaz.',
    'Evet, Hepsini Sil'
  );
  if (confirmed) {
    try {
      await invoke('clear_all');
      itemsState = [];
      render();
      updateBadges();
      updateStats();
      showToast('Tüm öğeler silindi', 'success');
    } catch (err) {
      showToast('Temizleme işlemi başarısız: ' + err, 'error');
    }
  }
}

clearBtn.addEventListener('click', clearAll);

// Context Menu Management
function openContextMenu(e, item) {
  contextMenuTargetId = item.id;
  ctxPinText.textContent = item.pinned ? 'Sabitlemeyi Kaldır' : 'Sabitle';
  
  const ctxFavText = document.getElementById('ctxFavText');
  if (ctxFavText) {
    ctxFavText.textContent = item.favorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle';
  }
  const favIcon = contextMenu.querySelector('[data-action="favorite"] i');
  if (favIcon) {
    if (item.favorite) {
      favIcon.className = 'fa-solid fa-star';
    } else {
      favIcon.className = 'fa-regular fa-star';
    }
  }

  // Categories in Context Menu
  const ctxCategoriesList = document.getElementById('ctxCategoriesList');
  const ctxCategoriesSection = document.getElementById('ctxCategoriesSection');
  const ctxCatDivider = document.getElementById('ctxCatDivider');
  
  if (ctxCategoriesList) {
    const cats = getCategories();
    if (cats.length === 0) {
      if (ctxCategoriesSection) ctxCategoriesSection.style.display = 'none';
      if (ctxCatDivider) ctxCatDivider.style.display = 'none';
    } else {
      if (ctxCategoriesSection) ctxCategoriesSection.style.display = 'flex';
      if (ctxCatDivider) ctxCatDivider.style.display = 'block';
      ctxCategoriesList.innerHTML = '';
      
      cats.forEach(cat => {
        const isChecked = item.tags && item.tags.includes(cat);
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.alignItems = 'center';
        row.style.gap = '8px';
        row.style.padding = '4px 6px';
        row.style.fontSize = '0.74rem';
        row.style.color = 'var(--text2)';
        row.style.cursor = 'pointer';
        row.style.borderRadius = '4px';
        row.style.transition = 'all var(--t)';
        row.style.userSelect = 'none';
        
        row.innerHTML = `
          <i class="fa-solid ${isChecked ? 'fa-square-check' : 'fa-square'}" style="font-size:0.75rem; color:${isChecked ? 'var(--accent-l)' : 'var(--text4)'}"></i>
          <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(cat)}</span>
        `;
        
        row.addEventListener('mouseenter', () => {
          row.style.background = 'rgba(255,255,255,0.05)';
          row.style.color = 'var(--text1)';
        });
        row.addEventListener('mouseleave', () => {
          row.style.background = 'transparent';
          row.style.color = 'var(--text2)';
        });
        
        row.addEventListener('click', async (event) => {
          event.stopPropagation();
          closeContextMenu();
          
          let newTags = item.tags ? [...item.tags] : [];
          if (isChecked) {
            newTags = newTags.filter(t => t !== cat);
          } else {
            newTags.push(cat);
          }
          
          try {
            const success = await invoke('update_item_tags', { id: item.id, tags: newTags });
            if (success) {
              item.tags = newTags;
              render();
              updateBadges();
              showToast(`"${item.title}" kategorileri güncellendi.`, 'success');
            }
          } catch (err) {
            showToast('Kategori güncellenemedi: ' + err, 'error');
          }
        });
        ctxCategoriesList.appendChild(row);
      });
    }
  }
  
  contextMenu.style.display = 'block';
  contextMenu.classList.add('visible');
  
  const menuWidth = contextMenu.offsetWidth || 160;
  const menuHeight = contextMenu.offsetHeight || 180;
  
  let x = e.clientX;
  let y = e.clientY;
  
  if (x + menuWidth > window.innerWidth) {
    x -= menuWidth;
  }
  if (y + menuHeight > window.innerHeight) {
    y -= menuHeight;
  }
  
  contextMenu.style.left = `${x}px`;
  contextMenu.style.top = `${y}px`;
}

function closeContextMenu() {
  contextMenu.style.display = 'none';
  contextMenu.classList.remove('visible');
  contextMenuTargetId = null;
}

contextMenu.addEventListener('click', (e) => {
  const itemEl = e.target.closest('.ctx-item');
  if (!itemEl) return;
  
  const action = itemEl.dataset.action;
  const targetId = contextMenuTargetId;
  closeContextMenu();
  
  if (!targetId) return;
  const item = itemsState.find(i => i.id === targetId);
  if (!item) return;

  if (action === 'rename') {
    openRenameModal(item);
  } else if (action === 'categories') {
    openCategoryModal(item);
  } else if (action === 'pin') {
    togglePinItem(targetId);
  } else if (action === 'favorite') {
    toggleFavoriteItem(targetId);
  } else if (action === 'delete') {
    const cardEl = document.querySelector(`.card[data-id="${targetId}"]`);
    if (cardEl) {
      cardEl.classList.add('deleting');
      setTimeout(() => deleteItem(targetId), 300);
    } else {
      deleteItem(targetId);
    }
  }
});

// Color Picker inside context menu
const colorDots = document.querySelectorAll('.color-dot');
colorDots.forEach(dot => {
  dot.addEventListener('click', async (e) => {
    e.stopPropagation();
    const color = dot.dataset.color;
    const targetId = contextMenuTargetId;
    closeContextMenu();
    if (!targetId) return;

    try {
      const success = await invoke('update_item_color', { id: targetId, color });
      if (success) {
        const item = itemsState.find(i => i.id === targetId);
        if (item) {
          item.color = color || null;
          render();
          showToast('Öğe rengi güncellendi', 'success');
        }
      }
    } catch (err) {
      showToast('Renk güncellenemedi: ' + err, 'error');
    }
  });
});

document.addEventListener('click', () => closeContextMenu());
document.addEventListener('scroll', () => closeContextMenu(), true);

// Tab Switcher in Add Modal
mtabs.forEach(tab => {
  tab.addEventListener('click', () => {
    mtabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    selectedTab = tab.dataset.type;
    itemContent.focus();
  });
});

// Modal Actions
addBtn.addEventListener('click', () => {
  addModal.classList.add('visible');
  itemContent.value = '';
  itemTitle.value = '';
  mtabs.forEach(t => t.classList.remove('active'));
  document.querySelector('.mtab[data-type="text"]').classList.add('active');
  selectedTab = 'text';
  itemContent.focus();
});

function closeModal() {
  addModal.classList.remove('visible');
}

modalClose.addEventListener('click', closeModal);
modalCancel.addEventListener('click', closeModal);
addModal.addEventListener('click', (e) => {
  if (e.target === addModal) closeModal();
});

// Rename Modal Logic
function openRenameModal(item) {
  renameTargetId = item.id;
  renameInput.value = item.title || '';
  renameModal.classList.add('visible');
  renameInput.focus();
  renameInput.select();
}

function closeRenameModal() {
  renameModal.classList.remove('visible');
  renameInput.value = '';
  renameTargetId = null;
}

renameModalClose.addEventListener('click', closeRenameModal);
renameModalCancel.addEventListener('click', closeRenameModal);
renameModal.addEventListener('click', (e) => {
  if (e.target === renameModal) closeRenameModal();
});

renameModalSubmit.addEventListener('click', async () => {
  const newTitle = renameInput.value.trim();
  if (!newTitle) {
    showToast('Lütfen geçerli bir isim girin!', 'error');
    renameInput.focus();
    return;
  }
  if (!renameTargetId) return;

  try {
    const success = await invoke('update_item_title', { id: renameTargetId, title: newTitle });
    if (success) {
      const item = itemsState.find(i => i.id === renameTargetId);
      if (item) {
        item.title = newTitle;
        render();
        closeRenameModal();
        showToast('Öğe adı başarıyla güncellendi', 'success');
      }
    }
  } catch (err) {
    showToast('Ad değiştirilemedi: ' + err, 'error');
  }
});

renameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    renameModalSubmit.click();
  }
});

modalSubmit.addEventListener('click', async () => {
  const content = itemContent.value.trim();
  if (!content) {
    showToast('Lütfen içerik girin!', 'error');
    itemContent.focus();
    return;
  }
  
  try {
    const newItem = await invoke('add_item', { content, itemType: selectedTab });
    itemsState.unshift(newItem);
    render();
    updateBadges();
    updateStats();
    closeModal();
    showToast('Yeni öğe başarıyla eklendi', 'success');
  } catch (err) {
    showToast('Öğe eklenemedi: ' + err, 'error');
  }
});

// Search & Sort listeners
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderLimit = 40;
  render();
});

sortDropdownBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  sortDropdown.classList.toggle('open');
});

sortOptItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    const val = item.dataset.value;
    currentSort = val;
    
    // Update active class
    sortOptItems.forEach(opt => opt.classList.remove('active'));
    item.classList.add('active');
    
    // Update button text
    sortDropdownVal.textContent = item.textContent;
    
    // Close dropdown
    sortDropdown.classList.remove('open');
    
    // Trigger render
    renderLimit = 40;
    render();
  });
});

// Close dropdown on click outside
document.addEventListener('click', () => {
  sortDropdown.classList.remove('open');
});

// Layout Grid/List View Switch
viewButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    viewButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentView = btn.dataset.view;
    if (currentView === 'list') {
      cardsContainer.classList.add('list-view');
    } else {
      cardsContainer.classList.remove('list-view');
    }
  });
});

// Filtering
navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    selectFilter(item.dataset.filter, item);
  });
});



// Responsive Sidebar Toggle
sidebarToggle.addEventListener('click', (e) => {
  e.stopPropagation();
  sidebar.classList.toggle('open');
});

document.addEventListener('click', (e) => {
  if (sidebar.classList.contains('open') && !sidebar.contains(e.target) && e.target !== sidebarToggle) {
    sidebar.classList.remove('open');
  }
});

// Global Shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement !== searchInput && document.activeElement !== itemContent && document.activeElement !== itemTitle) {
    e.preventDefault();
    searchInput.focus();
    searchInput.select();
  }

  if (e.key === 'Escape') {
    closeModal();
    closeConfirm(false);
    closeContextMenu();
    closeSettingsModal();
    closeRenameModal();
    closeCategoryModal();
    closeAddCategoryModal();
    closeManageCategoriesModal();
    if (document.activeElement === searchInput) {
      searchInput.blur();
    }
  }
});

// Real-time clipboard changed event listener
listen('clipboard-changed', (event) => {
  const newItem = event.payload;
  if (!itemsState.some(item => item.content === newItem.content)) {
    itemsState.unshift(newItem);
    render();
    updateBadges();
    updateStats();

    if (newItem.content === lastCopiedFromApp) {
      lastCopiedFromApp = ''; // Reset
    } else {
      showToast('Yeni pano içeriği algılandı: ' + newItem.title, 'success');
    }
  }
});

// Global HTML5 Drag & Drop listener for links and text from browsers
document.addEventListener('dragover', (e) => {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
});

document.addEventListener('drop', async (e) => {
  e.preventDefault();
  
  let text = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
  text = text ? text.trim() : '';
  
  if (text) {
    try {
      const newItem = await invoke('add_item', { content: text });
      itemsState = itemsState.filter(item => item.content !== newItem.content);
      itemsState.unshift(newItem);
      render();
      updateBadges();
      updateStats();
      showToast('Bağlantı/Metin başarıyla eklendi', 'success');
    } catch (err) {
      showToast('Ekleme başarısız: ' + err, 'error');
    }
  }
});

// DOM Load Init
window.addEventListener('DOMContentLoaded', () => {
  fetchItems();
  loadSettings();
});

// Infinite scroll for performance
const contentArea = document.querySelector('.content-area');
if (contentArea) {
  contentArea.addEventListener('scroll', () => {
    if (contentArea.scrollTop + contentArea.clientHeight >= contentArea.scrollHeight - 150) {
      if (renderLimit < filteredLength) {
        renderLimit += 40;
        render();
      }
    }
  });
}

// Settings Modal Management
const settingsBtn = document.getElementById('settingsBtn');
const settingsModal = document.getElementById('settingsModal');
const settingsModalClose = document.getElementById('settingsModalClose');
const settingsModalCancel = document.getElementById('settingsModalCancel');
const settingsModalSubmit = document.getElementById('settingsModalSubmit');
const hotkeyInput = document.getElementById('hotkeyInput');
const resetHotkeyBtn = document.getElementById('resetHotkeyBtn');
const notificationsToggle = document.getElementById('notificationsToggle');

let currentHotkey = 'Win + Z';
let recordedHotkey = '';

if (resetHotkeyBtn) {
  resetHotkeyBtn.addEventListener('click', (e) => {
    e.preventDefault();
    recordedHotkey = 'Win + Z';
    hotkeyInput.value = 'Win + Z';
    showToast('Kısayol Win + Z olarak ayarlandı, kaydetmeyi unutmayın!', 'success');
  });
}

async function loadSettings() {
  try {
    currentHotkey = await invoke('get_shortcut');
    hotkeyInput.value = currentHotkey;
  } catch (err) {
    console.error('Kısayol yüklenemedi:', err);
  }
  
  // Load notification toggle from localStorage
  const notificationsEnabled = localStorage.getItem('quickstack_notifications_enabled') !== 'false';
  if (notificationsToggle) {
    notificationsToggle.checked = notificationsEnabled;
  }
}

settingsBtn.addEventListener('click', (e) => {
  e.preventDefault();
  loadSettings();
  settingsModal.classList.add('visible');
});

function closeSettingsModal() {
  settingsModal.classList.remove('visible');
  hotkeyInput.classList.remove('recording');
}

settingsModalClose.addEventListener('click', closeSettingsModal);
settingsModalCancel.addEventListener('click', closeSettingsModal);
settingsModal.addEventListener('click', (e) => {
  if (e.target === settingsModal) closeSettingsModal();
});

hotkeyInput.addEventListener('focus', () => {
  hotkeyInput.classList.add('recording');
  hotkeyInput.value = '';
  recordedHotkey = '';
});

hotkeyInput.addEventListener('blur', () => {
  hotkeyInput.classList.remove('recording');
  if (!recordedHotkey) {
    hotkeyInput.value = currentHotkey;
  }
});

hotkeyInput.addEventListener('keydown', (e) => {
  e.preventDefault();
  e.stopPropagation();

  const key = e.key;
  if (key === 'Escape') {
    hotkeyInput.blur();
    closeSettingsModal();
    return;
  }

  const isModifier = ['Control', 'Alt', 'Shift', 'Meta'].includes(key);
  
  const parts = [];
  if (e.metaKey || key === 'Meta') parts.push('Win');
  if (e.ctrlKey || key === 'Control') parts.push('Ctrl');
  if (e.altKey || key === 'Alt') parts.push('Alt');
  if (e.shiftKey || key === 'Shift') parts.push('Shift');
  
  if (!isModifier) {
    let keyName = key;
    if (keyName === ' ') keyName = 'Space';
    else if (keyName === 'ArrowUp') keyName = 'Up';
    else if (keyName === 'ArrowDown') keyName = 'Down';
    else if (keyName === 'ArrowLeft') keyName = 'Left';
    else if (keyName === 'ArrowRight') keyName = 'Right';
    else if (keyName === 'Esc') keyName = 'Escape';
    
    if (keyName.length === 1) {
      keyName = keyName.toUpperCase();
    }
    
    const allowedKeys = [
      'SPACE', 'TAB', 'ENTER', 'RETURN', 'ESCAPE', 'ESC', 'BACKSPACE', 'INSERT', 'DELETE', 'DEL',
      'HOME', 'END', 'PAGEUP', 'PGUP', 'PAGEDOWN', 'PGDN', 'UP', 'DOWN', 'LEFT', 'RIGHT'
    ];
    
    const isLetter = /^[A-Z]$/.test(keyName);
    const isDigit = /^[0-9]$/.test(keyName);
    const isFunctionKey = /^F[1-9][0-2]?$/.test(keyName);
    const isAllowedSpecial = allowedKeys.includes(keyName.toUpperCase());

    if (!isLetter && !isDigit && !isFunctionKey && !isAllowedSpecial) {
      return; // Ignore unsupported keys like CapsLock
    }

    parts.push(keyName);
    
    recordedHotkey = parts.join(' + ');
    hotkeyInput.value = recordedHotkey;
  } else {
    // Modifiers only
    if (parts.length > 0) {
      hotkeyInput.value = parts.join(' + ') + ' + ...';
    }
  }
});

settingsModalSubmit.addEventListener('click', async () => {
  const shortcutToSave = recordedHotkey || currentHotkey;
  if (!shortcutToSave || shortcutToSave.endsWith('+ ...') || shortcutToSave.endsWith('+')) {
    showToast('Lütfen geçerli bir tuş kombinasyonu girin (örn. Ctrl + Alt + K)', 'error');
    return;
  }

  // Check if modifier is required (standard keys require at least one modifier to prevent capturing normal typing)
  const hasModifier = shortcutToSave.includes('Win') || shortcutToSave.includes('Ctrl') || shortcutToSave.includes('Alt') || shortcutToSave.includes('Shift');
  const tokens = shortcutToSave.split(' + ');
  const mainKey = tokens[tokens.length - 1];
  const isFunctionKey = /^F[1-9][0-2]?$/.test(mainKey);

  if (!hasModifier && !isFunctionKey) {
    showToast('Harf, sayı ve diğer normal tuşlar için en az bir niteleyici tuş (Ctrl, Alt, Shift, Win) kullanmalısınız!', 'error');
    return;
  }

  try {
    // Save notification toggle
    if (notificationsToggle) {
      localStorage.setItem('quickstack_notifications_enabled', notificationsToggle.checked ? 'true' : 'false');
    }

    const savedName = await invoke('set_shortcut', { shortcut: shortcutToSave });
    currentHotkey = savedName;
    hotkeyInput.value = savedName;
    closeSettingsModal();
    showToast('Ayarlar başarıyla kaydedildi.', 'success');
  } catch (err) {
    showToast('Kısayol kaydedilemedi: ' + err, 'error');
  }
});

// Bulk Select Mode logic and listeners
function toggleCardSelection(id) {
  if (selectedItemIds.has(id)) {
    selectedItemIds.delete(id);
  } else {
    selectedItemIds.add(id);
  }
  
  const cardEl = document.querySelector(`.card[data-id="${id}"]`);
  if (cardEl) {
    const isSelected = selectedItemIds.has(id);
    cardEl.classList.toggle('selected', isSelected);
    const cb = cardEl.querySelector('.card-select-checkbox');
    if (cb) cb.checked = isSelected;
  }
  
  updateBulkBar();
}

function updateBulkBar() {
  const count = selectedItemIds.size;
  bulkCount.textContent = `${count} öğe seçildi`;
  
  if (count > 0 && isBulkMode) {
    bulkBar.classList.add('visible');
  } else {
    bulkBar.classList.remove('visible');
  }
}

function toggleBulkMode(active) {
  isBulkMode = active;
  selectedItemIds.clear();
  document.body.classList.toggle('bulk-active', active);
  
  if (active) {
    bulkModeBtn.classList.add('active');
    bulkModeBtn.innerHTML = `<i class="fa-solid fa-xmark"></i><span>Kapat</span>`;
    showToast('Çoklu seçim modu aktif. Öğeleri seçip işlem yapabilirsiniz.', 'info');
  } else {
    bulkModeBtn.classList.remove('active');
    bulkModeBtn.innerHTML = `<i class="fa-solid fa-list-check"></i><span>Seç</span>`;
  }
  
  render();
  updateBulkBar();
}

if (bulkModeBtn) {
  bulkModeBtn.addEventListener('click', () => {
    toggleBulkMode(!isBulkMode);
  });
}

if (bulkCancelBtn) {
  bulkCancelBtn.addEventListener('click', () => {
    toggleBulkMode(false);
  });
}

if (bulkDelBtn) {
  bulkDelBtn.addEventListener('click', async () => {
    const count = selectedItemIds.size;
    if (count === 0) return;
    
    const confirmed = await showCustomConfirm(
      'Seçilenleri Sil',
      `Seçilen ${count} öğeyi kalıcı olarak silmek istediğinize emin misiniz?`,
      'Evet, Sil'
    );
    if (confirmed) {
      let errorCount = 0;
      for (const id of selectedItemIds) {
        try {
          const success = await invoke('remove_item', { id });
          if (success) {
            itemsState = itemsState.filter(i => i.id !== id);
          }
        } catch (err) {
          errorCount++;
        }
      }
      
      toggleBulkMode(false);
      render();
      updateBadges();
      updateStats();
      
      if (errorCount === 0) {
        showToast(`${count} öğe başarıyla silindi.`, 'success');
      } else {
        showToast(`${count - errorCount} öğe silindi, ${errorCount} öğede hata oluştu.`, 'warning');
      }
    }
  });
}

if (bulkFavBtn) {
  bulkFavBtn.addEventListener('click', async () => {
    const count = selectedItemIds.size;
    if (count === 0) return;
    
    const selectedItems = itemsState.filter(i => selectedItemIds.has(i.id));
    const anyNotFav = selectedItems.some(i => !i.favorite);
    
    for (const id of selectedItemIds) {
      const item = itemsState.find(i => i.id === id);
      if (item && item.favorite !== anyNotFav) {
        try {
          await invoke('toggle_favorite', { id });
          item.favorite = anyNotFav;
        } catch (err) {}
      }
    }
    
    toggleBulkMode(false);
    render();
    updateBadges();
    showToast(`${count} öğenin favori durumu güncellendi.`, 'success');
  });
}

if (bulkPinBtn) {
  bulkPinBtn.addEventListener('click', async () => {
    const count = selectedItemIds.size;
    if (count === 0) return;
    
    const selectedItems = itemsState.filter(i => selectedItemIds.has(i.id));
    const anyNotPinned = selectedItems.some(i => !i.pinned);
    
    for (const id of selectedItemIds) {
      const item = itemsState.find(i => i.id === id);
      if (item && item.pinned !== anyNotPinned) {
        try {
          await invoke('toggle_pin', { id });
          item.pinned = anyNotPinned;
        } catch (err) {}
      }
    }
    
    toggleBulkMode(false);
    render();
    updateBadges();
    showToast(`${count} öğenin sabitleme durumu güncellendi.`, 'success');
  });
}

if (bulkTagBtn) {
  bulkTagBtn.addEventListener('click', () => {
    const count = selectedItemIds.size;
    if (count === 0) return;
    
    categoryTargetId = 'bulk';
    newCategoryInput.value = '';
    
    const firstId = Array.from(selectedItemIds)[0];
    const item = itemsState.find(i => i.id === firstId) || { tags: [] };
    renderCategoryCheckboxes(item);
    categoryModal.classList.add('visible');
  });
}
