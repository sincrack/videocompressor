export interface TrackInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
  title?: string;
}

export interface MediaInfo {
  filePath: string;
  show?: string;
  season?: string;
  episode?: string;
  title?: string;
  tracks: TrackInfo[];
}

export interface Job {
  id: string;
  filePath: string;
  fileName: string;
  outputName: string;
  mediaInfo: MediaInfo | null;
  status: 'pending' | 'processing' | 'completed' | 'error';
  progress: number;
  timeRemaining?: string;
  fps?: number;
  error?: string;
  selectedAudio: number[];
  selectedSubtitles: number[];
}
