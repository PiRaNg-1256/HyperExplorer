mod commands;
mod db;

use commands::WatcherState;
use db::DbState;
use std::collections::HashMap;
use std::sync::Mutex;
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .manage(WatcherState(Mutex::new(HashMap::new())))
        .setup(|app| {
            // Resolve app data dir, fall back to current dir in dev
            let db_dir = app
                .path()
                .app_data_dir()
                .unwrap_or_else(|_| std::path::PathBuf::from("."));
            std::fs::create_dir_all(&db_dir).ok();
            let db_path = db_dir.join("hyperexplorer.db");

            let conn =
                rusqlite::Connection::open(&db_path).expect("Failed to open SQLite database");
            db::init_db(&conn).expect("Failed to initialize database schema");
            app.manage(DbState(Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // File system
            commands::list_dir,
            commands::get_file_metadata,
            commands::search_files,
            commands::watch_dir,
            commands::open_file,
            commands::delete_to_trash,
            commands::rename_file,
            commands::copy_file,
            commands::create_dir,
            commands::list_drives,
            commands::get_special_dirs,
            commands::read_text_file,
            commands::move_file,
            commands::show_open_with_dialog,
            commands::compress_to_zip,
            // Database — tags
            db::add_tag,
            db::get_tags,
            db::get_all_tags,
            db::remove_tag,
            // Database — history
            db::add_history,
            db::get_history,
            // Database — pinned
            db::pin_item,
            db::get_pinned,
            db::unpin_item,
            // Database — file index (FTS5)
            db::index_directory,
            db::search_index,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
