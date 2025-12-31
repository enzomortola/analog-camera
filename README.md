Cámara web con filtros de película analógica. Disponible como PWA (Progressive Web App).

Abrí https://enzomortola.github.io/analog-camera/ desde tu celular.

### Instalar como App

1. Abrí el link en Chrome 
2. Toca "Agregar a pantalla de inicio" 
3. La app se instala como ícono en tu home
4. Funciona offline una vez instalada

## Filtros Disponibles

- **Kodak Portra** - Tonos peachy cálidos, faded blacks
- **Fuji 400H** - Cyan/teal en cielos, tonos fríos
- **CineStill 800T** - Azul en sombras, halación roja
- **Ilford HP5** - B&W alto contraste, sepia cálido
- **Agfa Vista** - Colores ultra saturados, naranja intenso
- **Lomo Purple** - Cross-process magenta psicodélico
- **Personalizada** - Crea tu propio filtro con ecualización

## Desarrollo

### Actualizar la App para Usuarios

**⚠️ IMPORTANTE:** Cuando hagas cambios en el código, **SIEMPRE** actualizá la versión del cache:

1. Abrí `sw.js`
2. Cambiá la versión:
   ```javascript
   const CACHE_NAME = 'analog-camera-v2'; // v1 → v2 → v3...
   ```
3. Hacé commit y push

Si NO cambiás la versión, los usuarios van a seguir viendo la versión vieja cacheada.

### Deploy

La app se deploya automáticamente a GitHub Pages cuando pusheás a `main`.

```bash
git add .
git commit -m "descripción del cambio"
git push
```

## 📦 Estructura

- `index.html` - HTML principal
- `app.js` - Lógica de cámara y filtros
- `styles.css` - Estilos
- `manifest.json` - Configuración PWA
- `sw.js` - Service Worker (offline support)
- `icon-*.svg` - Íconos de la app

## 💾 Almacenamiento

- **Fotos**: localStorage (límite ~50 fotos)
- **Configuración personalizada**: localStorage
- **Caché de la app**: Service Worker

Para liberar espacio, usá el botón **"Limpiar Caché"** en la galería.
