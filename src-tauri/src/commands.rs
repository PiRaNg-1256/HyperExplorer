use std::collections::HashMap;
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use rusqlite::params;
use serde::{Deserialize, Serialize};
use tauri::Emitter;

// ── Shared structs ────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: i64, // unix ms
    pub is_dir: bool,
    pub extension: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMetadata {
    pub name: String,
    pub path: String,
    pub size: u64,
    pub modified: i64,
    pub created: i64,
    pub is_dir: bool,
    pub extension: String,
    pub readonly: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FsChangeEvent {
    pub path: String,
    pub kind: String,
    pub affected_paths: Vec<String>,
}

// ── Watcher state ─────────────────────────────────────────────────────────────

pub struct WatcherState(pub Mutex<HashMap<String, RecommendedWatcher>>);

// ── Helpers ───────────────────────────────────────────────────────────────────

fn modified_ms(meta: &std::fs::Metadata) -> i64 {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn created_ms(meta: &std::fs::Metadata) -> i64 {
    meta.created()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn entry_from_path(path: &std::path::Path, meta: &std::fs::Metadata) -> FileEntry {
    let name = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.to_string_lossy().to_string());
    let extension = if meta.is_dir() {
        String::new()
    } else {
        path.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    FileEntry {
        name,
        path: path.to_string_lossy().to_string(),
        size: meta.len(),
        modified: modified_ms(meta),
        is_dir: meta.is_dir(),
        extension,
    }
}

// ── Commands ──────────────────────────────────────────────────────────────────

#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<FileEntry>, String> {
    let rd = std::fs::read_dir(&path).map_err(|e| e.to_string())?;

    let mut entries: Vec<FileEntry> = rd
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            let meta = e.metadata().ok()?;
            Some(entry_from_path(&e.path(), &meta))
        })
        .collect();

    // Dirs first, then alphabetical by name (case-insensitive)
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn get_file_metadata(path: String) -> Result<FileMetadata, String> {
    let p = std::path::Path::new(&path);
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| path.clone());
    let extension = if meta.is_dir() {
        String::new()
    } else {
        p.extension()
            .map(|e| e.to_string_lossy().to_lowercase())
            .unwrap_or_default()
    };
    Ok(FileMetadata {
        name,
        path,
        size: meta.len(),
        modified: modified_ms(&meta),
        created: created_ms(&meta),
        is_dir: meta.is_dir(),
        extension,
        readonly: meta.permissions().readonly(),
    })
}

#[tauri::command]
pub fn search_files(
    root: String,
    query: String,
    state: tauri::State<'_, crate::db::DbState>,
) -> Result<Vec<FileEntry>, String> {
    // Try FTS5 index first
    let indexed_results = {
        let conn = state.0.lock().unwrap();
        let root_normalized = if root.ends_with('\\') {
            root.clone()
        } else {
            format!("{}\\", root)
        };

        let stmt = conn
            .prepare(
                "SELECT file_path, is_dir FROM file_index
                 WHERE file_index MATCH ?1 AND file_path LIKE ?2 || '%'
                 LIMIT 2000",
            )
            .ok();

        let mut results = Vec::new();
        if let Some(mut stmt) = stmt {
            if let Ok(rows) = stmt.query_map(params![format!("{}*", query), root_normalized], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0))
            }) {
                for result in rows.flatten() {
                    let path = std::path::Path::new(&result.0);
                    if let Ok(meta) = std::fs::metadata(path) {
                        results.push(entry_from_path(path, &meta));
                    }
                }
            }
        }
        results
    };

    if !indexed_results.is_empty() {
        return Ok(indexed_results);
    }

    // Fall back to walkdir if index is empty or unavailable
    let query_lower = query.to_lowercase();
    let mut results = Vec::new();

    for entry in walkdir::WalkDir::new(&root)
        .max_depth(10)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().to_string_lossy() != root)
    {
        let name = entry.file_name().to_string_lossy().to_lowercase();
        if name.contains(&query_lower) {
            if let Ok(meta) = entry.metadata() {
                results.push(entry_from_path(entry.path(), &meta));
            }
        }
        if results.len() >= 2000 {
            break;
        }
    }

    Ok(results)
}

#[tauri::command]
pub fn watch_dir(
    path: String,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, WatcherState>,
    db_state: tauri::State<'_, crate::db::DbState>,
) -> Result<(), String> {
    // Index directory for search
    {
        let conn = db_state.0.lock().unwrap();
        let root_prefix = if path.ends_with('\\') {
            path.clone()
        } else {
            format!("{}\\", path)
        };
        let _ = conn.execute(
            "DELETE FROM file_index WHERE file_path LIKE ?1 || '%'",
            rusqlite::params![root_prefix],
        );
        for entry in walkdir::WalkDir::new(&path)
            .into_iter()
            .filter_map(|e| e.ok())
            .filter(|e| e.path().to_string_lossy() != path)
        {
            let entry_path = entry.path();
            let file_path = entry_path.to_string_lossy().to_string();
            let file_name = entry_path
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default();
            let is_dir = entry.file_type().is_dir() as i32;

            let _ = conn.execute(
                "INSERT INTO file_index (file_path, file_name, is_dir) VALUES (?1, ?2, ?3)",
                rusqlite::params![file_path, file_name, is_dir],
            );
        }
    }

    let (tx, rx) = std::sync::mpsc::channel::<notify::Result<notify::Event>>();

    let mut watcher =
        RecommendedWatcher::new(tx, Config::default()).map_err(|e| e.to_string())?;

    watcher
        .watch(
            std::path::Path::new(&path),
            RecursiveMode::NonRecursive,
        )
        .map_err(|e| e.to_string())?;

    let watch_path = path.clone();
    std::thread::spawn(move || {
        for result in rx {
            if let Ok(event) = result {
                let affected: Vec<String> = event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect();
                let _ = app_handle.emit(
                    "fs-change",
                    FsChangeEvent {
                        path: watch_path.clone(),
                        kind: format!("{:?}", event.kind),
                        affected_paths: affected,
                    },
                );
            }
        }
    });

    state.0.lock().unwrap().insert(path, watcher);
    Ok(())
}

#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    open::that(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_to_trash(paths: Vec<String>) -> Result<(), String> {
    for path in paths {
        trash::delete(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn rename_file(from: String, to: String) -> Result<(), String> {
    std::fs::rename(&from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn copy_file(from: String, to: String) -> Result<(), String> {
    let src = std::path::Path::new(&from);
    if src.is_dir() {
        copy_dir_recursive(src, std::path::Path::new(&to))
    } else {
        std::fs::copy(&from, &to)
            .map(|_| ())
            .map_err(|e| e.to_string())
    }
}

fn copy_dir_recursive(src: &std::path::Path, dst: &std::path::Path) -> Result<(), String> {
    std::fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ty = entry.file_type().map_err(|e| e.to_string())?;
        let dest = dst.join(entry.file_name());
        if ty.is_dir() {
            copy_dir_recursive(&entry.path(), &dest)?;
        } else {
            std::fs::copy(entry.path(), &dest)
                .map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn create_dir(path: String) -> Result<(), String> {
    std::fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn list_drives() -> Vec<String> {
    let mut drives = Vec::new();
    for letter in b'A'..=b'Z' {
        let path = format!("{}:\\", letter as char);
        if std::path::Path::new(&path).exists() {
            drives.push(path);
        }
    }
    drives
}

/// Opens the Windows "Open With" dialog for a given file.
#[tauri::command]
pub fn show_open_with_dialog(path: String) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("rundll32.exe")
            .args(["shell32.dll,OpenAs_RunDLL", &path])
            .spawn()
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = path;
    }
    Ok(())
}

/// Compress files/dirs to a ZIP archive in dest_dir.
/// Returns the full path of the created archive.
#[tauri::command]
pub fn compress_to_zip(paths: Vec<String>, dest_dir: String) -> Result<String, String> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::CompressionMethod;

    let options = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);

    // Build archive name from first item's stem
    let first_stem = std::path::Path::new(&paths[0])
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_else(|| "Archive".to_string());
    let base_name = if paths.len() == 1 { first_stem } else { "Archive".to_string() };

    // Find non-conflicting name
    let dest = std::path::Path::new(&dest_dir);
    let mut n = 0u32;
    let zip_path = loop {
        let name = if n == 0 {
            format!("{}.zip", base_name)
        } else {
            format!("{} ({}).zip", base_name, n)
        };
        let p = dest.join(&name);
        if !p.exists() {
            break p;
        }
        n += 1;
    };

    let file = std::fs::File::create(&zip_path).map_err(|e| e.to_string())?;
    let mut zip = zip::ZipWriter::new(file);

    for path_str in &paths {
        let path = std::path::Path::new(path_str);
        if path.is_file() {
            let name = path
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_default();
            zip.start_file(&name, options).map_err(|e| e.to_string())?;
            let data = std::fs::read(path_str).map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        } else if path.is_dir() {
            let parent = path.parent().unwrap_or_else(|| std::path::Path::new(""));
            for entry in walkdir::WalkDir::new(path)
                .into_iter()
                .filter_map(|e| e.ok())
            {
                let ep = entry.path();
                let rel = ep
                    .strip_prefix(parent)
                    .unwrap_or(ep)
                    .to_string_lossy()
                    .replace('\\', "/");

                if ep.is_dir() {
                    if rel != "." {
                        zip.add_directory(format!("{}/", rel), SimpleFileOptions::default())
                            .map_err(|e| e.to_string())?;
                    }
                } else {
                    zip.start_file(&rel, options).map_err(|e| e.to_string())?;
                    let data = std::fs::read(ep).map_err(|e| e.to_string())?;
                    zip.write_all(&data).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    zip.finish().map_err(|e| e.to_string())?;
    Ok(zip_path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    use std::io::Read;
    const MAX_BYTES: usize = 200_000;
    let mut f = std::fs::File::open(&path).map_err(|e| e.to_string())?;
    let file_len = f.metadata().map(|m| m.len()).unwrap_or(0) as usize;
    let read_len = MAX_BYTES.min(file_len).max(1);
    let mut buf = vec![0u8; read_len];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    buf.truncate(n);
    // Detect binary: if first 8 KB contains null bytes it's likely binary
    let probe = &buf[..buf.len().min(8192)];
    if probe.contains(&0u8) {
        return Err("Binary file — cannot preview as text".to_string());
    }
    Ok(String::from_utf8_lossy(&buf).into_owned())
}

#[tauri::command]
pub fn move_file(from: String, to: String) -> Result<(), String> {
    // Fast path: rename works on the same filesystem
    if std::fs::rename(&from, &to).is_ok() {
        return Ok(());
    }
    // Fallback: copy then delete (cross-drive move)
    let src = std::path::Path::new(&from);
    if src.is_dir() {
        copy_dir_recursive(src, std::path::Path::new(&to))?;
    } else {
        std::fs::copy(&from, &to)
            .map(|_| ())
            .map_err(|e| e.to_string())?;
    }
    trash::delete(&from).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_special_dirs() -> Vec<FileEntry> {
    let candidates: Vec<Option<std::path::PathBuf>> = vec![
        dirs::desktop_dir(),
        dirs::download_dir(),
        dirs::document_dir(),
        dirs::picture_dir(),
        dirs::video_dir(),
        dirs::audio_dir(),
    ];

    candidates
        .into_iter()
        .flatten()
        .filter(|p| p.exists())
        .filter_map(|p| {
            let meta = std::fs::metadata(&p).ok()?;
            Some(FileEntry {
                name: p
                    .file_name()
                    .map(|n| n.to_string_lossy().to_string())
                    .unwrap_or_else(|| p.to_string_lossy().to_string()),
                path: p.to_string_lossy().to_string(),
                size: 0,
                modified: modified_ms(&meta),
                is_dir: true,
                extension: String::new(),
            })
        })
        .collect()
}
