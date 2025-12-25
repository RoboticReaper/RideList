import { app } from '../firebase/firebase';
import { useAuth } from '../firebase/AuthContext';
import { Menu } from '@mantine/core';
import { IconBell } from '@tabler/icons-react';
import { ActionIcon } from '@mantine/core';

export default function Notifications() {
    const { user } = useAuth();

    return (
        user && (
            <Menu shadow="md" width={300}>
                <Menu.Target>
                    <ActionIcon variant="subtle" color="gray">
                        <IconBell size={20} />
                    </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                    <Menu.Label>Notifications</Menu.Label>
                    <Menu.Item>No new notifications</Menu.Item>
                </Menu.Dropdown>
            </Menu>
        )
    )
}