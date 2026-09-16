/**
 * Interactive prompts. The API key is collected ONLY through a masked
 * password prompt (@inquirer/prompts `password`), never through readline.
 */
export function createPrompts(inquirer) {
  return {
    async askApiKey() {
      const value = await inquirer.password({
        message: "CUNY AI Lab API key:",
        mask: "*",
        toggleMask: false,
      });
      const trimmed = String(value ?? "").trim();
      return trimmed === "" ? undefined : trimmed;
    },
    confirmUseExistingKey() {
      return inquirer.confirm({ message: "Use existing key?", default: true });
    },
    confirmRemoveKey() {
      return inquirer.confirm({ message: "Remove your saved CUNY AI Lab API key from Pi?", default: false });
    },
    askNetworkFailureAction() {
      return inquirer.select({
        message: "What would you like to do?",
        choices: [
          { name: "Retry", value: "retry" },
          { name: "Skip authentication for now", value: "skip" },
        ],
      });
    },
    askRetryOrSkipAfterRejection() {
      return inquirer.select({
        message: "What would you like to do?",
        choices: [
          { name: "Enter the key again", value: "retry" },
          { name: "Skip authentication for now", value: "skip" },
        ],
      });
    },
  };
}

export async function loadInquirer() {
  const mod = await import("@inquirer/prompts");
  return { password: mod.password, confirm: mod.confirm, select: mod.select };
}
