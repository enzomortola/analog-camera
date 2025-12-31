// Analog Camera App
class AnalogCamera {
    constructor() {
        this.video = document.getElementById('videoElement');
        this.canvas = document.getElementById('previewCanvas');
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        this.captureBtn = document.getElementById('captureBtn');
        this.switchBtn = document.getElementById('switchCamera');
        this.galleryBtn = document.getElementById('galleryBtn');
        this.galleryModal = document.getElementById('galleryModal');
        this.galleryGrid = document.getElementById('galleryGrid');
        this.closeGalleryBtn = document.getElementById('closeGallery');
        this.flashEffect = document.getElementById('flashEffect');
        this.lightLeak = document.getElementById('lightLeak');
        this.dateStamp = document.getElementById('dateStamp');
        this.filmCounter = document.getElementById('filmCounter');

        this.currentFilter = 'kodak';
        this.currentRatio = localStorage.getItem('aspectRatio') || '3/2';
        this.currentMode = 'photo'; // 'photo' or 'video'
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.orientation = 'landscape';
        this.facingMode = 'environment';
        this.stream = null;
        this.photos = JSON.parse(localStorage.getItem('analogPhotos') || '[]');
        this.frameCount = parseInt(localStorage.getItem('filmCounter') || '36');

        // 🚀 OPTIMIZACIÓN: Detectar capacidad del dispositivo
        this.deviceTier = this.detectDeviceTier();
        this.useOptimizedPreview = this.deviceTier !== 'high'; // Solo high usa filtros JS en preview

        // Custom filter settings
        this.customSettings = JSON.parse(localStorage.getItem('customFilterSettings') || JSON.stringify({
            warmth: 0,
            contrast: 0,
            saturation: 0,
            brightness: 0,
            tint: 0,
            fade: 0,
            grain: 6,
            vignette: 0.25
        }));

        this.filters = {
            kodak: this.applyKodakPortra.bind(this),
            fuji: this.applyFuji400H.bind(this),
            cinestill: this.applyCineStill800T.bind(this),
            ilford: this.applyIlfordHP5.bind(this),
            agfa: this.applyAgfaVista.bind(this),
            lomography: this.applyLomoChrome.bind(this),
            custom: this.applyCustomFilter.bind(this)
        };

        // CSS filter equivalents para preview rápido
        this.cssFilters = {
            kodak: 'brightness(1.05) contrast(0.95) saturate(1.1) sepia(0.08)',
            fuji: 'brightness(1.03) contrast(1.0) saturate(0.95) hue-rotate(-5deg)',
            cinestill: 'brightness(1.0) contrast(1.15) saturate(1.05) hue-rotate(5deg)',
            ilford: 'grayscale(1) contrast(1.3) brightness(1.05) sepia(0.15)',
            agfa: 'brightness(1.0) contrast(1.2) saturate(1.3) hue-rotate(2deg)',
            lomography: 'brightness(1.05) contrast(1.35) saturate(1.4) hue-rotate(-10deg)',
            custom: 'brightness(1.0) contrast(1.0) saturate(1.0)'
        };

        this.init();
    }

    // 🚀 Detectar capacidad del dispositivo
    detectDeviceTier() {
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 4;
        const isMobile = /Android|iPhone|iPad/i.test(navigator.userAgent);

        // High: 8+ cores, 6+ GB RAM (S24, flagships)
        // Medium: 4-7 cores, 3-5 GB RAM (A24, mid-range)
        // Low: <4 cores, <3 GB RAM

        if (cores >= 8 && memory >= 6) return 'high';
        if (cores >= 4 && memory >= 3) return 'medium';
        return 'low';
    }

    async init() {
        this.updateDateStamp();
        this.updateFilmCounter();
        this.detectOrientation();
        this.setAspectRatio(this.currentRatio);
        this.bindEvents();
        await this.startCamera();
        this.startPreviewLoop();
    }

    bindEvents() {
        this.captureBtn.addEventListener('click', () => {
            if (this.currentMode === 'photo') {
                this.capturePhoto();
            } else {
                this.toggleRecording();
            }
        });

        const modeToggle = document.getElementById('modeToggle');
        if (modeToggle) {
            modeToggle.addEventListener('click', () => this.toggleMode());
        }

        this.switchBtn.addEventListener('click', () => this.switchCamera());
        this.galleryBtn.addEventListener('click', () => this.openGallery());
        this.closeGalleryBtn.addEventListener('click', () => this.closeGallery());

        // Settings panel
        const settingsBtn = document.getElementById('settingsBtn');
        const settingsPanel = document.getElementById('settingsPanel');
        const closeSettings = document.getElementById('closeSettings');

        if (settingsBtn && settingsPanel) {
            settingsBtn.addEventListener('click', () => {
                settingsPanel.classList.toggle('active');
            });
        }

        if (closeSettings && settingsPanel) {
            closeSettings.addEventListener('click', () => {
                settingsPanel.classList.remove('active');
            });
        }

        // Orientation change
        window.addEventListener('orientationchange', () => {
            setTimeout(() => {
                this.detectOrientation();
                this.updateCropFrame();
            }, 100);
        });

        window.addEventListener('resize', () => {
            this.detectOrientation();
            this.updateCropFrame();
        });

        // Filter buttons with mobile tooltip
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'show-tooltip'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;

                // 🚀 Aplicar CSS filter para preview optimizado
                if (this.useOptimizedPreview) {
                    this.canvas.style.filter = this.cssFilters[this.currentFilter];
                }

                // Show custom panel if custom filter
                if (this.currentFilter === 'custom') {
                    document.getElementById('customControls').classList.add('active');
                } else {
                    document.getElementById('customControls').classList.remove('active');
                }

                // Mobile tooltip - show and auto-hide after 1s
                e.target.classList.add('show-tooltip');
                setTimeout(() => {
                    e.target.classList.remove('show-tooltip');
                }, 1000);
            });
        });

        // Ratio buttons
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.ratio-btn').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                const ratio = e.target.dataset.ratio;
                this.setAspectRatio(ratio);
                this.updateCropFrame(); // Actualizar frame al cambiar ratio
            });
        });

        // Custom controls
        this.setupCustomControls();

        // Clear cache button
        const clearCacheBtn = document.getElementById('clearCacheBtn');
        if (clearCacheBtn) {
            clearCacheBtn.addEventListener('click', () => this.clearCache());
        }

        // Close gallery on escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') this.closeGallery();
        });
    }

    setupCustomControls() {
        const customControls = document.getElementById('customControls');
        const closeBtn = document.getElementById('closeCustom');
        const resetBtn = document.getElementById('resetCustom');

        closeBtn.addEventListener('click', () => {
            customControls.classList.remove('active');
        });

        // Setup all sliders
        ['warmth', 'contrast', 'saturation', 'brightness', 'tint', 'fade'].forEach(param => {
            const slider = document.getElementById(param);
            const valueSpan = document.getElementById(`${param}Value`);

            // Load saved value
            slider.value = this.customSettings[param];
            valueSpan.textContent = this.customSettings[param];

            slider.addEventListener('input', (e) => {
                this.customSettings[param] = parseInt(e.target.value);
                valueSpan.textContent = e.target.value;
                localStorage.setItem('customFilterSettings', JSON.stringify(this.customSettings));
            });
        });

        // Grain slider
        const grainSlider = document.getElementById('grainIntensity');
        const grainValue = document.getElementById('grainValue');
        grainSlider.value = this.customSettings.grain;
        grainValue.textContent = this.customSettings.grain;
        grainSlider.addEventListener('input', (e) => {
            this.customSettings.grain = parseInt(e.target.value);
            grainValue.textContent = e.target.value;
            localStorage.setItem('customFilterSettings', JSON.stringify(this.customSettings));
        });

        // Vignette slider (0-100 → 0-1)
        const vignetteSlider = document.getElementById('vignetteIntensity');
        const vignetteValue = document.getElementById('vignetteValue');
        vignetteSlider.value = this.customSettings.vignette * 100;
        vignetteValue.textContent = this.customSettings.vignette.toFixed(2);
        vignetteSlider.addEventListener('input', (e) => {
            this.customSettings.vignette = parseInt(e.target.value) / 100;
            vignetteValue.textContent = (parseInt(e.target.value) / 100).toFixed(2);
            localStorage.setItem('customFilterSettings', JSON.stringify(this.customSettings));
        });

        resetBtn.addEventListener('click', () => {
            ['warmth', 'contrast', 'saturation', 'brightness', 'tint', 'fade'].forEach(param => {
                this.customSettings[param] = 0;
                document.getElementById(param).value = 0;
                document.getElementById(`${param}Value`).textContent = '0';
            });

            // Reset grain
            this.customSettings.grain = 6;
            grainSlider.value = 6;
            grainValue.textContent = '6';

            // Reset vignette
            this.customSettings.vignette = 0.25;
            vignetteSlider.value = 25;
            vignetteValue.textContent = '0.25';

            localStorage.setItem('customSettings', JSON.stringify(this.customSettings));
        });
    }

    setAspectRatio(ratio) {
        this.currentRatio = ratio;
        const container = document.getElementById('cameraContainer');
        container.setAttribute('data-ratio', ratio);
        localStorage.setItem('aspectRatio', ratio);

        // Update active button
        document.querySelectorAll('.ratio-btn').forEach(btn => {
            if (btn.dataset.ratio === ratio) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
    }

    detectOrientation() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.orientation = height > width ? 'portrait' : 'landscape';
        this.updateCropFrame();
    }

    updateCropFrame() {
        const container = document.getElementById('cameraContainer');
        const overlayTop = document.querySelector('.crop-overlay-top');
        const overlayBottom = document.querySelector('.crop-overlay-bottom');
        const overlayLeft = document.querySelector('.crop-overlay-left');
        const overlayRight = document.querySelector('.crop-overlay-right');

        if (!container || !overlayTop) return;

        const containerWidth = window.innerWidth;
        const containerHeight = window.innerHeight;

        const ratios = {
            '3/2': 3 / 2,
            '4/3': 4 / 3,
            '1/1': 1,
            '16/9': 16 / 9
        };

        let targetRatio = ratios[this.currentRatio];

        // Invertir ratio si está en portrait
        if (this.orientation === 'portrait' && this.currentRatio !== '1/1') {
            targetRatio = 1 / targetRatio;
        }

        const containerRatio = containerWidth / containerHeight;

        // Calcular dimensiones del área visible (donde NO hay overlays)
        let visibleWidth, visibleHeight;
        let offsetTop = 0, offsetBottom = 0, offsetLeft = 0, offsetRight = 0;

        if (containerRatio > targetRatio) {
            // Container más ancho que el ratio objetivo
            // → Overlays a los lados (left/right)
            visibleHeight = containerHeight;
            visibleWidth = visibleHeight * targetRatio;

            const totalHorizontalBlack = containerWidth - visibleWidth;
            offsetLeft = totalHorizontalBlack / 2;
            offsetRight = totalHorizontalBlack / 2;

            overlayTop.style.height = '0';
            overlayBottom.style.height = '0';
            overlayLeft.style.width = `${offsetLeft}px`;
            overlayRight.style.width = `${offsetRight}px`;
        } else {
            // Container más alto que el ratio objetivo
            // → Overlays arriba/abajo (top/bottom)
            visibleWidth = containerWidth;
            visibleHeight = visibleWidth / targetRatio;

            const totalVerticalBlack = containerHeight - visibleHeight;
            offsetTop = totalVerticalBlack / 2;
            offsetBottom = totalVerticalBlack / 2;

            overlayTop.style.height = `${offsetTop}px`;
            overlayBottom.style.height = `${offsetBottom}px`;
            overlayLeft.style.width = '0';
            overlayRight.style.width = '0';
        }

        // Guardar dimensiones para usar en capturePhoto
        this.cropFrameDimensions = {
            width: visibleWidth,
            height: visibleHeight,
            containerWidth: containerWidth,
            containerHeight: containerHeight,
            targetRatio: targetRatio
        };
    }

    toggleMode() {
        const modeToggle = document.getElementById('modeToggle');
        const modeIcon = modeToggle.querySelector('.mode-icon');

        if (this.currentMode === 'photo') {
            this.currentMode = 'video';
            modeToggle.classList.add('video-mode');
            modeIcon.textContent = '🎥';
        } else {
            this.currentMode = 'photo';
            modeToggle.classList.remove('video-mode');
            modeIcon.textContent = '📷';
        }
    }

    async startCamera() {
        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            // 🚀 Ajustar resolución según dispositivo
            let targetWidth, targetHeight;

            if (this.deviceTier === 'high') {
                targetWidth = 1920;
                targetHeight = 1080;
            } else if (this.deviceTier === 'medium') {
                targetWidth = 1280; // 📱 A24: resolución reducida
                targetHeight = 720;
            } else {
                targetWidth = 960;
                targetHeight = 540;
            }

            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: targetWidth },
                    height: { ideal: targetHeight }
                },
                audio: false
            };

            this.stream = await navigator.mediaDevices.getUserMedia(constraints);
            this.video.srcObject = this.stream;

            // Update video transform based on camera
            this.video.style.transform = this.facingMode === 'user' ? 'scaleX(-1)' : 'scaleX(1)';

        } catch (err) {
            console.error('Error accessing camera:', err);
            alert('No se pudo acceder a la cámara. Por favor, permite el acceso.');
        }
    }

    async switchCamera() {
        this.facingMode = this.facingMode === 'environment' ? 'user' : 'environment';
        await this.startCamera();
    }

    startPreviewLoop() {
        const loop = () => {
            if (this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
                // Usar dimensiones del frame si están disponibles
                if (this.cropFrameDimensions) {
                    const scaleX = this.video.videoWidth / this.cropFrameDimensions.containerWidth;
                    const scaleY = this.video.videoHeight / this.cropFrameDimensions.containerHeight;

                    // Canvas con las dimensiones exactas del frame visual
                    const canvasWidth = this.cropFrameDimensions.width * scaleX;
                    const canvasHeight = this.cropFrameDimensions.height * scaleY;

                    this.canvas.width = canvasWidth;
                    this.canvas.height = canvasHeight;

                    // Calcular qué porción del video dibujar (centrado)
                    const sourceX = (this.video.videoWidth - canvasWidth) / 2;
                    const sourceY = (this.video.videoHeight - canvasHeight) / 2;

                    // Dibujar solo la porción visible
                    this.ctx.save();
                    if (this.facingMode === 'user') {
                        this.ctx.scale(-1, 1);
                        this.ctx.drawImage(
                            this.video,
                            sourceX, sourceY, canvasWidth, canvasHeight,
                            -canvasWidth, 0, canvasWidth, canvasHeight
                        );
                    } else {
                        this.ctx.drawImage(
                            this.video,
                            sourceX, sourceY, canvasWidth, canvasHeight,
                            0, 0, canvasWidth, canvasHeight
                        );
                    }
                    this.ctx.restore();
                } else {
                    // Fallback: canvas completo
                    this.canvas.width = this.video.videoWidth;
                    this.canvas.height = this.video.videoHeight;

                    this.ctx.save();
                    if (this.facingMode === 'user') {
                        this.ctx.scale(-1, 1);
                        this.ctx.drawImage(this.video, -this.canvas.width, 0);
                    } else {
                        this.ctx.drawImage(this.video, 0, 0);
                    }
                    this.ctx.restore();
                }

                // 🚀 OPTIMIZACIÓN CRÍTICA: CSS filters para preview (3-5x más rápido)
                // Solo aplicar filtros JS al capturar, no en preview
                if (!this.useOptimizedPreview) {
                    // Dispositivos high-end: filtros JS en preview
                    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                    this.filters[this.currentFilter](imageData);
                    this.ctx.putImageData(imageData, 0, 0);
                } // Dispositivos low/mid: filtros CSS (aplicados en cambio de filtro)
            }
            requestAnimationFrame(loop);
        };
        loop();
    }

    // Film emulation filters - BALANCEADOS (fieles a películas reales)
    applyKodakPortra(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Tonos cálidos peachy característicos
            r = Math.min(255, r * 1.12);
            g = Math.min(255, g * 1.04);
            b = b * 0.92;

            // Negros suaves (faded blacks)
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luma < 120) {
                r = r + (255 - r) * 0.10;
                g = g + (255 - g) * 0.09;
                b = b + (255 - b) * 0.08;
            }

            // Contraste suave pero presente
            r = ((r / 255 - 0.5) * 0.90 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 0.90 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 0.90 + 0.5) * 255;

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    applyFuji400H(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // Tonos fríos cyan/teal moderados
            if (luma > 170) {
                // Cielos - tinte cyan
                b = Math.min(255, b * 1.15);
                g = Math.min(255, g * 1.08);
                r = r * 0.93;
            } else if (luma < 90) {
                // Sombras - verde/cyan
                g = Math.min(255, g * 1.10);
                b = Math.min(255, b * 1.12);
            }

            // Verdes en medios tonos
            if (luma > 90 && luma < 170) {
                g = Math.min(255, g * 1.06);
            }

            // Negros levantados
            r = r + (255 - r) * 0.07;
            g = g + (255 - g) * 0.08;
            b = b + (255 - b) * 0.10;

            // Contraste medio
            r = ((r / 255 - 0.5) * 1.00 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.00 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.00 + 0.5) * 255;

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    applyCineStill800T(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // Look cinematográfico con shift tungsten moderado
            if (luma < 100) {
                // Sombras azules
                b = Math.min(255, b * 1.20);
                g = Math.min(255, g * 1.08);
                r = r * 0.90;
            } else if (luma > 170) {
                // Highlights cálidos
                r = Math.min(255, r * 1.15);
                g = Math.min(255, g * 1.05);
            }

            // Halación roja sutil en áreas brillantes
            if (luma > 200) {
                r = Math.min(255, r * 1.18);
            }

            // Contraste cinematográfico
            r = ((r / 255 - 0.5) * 1.15 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.15 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.15 + 0.5) * 255;

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    applyIlfordHP5(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // B&W con alto contraste
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Alto contraste característico
            gray = ((gray / 255 - 0.5) * 1.30 + 0.5) * 255;
            gray = Math.max(0, Math.min(255, gray));

            // Tono sepia cálido sutil
            data[i] = Math.min(255, gray * 1.06);
            data[i + 1] = Math.min(255, gray * 1.01);
            data[i + 2] = gray * 0.90;
        }
    }

    applyAgfaVista(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // Colores saturados y punchy
            const avg = (r + g + b) / 3;
            r = r * 1.25 - avg * 0.25;
            g = g * 1.20 - avg * 0.20;
            b = b * 1.15 - avg * 0.15;

            // Naranja/amarillo en highlights
            if (luma > 130) {
                r = Math.min(255, r * 1.12);
                g = Math.min(255, g * 1.08);
                b = b * 0.90;
            }

            // Verde en sombras
            if (luma < 90) {
                g = Math.min(255, g * 1.10);
            }

            // Contraste punchy
            r = ((r / 255 - 0.5) * 1.18 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.18 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.18 + 0.5) * 255;

            // Lift shadows leve
            r = r + (255 - r) * 0.05;
            g = g + (255 - g) * 0.04;
            b = b + (255 - b) * 0.03;

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    applyLomoChrome(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Cross-process moderado - mezcla de canales
            const newR = r * 0.6 + g * 0.3 + b * 0.1;
            const newG = r * 0.2 + g * 0.5 + b * 0.3;
            const newB = r * 0.3 + g * 0.2 + b * 0.5;

            // Tinte magenta/púrpura
            r = Math.min(255, newR * 1.15);
            g = newG * 0.90;
            b = Math.min(255, newB * 1.20);

            // Alto contraste y saturación
            r = ((r / 255 - 0.5) * 1.35 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.35 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.35 + 0.5) * 255;

            // Negros faded
            r = r + (255 - r) * 0.10;
            g = g + (255 - g) * 0.08;
            b = b + (255 - b) * 0.12;

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    applyCustomFilter(imageData) {
        const data = imageData.data;
        const settings = this.customSettings;

        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Brightness
            if (settings.brightness !== 0) {
                const brightFactor = settings.brightness / 50 * 50;
                r += brightFactor;
                g += brightFactor;
                b += brightFactor;
            }

            // Warmth (red-blue shift)
            if (settings.warmth !== 0) {
                const warmFactor = settings.warmth / 50;
                r = r * (1 + warmFactor * 0.3);
                b = b * (1 - warmFactor * 0.3);
            }

            // Tint (green-magenta shift)
            if (settings.tint !== 0) {
                const tintFactor = settings.tint / 50;
                if (tintFactor > 0) {
                    // More green
                    g = g * (1 + tintFactor * 0.3);
                } else {
                    // More magenta
                    r = r * (1 - tintFactor * 0.2);
                    b = b * (1 - tintFactor * 0.2);
                }
            }

            // Saturation
            if (settings.saturation !== 0) {
                const satFactor = 1 + (settings.saturation / 50);
                const avg = (r + g + b) / 3;
                r = avg + (r - avg) * satFactor;
                g = avg + (g - avg) * satFactor;
                b = avg + (b - avg) * satFactor;
            }

            // Contrast
            if (settings.contrast !== 0) {
                const contrastFactor = 1 + (settings.contrast / 50);
                r = ((r / 255 - 0.5) * contrastFactor + 0.5) * 255;
                g = ((g / 255 - 0.5) * contrastFactor + 0.5) * 255;
                b = ((b / 255 - 0.5) * contrastFactor + 0.5) * 255;
            }

            // Fade (lifted shadows)
            if (settings.fade > 0) {
                const fadeFactor = settings.fade / 50;
                const luma = 0.299 * r + 0.587 * g + 0.114 * b;
                if (luma < 128) {
                    r = r + (255 - r) * fadeFactor * 0.3;
                    g = g + (255 - g) * fadeFactor * 0.3;
                    b = b + (255 - b) * fadeFactor * 0.3;
                }
            }

            data[i] = Math.max(0, Math.min(255, r));
            data[i + 1] = Math.max(0, Math.min(255, g));
            data[i + 2] = Math.max(0, Math.min(255, b));
        }
    }

    capturePhoto() {
        // Flash effect
        this.flashEffect.classList.add('active');
        setTimeout(() => this.flashEffect.classList.remove('active'), 300);

        // Light leak effect
        this.lightLeak.classList.add('active');
        setTimeout(() => this.lightLeak.classList.remove('active'), 800);

        // Crear canvas para captura con filtros JS completos
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = this.canvas.width;
        captureCanvas.height = this.canvas.height;
        const captureCtx = captureCanvas.getContext('2d');

        // 🚀 Si usamos CSS filters en preview, capturar del video original y aplicar filtro JS
        if (this.useOptimizedPreview) {
            // Capturar frame actual del video sin filtros CSS
            if (this.cropFrameDimensions) {
                const scaleX = this.video.videoWidth / this.cropFrameDimensions.containerWidth;
                const scaleY = this.video.videoHeight / this.cropFrameDimensions.containerHeight;
                const canvasWidth = this.cropFrameDimensions.width * scaleX;
                const canvasHeight = this.cropFrameDimensions.height * scaleY;
                const sourceX = (this.video.videoWidth - canvasWidth) / 2;
                const sourceY = (this.video.videoHeight - canvasHeight) / 2;

                captureCtx.save();
                if (this.facingMode === 'user') {
                    captureCtx.scale(-1, 1);
                    captureCtx.drawImage(
                        this.video,
                        sourceX, sourceY, canvasWidth, canvasHeight,
                        -canvasWidth, 0, canvasWidth, canvasHeight
                    );
                } else {
                    captureCtx.drawImage(
                        this.video,
                        sourceX, sourceY, canvasWidth, canvasHeight,
                        0, 0, canvasWidth, canvasHeight
                    );
                }
                captureCtx.restore();
            } else {
                captureCtx.save();
                if (this.facingMode === 'user') {
                    captureCtx.scale(-1, 1);
                    captureCtx.drawImage(this.video, -captureCanvas.width, 0);
                } else {
                    captureCtx.drawImage(this.video, 0, 0);
                }
                captureCtx.restore();
            }

            // Aplicar filtro JS completo para calidad máxima
            const imageData = captureCtx.getImageData(0, 0, captureCanvas.width, captureCanvas.height);
            this.filters[this.currentFilter](imageData);
            captureCtx.putImageData(imageData, 0, 0);
        } else {
            // Dispositivos high-end: el canvas ya tiene el filtro aplicado
            captureCtx.drawImage(this.canvas, 0, 0);
        }

        // Add film grain overlay
        this.addFilmGrain(captureCtx, captureCanvas.width, captureCanvas.height);

        // Add vignette
        this.addVignette(captureCtx, captureCanvas.width, captureCanvas.height);

        // Add date stamp
        this.addDateStamp(captureCtx, captureCanvas.width, captureCanvas.height);

        // Save to array
        const imageData = captureCanvas.toDataURL('image/jpeg', 0.92);
        this.photos.unshift({
            id: Date.now(),
            data: imageData,
            filter: this.currentFilter,
            ratio: this.currentRatio,
            orientation: this.orientation, // Guardar orientación de captura
            date: new Date().toISOString()
        });

        // Keep only last 50 photos to save storage
        if (this.photos.length > 50) {
            this.photos = this.photos.slice(0, 50);
        }

        localStorage.setItem('analogPhotos', JSON.stringify(this.photos));

        // Update film counter
        this.frameCount--;
        if (this.frameCount <= 0) this.frameCount = 36;
        localStorage.setItem('filmCounter', this.frameCount.toString());
        this.updateFilmCounter();

        // Haptic feedback if available
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
    }

    async toggleRecording() {
        if (!this.isRecording) {
            // Iniciar grabación
            this.recordedChunks = [];

            try {
                // Capturar del canvas filtrado, no del stream original
                const canvasStream = this.canvas.captureStream(30); // 30 FPS

                const options = { mimeType: 'video/webm;codecs=vp9' };
                if (!MediaRecorder.isTypeSupported(options.mimeType)) {
                    options.mimeType = 'video/webm';
                }

                this.mediaRecorder = new MediaRecorder(canvasStream, options);

                this.mediaRecorder.ondataavailable = (event) => {
                    if (event.data.size > 0) {
                        this.recordedChunks.push(event.data);
                    }
                };

                this.mediaRecorder.onstop = () => {
                    this.saveVideo();
                };

                this.mediaRecorder.start(100);
                this.isRecording = true;

                // Cambiar apariencia del botón
                const shutterInner = document.querySelector('.shutter-inner');
                shutterInner.style.background = 'var(--accent-red)';
                shutterInner.style.borderRadius = '8px';

                // Light leak continuo mientras graba
                this.lightLeak.classList.add('active');

            } catch (err) {
                console.error('Error al iniciar grabación:', err);
                alert('No se pudo iniciar la grabación de video');
            }
        } else {
            // Det ener grabación
            if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
                this.mediaRecorder.stop();
            }
            this.isRecording = false;

            // Restaurar apariencia del botón
            const shutterInner = document.querySelector('.shutter-inner');
            shutterInner.style.background = 'var(--text-light)';
            shutterInner.style.borderRadius = '50%';

            this.lightLeak.classList.remove('active');

            // Actualizar contador
            this.frameCount--;
            if (this.frameCount <= 0) this.frameCount = 36;
            localStorage.setItem('filmCounter', this.frameCount.toString());
            this.updateFilmCounter();
        }
    }

    saveVideo() {
        const blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        const videoURL = URL.createObjectURL(blob);

        this.photos.unshift({
            id: Date.now(),
            data: videoURL,
            isVideo: true,
            filter: this.currentFilter,
            ratio: this.currentRatio,
            date: new Date().toISOString()
        });

        if (this.photos.length > 50) {
            this.photos = this.photos.slice(0, 50);
        }

        localStorage.setItem('analogPhotos', JSON.stringify(this.photos));

        if (navigator.vibrate) {
            navigator.vibrate([50, 50, 50]);
        }
    }

    addFilmGrain(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        // Usa grain del custom settings
        const grainIntensity = this.currentFilter === 'custom' ? this.customSettings.grain : 6;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * grainIntensity;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        ctx.putImageData(imageData, 0, 0);
    }

    addVignette(ctx, width, height) {
        // Usa vignette del custom settings
        const vignetteIntensity = this.currentFilter === 'custom' ? this.customSettings.vignette : 0.25;

        const gradient = ctx.createRadialGradient(
            width / 2, height / 2, height * 0.3,
            width / 2, height / 2, height * 0.8
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${vignetteIntensity * 2})`); // Multiplica por 2 para rango 0-2
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }

    addDateStamp(ctx, width, height) {
        const date = new Date();
        const dateStr = `'${date.getFullYear().toString().slice(-2)} ${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}`;

        ctx.font = `${Math.floor(height * 0.025)}px "Space Mono", monospace`;
        ctx.fillStyle = '#ff6b35';
        ctx.shadowColor = 'rgba(255, 107, 53, 0.8)';
        ctx.shadowBlur = 4;
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, width - 20, height - 20);
        ctx.shadowBlur = 0;
    }

    updateDateStamp() {
        const date = new Date();
        const dateStr = `'${date.getFullYear().toString().slice(-2)} ${(date.getMonth() + 1).toString().padStart(2, '0')} ${date.getDate().toString().padStart(2, '0')}`;
        this.dateStamp.textContent = dateStr;
    }

    updateFilmCounter() {
        this.filmCounter.textContent = this.frameCount.toString().padStart(2, '0');
    }

    openGallery() {
        this.renderGallery();
        this.galleryModal.classList.add('active');
    }

    closeGallery() {
        this.galleryModal.classList.remove('active');
    }

    renderGallery() {
        if (this.photos.length === 0) {
            this.galleryGrid.innerHTML = `
                <div class="empty-gallery">
                    <span>📷</span>
                    <p>No hay fotos todavía</p>
                </div>
            `;
            return;
        }

        this.galleryGrid.innerHTML = this.photos.map((photo, index) => `
            <div class="gallery-item ${photo.isVideo ? 'video-item' : ''}" data-index="${index}">
                ${photo.isVideo ?
                `<video src="${photo.data}" muted></video>
                     <div class="video-overlay">🎥</div>` :
                `<img src="${photo.data}" alt="Photo ${index + 1}" loading="lazy">`
            }
                <button class="delete-btn" data-id="${photo.id}">✕</button>
            </div>
        `).join('');

        // Bind events
        this.galleryGrid.querySelectorAll('.gallery-item').forEach(item => {
            const mediaEl = item.querySelector('img, video');
            mediaEl.addEventListener('click', (e) => {
                const index = e.target.closest('.gallery-item').dataset.index;
                this.viewPhoto(parseInt(index));
            });
        });

        this.galleryGrid.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = parseInt(e.target.dataset.id);
                this.deletePhoto(id);
            });
        });
    }

    viewPhoto(index) {
        const photo = this.photos[index];
        let currentIndex = index;

        // Create viewer modal
        const viewer = document.createElement('div');
        viewer.className = 'image-viewer active';

        // Determinar si necesita rotación (capturada en landscape, mostramos en portrait)
        const needsRotation = photo.orientation === 'landscape' && photo.ratio !== '1/1' && !photo.isVideo;
        const rotationClass = needsRotation ? 'rotate-90' : '';

        const mediaElement = photo.isVideo ?
            `<video src="${photo.data}" controls autoplay class="viewer-image"></video>` :
            `<img src="${photo.data}" alt="Full photo" class="viewer-image ${rotationClass}">`;

        viewer.innerHTML = `
            <div class="photo-counter">${currentIndex + 1} / ${this.photos.length}</div>
            <button class="nav-btn prev-btn">‹</button>
            <button class="nav-btn next-btn">›</button>
            ${mediaElement}
            <div class="image-viewer-controls">
                <button class="viewer-btn download">💾 Guardar</button>
                <button class="viewer-btn delete-photo">🗑️ Eliminar</button>
                <button class="viewer-btn close">Cerrar</button>
            </div>
        `;

        document.body.appendChild(viewer);

        const mediaEl = viewer.querySelector('.viewer-image');
        const counter = viewer.querySelector('.photo-counter');
        const prevBtn = viewer.querySelector('.prev-btn');
        const nextBtn = viewer.querySelector('.next-btn');

        // Update image function
        const updateImage = (newIndex) => {
            if (newIndex < 0 || newIndex >= this.photos.length) return;
            currentIndex = newIndex;
            mediaEl.style.opacity = '0';
            setTimeout(() => {
                const newPhoto = this.photos[currentIndex];

                const needsRotation = newPhoto.orientation === 'landscape' && newPhoto.ratio !== '1/1' && !newPhoto.isVideo;
                const rotationClass = needsRotation ? 'rotate-90' : '';

                const newMediaElement = newPhoto.isVideo ?
                    `<video src="${newPhoto.data}" controls autoplay class="viewer-image"></video>` :
                    `<img src="${newPhoto.data}" alt="Full photo" class="viewer-image ${rotationClass}">`;

                // Replace media element
                const oldMediaEl = viewer.querySelector('.viewer-image');
                oldMediaEl.outerHTML = newMediaElement;
                const freshMediaEl = viewer.querySelector('.viewer-image');

                counter.textContent = `${currentIndex + 1} / ${this.photos.length}`;
                setTimeout(() => {
                    freshMediaEl.style.opacity = '1';
                }, 50);
            }, 150);
        };

        // Navigation buttons
        prevBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex > 0) updateImage(currentIndex - 1);
        });

        nextBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (currentIndex < this.photos.length - 1) updateImage(currentIndex + 1);
        });

        // Swipe gestures
        let touchStartX = 0;
        let touchEndX = 0;

        viewer.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        viewer.addEventListener('touchend', (e) => {
            touchEndX = e.changedTouches[0].screenX;
            handleSwipe();
        });

        const handleSwipe = () => {
            const swipeThreshold = 50;
            if (touchStartX - touchEndX > swipeThreshold) {
                // Swipe left - next
                if (currentIndex < this.photos.length - 1) updateImage(currentIndex + 1);
            } else if (touchEndX - touchStartX > swipeThreshold) {
                // Swipe right - previous
                if (currentIndex > 0) updateImage(currentIndex - 1);
            }
        };

        // Keyboard navigation
        const handleKeyboard = (e) => {
            if (e.key === 'ArrowLeft' && currentIndex > 0) {
                updateImage(currentIndex - 1);
            } else if (e.key === 'ArrowRight' && currentIndex < this.photos.length - 1) {
                updateImage(currentIndex + 1);
            } else if (e.key === 'Escape') {
                viewer.remove();
                document.removeEventListener('keydown', handleKeyboard);
            }
        };
        document.addEventListener('keydown', handleKeyboard);

        // Close button
        viewer.querySelector('.close').addEventListener('click', () => {
            viewer.remove();
            document.removeEventListener('keydown', handleKeyboard);
        });

        // Download button
        // Download button
        viewer.querySelector('.download').addEventListener('click', async () => {
            const currentPhoto = this.photos[currentIndex];
            const isVideo = currentPhoto.isVideo;
            const extension = isVideo ? 'webm' : 'jpg';
            const mimeType = isVideo ? 'video/webm' : 'image/jpeg';
            const fileName = `analog_${Date.now()}.${extension}`;

            // Intentar usar File System Access API para "Guardar como..."
            if (window.showSaveFilePicker) {
                try {
                    const handle = await window.showSaveFilePicker({
                        suggestedName: fileName,
                        types: [{
                            description: isVideo ? 'Analog Video' : 'Analog Photo',
                            accept: { [mimeType]: [`.${extension}`] },
                        }],
                    });

                    const writable = await handle.createWritable();

                    // Convertir dataURI a Blob
                    const response = await fetch(currentPhoto.data);
                    const blob = await response.blob();

                    await writable.write(blob);
                    await writable.close();
                    return;
                } catch (err) {
                    if (err.name === 'AbortError') return; // Usuario canceló
                    console.warn('Error con SaveFilePicker, usando fallback:', err);
                }
            }

            // Fallback clásico
            const link = document.createElement('a');
            link.download = fileName;
            link.href = currentPhoto.data;
            link.click();
        });

        // Delete button
        viewer.querySelector('.delete-photo').addEventListener('click', () => {
            if (confirm('¿Eliminar esta foto?')) {
                const photoId = this.photos[currentIndex].id;
                this.deletePhoto(photoId);
                viewer.remove();
                document.removeEventListener('keydown', handleKeyboard);
            }
        });

        // Click outside to close
        viewer.addEventListener('click', (e) => {
            if (e.target === viewer) {
                viewer.remove();
                document.removeEventListener('keydown', handleKeyboard);
            }
        });
    }

    deletePhoto(id) {
        this.photos = this.photos.filter(p => p.id !== id);
        localStorage.setItem('analogPhotos', JSON.stringify(this.photos));
        this.renderGallery();
    }

    clearCache() {
        if (confirm('¿Eliminar TODAS las fotos guardadas? Esta acción no se puede deshacer.')) {
            this.photos = [];
            localStorage.setItem('analogPhotos', '[]');
            this.renderGallery();
            alert('✅ Caché limpiado. Ya podés seguir sacando fotos!');
        }
    }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    new AnalogCamera();
});
