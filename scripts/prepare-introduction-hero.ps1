# Deterministic crops of the approved artwork. No rendering or scene reconstruction.
param(
    [string]$SourcePath = (Join-Path (Split-Path -Parent (Split-Path -Parent $PSScriptRoot)) 'cosmifold-intro-approved.png')
)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$assetDirectory = Join-Path (Split-Path -Parent $PSScriptRoot) 'assets'
$approvedImage = [System.Drawing.Bitmap]::FromFile([System.IO.Path]::GetFullPath($SourcePath))
try {
    if ($approvedImage.Width -ne 1536 -or $approvedImage.Height -ne 1024) {
        throw 'Expected the approved 1536 x 1024 PNG.'
    }
    # All five bodies and their labels remain intact. These rectangles lie
    # inside the artwork's rounded border; the existing HTML supplies one frame.
    $crops = @(
        @{ Name = 'introduction-example.png'; Bounds = [System.Drawing.Rectangle]::new(100, 163, 1336, 699) },
        @{ Name = 'introduction-example-compact.png'; Bounds = [System.Drawing.Rectangle]::new(160, 170, 1236, 690) }
    )
    foreach ($crop in $crops) {
        $asset = $approvedImage.Clone($crop.Bounds, $approvedImage.PixelFormat)
        try {
            $asset.Save((Join-Path $assetDirectory $crop.Name), [System.Drawing.Imaging.ImageFormat]::Png)
            Write-Output ("Saved {0}: {1} x {2}" -f $crop.Name, $asset.Width, $asset.Height)
        } finally { $asset.Dispose() }
    }
    Write-Output ("Approved source SHA256: " + (Get-FileHash -LiteralPath $SourcePath -Algorithm SHA256).Hash)
} finally { $approvedImage.Dispose() }
