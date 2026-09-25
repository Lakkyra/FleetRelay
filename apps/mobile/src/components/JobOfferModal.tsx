import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { DispatchOffer } from '@fleetrelay/contracts';
import { colors } from '../theme/colors';

interface JobOfferModalProps {
  offer: DispatchOffer | null;
  onAccept: (offerId: string, jobId: string) => void;
  onDecline: (offerId: string, jobId: string) => void;
}

export const JobOfferModal: React.FC<JobOfferModalProps> = ({
  offer,
  onAccept,
  onDecline,
}) => {
  const [secondsRemaining, setSecondsRemaining] = useState<number>(30);

  useEffect(() => {
    if (!offer) return;

    const ttl = offer.ttlSeconds || 30;
    setSecondsRemaining(ttl);

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDecline(offer.offerId, offer.job.id);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [offer]);

  if (!offer) return null;

  const payoutDollars = (offer.job.payoutAmountCents / 100).toFixed(2);
  const distanceKm = (offer.distanceToPickupMeters / 1000).toFixed(1);
  const progressPercent = (secondsRemaining / (offer.ttlSeconds || 30)) * 100;

  return (
    <Modal visible={true} transparent animationType="slide">
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          {/* Progress Bar for Expiration TTL */}
          <View style={styles.progressBarBackground}>
            <View style={[styles.progressBarFill, { width: `${progressPercent}%` }]} />
          </View>

          {/* Header */}
          <View style={styles.header}>
            <View>
              <Text style={styles.badge}>NEW DISPATCH MATCH</Text>
              <Text style={styles.orderNumber}>{offer.job.orderNumber}</Text>
            </View>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{secondsRemaining}s</Text>
            </View>
          </View>

          {/* Payout & Distance Highlight */}
          <View style={styles.highlightBanner}>
            <View>
              <Text style={styles.payoutLabel}>GUARANTEED PAYOUT</Text>
              <Text style={styles.payoutValue}>${payoutDollars}</Text>
            </View>
            <View style={styles.highlightRight}>
              <Text style={styles.distanceLabel}>TO PICKUP</Text>
              <Text style={styles.distanceValue}>{distanceKm} km</Text>
            </View>
          </View>

          {/* Locations */}
          <View style={styles.routeContainer}>
            {/* Pickup */}
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: colors.accent }]} />
              <View style={styles.locationDetails}>
                <Text style={styles.locationRole}>PICKUP ({offer.estimatedArrivalMinutes} min away)</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>
                  {offer.job.pickup.address}
                </Text>
              </View>
            </View>

            <View style={styles.routeLine} />

            {/* Dropoff */}
            <View style={styles.locationRow}>
              <View style={[styles.locationDot, { backgroundColor: colors.success }]} />
              <View style={styles.locationDetails}>
                <Text style={styles.locationRole}>DROPOFF</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>
                  {offer.job.dropoff.address}
                </Text>
              </View>
            </View>
          </View>

          {/* Actions */}
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() => onDecline(offer.offerId, offer.job.id)}
            >
              <Text style={styles.declineText}>Decline</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.acceptButton}
              onPress={() => onAccept(offer.offerId, offer.job.id)}
            >
              <Text style={styles.acceptText}>ACCEPT JOB</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -10 },
    shadowOpacity: 0.5,
    shadowRadius: 15,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: colors.surfaceBorder,
    borderRadius: 2,
    marginBottom: 16,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accent,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  badge: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
  },
  orderNumber: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 2,
  },
  timerBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  timerText: {
    color: colors.danger,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  highlightBanner: {
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderWidth: 1,
    borderColor: colors.primaryGlow,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  payoutLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  payoutValue: {
    color: colors.success,
    fontSize: 28,
    fontWeight: '900',
  },
  highlightRight: {
    alignItems: 'flex-end',
  },
  distanceLabel: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
  },
  distanceValue: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
  },
  routeContainer: {
    backgroundColor: colors.background,
    borderRadius: 16,
    padding: 14,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  locationDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginTop: 3,
    marginRight: 10,
  },
  locationDetails: {
    flex: 1,
  },
  locationRole: {
    color: colors.textSecondary,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  locationAddress: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '600',
    marginTop: 2,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: colors.surfaceBorder,
    marginLeft: 5,
    marginVertical: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  declineButton: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
  },
  declineText: {
    color: colors.textSecondary,
    fontSize: 15,
    fontWeight: '700',
  },
  acceptButton: {
    flex: 2,
    paddingVertical: 16,
    borderRadius: 14,
    alignItems: 'center',
    backgroundColor: colors.success,
    shadowColor: colors.success,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
  },
  acceptText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
});
