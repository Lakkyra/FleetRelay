import {
  Coordinates,
  DispatchOffer,
  DispatchResult,
  JobOrder,
  MatchedDriverCandidate,
} from '@fleetrelay/contracts';
import { query, queryNearbyDrivers } from '../db';
import { acquireLock, releaseLock } from '../redis';
import { config } from '../config';
import { scoreCandidate } from './matcher';
import { recordSpatialQueryLatency } from '../telemetry/ingestion';
import { sendToDriver, broadcastToDispatcher } from '../websocket/gateway';

// In-memory active offer registry with expiration handles
interface ActiveOfferEntry {
  offer: DispatchOffer;
  timeoutHandle: NodeJS.Timeout;
  candidates: MatchedDriverCandidate[];
  candidateIndex: number;
}

const activeOffers = new Map<string, ActiveOfferEntry>();

export class DispatchEngine {
  /**
   * Finds and ranks candidate drivers within search radius using PostGIS ST_DWithin
   */
  public async findCandidates(
    pickupCoords: Coordinates,
    radiusMeters: number = config.dispatch.defaultRadiusMeters,
    excludeDriverIds: string[] = []
  ): Promise<{ candidates: MatchedDriverCandidate[]; queryDurationMs: number }> {
    const result = await queryNearbyDrivers(
      pickupCoords.latitude,
      pickupCoords.longitude,
      radiusMeters,
      20,
      true // idle only
    );

    recordSpatialQueryLatency(result.durationMs);

    const filteredRows = result.rows.filter(
      (row) => !excludeDriverIds.includes(row.id)
    );

    const candidates = filteredRows.map((row) => {
      const driver = {
        id: row.id,
        name: row.name,
        phone: row.phone,
        vehicleType: row.vehicleType,
        licensePlate: row.licensePlate,
        rating: parseFloat(row.rating),
        status: row.status,
        heading: parseFloat(row.heading || '0'),
        batteryLevel: parseFloat(row.batteryLevel || '100'),
        currentLocation: {
          latitude: parseFloat(row.latitude),
          longitude: parseFloat(row.longitude),
        },
        createdAt: '',
        updatedAt: '',
      };

      return scoreCandidate(driver, parseFloat(row.distance_meters), pickupCoords, radiusMeters);
    });

    // Sort descending by match score
    candidates.sort((a, b) => b.score - a.score);

    return { candidates, queryDurationMs: result.durationMs };
  }

  /**
   * Dispatches a job order to the best matching nearby driver with automated retry cascading.
   */
  public async dispatchJob(jobId: string): Promise<DispatchResult> {
    const lockAcquired = await acquireLock(`dispatch:${jobId}`, 35000);
    if (!lockAcquired) {
      return {
        jobId,
        success: false,
        status: 'locked',
        candidatesCount: 0,
        queryDurationMs: 0,
      };
    }

    try {
      // 1. Fetch Job from DB
      const jobResult = await query<any>(
        `
        SELECT
          id, order_number AS "orderNumber", title, description, status,
          ST_Y(pickup_location) AS "pickupLat", ST_X(pickup_location) AS "pickupLng", pickup_address AS "pickupAddress",
          ST_Y(dropoff_location) AS "dropoffLat", ST_X(dropoff_location) AS "dropoffLng", dropoff_address AS "dropoffAddress",
          payout_amount_cents AS "payoutAmountCents", estimated_distance_km AS "estimatedDistanceKm",
          estimated_duration_minutes AS "estimatedDurationMinutes", required_vehicle_type AS "requiredVehicleType",
          created_at AS "createdAt", updated_at AS "updatedAt"
        FROM jobs
        WHERE id = $1;
        `,
        [jobId]
      );

      if (jobResult.rows.length === 0) {
        throw new Error(`Job not found: ${jobId}`);
      }

      const raw = jobResult.rows[0];
      const job: JobOrder = {
        id: raw.id,
        orderNumber: raw.orderNumber,
        title: raw.title,
        description: raw.description,
        status: raw.status,
        pickup: {
          latitude: parseFloat(raw.pickupLat),
          longitude: parseFloat(raw.pickupLng),
          address: raw.pickupAddress,
        },
        dropoff: {
          latitude: parseFloat(raw.dropoffLat),
          longitude: parseFloat(raw.dropoffLng),
          address: raw.dropoffAddress,
        },
        payoutAmountCents: raw.payoutAmountCents,
        estimatedDistanceKm: parseFloat(raw.estimatedDistanceKm || '0'),
        estimatedDurationMinutes: raw.estimatedDurationMinutes || 15,
        requiredVehicleType: raw.requiredVehicleType,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      };

      // 2. Query spatial candidates
      const { candidates, queryDurationMs } = await this.findCandidates(job.pickup);

      if (candidates.length === 0) {
        console.warn(`[Dispatch Engine] No idle drivers found within radius for job ${job.orderNumber}`);
        await releaseLock(`dispatch:${jobId}`);
        return {
          jobId,
          success: false,
          status: 'no_drivers_available',
          candidatesCount: 0,
          queryDurationMs,
        };
      }

      // 3. Initiate first offer
      await this.sendOfferToCandidate(job, candidates, 0);

      return {
        jobId,
        success: true,
        status: 'offered',
        dispatchedDriverId: candidates[0].driver.id,
        candidatesCount: candidates.length,
        queryDurationMs,
      };
    } catch (err) {
      await releaseLock(`dispatch:${jobId}`);
      throw err;
    }
  }

  /**
   * Sends offer to candidate at specific index with 30-second TTL
   */
  private async sendOfferToCandidate(
    job: JobOrder,
    candidates: MatchedDriverCandidate[],
    index: number
  ): Promise<void> {
    if (index >= candidates.length) {
      console.log(`[Dispatch Engine] All ${candidates.length} candidates declined or timed out for job ${job.orderNumber}`);
      await query(`UPDATE jobs SET status = 'pending' WHERE id = $1`, [job.id]);
      await releaseLock(`dispatch:${job.id}`);
      broadcastToDispatcher({
        event: 'console:job_event',
        payload: { jobId: job.id, status: 'no_drivers_available', message: 'All candidate drivers exhausted' },
        timestamp: new Date().toISOString(),
      });
      return;
    }

    const candidate = candidates[index];
    const offerId = `off_${Date.now()}_${index}`;
    const ttlSeconds = config.dispatch.offerTtlSeconds;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const offer: DispatchOffer = {
      offerId,
      job,
      driverId: candidate.driver.id,
      distanceToPickupMeters: candidate.distanceMeters,
      estimatedArrivalMinutes: candidate.estimatedArrivalMinutes,
      expiresAt,
      ttlSeconds,
    };

    console.log(
      `[Dispatch Engine] Offering Job ${job.orderNumber} to Driver ${candidate.driver.name} (Dist: ${candidate.distanceMeters}m, Score: ${candidate.score})`
    );

    // Update job status to 'offered'
    await query(`UPDATE jobs SET status = 'offered', updated_at = NOW() WHERE id = $1`, [job.id]);

    // Push offer to driver mobile device over WebSocket
    sendToDriver(candidate.driver.id, {
      event: 'dispatch:offer',
      payload: offer,
      timestamp: new Date().toISOString(),
    });

    // Notify web dispatcher console
    broadcastToDispatcher({
      event: 'console:job_event',
      payload: {
        jobId: job.id,
        status: 'offered',
        driverId: candidate.driver.id,
        driverName: candidate.driver.name,
        distanceMeters: candidate.distanceMeters,
        score: candidate.score,
      },
      timestamp: new Date().toISOString(),
    });

    // Schedule automatic timeout cascade
    const timeoutHandle = setTimeout(async () => {
      console.log(`[Dispatch Engine] Offer ${offerId} timed out for driver ${candidate.driver.name}. Cascading to next candidate...`);
      activeOffers.delete(job.id);
      sendToDriver(candidate.driver.id, {
        event: 'offer:revoked',
        payload: { offerId, reason: 'Offer expired' },
        timestamp: new Date().toISOString(),
      });
      await this.sendOfferToCandidate(job, candidates, index + 1);
    }, ttlSeconds * 1000);

    activeOffers.set(job.id, {
      offer,
      timeoutHandle,
      candidates,
      candidateIndex: index,
    });
  }

  /**
   * Driver accepts offer via WebSocket
   */
  public async handleOfferAccepted(jobId: string, driverId: string): Promise<boolean> {
    const entry = activeOffers.get(jobId);
    if (!entry || entry.offer.driverId !== driverId) {
      console.warn(`[Dispatch Engine] Offer accept rejected: offer not active or driver mismatch`);
      return false;
    }

    clearTimeout(entry.timeoutHandle);
    activeOffers.delete(jobId);

    // Update DB: assign driver and mark as en_route
    await query(
      `
      UPDATE jobs
      SET status = 'accepted', assigned_driver_id = $2, updated_at = NOW()
      WHERE id = $1;
      `,
      [jobId, driverId]
    );

    await query(
      `
      UPDATE drivers
      SET status = 'en_route', updated_at = NOW()
      WHERE id = $1;
      `,
      [driverId]
    );

    await releaseLock(`dispatch:${jobId}`);

    console.log(`[Dispatch Engine] Job ${jobId} successfully ACCEPTED by driver ${driverId}`);

    // Confirm to driver
    sendToDriver(driverId, {
      event: 'job:assigned',
      payload: { jobId, status: 'accepted' },
      timestamp: new Date().toISOString(),
    });

    // Broadcast to dispatcher console
    broadcastToDispatcher({
      event: 'console:job_event',
      payload: { jobId, driverId, status: 'accepted' },
      timestamp: new Date().toISOString(),
    });

    return true;
  }

  /**
   * Driver declines offer via WebSocket -> triggers immediate cascade to candidate #2
   */
  public async handleOfferDeclined(jobId: string, driverId: string): Promise<void> {
    const entry = activeOffers.get(jobId);
    if (!entry || entry.offer.driverId !== driverId) return;

    clearTimeout(entry.timeoutHandle);
    activeOffers.delete(jobId);

    console.log(`[Dispatch Engine] Driver ${driverId} explicitly DECLINED job ${jobId}. Cascading...`);

    // Cascade to next candidate immediately
    await this.sendOfferToCandidate(entry.offer.job, entry.candidates, entry.candidateIndex + 1);
  }
}

export const dispatchEngine = new DispatchEngine();
