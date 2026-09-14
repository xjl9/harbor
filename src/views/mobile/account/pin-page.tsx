import { PinEntry } from "@/components/profile-picker/pin-entry";
import { MOBILE_SAFE_X } from "../chrome-metrics";
import { useRegisterSheet } from "../mobile-sheet-lock";

// The desktop PinEntry is already a self-contained 420px column with its own
// back button and a 3x4 numpad of 48px keys; at 402pt it only needs a canvas
// under it and the safe areas. Mounted above the editor page (z-[75]) so a PIN
// step never has to unmount the form it came from.
export function PinPage(props: Parameters<typeof PinEntry>[0]) {
  useRegisterSheet(true);
  return (
    <div
      className="fixed inset-0 z-[75] flex flex-col items-center overflow-y-auto bg-canvas px-5 animate-fade-in"
      style={{
        ...MOBILE_SAFE_X,
        paddingTop: "calc(env(safe-area-inset-top, 0px) + 14px)",
        paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)",
      }}
    >
      <PinEntry {...props} />
    </div>
  );
}
