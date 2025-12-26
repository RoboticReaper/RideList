import { CompleteProfileForm } from "@/components/CompleteProfileForm/CompleteProfileForm";
import { Center } from "@mantine/core";

export default function CompleteProfilePage() {
    return (
        <Center style={{ flex: 1, height: '100vh' }}>
            <CompleteProfileForm />
        </Center>
    );
}
