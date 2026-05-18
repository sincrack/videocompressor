import React, { useState, useEffect } from 'react'
import { Settings2, FolderDown, Video, Play, CheckCircle2, AlertCircle, Loader2, Edit3, Key, Languages, Clapperboard, XCircle, X, Search, Film, Tv, Trash2, Terminal, HardDrive } from 'lucide-react'
import { Job, TrackInfo } from './types'
import logo from './assets/sincrack_logo.png'

const COMMON_LANGS = [
  { code: 'spa', label: 'Español (spa)' },
  { code: 'eng', label: 'Inglés (eng)' },
  { code: 'kor', label: 'Coreano (kor)' },
  { code: 'jpn', label: 'Japonés (jpn)' },
  { code: 'por', label: 'Portugués (por)' },
  { code: 'fra', label: 'Francés (fra)' },
  { code: 'deu', label: 'Alemán (deu)' },
  { code: 'ita', label: 'Italiano (ita)' },
];

const sanitizeName = (name: string) => {
  if (!name) return '';
  return name.replace(/[\\/:*?"<>|]/g, '');
};

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

function App() {
  const [profile, setProfile] = useState(localStorage.getItem('hwProfile') || '');
  const [quality, setQuality] = useState('28');
  const [outDir, setOutDir] = useState<string | null>(null);
  const [jobs, setJobs] = useState<Job[]>([]);

  // Configuración persistente
  const [showSettings, setShowSettings] = useState(false);
  const [prefLangs, setPrefLangs] = useState<string[]>(JSON.parse(localStorage.getItem('prefLangsList') || '["spa", "eng"]'));
  const [tmdbKey, setTmdbKey] = useState(localStorage.getItem('tmdbKey') || '');
  
  // Auto-apagado y suspensión (Desactivados por defecto)
  const [autoShutdown, setAutoShutdown] = useState<boolean>(localStorage.getItem('autoShutdown') === 'true');
  const [autoSleep, setAutoSleep] = useState<boolean>(localStorage.getItem('autoSleep') === 'true');
  
  // Cuenta atrás y Logs en vivo
  const [countdown, setCountdown] = useState<number | null>(null);
  const [countdownType, setCountdownType] = useState<'shutdown' | 'sleep' | null>(null);
  const [viewingLogsJobId, setViewingLogsJobId] = useState<string | null>(null);
  const [lifetimeSaved, setLifetimeSaved] = useState<number>(() => {
    const saved = localStorage.getItem('lifetimeSaved');
    return saved ? parseInt(saved, 10) : 0;
  });

  // Estado para el modal TMDB (FileBot style)
  const [showTmdbModal, setShowTmdbModal] = useState(false);
  const [tmdbType, setTmdbType] = useState<'tv' | 'movie'>('tv');
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [tmdbSelectedId, setTmdbSelectedId] = useState<number | null>(null);
  const [tmdbPreviewMap, setTmdbPreviewMap] = useState<Record<string, string>>({});
  const [tmdbIsLoading, setTmdbIsLoading] = useState(false);

  useEffect(() => { localStorage.setItem('prefLangsList', JSON.stringify(prefLangs)); }, [prefLangs]);
  useEffect(() => { localStorage.setItem('tmdbKey', tmdbKey); }, [tmdbKey]);
  useEffect(() => { localStorage.setItem('autoShutdown', String(autoShutdown)); }, [autoShutdown]);
  useEffect(() => { localStorage.setItem('autoSleep', String(autoSleep)); }, [autoSleep]);
  useEffect(() => { localStorage.setItem('lifetimeSaved', String(lifetimeSaved)); }, [lifetimeSaved]);

  useEffect(() => {
    if (countdown === null) return;
    if (countdown === 0) {
      if (countdownType === 'shutdown') {
        window.ipcRenderer.invoke('shutdown-system');
      } else if (countdownType === 'sleep') {
        window.ipcRenderer.invoke('suspend-system');
      }
      setCountdown(null);
      setCountdownType(null);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown(prev => (prev !== null ? prev - 1 : null));
    }, 1000);

    return () => clearTimeout(timer);
  }, [countdown, countdownType]);
  
  useEffect(() => {
    if (!profile) {
      window.ipcRenderer.invoke('detect-gpu').then(gpuProfile => {
        setProfile(gpuProfile);
        localStorage.setItem('hwProfile', gpuProfile);
      });
    } else {
      localStorage.setItem('hwProfile', profile);
    }
  }, [profile]);

  useEffect(() => {
    if (viewingLogsJobId) {
      const el = document.getElementById('logs-container');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [jobs, viewingLogsJobId]);

  const handleSelectOutDir = async () => {
    const dir = await window.ipcRenderer.invoke('select-directory');
    if (dir) setOutDir(dir);
  };

  const processSelectedFiles = async (files: string[]) => {
    if (!files || files.length === 0) return;

    const newJobs: Job[] = files.map(file => {
      const origName = file.split('\\').pop() || file.split('/').pop() || file;
      return {
        id: Math.random().toString(36).substring(7),
        filePath: file,
        fileName: origName,
        outputName: origName.replace(/\.[^/.]+$/, "") + '_h265.mkv',
        mediaInfo: null,
        status: 'pending',
        progress: 0,
        selectedAudio: [],
        selectedSubtitles: []
      };
    });

    setJobs(prev => [...prev, ...newJobs]);

    for (const job of newJobs) {
      try {
        const info = await window.ipcRenderer.invoke('get-media-info', job.filePath);
        
        const isMatch = (t: TrackInfo) => {
          if (prefLangs.length === 0) return true;
          const lang = (t.language || '').toLowerCase();
          const title = (t.title || '').toLowerCase();
          return prefLangs.some(pref => lang.includes(pref) || title.includes(pref));
        };

        const selectedAudio = info.tracks.filter((t: TrackInfo) => t.type === 'audio' && isMatch(t)).map((t: TrackInfo) => t.index);
        const selectedSubtitles = info.tracks.filter((t: TrackInfo) => t.type === 'subtitle' && isMatch(t)).map((t: TrackInfo) => t.index);

        let newOutputName = job.outputName;
        if (info.show && info.season && info.episode) {
          const s = String(info.season).padStart(2, '0');
          const e = String(info.episode).padStart(2, '0');
          newOutputName = `${sanitizeName(info.show)} - S${s}E${e}.mkv`;
        } else {
          const match = job.fileName.match(/^(.*?)(?:[\s_.-]*)(?:s(\d+)e(\d+)|(\d+)x(\d+))/i);
          if (match) {
            const possibleShowName = match[1].replace(/[._]/g, ' ').trim();
            const s = String(match[2] || match[4]).padStart(2, '0');
            const e = String(match[3] || match[5]).padStart(2, '0');
            
            if (possibleShowName) {
              newOutputName = `${sanitizeName(possibleShowName)} - S${s}E${e}.mkv`;
            } else {
              newOutputName = `S${s}E${e}.mkv`;
            }
          }
        }

        setJobs(prev => prev.map(j => {
          if (j.id === job.id) {
            return {
              ...j,
              mediaInfo: info,
              outputName: newOutputName,
              selectedAudio,
              selectedSubtitles,
              originalSize: info.sizeBytes || 0
            };
          }
          return j;
        }));
      } catch (err: any) {
        setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: err.message } : j));
      }
    }
  };

  const handleAddFiles = async () => {
    const files = await window.ipcRenderer.invoke('select-files');
    await processSelectedFiles(files);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files).map((f: any) => f.path).filter(p => p);
    await processSelectedFiles(files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const removeJob = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  // --- TMDB Modal Logic ---

  const searchTmdb = async () => {
    if (!tmdbKey) return alert('Configura la API Key en Ajustes Avanzados primero.');
    if (!tmdbQuery) return;
    
    setTmdbIsLoading(true);
    setTmdbSelectedId(null);
    setTmdbPreviewMap({});
    
    try {
      const endpoint = tmdbType === 'tv' ? 'search/tv' : 'search/movie';
      const res = await fetch(`https://api.themoviedb.org/3/${endpoint}?api_key=${tmdbKey}&query=${encodeURIComponent(tmdbQuery)}&language=es-ES`);
      const data = await res.json();
      if (data.results) {
        setTmdbResults(data.results.slice(0, 10)); // Mostrar top 10
      }
    } catch (e: any) {
      alert('Error contactando TMDB: ' + e.message);
    }
    setTmdbIsLoading(false);
  };

  const selectTmdbResult = async (result: any) => {
    setTmdbSelectedId(result.id);
    setTmdbIsLoading(true);
    const previews: Record<string, string> = {};

    if (tmdbType === 'movie') {
      const year = result.release_date ? result.release_date.substring(0, 4) : '';
      const cleanTitle = sanitizeName(result.title || result.name);
      const yearStr = year ? ` (${year})` : '';
      
      for (const job of jobs.filter(j => j.status === 'pending')) {
        previews[job.id] = `${cleanTitle}${yearStr}.mkv`;
      }
    } else {
      // Para series: analizar temporada por cada archivo
      const seriesName = sanitizeName(result.name);
      const seasonMap = new Map<number, Job[]>();
      
      for (const job of jobs.filter(j => j.status === 'pending')) {
        const match = job.fileName.match(/(\d+)x(\d+)/i) || job.fileName.match(/s(\d+)e(\d+)/i) || job.fileName.match(/episodio (\d+)/i);
        let season = 1;
        let episode = 1;
        if (match) {
          if (match.length > 2) {
            season = parseInt(match[1], 10);
            episode = parseInt(match[2], 10);
          } else {
            episode = parseInt(match[1], 10);
          }
        }
        (job as any)._tempSeason = season;
        (job as any)._tempEpisode = episode;
        
        if (!seasonMap.has(season)) seasonMap.set(season, []);
        seasonMap.get(season)!.push(job);
      }

      for (const [season, seasonJobs] of seasonMap.entries()) {
        try {
          const res = await fetch(`https://api.themoviedb.org/3/tv/${result.id}/season/${season}?api_key=${tmdbKey}&language=es-ES`);
          if (!res.ok) continue;
          const data = await res.json();
          if (data.episodes) {
            for (const job of seasonJobs) {
              const epNum = (job as any)._tempEpisode;
              const tmdbEp = data.episodes.find((e: any) => e.episode_number === epNum);
              if (tmdbEp) {
                const sStr = String(season).padStart(2, '0');
                const eStr = String(tmdbEp.episode_number).padStart(2, '0');
                const cleanTitle = sanitizeName(tmdbEp.name);
                previews[job.id] = `${seriesName} - S${sStr}E${eStr} - ${cleanTitle}.mkv`;
              } else {
                 // Fallback si no encuentra el episodio en la season
                 const sStr = String(season).padStart(2, '0');
                 const eStr = String(epNum).padStart(2, '0');
                 previews[job.id] = `${seriesName} - S${sStr}E${eStr}.mkv`;
              }
            }
          }
        } catch(e) {
          console.error(e);
        }
      }
    }
    
    setTmdbPreviewMap(previews);
    setTmdbIsLoading(false);
  };

  const applyTmdbPreview = () => {
    setJobs(prev => prev.map(j => {
      if (tmdbPreviewMap[j.id]) {
        return { ...j, outputName: tmdbPreviewMap[j.id] };
      }
      return j;
    }));
    setShowTmdbModal(false);
  };

  const toggleTrack = (jobId: string, trackType: 'audio'|'subtitle', trackIndex: number) => {
    setJobs(prev => prev.map(j => {
      if (j.id === jobId) {
        const field = trackType === 'audio' ? 'selectedAudio' : 'selectedSubtitles';
        const list = j[field];
        const newList = list.includes(trackIndex) ? list.filter(i => i !== trackIndex) : [...list, trackIndex];
        return { ...j, [field]: newList };
      }
      return j;
    }));
  };

  const togglePrefLang = (code: string) => {
    setPrefLangs(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]);
  };

  const updateJobOutputName = (jobId: string, name: string) => {
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, outputName: name } : j));
  };

  const startJob = async (job: Job): Promise<boolean> => {
    if (job.status === 'processing' || job.status === 'completed') return false;
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'processing', progress: 0, logs: [] } : j));

    const pathSeparator = job.filePath.includes('\\') ? '\\' : '/';
    let outputPath = outDir ? `${outDir}${pathSeparator}${job.outputName}` : job.filePath.replace(/[^\\/]+$/, job.outputName);
    if (!outputPath.endsWith('.mkv')) outputPath += '.mkv';

    const progressListener = (_event: any, data: { percent: number, timeStr: string, fps: number }) => {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, progress: data.percent, timeRemaining: data.timeStr, fps: data.fps } : j));
    };

    const logListener = (_event: any, logMsg: string) => {
      setJobs(prev => prev.map(j => {
        if (j.id === job.id) {
          const currentLogs = j.logs || [];
          return { ...j, logs: [...currentLogs, logMsg].slice(-300) };
        }
        return j;
      }));
    };

    window.ipcRenderer.on(`encoding-progress-${job.id}`, progressListener);
    window.ipcRenderer.on(`encoding-log-${job.id}`, logListener);

    const result = await window.ipcRenderer.invoke('start-encoding', {
      jobId: job.id,
      inputPath: job.filePath,
      outputPath: outputPath,
      hardwareProfile: profile,
      globalQuality: quality,
      selectedAudioIndices: job.selectedAudio,
      selectedSubtitleIndices: job.selectedSubtitles
    });

    window.ipcRenderer.off(`encoding-progress-${job.id}`, progressListener);
    window.ipcRenderer.off(`encoding-log-${job.id}`, logListener);

    if (result.success) {
      const compSize = result.compressedSize || 0;
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'completed', progress: 100, compressedSize: compSize } : j));
      
      const origSize = job.originalSize || 0;
      if (origSize > compSize) {
        const saved = origSize - compSize;
        setLifetimeSaved(prev => prev + saved);
      }

      new Notification("Compresión Exitosa", {
        body: `Se ha completado: ${job.outputName}`
      });
      return true;
    } else {
      setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error', error: result.error } : j));
      new Notification("Error de Compresión", {
        body: `Fallo en: ${job.outputName}`
      });
      return false;
    }
  };

  const cancelJob = async (jobId: string) => {
    await window.ipcRenderer.invoke('cancel-encoding', jobId);
  };

  const startAll = async () => {
    let processedCount = 0;
    let hasErrors = false;
    for (const job of jobs) {
      if (job.status === 'pending') {
        processedCount++;
        const success = await startJob(job);
        if (!success) hasErrors = true;
      }
    }

    if (processedCount > 0) {
      if (hasErrors) {
        new Notification("SinCracK Video Compressor", {
          body: "La cola de compresión ha finalizado con algunos errores."
        });
      } else {
        new Notification("SinCracK Video Compressor", {
          body: "¡Todos los vídeos se han comprimido correctamente!"
        });
      }

      if (autoShutdown) {
        setCountdownType('shutdown');
        setCountdown(60);
      } else if (autoSleep) {
        setCountdownType('sleep');
        setCountdown(60);
      }
    }
  };

  const clearCompleted = () => {
    setJobs(prev => prev.filter(j => j.status !== 'completed' && j.status !== 'error'));
  };

  const pendingJobs = jobs.filter(j => j.status === 'pending');
  const sessionSaved = jobs.reduce((acc, job) => {
    if (job.status === 'completed' && job.originalSize && job.compressedSize && job.originalSize > job.compressedSize) {
      return acc + (job.originalSize - job.compressedSize);
    }
    return acc;
  }, 0);

  return (
    <div className="app-container" onDrop={handleDrop} onDragOver={handleDragOver}>
      
      {/* MODAL DE AJUSTES AVANZADOS */}
      {showSettings && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '2rem', borderRadius: '12px', width: '500px', maxWidth: '90%', border: '1px solid var(--border)', position: 'relative' }}>
            <button onClick={() => setShowSettings(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Settings2 size={20} /> Ajustes Avanzados
            </h2>
            
            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
              <label><Key size={14}/> TMDB API Key</label>
              <input type="password" value={tmdbKey} onChange={e => setTmdbKey(e.target.value)} placeholder="Introduce tu clave API de TMDB..." />
            </div>

            <div className="form-group">
              <label><Languages size={14}/> Idiomas Preferidos (Auto-selección)</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.5rem' }}>
                {COMMON_LANGS.map(lang => (
                  <label key={lang.code} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={prefLangs.includes(lang.code)} onChange={() => togglePrefLang(lang.code)} />
                    {lang.label}
                  </label>
                ))}
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
              <label>🔋 Gestión de Energía (Cola finalizada)</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoShutdown} onChange={(e) => {
                    setAutoShutdown(e.target.checked);
                    if (e.target.checked) setAutoSleep(false);
                  }} />
                  Apagar el equipo al terminar la cola
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', cursor: 'pointer' }}>
                  <input type="checkbox" checked={autoSleep} onChange={(e) => {
                    setAutoSleep(e.target.checked);
                    if (e.target.checked) setAutoShutdown(false);
                  }} />
                  Suspender el equipo al terminar la cola
                </label>
              </div>
            </div>

            <button className="btn-primary" style={{ width: '100%', marginTop: '2rem' }} onClick={() => setShowSettings(false)}>
              Guardar y Cerrar
            </button>
          </div>
        </div>
      )}

      {/* MODAL TMDB RENOMBRADOR */}
      {showTmdbModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ background: 'var(--bg)', padding: '2rem', borderRadius: '12px', width: '900px', height: '80vh', maxWidth: '95%', border: '1px solid var(--border)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
            <button onClick={() => setShowTmdbModal(false)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
              <X size={24} />
            </button>
            <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clapperboard size={24} color="var(--accent)" /> Renombrador TMDB Inteligente
            </h2>
            
            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
              <div style={{ display: 'flex', background: 'var(--bg-secondary)', padding: '0.25rem', borderRadius: '6px', gap: '0.25rem' }}>
                <button 
                  style={{ background: tmdbType === 'tv' ? 'var(--accent)' : 'transparent', color: tmdbType === 'tv' ? 'white' : 'var(--text-muted)', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  onClick={() => { setTmdbType('tv'); setTmdbResults([]); setTmdbPreviewMap({}); setTmdbSelectedId(null); }}
                >
                  <Tv size={16}/> Series
                </button>
                <button 
                  style={{ background: tmdbType === 'movie' ? 'var(--accent)' : 'transparent', color: tmdbType === 'movie' ? 'white' : 'var(--text-muted)', border: 'none', padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
                  onClick={() => { setTmdbType('movie'); setTmdbResults([]); setTmdbPreviewMap({}); setTmdbSelectedId(null); }}
                >
                  <Film size={16}/> Películas
                </button>
              </div>

              <input 
                type="text" 
                placeholder={tmdbType === 'tv' ? "Nombre de la Serie (ej: Breaking Bad)" : "Nombre de la Película (ej: Inception)"} 
                value={tmdbQuery} 
                onChange={e => setTmdbQuery(e.target.value)} 
                onKeyDown={e => e.key === 'Enter' && searchTmdb()}
                style={{ flex: 1 }}
              />
              <button className="btn-primary" onClick={searchTmdb}>
                <Search size={16} /> Buscar
              </button>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flex: 1, minHeight: 0 }}>
              <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '1rem', border: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--text-muted)' }}>Resultados de TMDB</h3>
                {tmdbIsLoading && !tmdbSelectedId && <Loader2 className="spin" />}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {tmdbResults.map(res => (
                    <div 
                      key={res.id} 
                      onClick={() => selectTmdbResult(res)}
                      style={{ 
                        padding: '0.75rem', 
                        background: tmdbSelectedId === res.id ? 'rgba(59, 130, 246, 0.2)' : 'rgba(0,0,0,0.2)', 
                        border: `1px solid ${tmdbSelectedId === res.id ? 'var(--accent)' : 'transparent'}`,
                        borderRadius: '4px', 
                        cursor: 'pointer',
                        display: 'flex',
                        flexDirection: 'column'
                      }}
                    >
                      <strong>{res.name || res.title}</strong>
                      <small style={{ color: 'var(--text-muted)' }}>{res.first_air_date ? res.first_air_date.substring(0,4) : res.release_date ? res.release_date.substring(0,4) : '?'}</small>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ flex: 2, overflowY: 'auto', background: 'var(--bg-secondary)', borderRadius: '6px', padding: '1rem', border: '1px solid var(--border)' }}>
                <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: 'var(--text-muted)' }}>Previsualización (Solo Archivos Pendientes)</h3>
                {tmdbIsLoading && tmdbSelectedId && <Loader2 className="spin" />}
                {!tmdbIsLoading && tmdbSelectedId && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {pendingJobs.length === 0 && <p style={{color: 'var(--text-muted)'}}>No hay archivos en la lista principal.</p>}
                    {pendingJobs.map(job => (
                      <div key={job.id} style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center', background: 'rgba(0,0,0,0.2)', padding: '0.5rem', borderRadius: '4px' }}>
                        <span style={{ fontSize: '0.85rem', wordBreak: 'break-all', color: 'var(--text-muted)' }}>{job.fileName}</span>
                        <span style={{ color: 'var(--accent)' }}>➡️</span>
                        <span style={{ fontSize: '0.85rem', wordBreak: 'break-all', color: tmdbPreviewMap[job.id] ? 'white' : 'var(--error)' }}>
                          {tmdbPreviewMap[job.id] || 'No se encontró coincidencia'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
              <button className="btn-secondary" onClick={() => setShowTmdbModal(false)}>Cancelar</button>
              <button className="btn-primary" onClick={applyTmdbPreview} disabled={!tmdbSelectedId || pendingJobs.length === 0}>
                <CheckCircle2 size={16} /> Aplicar Nombres
              </button>
            </div>
          </div>
        </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-header">
          <Settings2 className="icon-header" />
          <h2>Ajustes Básicos</h2>
        </div>
        
        <div className="form-group">
          <label>Perfil Hardware</label>
          <select value={profile} onChange={e => setProfile(e.target.value)}>
            <option value="hevc_qsv">Intel QSV (Rápido)</option>
            <option value="hevc_nvenc">Nvidia NVENC</option>
            <option value="hevc_amf">AMD AMF</option>
            <option value="hevc_videotoolbox">Apple Mac (VideoToolbox)</option>
            <option value="libx265">CPU (Básico)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Calidad Global (CRF)</label>
          <select value={quality} onChange={e => setQuality(e.target.value)}>
            <option value="20">20 (Alta Calidad, Mayor Tamaño)</option>
            <option value="22">22 (Balanceado)</option>
            <option value="24">24 (Compresión Media)</option>
            <option value="26">26 (Mayor Compresión)</option>
            <option value="28">28 (Alta Compresión)</option>
            <option value="30">30 (Máxima Compresión, Menor Tamaño)</option>
          </select>
        </div>

        <div className="form-group">
          <label>Directorio de Salida</label>
          <button className="btn-secondary" onClick={handleSelectOutDir}>
            <FolderDown size={16} /> {outDir ? 'Cambiar Carpeta' : 'Misma Carpeta'}
          </button>
          <small>{outDir ? outDir : 'Misma carpeta del original.'}</small>
        </div>

        <button className="btn-secondary" style={{ marginTop: '0.5rem', width: '100%' }} onClick={() => setShowSettings(true)}>
          <Settings2 size={16} /> Ajustes Avanzados
        </button>

        <hr style={{ borderColor: 'var(--border)', margin: '1rem 0' }} />

        <button 
          className="btn-secondary" 
          onClick={() => setShowTmdbModal(true)} 
          style={{ width: '100%', justifyContent: 'center', background: 'rgba(59, 130, 246, 0.1)', borderColor: 'var(--accent)' }}
        >
          <Clapperboard size={18} color="var(--accent)" /> Renombrador TMDB
        </button>

        <div className="form-group" style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border)', paddingTop: '1.5rem' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
            <HardDrive size={14} color="var(--accent)" /> Espacio Ahorrado
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.75rem' }}>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem 0.4rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border)' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>En esta sesión</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--accent)', marginTop: '0.25rem' }}>{formatBytes(sessionSaved)}</div>
            </div>
            <div style={{ background: 'rgba(0,0,0,0.3)', padding: '0.6rem 0.4rem', borderRadius: '6px', textAlign: 'center', border: '1px solid var(--border)', position: 'relative' }}>
              <button 
                onClick={() => {
                  if (confirm('¿Seguro que quieres reiniciar el contador histórico?')) {
                    setLifetimeSaved(0);
                  }
                }}
                style={{ position: 'absolute', top: '2px', right: '4px', background: 'transparent', border: 'none', color: 'var(--error)', cursor: 'pointer', fontSize: '0.65rem', padding: '2px' }}
                title="Reiniciar total histórico"
              >
                🔄
              </button>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>En total</div>
              <div style={{ fontSize: '1rem', fontWeight: 'bold', color: '#10b981', marginTop: '0.25rem' }}>{formatBytes(lifetimeSaved)}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 'auto' }}>
          <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', padding: '1rem' }} onClick={startAll}>
            <Play size={20} /> Comprimir Todo
          </button>
        </div>
      </aside>

      <main className="main-content">
        <div className="header-area">
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <img src={logo} alt="SinCracK Logo" style={{ height: '48px', objectFit: 'contain' }} />
            <h1>Video Compressor</h1>
          </div>
          <div style={{ display: 'flex', gap: '1rem' }}>
            {jobs.some(j => j.status === 'completed' || j.status === 'error') && (
              <button className="btn-secondary" onClick={clearCompleted}>
                Limpiar Finalizados/Errores
              </button>
            )}
            <button className="btn-primary" onClick={handleAddFiles}>
              <Video size={16} /> Añadir Archivos
            </button>
          </div>
        </div>

        {jobs.length === 0 ? (
          <div className="dropzone" onClick={handleAddFiles}>
            <Video size={48} className="drop-icon" />
            <p>Haz clic para añadir archivos o arrástralos aquí</p>
          </div>
        ) : (
          <div className="job-list">
            {jobs.map(job => (
              <div key={job.id} className="job-item">
                <div className="job-header">
                  <div className="job-info">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', flex: 1 }}>
                      <span className="job-name" style={{ color: 'var(--text-muted)' }}>Original: {job.fileName}</span>
                      {job.status === 'pending' ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <Edit3 size={14} color="var(--accent)" />
                          <input 
                            type="text" 
                            value={job.outputName} 
                            onChange={e => updateJobOutputName(job.id, e.target.value)}
                            style={{ background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', color: 'white', padding: '0.25rem 0.5rem', borderRadius: '4px', width: '100%', maxWidth: '400px' }} 
                          />
                        </div>
                      ) : (
                        <span className="job-name">Salida: {job.outputName}</span>
                      )}
                    </div>
                    
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {job.status === 'completed' && job.originalSize && job.compressedSize && job.originalSize > job.compressedSize && (() => {
                        const savedBytes = job.originalSize - job.compressedSize;
                        const savedPercent = Math.round((savedBytes / job.originalSize) * 100);
                        return (
                          <span style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#10b981', border: '1px solid rgba(16, 185, 129, 0.3)', padding: '4px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 'bold' }}>
                            -{formatBytes(savedBytes)} (-{savedPercent}%)
                          </span>
                        );
                      })()}
                      {(job.status === 'processing' || job.status === 'completed' || job.status === 'error') && (
                        <button 
                          className="btn-secondary" 
                          style={{ padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '0.25rem', borderColor: 'var(--border)' }}
                          onClick={() => setViewingLogsJobId(job.id)}
                        >
                          <Terminal size={14} /> Logs
                        </button>
                      )}
                      {job.status === 'pending' && (
                        <button onClick={() => removeJob(job.id)} style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                          <Trash2 size={16} />
                        </button>
                      )}
                      {job.status === 'processing' && (
                        <button className="btn-secondary" style={{ padding: '4px 8px', borderColor: 'var(--error)' }} onClick={() => cancelJob(job.id)}>
                          <XCircle size={14} color="var(--error)" /> Cancelar
                        </button>
                      )}
                      <span className={`job-status status-${job.status}`}>
                        {job.status === 'processing' && <Loader2 size={14} className="spin" />}
                        {job.status === 'completed' && <CheckCircle2 size={14} />}
                        {job.status === 'error' && <AlertCircle size={14} />}
                        {job.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                  {job.status === 'processing' && (
                    <div className="job-progress">
                      <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${job.progress}%` }}></div>
                      </div>
                      <span className="progress-text">{job.progress}% - {job.timeRemaining} {job.fps ? `(${job.fps} fps)` : ''}</span>
                    </div>
                  )}
                </div>

                {job.mediaInfo && job.status === 'pending' && (
                  <div className="job-tracks">
                    <div className="track-section">
                      <strong>Audios:</strong>
                      {job.mediaInfo.tracks.filter(t => t.type === 'audio').map(t => (
                        <label key={t.index} className="track-label">
                          <input type="checkbox" checked={job.selectedAudio.includes(t.index)} onChange={() => toggleTrack(job.id, 'audio', t.index)} />
                          Pista {t.index}: {t.language || 'Desconocido'} ({t.codec}) {t.title ? `- ${t.title}` : ''}
                        </label>
                      ))}
                    </div>
                    <div className="track-section">
                      <strong>Subtítulos:</strong>
                      {job.mediaInfo.tracks.filter(t => t.type === 'subtitle').map(t => (
                        <label key={t.index} className="track-label">
                          <input type="checkbox" checked={job.selectedSubtitles.includes(t.index)} onChange={() => toggleTrack(job.id, 'subtitle', t.index)} />
                          Pista {t.index}: {t.language || 'Desconocido'} ({t.codec}) {t.title ? `- ${t.title}` : ''}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {job.error && (
                  <div className="job-error">{job.error}</div>
                )}
              </div>
            ))}
          </div>
        )}
      </main>

      {/* MODAL DE LOGS EN VIVO */}
      {viewingLogsJobId && (() => {
        const job = jobs.find(j => j.id === viewingLogsJobId);
        if (!job) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ background: '#090d16', padding: '2rem', borderRadius: '12px', width: '800px', height: '70vh', maxWidth: '95%', border: '1px solid var(--border)', position: 'relative', display: 'flex', flexDirection: 'column' }}>
              <button onClick={() => setViewingLogsJobId(null)} style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>
                <X size={24} />
              </button>
              <h2 style={{ marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#f8fafc' }}>
                <Terminal size={20} color="var(--accent)" /> Logs de FFmpeg: {job.outputName}
              </h2>
              <div 
                id="logs-container"
                style={{ 
                  flex: 1, 
                  background: '#030712', 
                  color: '#e2e8f0', 
                  padding: '1rem', 
                  borderRadius: '6px', 
                  fontFamily: 'monospace', 
                  fontSize: '0.85rem', 
                  overflowY: 'auto', 
                  whiteSpace: 'pre-wrap', 
                  border: '1px solid #1f2937' 
                }}
              >
                {job.logs && job.logs.length > 0 ? (
                  job.logs.join('')
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Esperando salida de FFmpeg...</span>
                )}
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'flex-end', gap: '1rem' }}>
                <button 
                  className="btn-secondary"
                  onClick={() => {
                    const text = job.logs ? job.logs.join('') : '';
                    navigator.clipboard.writeText(text);
                    alert('¡Logs copiados al portapapeles!');
                  }}
                  disabled={!job.logs || job.logs.length === 0}
                >
                  Copiar Logs
                </button>
                <button className="btn-primary" onClick={() => setViewingLogsJobId(null)}>Cerrar</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* OVERLAY DE CUENTA ATRÁS PARA APAGADO/SUSPENSIÓN */}
      {countdown !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(9, 13, 22, 0.95)', zIndex: 4000, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#f8fafc' }}>
          <div style={{ background: '#111827', padding: '3rem', borderRadius: '16px', border: '1px solid #1f2937', textAlign: 'center', maxWidth: '500px', width: '90%', boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)' }}>
            <div style={{ fontSize: '5rem', fontWeight: 'bold', color: 'var(--accent)', marginBottom: '1.5rem', fontFamily: 'monospace' }}>
              {countdown}
            </div>
            <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>
              {countdownType === 'shutdown' ? 'Apagando el Equipo' : 'Suspendiendo el Equipo'}
            </h2>
            <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', fontSize: '0.95rem' }}>
              SinCracK Video Compressor ha completado todas las tareas de codificación. El sistema se {countdownType === 'shutdown' ? 'apagará' : 'suspenderá'} automáticamente para ahorrar energía.
            </p>
            <button 
              className="btn-primary" 
              style={{ background: '#ef4444', color: 'white', padding: '1rem 2rem', fontSize: '1.1rem', width: '100%', borderRadius: '8px' }}
              onClick={() => {
                setCountdown(null);
                setCountdownType(null);
              }}
            >
              CANCELAR ACCIÓN
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
