import sharp from 'sharp';
import { bucket } from '@/app/api/lib/firebase-admin';

/**
 * Process a car image: validate, optimize, and upload to Firebase Storage.
 * Follows the same pattern as profile picture uploads.
 *
 * @param base64Data - Base64 encoded image data (with data URI prefix)
 * @param userId - User ID for organizing storage path
 * @returns Public URL of the uploaded image
 * @throws Error if processing fails
 */
export async function processCarImage(
    base64Data: string,
    userId: string
): Promise<string> {
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error('Invalid image data');
    }

    let imageBuffer: Buffer = Buffer.from(matches[2], 'base64');

    try {
        imageBuffer = await sharp(imageBuffer, { failOnError: true, limitInputPixels: 50 * 1000 * 1000 })
            .rotate()
            .resize({
                width: 1200,
                height: 900,
                fit: 'cover',
                position: 'center'
            })
            .flatten({ background: '#ffffff' })
            .toColorspace('srgb')
            .jpeg({ quality: 80 })
            .toBuffer() as any;
    } catch (err) {
        console.error('Car image processing failed:', err);
        throw new Error('Failed to process car image');
    }

    const filename = `car_photos/${userId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const file = bucket.file(filename);

    await file.save(imageBuffer as any, {
        metadata: { contentType: 'image/jpeg' },
        public: true,
    });

    return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}

/**
 * Delete a car image from Firebase Storage if it's hosted in our bucket.
 *
 * @param url - Public URL of the image to delete
 */
export async function deleteCarImage(url: string): Promise<void> {
    if (!url) return;
    try {
        const bucketName = bucket.name;
        if (url.includes(bucketName)) {
            const parts = url.split(`${bucketName}/`);
            if (parts.length > 1) {
                const filePath = decodeURIComponent(parts[1]);
                await bucket.file(filePath).delete();
            }
        }
    } catch (err) {
        console.warn('Failed to delete car image:', err);
    }
}
