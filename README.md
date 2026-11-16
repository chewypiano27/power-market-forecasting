# VIC1 Power Trader Workstation

A desktop workstation for Victorian electricity prices, regional spot prices,
weather risk, peak demand forecasts and Buy/Sell decisions.

## Install the ready-to-run macOS app

Use the **`VIC1-1.0.0-macos-arm64.zip` (Apple silicon)** or
**`VIC1-1.0.0-macos-x64.zip` (Intel)** supplied with the project submission.
Each contains the app and its runtime: no Bun, Git, Python, API key or compilation
is needed. A public binary download has not been published on GitHub.

1. Download the ZIP to your Mac and double-click it to extract it.
2. Open the extracted folder and double-click **VIC1 Power Trader Workstation.app**. You can launch it from this folder; moving it elsewhere is optional.
3. Keep an internet connection available for current AEMO and weather data.

Choose the ZIP matching **Apple menu → About This Mac**: a **Chip** such as M1/M2/M3/M4 means `macos-arm64`; an **Intel processor** means `macos-x64`. The native build workflow produces separate packages, not one universal app.

Both Mac packages have passed native CI installation of build dependencies,
typechecking and packaging. The extracted Intel app has also started with a
fresh local profile on macOS 14.8.3. Apple silicon, Windows and Linux still
require interactive installation and use checks; a successful package build
does not establish that these checks passed. Other macOS versions have not
been verified interactively.

### If macOS blocks the first launch

The assessment build is **not Developer ID signed or notarised**. If you trust
the submission, first try opening the app, then go to **System Settings → Privacy
& Security → Open Anyway**, confirm the app name and open it. See
[Apple's instructions](https://support.apple.com/en-au/102445). A managed
university computer may prevent this override; ask the administrator or use
an authorised personal Mac. Do not disable Gatekeeper globally.

### Start using it

The app opens the workstation. Use **Command+K** to find and open a view or
change settings. The main views are Market Desk, Regional Spot, Weather Outlook,
Peak Demand and Buy/Sell. Live feeds need internet access; an unavailable feed
should be allowed to retry. The bundled model and historical evaluation data do
not need a separate download. To quit, use **Command+Q**.

## Compile from source

These instructions are an alternative to the supplied app package.

### Requirements

- macOS; Intel x64 is the verified build target.
- [Bun 1.4.4](https://bun.sh). Install it using Bun's instructions, reopen Terminal,
  and check `bun --version`.
- Internet access for dependencies, Electrobun's native runtime and live data.
- Git only if downloading by clone.

### Download and build

In Terminal, run:

```sh
git clone https://github.com/chewypiano27/power-market-forecasting.git
cd power-market-forecasting
bun install --frozen-lockfile
bun run typecheck
bun run desktop:build
```

Alternatively, [download the source ZIP](https://github.com/chewypiano27/power-market-forecasting/archive/refs/heads/main.zip),
extract it, then open Terminal, type `cd ` (including the space), drag the
extracted folder into Terminal, and press Return. Run the three `bun` commands
above from that folder.

On the verified Intel Mac, launch the result with:

```sh
open "build/dev-macos-x64/VIC1 Power Trader Workstation-dev.app"
```

On another architecture, use the `.app` in the matching `build/dev-macos-<arch>/`
folder. To build and open the development app in one command:

```sh
bun run desktop:dev
```

No account, API key, Python environment, local data cache or signing certificate
is needed to build and run the workstation. Python is only needed for the
separate model reproduction scripts, not for the installed app. To reproduce
the model fit on macOS or Linux, install Python 3.11 or newer and run:

```sh
python3 -m venv .venv-model
.venv-model/bin/pip install -r requirements-model.txt
bun run scripts/rebuild-demand-training-data.ts --output /tmp/audited-demand-dataset.json
.venv-model/bin/python scripts/reproduce-demand-peak.py --dataset /tmp/audited-demand-dataset.json
```

On Windows use `.venv-model\Scripts\python.exe -m pip install -r requirements-model.txt`
and `.venv-model\Scripts\python.exe` for the replay command, and replace `/tmp/`
with an existing local temporary folder. See [model reproduction](docs/demand-model-reproduction.md)
for the source archive requirements and audit checks. These commands download
data and check the fit; installing the desktop app does not perform this audit.

## Create a macOS package

On the target Mac, after installing dependencies:

```sh
bun run package:macos
```

This builds the stable app and creates a ZIP plus SHA-256 file in
`artifacts/macos-<arch>/`. On an Intel Mac the ZIP is
`artifacts/macos-x64/VIC1-1.0.0-macos-x64.zip`. Share that ZIP and its checksum;
recipients can follow the installation steps above. This command does not sign,
notarise, upload or publish the app. Build on each target architecture and verify
it before claiming support.

To check an Intel package's checksum, open Terminal in its download folder:

```sh
shasum -a 256 -c VIC1-1.0.0-macos-x64.zip.sha256
```

## Troubleshooting

- **`bun: command not found`:** install Bun and reopen Terminal.
- **Dependencies or native runtime will not download:** check your internet
  connection and whether the university network blocks GitHub downloads, then
  repeat the failed command.
- **Wrong processor or unsupported macOS:** use a verified target Mac. An Intel
  package is not a Windows `.exe` or a native Apple silicon build.
- **Live values are unavailable:** check your connection and retry. A successful
  installation does not guarantee availability of the external feeds.

For current verification evidence, distinguish a clean local source build from
an installation on another person's machine. The latter still needs a recipient
check, including any macOS security prompt.

## Build packages for other computers

The **Desktop packages** GitHub Actions workflow builds on native Apple silicon,
Intel Mac, Windows x64 and Linux x64 runners. It can be run manually from the
repository's **Actions** tab once the workflow is available on the default branch.
The packaging branch also runs it when pushed.

Open a successful run and download the artifact for the recipient's computer:

| Computer | Actions artifact | File to use after extracting the Actions download |
| --- | --- | --- |
| Apple silicon Mac | `VIC1-macos-arm64` | `macos-arm64/VIC1-1.0.0-macos-arm64.zip` |
| Intel Mac | `VIC1-macos-x64` | `macos-x64/VIC1-1.0.0-macos-x64.zip` |
| Windows x64 | `VIC1-windows-x64` | The `*-Setup.zip` archive |
| Linux x64 | `VIC1-linux-x64` | The installer `.tar.gz` archive |

The Mac ZIPs contain the `.app`: follow the installation instructions above.
For Windows, use **Extract All** on the `*-Setup.zip` archive, then open
`VIC1 Power Trader Workstation-Setup.exe` in the extracted folder. Keep the
`.installer` folder beside the executable: it contains the app payload. Share
the complete ZIP, not the small `.exe` by itself. The installer is unsigned
and Windows may warn about the publisher. On Linux, extract the installer
archive and use its included installer. These two workflows still need
interactive installation checks on the recipient's operating system; a passing
build alone does not establish full platform support. Do not substitute a
`.tar.zst` update archive for the installer. Artifacts expire after 30 days, so
download the required packages into the final submission. No public release
is created automatically.
