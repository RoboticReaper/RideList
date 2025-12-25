'use client'
import { AuthForm } from "@/components/AuthForm/AuthForm";
import { Center } from "@mantine/core";


export default function AuthPage() {
  return (
    <Center style={{ flex: 1 }}>
      <AuthForm />
    </Center>
  );
}
