export const HELP_TEXT = `CUNY AI Lab × Pi workshop setup

Usage:
  npx @cuny-ai-lab/pi-workshop [options]        (macOS / Linux)
  npx.cmd @cuny-ai-lab/pi-workshop [options]    (Windows PowerShell)

Options:
  --doctor               Check this computer without changing anything
  --skip-lazypi          Do not run LazyPi (Pi must already be installed)
  --skip-auth            Install the provider but do not ask for an API key
  --replace-key          Ask for a new key even if one is already configured
  --no-windows-settings  Do not enable Pi's PowerShell tool on Windows
  --uninstall            Remove the CUNY AI Lab package from Pi
  --version              Print the installer version
  --help, -h             Show this help

The API key is only ever entered at the hidden prompt. It is never accepted
as a command-line argument, so it never lands in your shell history.
`;

export function parseArgs(argv) {
  const options = {
    command: "setup",
    skipLazypi: false,
    skipAuth: false,
    windowsSettings: true,
    replaceKey: false,
    errors: [],
  };
  for (const arg of argv) {
    switch (arg) {
      case "--help":
      case "-h":
        options.command = "help";
        break;
      case "--version":
      case "-v":
        options.command = "version";
        break;
      case "--doctor":
        options.command = "doctor";
        break;
      case "--uninstall":
        options.command = "uninstall";
        break;
      case "--skip-lazypi":
        options.skipLazypi = true;
        break;
      case "--skip-auth":
        options.skipAuth = true;
        break;
      case "--no-windows-settings":
        options.windowsSettings = false;
        break;
      case "--replace-key":
        options.replaceKey = true;
        break;
      default:
        if (arg.startsWith("-")) {
          options.errors.push(`Unknown option: ${arg}`);
        } else {
          options.errors.push("Unexpected argument. The API key must be entered at the hidden prompt, not on the command line.");
        }
    }
  }
  return options;
}
