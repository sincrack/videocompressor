# 🎬 SinCracK Video Compressor

Un compresor de vídeo por lotes (Batch Video Compressor) ultra-rápido, inteligente y profesional, construido sobre **Electron**, **React**, **Vite** y **FFmpeg**. 

Diseñado específicamente para automatizar y simplificar el procesamiento de colecciones de series y películas (ideal para organizar contenido descargado de Telegram, trackers, etc.).

---

## ✨ Características Principales

*   **⚡ Codificación por Hardware Inteligente (GPU)**: Autodetecta tu tarjeta gráfica al iniciar la app para configurar el mejor codificador disponible:
    *   **NVIDIA NVENC** (`hevc_nvenc`) - Optimizado para series RTX/GTX.
    *   **Intel QuickSync (QSV)** (`hevc_qsv`) - Para gráficas integradas Intel.
    *   **AMD AMF** (`hevc_amf`) - Para tarjetas Radeon.
    *   **Apple VideoToolbox** (`hevc_videotoolbox`) - Aceleración nativa para Mac M1/M2/M3 (Apple Silicon).
    *   **CPU H.265 (libx265)** - Alternativa de software de alta calidad.
*   **🏷️ Renombrador Inteligente TMDB (Estilo FileBot)**:
    *   Conexión directa con la API de **The Movie Database (TMDB)**.
    *   **Modo Series**: Escanea tus archivos pendientes, detecta la temporada y episodio (ej: `1x02`, `S03E06`), busca la información real del episodio en TMDB y renombra el archivo automáticamente con el formato oficial: `Nombre de la Serie - SXXEXX - Título del Episodio.mkv`.
    *   **Modo Películas**: Busca y asocia el año y título oficial en un clic: `Título (Año).mkv`.
    *   **Tabla de Previsualización**: Revisa los nombres antiguos frente a los nuevos propuestos antes de aplicar los cambios en la cola.
*   **🔍 Filtros Globales y Automatización de Idiomas**:
    *   Configura en el panel de **Ajustes Avanzados** tus idiomas preferidos (ej: Español `spa`, Inglés `eng`).
    *   Al arrastrar los vídeos, el programa analiza mediante `ffprobe` sus pistas internas de audio y subtítulos, **pre-seleccionando automáticamente** solo tus idiomas preferidos para ahorrar tiempo y clics.
*   **🖱️ Arrastrar y Soltar (Drag & Drop)**: Importa temporadas completas arrastrándolas en cualquier parte de la ventana.
*   **🛑 Gestión de Cola en Tiempo Real**:
    *   Visualiza los FPS de codificación y tiempo estimado restante.
    *   Cancela de forma segura tareas activas en curso (`SIGKILL` a FFmpeg) sin colgar la aplicación.
    *   Elimina archivos individuales de la lista de pendientes mediante el botón de papelera.
    *   Limpia las tareas completadas o con error con un solo botón.
*   **💎 UI/UX Premium**: Diseño moderno con efecto *Glassmorphism* oscuro, limpio, intuitivo y optimizado para el uso diario.

---

## 🛠️ Requisitos de Desarrollo

*   [Node.js](https://nodejs.org/) (Versión 18 o superior recomendada).
*   Un editor de código (como VS Code).

---

## 🚀 Instalación y Desarrollo Local

1.  **Clona el repositorio**:
    ```bash
    git clone https://github.com/sincrack/videocompressor.git
    cd videocompressor
    ```

2.  **Instala las dependencias**:
    ```bash
    npm install
    ```

3.  **Inicia la aplicación en modo desarrollo**:
    ```bash
    npm run dev
    ```

---

## 📦 Compilación para Distribución (Generar `.exe`, `.dmg`, `.AppImage`)

El proyecto viene configurado con `electron-builder` para empaquetar de forma portable y nativa todas las dependencias (incluyendo los binarios de FFmpeg correspondientes a cada sistema operativo).

### 🪟 Windows (Generar `.exe`)
Para compilar un instalador ejecutable en Windows, abre tu terminal (se recomienda abrirla **como Administrador** para evitar problemas de permisos de enlace de firma) y ejecuta:
```bash
npm run build
```
El archivo de instalación portable se generará en la carpeta `release/SinCracK Video Compressor Setup X.Y.Z.exe`.

### 🍏 macOS (Generar `.dmg`)
Para compilar en Mac y optimizar el rendimiento nativo en **Apple Silicon (M1/M2/M3)** libre de avisos de emulación, ejecuta:
```bash
npm run build -- --arm64
```
El archivo de instalación se generará en la carpeta `release/` en formato nativo `.dmg`.

### 🐧 Linux (Generar `.AppImage`)
Para compilar en tu distribución de Linux preferida, ejecuta:
```bash
npm run build
```
Generará un archivo ejecutable `.AppImage` autocontenido que no requiere instalación.

---

## ⚙️ Configuración Inicial Recomendada

1.  Abre la aplicación.
2.  Haz clic en el botón de **Ajustes Avanzados**.
3.  Introduce tu **TMDB API Key** (puedes conseguir una gratis en [themoviedb.org](https://www.themoviedb.org/)).
4.  Marca los idiomas que deseas conservar de tus vídeos de forma predeterminada (ej: Español y Coreano).
5.  ¡Empieza a arrastrar tus vídeos y a comprimir!

---

## 📝 Licencia

Este proyecto está bajo la Licencia MIT. Siéntete libre de clonarlo, modificarlo y adaptarlo a tus necesidades.

---

*Creado con ❤️ por SinCracK.*
