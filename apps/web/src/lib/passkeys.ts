import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
} from "@simplewebauthn/browser";
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";

export const passkeysSupported = browserSupportsWebAuthn();

export async function createPasskey(options: Record<string, unknown>) {
  return startRegistration({
    optionsJSON: options as unknown as PublicKeyCredentialCreationOptionsJSON,
  }) as unknown as Promise<Record<string, unknown>>;
}

export async function getPasskey(options: Record<string, unknown>) {
  return startAuthentication({
    optionsJSON: options as unknown as PublicKeyCredentialRequestOptionsJSON,
  }) as unknown as Promise<Record<string, unknown>>;
}
