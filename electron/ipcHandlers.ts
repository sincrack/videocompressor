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
        }
      });
      return { success: true };
    } catch (err: any) {
      console.error('Encoding error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('cancel-encoding', (_event, jobId: string) => {
    cancelEncoding(jobId);
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
}
