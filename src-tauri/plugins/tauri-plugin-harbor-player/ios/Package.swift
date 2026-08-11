// swift-tools-version:5.9
// The sibling `.tauri/tauri-api` package this depends on does not exist in a fresh
// checkout: the plugin's build script (tauri_plugin::Builder ios_path, macOS host only)
// copies it out of the tauri crate on the first iOS cargo build. The product/target
// name must equal the Cargo crate name exactly; swift-rs emits
// `cargo:rustc-link-lib=static=<name>` from it.
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
