import { Coordinates, DriverProfile, MatchedDriverCandidate } from '@fleetrelay/contracts';

/**
 * Calculates the initial bearing from point A to point B in degrees (0-360).
 */
export function calculateBearing(start: Coordinates, dest: Coordinates): number {
  const startLat = (start.latitude * Math.PI) / 180;
  const startLng = (start.longitude * Math.PI) / 180;
  const destLat = (dest.latitude * Math.PI) / 180;
  const destLng = (dest.longitude * Math.PI) / 180;

  const y = Math.sin(destLng - startLng) * Math.cos(destLat);
  const x =
    Math.cos(startLat) * Math.sin(destLat) -
    Math.sin(startLat) * Math.cos(destLat) * Math.cos(destLng - startLng);

  let brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

/**
 * Computes angular difference between driver's current heading and bearing toward pickup point.
 * Returns score 0-20 (20 = moving directly toward pickup).
 */
export function computeHeadingAlignmentScore(
  driverCoords: Coordinates,
  driverHeading: number,
  pickupCoords: Coordinates
): number {
  if (driverHeading === undefined || driverHeading === null) return 10;
  const bearingToPickup = calculateBearing(driverCoords, pickupCoords);
  const diff = Math.abs(driverHeading - bearingToPickup) % 360;
  const angle = diff > 180 ? 360 - diff : diff;

  // Linear interpolation: 0 deg diff -> 20 pts, 180 deg diff -> 0 pts
  return Number(((1 - angle / 180) * 20).toFixed(1));
}

/**
 * Ranks driver candidates using a multi-factor scoring formula:
 * Score (0-100) = Proximity (40) + Rating (20) + Battery (20) + Heading Alignment (20)
 */
export function scoreCandidate(
  driver: DriverProfile,
  distanceMeters: number,
  pickupCoords: Coordinates,
  searchRadiusMeters: number
): MatchedDriverCandidate {
  // 1. Proximity score (0-40)
  const normalizedDistance = Math.min(distanceMeters / searchRadiusMeters, 1.0);
  const proximityScore = Number(((1.0 - normalizedDistance) * 40).toFixed(1));

  // 2. Driver Rating score (0-20): based on 4.0 - 5.0 range
  const rating = Math.max(driver.rating || 5.0, 4.0);
  const ratingScore = Number((((rating - 4.0) / 1.0) * 20).toFixed(1));

  // 3. Battery Health score (0-20): penalty for low battery
  const battery = driver.batteryLevel ?? 100;
  const batteryHealthScore = Number(((battery / 100) * 20).toFixed(1));

  // 4. Heading Alignment score (0-20)
  const headingAlignmentScore = driver.currentLocation
    ? computeHeadingAlignmentScore(driver.currentLocation, driver.heading || 0, pickupCoords)
    : 10;

  const totalScore = Number(
    (proximityScore + ratingScore + batteryHealthScore + headingAlignmentScore).toFixed(1)
  );

  // Estimate arrival time assuming urban average 30 km/h (8.33 m/s)
  const estimatedArrivalMinutes = Math.max(1, Math.round(distanceMeters / (8.33 * 60)));

  return {
    driver,
    distanceMeters,
    estimatedArrivalMinutes,
    score: totalScore,
    scoreBreakdown: {
      proximityScore,
      ratingScore,
      headingAlignmentScore,
      batteryHealthScore,
    },
  };
}
