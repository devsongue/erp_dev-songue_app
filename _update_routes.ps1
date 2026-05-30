# Update createFileRoute paths in all renamed route files
$routesDir = "src\routes"

Get-ChildItem -Path $routesDir -File -Filter '$companySlug.*.tsx' | ForEach-Object {
    $content = Get-Content -Path $_.FullName -Raw -Encoding utf8
    
    # Match createFileRoute('/path') and replace with createFileRoute('/$companySlug/path')
    # Pattern: createFileRoute('/something')
    $updated = $content -replace "createFileRoute\('/(.*?)'\)", "createFileRoute('/`$companySlug/`$1')"
    
    if ($content -ne $updated) {
        Set-Content -Path $_.FullName -Value $updated -Encoding utf8 -NoNewline
        Write-Host "UPDATED: $($_.Name)"
    } else {
        Write-Host "NO CHANGE: $($_.Name)"
    }
}
