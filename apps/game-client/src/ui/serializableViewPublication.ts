/**
 * Produces an equality signature for already-serializable HUD views. The view
 * builders own field selection, so every visible field participates here.
 */
export function getSerializableViewSignature(view: unknown): string {
  const signature = JSON.stringify(view);

  if (signature === undefined) {
    throw new Error("HUD publication view must be serializable.");
  }

  return signature;
}

export function shouldPublishSerializableView(previousSignature: string | null, view: unknown): {
  signature: string;
  shouldPublish: boolean;
} {
  const signature = getSerializableViewSignature(view);

  return { signature, shouldPublish: signature !== previousSignature };
}
