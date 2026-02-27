# Build Control4 Driver Package (.c4z)
# Run this script to create the .c4z file for Composer Pro

Write-Host "================================="
Write-Host " Building Slomins P160-SL Driver"
Write-Host "================================="
Write-Host ""

# Define files to include in the .c4z
$files = @(
    "driver.lua",
    "driver.xml",
    "README.md",
    "CldBusApi\auth.lua",
    "CldBusApi\dkjson.lua",
    "CldBusApi\http.lua",
    "CldBusApi\sha256.lua",
    "CldBusApi\transport_c4.lua",
    "CldBusApi\util.lua"
)

# Output filename
$outputFile = "Smart-Camera-P160-SL-v0.1.0.c4z"

# Check if all files exist
Write-Host "Checking files..."
$missingFiles = @()
foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  [OK] $file"
    } else {
        Write-Host "  [MISSING] $file"
        $missingFiles += $file
    }
}

if ($missingFiles.Count -gt 0) {
    Write-Host ""
    Write-Host "ERROR: Missing files!"
    Write-Host "Cannot build .c4z package."
    exit 1
}

Write-Host ""
Write-Host "Creating .c4z package..."

# Remove old .c4z if exists
if (Test-Path $outputFile) {
    Remove-Item $outputFile -Force
    Write-Host "  Removed old $outputFile"
}

# Create zip file (which is what .c4z actually is)
try {
    Compress-Archive -Path $files -DestinationPath "$outputFile.zip" -CompressionLevel Optimal -Force
    Rename-Item "$outputFile.zip" $outputFile -Force
    
    Write-Host ""
    Write-Host "SUCCESS!"
    Write-Host ""
    Write-Host "Package created: $outputFile"
    $size = [Math]::Round((Get-Item $outputFile).Length / 1KB, 2)
    Write-Host "Size: $size KB"
    Write-Host ""
    Write-Host "Next steps:"
    Write-Host "1. Open Control4 Composer Pro"
    Write-Host "2. Go to: Drivers -> Add Driver -> Install From File"
    Write-Host "3. Select: $outputFile"
    Write-Host "4. Add device to a room"
    Write-Host ""
    Write-Host "IMPORTANT: See README_C4Z_TESTING.md for login instructions"
    Write-Host ""
    
} catch {
    Write-Host ""
    Write-Host "ERROR: Failed to create .c4z"
    Write-Host $_.Exception.Message
    exit 1
}
