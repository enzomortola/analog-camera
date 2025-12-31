// CropFrame Calculator
function updateCropFrame(canvas, container, cropFrame, currentRatio, orientation) {
    if (!container || !cropFrame || !canvas) return;

    // Esperar a que canvas tenga dimensiones
    if (!canvas.width || !canvas.height) {
        setTimeout(() => updateCropFrame(canvas, container, cropFrame, currentRatio, orientation), 100);
        return;
    }

    const containerRect = container.getBoundingClientRect();
    const ratios = {
        '3/2': 3 / 2,
        '4/3': 4 / 3,
        '1/1': 1,
        '16/9': 16 / 9
    };

    let targetRatio = ratios[currentRatio];

    // Invertir ratio si está en portrait
    if (orientation === 'portrait' && currentRatio !== '1/1') {
        targetRatio = 1 / targetRatio;
    }

    // Calcular crop basado en dimensiones del canvas (no del container)
    const canvasRatio = canvas.width / canvas.height;
    let cropWidth, cropHeight;

    if (canvasRatio > targetRatio) {
        cropHeight = canvas.height;
        cropWidth = cropHeight * targetRatio;
    } else {
        cropWidth = canvas.width;
        cropHeight = cropWidth / targetRatio;
    }

    // Escalar al tamaño visual del container
    const scaleX = containerRect.width / canvas.width;
    const scaleY = containerRect.height / canvas.height;
    const scale = Math.min(scaleX, scaleY);

    const frameWidth = cropWidth * scale;
    const frameHeight = cropHeight * scale;

    cropFrame.style.width = `${frameWidth}px`;
    cropFrame.style.height = `${frameHeight}px`;
}
