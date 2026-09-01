import {
  Passkey,
  type PasskeyCreateRequest,
  type PasskeyGetRequest,
} from "react-native-passkey";

export const passkeysSupported = Passkey.isSupported();

export async function createPasskey(options: Record<string, unknown>) {
  return Passkey.create(
    options as unknown as PasskeyCreateRequest,
  ) as unknown as Promise<Record<string, unknown>>;
}

export async function getPasskey(options: Record<string, unknown>) {
  return Passkey.get(
    options as unknown as PasskeyGetRequest,
  ) as unknown as Promise<Record<string, unknown>>;
}
