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
        // MPVKit 1.0.0 floors. The macOS entry matters even for this iOS-only
        // package: swift-rs invokes `swift build` with a nominal macosx destination
        // (the iOS triple is injected via -Xswiftc), and SwiftPM rejects the graph
        // when a dependency's macOS floor exceeds ours.
        .iOS(.v15),
        .macOS(.v12)
    ],
    products: [
        .library(
            name: "tauri-plugin-harbor-player",
            type: .static,
            targets: ["tauri-plugin-harbor-player"]
        )
    ],
    dependencies: [
        .package(name: "Tauri", path: "../.tauri/tauri-api"),
        // Version moves in lockstep with the pin in src-tauri/ios-template/project.yml
    // and the Libmpv download URL in .github/workflows/ios-build.yml.
    .package(url: "https://github.com/mpvkit/MPVKit.git", exact: "1.0.0")
    ],
    targets: [
        .target(
            name: "tauri-plugin-harbor-player",
            dependencies: [
                .byName(name: "Tauri"),
                .product(name: "MPVKit", package: "MPVKit")
            ],
            path: "Sources",
            swiftSettings: [
                // The swift-rs `swift build` leg cannot run Xcode's
                // process-xcframework step (tauri-apps/tauri#13332), so CI extracts
                // the Libmpv xcframework into .frameworks/ and the compiler is
                // pointed straight at the device slice. unsafeFlags is legal here
                // because swift-rs consumes this package as the root package; the
                // generated Xcode project links MPVKit itself and never sees this
                // manifest.
                .unsafeFlags([
                    "-F", "\(Context.packageDirectory)/.frameworks/Libmpv.xcframework/ios-arm64"
                ])
            ]
        )
    ]
)
