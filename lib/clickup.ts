export async function callClickUpAPI(apiToken: string, endpoint: string, options?: RequestInit) {
  const baseUrl = 'https://api.clickup.com/api/v2';
  const response = await fetch(`${baseUrl}${endpoint}`, {
    headers: {
      'Authorization': apiToken,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`ClickUp API Error (${response.status}): ${errorText}`);
  }

  return response.json();
}

export async function getClickUpUser(apiToken: string) {
  return callClickUpAPI(apiToken, '/user');
}

export async function getClickUpTasksFromList(apiToken: string, listId: string) {
  return callClickUpAPI(apiToken, `/list/${listId}/task?include_closed=true&subtasks=false`);
}

export async function updateClickUpTaskStatus(apiToken: string, taskId: string, status: string, settings: any) {
  const clickupStatus = mapSystemStatusToClickUp(status, settings);
  if (!clickupStatus) return null;
  
  return callClickUpAPI(apiToken, `/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: clickupStatus }),
  });
}

export async function updateClickUpTaskTitle(apiToken: string, taskId: string, title: string) {
  return callClickUpAPI(apiToken, `/task/${taskId}`, {
    method: 'PUT',
    body: JSON.stringify({ name: title }),
  });
}

export function mapClickUpStatusToSystem(clickupStatus: string, settings: any): string {
  // Normalize status for comparison (lowercase, replace underscores with spaces)
  const normalize = (s: string) => s.toLowerCase().replace(/_/g, ' ');
  
  const normalizedClickupStatus = normalize(clickupStatus);
  
  const statusMap: Record<string, string> = {};
  if (settings.clickup_status_for_review) {
    statusMap[normalize(settings.clickup_status_for_review)] = 'for_review';
  }
  if (settings.clickup_status_approved) {
    statusMap[normalize(settings.clickup_status_approved)] = 'approved';
  }
  if (settings.clickup_status_for_revision) {
    statusMap[normalize(settings.clickup_status_for_revision)] = 'for_revision';
  }
  if (settings.clickup_status_published) {
    statusMap[normalize(settings.clickup_status_published)] = 'published';
  }
  
  console.log('mapClickUpStatusToSystem', {
    clickupStatus,
    normalizedClickupStatus,
    settingsStatuses: {
      for_review: settings.clickup_status_for_review,
      approved: settings.clickup_status_approved,
      for_revision: settings.clickup_status_for_revision,
      published: settings.clickup_status_published,
    },
    statusMap,
    result: statusMap[normalizedClickupStatus] || 'for_review'
  });
  
  return statusMap[normalizedClickupStatus] || 'for_review';
}

export function mapSystemStatusToClickUp(systemStatus: string, settings: any): string {
  const statusMap: Record<string, string> = {
    'for_review': settings.clickup_status_for_review,
    'approved': settings.clickup_status_approved,
    'for_revision': settings.clickup_status_for_revision,
    'published': settings.clickup_status_published,
  };
  return statusMap[systemStatus] || '';
}

export function extractGoogleDriveLink(task: any): string {
  // Look for Design Output Link custom field first
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Design Output Link' && field.value) {
        // Extract just the google drive link from any surrounding content
        const driveRegex = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s`]+/g;
        const matches = field.value.match(driveRegex);
        if (matches && matches.length > 0) {
          let link = matches[0].trim();
          // Also clean up preview link if needed
          link = link.replace('/preview', '/view');
          return link;
        }
      }
    }
  }
  
  // If not found, look for any google drive link in description
  if (task.description) {
    const driveRegex = /https?:\/\/(?:drive\.google\.com|docs\.google\.com)[^\s<]+/g;
    const matches = task.description.match(driveRegex);
    if (matches && matches.length > 0) {
      let link = matches[0].trim();
      link = link.replace('/preview', '/view');
      return link;
    }
  }
  
  return '';
}

export function extractClientName(task: any): string | null {
  // Look for Client custom field
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Client') {
        // It's a dropdown, so we need to get the label from type_config
        if (field.type_config?.options) {
          const selectedOption = field.type_config.options.find((opt: any) => opt.id === field.value);
          if (selectedOption) {
            return selectedOption.name;
          }
        }
        // Fallback if we can't get the label
        if (field.value) {
          return String(field.value);
        }
      }
    }
  }
  return null;
}

export function extractCaption(task: any): string {
  // Look for Caption custom field first
  if (task.custom_fields) {
    for (const field of task.custom_fields) {
      if (field.name === 'Caption' && field.value) {
        return field.value;
      }
    }
  }
  
  // Fallback to task description
  return task.description || '';
}
