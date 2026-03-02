/**
 * Compresses an image file client-side using the Canvas API.
 * Resizes the image to fit within maxWidth and maxHeight while maintaining aspect ratio,
 * and outputs a base64 encoded JPEG.
 *
 * @param file The image file to compress
 * @param maxWidth Maximum width of the output image (default 1200)
 * @param maxHeight Maximum height of the output image (default 900)
 * @param quality JPEG compression quality factor between 0 and 1 (default 0.7)
 * @returns A promise that resolves to the base64 data URI of the compressed image
 */
export function compressImage(
    file: File,
    maxWidth = 1200,
    maxHeight = 900,
    quality = 0.7
): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                let width = img.width;
                let height = img.height;

                // Calculate the new dimensions while maintaining aspect ratio
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
        reader.readAsDataURL(file);
    });
}
