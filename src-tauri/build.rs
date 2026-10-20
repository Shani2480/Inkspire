fn main() {
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "import_document",
            "export_document",
            "read_document",
            "write_document",
            "generate_ai_text",
            "cancel_ai_text",
            "ai_key_status",
            "save_ai_key",
            "test_ai_connection",
            "local_ai_status",
            "local_ai_install",
            "local_ai_cancel_install",
            "local_ai_remove",
            "tools_status",
            "tools_install",
            "tools_cancel_install",
            "tools_remove",
            "list_system_fonts",
            "open_window",
            "rename_document",
        ]),
    ))
    .expect("failed to run Tauri build script");
}
