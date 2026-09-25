import React, { useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DriverHomeScreen } from './screens/DriverHomeScreen';

export default function App() {
  // Default driver ID for development testing (matches seed script driver Marcus Vance)
  const [driver] = useState({
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    name: 'Marcus Vance',
  });

  return (
    <SafeAreaProvider>
      <DriverHomeScreen driverId={driver.id} driverName={driver.name} />
    </SafeAreaProvider>
  );
}
