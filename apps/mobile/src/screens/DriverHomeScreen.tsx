import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Switch,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import {
  DispatchOffer,
  EventType,
  JobOrder,
  TelemetryPing,
} from '@fleetrelay/contracts';
import { locationService } from '../services/LocationService';
import { socketService } from '../services/SocketService';
import { offlineQueue } from '../services/OfflineQueue';
import { TelemetryHUD } from '../components/TelemetryHUD';
import { JobOfferModal } from '../components/JobOfferModal';
import { colors } from '../theme/colors';

interface DriverHomeScreenProps {
  driverId: string;
  driverName: string;
}

export const DriverHomeScreen: React.FC<DriverHomeScreenProps> = ({
  driverId,
  driverName,
}) => {
  const [isOnline, setIsOnline] = useState<boolean>(true);
  const [currentPing, setCurrentPing] = useState<TelemetryPing | null>(null);
  const [activeOffer, setActiveOffer] = useState<DispatchOffer | null>(null);
  const [activeJob, setActiveJob] = useState<JobOrder | null>(null);
  const [jobPhase, setJobPhase] = useState<'to_pickup' | 'at_pickup' | 'in_transit' | 'delivered'>('to_pickup');
  const [isConnected, setIsConnected] = useState<boolean>(socketService.isConnected());
  const [queuedCount, setQueuedCount] = useState<number>(offlineQueue.size());

  useEffect(() => {
    // 1. Initialize location tracking & sockets
    locationService.init(driverId);
    socketService.connect(driverId);

    // 2. Subscribe to location updates
    const unsubscribeLocation = locationService.subscribe({
      onLocationUpdate: (ping) => {
        setCurrentPing(ping);
        setIsConnected(socketService.isConnected());
        setQueuedCount(offlineQueue.size());
      },
    });

    // 3. Start tracking if online
    if (isOnline) {
      locationService.startTracking();
    }

    // 4. Subscribe to WebSocket events
    const unsubOffer = socketService.on<DispatchOffer>(EventType.DISPATCH_OFFER, (offer) => {
      console.log('[Mobile] Received Dispatch Offer:', offer.offerId);
      setActiveOffer(offer);
    });

    const unsubRevoke = socketService.on(EventType.OFFER_REVOKED, () => {
      console.log('[Mobile] Offer was revoked/expired');
      setActiveOffer(null);
    });

    const unsubJobAssigned = socketService.on(EventType.JOB_ASSIGNED, () => {
      console.log('[Mobile] Job officially assigned!');
      if (activeOffer) {
        setActiveJob(activeOffer.job);
        setActiveOffer(null);
        setJobPhase('to_pickup');
      }
    });

    return () => {
      unsubscribeLocation();
      unsubOffer();
      unsubRevoke();
      unsubJobAssigned();
      locationService.stopTracking();
      socketService.disconnect();
    };
  }, [driverId]);

  const handleToggleOnline = (value: boolean) => {
    setIsOnline(value);
    if (value) {
      socketService.connect(driverId);
      locationService.startTracking();
    } else {
      locationService.stopTracking();
      socketService.send(EventType.DRIVER_STATUS_CHANGE, {
        driverId,
        status: 'offline',
      });
    }
  };

  const handleAcceptOffer = (offerId: string, jobId: string) => {
    socketService.respondToOffer(offerId, jobId, true);
    if (activeOffer) {
      setActiveJob(activeOffer.job);
      setActiveOffer(null);
      setJobPhase('to_pickup');
    }
  };

  const handleDeclineOffer = (offerId: string, jobId: string) => {
    socketService.respondToOffer(offerId, jobId, false);
    setActiveOffer(null);
  };

  const advanceJobPhase = () => {
    if (!activeJob) return;

    if (jobPhase === 'to_pickup') {
      setJobPhase('at_pickup');
      socketService.send(EventType.JOB_UPDATE, {
        jobId: activeJob.id,
        newStatus: 'arrived_pickup',
        currentCoords: currentPing?.coords,
      });
    } else if (jobPhase === 'at_pickup') {
      setJobPhase('in_transit');
      socketService.send(EventType.JOB_UPDATE, {
        jobId: activeJob.id,
        newStatus: 'in_transit',
        currentCoords: currentPing?.coords,
      });
    } else if (jobPhase === 'in_transit') {
      setJobPhase('delivered');
      socketService.send(EventType.JOB_UPDATE, {
        jobId: activeJob.id,
        newStatus: 'completed',
        currentCoords: currentPing?.coords,
      });
      setTimeout(() => {
        setActiveJob(null);
        setJobPhase('to_pickup');
      }, 2000);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={colors.background} />

      {/* Top Header Bar */}
      <View style={styles.header}>
        <View>
          <Text style={styles.brandTitle}>FleetRelay Driver</Text>
          <Text style={styles.driverName}>{driverName}</Text>
        </View>

        <View style={styles.onlineToggleContainer}>
          <Text style={[styles.onlineStatusLabel, { color: isOnline ? colors.success : colors.textMuted }]}>
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </Text>
          <Switch
            value={isOnline}
            onValueChange={handleToggleOnline}
            trackColor={{ false: colors.surfaceBorder, true: colors.successGlow }}
            thumbColor={isOnline ? colors.success : colors.textMuted}
          />
        </View>
      </View>

      {/* Map Simulation Container */}
      <View style={styles.mapArea}>
        <View style={styles.mapGridBackground}>
          {/* Mock Grid Lines simulating vector map tiles */}
          <View style={styles.gridLineHorizontal} />
          <View style={[styles.gridLineHorizontal, { top: '50%' }]} />
          <View style={styles.gridLineVertical} />
          <View style={[styles.gridLineVertical, { left: '50%' }]} />

          {/* Vehicle Marker */}
          <View
            style={[
              styles.vehicleMarker,
              { transform: [{ rotate: `${currentPing?.heading || 0}deg` }] },
            ]}
          >
            <View style={styles.headingIndicator} />
            <View style={styles.vehicleBody} />
          </View>

          {/* Active Job Marker if present */}
          {activeJob && (
            <View style={styles.destinationMarker}>
              <Text style={styles.destinationText}>
                {jobPhase === 'to_pickup' ? 'PICKUP' : 'DROPOFF'}
              </Text>
            </View>
          )}

          <View style={styles.mapCoordsBadge}>
            <Text style={styles.coordsText}>
              {currentPing?.coords.latitude.toFixed(4) || '40.7580'}°N,{' '}
              {currentPing?.coords.longitude.toFixed(4) || '-73.9855'}°W
            </Text>
          </View>
        </View>
      </View>

      {/* Active Job Guidance Card */}
      {activeJob && (
        <View style={styles.activeJobCard}>
          <View style={styles.activeJobHeader}>
            <View>
              <Text style={styles.activeJobOrder}>{activeJob.orderNumber}</Text>
              <Text style={styles.activeJobAddress} numberOfLines={1}>
                {jobPhase === 'to_pickup' ? activeJob.pickup.address : activeJob.dropoff.address}
              </Text>
            </View>
            <Text style={styles.activeJobPayout}>${(activeJob.payoutAmountCents / 100).toFixed(2)}</Text>
          </View>

          <TouchableOpacity style={styles.advanceButton} onPress={advanceJobPhase}>
            <Text style={styles.advanceButtonText}>
              {jobPhase === 'to_pickup' && 'CONFIRM ARRIVAL AT PICKUP'}
              {jobPhase === 'at_pickup' && 'START TRIP TO DROPOFF'}
              {jobPhase === 'in_transit' && 'COMPLETE DELIVERY'}
              {jobPhase === 'delivered' && 'JOB COMPLETED ✓'}
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Floating Telemetry HUD */}
      <View style={styles.hudWrapper}>
        <TelemetryHUD
          latestPing={currentPing}
          isConnected={isConnected}
          queuedCount={queuedCount}
        />
      </View>

      {/* Dispatch Offer Modal */}
      <JobOfferModal
        offer={activeOffer}
        onAccept={handleAcceptOffer}
        onDecline={handleDeclineOffer}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.surfaceBorder,
  },
  brandTitle: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  driverName: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '800',
    marginTop: 2,
  },
  onlineToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  onlineStatusLabel: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  mapArea: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#070b14',
  },
  mapGridBackground: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  gridLineHorizontal: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '25%',
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  gridLineVertical: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '25%',
    width: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
  },
  vehicleMarker: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headingIndicator: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.accent,
    marginBottom: -2,
  },
  vehicleBody: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.accent,
    borderWidth: 3,
    borderColor: '#ffffff',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 10,
  },
  destinationMarker: {
    position: 'absolute',
    top: '28%',
    right: '25%',
    backgroundColor: colors.success,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  destinationText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 11,
  },
  mapCoordsBadge: {
    position: 'absolute',
    top: 16,
    left: 16,
    backgroundColor: 'rgba(11, 15, 25, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  coordsText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  activeJobCard: {
    marginHorizontal: 16,
    marginBottom: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.primaryGlow,
  },
  activeJobHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  activeJobOrder: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
  },
  activeJobAddress: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    maxWidth: 220,
  },
  activeJobPayout: {
    color: colors.success,
    fontSize: 20,
    fontWeight: '900',
  },
  advanceButton: {
    backgroundColor: colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  advanceButtonText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  hudWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
});
