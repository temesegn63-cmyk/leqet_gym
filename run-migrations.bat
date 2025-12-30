@echo off
setlocal enabledelayedexpansion

set MIGRATIONS_DIR=database\migrations
set MIGRATION_FILES=(
  "000_base_schema.sql"
  "001_initial_schema_enhancements.sql"
  "002_user_activation_flow.sql"
)

echo Running database migrations...

for %%f in (%MIGRATIONS_DIR%\*.sql) do (
  echo Applying migration: %%~nxf
  psql -U postgres -d leqet_fit_coacha -f "%%f"
  if !errorlevel! neq 0 (
    echo Error applying migration: %%~nxf
    exit /b !errorlevel!
  )
  echo Successfully applied: %%~nxf
)

echo All migrations completed successfully!
