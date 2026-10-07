import type { LanguageMode } from '../types/game';

export interface TranslationContent {
  appTitle: string;
  dayLabel: string;
  timer: string;
  pb: string;
  restart: string;
  splitsTitle: string;
  split25: string;
  split50: string;
  split75: string;
  splitFinish: string;
  notReached: string;
  settings: string;
  stats: string;
  help: string;
  share: string;
  copied: string;
  theme: string;
  darkTheme: string;
  lightTheme: string;
  language: string;
  fireflyColor: string;
  showSplits: string;
  showControls: string;
  controlsTitle: string;
  keyboard: string;
  touchJoystick: string;
  selectDay: string;
  runsCount: string;
  today: string;
  splitsDesc: string;
  close: string;
  todayModifier: string;
  desktopControls: string;
  mobileControls: string;
  winTitle: string;
  newPB: string;
  totalRuns: string;
  bestTime: string;
  historyTitle: string;
  replayTitle: string;
  privacyNote: string;
    effects: Record<string, { name: string; desc: string }>;

  // ==========================================
  // Modular Accessibility System (24 Keys)
  // ==========================================

  // 1. Accessibility Section & Toggles (8 keys)
  accessibility: string;
  headTracking: string;
  headTrackingDesc: string;
  headTrackingRecalibrate: string;
  audioNav: string;
  audioNavDesc: string;
  audioNavVolume: string;
  audioNavHotkeys: string;

  // 2. Download Progress Modal (4 keys)
  downloadingTitle: string;
  downloadingProgress: string; // Template with {module} and {percent}
  downloadComplete: string;
  downloadFailed: string;

  // 3. Calibration Modal (4 keys)
  calibrationTitle: string;
  calibrationPrompt: string;
  calibrationCountdown: string; // Template with {seconds}
  calibrationSuccess: string;

  // 4. Camera Error Modal (4 keys)
  cameraErrorTitle: string;
  cameraDenied: string;
  cameraNotFound: string;
  cameraGenericError: string;

  // 5. Audio Navigation ARIA Announcements (4 keys)
  audioNavStatusMuted: string;
  audioNavStatusUnmuted: string;
  audioNavVolumeChanged: string; // Template with {percent}
  audioFallbackNotice: string;

  // 6. Additional Remediated Keys (7 keys)
  calibrationTimeout: string;
  calibrationRetry: string;
  cancel: string;
  muted: string;
  unmute: string;
  mute: string;
  alternativeControls: string;

  // ==========================================
  // Dynamic Audio Packs (Sound Sets) Keys
  // ==========================================
  soundPack: string;
  soundPackDesc: string;
  soundPackClassic: string;
  soundPackOrganic: string;
  soundPackSynth: string;
  soundPackClockwork: string;
  audioPackClassic: string;
  audioPackOrganic: string;
  audioPackSynth: string;
  audioPackClockwork: string;
  audioPackDownloading: string;
  audioPackDownloadProgress: string; // Template with {pack} and {percent}
  audioPackDownloadComplete: string;
  audioPackDownloadFailed: string;

  // Dotted-path compatibility aliases
  'settings.soundPack': string;
  'settings.soundPackDesc': string;
  'settings.soundPackClassic': string;
  'settings.soundPackOrganic': string;
  'settings.soundPackSynth': string;
  'settings.soundPackClockwork': string;
  'audioPack.downloading': string;
  'audioPack.downloadProgress': string;
  'audioPack.downloadComplete': string;
  'audioPack.downloadFailed': string;
  keyCollected: string;
}

export const LANGUAGE_OPTIONS: { code: LanguageMode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'ru', label: 'Русский' },
  { code: 'es', label: 'Español' },
  { code: 'zh', label: '简体中文' },
  { code: 'ja', label: '日本語' },
  { code: 'de', label: 'Deutsch' },
  { code: 'tr', label: 'Türkçe' },
  { code: 'pt', label: 'Português' },
];

export const TRANSLATIONS: Record<LanguageMode, TranslationContent> = {
  en: {
    appTitle: 'Maze Daily',
    dayLabel: 'Day',
    timer: 'Time',
    pb: 'PB',
    restart: 'Restart',
    splitsTitle: 'Time Splits',
    split25: '25% Way',
    split50: '50% Way',
    split75: '75% Way',
    splitFinish: 'Finish',
    notReached: '--:--.--',
    settings: 'Settings',
    stats: 'Statistics',
    help: 'How to Play',
    share: 'Share',
    copied: 'Copied to clipboard!',
    theme: 'Theme',
    darkTheme: 'Dark',
    lightTheme: 'Light',
    language: 'Language',
    fireflyColor: 'Firefly Color',
    showSplits: 'Show Time Splits',
    showControls: 'Show Controls Guide',
    controlsTitle: 'Controls',
    keyboard: 'Keyboard',
    touchJoystick: 'Touch / Virtual Joystick',
    selectDay: 'Select Day:',
    runsCount: 'runs',
    today: 'Today',
    splitsDesc: 'Pass checkpoints (25%, 50%, 75%) strictly in order to compete against your personal best!',
    close: 'Close',
    todayModifier: 'Today Modifier',
    desktopControls: 'Use WASD or Arrow keys to move smoothly.',
    mobileControls: 'Use the on-screen joystick or swipe to navigate.',
    winTitle: 'Maze Solved!',
    newPB: 'NEW PERSONAL BEST!',
    totalRuns: 'Total Attempts Today',
    bestTime: 'Best Time',
    historyTitle: 'Today Runs',
    replayTitle: 'Run Path Replay',
    privacyNote: 'Client-side only. No tracking cookies. Stored in your browser.',
    effects: {
      none: { name: 'Classic', desc: 'Pure speedrun without modifiers.' },
      fog_of_war: { name: 'Fog of War', desc: 'Sight is limited to a radius around the firefly.' },
      ice: { name: 'Ice', desc: 'Slippery floor with sliding momentum.' },
      fake_exits: { name: 'Fake Exits', desc: '3 of the 4 exits are decoys! Find the true one.' },
      wobbly_walls: { name: 'Wobbly Walls', desc: 'Organic cave-like walls with curved lines.' },
      portals: { name: 'Portals', desc: 'Wormholes connecting two corridors.' },
      key_and_gate: { name: 'Key & Gate', desc: 'Exit is blocked until the golden key is retrieved.' },
      inversion: { name: 'Inversion', desc: 'Controls are reversed!' },
      switches_and_barriers: { name: 'Switches', desc: 'Toggle barrier gates.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Accessibility',
    headTracking: 'Head Tracking',
    headTrackingDesc: 'Control player movement using subtle head tilt via webcam.',
    headTrackingRecalibrate: 'Recalibrate',
    audioNav: 'Audio Navigation',
    audioNavDesc: 'Stereo exit beacon and dynamic multi-stem audio for blind play.',
    audioNavVolume: 'Audio Navigation Volume',
    audioNavHotkeys: 'Volume hotkeys: [ / ] or - / + (5% step), M to mute.',

    // Download Progress Modal
    downloadingTitle: 'Downloading Accessibility Assets',
    downloadingProgress: 'Downloading {module}: {percent}%',
    downloadComplete: 'Download complete!',
    downloadFailed: 'Failed to download module assets. Please check your internet connection.',

    // Calibration Modal
    calibrationTitle: 'Head Tracking Calibration',
    calibrationPrompt: 'Look straight ahead at the center of the screen and hold still.',
    calibrationCountdown: 'Calibrating in {seconds}s...',
    calibrationSuccess: 'Calibration successful! Head tracking active.',

    // Camera Error Modal
    cameraErrorTitle: 'Camera Access Required',
    cameraDenied: 'Camera access was denied. Please allow camera permissions in your browser to enable Head Tracking.',
    cameraNotFound: 'No camera was detected on this device. Please connect a webcam or use keyboard/touch controls.',
    cameraGenericError: 'Unable to start camera stream. Please check your camera settings and try again.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Audio navigation muted',
    audioNavStatusUnmuted: 'Audio navigation unmuted',
    audioNavVolumeChanged: 'Volume {percent}%',
    audioFallbackNotice: 'Audio stems unavailable, using synthesized harmonic fallback.',

    // Additional Remediated Keys
    calibrationTimeout: 'Calibration timed out. Lighting may be insufficient or your face is not visible. Please center your face and try again.',
    calibrationRetry: 'Retry',
    cancel: 'Cancel',
    muted: 'Muted',
    unmute: 'Unmute audio navigation',
    mute: 'Mute audio navigation',
    alternativeControls: 'Alternative Controls Available',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Sound Pack',
    soundPackDesc: 'Select dynamic multi-stem audio theme for navigation.',
    soundPackClassic: 'Classic (Orchestral)',
    soundPackOrganic: 'Organic (Acoustic)',
    soundPackSynth: 'Synthesizer (Electronic)',
    soundPackClockwork: 'Clockwork (Mechanical)',
    audioPackClassic: 'Classic (Orchestral)',
    audioPackOrganic: 'Organic (Acoustic)',
    audioPackSynth: 'Synthesizer (Electronic)',
    audioPackClockwork: 'Clockwork (Mechanical)',
    audioPackDownloading: 'Downloading Sound Pack...',
    audioPackDownloadProgress: 'Downloading {pack}: {percent}%',
    audioPackDownloadComplete: 'Download complete!',
    audioPackDownloadFailed: 'Failed to download sound pack. Please check your internet connection.',
    'settings.soundPack': 'Sound Pack',
    'settings.soundPackDesc': 'Select dynamic multi-stem audio theme for navigation.',
    'settings.soundPackClassic': 'Classic (Orchestral)',
    'settings.soundPackOrganic': 'Organic (Acoustic)',
    'settings.soundPackSynth': 'Synthesizer (Electronic)',
    'settings.soundPackClockwork': 'Clockwork (Mechanical)',
    'audioPack.downloading': 'Downloading Sound Pack...',
    'audioPack.downloadProgress': 'Downloading {pack}: {percent}%',
    'audioPack.downloadComplete': 'Download complete!',
    'audioPack.downloadFailed': 'Failed to download sound pack. Please check your internet connection.',
    keyCollected: 'Key collected! The gate is open, head to the exit.',
  },
  ru: {
    appTitle: 'Maze Daily',
    dayLabel: 'День',
    timer: 'Время',
    pb: 'Рекорд',
    restart: 'Рестарт',
    splitsTitle: 'Тайм-сплиты',
    split25: '25% пути',
    split50: '50% пути',
    split75: '75% пути',
    splitFinish: 'Финиш',
    notReached: '--:--.--',
    settings: 'Настройки',
    stats: 'Статистика',
    help: 'Как играть',
    share: 'Поделиться',
    copied: 'Скопировано в буфер!',
    theme: 'Тема',
    darkTheme: 'Тёмная',
    lightTheme: 'Светлая',
    language: 'Язык',
    fireflyColor: 'Цвет светлячка',
    showSplits: 'Показывать сплиты',
    showControls: 'Показывать блок управления',
    controlsTitle: 'Управление',
    keyboard: 'Клавиатура',
    touchJoystick: 'Тач / Виртуальный джойстик',
    selectDay: 'Выбор дня:',
    runsCount: 'заб.',
    today: 'Сегодня',
    splitsDesc: 'Проходите контрольные точки (25%, 50%, 75%) строго по очереди и соревнуйтесь со своим лучшим временем!',
    close: 'Закрыть',
    todayModifier: 'Модификатор дня',
    desktopControls: 'Используйте клавиши WASD или Стрелки для плавного движения.',
    mobileControls: 'Используйте виртуальный джойстик внизу экрана для перемещения.',
    winTitle: 'Лабиринт пройден!',
    newPB: 'НОВЫЙ ЛИЧНЫЙ РЕКОРД!',
    totalRuns: 'Всего попыток сегодня',
    bestTime: 'Лучшее время',
    historyTitle: 'Заезды за сегодня',
    replayTitle: 'Маршрут забега',
    privacyNote: 'Только в браузере. Без отслеживающих кук. Данные хранятся локально.',
    effects: {
      none: { name: 'Классика', desc: 'Чистый спидран без модификаторов.' },
      fog_of_war: { name: 'Туман войны', desc: 'Обзор ограничен радиусом вокруг светлячка.' },
      ice: { name: 'Лёд', desc: 'Скользкий пол и инерция при движении.' },
      fake_exits: { name: 'Ложные выходы', desc: '3 из 4 выходов — обманки! Найдите настоящий.' },
      wobbly_walls: { name: 'Кривые стены', desc: 'Органические пещерные стены с плавными изгибами.' },
      portals: { name: 'Порталы', desc: 'Червоточины для мгновенного перемещения.' },
      key_and_gate: { name: 'Ключ и Ворота', desc: 'Выход заблокирован, пока не найден золотой ключ.' },
      inversion: { name: 'Инверсия', desc: 'Направления управления перевернуты!' },
      switches_and_barriers: { name: 'Переключатели', desc: 'Переключают барьеры.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Специальные возможности',
    headTracking: 'Управление головой',
    headTrackingDesc: 'Управляйте движением светлячка легкими наклонами головы перед веб-камерой.',
    headTrackingRecalibrate: 'Перекалибровать',
    audioNav: 'Аудио-навигация',
    audioNavDesc: 'Стерео-маяк к выходу и динамические музыкальные дорожки для незрячих игроков.',
    audioNavVolume: 'Громкость аудио-навигации',
    audioNavHotkeys: 'Горячие клавиши громкости: [ / ] или - / + (шаг 5%), M — выкл. звук.',

    // Download Progress Modal
    downloadingTitle: 'Загрузка модулей доступности',
    downloadingProgress: 'Загрузка {module}: {percent}%',
    downloadComplete: 'Загрузка завершена!',
    downloadFailed: 'Не удалось загрузить файлы модуля. Проверьте интернет-соединение.',

    // Calibration Modal
    calibrationTitle: 'Калибровка отслеживания головы',
    calibrationPrompt: 'Смотрите прямо в центр экрана и сохраняйте неподвижность.',
    calibrationCountdown: 'Калибровка через {seconds} с...',
    calibrationSuccess: 'Калибровка завершена! Управление головой активно.',

    // Camera Error Modal
    cameraErrorTitle: 'Ошибка доступа к камере',
    cameraDenied: 'Доступ к веб-камере был отклонен. Разрешите доступ к камере в настройках браузера для использования управления головой.',
    cameraNotFound: 'Веб-камера на устройстве не обнаружена. Подключите камеру или используйте управление клавиатурой/джойстиком.',
    cameraGenericError: 'Не удалось запустить видеопоток с камеры. Проверьте настройки камеры и повторите попытку.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Звук аудио-навигации выключен',
    audioNavStatusUnmuted: 'Звук аудио-навигации включен',
    audioNavVolumeChanged: 'Громкость {percent}%',
    audioFallbackNotice: 'Музыкальные дорожки недоступны, используется синтезаторная гармония.',

    // Additional Remediated Keys
    calibrationTimeout: 'Время калибровки истекло. Освещение может быть недостаточным или лицо не видно. Пожалуйста, расположите лицо по центру и попробуйте снова.',
    calibrationRetry: 'Повторить',
    cancel: 'Отмена',
    muted: 'Без звука',
    unmute: 'Включить звук аудио-навигации',
    mute: 'Отключить звук аудио-навигации',
    alternativeControls: 'Доступны альтернативные способы управления',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Звуковой набор',
    soundPackDesc: 'Выберите динамическую аудио-тему для навигации.',
    soundPackClassic: 'Классика (Оркестр)',
    soundPackOrganic: 'Органика (Акустика)',
    soundPackSynth: 'Синтезатор (Электроника)',
    soundPackClockwork: 'Механизм (Часовой)',
    audioPackClassic: 'Классика (Оркестр)',
    audioPackOrganic: 'Органика (Акустика)',
    audioPackSynth: 'Синтезатор (Электроника)',
    audioPackClockwork: 'Механизм (Часовой)',
    audioPackDownloading: 'Загрузка звукового набора...',
    audioPackDownloadProgress: 'Загрузка {pack}: {percent}%',
    audioPackDownloadComplete: 'Загрузка завершена!',
    audioPackDownloadFailed: 'Не удалось загрузить звуковой набор. Проверьте интернет-соединение.',
    'settings.soundPack': 'Звуковой набор',
    'settings.soundPackDesc': 'Выберите динамическую аудио-тему для навигации.',
    'settings.soundPackClassic': 'Классика (Оркестр)',
    'settings.soundPackOrganic': 'Органика (Акустика)',
    'settings.soundPackSynth': 'Синтезатор (Электроника)',
    'settings.soundPackClockwork': 'Механизм (Часовой)',
    'audioPack.downloading': 'Загрузка звукового набора...',
    'audioPack.downloadProgress': 'Загрузка {pack}: {percent}%',
    'audioPack.downloadComplete': 'Загрузка завершена!',
    'audioPack.downloadFailed': 'Не удалось загрузить звуковой набор. Проверьте интернет-соединение.',
    keyCollected: 'Ключ получен! Ворота открыты, идите к выходу.',
  },
  es: {
    appTitle: 'Maze Daily',
    dayLabel: 'Día',
    timer: 'Tiempo',
    pb: 'Récord',
    restart: 'Reiniciar',
    splitsTitle: 'Tiempos Parciales',
    split25: '25% del camino',
    split50: '50% del camino',
    split75: '75% del camino',
    splitFinish: 'Meta',
    notReached: '--:--.--',
    settings: 'Ajustes',
    stats: 'Estadísticas',
    help: 'Cómo jugar',
    share: 'Compartir',
    copied: '¡Copiado al portapapeles!',
    theme: 'Tema',
    darkTheme: 'Oscuro',
    lightTheme: 'Claro',
    language: 'Idioma',
    fireflyColor: 'Color de la luciérnaga',
    showSplits: 'Mostrar tiempos parciales',
    showControls: 'Mostrar guía de controles',
    controlsTitle: 'Controles',
    keyboard: 'Teclado',
    touchJoystick: 'Táctil / Joystick virtual',
    selectDay: 'Seleccionar día:',
    runsCount: 'partidas',
    today: 'Hoy',
    splitsDesc: '¡Pasa los puntos de control (25%, 50%, 75%) en orden para superar tu mejor marca!',
    close: 'Cerrar',
    todayModifier: 'Modificador de hoy',
    desktopControls: 'Usa las teclas WASD o las flechas para moverte con fluidez.',
    mobileControls: 'Usa el joystick en pantalla para moverte.',
    winTitle: '¡Laberinto completado!',
    newPB: '¡NUEVO RÉCORD PERSONAL!',
    totalRuns: 'Intentos totales hoy',
    bestTime: 'Mejor tiempo',
    historyTitle: 'Carreras de hoy',
    replayTitle: 'Repetición del recorrido',
    privacyNote: 'Solo en el navegador. Sin cookies de seguimiento. Guardado localmente.',
    effects: {
      none: { name: 'Clásico', desc: 'Speedrun puro sin modificadores.' },
      fog_of_war: { name: 'Niebla de guerra', desc: 'La visión se limita al radio alrededor de la luciérnaga.' },
      ice: { name: 'Hielo', desc: 'Suelo resbaladizo con inercia.' },
      fake_exits: { name: 'Salidas falsas', desc: '¡3 de las 4 salidas son señuelos! Encuentra la auténtica.' },
      wobbly_walls: { name: 'Paredes curvas', desc: 'Paredes orgánicas de cueva con líneas onduladas.' },
      portals: { name: 'Portales', desc: 'Agujeros de gusano que conectan dos pasillos.' },
      key_and_gate: { name: 'Llave y Puerta', desc: 'La salida está bloqueada hasta obtener la llave dorada.' },
      inversion: { name: 'Inversión', desc: '¡Los controles están invertidos!' },
      switches_and_barriers: { name: 'Interruptores', desc: 'Activa y desactiva las barreras.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Accesibilidad',
    headTracking: 'Seguimiento de cabeza',
    headTrackingDesc: 'Controla el movimiento de la luciérnaga inclinando suavemente la cabeza ante la cámara.',
    headTrackingRecalibrate: 'Recalibrar',
    audioNav: 'Navegación por audio',
    audioNavDesc: 'Baliza sonora estéreo y capas musicales dinámicas para juego accesible.',
    audioNavVolume: 'Volumen de navegación por audio',
    audioNavHotkeys: 'Teclas de volumen: [ / ] o - / + (paso 5%), M para silenciar.',

    // Download Progress Modal
    downloadingTitle: 'Descargando recursos de accesibilidad',
    downloadingProgress: 'Descargando {module}: {percent}%',
    downloadComplete: '¡Descarga completada!',
    downloadFailed: 'No se pudieron descargar los recursos. Revisa tu conexión a internet.',

    // Calibration Modal
    calibrationTitle: 'Calibración de seguimiento de cabeza',
    calibrationPrompt: 'Mira directamente al centro de la pantalla y mantente quieto.',
    calibrationCountdown: 'Calibrando en {seconds} s...',
    calibrationSuccess: '¡Calibración exitosa! Seguimiento de cabeza activado.',

    // Camera Error Modal
    cameraErrorTitle: 'Acceso a la cámara requerido',
    cameraDenied: 'Se denegó el acceso a la cámara. Concede permisos de cámara en tu navegador para activar el seguimiento de cabeza.',
    cameraNotFound: 'No se detectó ninguna cámara en este dispositivo. Conecta una webcam o utiliza el teclado/joystick.',
    cameraGenericError: 'No se pudo iniciar el vídeo de la cámara. Revisa la configuración de tu cámara e inténtalo de nuevo.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Navegación por audio silenciada',
    audioNavStatusUnmuted: 'Navegación por audio activada',
    audioNavVolumeChanged: 'Volumen {percent}%',
    audioFallbackNotice: 'Pistas de audio no disponibles, usando síntesis armónica de respaldo.',

    // Additional Remediated Keys
    calibrationTimeout: 'Tiempo de calibración agotado. Es posible que la iluminación sea insuficiente o que no se detecte tu rostro. Céntralo e inténtalo de nuevo.',
    calibrationRetry: 'Reintentar',
    cancel: 'Cancelar',
    muted: 'Silenciado',
    unmute: 'Activar sonido de navegación de audio',
    mute: 'Silenciar navegación de audio',
    alternativeControls: 'Controles alternativos disponibles',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Paquete de sonido',
    soundPackDesc: 'Selecciona el tema de audio dinámico para la navegación.',
    soundPackClassic: 'Clásico (Orquestal)',
    soundPackOrganic: 'Orgánico (Acústico)',
    soundPackSynth: 'Sintetizador (Electrónico)',
    soundPackClockwork: 'Mecanismo (Mecánico)',
    audioPackClassic: 'Clásico (Orquestal)',
    audioPackOrganic: 'Orgánico (Acústico)',
    audioPackSynth: 'Sintetizador (Electrónico)',
    audioPackClockwork: 'Mecanismo (Mecánico)',
    audioPackDownloading: 'Descargando paquete de sonido...',
    audioPackDownloadProgress: 'Descargando {pack}: {percent}%',
    audioPackDownloadComplete: '¡Descarga completada!',
    audioPackDownloadFailed: 'No se pudo descargar el paquete de sonido. Revisa tu conexión a internet.',
    'settings.soundPack': 'Paquete de sonido',
    'settings.soundPackDesc': 'Selecciona el tema de audio dinámico para la navegación.',
    'settings.soundPackClassic': 'Clásico (Orquestal)',
    'settings.soundPackOrganic': 'Orgánico (Acústico)',
    'settings.soundPackSynth': 'Sintetizador (Electrónico)',
    'settings.soundPackClockwork': 'Mecanismo (Mecánico)',
    'audioPack.downloading': 'Descargando paquete de sonido...',
    'audioPack.downloadProgress': 'Descargando {pack}: {percent}%',
    'audioPack.downloadComplete': '¡Descarga completada!',
    'audioPack.downloadFailed': 'No se pudo descargar el paquete de sonido. Revisa tu conexión a internet.',
    keyCollected: '¡Llave recogida! La puerta está abierta, dirígete a la salida.',
  },
  zh: {
    appTitle: 'Maze Daily',
    dayLabel: '天数',
    timer: '用时',
    pb: '最佳',
    restart: '重新开始',
    splitsTitle: '分段计时',
    split25: '25% 赛程',
    split50: '50% 赛程',
    split75: '75% 赛程',
    splitFinish: '终点',
    notReached: '--:--.--',
    settings: '设置',
    stats: '统计',
    help: '玩法说明',
    share: '分享',
    copied: '已复制到剪贴板！',
    theme: '主题',
    darkTheme: '深色',
    lightTheme: '浅色',
    language: '语言',
    fireflyColor: '萤火虫颜色',
    showSplits: '显示分段计时',
    showControls: '显示操作提示',
    controlsTitle: '操作',
    keyboard: '键盘',
    touchJoystick: '触控 / 虚拟摇杆',
    selectDay: '选择日期：',
    runsCount: '次',
    today: '今天',
    splitsDesc: '依次穿过各个检查点（25%、50%、75%），挑战你的个人纪录！',
    close: '关闭',
    todayModifier: '今日特效',
    desktopControls: '使用 WASD 或方向键平滑移动。',
    mobileControls: '使用屏幕下方的虚拟摇杆进行移动。',
    winTitle: '成功通关！',
    newPB: '创造个人新纪录！',
    totalRuns: '今日总尝试次数',
    bestTime: '最佳时间',
    historyTitle: '今日记录',
    replayTitle: '回放路径',
    privacyNote: '纯本地运行。无追踪 Cookie。数据保存在您的浏览器中。',
    effects: {
      none: { name: '经典', desc: '无任何特效的纯速通挑战。' },
      fog_of_war: { name: '战争迷雾', desc: '视野局限在萤火虫周围的一定范围。' },
      ice: { name: '冰面', desc: '地面滑溜且具有滑动惯性。' },
      fake_exits: { name: '虚假出口', desc: '4 个出口中有 3 个是假象！找出真正的一个。' },
      wobbly_walls: { name: '蜿蜒墙壁', desc: '如洞穴般曲线波动的天然墙面。' },
      portals: { name: '传送门', desc: '连接两个走廊的虫洞空间。' },
      key_and_gate: { name: '钥匙与大门', desc: '在拾取金色钥匙之前，出口处于闭合状态。' },
      inversion: { name: '反转控制', desc: '移动方向完全倒转！' },
      switches_and_barriers: { name: '机关开关', desc: '切换通行的阻挡栏杆。' },
    },
    // Accessibility Section & Toggles
    accessibility: '无障碍功能',
    headTracking: '头部追踪',
    headTrackingDesc: '通过摄像头捕捉轻微头部倾斜来控制萤火虫移动。',
    headTrackingRecalibrate: '重新校准',
    audioNav: '音频导航',
    audioNavDesc: '立体声出口导引与动态多轨音频，支持视障与盲人玩家畅玩。',
    audioNavVolume: '音频导航音量',
    audioNavHotkeys: '音量快捷键：[ / ] 或 - / +（步长 5%），M 键静音。',

    // Download Progress Modal
    downloadingTitle: '正在下载无障碍资源',
    downloadingProgress: '正在下载 {module}：{percent}%',
    downloadComplete: '下载完成！',
    downloadFailed: '模块资源下载失败，请检查网络连接。',

    // Calibration Modal
    calibrationTitle: '头部追踪校准',
    calibrationPrompt: '请直视屏幕中心并保持不动。',
    calibrationCountdown: '将在 {seconds} 秒后完成校准...',
    calibrationSuccess: '校准成功！头部追踪已启用。',

    // Camera Error Modal
    cameraErrorTitle: '无法访问摄像头',
    cameraDenied: '摄像头权限已被拒绝。请在浏览器设置中允许摄像头权限以启用头部追踪。',
    cameraNotFound: '未检测到可用摄像头。请连接摄像头或使用键盘/触控操作。',
    cameraGenericError: '无法启动摄像头画面，请检查设备设置后重试。',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: '音频导航已静音',
    audioNavStatusUnmuted: '音频导航已取消静音',
    audioNavVolumeChanged: '音量 {percent}%',
    audioFallbackNotice: '多轨音频资源不可用，已自动切换为合成谐波音效。',

    // Additional Remediated Keys
    calibrationTimeout: '校准超时。可能是光线不足或未能检测到面部。请将面部对准中心并重试。',
    calibrationRetry: '重试',
    cancel: '取消',
    muted: '静音',
    unmute: '取消静音音频导航',
    mute: '静音音频导航',
    alternativeControls: '可用替代控制方式',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: '音效包',
    soundPackDesc: '选择用于导航的动态多轨音频主题。',
    soundPackClassic: '经典（管弦乐）',
    soundPackOrganic: '原声（原声乐器）',
    soundPackSynth: '合成器（电子乐）',
    soundPackClockwork: '发条（机械音）',
    audioPackClassic: '经典（管弦乐）',
    audioPackOrganic: '原声（原声乐器）',
    audioPackSynth: '合成器（电子乐）',
    audioPackClockwork: '发条（机械音）',
    audioPackDownloading: '正在下载音效包...',
    audioPackDownloadProgress: '正在下载 {pack}：{percent}%',
    audioPackDownloadComplete: '下载完成！',
    audioPackDownloadFailed: '音效包下载失败，请检查网络连接。',
    'settings.soundPack': '音效包',
    'settings.soundPackDesc': '选择用于导航的动态多轨音频主题。',
    'settings.soundPackClassic': '经典（管弦乐）',
    'settings.soundPackOrganic': '原声（原声乐器）',
    'settings.soundPackSynth': '合成器（电子乐）',
    'settings.soundPackClockwork': '发条（机械音）',
    'audioPack.downloading': '正在下载音效包...',
    'audioPack.downloadProgress': '正在下载 {pack}：{percent}%',
    'audioPack.downloadComplete': '下载完成！',
    'audioPack.downloadFailed': '音效包下载失败，请检查网络连接。',
    keyCollected: '已拾取钥匙！大门已开启，请前往出口。',
  },
  ja: {
    appTitle: 'Maze Daily',
    dayLabel: '日目',
    timer: 'タイム',
    pb: '自己ベスト',
    restart: 'リスタート',
    splitsTitle: 'スプリットタイム',
    split25: '25% 地点',
    split50: '50% 地点',
    split75: '75% 地点',
    splitFinish: 'ゴール',
    notReached: '--:--.--',
    settings: '設定',
    stats: '統計',
    help: '遊び方',
    share: '共有',
    copied: 'クリップボードにコピーしました！',
    theme: 'テーマ',
    darkTheme: 'ダーク',
    lightTheme: 'ライト',
    language: '言語',
    fireflyColor: 'ホタルの色',
    showSplits: 'スプリットを表示',
    showControls: '操作ガイドを表示',
    controlsTitle: '操作方法',
    keyboard: 'キーボード',
    touchJoystick: 'タッチ / 仮想ジョイスティック',
    selectDay: '日付選択:',
    runsCount: '回',
    today: '今日',
    splitsDesc: 'チェックポイント（25%, 50%, 75%）を順番に通過して自己ベストを更新しよう！',
    close: '閉じる',
    todayModifier: '本日のモディファイア',
    desktopControls: 'WASD または矢印キーで移動します。',
    mobileControls: '画面下の仮想ジョイスティックで移動します。',
    winTitle: '迷路クリア！',
    newPB: '自己ベスト更新！',
    totalRuns: '本日の挑戦回数',
    bestTime: 'ベストタイム',
    historyTitle: '本日のラン履歴',
    replayTitle: '走行リプレイ',
    privacyNote: 'ブラウザ内のみで動作。Cookie不使用。ローカルに保存されます。',
    effects: {
      none: { name: 'クラシック', desc: 'モディファイアなしの純粋なスピードラン。' },
      fog_of_war: { name: '戦場の霧', desc: '視界がホタルの周囲のみに制限されます。' },
      ice: { name: 'アイス', desc: '滑る床と慣性による移動。' },
      fake_exits: { name: '偽の出口', desc: '4つの出口のうち3つは偽物！本物を探そう。' },
      wobbly_walls: { name: '曲線の壁', desc: '洞窟のようにうねる有機的な壁。' },
      portals: { name: 'ポータル', desc: '通路間を瞬時に移動するワームホール。' },
      key_and_gate: { name: '鍵とゲート', desc: '金の鍵を見つけるまで出口は閉ざされています。' },
      inversion: { name: '反転', desc: '操作方向が反転しています！' },
      switches_and_barriers: { name: 'スイッチ', desc: 'バリアを切り替えます。' },
    },
    // Accessibility Section & Toggles
    accessibility: 'アクセシビリティ',
    headTracking: 'ヘッドトラッキング',
    headTrackingDesc: 'Webカメラで頭の傾きを検知し、ホタルを操作します。',
    headTrackingRecalibrate: '再キャリブレーション',
    audioNav: 'オーディオナビゲーション',
    audioNavDesc: 'ステレオ出口ビーコンと動的マルチステム音響による視覚障害者対応モード。',
    audioNavVolume: 'オーディオナビ音量',
    audioNavHotkeys: '音量ショートカット: [ / ] または - / +（5%刻み）、Mで消音。',

    // Download Progress Modal
    downloadingTitle: 'アクセシビリティアセットをダウンロード中',
    downloadingProgress: '{module} をダウンロード中: {percent}%',
    downloadComplete: 'ダウンロード完了！',
    downloadFailed: 'モジュールアセットのダウンロードに失敗しました。接続環境をご確認ください。',

    // Calibration Modal
    calibrationTitle: 'ヘッドトラッキングのキャリブレーション',
    calibrationPrompt: '画面の中央をまっすぐ見つめ、静止してください。',
    calibrationCountdown: '残り {seconds} 秒で測定...',
    calibrationSuccess: 'キャリブレーション完了！ヘッドトラッキングが有効化されました。',

    // Camera Error Modal
    cameraErrorTitle: 'カメラへのアクセスエラー',
    cameraDenied: 'カメラへのアクセスが拒否されました。ブラウザの設定でカメラを許可してください。',
    cameraNotFound: 'カメラが検出されませんでした。Webカメラを接続するか、キーボード/タッチ操作をご利用ください。',
    cameraGenericError: 'カメラ映像を開始できませんでした。カメラの設定を確認して再試行してください。',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'オーディオナビ消音',
    audioNavStatusUnmuted: 'オーディオナビ消音解除',
    audioNavVolumeChanged: '音量 {percent}%',
    audioFallbackNotice: '音源ファイルを読み込めないため、合成サイン波ハーモニーで代行します。',

    // Additional Remediated Keys
    calibrationTimeout: 'キャリブレーションがタイムアウトしました。照明が不足しているか、顔が認識されていません。顔を中央に合わせて再試行してください。',
    calibrationRetry: '再試行',
    cancel: 'キャンセル',
    muted: 'ミュート中',
    unmute: '音声ナビゲーションのミュートを解除',
    mute: '音声ナビゲーションをミュート',
    alternativeControls: '代替の操作方法を利用可能',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'サウンドパック',
    soundPackDesc: 'ナビゲーション用の動的マルチステム音響テーマを選択します。',
    soundPackClassic: 'クラシック（オーケストラ）',
    soundPackOrganic: 'オーガニック（アコースティック）',
    soundPackSynth: 'シンセサイザー（エレクトロニック）',
    soundPackClockwork: 'クロックワーク（機械音）',
    audioPackClassic: 'クラシック（オーケストラ）',
    audioPackOrganic: 'オーガニック（アコースティック）',
    audioPackSynth: 'シンセサイザー（エレクトロニック）',
    audioPackClockwork: 'クロックワーク（機械音）',
    audioPackDownloading: 'サウンドパックをダウンロード中...',
    audioPackDownloadProgress: '{pack} をダウンロード中: {percent}%',
    audioPackDownloadComplete: 'ダウンロード完了！',
    audioPackDownloadFailed: 'サウンドパックのダウンロードに失敗しました。接続環境をご確認ください。',
    'settings.soundPack': 'サウンドパック',
    'settings.soundPackDesc': 'ナビゲーション用の動的マルチステム音響テーマを選択します。',
    'settings.soundPackClassic': 'クラシック（オーケストラ）',
    'settings.soundPackOrganic': 'オーガニック（アコースティック）',
    'settings.soundPackSynth': 'シンセサイザー（エレクトロニック）',
    'settings.soundPackClockwork': 'クロックワーク（機械音）',
    'audioPack.downloading': 'サウンドパックをダウンロード中...',
    'audioPack.downloadProgress': '{pack} をダウンロード中: {percent}%',
    'audioPack.downloadComplete': 'ダウンロード完了！',
    'audioPack.downloadFailed': 'サウンドパックのダウンロードに失敗しました。接続環境をご確認ください。',
    keyCollected: '鍵を入手しました！ゲートが開きました、出口へ向かってください。',
  },
  de: {
    appTitle: 'Maze Daily',
    dayLabel: 'Tag',
    timer: 'Zeit',
    pb: 'Bestzeit',
    restart: 'Neustart',
    splitsTitle: 'Zwischenzeiten',
    split25: '25% Strecke',
    split50: '50% Strecke',
    split75: '75% Strecke',
    splitFinish: 'Ziel',
    notReached: '--:--.--',
    settings: 'Einstellungen',
    stats: 'Statistiken',
    help: 'Spielanleitung',
    share: 'Teilen',
    copied: 'In Zwischenablage kopiert!',
    theme: 'Design',
    darkTheme: 'Dunkel',
    lightTheme: 'Hell',
    language: 'Sprache',
    fireflyColor: 'Glühwürmchen-Farbe',
    showSplits: 'Zwischenzeiten anzeigen',
    showControls: 'Steuerungshilfe anzeigen',
    controlsTitle: 'Steuerung',
    keyboard: 'Tastatur',
    touchJoystick: 'Touch / Virtueller Joystick',
    selectDay: 'Tag auswählen:',
    runsCount: 'Läufe',
    today: 'Heute',
    splitsDesc: 'Passiere die Kontrollpunkte (25%, 50%, 75%) der Reihe nach und jage deine Bestzeit!',
    close: 'Schließen',
    todayModifier: 'Heutiger Modifikator',
    desktopControls: 'Nutze WASD oder die Pfeiltasten zur flüssigen Steuerung.',
    mobileControls: 'Nutze den virtuellen Joystick am unteren Bildschirmrand.',
    winTitle: 'Labyrinth gelöst!',
    newPB: 'NEUE PERSÖNLICHE BESTZEIT!',
    totalRuns: 'Gesamte Versuche heute',
    bestTime: 'Beste Zeit',
    historyTitle: 'Heutige Läufe',
    replayTitle: 'Lauf-Wiederholung',
    privacyNote: 'Läuft nur im Browser. Keine Tracking-Cookies. Lokal gespeichert.',
    effects: {
      none: { name: 'Klassisch', desc: 'Reiner Speedrun ohne Modifikatoren.' },
      fog_of_war: { name: 'Nebel des Krieges', desc: 'Sicht ist auf einen Radius um das Glühwürmchen begrenzt.' },
      ice: { name: 'Eis', desc: 'Rutschiger Boden mit Gleitträgheit.' },
      fake_exits: { name: 'Falsche Ausgänge', desc: '3 von 4 Ausgängen sind Täuschungen! Finde den echten.' },
      wobbly_walls: { name: 'Wellenförmige Wände', desc: 'Organische Höhlenwände mit geschwungenen Linien.' },
      portals: { name: 'Portale', desc: 'Wurmlöcher, die zwei Gänge miteinander verbinden.' },
      key_and_gate: { name: 'Schlüssel & Tor', desc: 'Ausgang ist blockiert, bis der goldene Schlüssel gefunden wird.' },
      inversion: { name: 'Inversion', desc: 'Steuerung ist spiegelverkehrt!' },
      switches_and_barriers: { name: 'Schalter', desc: 'Schaltet Barrieren um.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Barrierefreiheit',
    headTracking: 'Kopfbewegungssteuerung',
    headTrackingDesc: 'Steuere das Glühwürmchen durch feine Kopfbewegungen über die Webcam.',
    headTrackingRecalibrate: 'Neu kalibrieren',
    audioNav: 'Audionavigation',
    audioNavDesc: 'Stereo-Zielsignal und dynamische Mehrspur-Musik für barrierefreies Spielen.',
    audioNavVolume: 'Audionavigations-Lautstärke',
    audioNavHotkeys: 'Lautstärke-Hotkeys: [ / ] oder - / + (5%-Schritte), M für Stummschaltung.',

    // Download Progress Modal
    downloadingTitle: 'Barrierefreiheits-Ressourcen werden heruntergeladen',
    downloadingProgress: '{module} wird heruntergeladen: {percent}%',
    downloadComplete: 'Download abgeschlossen!',
    downloadFailed: 'Fehler beim Herunterladen der Moduldateien. Bitte Internetverbindung prüfen.',

    // Calibration Modal
    calibrationTitle: 'Kopfbewegung-Kalibrierung',
    calibrationPrompt: 'Blicke geradeaus auf die Bildschirmmitte und halte still.',
    calibrationCountdown: 'Kalibrierung in {seconds} s...',
    calibrationSuccess: 'Kalibrierung erfolgreich! Kopfbewegungssteuerung aktiv.',

    // Camera Error Modal
    cameraErrorTitle: 'Kamerazugriff erforderlich',
    cameraDenied: 'Der Kamerazugriff wurde verweigert. Bitte erlaube den Kamerazugriff im Browser, um die Kopfbewegung zu aktivieren.',
    cameraNotFound: 'Es wurde keine Kamera erkannt. Bitte Webcam anschließen oder Tastatur/Touch nutzen.',
    cameraGenericError: 'Videostream der Kamera konnte nicht gestartet werden. Bitte Einstellungen prüfen und erneut versuchen.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Audionavigation stummgeschaltet',
    audioNavStatusUnmuted: 'Audionavigation Stummschaltung aufgehoben',
    audioNavVolumeChanged: 'Lautstärke {percent}%',
    audioFallbackNotice: 'Audiospuren nicht verfügbar, harmonische Synthese-Alternative aktiv.',

    // Additional Remediated Keys
    calibrationTimeout: 'Kalibrierung abgelaufen. Möglicherweise ist das Licht unzureichend oder dein Gesicht ist nicht sichtbar. Bitte zentriere dein Gesicht und versuche es erneut.',
    calibrationRetry: 'Wiederholen',
    cancel: 'Abbrechen',
    muted: 'Stummgeschaltet',
    unmute: 'Audionavigation laut schalten',
    mute: 'Audionavigation stummschalten',
    alternativeControls: 'Alternative Steuerung verfügbar',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Sound-Paket',
    soundPackDesc: 'Wähle ein dynamisches Mehrspur-Audiothema für die Navigation.',
    soundPackClassic: 'Klassisch (Orchester)',
    soundPackOrganic: 'Organisch (Akustisch)',
    soundPackSynth: 'Synthesizer (Elektronisch)',
    soundPackClockwork: 'Uhrwerk (Mechanisch)',
    audioPackClassic: 'Klassisch (Orchester)',
    audioPackOrganic: 'Organisch (Akustisch)',
    audioPackSynth: 'Synthesizer (Elektronisch)',
    audioPackClockwork: 'Uhrwerk (Mechanisch)',
    audioPackDownloading: 'Sound-Paket wird heruntergeladen...',
    audioPackDownloadProgress: '{pack} wird heruntergeladen: {percent}%',
    audioPackDownloadComplete: 'Download abgeschlossen!',
    audioPackDownloadFailed: 'Fehler beim Herunterladen des Sound-Pakets. Bitte Internetverbindung prüfen.',
    'settings.soundPack': 'Sound-Paket',
    'settings.soundPackDesc': 'Wähle ein dynamisches Mehrspur-Audiothema für die Navigation.',
    'settings.soundPackClassic': 'Klassisch (Orchester)',
    'settings.soundPackOrganic': 'Organisch (Akustisch)',
    'settings.soundPackSynth': 'Synthesizer (Elektronisch)',
    'settings.soundPackClockwork': 'Uhrwerk (Mechanisch)',
    'audioPack.downloading': 'Sound-Paket wird heruntergeladen...',
    'audioPack.downloadProgress': '{pack} wird heruntergeladen: {percent}%',
    'audioPack.downloadComplete': 'Download abgeschlossen!',
    'audioPack.downloadFailed': 'Fehler beim Herunterladen des Sound-Pakets. Bitte Internetverbindung prüfen.',
    keyCollected: 'Schlüssel gesammelt! Das Tor ist offen, gehe zum Ausgang.',
  },
  tr: {
    appTitle: 'Maze Daily',
    dayLabel: 'Gün',
    timer: 'Süre',
    pb: 'En İyi',
    restart: 'Yeniden Başlat',
    splitsTitle: 'Ara Süreler',
    split25: '%25 Yol',
    split50: '%50 Yol',
    split75: '%75 Yol',
    splitFinish: 'Bitiş',
    notReached: '--:--.--',
    settings: 'Ayarlar',
    stats: 'İstatistikler',
    help: 'Nasıl Oynanır',
    share: 'Paylaş',
    copied: 'Panoya kopyalandı!',
    theme: 'Tema',
    darkTheme: 'Koyu',
    lightTheme: 'Açık',
    language: 'Dil',
    fireflyColor: 'Ateşböceği Rengi',
    showSplits: 'Ara Süreleri Göster',
    showControls: 'Kontrol Kılavuzunu Göster',
    controlsTitle: 'Kontroller',
    keyboard: 'Klavye',
    touchJoystick: 'Dokunmatik / Sanal Joystick',
    selectDay: 'Gün Seçin:',
    runsCount: 'koşu',
    today: 'Bugün',
    splitsDesc: 'Kontrol noktalarından (%25, %50, %75) sırayla geçin ve kişisel rekorunuzu kırın!',
    close: 'Kapat',
    todayModifier: 'Günün Modifikatörü',
    desktopControls: 'Akıcı hareket için WASD veya Ok tuşlarını kullanın.',
    mobileControls: 'Gezinmek için ekrandaki joysticki kullanın.',
    winTitle: 'Labirent Tamamlandı!',
    newPB: 'YENİ KİŞİSEL REKOR!',
    totalRuns: 'Bugünkü Toplam Deneme',
    bestTime: 'En İyi Süre',
    historyTitle: 'Bugünkü Koşular',
    replayTitle: 'Koşu Rotası Tekrarı',
    privacyNote: 'Yalnızca tarayıcıda çalışır. Takip çerezleri yoktur. Yerel olarak saklanır.',
    effects: {
      none: { name: 'Klasik', desc: 'Modifikatörsüz saf hız koşusu.' },
      fog_of_war: { name: 'Savaş Sisi', desc: 'Görüş açısı ateşböceğinin çevresiyle sınırlıdır.' },
      ice: { name: 'Buz', desc: 'Kayma eylemsizliğine sahip kaygan zemin.' },
      fake_exits: { name: 'Sahte Çıkışlar', desc: '4 çıkıştan 3 tanesi sahte! Gerçek olanı bulun.' },
      wobbly_walls: { name: 'Dalgalı Duvarlar', desc: 'Kıvrımlı hatlara sahip organik mağara duvarları.' },
      portals: { name: 'Portallar', desc: 'İki koridoru birbirine bağlayan solucan delikleri.' },
      key_and_gate: { name: 'Anahtar ve Kapı', desc: 'Altın anahtar alınana kadar çıkış kilitlidir.' },
      inversion: { name: 'Ters Kontrol', desc: 'Yön kontrolleri ters çevrilmiştir!' },
      switches_and_barriers: { name: 'Şalterler', desc: 'Bariyer kapılarını değiştirir.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Erişilebilirlik',
    headTracking: 'Baş Takibi',
    headTrackingDesc: 'Web kamerasıyla hafif baş hareketlerinizi algılayarak ateşböceğini kontrol edin.',
    headTrackingRecalibrate: 'Yeniden Kalibre Et',
    audioNav: 'Sesli Navigasyon',
    audioNavDesc: 'Görme engelli oyuncular için stereo çıkış sinyali ve dinamik çoklu müzik kanalları.',
    audioNavVolume: 'Sesli Navigasyon Ses Düzeyi',
    audioNavHotkeys: 'Ses kısayolları: [ / ] veya - / + (%5 adım), M ile sessize al.',

    // Download Progress Modal
    downloadingTitle: 'Erişilebilirlik Dosyaları İndiriliyor',
    downloadingProgress: '{module} indiriliyor: %{percent}',
    downloadComplete: 'İndirme tamamlandı!',
    downloadFailed: 'Modül dosyaları indirilemedi. Lütfen internet bağlantınızı kontrol edin.',

    // Calibration Modal
    calibrationTitle: 'Baş Takibi Kalibrasyonu',
    calibrationPrompt: 'Ekranın tam ortasına bakın ve hareketsiz durun.',
    calibrationCountdown: '{seconds} saniye içinde kalibre ediliyor...',
    calibrationSuccess: 'Kalibrasyon başarılı! Baş takibi etkinleştirildi.',

    // Camera Error Modal
    cameraErrorTitle: 'Kamera Erişimi Gerekli',
    cameraDenied: 'Kamera erişimi reddedildi. Baş takibini etkinleştirmek için tarayıcınızdan kamera izni verin.',
    cameraNotFound: 'Bu cihazda kamera algılanamadı. Lütfen bir web kamerası bağlayın veya klavye/dokunmatik kontrolleri kullanın.',
    cameraGenericError: 'Kamera akışı başlatılamadı. Lütfen kamera ayarlarınızı kontrol edip tekrar deneyin.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Sesli navigasyon sessize alındı',
    audioNavStatusUnmuted: 'Sesli navigasyon sesi açıldı',
    audioNavVolumeChanged: 'Ses düzeyi %{percent}',
    audioFallbackNotice: 'Ses kanalları yüklenemedi, sentezlenmiş armonik sesler devrede.',

    // Additional Remediated Keys
    calibrationTimeout: 'Kalibrasyon zaman aşımına uğradı. Işık yetersiz olabilir veya yüzünüz algılanamadı. Lütfen yüzünüzü ortalayın ve tekrar deneyin.',
    calibrationRetry: 'Tekrar Dene',
    cancel: 'İptal',
    muted: 'Sessiz',
    unmute: 'Sesli navigasyonun sesini aç',
    mute: 'Sesli navigasyonu sessize al',
    alternativeControls: 'Alternatif Kontroller Mevcut',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Ses Paketi',
    soundPackDesc: 'Navigasyon için dinamik çok kanallı ses temasını seçin.',
    soundPackClassic: 'Klasik (Orkestra)',
    soundPackOrganic: 'Organik (Akustik)',
    soundPackSynth: 'Sentezleyici (Elektronik)',
    soundPackClockwork: 'Saat Mekanizması (Mekanik)',
    audioPackClassic: 'Klasik (Orkestra)',
    audioPackOrganic: 'Organik (Akustik)',
    audioPackSynth: 'Sentezleyici (Elektronik)',
    audioPackClockwork: 'Saat Mekanizması (Mekanik)',
    audioPackDownloading: 'Ses Paketi İndiriliyor...',
    audioPackDownloadProgress: '{pack} indiriliyor: %{percent}',
    audioPackDownloadComplete: 'İndirme tamamlandı!',
    audioPackDownloadFailed: 'Ses paketi indirilemedi. Lütfen internet bağlantınızı kontrol edin.',
    'settings.soundPack': 'Ses Paketi',
    'settings.soundPackDesc': 'Navigasyon için dinamik çok kanallı ses temasını seçin.',
    'settings.soundPackClassic': 'Klasik (Orkestra)',
    'settings.soundPackOrganic': 'Organik (Akustik)',
    'settings.soundPackSynth': 'Sentezleyici (Elektronik)',
    'settings.soundPackClockwork': 'Saat Mekanizması (Mekanik)',
    'audioPack.downloading': 'Ses Paketi İndiriliyor...',
    'audioPack.downloadProgress': '{pack} indiriliyor: %{percent}',
    'audioPack.downloadComplete': 'İndirme tamamlandı!',
    'audioPack.downloadFailed': 'Ses paketi indirilemedi. Lütfen internet bağlantınızı kontrol edin.',
    keyCollected: 'Anahtar alındı! Kapı açıldı, çıkışa doğru ilerleyin.',
  },
  pt: {
    appTitle: 'Maze Daily',
    dayLabel: 'Dia',
    timer: 'Tempo',
    pb: 'Recorde',
    restart: 'Reiniciar',
    splitsTitle: 'Tempos Parciais',
    split25: '25% do percurso',
    split50: '50% do percurso',
    split75: '75% do percurso',
    splitFinish: 'Chegada',
    notReached: '--:--.--',
    settings: 'Configurações',
    stats: 'Estatísticas',
    help: 'Como Jogar',
    share: 'Compartilhar',
    copied: 'Copiado para a área de transferência!',
    theme: 'Tema',
    darkTheme: 'Escuro',
    lightTheme: 'Claro',
    language: 'Idioma',
    fireflyColor: 'Cor do Vagalume',
    showSplits: 'Mostrar Parciais',
    showControls: 'Mostrar Guia de Controles',
    controlsTitle: 'Controles',
    keyboard: 'Teclado',
    touchJoystick: 'Toque / Joystick Virtual',
    selectDay: 'Selecionar dia:',
    runsCount: 'corridas',
    today: 'Hoje',
    splitsDesc: 'Passe pelos pontos de controle (25%, 50%, 75%) em ordem para superar seu recorde!',
    close: 'Fechar',
    todayModifier: 'Modificador de Hoje',
    desktopControls: 'Use as teclas WASD ou as setas para se mover com suavidade.',
    mobileControls: 'Use o joystick virtual na tela para navegar.',
    winTitle: 'Labirinto Concluído!',
    newPB: 'NOVO RECORDE PESSOAL!',
    totalRuns: 'Total de tentativas hoje',
    bestTime: 'Melhor Tempo',
    historyTitle: 'Corridas de hoje',
    replayTitle: 'Repetição do Percurso',
    privacyNote: 'Apenas no navegador. Sem cookies de rastreamento. Salvo localmente.',
    effects: {
      none: { name: 'Clássico', desc: 'Speedrun puro sem modificadores.' },
      fog_of_war: { name: 'Névoa de Guerra', desc: 'A visão é limitada a um raio ao redor do vagalume.' },
      ice: { name: 'Gelo', desc: 'Piso escorregadio com inércia de deslizamento.' },
      fake_exits: { name: 'Saídas Falsas', desc: '3 das 4 saídas são falsas! Encontre a verdadeira.' },
      wobbly_walls: { name: 'Paredes Onduladas', desc: 'Paredes orgânicas de caverna com linhas curvas.' },
      portals: { name: 'Portais', desc: 'Buracos de minhoca que conectam dois corredores.' },
      key_and_gate: { name: 'Chave e Portão', desc: 'A saída fica bloqueada até que a chave dourada seja obtida.' },
      inversion: { name: 'Inversão', desc: 'Os controles estão invertidos!' },
      switches_and_barriers: { name: 'Interruptores', desc: 'Alterna os portões de barreira.' },
    },
    // Accessibility Section & Toggles
    accessibility: 'Acessibilidade',
    headTracking: 'Rastreamento de Cabeça',
    headTrackingDesc: 'Controle o movimento do vagalume inclinando suavemente a cabeça diante da câmera.',
    headTrackingRecalibrate: 'Recalibrar',
    audioNav: 'Navegação por Áudio',
    audioNavDesc: 'Sinalizador estéreo de saída e camadas musicais dinâmicas para navegação às cegas.',
    audioNavVolume: 'Volume da Navegação por Áudio',
    audioNavHotkeys: 'Atalhos de volume: [ / ] ou - / + (passo de 5%), M para silenciar.',

    // Download Progress Modal
    downloadingTitle: 'Baixando Recursos de Acessibilidade',
    downloadingProgress: 'Baixando {module}: {percent}%',
    downloadComplete: 'Download concluído!',
    downloadFailed: 'Falha ao baixar recursos do módulo. Verifique sua conexão com a internet.',

    // Calibration Modal
    calibrationTitle: 'Calibração do Rastreamento de Cabeça',
    calibrationPrompt: 'Olhe fixamente para o centro da tela e permaneça imóvel.',
    calibrationCountdown: 'Calibrando em {seconds}s...',
    calibrationSuccess: 'Calibração concluída com sucesso! Rastreamento ativo.',

    // Camera Error Modal
    cameraErrorTitle: 'Acesso à Câmera Necessário',
    cameraDenied: 'O acesso à câmera foi negado. Conceda permissão de câmera no navegador para ativar o rastreamento.',
    cameraNotFound: 'Nenhuma câmera detectada neste dispositivo. Conecte uma webcam ou use o teclado/toque.',
    cameraGenericError: 'Não foi possível iniciar o vídeo da câmera. Verifique as configurações e tente novamente.',

    // Audio Navigation ARIA Announcements
    audioNavStatusMuted: 'Navegação por áudio silenciada',
    audioNavStatusUnmuted: 'Navegação por áudio com som ativado',
    audioNavVolumeChanged: 'Volume {percent}%',
    audioFallbackNotice: 'Faixas de áudio indisponíveis, usando harmonia sintetizada alternativa.',

    // Additional Remediated Keys
    calibrationTimeout: 'Tempo limite de calibração esgotado. A iluminação pode ser insuficiente ou seu rosto não está visível. Centralize o rosto e tente novamente.',
    calibrationRetry: 'Tentar novamente',
    cancel: 'Cancelar',
    muted: 'Mudo',
    unmute: 'Ativar som da navegação em áudio',
    mute: 'Silenciar navegação em áudio',
    alternativeControls: 'Controles alternativos disponíveis',

    // Dynamic Audio Packs (Sound Sets)
    soundPack: 'Pacote de Sons',
    soundPackDesc: 'Selecione o tema de áudio dinâmico para navegação.',
    soundPackClassic: 'Clássico (Orquestral)',
    soundPackOrganic: 'Orgânico (Acústico)',
    soundPackSynth: 'Sintetizador (Eletrônico)',
    soundPackClockwork: 'Engrenagem (Mecânico)',
    audioPackClassic: 'Clássico (Orquestral)',
    audioPackOrganic: 'Orgânico (Acústico)',
    audioPackSynth: 'Sintetizador (Eletrônico)',
    audioPackClockwork: 'Engrenagem (Mecânico)',
    audioPackDownloading: 'Baixando Pacote de Sons...',
    audioPackDownloadProgress: 'Baixando {pack}: {percent}%',
    audioPackDownloadComplete: 'Download concluído!',
    audioPackDownloadFailed: 'Falha ao baixar pacote de sons. Verifique sua conexão com a internet.',
    'settings.soundPack': 'Pacote de Sons',
    'settings.soundPackDesc': 'Selecione o tema de áudio dinâmico para navegação.',
    'settings.soundPackClassic': 'Clássico (Orquestral)',
    'settings.soundPackOrganic': 'Orgânico (Acústico)',
    'settings.soundPackSynth': 'Sintetizador (Eletrônico)',
    'settings.soundPackClockwork': 'Engrenagem (Mecânico)',
    'audioPack.downloading': 'Baixando Pacote de Sons...',
    'audioPack.downloadProgress': 'Baixando {pack}: {percent}%',
    'audioPack.downloadComplete': 'Download concluído!',
    'audioPack.downloadFailed': 'Falha ao baixar pacote de sons. Verifique sua conexão com a internet.',
    keyCollected: 'Chave coletada! O portão está aberto, vá para a saída.',
  },
};

export function formatTime(ms: number | null): string {
  if (ms === null) return '--:--.--';
  const totalSeconds = ms / 1000;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((ms % 1000) / 10);
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(hundredths).padStart(2, '0')}`;
}

export function formatDelta(current: number | null, pb: number | null): { text: string; isFaster: boolean } | null {
  if (current === null || pb === null) return null;
  const diff = current - pb;
  const isFaster = diff <= 0;
  const sign = isFaster ? '-' : '+';
  const absSec = (Math.abs(diff) / 1000).toFixed(2);
  return { text: `${sign}${absSec}s`, isFaster };
}

/**
 * Safely substitutes named placeholders like `{percent}`, `{seconds}`, `{module}`
 * in a localized template string.
 *
 * @param template The template string containing `{key}` tokens.
 * @param vars An object mapping token names to replacement strings or numbers.
 * @returns The formatted string with tokens replaced.
 */
export function formatString(
  template: string,
  vars: Record<string, string | number> = {}
): string {
  if (!template) return '';
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    const value = vars[key];
    return value !== undefined && value !== null ? String(value) : match;
  });
}

