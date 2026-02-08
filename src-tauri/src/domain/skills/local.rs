use super::fs_ops::{copy_dir_recursive, is_managed_dir, remove_marker, write_marker};
use super::installed::{get_skill_by_id, skill_key_exists};
use super::paths::{cli_skills_root, ensure_skills_roots, ssot_skills_root, validate_cli_key};
use super::skill_md::parse_skill_md;
use super::types::{
    InstalledSkillSummary, LocalSkillSummary, SkillImportIssue, SkillImportLocalBatchReport,
};
use super::util::validate_dir_name;
use crate::db;
use crate::shared::error::db_err;
use crate::shared::text::normalize_name;
use crate::shared::time::now_unix_seconds;
use crate::workspaces;
use rusqlite::params;

pub fn local_list(
    app: &tauri::AppHandle,
    db: &db::Db,
    workspace_id: i64,
) -> crate::shared::error::AppResult<Vec<LocalSkillSummary>> {
    let conn = db.open_connection()?;
    let cli_key = workspaces::get_cli_key_by_id(&conn, workspace_id)?;
    validate_cli_key(&cli_key)?;

    if !workspaces::is_active_workspace(&conn, workspace_id)? {
        return Err(
            "SKILL_LOCAL_REQUIRES_ACTIVE_WORKSPACE: local skills only available for active workspace"
                .to_string()
                .into(),
        );
    }

    let root = cli_skills_root(app, &cli_key)?;
    if !root.exists() {
        return Ok(Vec::new());
    }

    let entries = std::fs::read_dir(&root)
        .map_err(|e| format!("failed to read dir {}: {e}", root.display()))?;

    let mut out = Vec::new();
    for entry in entries {
        let entry =
            entry.map_err(|e| format!("failed to read dir entry {}: {e}", root.display()))?;
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        if is_managed_dir(&path) {
            continue;
        }

        let dir_name = path
            .file_name()
            .and_then(|v| v.to_str())
            .unwrap_or("")
            .to_string();
        if dir_name.is_empty() {
            continue;
        }

        let skill_md = path.join("SKILL.md");
        if !skill_md.exists() {
            continue;
        }

        let (name, description) = match parse_skill_md(&skill_md) {
            Ok((name, description)) => (name, description),
            Err(_) => (dir_name.clone(), String::new()),
        };

        out.push(LocalSkillSummary {
            dir_name,
            path: path.to_string_lossy().to_string(),
            name,
            description,
        });
    }

    out.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(out)
}

pub fn import_local(
    app: &tauri::AppHandle,
    db: &db::Db,
    workspace_id: i64,
    dir_name: &str,
) -> crate::shared::error::AppResult<InstalledSkillSummary> {
    ensure_skills_roots(app)?;

    let dir_name = validate_dir_name(dir_name)?;

    let mut conn = db.open_connection()?;
    let cli_key = workspaces::get_cli_key_by_id(&conn, workspace_id)?;
    validate_cli_key(&cli_key)?;
    if !workspaces::is_active_workspace(&conn, workspace_id)? {
        return Err(
            "SKILL_IMPORT_LOCAL_REQUIRES_ACTIVE_WORKSPACE: switch to the target workspace before importing"
                .to_string()
                .into(),
        );
    }

    let cli_root = cli_skills_root(app, &cli_key)?;
    let local_dir = cli_root.join(&dir_name);
    if !local_dir.exists() {
        return Err(format!("SKILL_LOCAL_NOT_FOUND: {}", local_dir.display()).into());
    }
    if !local_dir.is_dir() {
        return Err("SEC_INVALID_INPUT: local skill path is not a directory"
            .to_string()
            .into());
    }
    if is_managed_dir(&local_dir) {
        return Err(
            "SKILL_ALREADY_MANAGED: skill already managed by aio-coding-hub"
                .to_string()
                .into(),
        );
    }

    let skill_md = local_dir.join("SKILL.md");
    if !skill_md.exists() {
        return Err("SEC_INVALID_INPUT: SKILL.md not found in local skill dir"
            .to_string()
            .into());
    }

    let (name, description) = match parse_skill_md(&skill_md) {
        Ok(v) => v,
        Err(_) => (dir_name.clone(), String::new()),
    };
    let normalized_name = normalize_name(&name);

    if skill_key_exists(&conn, &dir_name)? {
        return Err("SKILL_IMPORT_CONFLICT: same skill_key already exists"
            .to_string()
            .into());
    }

    let now = now_unix_seconds();
    let ssot_dir = ssot_skills_root(app)?.join(&dir_name);
    if ssot_dir.exists() {
        return Err("SKILL_IMPORT_CONFLICT: ssot dir already exists"
            .to_string()
            .into());
    }

    let tx = conn
        .transaction()
        .map_err(|e| db_err!("failed to start transaction: {e}"))?;

    tx.execute(
        r#"
INSERT INTO skills(
  skill_key,
  name,
  normalized_name,
  description,
  source_git_url,
  source_branch,
  source_subdir,
  created_at,
  updated_at
) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
"#,
        params![
            dir_name,
            name.trim(),
            normalized_name,
            description,
            format!("local://{cli_key}"),
            "local",
            dir_name,
            now,
            now
        ],
    )
    .map_err(|e| db_err!("failed to insert imported skill: {e}"))?;

    let skill_id = tx.last_insert_rowid();

    tx.execute(
        r#"
INSERT INTO workspace_skill_enabled(workspace_id, skill_id, created_at, updated_at)
VALUES (?1, ?2, ?3, ?3)
ON CONFLICT(workspace_id, skill_id) DO UPDATE SET
  updated_at = excluded.updated_at
"#,
        params![workspace_id, skill_id, now],
    )
    .map_err(|e| db_err!("failed to enable imported skill for workspace: {e}"))?;

    if let Err(err) = copy_dir_recursive(&local_dir, &ssot_dir) {
        let _ = std::fs::remove_dir_all(&ssot_dir);
        let _ = tx.execute("DELETE FROM skills WHERE id = ?1", params![skill_id]);
        return Err(err);
    }

    if let Err(err) = write_marker(&local_dir) {
        let _ = std::fs::remove_dir_all(&ssot_dir);
        let _ = tx.execute("DELETE FROM skills WHERE id = ?1", params![skill_id]);
        return Err(err);
    }

    if let Err(err) = tx.commit() {
        let _ = std::fs::remove_dir_all(&ssot_dir);
        remove_marker(&local_dir);
        return Err(db_err!("failed to commit: {err}"));
    }

    get_skill_by_id(&conn, skill_id)
}

pub fn import_local_batch(
    app: &tauri::AppHandle,
    db: &db::Db,
    workspace_id: i64,
    dir_names: Vec<String>,
) -> crate::shared::error::AppResult<SkillImportLocalBatchReport> {
    if dir_names.is_empty() {
        return Err("SEC_INVALID_INPUT: dir_names is required"
            .to_string()
            .into());
    }

    let mut imported = Vec::new();
    let mut skipped = Vec::new();
    let mut failed = Vec::new();

    for dir_name in dir_names {
        let trimmed = dir_name.trim().to_string();
        if trimmed.is_empty() {
            skipped.push(SkillImportIssue {
                dir_name,
                error_code: Some("SEC_INVALID_INPUT".to_string()),
                message: "SEC_INVALID_INPUT: dir_name is required".to_string(),
            });
            continue;
        }

        match import_local(app, db, workspace_id, &trimmed) {
            Ok(row) => imported.push(row),
            Err(err) => {
                let message = err.to_string();
                let error_code = message
                    .split(':')
                    .next()
                    .map(str::trim)
                    .filter(|code| !code.is_empty())
                    .map(ToString::to_string);

                let issue = SkillImportIssue {
                    dir_name: trimmed,
                    error_code,
                    message: message.clone(),
                };

                if message.starts_with("SKILL_IMPORT_CONFLICT")
                    || message.starts_with("SKILL_ALREADY_MANAGED")
                    || message.starts_with("SKILL_LOCAL_NOT_FOUND")
                    || message.starts_with("SEC_INVALID_INPUT")
                {
                    skipped.push(issue);
                } else {
                    failed.push(issue);
                }
            }
        }
    }

    Ok(SkillImportLocalBatchReport {
        imported,
        skipped,
        failed,
    })
}
