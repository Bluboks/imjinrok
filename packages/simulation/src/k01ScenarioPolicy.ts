import {
  K01_SOURCE_RUNTIME_PROFILE_ID,
  K01_SOURCE_RUNTIME_STATE_VERSION,
  validateK01SourceRuntimeState,
  validateSourceRuntimeProfileEnvelope,
} from "./k01SourceRuntimeProfile.js";
import type { WorldState } from "./types.js";

const K01_BUILD_BEACON_OBJECTIVE_ID = "build-beacon";

/**
 * Projects the source K0120 trigger into the pending K01 objective contract.
 * The source policy remains the authority for the raw trigger flag; this
 * adapter only reads it and never changes source or scenario state.
 */
export function resolveK01SourceObjectiveCompletion(
  state: WorldState,
  objectiveId: string,
): boolean | undefined {
  const envelope = state.sourceRuntimeProfile;
  if (objectiveId !== K01_BUILD_BEACON_OBJECTIVE_ID || envelope?.profileId !== K01_SOURCE_RUNTIME_PROFILE_ID) {
    return undefined;
  }

  if (envelope.stateVersion !== K01_SOURCE_RUNTIME_STATE_VERSION) {
    throw new RangeError(
      `K01 source runtime objective projection requires state version ${K01_SOURCE_RUNTIME_STATE_VERSION}; received ${String(envelope.stateVersion)}.`,
    );
  }

  validateSourceRuntimeProfileEnvelope(envelope);
  validateK01SourceRuntimeState(envelope.state);
  return envelope.state.policies.beacon.triggerFlag === 1;
}
