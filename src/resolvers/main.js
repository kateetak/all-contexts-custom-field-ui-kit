import Resolver from '@forge/resolver';
import api, { route } from "@forge/api";
import { Queue } from "@forge/events";
import { getAllLabels, saveLabels } from './storage';

const resolver = new Resolver();

const customFieldId = "customfield_10107";
const queueLoadContexts = new Queue({ key: 'load-contexts' });
const queueLoadContextOptions = new Queue({ key: 'load-context-options' });

// Scheduled trigger handler
export const trigger = async (payload) => {
  console.debug(`[Trigger] Executed at ${new Date().toISOString()} with payload: ${JSON.stringify(payload, null, 2)}`);
  await queueLoadContexts.push({});
};

// Context change handler
export async function contextChangedHandler(event, context) {
  console.debug(`[ContextChangedHandler] Event: ${JSON.stringify(event, null, 2)}`);
  console.debug(`[ContextChangedHandler] Context: ${JSON.stringify(context, null, 2)}`);
  //await queueLoadContexts.push({});
  return;
};

// Main batch job: loads all contexts, builds all labels, saves once
resolver.define('load-contexts', async () => {
  console.debug(`[load-contexts] Start loading contexts for customFieldId: ${customFieldId}`);
  let startAt = 0, isLast = false, pageSize = 50;
  let allLabels = [];

  while (!isLast) {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/field/${customFieldId}/context?startAt=${startAt}&maxResults=${pageSize}`
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`[load-contexts] Jira API error (contexts): ${response.status} - ${errorBody}`);
      throw new Error(`Jira API error (contexts): ${response.status}`);
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error('[load-contexts] Failed to parse JSON from Jira API response:', err);
      throw new Error('Failed to parse JSON from Jira API response');
    }
    if (!data || !Array.isArray(data.values)) {
      console.error('[load-contexts] Jira API response missing or invalid "values" array:', data);
      throw new Error('Jira API response missing or invalid "values" array');
    }

    console.debug(`[load-contexts] Fetched ${data.values.length} contexts (startAt: ${startAt})`);

    for (const context of data.values) {
      try {
        console.debug(`[load-contexts] Processing contextId: ${context.id}`);
        const contextLabels = await getLabelsForContext(context.id);
        allLabels = allLabels.concat(contextLabels);
        console.debug(`[load-contexts] Labels for contextId ${context.id}: ${JSON.stringify(contextLabels)}`);
      } catch (err) {
        console.error(`[load-contexts] Failed to process context ${context.id}:`, err);
      }
    }
    isLast = data.isLast;
    startAt += data.maxResults;
  }

  // Save all labels at once
  try {
    console.debug(`[load-contexts] Saving all labels (${allLabels.length}) to storage`);
    await saveLabels(allLabels);
    console.debug(`[load-contexts] All labels saved successfully`);
  } catch (err) {
    console.error('[load-contexts] Failed to save all labels to storage:', err);
    throw new Error('Failed to save all labels to storage');
  }
});

// Helper to get labels for a single context
async function getLabelsForContext(contextId) {
  console.debug(`[getLabelsForContext] Fetching project mappings for contextId: ${contextId}`);
  let contextProjectMappings;
  try {
    contextProjectMappings = await fetchContextProjectMappings();
  } catch (err) {
    console.error('[getLabelsForContext] Failed to fetch context project mappings:', err);
    throw new Error('Failed to fetch context project mappings');
  }

  // Support multiple projectIds per contextId
  const contextIdToProjectIds = {};
  contextProjectMappings.forEach(mapping => {
    if (!contextIdToProjectIds[mapping.contextId]) {
      contextIdToProjectIds[mapping.contextId] = [];
    }
    contextIdToProjectIds[mapping.contextId].push(mapping.projectId);
  });

  let projectDetails = {};
  try {
    const uniqueProjectIds = [...new Set(contextProjectMappings.map(m => m.projectId))];
    console.debug(`[getLabelsForContext] Fetching project details for projectIds: ${JSON.stringify(uniqueProjectIds)}`);
    projectDetails = await fetchProjectDetails(uniqueProjectIds);
  } catch (err) {
    console.error('[getLabelsForContext] Failed to fetch project details:', err);
    throw new Error('Failed to fetch project details');
  }

  let options = [];
  try {
    console.debug(`[getLabelsForContext] Fetching enabled options for contextId: ${contextId}`);
    options = await fetchEnabledOptionsForContext(contextId);
  } catch (err) {
    console.error(`[getLabelsForContext] Failed to fetch options for contextId ${contextId}:`, err);
    throw new Error(`Failed to fetch options for contextId ${contextId}`);
  }

  const projectIds = contextIdToProjectIds[contextId] || [];
  const contextLabels = [];
  for (const projectId of projectIds) {
    const projectInfo = projectDetails[projectId] || { key: '', name: '' };
    for (const opt of options) {
      contextLabels.push(`${opt.value} | ${projectInfo.key} | ${projectInfo.name}`);
    }
  }
  console.debug(`[getLabelsForContext] Built ${contextLabels.length} labels for contextId: ${contextId}`);
  return contextLabels;
}

// Helper to fetch all enabled options for a context (with pagination)
async function fetchEnabledOptionsForContext(contextId) {
  let options = [];
  let startAt = 0;
  let isLast = false;
  const pageSize = 100;

  try {
    while (!isLast) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/field/${customFieldId}/context/${contextId}/option?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[fetchEnabledOptionsForContext] Jira API error (options): ${response.status} - ${errorBody}`);
        throw new Error(`Jira API error (options): ${response.status}`);
      }
      const data = await response.json();
      options = options.concat(
        data.values.filter(opt => !opt.disabled).map(opt => ({ id: opt.id, value: opt.value }))
      );
      isLast = data.isLast;
      startAt += data.maxResults;
      console.debug(`[fetchEnabledOptionsForContext] Fetched ${data.values.length} options (startAt: ${startAt})`);
    }
    return options;
  } catch (error) {
    console.error(`[fetchEnabledOptionsForContext] Error fetching options for contextId ${contextId}:`, error);
    throw error;
  }
}

// Helper to fetch all project mappings for contexts
async function fetchContextProjectMappings() {
  let mappings = [];
  let startAt = 0;
  let isLast = false;
  const pageSize = 50;

  try {
    while (!isLast) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/field/${customFieldId}/context/projectmapping?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[fetchContextProjectMappings] Jira API error (projectmapping): ${response.status} - ${errorBody}`);
        throw new Error(`Jira API error (projectmapping): ${response.status}`);
      }
      const data = await response.json();
      mappings = mappings.concat(data.values);
      isLast = data.isLast;
      startAt += data.maxResults;
      console.debug(`[fetchContextProjectMappings] Fetched ${data.values.length} mappings (startAt: ${startAt})`);
    }
    return mappings;
  } catch (error) {
    console.error('[fetchContextProjectMappings] Error fetching context-project mappings:', error);
    throw error;
  }
}

// Helper to fetch project details (key and name) for a list of projectIds
async function fetchProjectDetails(projectIds) {
  const projectDetails = {};
  if (!projectIds.length) return projectDetails;

  const batchSize = 50;
  for (let i = 0; i < projectIds.length; i += batchSize) {
    const batch = projectIds.slice(i, i + batchSize);
    let startAt = 0;
    let isLast = false;
    const pageSize = 50;

    while (!isLast) {
      const keysQuery = batch.map(key => `keys=${encodeURIComponent(key)}`).join('&');
      const response = await api.asApp().requestJira(
        route`/rest/api/3/project/search?${keysQuery}&startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[fetchProjectDetails] Jira API error (project search): ${response.status} - ${errorBody}`);
        throw new Error(`Jira API error (project search): ${response.status}`);
      }
      const data = await response.json();
      data.values.forEach(project => {
        projectDetails[project.id] = { key: project.key, name: project.name };
      });
      isLast = data.isLast;
      startAt += data.maxResults;
      console.debug(`[fetchProjectDetails] Fetched ${data.values.length} projects (startAt: ${startAt})`);
    }
  }
  return projectDetails;
}

// Resolver for frontend to get options from storage
resolver.define('get-contexts', async ({ payload }) => {
  const { query } = payload || {};
  const labels = await getAllLabels();
  if (query && query.trim()) {
    const filtered = labels.filter(l => l && l.toLowerCase().includes(query.trim().toLowerCase()));
    console.debug(`[get-contexts] Returning ${filtered.slice(0, 20).length} filtered labels for query "${query}"`);
    return filtered.slice(0, 20);
  }
  console.debug(`[get-contexts] Returning first 20 labels (no query)`);
  return labels.slice(0, 20);
});

export const handler = resolver.getDefinitions();