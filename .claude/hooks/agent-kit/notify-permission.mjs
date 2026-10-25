import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const title = 'Claude Code';
const message = 'Your response is needed.';
const hooksDir = dirname(fileURLToPath(import.meta.url));

try {
  if (process.platform === 'win32') {
    const script = join(hooksDir, 'scripts', 'notify-permission.ps1');
    execSync(
      `powershell.exe -ExecutionPolicy Bypass -File "${script}" -Title "${title}" -Message "${message}"`,
      { stdio: 'ignore' }
    );
  } else if (process.platform === 'darwin') {
    execSync(`osascript -e 'display notification "${message}" with title "${title}"'`, {
      stdio: 'ignore'
    });
  } else {
    execSync(`notify-send "${title}" "${message}"`, { stdio: 'ignore' });
  }
} catch {
  // silently ignore if notification fails
}
