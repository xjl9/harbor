// Window events the phone chrome fires at pieces it does not render itself.
// Kept beside the shell rather than in lib/player/mobile-events.ts so the player
// view can import them without pulling the shell's React tree.

// Opens the X-Ray rail. The phone moves the X-Ray entry off the picture into the
// More sheet, and XrayOverlay keeps its open state private, so the overlay layer
// listens for this and presses its own (hidden) button.
export const MOBILE_OPEN_XRAY_EVENT = "harbor:mobile-open-xray";
