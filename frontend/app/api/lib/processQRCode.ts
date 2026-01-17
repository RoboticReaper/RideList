import sharp from 'sharp';
import crypto from 'crypto';
import { bucket } from '@/app/api/lib/firebase-admin';

// Translation function type
type TranslateFunction = (key: string | any) => string;

/**
 * Process a payment QR code image: validate, optimize, hash, and upload to Firebase Storage.
 * Uses content-addressed storage (SHA256 hash) for deduplication.
 * 
 * @param base64Data - Base64 encoded image data (with data URI prefix)
 * @param userId - User ID for organizing storage path
 * @param t - Translation function for localized error messages
 * @returns Public URL of the uploaded image
 * @throws Error if processing fails
 */
export async function processPaymentQRCode(
    base64Data: string,
    userId: string,
    t: TranslateFunction
): Promise<string> {
    // 1. Validate and decode base64
    const matches = base64Data.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
        throw new Error(t('api.errors.qrCodeInvalidBase64'));
    }

    let imageBuffer = Buffer.from(matches[2], 'base64');

    // 2. Process with sharp (security + normalization)
    // failOnError catches truncated/malformed files
    // limitInputPixels prevents decompression bombs while allowing high-res photos
    try {
        imageBuffer = await sharp(imageBuffer, {
            failOnError: true,
            limitInputPixels: 100 * 1000 * 1000 // 100MP limit for QR codes
        })
            .resize({
                width: 512,
                height: 512,
                fit: 'inside',
                withoutEnlargement: true,
                kernel: sharp.kernel.nearest
            })
            .flatten({ background: '#ffffff' })
            .toColorspace('srgb')
            .png({ compressionLevel: 0 })
            .toBuffer() as any;
    } catch (sharpError: any) {
        console.error('Sharp processing failed for QR code:', sharpError);
        throw new Error(t('api.errors.qrCodeProcessingFailed'));
    }

    // 3. Calculate SHA256 hash for content-addressed storage
    const hash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    const filePath = `payment_qr_codes/${userId}/${hash}.png`;

    // 4. Check if file already exists (deduplication)
    const file = bucket.file(filePath);
    const [exists] = await file.exists();

    if (!exists) {
        // 5. Upload to Firebase Storage
        try {
            await file.save(imageBuffer as any, {
                metadata: { contentType: 'image/png' },
                public: true
            });
        } catch (uploadError: any) {
            console.error('Failed to upload QR code to storage:', uploadError);
            throw new Error(t('api.errors.qrCodeUploadFailed'));
        }
    }

    // 6. Return public URL
    return `https://storage.googleapis.com/${bucket.name}/${filePath}`;
}
