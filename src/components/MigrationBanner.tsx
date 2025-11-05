import { useEffect, useMemo, useState } from "react";
import { Alert, Button, Space, Typography } from "antd";
import { localStorageMigrator } from "../utils/migration/LocalStorageMigrator";

export function MigrationBanner() {
  const [needs, setNeeds] = useState(false);
  const [hasBackup, setHasBackup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const last = useMemo(() => localStorageMigrator.getLastResult(), []);

  useEffect(() => {
    (async () => {
      const needsMigration = await localStorageMigrator.needsMigration();
      setNeeds(needsMigration);
      setHasBackup(localStorageMigrator.hasBackup());

      // Run validation if migration is needed
      if (needsMigration) {
        const errors = localStorageMigrator.validateLegacyData();
        setValidationErrors(errors);
      }
    })();
  }, []);

  const run = async () => {
    setBusy(true);
    try {
      const res = await localStorageMigrator.migrateAll();
      setNeeds(false);
      setMessage(
        `Migrated contexts: ${res.migratedContexts}, messages: ${res.migratedMessages}`,
      );
      setHasBackup(localStorageMigrator.hasBackup());
    } catch (e: any) {
      setMessage(`Migration failed: ${String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const rollback = () => {
    const res = localStorageMigrator.rollbackFromBackup();
    if (!res.restored) {
      setMessage(`Rollback failed: ${res.error}`);
    } else {
      setNeeds(true);
      setMessage("Rollback succeeded. Legacy data restored locally.");
    }
  };

  if (!needs && !hasBackup && !last && !message) return null;

  const hasValidationErrors = validationErrors.length > 0;

  return (
    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1000 }}>
      <Alert
        type={needs ? (hasValidationErrors ? "error" : "warning") : "info"}
        showIcon
        message={
          needs
            ? hasValidationErrors
              ? "Migration blocked by validation errors"
              : "Local chat data needs migration to backend"
            : "Migration information"
        }
        description={
          <Space direction="vertical" style={{ width: 360 }}>
            {message && <Typography.Text>{message}</Typography.Text>}
            {hasValidationErrors && (
              <div>
                <Typography.Text strong>Validation Errors:</Typography.Text>
                <ul style={{ margin: "8px 0", paddingLeft: "20px" }}>
                  {validationErrors.slice(0, 5).map((err, idx) => (
                    <li key={idx}>
                      <Typography.Text
                        type="danger"
                        style={{ fontSize: "12px" }}
                      >
                        {err}
                      </Typography.Text>
                    </li>
                  ))}
                  {validationErrors.length > 5 && (
                    <li>
                      <Typography.Text
                        type="secondary"
                        style={{ fontSize: "12px" }}
                      >
                        ...and {validationErrors.length - 5} more errors
                      </Typography.Text>
                    </li>
                  )}
                </ul>
              </div>
            )}
            {last && !message && (
              <Typography.Text>
                Last result — contexts: {last.migratedContexts}, messages:{" "}
                {last.migratedMessages}
              </Typography.Text>
            )}
            <Space>
              {needs && (
                <Button
                  type="primary"
                  onClick={run}
                  loading={busy}
                  disabled={hasValidationErrors}
                >
                  Migrate now
                </Button>
              )}
              {hasBackup && (
                <Button danger onClick={rollback} disabled={busy}>
                  Rollback from backup
                </Button>
              )}
            </Space>
          </Space>
        }
      />
    </div>
  );
}
