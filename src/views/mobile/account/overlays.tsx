import { useProfiles } from "@/lib/profiles";
import { MobileWhosWatching } from "../mobile-whos-watching";
import { MobileCurfewGuard } from "./curfew-guard";

// Mounted from App.tsx in place of the desktop ProfilePickerModal and
// CurfewGuard whenever the phone shell is up. pickerOpen comes from the
// ProfilesProvider exactly as it does for the desktop modal (launch prompt
// when more than one profile exists, timed prompts on focus, curfew "Switch
// profile", the profile tab's own Switch profile button); this host just gives
// it the phone picker instead of the desktop one.
export function MobileAccountOverlays() {
  return (
    <>
      <MobilePickerHost />
      <MobileCurfewGuard />
    </>
  );
}

function MobilePickerHost() {
  const { pickerOpen, pickerView, closePicker, activeId, profiles } = useProfiles();
  if (!pickerOpen) return null;
  // At launch the desktop list view has no close button: a profile has to be
  // chosen before the app is usable. An edit or create view can always be
  // backed out of, and so can a picker opened while a profile is already active.
  const dismissible = pickerView.kind !== "list" || (activeId != null && profiles.length <= 1);
  return (
    <MobileWhosWatching
      key={`${pickerView.kind}:${"profileId" in pickerView ? pickerView.profileId : ""}`}
      initialView={pickerView}
      dismissible={dismissible}
      onClose={closePicker}
    />
  );
}
