$dbPassword = "Mitch`$1961"
$dbHost = "aws-0-us-east-1.pooler.supabase.com"
$dbPort = "6543"
$dbName = "postgres"
$dbUser = "postgres.migcpasmtbdojqphqyzc"

$connString = "postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}"

Write-Host "Executing migration via PostgreSQL..." -ForegroundColor Cyan

# Use docker to run psql
$sqlFile = "sql/add-approval-workflow.sql"

docker run --rm -i -v "${PWD}:/workspace" postgres:15 psql "$connString" -f "/workspace/$sqlFile"

if ($LASTEXITCODE -eq 0) {
    Write-Host "`nMigration executed successfully!" -ForegroundColor Green
} else {
    Write-Host "`nMigration failed!" -ForegroundColor Red
}
