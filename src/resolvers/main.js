import Resolver from '@forge/resolver';
import api, { route } from "@forge/api";
import { Queue } from "@forge/events";
import { getAllLabels, mergeAndSaveLabels } from './storage';

const resolver = new Resolver();
const customFieldId = "customfield_10107";
const queueLoadContexts = new Queue({ key: 'load-contexts' });
const queueLoadContextOptions = new Queue({ key: 'load-context-options' });

// Scheduled trigger handler
export const trigger = async ({ context }) => {
  console.debug(`Scheduled trigger executed at ${new Date().toISOString()} with context: ${JSON.stringify(context)}`);
  await queueLoadContexts.push({});
};

resolver.define('load-contexts', async () => {
  console.debug(`Loading contexts for customFieldId: ${customFieldId}`);
  let startAt = 0, isLast = false, pageSize = 50;
  while (!isLast) {
    const response = await api.asApp().requestJira(
      route`/rest/api/3/field/${customFieldId}/context?startAt=${startAt}&maxResults=${pageSize}`
    );
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jira API error (contexts): ${response.status} - ${errorBody}`);
      throw new Error(`Jira API error (contexts): ${response.status}`);
    }
    let data;
    try {
      data = await response.json();
    } catch (err) {
      console.error('Failed to parse JSON from Jira API response:', err);
      throw new Error('Failed to parse JSON from Jira API response');
    }
    if (!data || !Array.isArray(data.values)) {
      console.error('Jira API response missing or invalid "values" array:', data);
      throw new Error('Jira API response missing or invalid "values" array');
    }
    for (const context of data.values) {
      try {
        const payload = { contextId: context.id };
        await queueLoadContextOptions.push(payload);
      } catch (err) {
        console.error(`Failed to enqueue context ${context.id}:`, err);
      }
    }
    isLast = data.isLast;
    startAt += data.maxResults;
  }
});

resolver.define('load-context-options', async ({ payload }) => {
  console.debug(`load-context-options | Payload received: ${JSON.stringify(payload)}`);
  console.debug(`Loading context options for customFieldId: ${customFieldId} and contextId: ${payload?.contextId}`);
  
  const { contextId } = payload || {};

  if (!contextId) {
    console.error('Missing contextId in payload:', payload);
    throw new Error('Missing contextId in payload');
  }

  let contextProjectMappings;
  try {
    contextProjectMappings = await fetchContextProjectMappings();
  } catch (err) {
    console.error('Failed to fetch context project mappings:', err);
    throw new Error('Failed to fetch context project mappings');
  }

  const contextIdToProjectId = {};
  contextProjectMappings.forEach(mapping => {
    contextIdToProjectId[mapping.contextId] = mapping.projectId;
  });

  let projectDetails = {};
  try {
    const uniqueProjectIds = [...new Set(contextProjectMappings.map(m => m.projectId))];
    projectDetails = await fetchProjectDetails(uniqueProjectIds);
  } catch (err) {
    console.error('Failed to fetch project details:', err);
    throw new Error('Failed to fetch project details');
  }

  let options = [];
  try {
    options = await fetchEnabledOptionsForContext(contextId);
  } catch (err) {
    console.error(`Failed to fetch options for contextId ${contextId}:`, err);
    throw new Error(`Failed to fetch options for contextId ${contextId}`);
  }

  const projectId = contextIdToProjectId[contextId] || '';
  const projectInfo = projectDetails[projectId] || { key: '', name: '' };
  const contextLabels = options.map(opt => ({
    label: `${opt.value} | ${projectInfo.key} | ${projectInfo.name}`
  }));

  // Save/append to storage using helper
  try {
    await mergeAndSaveLabels(contextLabels);
  } catch (err) {
    console.error('Failed to save labels to storage:', err);
    throw new Error('Failed to save labels to storage');
  }
});

// Helper to fetch all enabled options for a context (with pagination)
async function fetchEnabledOptionsForContext(contextId) {
  let options = [];
  let startAt = 0;
  let isLast = false;
  const pageSize = 100;

  try {
    console.log(`Fetching options for context ${contextId} with pagination`);
    while (!isLast) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/field/${customFieldId}/context/${contextId}/option?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Jira API error (options): ${response.status} - ${errorBody}`);
        throw new Error(`Jira API error (options): ${response.status}`);
      }
      const data = await response.json();
      console.log(`Options page fetched for context ${contextId}: ${JSON.stringify(data)}`);
      options = options.concat(
        data.values.filter(opt => !opt.disabled).map(opt => ({ id: opt.id, value: opt.value }))
      );
      isLast = data.isLast;
      startAt += data.maxResults;
      console.log(`Fetched ${JSON.stringify(options)} options so far for context ${contextId}.`);
    }
    return options;
  } catch (error) {
    console.error(`Error fetching options for context ${contextId}:`, error);
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
    console.log('Fetching context-project mappings with pagination');
    while (!isLast) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/field/${customFieldId}/context/projectmapping?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Jira API error (projectmapping): ${response.status} - ${errorBody}`);
        throw new Error(`Jira API error (projectmapping): ${response.status}`);
      }
      const data = await response.json();
      console.log(`Project mappings page fetched: ${JSON.stringify(data)}`);
      mappings = mappings.concat(data.values);
      isLast = data.isLast;
      startAt += data.maxResults;
      console.log(`Fetched ${JSON.stringify(mappings)} mappings so far.`);
    }
    return mappings;
  } catch (error) {
    console.error('Error fetching context-project mappings:', error);
    throw error;
  }
}

// Helper to fetch project details (key and name) for a list of projectIds
async function fetchProjectDetails(projectIds) {
  const projectDetails = {};
  if (!projectIds.length) return projectDetails;

  try {
    // Fetch all projects (Jira API does not support batch get by ids, so fetch all and filter)
    console.log('Fetching all projects to map projectId to key and name');
    const response = await api.asApp().requestJira(route`/rest/api/3/project/search`);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jira API error (project search): ${response.status} - ${errorBody}`);
      throw new Error(`Jira API error (project search): ${response.status}`);
    }
    const data = await response.json();
    // Map projectId to { key, name }
    data.values.forEach(project => {
      if (projectIds.includes(project.id)) {
        projectDetails[project.id] = { key: project.key, name: project.name };
      }
    });
    return projectDetails;
  } catch (error) {
    console.error('Error fetching project details:', error);
    throw error;
  }
}

// Resolver for frontend to get options from storage
resolver.define('get-contexts', async () => {
  console.debug(`Fetching contexts from storage`);
  const labels = await getAllLabels();
  console.debug(`Fetched contexts: ${JSON.stringify(labels)}`);
  return labels;
});

//TODO: Remove this resolvers. Just for testing purposes.
resolver.define('getFruits', async () => {
  // Example: return dynamic options from backend
  return [
    { label: 'Apple', value: 'apple' },
    { label: 'Banana', value: 'banana' },
    { label: 'Cherry', value: 'cherry' }
  ];
});

//TODO: Remove this resolvers. Just for testing purposes.
resolver.define('getProjects', async (req) => {
  try {
    console.log('Fetching projects from Jira API');
    const response = await api.asApp().requestJira(route`/rest/api/3/project`);
    if (!response.ok) {
      const errorBody = await response.text();
      console.error(`Jira API error: ${response.status} - ${errorBody}`);
      return { error: `Jira API error: ${response.status}` };
    }
    const data = await response.json();
    console.log(`Projects fetched: ${JSON.stringify(data)}`);
    return data.map(project => ({
      label: project.name,
      value: project.id
    }));
  } catch (error) {
    console.error('Error fetching projects:', error);
    return { error: 'Failed to fetch projects from Jira API.' };
  }
});

export const handler = resolver.getDefinitions();