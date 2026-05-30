New-Item -ItemType Directory -Force -Path src\routes\$companySlug

$files = Get-ChildItem -Path src\routes -File | Where-Object { 
  $_.Name -notin @('__root.tsx', 'index.tsx', 'signup.tsx', 'pricing.tsx', 'users.tsx') -and $_.Name -like '*.tsx' 
}

foreach ($file in $files) {
  Move-Item -Path $file.FullName -Destination src\routes\$companySlug\
}
