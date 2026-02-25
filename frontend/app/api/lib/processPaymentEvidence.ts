import sharp from 'sharp';
import { bucket } from '@/app/api/lib/firebase-admin';

/**
 * Process a payment evidence image: validate, optimize, and upload to Firebase Storage.
 *
 * @param base64Data - Base64 encoded image data (with data URI prefix)
 * @param bookingId - Booking ID for organizing storage path
 * @returns Public URL of the uploaded image
 * @throws Error if processing fails
 */
export async function processPaymentEvidence(
    base64Data: string,
    bookingId: string
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
                height: 1600,
                fit: 'inside',
                withoutEnlargement: true
            })
            .flatten({ background: '#ffffff' })
            .toColorspace('srgb')
            .jpeg({ quality: 80 })
            .toBuffer() as any;
    } catch (err) {
        console.error('Payment evidence image processing failed:', err);
        throw new Error('Failed to process payment evidence image');
    }

    const filename = `payment_evidence/${bookingId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
    const file = bucket.file(filename);

    await file.save(imageBuffer as any, {
        metadata: { contentType: 'image/jpeg' },
        public: true,
    });

    return `https://storage.googleapis.com/${bucket.name}/${filename}`;
}
