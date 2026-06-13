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

// Elements
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

// Render dynamic card list
function render() {
  // 1. Filter items
  let filtered = itemsState.filter(item => {
    // Nav bar filter
    if (activeFilter === 'pinned' && !item.favorite) return false;
    if (activeFilter !== 'all' && activeFilter !== 'pinned' && item.type !== activeFilter) return false;

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
    card.className = `card ${isNew ? 'new-card' : ''}`;
    card.dataset.id = item.id;
    card.dataset.type = item.type;
    
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

    card.innerHTML = `
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
          <button class="card-btn del-btn del" title="Sil">
            <i class="fa-solid fa-trash-can"></i>
          </button>
        </div>
      </div>
      <div class="card-body">
        ${bodyHTML}
      </div>
      <div class="card-foot">
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

    const delBtn = card.querySelector('.del-btn');
    delBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      card.classList.add('deleting');
      setTimeout(() => {
        deleteItem(item.id);
      }, 300);
    });

    // Click & Double Click Handler
    let clickCount = 0;
    let clickTimer = null;

    card.addEventListener('click', (e) => {
      // Ignore clicks on header action buttons
      if (e.target.closest('.card-actions') || e.target.closest('.card-btn')) {
        return;
      }

      if (item.type === 'text' || item.type === 'code') {
        copyContent(item.content, card);
      } else if (item.type === 'image' || item.type === 'link') {
        clickCount++;
        if (clickCount === 1) {
          clickTimer = setTimeout(() => {
            clickCount = 0;
            if (item.type === 'image') {
              openImagePreview(item.content);
            } else if (item.type === 'link') {
              invoke('open_link', { url: item.content }).catch(err => {
                showToast('Bağlantı açılamadı: ' + err, 'error');
              });
            }
          }, 300);
        } else if (clickCount === 2) {
          clearTimeout(clickTimer);
          clickCount = 0;
          copyContent(item.content, card);
        }
      }
    });

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

function showConfirm() {
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
  const confirmed = await showConfirm();
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
    navItems.forEach(n => n.classList.remove('active'));
    item.classList.add('active');
    activeFilter = item.dataset.filter;
    renderLimit = 40;
    render();
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
    if (document.activeElement === searchInput) {
      searchInput.blur();
    }
  }
});

// Real-time clipboard changed event listener
listen('clipboard-changed', (event) => {
  const newItem = event.payload;
  if (!itemsState.some(item => item.id === newItem.id)) {
    itemsState.unshift(newItem);
    render();
    updateBadges();
    updateStats();
    showToast('Yeni pano içeriği algılandı: ' + newItem.title, 'success');
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
    const savedName = await invoke('set_shortcut', { shortcut: shortcutToSave });
    currentHotkey = savedName;
    hotkeyInput.value = savedName;
    closeSettingsModal();
    showToast('Kısayol başarıyla kaydedildi: ' + savedName, 'success');
  } catch (err) {
    showToast('Kısayol kaydedilemedi: ' + err, 'error');
  }
});
