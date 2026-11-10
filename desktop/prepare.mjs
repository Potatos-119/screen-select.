// Copies the extension in, so the packaged app carries it, makes the app icon, and builds the Vision helper on a Mac.
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';

rmSync('extension', { recursive: true, force: true });
cpSync('../extension', 'extension', { recursive: true });

const optionsPath = 'extension/options.html';
const options = readFileSync(optionsPath, 'utf8')
  .replace('It is stored only in this browser profile.', 'It is stored only on this computer.')
  .replace('Saved only in this browser, up to', 'Saved only on this computer, up to');
writeFileSync(optionsPath, options);

mkdirSync('bin', { recursive: true });
if (process.platform === 'darwin') {
  // The icon in the extension is too small for an app, so it gets enlarged.
  execFileSync('sips', ['-z', '1024', '1024', '../extension/icons/icon128.png', '--out', 'bin/icon.png'], { stdio: 'ignore' });
  execFileSync('swiftc', ['-O', 'native/vision-ocr.swift', '-o', 'bin/vision-ocr'], { stdio: 'inherit' });
} else if (process.platform === 'win32') {
  // Windows wants a 256px icon, so the extension's one is enlarged with the drawing tools Windows already has.
  const resize = `
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile((Resolve-Path '../extension/icons/icon128.png'))
    $icon = New-Object System.Drawing.Bitmap 256, 256
    $drawing = [System.Drawing.Graphics]::FromImage($icon)
    $drawing.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $drawing.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $drawing.DrawImage($source, 0, 0, 256, 256)
    $icon.Save((Join-Path (Get-Location) 'bin/icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $drawing.Dispose(); $icon.Dispose(); $source.Dispose()`;
  execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', resize], { stdio: 'inherit' });
}
