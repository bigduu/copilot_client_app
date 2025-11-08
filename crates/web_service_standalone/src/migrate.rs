use clap::Parser;
use std::path::PathBuf;
use tracing::{info, Level};
use web_service::storage::{MessagePoolStorageProvider, StorageMigration};

/// CLI tool to migrate chat contexts from legacy storage format to the new
/// Context-Local Message Pool architecture.
#[derive(Parser, Debug)]
#[command(name = "migrate")]
#[command(about = "Migrate chat contexts from legacy to new storage format", long_about = None)]
pub struct MigrateArgs {
    /// Path to the legacy conversations directory
    #[arg(
        short = 'l',
        long,
        default_value = "conversations",
        help = "Legacy conversations directory"
    )]
    pub legacy_dir: PathBuf,

    /// Path to the new storage directory
    #[arg(
        short = 's',
        long,
        default_value = "storage",
        help = "New storage base directory"
    )]
    pub storage_dir: PathBuf,

    /// Path to the backup directory
    #[arg(
        short = 'b',
        long,
        default_value = "backups",
        help = "Backup directory for legacy files"
    )]
    pub backup_dir: PathBuf,

    /// Delete legacy files after successful migration
    #[arg(
        short = 'd',
        long,
        default_value_t = false,
        help = "Delete legacy files after successful migration"
    )]
    pub delete_legacy: bool,

    /// Dry run mode - detect and report only, don't migrate
    #[arg(
        long,
        default_value_t = false,
        help = "Dry run mode - only detect and report, don't migrate"
    )]
    pub dry_run: bool,
}

/// Run the migration
pub async fn run_migration(args: MigrateArgs) -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .with_target(false)
        .init();

    info!("=== Storage Migration Tool ===");
    info!("Legacy directory: {}", args.legacy_dir.display());
    info!("Storage directory: {}", args.storage_dir.display());
    info!("Backup directory: {}", args.backup_dir.display());
    info!("Delete legacy: {}", args.delete_legacy);
    info!("Dry run: {}", args.dry_run);
    println!();

    // Create migration instance
    let migration = StorageMigration::new(&args.legacy_dir, &args.backup_dir);

    // Detect legacy data
    info!("Detecting legacy data...");
    let context_ids = migration.detect_legacy_data().await?;

    if context_ids.is_empty() {
        info!("✓ No legacy data found. Migration not needed.");
        return Ok(());
    }

    info!("Found {} legacy contexts:", context_ids.len());
    for (i, id) in context_ids.iter().enumerate() {
        println!("  {}. {}", i + 1, id);
    }
    println!();

    if args.dry_run {
        info!("✓ Dry run mode - no changes made.");
        return Ok(());
    }

    // Confirm migration
    println!("⚠ This will migrate {} contexts to the new storage format.", context_ids.len());
    if args.delete_legacy {
        println!("⚠ Legacy files will be DELETED after successful migration.");
    } else {
        println!("ℹ Legacy files will be kept (use --delete-legacy to remove them).");
    }
    println!("\nBackups will be created in: {}", args.backup_dir.display());
    println!("\nType 'yes' to continue, or anything else to cancel:");

    let mut input = String::new();
    std::io::stdin().read_line(&mut input)?;
    
    if input.trim().to_lowercase() != "yes" {
        info!("Migration cancelled by user.");
        return Ok(());
    }

    println!();
    info!("Starting migration...");

    // Create storage provider
    let storage = MessagePoolStorageProvider::new(&args.storage_dir);

    // Run migration
    let report = migration.migrate_all(&storage, args.delete_legacy).await?;

    // Print report
    println!();
    report.print_summary();

    if report.failed > 0 {
        println!("\n⚠ Some migrations failed. Check the logs above for details.");
        println!("Backups are available in: {}", args.backup_dir.display());
        std::process::exit(1);
    } else {
        println!("\n✓ All migrations completed successfully!");
        println!("Backups are available in: {}", args.backup_dir.display());
        
        if !args.delete_legacy {
            println!("\nLegacy files are still present in: {}", args.legacy_dir.display());
            println!("Run with --delete-legacy to remove them after verifying the migration.");
        }
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cli_args_parsing() {
        let args = MigrateArgs::parse_from(&[
            "migrate",
            "--legacy-dir",
            "old_conversations",
            "--storage-dir",
            "new_storage",
            "--delete-legacy",
        ]);

        assert_eq!(args.legacy_dir, PathBuf::from("old_conversations"));
        assert_eq!(args.storage_dir, PathBuf::from("new_storage"));
        assert_eq!(args.delete_legacy, true);
        assert_eq!(args.dry_run, false);
    }

    #[test]
    fn test_cli_args_defaults() {
        let args = MigrateArgs::parse_from(&["migrate"]);

        assert_eq!(args.legacy_dir, PathBuf::from("conversations"));
        assert_eq!(args.storage_dir, PathBuf::from("storage"));
        assert_eq!(args.backup_dir, PathBuf::from("backups"));
        assert_eq!(args.delete_legacy, false);
        assert_eq!(args.dry_run, false);
    }
}

