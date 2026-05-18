import { spawn } from 'node:child_process';
import ffmpegPath from 'ffmpeg-static';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { TrackInfo, MediaInfo } from '../src/types';

export async function getMediaInfo(filePath: string): Promise<MediaInfo> {
  const ffprobePath = ffprobeStatic.path.replace('app.asar', 'app.asar.unpacked');
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'stream=index,codec_type,codec_name:stream_tags=language,title:format_tags=show,season_number,episode_id,title',
      '-of', 'json',
      filePath
    ]);

    let output = '';
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      console.error(`ffprobe stderr: ${data}`);
    });

    ffprobe.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`ffprobe exited with code ${code}`));
        return;
      }
      try {
        const info = JSON.parse(output);
        const formatTags = info.format?.tags || {};
        const tracks: TrackInfo[] = info.streams.map((s: any) => ({
          index: s.index,
          type: s.codec_type,
          codec: s.codec_name,
          language: s.tags?.language,
          title: s.tags?.title
        }));
        resolve({ 
          filePath, 
          show: formatTags.show,
          season: formatTags.season_number,
          episode: formatTags.episode_id,
          title: formatTags.title,
          tracks 
        });
      } catch (err) {
        reject(err);
      }
    });
  });
}

export interface EncodeOptions {
  jobId: string;
  inputPath: string;
  outputPath: string;
  hardwareProfile: string; // 'hevc_qsv', 'hevc_nvenc', 'libx265'
  globalQuality: string;
  selectedAudioIndices: number[];
  selectedSubtitleIndices: number[];
  onProgress?: (percent: number, timeStr: string, fps: number) => void;
}

const activeProcesses = new Map<string, any>();

export function cancelEncoding(jobId: string) {
  const proc = activeProcesses.get(jobId);
  if (proc) {
    proc.kill('SIGKILL');
    activeProcesses.delete(jobId);
  }
}

export function startEncoding(options: EncodeOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y', // Overwrite
      '-i', options.inputPath,
    ];

    // Map video (always map the first video track)
    args.push('-map', '0:v:0');
    
    // Map selected audio
    options.selectedAudioIndices.forEach(idx => {
      args.push('-map', `0:${idx}`);
    });

    // Map selected subtitles
    options.selectedSubtitleIndices.forEach(idx => {
      args.push('-map', `0:${idx}`);
    });

    // Video codec and quality
    args.push('-c:v', options.hardwareProfile);
    args.push('-preset', 'medium');
    
    // Some profiles use -global_quality, others use -crf or -cq.
    // QSV uses -global_quality, NVENC uses -cq, libx265 uses -crf.
    if (options.hardwareProfile === 'hevc_qsv') {
      args.push('-global_quality', options.globalQuality);
    } else if (options.hardwareProfile === 'hevc_nvenc') {
      args.push('-cq', options.globalQuality);
    } else if (options.hardwareProfile === 'hevc_videotoolbox') {
      args.push('-q:v', '50'); // VideoToolbox uses a different scale, typical default quality
    } else {
      args.push('-crf', options.globalQuality);
    }

    // Audio codec
    if (options.selectedAudioIndices.length > 0) {
      args.push('-c:a', 'copy');
    }
    
    // Subtitle codec
    if (options.selectedSubtitleIndices.length > 0) {
      if (options.inputPath.toLowerCase().endsWith('.mp4')) {
        args.push('-c:s', 'ass');
      } else {
        args.push('-c:s', 'copy');
      }
    }

    // Output
    args.push(options.outputPath);

    // Provide ffmpeg with standard output instead of terminal
    args.push('-progress', '-');
    args.push('-nostats');

    console.log(`Starting ffmpeg with args: ${args.join(' ')}`);
    
    // @ts-ignore
    const ffmpegExe = ffmpegPath.replace('app.asar', 'app.asar.unpacked');
    const ffmpeg = spawn(ffmpegExe, args);
    activeProcesses.set(options.jobId, ffmpeg);

    let durationStr = '00:00:00.00';
    let durationSeconds = 1; // Default to avoid division by zero
    let stderrLog = '';
    let currentFps = 0;

    // Time parser
    const timeToSeconds = (timeStr: string) => {
      const parts = timeStr.split(':');
      if (parts.length !== 3) return 0;
      return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
    };

    ffmpeg.stderr.on('data', (data) => {
      const msg = data.toString();
      stderrLog += msg + '\n';
      // Extract duration from initial info
      const durationMatch = msg.match(/Duration: (\d{2}:\d{2}:\d{2}\.\d{2})/);
      if (durationMatch) {
        durationStr = durationMatch[1];
        durationSeconds = timeToSeconds(durationStr);
      }
    });

    ffmpeg.stdout.on('data', (data) => {
      const msg = data.toString();
      
      const fpsMatch = msg.match(/fps=\s*([\d.]+)/);
      if (fpsMatch) {
        currentFps = parseFloat(fpsMatch[1]);
      }

      // Parse progress output
      const timeMatch = msg.match(/out_time=(\d{2}:\d{2}:\d{2}\.\d{6})/);
      if (timeMatch && options.onProgress) {
        const outTimeStr = timeMatch[1].substring(0, 11); // get HH:MM:SS.ms
        const outTimeSeconds = timeToSeconds(outTimeStr);
        let percent = Math.min(100, Math.max(0, Math.round((outTimeSeconds / durationSeconds) * 100)));
        options.onProgress(percent, outTimeStr, currentFps);
      }
    });

    ffmpeg.on('close', (code) => {
      activeProcesses.delete(options.jobId);
      if (code === 0) {
        resolve();
      } else if (code === null) {
        reject(new Error(`Cancelado por el usuario`));
      } else {
        // Extract the last few lines of stderr to show a meaningful error
        const logLines = stderrLog.trim().split('\n');
        const lastLines = logLines.slice(-5).join('\n');
        reject(new Error(`FFmpeg falló (código ${code}):\n${lastLines}`));
      }
    });
    
    ffmpeg.on('error', (err) => reject(err));
  });
}
