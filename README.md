# VIC1 Power Trader Workstation

Download the source and compile the desktop app locally.

## Requirements

- [Bun 1.4.4](https://bun.sh). Check your installation with `bun --version`.
- Git if you choose to clone the repository.
- Internet access to install dependencies and download Electrobun's native runtime.

## Download

Clone the repository:

```sh
git clone https://github.com/chewypiano27/power-market-forecasting.git
cd power-market-forecasting
```

Alternatively, [download the source ZIP](https://github.com/chewypiano27/power-market-forecasting/archive/refs/heads/main.zip), extract it, and open a terminal in the extracted `power-market-forecasting-main` folder.

## Install and compile

From the project folder, run:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run desktop:build
```

No account, API key, Python environment, local data cache, or signing certificate is required. The model and history data used by the app are included in the source.

## Run

The build creates the app under `build/dev-<platform>-<arch>/`. On macOS, open the `.app` inside that folder. For the verified macOS x64 build:

```sh
open "build/dev-macos-x64/VIC1 Power Trader Workstation-dev.app"
```

To build and launch directly during development:

```sh
bun run desktop:dev
```

The local build is unsigned and does not create an installer. A clean installation and build have been verified on macOS x64. Windows and Linux builds have not been verified. Live market and weather data require internet access.
