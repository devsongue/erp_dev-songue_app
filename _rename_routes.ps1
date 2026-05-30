# Rename route files to add $companySlug prefix
# Files to SKIP (public routes or root-level)
$skipFiles = @('__root.tsx', 'index.tsx', 'signup.tsx', 'pricing.tsx', '$companySlug.tsx', 'users.tsx')

$routesDir = "src\routes"

Get-ChildItem -Path $routesDir -File -Filter "*.tsx" | ForEach-Object {
    if ($skipFiles -contains $_.Name) {
        Write-Host "SKIP: $($_.Name)"
        return
    }
    # Also skip if already prefixed
    if ($_.Name.StartsWith('$companySlug.')) {
        Write-Host "ALREADY PREFIXED: $($_.Name)"
        return
    }
    
    $newName = '$companySlug.' + $_.Name
    Write-Host "RENAME: $($_.Name) -> $newName"
    Rename-Item -Path $_.FullName -NewName $newName
}
