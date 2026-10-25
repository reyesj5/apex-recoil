import { execSync } from 'child_process';

try {
  if (process.platform === 'win32') {
    execSync('powershell.exe -Command "[System.Media.SystemSounds]::Exclamation.Play()"', {
      stdio: 'ignore'
    });
  } else if (process.platform === 'darwin') {
    execSync('afplay /System/Library/Sounds/Sosumi.aiff', { stdio: 'ignore' });
  } else {
    execSync(
      'paplay /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || aplay /usr/share/sounds/freedesktop/stereo/dialog-warning.oga 2>/dev/null || echo -e "\\a"',
      { stdio: 'ignore' }
    );
  }
} catch {
  // silently ignore if sound fails
}
