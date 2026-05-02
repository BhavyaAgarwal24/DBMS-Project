# Running The Project

Use PowerShell from the project root:

```powershell
.\run-project.ps1 -DbUser root -DbPassword "your_mysql_password"
```

What it does:

- loads `01_create_tables.sql`
- loads `02_insert_data.sql`
- loads `04_plsql.sql`
- sets the app's MySQL environment variables
- starts the Node app on `http://localhost:3000`

Useful options:

```powershell
.\run-project.ps1 -DbUser root -DbPassword "your_mysql_password" -DbName pollution_monitoring
.\run-project.ps1 -DbUser root -DbPassword "your_mysql_password" -SkipSchemaLoad
.\run-project.ps1 -DbHost localhost -DbPort 3306 -DbUser root -DbPassword "your_mysql_password"
```

If PowerShell blocks script execution for this session, run:

```powershell
Set-ExecutionPolicy -Scope Process Bypass
```

Then run the project script again.
