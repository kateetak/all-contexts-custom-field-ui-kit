import { storage } from "@forge/api";

const STORAGE_KEY = "all-context-options";

export async function getAllLabels() {
  const labels = await storage.get(STORAGE_KEY);
  return Array.isArray(labels) ? labels : [];
}

export async function saveLabels(newLabels) {
  await storage.set(STORAGE_KEY, newLabels);
}

export async function mergeAndSaveLabels(contextLabels) {
  let allLabels = await getAllLabels();
  // Remove any labels that are being replaced
  allLabels = allLabels.filter(l => !contextLabels.some(cl => cl.label === l.label));
  allLabels = allLabels.concat(contextLabels);
  await saveLabels(allLabels);
}