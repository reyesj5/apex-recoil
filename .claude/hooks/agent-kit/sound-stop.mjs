import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mp3 = join(__dirname, 'assets', 'guitar-finish.mp3');

try {
  if (process.platform === 'win32') {
    execSync(
      `powershell.exe -Command "Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([uri]::new('${mp3}')); $p.Play(); Start-Sleep -Seconds 5; $p.Close()"`,
      { stdio: 'ignore' }
    );
  } else if (process.platform === 'darwin') {
    execSync(`afplay "${mp3}"`, { stdio: 'ignore' });
  } else {
    execSync(
      `mpv --no-video "${mp3}" 2>/dev/null || ffplay -nodisp -autoexit "${mp3}" 2>/dev/null || paplay "${mp3}" 2>/dev/null`,
      { stdio: 'ignore' }
    );
  }
} catch {
  // silently ignore if sound fails
}
