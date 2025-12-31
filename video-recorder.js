// Video Recorder con crop de ratio
class VideoRecorder {
    constructor(canvas, orientation, currentRatio) {
        this.canvas = canvas;
        this.orientation = orientation;
        this.currentRatio = currentRatio;
        this.recordCanvas = null;
        this.isRecording = false;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.copyLoopId = null;
    }

    calculateCropDimensions() {
        const ratios = {
            '3/2': 3 / 2,
            '4/3': 4 / 3,
            '1/1': 1,
            '16/9': 16 / 9
        };

        let targetRatio = ratios[this.currentRatio];
        if (this.orientation === 'portrait' && this.currentRatio !== '1/1') {
            targetRatio = 1 / targetRatio;
        }

        const sourceWidth = this.canvas.width;
        const sourceHeight = this.canvas.height;
        const sourceRatio = sourceWidth / sourceHeight;

        let cropX = 0, cropY = 0, cropWidth = sourceWidth, cropHeight = sourceHeight;

        if (sourceRatio > targetRatio) {
            cropWidth = sourceHeight * targetRatio;
            cropX = (sourceWidth - cropWidth) / 2;
        } else {
            cropHeight = sourceWidth / targetRatio;
            cropY = (sourceHeight - cropHeight) / 2;
        }

        return { cropX, cropY, cropWidth, cropHeight };
    }

    async start() {
        this.recordedChunks = [];

        const { cropX, cropY, cropWidth, cropHeight } = this.calculateCropDimensions();

        // Crear canvas temporal con crop
        this.recordCanvas = document.createElement('canvas');
        this.recordCanvas.width = cropWidth;
        this.recordCanvas.height = cropHeight;
        const recordCtx = this.recordCanvas.getContext('2d');

        // Loop para copiar canvas filtrado con crop
        const copyLoop = () => {
            if (!this.isRecording) return;
            recordCtx.drawImage(
                this.canvas,
                cropX, cropY, cropWidth, cropHeight,
                0, 0, cropWidth, cropHeight
            );
            this.copyLoopId = requestAnimationFrame(copyLoop);
        };
        copyLoop();

        // Capturar stream del canvas con crop
        const canvasStream = this.recordCanvas.captureStream(30);

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

        return new Promise((resolve) => {
            this.mediaRecorder.onstop = () => {
                resolve(this.getVideoBlob());
            };
            this.mediaRecorder.start(100);
            this.isRecording = true;
        });
    }

    stop() {
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            this.mediaRecorder.stop();
        }
        this.isRecording = false;
        if (this.copyLoopId) {
            cancelAnimationFrame(this.copyLoopId);
        }
    }

    getVideoBlob() {
        return new Blob(this.recordedChunks, { type: 'video/webm' });
    }
}
