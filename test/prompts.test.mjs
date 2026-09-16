import { test } from "node:test";
import assert from "node:assert/strict";
import { createPrompts } from "../src/prompts.mjs";

const FAKE_KEY = "cail-test-super-secret-12345";

function fakeInquirer(answers = {}) {
  const calls = [];
  return {
    calls,
    password: async (config) => { calls.push({ kind: "password", config }); return answers.password ?? ""; },
    confirm: async (config) => { calls.push({ kind: "confirm", config }); return answers.confirm ?? config.default; },
    select: async (config) => { calls.push({ kind: "select", config }); return answers.select ?? config.choices[0].value; },
  };
}

test("askApiKey uses the masked password prompt, never a visible input", async () => {
  const inquirer = fakeInquirer({ password: `  ${FAKE_KEY}  ` });
  const prompts = createPrompts(inquirer);
  const key = await prompts.askApiKey();
  assert.equal(key, FAKE_KEY, "trimmed");
  assert.equal(inquirer.calls.length, 1);
  assert.equal(inquirer.calls[0].kind, "password");
  assert.equal(inquirer.calls[0].config.mask, "*");
  assert.equal(inquirer.calls[0].config.toggleMask, false, "no reveal shortcut during a workshop");
  assert.match(inquirer.calls[0].config.message, /CUNY AI Lab API key/);
  assert.ok(!JSON.stringify(inquirer.calls).includes(FAKE_KEY));
});

test("askApiKey returns undefined when the participant presses Enter to skip", async () => {
  const prompts = createPrompts(fakeInquirer({ password: "   " }));
  assert.equal(await prompts.askApiKey(), undefined);
});

test("confirmUseExistingKey defaults to yes", async () => {
  const inquirer = fakeInquirer();
  const prompts = createPrompts(inquirer);
  assert.equal(await prompts.confirmUseExistingKey(), true);
  assert.equal(inquirer.calls[0].config.default, true);
});

test("askNetworkFailureAction offers retry and skip with retry first", async () => {
  const inquirer = fakeInquirer();
  const prompts = createPrompts(inquirer);
  assert.equal(await prompts.askNetworkFailureAction(), "retry");
  assert.deepEqual(inquirer.calls[0].config.choices.map((c) => c.value), ["retry", "skip"]);
});

test("confirmRemoveKey defaults to no", async () => {
  const inquirer = fakeInquirer();
  const prompts = createPrompts(inquirer);
  assert.equal(await prompts.confirmRemoveKey(), false);
  assert.equal(inquirer.calls[0].config.default, false);
});
