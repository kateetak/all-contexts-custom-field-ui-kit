import { storage } from "@forge/api";

const STORAGE_KEY = "all-context-options";

export async function getAllLabels() {
  const labels = await storage.get(STORAGE_KEY);
  return Array.isArray(labels) ? labels : [];
}

export async function saveLabels(newLabels) {
  console.debug(`Saving labels: ${JSON.stringify(newLabels, null, 2)}`);
  await storage.set(STORAGE_KEY, newLabels);
}