import Resolver from '@forge/resolver';
import api, { route } from "@forge/api";

const resolver = new Resolver();
const customFieldId = "customfield_10107";

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

resolver.define('getContexts', async (req) => {
  const pageSize = 50;
  let startAt = 0;
  let allContexts = [];
  let isLast = false;

  try {
    console.log(`Fetching contexts for custom field ${customFieldId} with pagination`);
    while (!isLast) {
      const response = await api.asApp().requestJira(
        route`/rest/api/3/field/${customFieldId}/context?startAt=${startAt}&maxResults=${pageSize}`
      );
      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`Jira API error: ${response.status} - ${errorBody}`);
        return { error: `Jira API error: ${response.status}` };
      }
      const data = await response.json();
      console.log(`Contexts page fetched: ${JSON.stringify(data)}`);
      allContexts = allContexts.concat(data.values.map(context => ({
        id: context.id
      })));
      isLast = data.isLast;
      startAt += data.maxResults;
      console.log(`Fetched ${JSON.stringify(allContexts)} contexts so far.`);
    }

    // Fetch project mappings
    const contextProjectMappings = await fetchContextProjectMappings();
    const contextIdToProjectId = {};
    contextProjectMappings.forEach(mapping => {
      contextIdToProjectId[mapping.contextId] = mapping.projectId;
    });

    // Get unique projectIds
    const uniqueProjectIds = [
      ...new Set(contextProjectMappings.map(mapping => mapping.projectId))
    ];

    // Fetch project details (key and name)
    const projectDetails = await fetchProjectDetails(uniqueProjectIds);

    // Collect all labels
    let labels = [];
    for (const context of allContexts) {
      const options = await fetchEnabledOptionsForContext(context.id);
      const projectId = contextIdToProjectId[context.id] || '';
      const projectInfo = projectDetails[projectId] || { key: '', name: '' };
      const contextLabels = options.map(opt => ({
        label: `${opt.value} | ${projectInfo.key} | ${projectInfo.name}`
      }));
      labels = labels.concat(contextLabels);
    }

    console.log(`All labels fetched: ${JSON.stringify(labels, null, 2)}`);

    return labels;
  } catch (error) {
    console.error('Error fetching contexts or options:', error);
    return { error: 'Failed to fetch contexts or options from Jira API.' };
  }
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