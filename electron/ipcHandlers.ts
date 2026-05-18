import { ipcMain, dialog } from 'electron';
import { getMediaInfo, startEncoding, cancelEncoding } from './ffmpegRunner';

export function setupIpcHandlers() {
  ipcMain.handle('select-directory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) return null;
    return filePaths[0];
  });

  ipcMain.handle('select-files', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Videos', extensions: ['mkv', 'mp4', 'avi', 'mov'] }
      ]
    });
    if (canceled) return [];
    return filePaths;
  });

  ipcMain.handle('get-media-info', async (_event, filePath) => {
    try {
      return await getMediaInfo(filePath);
    } catch (err) {
      console.error('Error getting media info:', err);
      throw err;
    }
  });

  ipcMain.handle('start-encoding', async (event, options) => {
    try {
      await startEncoding({
        ...options,
        onProgress: (percent, timeStr, fps) => {
          event.sender.send(`encoding-progress-${options.jobId}`, { percent, timeStr, fps });
        },
        onLog: (msg) => {
          event.sender.send(`encoding-log-${options.jobId}`, msg);
        }
      });
      const fs = require('fs');
      let compressedSize = 0;
      try {
        compressedSize = fs.statSync(options.outputPath).size;
      } catch (e) {
        console.error('Error reading compressed file size:', e);
      }
      return { success: true, compressedSize };
    } catch (err: any) {
      console.error('Encoding error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cancel-encoding', (_event, jobId: string) => {
    cancelEncoding(jobId);
    return { success: true };
  });

  ipcMain.handle('shutdown-system', async () => {
    const exec = require('child_process').exec;
    if (process.platform === 'win32') {
      exec('shutdown /s /f /t 0');
    } else if (process.platform === 'darwin') {
      exec("osascript -e 'tell application \"System Events\" to shut down'");
    } else {
      exec('shutdown -h now');
    }
    return { success: true };
  });

  ipcMain.handle('suspend-system', async () => {
    const exec = require('child_process').exec;
    if (process.platform === 'win32') {
      exec('powershell.exe -NoProfile -Command "Add-Type -AssemblyPath System.Windows.Forms; [System.Windows.Forms.Application]::SetSuspendState([System.Windows.Forms.PowerState]::Suspend, $false, $false)"');
    } else if (process.platform === 'darwin') {
      exec('pmset sleepnow');
    } else {
      exec('systemctl suspend');
    }
    return { success: true };
  });

  ipcMain.handle('detect-gpu', async () => {
    return new Promise((resolve) => {
      if (process.platform === 'win32') {
        const cmd = 'powershell.exe -NoProfile -Command "Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name"';
        require('child_process').exec(cmd, (err: any, stdout: string) => {
          if (!err && stdout) {
            const out = stdout.toLowerCase();
            if (out.includes('nvidia')) resolve('hevc_nvenc');
            else if (out.includes('intel')) resolve('hevc_qsv');
            else if (out.includes('amd') || out.includes('radeon')) resolve('hevc_amf');
            else resolve('libx265');
          } else {
            resolve('libx265');
          }
        });
      } else if (process.platform === 'darwin') {
        // En Mac, todos los M1/M2/M3 y los Intel recientes soportan VideoToolbox
        resolve('hevc_videotoolbox');
      } else {
        resolve('libx265');
      }
    });
  });

  ipcMain.handle('scan-paths', async (_event, paths: string[]) => {
    const fs = require('fs');
    const path = require('path');
    const videoExtensions = ['.mkv', '.mp4', '.avi', '.mov', '.webm', '.m4v', '.ts'];
    const resultFiles: string[] = [];

    const scanRecursive = (targetPath: string) => {
      try {
        const stats = fs.statSync(targetPath);
        if (stats.isFile()) {
          const ext = path.extname(targetPath).toLowerCase();
          if (videoExtensions.includes(ext)) {
            resultFiles.push(targetPath);
          }
        } else if (stats.isDirectory()) {
          const files = fs.readdirSync(targetPath);
          for (const file of files) {
            scanRecursive(path.join(targetPath, file));
          }
        }
      } catch (err) {
        console.error('Error scanning path:', targetPath, err);
      }
    };

    for (const p of paths) {
      scanRecursive(p);
    }

    return resultFiles;
  });
}
