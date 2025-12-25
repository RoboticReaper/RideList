'use client'

import { useParams } from "next/navigation";

export default function RidePage() {
    const params = useParams();
    const rideId = params.rideId;
    return (
        <div>
            <h1>Ride {rideId}</h1>
        </div>
    );
}