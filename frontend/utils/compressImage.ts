import heic2any from 'heic2any';

/**
 * Checks if a file is a HEIC/HEIF image (common from iPhones).
 */
function isHeic(file: File): boolean {
    const type = file.type.toLowerCase();
    if (type === 'image/heic' || type === 'image/heif') return true;
    // Some browsers don't set the MIME type for HEIC, so also check extension
    const name = file.name.toLowerCase();
    return name.endsWith('.heic') || name.endsWith('.heif');
}

/**
 * Converts a HEIC/HEIF file to a JPEG File using heic2any.
 */
async function convertHeicToJpeg(file: File): Promise<File> {
    const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: 0.92 });
    // heic2any can return a single Blob or an array; handle both
    const resultBlob = Array.isArray(blob) ? blob[0] : blob;
    return new File([resultBlob], file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg'), {
        type: 'image/jpeg',
    });
}

/**
 * Compresses an image file client-side using the Canvas API.
 * Resizes the image to fit within maxWidth and maxHeight while maintaining aspect ratio,
 * and outputs a base64 encoded JPEG.
 *
 * Automatically converts HEIC/HEIF images (from iPhones) to JPEG first.
 * Uses quality 0.85 by default to preserve detail (especially important for QR codes).
 * Images already within the size bounds are NOT resized, only re-encoded.
 *
 * @param file The image file to compress
 * @param maxWidth Maximum width of the output image (default 1200)
 * @param maxHeight Maximum height of the output image (default 900)
 * @param quality JPEG compression quality factor between 0 and 1 (default 0.85)
 * @returns A promise that resolves to the base64 data URI of the compressed image
 */
export async function compressImage(
    file: File,
    maxWidth = 1200,
    maxHeight = 900,
    quality = 0.85
): Promise<string> {
    // Convert HEIC/HEIF to JPEG first if needed
    let processedFile = file;
    if (isHeic(file)) {
        processedFile = await convertHeicToJpeg(file);
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Only resize if the image exceeds the maximum dimensions
                if (width > maxWidth || height > maxHeight) {
                    const ratio = Math.min(maxWidth / width, maxHeight / height);
                    width = Math.floor(width * ratio);
                    height = Math.floor(height * ratio);
                }

                // Create a canvas and draw the resized image onto it
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;

                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas 2d context'));
                    return;
                }

                // Fill background with white in case it's a transparent image (like PNG)
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.drawImage(img, 0, 0, width, height);

                // Get the base64 data URI of the compressed image
                const base64Data = canvas.toDataURL('image/jpeg', quality);
                resolve(base64Data);
            };
            img.onerror = () => reject(new Error('Failed to load image'));
            img.src = event.target?.result as string;
        };

        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsDataURL(processedFile);
    });
}
