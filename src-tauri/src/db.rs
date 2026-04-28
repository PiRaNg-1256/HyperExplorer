use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ── State ─────────────────────────────────────────────────────────────────────

pub struct DbState(pub Mutex<Connection>);

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub file_path: String,
    pub tag_name: String,
    pub color: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub path: String,
    pub visited_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PinnedItem {
    pub path: String,
    pub position_x: f64,
    pub position_y: f64,
    pub is_dir: bool,
}

// ── Init ──────────────────────────────────────────────────────────────────────

pub fn init_db(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        "
        PRAGMA journal_mode=WAL;

        CREATE TABLE IF NOT EXISTS tags (
            file_path TEXT NOT NULL,
            tag_name  TEXT NOT NULL,
            color     TEXT NOT NULL DEFAULT '#6366f1',
            PRIMARY KEY (file_path, tag_name)
        );

        CREATE TABLE IF NOT EXISTS history (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            path       TEXT NOT NULL,
            visited_at INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS history_path ON history(path);
        CREATE INDEX IF NOT EXISTS history_time ON history(visited_at DESC);

        CREATE TABLE IF NOT EXISTS pinned (
            path       TEXT PRIMARY KEY,
            position_x REAL NOT NULL DEFAULT 0,
            position_y REAL NOT NULL DEFAULT 0,
            is_dir     INTEGER NOT NULL DEFAULT 0
        );

        CREATE VIRTUAL TABLE IF NOT EXISTS file_index USING fts5(
            file_path UNINDEXED,
            file_name,
            is_dir UNINDEXED
        );
        ",
    )?;
    // Migration: add is_dir column to pre-existing installs (silently ignored if already present)
    conn.execute(
        "ALTER TABLE pinned ADD COLUMN is_dir INTEGER NOT NULL DEFAULT 0",
        [],
    ).ok();
    Ok(())
}

// ── Tag commands ──────────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_tag(
    file_path: String,
    tag_name: String,
    color: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO tags (file_path, tag_name, color) VALUES (?1, ?2, ?3)",
        params![file_path, tag_name, color],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_tags(
    file_path: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT file_path, tag_name, color FROM tags WHERE file_path = ?1")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![file_path], |row| {
            Ok(Tag {
                file_path: row.get(0)?,
                tag_name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_all_tags(state: tauri::State<'_, DbState>) -> Result<Vec<Tag>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT file_path, tag_name, color FROM tags ORDER BY tag_name")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(Tag {
                file_path: row.get(0)?,
                tag_name: row.get(1)?,
                color: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_tag(
    file_path: String,
    tag_name: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "DELETE FROM tags WHERE file_path = ?1 AND tag_name = ?2",
        params![file_path, tag_name],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

// ── History commands ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn add_history(path: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64;
    conn.execute(
        "INSERT INTO history (path, visited_at) VALUES (?1, ?2)",
        params![path, now],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())?;
    // Keep only last 500 entries
    conn.execute(
        "DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY visited_at DESC LIMIT 500)",
        [],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_history(state: tauri::State<'_, DbState>) -> Result<Vec<HistoryEntry>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare(
            "SELECT path, visited_at FROM history ORDER BY visited_at DESC LIMIT 100",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(HistoryEntry {
                path: row.get(0)?,
                visited_at: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

// ── Pinned commands ───────────────────────────────────────────────────────────

#[tauri::command]
pub fn pin_item(
    path: String,
    position_x: f64,
    position_y: f64,
    is_dir: bool,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute(
        "INSERT OR REPLACE INTO pinned (path, position_x, position_y, is_dir) VALUES (?1, ?2, ?3, ?4)",
        params![path, position_x, position_y, is_dir as i32],
    )
    .map(|_| ())
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_pinned(state: tauri::State<'_, DbState>) -> Result<Vec<PinnedItem>, String> {
    let conn = state.0.lock().unwrap();
    let mut stmt = conn
        .prepare("SELECT path, position_x, position_y, is_dir FROM pinned")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(PinnedItem {
                path: row.get(0)?,
                position_x: row.get(1)?,
                position_y: row.get(2)?,
                is_dir: row.get::<_, i32>(3).map(|v| v != 0)?,
            })
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn unpin_item(path: String, state: tauri::State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().unwrap();
    conn.execute("DELETE FROM pinned WHERE path = ?1", params![path])
        .map(|_| ())
        .map_err(|e| e.to_string())
}

// ── File Index (FTS5) ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn index_directory(
    root: String,
    state: tauri::State<'_, DbState>,
) -> Result<(), String> {
    let conn = state.0.lock().unwrap();

    // Clear existing entries for this root
    let root_prefix = if root.ends_with('\\') {
        root.clone()
    } else {
        format!("{}\\", root)
    };
    conn.execute(
        "DELETE FROM file_index WHERE file_path LIKE ?1 || '%'",
        params![root_prefix],
    )
    .map_err(|e| e.to_string())?;

    // Recursively walk the directory and insert into index
    for entry in walkdir::WalkDir::new(&root)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.path().to_string_lossy() != root)
    {
        let path = entry.path();
        let file_path = path.to_string_lossy().to_string();
        let file_name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        let is_dir = entry.file_type().is_dir() as i32;

        conn.execute(
            "INSERT INTO file_index (file_path, file_name, is_dir) VALUES (?1, ?2, ?3)",
            params![file_path, file_name, is_dir],
        )
        .ok(); // Silently skip errors (e.g., permission denied)
    }

    Ok(())
}

#[tauri::command]
pub fn search_index(
    query: String,
    root: String,
    state: tauri::State<'_, DbState>,
) -> Result<Vec<(String, bool)>, String> {
    let conn = state.0.lock().unwrap();
    let root_normalized = if root.ends_with('\\') {
        root.clone()
    } else {
        format!("{}\\", root)
    };

    let mut stmt = conn
        .prepare(
            "SELECT file_path, is_dir FROM file_index
             WHERE file_index MATCH ?1 AND file_path LIKE ?2 || '%'
             LIMIT 2000",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map(params![format!("{}*", query), root_normalized], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i32>(1)? != 0))
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}
