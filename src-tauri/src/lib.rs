use arboard::Clipboard;
use base64::{engine::general_purpose::STANDARD, Engine};
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{Emitter, Manager};
use uuid::Uuid;

/// Represents a single clipboard/file item
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClipItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String, // "text", "code", "link", "image"
    pub title: String,
    pub content: String,
    pub preview: String,
    pub pinned: bool,
    pub favorite: bool,
    #[serde(rename = "createdAt")]
    pub created_at: String,
    #[serde(rename = "fileSize")]
    pub file_size: Option<u64>,
    pub language: Option<String>,
    pub tags: Vec<String>,
    pub color: Option<String>,
}

/// Shared application state
pub struct AppState {
    pub items: Mutex<Vec<ClipItem>>,
    pub last_text: Mutex<String>,
    pub last_image_hash: Mutex<String>,
    pub monitoring: Mutex<bool>,
    pub data_path: Mutex<Option<PathBuf>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            items: Mutex::new(Vec::new()),
            last_text: Mutex::new(String::new()),
            last_image_hash: Mutex::new(String::new()),
            monitoring: Mutex::new(true),
            data_path: Mutex::new(None),
        }
    }

    /// Set the data file path and load existing items from disk
    pub fn init_storage(&self, app_data_dir: PathBuf) {
        let data_file = app_data_dir.join("quickstack_data.json");

        // Ensure directory exists
        if let Some(parent) = data_file.parent() {
            let _ = fs::create_dir_all(parent);
        }

        // Load existing items from disk
        if data_file.exists() {
            if let Ok(json_str) = fs::read_to_string(&data_file) {
                if let Ok(loaded_items) = serde_json::from_str::<Vec<ClipItem>>(&json_str) {
                    let mut items = self.items.lock().unwrap();
                    *items = loaded_items;
                }
            }
        }

        // Store the path for future saves
        *self.data_path.lock().unwrap() = Some(data_file);
    }

    /// Save current items to disk
    pub fn save_to_disk(&self) {
        let path = {
            let path_lock = self.data_path.lock().unwrap();
            path_lock.clone()
        };
        if let Some(path) = path {
            let items = {
                let items_lock = self.items.lock().unwrap();
                items_lock.clone()
            };
            thread::spawn(move || {
                if let Ok(json_str) = serde_json::to_string_pretty(&items) {
                    let _ = fs::write(path, json_str);
                }
            });
        }
    }
}

// ─── Auto-categorization helpers ───

fn detect_type(text: &str) -> &'static str {
    let trimmed = text.trim();

    // Link detection
    if trimmed.starts_with("http://")
        || trimmed.starts_with("https://")
        || trimmed.starts_with("ftp://")
        || trimmed.starts_with("www.")
    {
        return "link";
    }

    // Code detection heuristics
    let code_indicators = [
        "fn ",
        "let ",
        "const ",
        "var ",
        "function ",
        "class ",
        "import ",
        "def ",
        "return ",
        "if (",
        "if(",
        "for (",
        "for(",
        "while ",
        "pub fn",
        "pub struct",
        "impl ",
        "#include",
        "#define",
        "console.log",
        "println!",
        "print(",
        "System.out",
        "package ",
        "using ",
        "namespace ",
        "interface ",
        "SELECT ",
        "INSERT ",
        "UPDATE ",
        "DELETE ",
        "CREATE TABLE",
        "<?php",
        "<%",
        "<script",
        "</div>",
        "<html",
    ];

    let has_braces = trimmed.contains('{') && trimmed.contains('}');
    let has_semicolons = trimmed.matches(';').count() >= 2;
    let has_arrows = trimmed.contains("=>") || trimmed.contains("->");
    let has_indent = trimmed
        .lines()
        .any(|l| l.starts_with("    ") || l.starts_with('\t'));
    let multi_line = trimmed.lines().count() > 2;

    let indicator_match = code_indicators.iter().any(|&ind| trimmed.contains(ind));

    if indicator_match || (multi_line && (has_braces || has_semicolons) && has_indent) || has_arrows
    {
        return "code";
    }

    "text"
}

fn detect_language(text: &str) -> Option<String> {
    let t = text.trim();
    if t.contains("fn ") && (t.contains("let ") || t.contains("pub ") || t.contains("use ")) {
        Some("Rust".into())
    } else if t.contains("function ")
        || t.contains("const ")
        || t.contains("console.log")
        || t.contains("=>")
    {
        Some("JavaScript".into())
    } else if t.contains("def ") && t.contains(":") && !t.contains("{") {
        Some("Python".into())
    } else if t.contains("public class") || t.contains("System.out") {
        Some("Java".into())
    } else if t.contains("#include") || t.contains("std::") || t.contains("cout") {
        Some("C++".into())
    } else if t.contains("<html") || t.contains("<div") || t.contains("</") {
        Some("HTML".into())
    } else if t.contains("SELECT ") || t.contains("INSERT ") || t.contains("CREATE TABLE") {
        Some("SQL".into())
    } else if t.contains("<?php") {
        Some("PHP".into())
    } else {
        None
    }
}

fn generate_title(text: &str, item_type: &str) -> String {
    match item_type {
        "link" => {
            // Extract domain from URL
            text.trim()
                .replace("https://", "")
                .replace("http://", "")
                .replace("www.", "")
                .split('/')
                .next()
                .unwrap_or("Bağlantı")
                .to_string()
        }
        "code" => {
            let lang = detect_language(text).unwrap_or_else(|| "Kod".into());
            format!("{} Parçası", lang)
        }
        _ => {
            let first_line = text.lines().next().unwrap_or("").trim();
            if first_line.is_empty() {
                "Metin".to_string()
            } else {
                truncate(first_line, 47)
            }
        }
    }
}

fn truncate(s: &str, max: usize) -> String {
    let char_count = s.chars().count();
    if char_count <= max {
        s.to_string()
    } else {
        let truncated: String = s.chars().take(max).collect();
        format!("{}...", truncated)
    }
}

// ─── Tauri Commands ───

#[tauri::command]
fn get_items(state: tauri::State<'_, Arc<AppState>>) -> Vec<ClipItem> {
    state.items.lock().unwrap().clone()
}

#[tauri::command]
fn add_item(
    state: tauri::State<'_, Arc<AppState>>,
    content: String,
    item_type: Option<String>,
) -> ClipItem {
    let detected_type = item_type.unwrap_or_else(|| detect_type(&content).to_string());
    let item = ClipItem {
        id: Uuid::new_v4().to_string(),
        title: generate_title(&content, &detected_type),
        preview: truncate(&content, 200),
        language: if detected_type == "code" {
            detect_language(&content)
        } else {
            None
        },
        content,
        item_type: detected_type,
        pinned: false,
        favorite: false,
        created_at: Utc::now().to_rfc3339(),
        file_size: None,
        tags: Vec::new(),
        color: None,
    };
    let cloned = item.clone();
    state.items.lock().unwrap().insert(0, item);
    state.save_to_disk();
    cloned
}

#[tauri::command]
fn remove_item(state: tauri::State<'_, Arc<AppState>>, id: String) -> bool {
    let mut items = state.items.lock().unwrap();
    let len_before = items.len();
    items.retain(|i| i.id != id);
    let removed = items.len() < len_before;
    drop(items);
    if removed {
        state.save_to_disk();
    }
    removed
}

#[tauri::command]
fn toggle_pin(state: tauri::State<'_, Arc<AppState>>, id: String) -> bool {
    let mut items = state.items.lock().unwrap();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.pinned = !item.pinned;
        let pinned = item.pinned;
        drop(items);
        state.save_to_disk();
        return pinned;
    }
    false
}

#[tauri::command]
fn toggle_favorite(state: tauri::State<'_, Arc<AppState>>, id: String) -> bool {
    let mut items = state.items.lock().unwrap();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.favorite = !item.favorite;
        let favorite = item.favorite;
        drop(items);
        state.save_to_disk();
        return favorite;
    }
    false
}

#[tauri::command]
fn clear_all(state: tauri::State<'_, Arc<AppState>>) {
    let mut items = state.items.lock().unwrap();
    items.clear();
    drop(items);
    state.save_to_disk();
}

#[tauri::command]
fn open_link(app_handle: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app_handle
        .opener()
        .open_path(&url, None::<String>)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn search_items(state: tauri::State<'_, Arc<AppState>>, query: String) -> Vec<ClipItem> {
    let items = state.items.lock().unwrap();
    let q = query.to_lowercase();
    items
        .iter()
        .filter(|i| {
            i.title.to_lowercase().contains(&q)
                || i.content.to_lowercase().contains(&q)
                || i.tags.iter().any(|t| t.to_lowercase().contains(&q))
        })
        .cloned()
        .collect()
}

#[tauri::command]
fn get_stats(state: tauri::State<'_, Arc<AppState>>) -> serde_json::Value {
    let items = state.items.lock().unwrap();
    let total = items.len();
    let pinned = items.iter().filter(|i| i.pinned).count();
    let text_count = items.iter().filter(|i| i.item_type == "text").count();
    let code_count = items.iter().filter(|i| i.item_type == "code").count();
    let link_count = items.iter().filter(|i| i.item_type == "link").count();
    let image_count = items.iter().filter(|i| i.item_type == "image").count();

    // Estimate storage
    let storage: usize = items.iter().map(|i| i.content.len() + i.title.len()).sum();

    serde_json::json!({
        "total": total,
        "pinned": pinned,
        "textCount": text_count,
        "codeCount": code_count,
        "linkCount": link_count,
        "imageCount": image_count,
        "storageBytes": storage
    })
}

#[tauri::command]
fn toggle_monitoring(state: tauri::State<'_, Arc<AppState>>) -> bool {
    let mut monitoring = state.monitoring.lock().unwrap();
    *monitoring = !*monitoring;
    *monitoring
}

#[tauri::command]
fn copy_to_clipboard(app_handle: tauri::AppHandle, content: String) -> Result<(), String> {
    use std::sync::mpsc::channel;

    let (tx, rx) = channel();

    app_handle
        .run_on_main_thread(move || {
            let res = try_copy_to_clipboard(&content);
            let _ = tx.send(res);
        })
        .map_err(|e| format!("Ana iş parçacığında çalıştırılamadı: {}", e))?;

    rx.recv()
        .map_err(|e| format!("Kanal iletişim hatası: {}", e))?
}

fn try_copy_to_clipboard(content: &str) -> Result<(), String> {
    let mut last_err = String::new();
    for _ in 0..3 {
        match try_copy_to_clipboard_once(content) {
            Ok(_) => return Ok(()),
            Err(e) => {
                last_err = e;
                std::thread::sleep(std::time::Duration::from_millis(30));
            }
        }
    }
    Err(last_err)
}

fn try_copy_to_clipboard_once(content: &str) -> Result<(), String> {
    let mut clipboard = Clipboard::new().map_err(|e| e.to_string())?;
    if content.starts_with("data:image/") {
        let pos = content.find(";base64,").ok_or("Geçersiz görsel formatı")?;
        let b64 = &content[pos + 8..];
        let bytes = STANDARD
            .decode(b64)
            .map_err(|e| format!("Base64 çözümleme hatası: {}", e))?;
        let img =
            image::load_from_memory(&bytes).map_err(|e| format!("Görsel yükleme hatası: {}", e))?;
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();
        let img_data = arboard::ImageData {
            width: width as usize,
            height: height as usize,
            bytes: std::borrow::Cow::from(rgba.into_raw()),
        };
        clipboard
            .set_image(img_data)
            .map_err(|e| format!("Panoya yazma hatası: {}", e))?;
        return Ok(());
    }
    clipboard.set_text(content).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn update_item_color(state: tauri::State<'_, Arc<AppState>>, id: String, color: String) -> bool {
    let mut items = state.items.lock().unwrap();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.color = Some(color);
        drop(items);
        state.save_to_disk();
        return true;
    }
    false
}

#[tauri::command]
fn update_item_title(state: tauri::State<'_, Arc<AppState>>, id: String, title: String) -> bool {
    let mut items = state.items.lock().unwrap();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.title = title;
        drop(items);
        state.save_to_disk();
        return true;
    }
    false
}

#[tauri::command]
fn update_item_tags(state: tauri::State<'_, Arc<AppState>>, id: String, tags: Vec<String>) -> bool {
    let mut items = state.items.lock().unwrap();
    if let Some(item) = items.iter_mut().find(|i| i.id == id) {
        item.tags = tags;
        drop(items);
        state.save_to_disk();
        return true;
    }
    false
}

#[cfg(target_os = "windows")]
fn get_clipboard_files() -> Option<Vec<PathBuf>> {
    use std::os::windows::ffi::OsStringExt;
    use winapi::shared::ntdef::HANDLE;
    use winapi::um::winuser::{CloseClipboard, GetClipboardData, OpenClipboard, CF_HDROP};

    extern "system" {
        fn DragQueryFileW(hDrop: HANDLE, iFile: u32, lpszFile: *mut u16, cch: u32) -> u32;
    }

    unsafe {
        if OpenClipboard(std::ptr::null_mut()) == 0 {
            return None;
        }

        let h_data = GetClipboardData(CF_HDROP);
        if h_data.is_null() {
            CloseClipboard();
            return None;
        }

        let count = DragQueryFileW(h_data, 0xFFFFFFFF, std::ptr::null_mut(), 0);
        let mut paths = Vec::new();

        for i in 0..count {
            let len = DragQueryFileW(h_data, i, std::ptr::null_mut(), 0);
            if len > 0 {
                let mut buf = vec![0u16; (len + 1) as usize];
                DragQueryFileW(h_data, i, buf.as_mut_ptr(), buf.len() as u32);
                buf.pop(); // Remove null terminator
                let os_str = std::ffi::OsString::from_wide(&buf);
                paths.push(PathBuf::from(os_str));
            }
        }

        CloseClipboard();

        if paths.is_empty() {
            None
        } else {
            Some(paths)
        }
    }
}

#[cfg(not(target_os = "windows"))]
fn get_clipboard_files() -> Option<Vec<PathBuf>> {
    None
}

fn import_file_from_path(
    _app_handle: &tauri::AppHandle,
    _state: &Arc<AppState>,
    path: PathBuf,
) -> Option<ClipItem> {
    if !path.exists() {
        return None;
    }

    let file_name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("Dosya")
        .to_string();

    let file_size = fs::metadata(&path).map(|m| m.len()).ok();

    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    let is_image = ["png", "jpg", "jpeg", "gif", "bmp", "webp"].contains(&ext.as_str());

    if is_image {
        if let Ok(bytes) = fs::read(&path) {
            let b64 = STANDARD.encode(&bytes);
            let mime_type = match ext.as_str() {
                "png" => "image/png",
                "jpg" | "jpeg" => "image/jpeg",
                "gif" => "image/gif",
                "webp" => "image/webp",
                _ => "image/png",
            };
            let data_url = format!("data:{};base64,{}", mime_type, b64);

            return Some(ClipItem {
                id: Uuid::new_v4().to_string(),
                title: file_name,
                preview: format!("Görsel Dosyası ({})", ext.to_uppercase()),
                content: data_url,
                item_type: "image".to_string(),
                pinned: false,
                favorite: false,
                created_at: Utc::now().to_rfc3339(),
                file_size,
                language: None,
                tags: Vec::new(),
                color: None,
            });
        }
    } else {
        // Try reading as text
        if let Ok(content) = fs::read_to_string(&path) {
            if content.len() < 5 * 1024 * 1024 {
                let item_type = detect_type(&content).to_string();
                return Some(ClipItem {
                    id: Uuid::new_v4().to_string(),
                    title: file_name,
                    preview: truncate(&content, 200),
                    language: if item_type == "code" {
                        detect_language(&content)
                    } else {
                        None
                    },
                    content,
                    item_type,
                    pinned: false,
                    favorite: false,
                    created_at: Utc::now().to_rfc3339(),
                    file_size,
                    tags: Vec::new(),
                    color: None,
                });
            }
        }
    }
    // Convert to a file link so user can open it
    let path_url = format!("file:///{}", path.to_string_lossy().replace('\\', "/"));
    Some(ClipItem {
        id: Uuid::new_v4().to_string(),
        title: file_name,
        preview: format!("Dosya Bağlantısı ({})", ext.to_uppercase()),
        content: path_url,
        item_type: "link".to_string(),
        pinned: false,
        favorite: false,
        created_at: Utc::now().to_rfc3339(),
        file_size,
        language: None,
        tags: Vec::new(),
        color: None,
    })
}

// ─── Clipboard monitoring thread ───

fn start_clipboard_monitor(app_handle: tauri::AppHandle, state: Arc<AppState>) {
    thread::spawn(move || {
        let mut clipboard = match Clipboard::new() {
            Ok(c) => Some(c),
            Err(e) => {
                eprintln!("Failed to initialize clipboard: {}", e);
                None
            }
        };

        #[cfg(target_os = "windows")]
        let mut last_seq = 0;

        loop {
            thread::sleep(Duration::from_millis(300));

            // Check if monitoring is enabled
            let monitoring = *state.monitoring.lock().unwrap();
            if !monitoring {
                continue;
            }

            #[cfg(target_os = "windows")]
            {
                let seq = unsafe { winapi::um::winuser::GetClipboardSequenceNumber() };
                if seq == last_seq {
                    continue;
                }
                last_seq = seq;
            }

            // Check for file changes in clipboard (Windows CF_HDROP)
            #[cfg(target_os = "windows")]
            {
                if let Some(files) = get_clipboard_files() {
                    if !files.is_empty() {
                        let paths_str: String = files
                            .iter()
                            .map(|p| p.to_string_lossy().to_string())
                            .collect::<Vec<String>>()
                            .join("|");
                        let last = state.last_text.lock().unwrap().clone();
                        if paths_str != last {
                            *state.last_text.lock().unwrap() = paths_str.clone();

                            for path in files.into_iter().rev() {
                                if let Some(item) = import_file_from_path(&app_handle, &state, path)
                                {
                                    let mut items = state.items.lock().unwrap();
                                    let already_exists =
                                        items.iter().any(|i| i.content == item.content);
                                    if !already_exists {
                                        let cloned = item.clone();
                                        items.insert(0, item);
                                        drop(items);
                                        state.save_to_disk();
                                        let _ = app_handle.emit("clipboard-changed", cloned);
                                    } else {
                                        drop(items);
                                    }
                                }
                            }
                        }
                        continue;
                    }
                }
            }

            if clipboard.is_none() {
                clipboard = Clipboard::new().ok();
            }

            let cb = match &mut clipboard {
                Some(c) => c,
                None => continue,
            };

            // Check for text changes
            if let Ok(text) = cb.get_text() {
                let trimmed = text.trim().to_string();
                if !trimmed.is_empty() {
                    let last = state.last_text.lock().unwrap().clone();
                    if trimmed != last {
                        *state.last_text.lock().unwrap() = trimmed.clone();

                        let mut items = state.items.lock().unwrap();
                        let already_exists = items.iter().any(|i| i.content == trimmed);

                        if !already_exists {
                            let item_type = detect_type(&trimmed).to_string();
                            let item = ClipItem {
                                id: Uuid::new_v4().to_string(),
                                title: generate_title(&trimmed, &item_type),
                                preview: truncate(&trimmed, 200),
                                language: if item_type == "code" {
                                    detect_language(&trimmed)
                                } else {
                                    None
                                },
                                content: trimmed,
                                item_type,
                                pinned: false,
                                favorite: false,
                                created_at: Utc::now().to_rfc3339(),
                                file_size: None,
                                tags: Vec::new(),
                                color: None,
                            };

                            let cloned = item.clone();
                            items.insert(0, item);
                            drop(items);
                            state.save_to_disk();
                            let _ = app_handle.emit("clipboard-changed", cloned);
                        } else {
                            drop(items);
                        }
                    }
                }
            }

            // Check for image changes
            if let Ok(img) = cb.get_image() {
                let pixels: Vec<u8> = img.bytes.to_vec();
                let width = img.width;
                let height = img.height;

                let hash: usize = pixels.iter().take(100).map(|b| *b as usize).sum();
                let hash_str = format!("img_{}_{}_{}", width, height, hash);

                let last_img = state.last_image_hash.lock().unwrap().clone();
                if hash_str != last_img {
                    *state.last_image_hash.lock().unwrap() = hash_str.clone();

                    let items = state.items.lock().unwrap();
                    let already_exists = items
                        .iter()
                        .any(|i| i.item_type == "image" && i.title == hash_str);

                    if !already_exists {
                        drop(items); // Release lock!

                        if let Some(img_buf) =
                            image::RgbaImage::from_raw(width as u32, height as u32, pixels)
                        {
                            let mut png_bytes = Vec::new();
                            let mut cursor = std::io::Cursor::new(&mut png_bytes);
                            if img_buf
                                .write_to(&mut cursor, image::ImageFormat::Png)
                                .is_ok()
                            {
                                let b64 = STANDARD.encode(&png_bytes);
                                let data_url = format!("data:image/png;base64,{}", b64);

                                let item = ClipItem {
                                    id: Uuid::new_v4().to_string(),
                                    title: hash_str,
                                    preview: format!("{}x{} görsel", width, height),
                                    content: data_url,
                                    item_type: "image".to_string(),
                                    pinned: false,
                                    favorite: false,
                                    created_at: Utc::now().to_rfc3339(),
                                    file_size: Some(png_bytes.len() as u64),
                                    language: None,
                                    tags: Vec::new(),
                                    color: None,
                                };

                                let cloned = item.clone();
                                let mut items = state.items.lock().unwrap();
                                items.insert(0, item);
                                drop(items);
                                state.save_to_disk();
                                let _ = app_handle.emit("clipboard-changed", cloned);
                            }
                        }
                    } else {
                        drop(items);
                    }
                }
            }
        }
    });
}

// ─── Startup & Autostart Configuration ───

#[cfg(target_os = "windows")]
fn setup_autostart() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let exe_path_str = exe_path.to_string_lossy().to_string();
    let working_dir = match exe_path.parent() {
        Some(p) => p.to_string_lossy().to_string(),
        None => "".to_string(),
    };

    if let Some(app_data) = std::env::var_os("APPDATA") {
        let startup_dir = std::path::Path::new(&app_data)
            .join("Microsoft")
            .join("Windows")
            .join("Start Menu")
            .join("Programs")
            .join("Startup");
        let shortcut_path = startup_dir.join("QuickStack.lnk");
        let shortcut_path_str = shortcut_path.to_string_lossy().to_string();

        let ps_script = format!(
            "$WshShell = New-Object -ComObject WScript.Shell; \
             $Shortcut = $WshShell.CreateShortcut('{}'); \
             $Shortcut.TargetPath = '{}'; \
             $Shortcut.Arguments = '--startup'; \
             $Shortcut.WorkingDirectory = '{}'; \
             $Shortcut.Description = 'QuickStack - Akıllı Pano ve Dosya Yönetimi'; \
             $Shortcut.Save();",
            shortcut_path_str.replace("'", "''"),
            exe_path_str.replace("'", "''"),
            working_dir.replace("'", "''")
        );

        let _ = Command::new("powershell")
            .arg("-NoProfile")
            .arg("-Command")
            .arg(&ps_script)
            .creation_flags(0x08000000)
            .status();
    }
}

#[cfg(not(target_os = "windows"))]
fn setup_autostart() {}

#[cfg(target_os = "windows")]
fn setup_portable_uninstall_registry() {
    use std::os::windows::process::CommandExt;
    use std::process::Command;

    let exe_path = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return,
    };
    let exe_path_str = exe_path.to_string_lossy().to_string();

    let display_name = "QuickStack (Portable)";
    let reg_key =
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\QuickStackPortable";

    // Build the uninstall string command
    let uninstall_cmd = format!(
        "cmd.exe /c \"taskkill /f /im quickstack.exe & \
         del /f /q \\\"%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Startup\\QuickStack.lnk\\\" & \
         rmdir /s /q \\\"%APPDATA%\\com.quickstack.app\\\" & \
         reg delete \\\"{}\\\" /f & \
         powershell -Command \\\"Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('QuickStack ayarları ve kısayolu başarıyla temizlendi. Artık indirdiğiniz exe dosyasını silebilirsiniz.', 'QuickStack Portable')\\\"\"",
        reg_key
    );

    // Register DisplayName
    let _ = Command::new("reg")
        .arg("add")
        .arg(reg_key)
        .arg("/v")
        .arg("DisplayName")
        .arg("/t")
        .arg("REG_SZ")
        .arg("/d")
        .arg(display_name)
        .arg("/f")
        .creation_flags(0x08000000)
        .status();

    // Register UninstallString
    let _ = Command::new("reg")
        .arg("add")
        .arg(reg_key)
        .arg("/v")
        .arg("UninstallString")
        .arg("/t")
        .arg("REG_SZ")
        .arg("/d")
        .arg(&uninstall_cmd)
        .arg("/f")
        .creation_flags(0x08000000)
        .status();

    // Register DisplayIcon
    let _ = Command::new("reg")
        .arg("add")
        .arg(reg_key)
        .arg("/v")
        .arg("DisplayIcon")
        .arg("/t")
        .arg("REG_SZ")
        .arg("/d")
        .arg(&exe_path_str)
        .arg("/f")
        .creation_flags(0x08000000)
        .status();

    // Register Publisher
    let _ = Command::new("reg")
        .arg("add")
        .arg(reg_key)
        .arg("/v")
        .arg("Publisher")
        .arg("/t")
        .arg("REG_SZ")
        .arg("/d")
        .arg("QuickStack")
        .arg("/f")
        .creation_flags(0x08000000)
        .status();

    // Register DisplayVersion
    let _ = Command::new("reg")
        .arg("add")
        .arg(reg_key)
        .arg("/v")
        .arg("DisplayVersion")
        .arg("/t")
        .arg("REG_SZ")
        .arg("/d")
        .arg("0.1.0")
        .arg("/f")
        .creation_flags(0x08000000)
        .status();
}

#[cfg(not(target_os = "windows"))]
fn setup_portable_uninstall_registry() {}

// ─── Native Win32 Hotkey Listener ───

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutConfig {
    pub win: bool,
    pub ctrl: bool,
    pub alt: bool,
    pub shift: bool,
    pub vk_code: u32,
    pub display_name: String,
}

static SHORTCUT_CONFIG: RwLock<Option<ShortcutConfig>> = RwLock::new(None);

fn parse_shortcut(shortcut_str: &str) -> Option<ShortcutConfig> {
    let mut win = false;
    let mut ctrl = false;
    let mut alt = false;
    let mut shift = false;
    let mut vk_code = 0;

    let parts: Vec<&str> = shortcut_str.split('+').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return None;
    }

    for part in &parts {
        let lower = part.to_lowercase();
        if lower == "win" || lower == "super" || lower == "windows" {
            win = true;
        } else if lower == "ctrl" || lower == "control" {
            ctrl = true;
        } else if lower == "alt" {
            alt = true;
        } else if lower == "shift" {
            shift = true;
        } else {
            if lower.len() == 1 {
                let c = lower.chars().next()?;
                if c >= 'a' && c <= 'z' {
                    vk_code = c as u32 - 'a' as u32 + 0x41;
                } else if c >= '0' && c <= '9' {
                    vk_code = c as u32 - '0' as u32 + 0x30;
                }
            } else if lower == "space" {
                vk_code = 0x20;
            } else if lower == "tab" {
                vk_code = 0x09;
            } else if lower == "enter" || lower == "return" {
                vk_code = 0x0D;
            } else if lower == "escape" || lower == "esc" {
                vk_code = 0x1B;
            } else if lower.starts_with('f') && lower.len() > 1 {
                if let Ok(num) = lower[1..].parse::<u32>() {
                    if num >= 1 && num <= 12 {
                        vk_code = 0x70 + (num - 1);
                    }
                }
            } else if lower == "backspace" {
                vk_code = 0x08;
            } else if lower == "insert" {
                vk_code = 0x2D;
            } else if lower == "delete" || lower == "del" {
                vk_code = 0x2E;
            } else if lower == "home" {
                vk_code = 0x24;
            } else if lower == "end" {
                vk_code = 0x23;
            } else if lower == "pageup" || lower == "pgup" {
                vk_code = 0x21;
            } else if lower == "pagedown" || lower == "pgdn" {
                vk_code = 0x22;
            } else if lower == "up" {
                vk_code = 0x26;
            } else if lower == "down" {
                vk_code = 0x28;
            } else if lower == "left" {
                vk_code = 0x25;
            } else if lower == "right" {
                vk_code = 0x27;
            }
        }
    }

    if vk_code == 0 {
        return None;
    }

    let mut display_parts = Vec::new();
    if win {
        display_parts.push("Win");
    }
    if ctrl {
        display_parts.push("Ctrl");
    }
    if alt {
        display_parts.push("Alt");
    }
    if shift {
        display_parts.push("Shift");
    }

    let main_key_str = parts.iter().find(|part| {
        let l = part.to_lowercase();
        l != "win"
            && l != "super"
            && l != "windows"
            && l != "ctrl"
            && l != "control"
            && l != "alt"
            && l != "shift"
    })?;

    let main_key_cap = if main_key_str.len() == 1 {
        main_key_str.to_uppercase()
    } else {
        let mut chars = main_key_str.chars();
        match chars.next() {
            None => String::new(),
            Some(first) => {
                first.to_uppercase().collect::<String>() + &chars.as_str().to_lowercase()
            }
        }
    };
    display_parts.push(&main_key_cap);

    Some(ShortcutConfig {
        win,
        ctrl,
        alt,
        shift,
        vk_code,
        display_name: display_parts.join(" + "),
    })
}

#[tauri::command]
fn get_shortcut() -> String {
    let config_guard = SHORTCUT_CONFIG.read().unwrap();
    match &*config_guard {
        Some(c) => c.display_name.clone(),
        None => "Win + Z".to_string(),
    }
}

#[tauri::command]
fn set_shortcut(app_handle: tauri::AppHandle, shortcut: String) -> Result<String, String> {
    let parsed =
        parse_shortcut(&shortcut).ok_or_else(|| "Geçersiz kısayol formatı!".to_string())?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;
    let settings_file = app_data_dir.join("quickstack_settings.json");
    if let Some(parent) = settings_file.parent() {
        let _ = fs::create_dir_all(parent);
    }

    let json_str = serde_json::to_string_pretty(&parsed).map_err(|e| e.to_string())?;
    fs::write(settings_file, json_str).map_err(|e| e.to_string())?;

    let display_name = parsed.display_name.clone();
    *SHORTCUT_CONFIG.write().unwrap() = Some(parsed);

    Ok(display_name)
}

use std::sync::OnceLock;
static APP_HANDLE: OnceLock<tauri::AppHandle> = OnceLock::new();

#[cfg(target_os = "windows")]
extern "system" fn low_level_keyboard_proc(
    n_code: i32,
    w_param: winapi::shared::minwindef::WPARAM,
    l_param: winapi::shared::minwindef::LPARAM,
) -> winapi::shared::minwindef::LRESULT {
    use winapi::um::winuser::{
        CallNextHookEx, GetAsyncKeyState, HC_ACTION, KBDLLHOOKSTRUCT, WM_KEYDOWN, WM_SYSKEYDOWN,
    };

    if n_code == HC_ACTION as i32 {
        let event_type = w_param as u32;
        let is_key_down = event_type == WM_KEYDOWN || event_type == WM_SYSKEYDOWN;

        if is_key_down {
            let kbd_struct = unsafe { *(l_param as *const KBDLLHOOKSTRUCT) };
            let vk_code = kbd_struct.vkCode;

            let config_guard = SHORTCUT_CONFIG.read().unwrap();
            let config = match &*config_guard {
                Some(c) => c.clone(),
                None => ShortcutConfig {
                    win: true,
                    ctrl: false,
                    alt: false,
                    shift: false,
                    vk_code: 0x5A, // 'Z'
                    display_name: "Win + Z".to_string(),
                },
            };

            if vk_code == config.vk_code {
                let lwin_down = unsafe { GetAsyncKeyState(0x5B) as u16 & 0x8000 != 0 };
                let rwin_down = unsafe { GetAsyncKeyState(0x5C) as u16 & 0x8000 != 0 };
                let win_pressed = lwin_down || rwin_down;

                let ctrl_pressed = unsafe { GetAsyncKeyState(0x11) as u16 & 0x8000 != 0 };
                let alt_pressed = unsafe { GetAsyncKeyState(0x12) as u16 & 0x8000 != 0 };
                let shift_pressed = unsafe { GetAsyncKeyState(0x10) as u16 & 0x8000 != 0 };

                if win_pressed == config.win
                    && ctrl_pressed == config.ctrl
                    && alt_pressed == config.alt
                    && shift_pressed == config.shift
                {
                    if let Some(app_handle) = APP_HANDLE.get() {
                        let app_handle_clone = app_handle.clone();
                        std::thread::spawn(move || {
                            if let Some(window) = app_handle_clone.get_webview_window("main") {
                                if window.is_visible().unwrap_or(false) {
                                    let _ = window.hide();
                                } else {
                                    let _ = window.show();
                                    let _ = window.set_focus();
                                }
                            }
                        });
                    }
                    // Return 1 to suppress the key event, preventing Windows from opening Snap Layouts or doing system tasks
                    return 1;
                }
            }
        }
    }

    unsafe { CallNextHookEx(std::ptr::null_mut(), n_code, w_param, l_param) }
}

#[cfg(target_os = "windows")]
fn start_win32_hotkey_listener(app_handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app_handle);

    std::thread::spawn(|| {
        use std::ptr;
        use winapi::um::winuser::{
            GetMessageW, SetWindowsHookExW, UnhookWindowsHookEx, MSG, WH_KEYBOARD_LL,
        };

        unsafe {
            let hook_id = SetWindowsHookExW(
                WH_KEYBOARD_LL,
                Some(low_level_keyboard_proc),
                ptr::null_mut(),
                0,
            );

            if hook_id.is_null() {
                return;
            }

            let mut msg: MSG = std::mem::zeroed();
            while GetMessageW(&mut msg, ptr::null_mut(), 0, 0) > 0 {
                winapi::um::winuser::TranslateMessage(&msg);
                winapi::um::winuser::DispatchMessageW(&msg);
            }

            UnhookWindowsHookEx(hook_id);
        }
    });
}

#[cfg(not(target_os = "windows"))]
fn start_win32_hotkey_listener(app_handle: tauri::AppHandle) {
    let _ = APP_HANDLE.set(app_handle);
}

// ─── App Entry ───

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let state = Arc::new(AppState::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .on_window_event(|window, event| match event {
            tauri::WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.hide();
            }
            tauri::WindowEvent::DragDrop(drag_drop_event) => {
                if let tauri::DragDropEvent::Drop { paths, .. } = drag_drop_event {
                    let app_handle = window.app_handle();
                    let state = app_handle.state::<Arc<AppState>>();

                    for path in paths.clone().into_iter().rev() {
                        if let Some(item) = import_file_from_path(app_handle, &state, path) {
                            let mut items = state.items.lock().unwrap();
                            let existing_idx = items.iter().position(|i| i.content == item.content);
                            if let Some(idx) = existing_idx {
                                let mut existing_item = items.remove(idx);
                                existing_item.created_at = Utc::now().to_rfc3339();
                                let cloned = existing_item.clone();
                                items.insert(0, existing_item);
                                drop(items);
                                state.save_to_disk();
                                let _ = app_handle.emit("clipboard-changed", cloned);
                            } else {
                                let cloned = item.clone();
                                items.insert(0, item);
                                drop(items);
                                state.save_to_disk();
                                let _ = app_handle.emit("clipboard-changed", cloned);
                            }
                        }
                    }
                }
            }
            _ => {}
        })
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                        use tauri_plugin_global_shortcut::{Code, Modifiers};
                        if shortcut.matches(Modifiers::CONTROL | Modifiers::SHIFT, Code::KeyC) {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                    }
                })
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .manage(state.clone())
        .invoke_handler(tauri::generate_handler![
            get_items,
            add_item,
            remove_item,
            toggle_pin,
            toggle_favorite,
            clear_all,
            search_items,
            get_stats,
            toggle_monitoring,
            copy_to_clipboard,
            update_item_color,
            update_item_title,
            update_item_tags,
            open_link,
            get_shortcut,
            set_shortcut,
        ])
        .setup(move |app| {
            // Setup autostart shortcut in Startup directory
            setup_autostart();

            // Register uninstall registry entry for portable version
            setup_portable_uninstall_registry();

            // Start native Win32 hotkey listener for Win + Z
            start_win32_hotkey_listener(app.handle().clone());

            // Initialize persistent storage
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            state.init_storage(app_data_dir.clone());

            // Load custom shortcut settings
            let settings_file = app_data_dir.join("quickstack_settings.json");
            if settings_file.exists() {
                if let Ok(settings_str) = fs::read_to_string(&settings_file) {
                    if let Ok(config) = serde_json::from_str::<ShortcutConfig>(&settings_str) {
                        *SHORTCUT_CONFIG.write().unwrap() = Some(config);
                    }
                }
            }

            let handle = app.handle().clone();
            let st = state.clone();
            start_clipboard_monitor(handle, st);

            // Create tray menu
            let show_i = MenuItem::with_id(app, "show", "QuickStack'i Göster", true, None::<&str>)?;
            let quit_i = MenuItem::with_id(app, "quit", "Çıkış", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_i, &quit_i])?;

            // Create tray icon
            let _tray = TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

            // Register global shortcuts
            use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut};

            let shortcut_ctrl_shift_c =
                Shortcut::new(Some(Modifiers::CONTROL | Modifiers::SHIFT), Code::KeyC);
            let _ = app.global_shortcut().register(shortcut_ctrl_shift_c);

            // Handle startup argument check
            let args: Vec<String> = std::env::args().collect();
            let has_startup_arg = args.iter().any(|arg| arg == "--startup");

            if !has_startup_arg {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
