// swift-tools-version:5.9
// UNVERIFIED SCAFFOLDING — not built on this Windows box. `tauri ios init` on the Mac
// generates the sibling `.tauri/tauri-api` Swift package this depends on; confirm the
// relative path below matches what the tooling produces for this repo before building.
// See README.md in this directory for the full iOS bring-up steps.
import PackageDescription

let package = Package(
    name: "tauri-plugin-harbor-player",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(
            name: "tauri-plugin-harbor-player",
            type: .static,
            targets: ["tauri-plugin-harbor-player"]
        )
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api")
    ],
    targets: [
        .target(
            name: "tauri-plugin-harbor-player",
            dependencies: [
                .byName(name: "Tauri")
            ],
            path: "Sources"
        )
    ]
)
