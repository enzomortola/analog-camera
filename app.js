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
        this.facingMode = 'environment'; // Start with back camera
        this.stream = null;
        this.photos = JSON.parse(localStorage.getItem('analogPhotos') || '[]');
        this.frameCount = parseInt(localStorage.getItem('filmCounter') || '36');

        // Custom filter settings
        this.customSettings = JSON.parse(localStorage.getItem('customFilterSettings') || JSON.stringify({
            warmth: 0,
            contrast: 0,
            saturation: 0,
            brightness: 0,
            tint: 0,
            fade: 0
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

        this.init();
    }

    async init() {
        this.updateDateStamp();
        this.updateFilmCounter();
        this.setAspectRatio(this.currentRatio);
        this.bindEvents();
        await this.startCamera();
        this.startPreviewLoop();
    }

    bindEvents() {
        this.captureBtn.addEventListener('click', () => this.capturePhoto());
        this.switchBtn.addEventListener('click', () => this.switchCamera());
        this.galleryBtn.addEventListener('click', () => this.openGallery());
        this.closeGalleryBtn.addEventListener('click', () => this.closeGallery());

        // Filter buttons with mobile tooltip
        document.querySelectorAll('.filter-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', 'show-tooltip'));
                e.target.classList.add('active');
                this.currentFilter = e.target.dataset.filter;

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

        resetBtn.addEventListener('click', () => {
            ['warmth', 'contrast', 'saturation', 'brightness', 'tint', 'fade'].forEach(param => {
                this.customSettings[param] = 0;
                document.getElementById(param).value = 0;
                document.getElementById(`${param}Value`).textContent = '0';
            });
            localStorage.setItem('customFilterSettings', JSON.stringify(this.customSettings));
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

    async startCamera() {
        try {
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }

            const constraints = {
                video: {
                    facingMode: this.facingMode,
                    width: { ideal: 1920 },
                    height: { ideal: 1080 }
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
                this.canvas.width = this.video.videoWidth;
                this.canvas.height = this.video.videoHeight;

                // Draw and apply filter
                this.ctx.save();
                if (this.facingMode === 'user') {
                    this.ctx.scale(-1, 1);
                    this.ctx.drawImage(this.video, -this.canvas.width, 0);
                } else {
                    this.ctx.drawImage(this.video, 0, 0);
                }
                this.ctx.restore();

                // Apply selected filter
                const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
                this.filters[this.currentFilter](imageData);
                this.ctx.putImageData(imageData, 0, 0);
            }
            requestAnimationFrame(loop);
        };
        loop();
    }

    // Film emulation filters - INTENSIFIED
    applyKodakPortra(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            // Strong warm peachy tones
            r = Math.min(255, r * 1.18);
            g = Math.min(255, g * 1.05);
            b = b * 0.85;

            // Heavy lifted shadows (faded look)
            const luma = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luma < 128) {
                r = r + (255 - r) * 0.18;
                g = g + (255 - g) * 0.15;
                b = b + (255 - b) * 0.12;
            }

            // Soft contrast
            r = ((r / 255 - 0.5) * 0.85 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 0.85 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 0.85 + 0.5) * 255;

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

            // Strong cyan/teal in shadows and highlights
            if (luma > 180) {
                // Bright skies - cyan tint
                b = Math.min(255, b * 1.25);
                g = Math.min(255, g * 1.12);
                r = r * 0.88;
            } else if (luma < 80) {
                // Shadows - cyan/green tint
                g = Math.min(255, g * 1.15);
                b = Math.min(255, b * 1.18);
            }

            // Lifted blacks
            r = r + (255 - r) * 0.08;
            g = g + (255 - g) * 0.1;
            b = b + (255 - b) * 0.12;

            // Medium contrast
            r = ((r / 255 - 0.5) * 1.05 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.05 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.05 + 0.5) * 255;

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

            // Extreme tungsten color shift
            if (luma < 100) {
                // Deep blue shadows
                b = Math.min(255, b * 1.35);
                g = Math.min(255, g * 1.12);
                r = r * 0.85;
            } else if (luma > 180) {
                // Warm highlights with halation
                r = Math.min(255, r * 1.25);
                g = Math.min(255, g * 1.08);
            }

            // Red halation in bright areas
            if (luma > 200) {
                r = Math.min(255, r * 1.3);
            }

            // High contrast
            r = ((r / 255 - 0.5) * 1.35 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.35 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.35 + 0.5) * 255;

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

            // High contrast B&W
            let gray = 0.299 * r + 0.587 * g + 0.114 * b;

            // Crushed blacks, blown highlights
            gray = ((gray / 255 - 0.5) * 1.45 + 0.5) * 255;
            gray = Math.max(0, Math.min(255, gray));

            // Warm sepia tone
            data[i] = Math.min(255, gray * 1.08);
            data[i + 1] = Math.min(255, gray * 1.02);
            data[i + 2] = gray * 0.88;
        }
    }

    applyAgfaVista(imageData) {
        const data = imageData.data;
        for (let i = 0; i < data.length; i += 4) {
            let r = data[i];
            let g = data[i + 1];
            let b = data[i + 2];

            const luma = 0.299 * r + 0.587 * g + 0.114 * b;

            // EXTREME saturation and warmth (like reference image 3)
            const avg = (r + g + b) / 3;
            r = r * 1.45 - avg * 0.45;
            g = g * 1.35 - avg * 0.35;
            b = b * 1.25 - avg * 0.25;

            // Strong yellow/orange cast in highlights
            if (luma > 120) {
                r = Math.min(255, r * 1.2);
                g = Math.min(255, g * 1.12);
                b = b * 0.85;
            }

            // Green in shadows
            if (luma < 100) {
                g = Math.min(255, g * 1.15);
            }

            // High contrast punchy look
            r = ((r / 255 - 0.5) * 1.3 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.3 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.3 + 0.5) * 255;

            // Lift shadows
            r = r + (255 - r) * 0.06;
            g = g + (255 - g) * 0.05;
            b = b + (255 - b) * 0.04;

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

            // Extreme cross-process - swap channels aggressively
            const newR = r * 0.5 + g * 0.3 + b * 0.2;
            const newG = r * 0.2 + g * 0.4 + b * 0.4;
            const newB = r * 0.3 + g * 0.2 + b * 0.5;

            // Strong magenta/purple cast
            r = Math.min(255, newR * 1.25);
            g = newG * 0.85;
            b = Math.min(255, newB * 1.35);

            // Extreme contrast and saturation
            r = ((r / 255 - 0.5) * 1.55 + 0.5) * 255;
            g = ((g / 255 - 0.5) * 1.55 + 0.5) * 255;
            b = ((b / 255 - 0.5) * 1.55 + 0.5) * 255;

            // Faded blacks
            r = r + (255 - r) * 0.12;
            g = g + (255 - g) * 0.1;
            b = b + (255 - b) * 0.15;

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

        // Create capture canvas with date stamp
        const captureCanvas = document.createElement('canvas');
        captureCanvas.width = this.canvas.width;
        captureCanvas.height = this.canvas.height;
        const captureCtx = captureCanvas.getContext('2d');

        // Draw filtered image
        captureCtx.drawImage(this.canvas, 0, 0);

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

    addFilmGrain(ctx, width, height) {
        const imageData = ctx.getImageData(0, 0, width, height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
            const noise = (Math.random() - 0.5) * 20;
            data[i] = Math.max(0, Math.min(255, data[i] + noise));
            data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
            data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
        }

        ctx.putImageData(imageData, 0, 0);
    }

    addVignette(ctx, width, height) {
        const gradient = ctx.createRadialGradient(
            width / 2, height / 2, height * 0.3,
            width / 2, height / 2, height * 0.8
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, 'rgba(0,0,0,0.5)');
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
            <div class="gallery-item" data-index="${index}">
                <img src="${photo.data}" alt="Photo ${index + 1}" loading="lazy">
                <button class="delete-btn" data-id="${photo.id}">✕</button>
            </div>
        `).join('');

        // Bind events
        this.galleryGrid.querySelectorAll('.gallery-item img').forEach(img => {
            img.addEventListener('click', (e) => {
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
        viewer.innerHTML = `
            <div class="photo-counter">${currentIndex + 1} / ${this.photos.length}</div>
            <button class="nav-btn prev-btn">‹</button>
            <button class="nav-btn next-btn">›</button>
            <img src="${photo.data}" alt="Full photo" class="viewer-image">
            <div class="image-viewer-controls">
                <button class="viewer-btn download">💾 Guardar</button>
                <button class="viewer-btn delete-photo">🗑️ Eliminar</button>
                <button class="viewer-btn close">Cerrar</button>
            </div>
        `;

        document.body.appendChild(viewer);

        const img = viewer.querySelector('.viewer-image');
        const counter = viewer.querySelector('.photo-counter');
        const prevBtn = viewer.querySelector('.prev-btn');
        const nextBtn = viewer.querySelector('.next-btn');

        // Update image function
        const updateImage = (newIndex) => {
            if (newIndex < 0 || newIndex >= this.photos.length) return;
            currentIndex = newIndex;
            img.style.opacity = '0';
            setTimeout(() => {
                img.src = this.photos[currentIndex].data;
                counter.textContent = `${currentIndex + 1} / ${this.photos.length}`;
                img.style.opacity = '1';
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

        img.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
        });

        img.addEventListener('touchend', (e) => {
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
        viewer.querySelector('.download').addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `analog_${Date.now()}.jpg`;
            link.href = this.photos[currentIndex].data;
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
