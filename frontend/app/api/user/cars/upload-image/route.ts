import { NextResponse } from 'next/server';
import { verifyUserFromRequest } from '@/app/api/lib/verifyUser';
import { processCarImage } from '@/app/api/lib/processCarImage';

export async function POST(req: Request) {
    try {
        const user = await verifyUserFromRequest(
            req.headers.get('authorization') ?? undefined
        );

        if (!user || !user.uid) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { image } = body;

        if (!image || typeof image !== 'string' || !image.startsWith('data:')) {
            return NextResponse.json({ error: 'Invalid or missing image data' }, { status: 400 });
        }

        const imageUrl = await processCarImage(image, user.uid);

        return NextResponse.json({ url: imageUrl });
    } catch (error: any) {
        console.error("Upload Car Image API Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
