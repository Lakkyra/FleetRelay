import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { TelemetryPing } from '@fleetrelay/contracts';
import { colors } from '../theme/colors';

interface TelemetryHUDProps {
  latestPing: TelemetryPing | null;
  isConnected: boolean;
  queuedCount: number;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({
  latestPing,
  isConnected,
  queuedCount,
}) => {
  const speedKmh = latestPing ? Math.round((latestPing.speed || 0) * 3.6) : 0;
  const heading = latestPing ? Math.round(latestPing.heading || 0) : 0;
  const battery = latestPing ? Math.round(latestPing.batteryLevel || 100) : 100;
  const accuracy = latestPing?.coords.accuracy ? `${Math.round(latestPing.coords.accuracy)}m` : '±5m';

  return (
    <View style={styles.container}>
      <View style={styles.topRow}>
        <View style={styles.statusIndicatorContainer}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: isConnected ? colors.success : colors.danger },
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? 'TELEMETRY STREAMING' : 'OFFLINE BUFFERING'}
          </Text>
        </View>

        {queuedCount > 0 && (
          <View style={styles.queuedBadge}>
            <Text style={styles.queuedText}>{queuedCount} queued</Text>
          </View>
        )}
      </View>

      <View style={styles.metricsGrid}>
        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{speedKmh}</Text>
          <Text style={styles.metricLabel}>KM/H</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{heading}°</Text>
          <Text style={styles.metricLabel}>BEARING</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{battery}%</Text>
          <Text style={styles.metricLabel}>BATTERY</Text>
        </View>

        <View style={styles.metricDivider} />

        <View style={styles.metricItem}>
          <Text style={styles.metricValue}>{accuracy}</Text>
          <Text style={styles.metricLabel}>GPS ACCURACY</Text>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.surfaceBorder,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 8,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusIndicatorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: colors.textSecondary,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  queuedBadge: {
    backgroundColor: colors.warningGlow,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.warning,
  },
  queuedText: {
    color: colors.warning,
    fontSize: 10,
    fontWeight: '700',
  },
  metricsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metricItem: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    color: colors.textMuted,
    fontSize: 9,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.4,
  },
  metricDivider: {
    width: 1,
    height: 24,
    backgroundColor: colors.surfaceBorder,
  },
});
