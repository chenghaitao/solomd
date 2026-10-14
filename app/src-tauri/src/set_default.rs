// "Set as default Markdown editor" — one-click cross-platform implementation.
//
// Each platform has its own OS-level mechanism:
//   - macOS   → LSSetDefaultRoleHandlerForContentType (LaunchServices)
//   - Windows → HKCU\Software\Classes\... + SHChangeNotify
//   - Linux   → xdg-mime default solomd.desktop <mime>
//
// The command reports a language-neutral `code` instead of English prose: it
// used to hand back ready-made sentences ("Set as default for 4 Markdown
// extension(s)…"), so the toast stayed English on every non-English UI. The
// frontend maps the code to a translated string (SettingsPanel.vue).
//
// Codes: `doneMacos` / `failedMacos`, `doneWindows` / `failedWindows`,
// `doneLinux` / `failedLinux`, `failedUnsupported`.

use serde::Serialize;

/// Outcome of one "set as default" attempt. `detail` carries raw OS
/// diagnostics (OSStatus, registry path + error, xdg-mime stderr) — a value the
/// frontend interpolates into a translated sentence, never a sentence itself.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetDefaultOutcome {
    pub ok: bool,
    pub code: String,
    /// Number of file associations applied; 0 on failure.
    pub count: u32,
    pub detail: String,
}

impl SetDefaultOutcome {
    fn done(code: &str, count: u32) -> Self {
        Self { ok: true, code: code.to_string(), count, detail: String::new() }
    }

    fn failed(code: &str, detail: impl Into<String>) -> Self {
        Self { ok: false, code: code.to_string(), count: 0, detail: detail.into() }
    }
}

#[tauri::command]
pub fn set_as_default_markdown_editor() -> SetDefaultOutcome {
    // Exactly one arm survives `cfg`, so it is always this function's tail.
    #[cfg(target_os = "macos")]
    {
        macos::set_default()
    }
    #[cfg(target_os = "windows")]
    {
        windows::set_default()
    }
    #[cfg(target_os = "linux")]
    {
        linux::set_default()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        SetDefaultOutcome::failed("failedUnsupported", String::new())
    }
}

// ====================================================================
// macOS: LaunchServices
// ====================================================================

#[cfg(target_os = "macos")]
mod macos {
    use super::SetDefaultOutcome;
    use core_foundation::base::TCFType;
    use core_foundation::string::{CFString, CFStringRef};

    // kLSRolesAll = 0xFFFFFFFF — any role (viewer/editor/shell)
    const K_LS_ROLES_ALL: u32 = 0xFFFFFFFF;

    #[link(name = "CoreServices", kind = "framework")]
    unsafe extern "C" {
        fn LSSetDefaultRoleHandlerForContentType(
            in_content_type: CFStringRef,
            in_role: u32,
            in_handler_bundle_id: CFStringRef,
        ) -> i32;
    }

    pub fn set_default() -> SetDefaultOutcome {
        // Bundle identifier declared in tauri.conf.json
        let bundle_id = CFString::new("app.solomd");

        // UTIs that map to Markdown / plain text. Multiple UTIs exist because
        // different apps have historically declared their own: we claim them all.
        let utis = [
            "net.daringfireball.markdown",
            "public.markdown",
            "com.solomd.markdown",
        ];

        let mut ok_count = 0;
        let mut first_error: Option<i32> = None;

        for uti in &utis {
            let content_type = CFString::new(uti);
            let status = unsafe {
                LSSetDefaultRoleHandlerForContentType(
                    content_type.as_concrete_TypeRef(),
                    K_LS_ROLES_ALL,
                    bundle_id.as_concrete_TypeRef(),
                )
            };
            if status == 0 {
                ok_count += 1;
            } else if first_error.is_none() {
                first_error = Some(status);
            }
        }

        if ok_count > 0 {
            SetDefaultOutcome::done("doneMacos", ok_count)
        } else {
            SetDefaultOutcome::failed(
                "failedMacos",
                format!("OSStatus {}", first_error.unwrap_or(-1)),
            )
        }
    }
}

// ====================================================================
// Windows: Registry (HKCU) + SHChangeNotify
// ====================================================================

#[cfg(target_os = "windows")]
mod windows {
    use super::SetDefaultOutcome;
    use std::env;
    use std::path::{Path, PathBuf};
    use winreg::enums::*;
    use winreg::RegKey;

    pub fn set_default() -> SetDefaultOutcome {
        match register() {
            Ok(count) => SetDefaultOutcome::done("doneWindows", count),
            Err(detail) => SetDefaultOutcome::failed("failedWindows", detail),
        }
    }

    /// Applies the registry changes. `Err` is the failing registry path plus the
    /// OS error — technical text the frontend shows as a value.
    fn register() -> Result<u32, String> {
        let exe_path_buf = env::current_exe().map_err(|e| format!("current_exe: {e}"))?;
        let exe_path = exe_path_buf.to_string_lossy().to_string();

        let command_value = format!("\"{}\" \"%1\"", exe_path);
        let icon_value = default_file_icon_value(&exe_path_buf);

        let hkcu = RegKey::predef(HKEY_CURRENT_USER);

        // 1. Register the app under Applications\SoloMD.exe so Windows shows
        //    it in the "Open with" list.
        let app_root = r"Software\Classes\Applications\SoloMD.exe";
        let (app_key, _) = hkcu
            .create_subkey(app_root)
            .map_err(|e| format!("{app_root}: {e}"))?;
        app_key
            .set_value("FriendlyAppName", &"SoloMD")
            .map_err(|e| format!("{app_root}\\FriendlyAppName: {e}"))?;

        // Supported file extensions
        let supported_types = format!("{app_root}\\SupportedTypes");
        let (st_key, _) = hkcu
            .create_subkey(&supported_types)
            .map_err(|e| format!("{supported_types}: {e}"))?;
        for ext in &[".md", ".markdown", ".mdown", ".mkd", ".txt"] {
            st_key.set_value(ext, &"").ok();
        }

        // Shell open command
        let shell_open = format!("{app_root}\\shell\\open\\command");
        let (cmd_key, _) = hkcu
            .create_subkey(&shell_open)
            .map_err(|e| format!("{shell_open}: {e}"))?;
        cmd_key
            .set_value("", &command_value.as_str())
            .map_err(|e| format!("{shell_open}: {e}"))?;

        // 2. Create our own ProgIDs with a dedicated document icon and open
        //    command. Do not point DefaultIcon at SoloMD.exe: Windows will then
        //    render files with the app icon instead of the document icon.
        register_progid(
            &hkcu,
            r"Software\Classes\SoloMD.md",
            "Markdown Document",
            &icon_value,
            &command_value,
        )?;
        register_progid(
            &hkcu,
            r"Software\Classes\SoloMD.txt",
            "Plain Text",
            &icon_value,
            &command_value,
        )?;

        // 3. For each extension, attach the ProgId as an OpenWith candidate
        //    AND set it as the default.
        let extensions = [".md", ".markdown", ".mdown", ".mkd"];
        let mut ok_count = 0;
        for ext in &extensions {
            let ext_key_path = format!("Software\\Classes\\{}", ext);
            if let Ok((ext_key, _)) = hkcu.create_subkey(&ext_key_path) {
                // Set default ProgId
                ext_key.set_value("", &"SoloMD.md").ok();
                // Add to OpenWithProgids
                if let Ok((owp, _)) =
                    hkcu.create_subkey(format!("{}\\OpenWithProgids", ext_key_path))
                {
                    owp.set_value("SoloMD.md", &"").ok();
                }
                ok_count += 1;
            }
        }

        // Also register in HKCU\Software\Classes\.md\OpenWithList which some
        // Windows versions read for the "Open with" menu.
        for ext in &extensions {
            let path = format!("Software\\Classes\\{}\\OpenWithList", ext);
            if let Ok((owl, _)) = hkcu.create_subkey(&path) {
                owl.set_value("a", &"SoloMD.exe").ok();
                owl.set_value("MRUList", &"a").ok();
            }
        }

        // 4. Notify the shell that associations have changed.
        unsafe {
            sh_change_notify();
        }

        Ok(ok_count)
    }

    fn register_progid(
        hkcu: &RegKey,
        progid_root: &str,
        type_name: &str,
        icon_value: &str,
        command_value: &str,
    ) -> Result<(), String> {
        let (progid_key, _) = hkcu
            .create_subkey(progid_root)
            .map_err(|e| format!("{progid_root}: {e}"))?;
        progid_key.set_value("", &type_name).ok();
        progid_key.set_value("FriendlyTypeName", &type_name).ok();

        let icon_path = format!("{progid_root}\\DefaultIcon");
        let (icon_key, _) = hkcu
            .create_subkey(&icon_path)
            .map_err(|e| format!("{icon_path}: {e}"))?;
        icon_key.set_value("", &icon_value).ok();

        let progid_cmd_path = format!("{progid_root}\\shell\\open\\command");
        let (progid_cmd_key, _) = hkcu
            .create_subkey(&progid_cmd_path)
            .map_err(|e| format!("{progid_cmd_path}: {e}"))?;
        progid_cmd_key.set_value("", &command_value).ok();

        Ok(())
    }

    fn default_file_icon_value(exe_path: &Path) -> String {
        let icon_path = bundled_file_icon_path(exe_path);
        let path = if icon_path.is_file() {
            icon_path
        } else {
            exe_path.to_path_buf()
        };
        format!("\"{}\",0", path.to_string_lossy())
    }

    fn bundled_file_icon_path(exe_path: &Path) -> PathBuf {
        exe_path
            .parent()
            .unwrap_or_else(|| Path::new(""))
            .join("icons")
            .join("file_icon.ico")
    }

    // SHCNE_ASSOCCHANGED = 0x08000000, SHCNF_IDLIST = 0
    unsafe fn sh_change_notify() {
        #[link(name = "shell32")]
        unsafe extern "system" {
            fn SHChangeNotify(
                w_event_id: i32,
                u_flags: u32,
                dw_item1: *const std::ffi::c_void,
                dw_item2: *const std::ffi::c_void,
            );
        }
        SHChangeNotify(0x08000000, 0, std::ptr::null(), std::ptr::null());
    }
}

// ====================================================================
// Linux: xdg-mime
// ====================================================================

#[cfg(target_os = "linux")]
mod linux {
    use super::SetDefaultOutcome;
    use std::process::Command;

    pub fn set_default() -> SetDefaultOutcome {
        // The .desktop file name comes from Tauri's deb/rpm packaging.
        // With [[bin]] name = "SoloMD" in Cargo.toml, the file is SoloMD.desktop.
        let desktop_file = "SoloMD.desktop";

        // Markdown MIME types (some distros use one, some another)
        let mimes = ["text/markdown", "text/x-markdown", "application/x-markdown"];

        let mut ok_count = 0;
        let mut last_error = String::new();

        for mime in &mimes {
            match Command::new("xdg-mime")
                .args(["default", desktop_file, mime])
                .output()
            {
                Ok(out) if out.status.success() => {
                    ok_count += 1;
                }
                Ok(out) => {
                    last_error = String::from_utf8_lossy(&out.stderr).trim().to_string();
                }
                Err(e) => {
                    last_error = e.to_string();
                }
            }
        }

        if ok_count > 0 {
            SetDefaultOutcome::done("doneLinux", ok_count)
        } else {
            SetDefaultOutcome::failed("failedLinux", last_error)
        }
    }
}
