// Scroll culling for the mobile poster grids.
//
// Without this a long grid pays full layout and paint for every tile, including
// the ones several screens away, which is the scroll roughness testers report as
// "stuttery, like low FPS". The rails already had it; the full-page grids (search,
// catalog, library) did not, and those are the longest lists in the app.
//
// The intrinsic sizes are the real tile heights so skipped rows reserve the right
// box and the scrollbar does not jump as you scroll. All three grids share one
// tile shape: 3 columns, a 2:3 portrait poster, then a two-line 12px label.
// Phone: 3 columns gives a ~111pt tile, a 2:3 poster is 167pt, plus the label.
// Tablet hits the 5-column breakpoint at ~146pt wide, so the poster grows to 219pt.
export const TILE_CULL =
  "[content-visibility:auto] [contain-intrinsic-size:auto_200px] [@media(min-width:700px)_and_(min-height:600px)]:[contain-intrinsic-size:auto_252px]";
